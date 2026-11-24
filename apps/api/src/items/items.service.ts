import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InstanceStatus, Item, Prisma } from '@prisma/client';
import { ItemKitsService } from '../item-kits/item-kits.service';
import { PrismaService } from '../prisma/prisma.service';
import { syncAuthorizedQty } from './sync-authorized-qty';
import type { CreateItemDto } from './dto/create-item.dto';
import type { ReplaceRepairedDto } from './dto/replace-repaired.dto';
import type { UpdateItemDto } from './dto/update-item.dto';
import type { CreateInstanceDto } from './dto/create-instance.dto';
import { ITEM_ORDER } from '../common/item-order';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly itemKits: ItemKitsService,
  ) {}

  async findAll(includeInactive = false): Promise<Item[]> {
    const items = await this.prisma.item.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: ITEM_ORDER,
    });
    return this.withRepair(items);
  }

  /**
   * What is in repair, in the shape the catalog shows. A serialized item's repair list IS its instances
   * marked IN_REPAIR, so `repairQty` and `repairSerials` are derived from them and can never disagree with
   * the מסדים dialog. A bulk item keeps the typed count and the מסדים typed beside it.
   */
  private async withRepair<T extends Item>(items: T[]): Promise<T[]> {
    const serializedIds = items.filter((i) => i.isSerialized).map((i) => i.id);
    if (serializedIds.length === 0) return items;
    const inRepair = await this.prisma.itemInstance.findMany({
      where: { itemId: { in: serializedIds }, status: 'IN_REPAIR' },
      select: { itemId: true, serial: true },
      orderBy: { serial: 'asc' },
    });
    const byItem = new Map<string, string[]>();
    for (const r of inRepair) byItem.set(r.itemId, [...(byItem.get(r.itemId) ?? []), r.serial]);
    return items.map((i) =>
      i.isSerialized
        ? { ...i, repairSerials: byItem.get(i.id) ?? [], repairQty: byItem.get(i.id)?.length ?? 0 }
        : i,
    );
  }

  /** Trimmed, no blanks, no repeats (a מסד is one physical unit), and no more than the units in repair. */
  private checkRepairSerials(serials: readonly string[], repairQty: number): string[] {
    const cleaned = serials.map((s) => s.trim()).filter((s) => s !== '');
    const seen = new Set<string>();
    for (const s of cleaned) {
      const key = s.toLowerCase();
      if (seen.has(key)) throw new BadRequestException(`המסד "${s}" מופיע יותר מפעם אחת ברשימת התיקון`);
      seen.add(key);
    }
    if (cleaned.length > repairQty) {
      throw new BadRequestException(
        `יש ${cleaned.length} מסדים בתיקון אבל רק ${repairQty} יחידות בתיקון. יש להגדיל את הכמות או להסיר מסדים`,
      );
    }
    return cleaned;
  }

  async findOne(id: string) {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: {
        instances: {
          include: {
            signatures: {
              where: { returnedAt: null },
              include: { soldier: true },
            },
          },
          orderBy: { serial: 'asc' },
        },
      },
    });
    if (!item) throw new NotFoundException('הפריט אינו קיים');
    if (item.isSerialized) {
      const inRepair = item.instances.filter((i) => i.status === 'IN_REPAIR').map((i) => i.serial);
      return { ...item, repairSerials: inRepair, repairQty: inRepair.length };
    }
    return item;
  }

  /**
   * Resolves a name or alias to an item. Used by the Excel import and by
   * lookups that accept whatever spelling the user typed.
   */
  async resolveByName(name: string): Promise<Item | null> {
    const trimmed = name.trim();
    return this.prisma.item.findFirst({
      where: { OR: [{ name: trimmed }, { aliases: { has: trimmed } }] },
    });
  }

  async create(dto: CreateItemDto): Promise<Item> {
    const clash = await this.resolveByName(dto.name);
    if (clash) throw new ConflictException(`פריט בשם "${dto.name}" כבר קיים`);

    const repairQty = dto.isSerialized ? 0 : (dto.repairQty ?? 0);
    const repairSerials = dto.isSerialized ? [] : this.checkRepairSerials(dto.repairSerials ?? [], repairQty);

    const created = await this.prisma.item.create({
      data: {
        name: dto.name.trim(),
        aliases: dto.aliases ?? [],
        category: dto.category,
        isSerialized: dto.isSerialized,
        ...(dto.inSummary !== undefined ? { inSummary: dto.inSummary } : {}),
        ifsunAllowed: dto.ifsunAllowed ?? ['WEAPON', 'OPTICS', 'DRONE'].includes(dto.category),
        authorizedQty: dto.authorizedQty,
        yamahQty: dto.yamahQty ?? 0,
        repairQty,
        repairSerials,
        unitPrice: dto.unitPrice ?? null,
      },
    });
    return (await this.withRepair([created]))[0] ?? created;
  }

  async update(id: string, dto: UpdateItemDto): Promise<Item> {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: { _count: { select: { signatures: { where: { returnedAt: null } } } } },
    });
    if (!item) throw new NotFoundException('הפריט אינו קיים');

    // Flipping serialization while items are signed out would leave existing
    // signatures inconsistent with the rule: either orphaned instances or
    // serialized rows with no instance. Require a clean slate first.
    if (dto.isSerialized !== undefined && dto.isSerialized !== item.isSerialized) {
      if (item._count.signatures > 0) {
        throw new BadRequestException(
          `לא ניתן לשנות את דרישת המסד בזמן ש-${item._count.signatures} פריטים מנופקים. ` +
            'יש לזכות אותם קודם.',
        );
      }
    }

    if (dto.isActive === false && item._count.signatures > 0) {
      throw new BadRequestException(
        `לא ניתן להשבית פריט שמנופקים ממנו ${item._count.signatures} יחידות`,
      );
    }

    // A deactivated item vanishes from the basket, so a kit that still lists it would quietly hand the
    // soldier less than the kit says. Make the admin take it out of the kits first.
    if (dto.isActive === false && item.isActive) {
      const kits = await this.itemKits.kitsContaining(id);
      if (kits.length > 0) {
        throw new BadRequestException(`לא ניתן להשבית פריט שמופיע בערכות: ${kits.join(', ')}. יש להסיר אותו מהערכות קודם.`);
      }
    }

    // מצבה for a serialized item is derived from its מסדים, never typed in —
    // a stray authorizedQty in the body (old client, direct API call) is
    // ignored rather than allowed to desync the two again.
    const willBeSerialized = dto.isSerialized ?? item.isSerialized;

    // The repair list of a serialized item is derived, so what is typed is ignored (and cleared if the item
    // becomes serialized). A bulk item's list may not outgrow its count of units in repair.
    let repair: { repairQty: number; repairSerials: string[] } | null = null;
    if (willBeSerialized) {
      if (dto.isSerialized === true && !item.isSerialized) repair = { repairQty: 0, repairSerials: [] };
    } else {
      const becomesBulk = dto.isSerialized === false && item.isSerialized;
      const repairQty = dto.repairQty ?? (becomesBulk ? 0 : item.repairQty);
      const repairSerials = this.checkRepairSerials(dto.repairSerials ?? (becomesBulk ? [] : item.repairSerials), repairQty);
      if (dto.repairQty !== undefined || dto.repairSerials !== undefined || becomesBulk) {
        repair = { repairQty, repairSerials };
      }
    }

    const updated = await this.prisma.item.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.aliases !== undefined ? { aliases: dto.aliases } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.isSerialized !== undefined ? { isSerialized: dto.isSerialized } : {}),
        ...(dto.inSummary !== undefined ? { inSummary: dto.inSummary } : {}),
        ...(dto.ifsunAllowed !== undefined ? { ifsunAllowed: dto.ifsunAllowed } : {}),
        ...(dto.authorizedQty !== undefined && !willBeSerialized
          ? { authorizedQty: dto.authorizedQty }
          : {}),
        ...(dto.yamahQty !== undefined ? { yamahQty: dto.yamahQty } : {}),
        ...(repair ?? {}),
        ...(dto.unitPrice !== undefined ? { unitPrice: dto.unitPrice } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    return (await this.withRepair([updated]))[0] ?? updated;
  }

  async addInstance(itemId: string, dto: CreateInstanceDto) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('הפריט אינו קיים');
    // Deliberately not gated on `isSerialized`: staff do record a מסד for
    // items the catalog calls bulk, and refusing it only pushed the number into
    // a notes field where nothing can search it. `isSerialized` means a serial
    // is *required*, not that it is the only item allowed to have one.

    const serial = dto.serial.trim();
    const clash = await this.prisma.itemInstance.findUnique({
      where: { itemId_serial: { itemId, serial } },
    });
    if (clash) throw new ConflictException(`מסד "${serial}" כבר קיים עבור ${item.name}`);

    return this.prisma.$transaction(async (tx) => {
      const instance = await tx.itemInstance.create({
        data: { itemId, serial, status: dto.status ?? 'OK', notes: dto.notes ?? null },
      });
      await syncAuthorizedQty(tx, itemId);
      return instance;
    });
  }

  /**
   * A unit sent for repair came back as a different one because it could not be fixed. The old מסד leaves
   * the books and the new one takes its place, so מצבה does not change. Both are recorded in an
   * append-only log. A serialized item swaps the instance itself; a bulk item drops the old מסד from its
   * repair list, takes one off the repair count, and registers the new מסד as a unit in stock.
   */
  async replaceRepaired(itemId: string, dto: ReplaceRepairedDto, actorName: string) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('הפריט אינו קיים');
    const newSerial = dto.newSerial.trim();
    const oldSerial = dto.oldSerial?.trim() || null;
    if (!newSerial) throw new BadRequestException('נדרש מסד חדש');
    if (oldSerial === newSerial) throw new BadRequestException('המסד החדש זהה לישן');
    if (await this.prisma.itemInstance.findUnique({ where: { itemId_serial: { itemId, serial: newSerial } } })) {
      throw new ConflictException(`מסד "${newSerial}" כבר קיים עבור ${item.name}`);
    }

    return this.prisma.$transaction(async (tx) => {
      if (item.isSerialized) {
        if (!oldSerial) throw new BadRequestException('נדרש המסד שיצא לתיקון');
        const old = await tx.itemInstance.findUnique({
          where: { itemId_serial: { itemId, serial: oldSerial } },
          include: { signatures: { where: { returnedAt: null } } },
        });
        if (!old) throw new NotFoundException(`מסד "${oldSerial}" אינו קיים`);
        if (old.status !== 'IN_REPAIR' || old.signatures.length > 0) {
          throw new BadRequestException('אפשר להחליף רק מסד שנמצא בתיקון');
        }
        await tx.itemInstance.delete({ where: { id: old.id } });
      } else {
        if (item.repairQty < 1) throw new BadRequestException('אין יחידות בתיקון');
        if (oldSerial && !item.repairSerials.includes(oldSerial)) {
          throw new BadRequestException(`מסד "${oldSerial}" אינו ברשימת התיקון`);
        }
        await tx.item.update({
          where: { id: itemId },
          data: {
            repairQty: item.repairQty - 1,
            repairSerials: item.repairSerials.filter((s) => s !== oldSerial),
          },
        });
      }
      await tx.itemInstance.create({
        data: {
          itemId,
          serial: newSerial,
          status: 'OK',
          notes: oldSerial ? `הוחלף במקום ${oldSerial}${dto.notes ? ` — ${dto.notes}` : ''}` : dto.notes ?? null,
        },
      });
      await syncAuthorizedQty(tx, itemId);
      return tx.itemReplacement.create({
        data: {
          itemId,
          itemNameSnapshot: item.name,
          oldSerial,
          newSerial,
          notes: dto.notes?.trim() || null,
          byName: actorName,
        },
      });
    });
  }

  replacements(itemId: string) {
    return this.prisma.itemReplacement.findMany({ where: { itemId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async setInstanceStatus(instanceId: string, status: InstanceStatus, notes?: string) {
    const instance = await this.prisma.itemInstance.findUnique({
      where: { id: instanceId },
      include: {
        item: true,
        signatures: { where: { returnedAt: null }, include: { soldier: true } },
      },
    });
    if (!instance) throw new NotFoundException('המסד אינו קיים');

    // Marking an item faulty or disabled while a soldier holds it would make
    // the armory counts disagree with who actually has it.
    if (status !== 'OK' && instance.signatures.length > 0) {
      const holder = instance.signatures[0]?.soldier;
      throw new BadRequestException(
        `המסד חתום על ${holder?.firstName ?? ''} ${holder?.lastName ?? ''}. יש לזכות אותו קודם.`,
      );
    }

    return this.prisma.itemInstance.update({
      where: { id: instanceId },
      data: { status, ...(notes !== undefined ? { notes } : {}) },
    });
  }

  /**
   * Deletes a מסד outright — this corrects a data-entry mistake (wrong
   * serial, duplicate), not a real-world event, so there is nothing here
   * worth keeping for history the way a signature or movement is. A held
   * instance can never be deleted: the return flow is the only way a
   * signature closes.
   */
  async removeInstance(instanceId: string) {
    const instance = await this.prisma.itemInstance.findUnique({
      where: { id: instanceId },
      include: { signatures: { where: { returnedAt: null }, include: { soldier: true } } },
    });
    if (!instance) throw new NotFoundException('המסד אינו קיים');

    if (instance.signatures.length > 0) {
      const holder = instance.signatures[0]?.soldier;
      throw new ConflictException(
        `לא ניתן להסיר — המסד חתום על ${holder?.firstName ?? ''} ${holder?.lastName ?? ''}. יש לבצע זיכוי לפני הסרת המסד.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.itemInstance.delete({ where: { id: instanceId } });
      await syncAuthorizedQty(tx, instance.itemId);
      return { removed: true };
    });
  }

  /**
   * Serials of this item that nobody currently holds — the pick list for
   * ניפוק. When `soldierId` is given, this soldier's own previously-held
   * serial for this exact item (if he ever had one and it's still free) is
   * flagged `isPreviouslyHeld` and sorted first — so re-issuing M-4 to a
   * soldier who already had one in a past תקופת שרות defaults back to the
   * same physical weapon rather than a random one, unless the operator
   * deliberately picks something else (the weapon was swapped, faulty, etc).
   * Derived live from his own return history — nothing persisted for this.
   */
  async availableInstances(itemId: string, soldierId?: string) {
    const instances = await this.prisma.itemInstance.findMany({
      where: {
        itemId,
        status: 'OK',
        signatures: { none: { returnedAt: null } },
      },
      orderBy: { serial: 'asc' },
    });

    if (!soldierId || instances.length === 0) {
      return instances.map((i) => ({ ...i, isPreviouslyHeld: false }));
    }

    const lastReturned = await this.prisma.signature.findFirst({
      where: { soldierId, itemId, itemInstanceId: { not: null }, returnedAt: { not: null } },
      orderBy: { returnedAt: 'desc' },
      select: { itemInstanceId: true },
    });

    return instances
      .map((i) => ({ ...i, isPreviouslyHeld: i.id === lastReturned?.itemInstanceId }))
      .sort((a, b) => Number(b.isPreviouslyHeld) - Number(a.isPreviouslyHeld));
  }

  /**
   * What stands in the way of deleting an item. The UI asks for this before
   * showing a confirmation, so the operator is told exactly what is blocking
   * rather than being handed a failure after the fact.
   */
  async deletionCheck(id: string): Promise<{
    canDelete: boolean;
    issuedCount: number;
    instanceCount: number;
    historyCount: number;
    /** Base items whose kit lists this item as a line. */
    inKits: string[];
    reasons: string[];
  }> {
    const item = await this.prisma.item.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('הפריט אינו קיים');

    const [issuedCount, instanceCount, historyCount, inKits] = await Promise.all([
      this.prisma.signature.count({ where: { itemId: id, returnedAt: null } }),
      this.prisma.itemInstance.count({ where: { itemId: id } }),
      this.prisma.movement.count({ where: { itemId: id } }),
      this.itemKits.kitsContaining(id),
    ]);

    const reasons: string[] = [];
    if (issuedCount > 0) reasons.push(`${issuedCount} יחידות מנופקות לחיילים`);
    if (instanceCount > 0) reasons.push(`${instanceCount} מסדים רשומים`);
    if (historyCount > 0) reasons.push(`${historyCount} תנועות בדוח התנועות`);
    if (inKits.length > 0) reasons.push(`מופיע בערכות: ${inKits.join(', ')}`);

    return {
      // History alone does not block: the item can be deactivated instead, and
      // the movement rows keep their own name snapshot.
      canDelete: issuedCount === 0 && instanceCount === 0 && historyCount === 0 && inKits.length === 0,
      issuedCount,
      instanceCount,
      historyCount,
      inKits,
      reasons,
    };
  }

  /**
   * Removes an item outright. Only possible when nothing references it; an item
   * with history is deactivated instead, so the audit trail stays readable.
   */
  async remove(id: string, actorName: string): Promise<{ deleted: true }> {
    const check = await this.deletionCheck(id);
    if (!check.canDelete) {
      throw new BadRequestException(
        `לא ניתן למחוק את הפריט: ${check.reasons.join(', ')}. ניתן להשבית אותו במקום.`,
      );
    }
    // The item's own kit (if it is a base) goes with it; log that first so the history keeps the answer.
    await this.prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id } });
      if (item) await this.itemKits.recordRemovalWithItem(tx, item, actorName);
      await tx.item.delete({ where: { id } });
    });
    return { deleted: true };
  }
}
