import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InstanceStatus, Item, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateItemDto } from './dto/create-item.dto';
import type { UpdateItemDto } from './dto/update-item.dto';
import type { CreateInstanceDto } from './dto/create-instance.dto';

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(includeInactive = false): Promise<Item[]> {
    return this.prisma.item.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
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

    return this.prisma.item.create({
      data: {
        name: dto.name.trim(),
        aliases: dto.aliases ?? [],
        category: dto.category,
        isSerialized: dto.isSerialized,
        ...(dto.inSummary !== undefined ? { inSummary: dto.inSummary } : {}),
        authorizedQty: dto.authorizedQty,
        unitPrice: dto.unitPrice ?? null,
      },
    });
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

    return this.prisma.item.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.aliases !== undefined ? { aliases: dto.aliases } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.isSerialized !== undefined ? { isSerialized: dto.isSerialized } : {}),
        ...(dto.inSummary !== undefined ? { inSummary: dto.inSummary } : {}),
        ...(dto.authorizedQty !== undefined ? { authorizedQty: dto.authorizedQty } : {}),
        ...(dto.unitPrice !== undefined ? { unitPrice: dto.unitPrice } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
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

    return this.prisma.itemInstance.create({
      data: { itemId, serial, status: dto.status ?? 'OK', notes: dto.notes ?? null },
    });
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

  /** Serials of this item that nobody currently holds — the pick list for ניפוק. */
  async availableInstances(itemId: string) {
    return this.prisma.itemInstance.findMany({
      where: {
        itemId,
        status: 'OK',
        signatures: { none: { returnedAt: null } },
      },
      orderBy: { serial: 'asc' },
    });
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
    reasons: string[];
  }> {
    const item = await this.prisma.item.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('הפריט אינו קיים');

    const [issuedCount, instanceCount, historyCount] = await Promise.all([
      this.prisma.signature.count({ where: { itemId: id, returnedAt: null } }),
      this.prisma.itemInstance.count({ where: { itemId: id } }),
      this.prisma.movement.count({ where: { itemId: id } }),
    ]);

    const reasons: string[] = [];
    if (issuedCount > 0) reasons.push(`${issuedCount} יחידות מנופקות לחיילים`);
    if (instanceCount > 0) reasons.push(`${instanceCount} מסדים רשומים`);
    if (historyCount > 0) reasons.push(`${historyCount} תנועות בדוח התנועות`);

    return {
      // History alone does not block: the item can be deactivated instead, and
      // the movement rows keep their own name snapshot.
      canDelete: issuedCount === 0 && instanceCount === 0 && historyCount === 0,
      issuedCount,
      instanceCount,
      historyCount,
      reasons,
    };
  }

  /**
   * Removes an item outright. Only possible when nothing references it; an item
   * with history is deactivated instead, so the audit trail stays readable.
   */
  async remove(id: string): Promise<{ deleted: true }> {
    const check = await this.deletionCheck(id);
    if (!check.canDelete) {
      throw new BadRequestException(
        `לא ניתן למחוק את הפריט: ${check.reasons.join(', ')}. ניתן להשבית אותו במקום.`,
      );
    }
    await this.prisma.allocation.deleteMany({ where: { itemId: id } });
    await this.prisma.item.delete({ where: { id } });
    return { deleted: true };
  }

  /** Signatures imported with a known problem — powers the "דרוש טיפול" tab. */
  async needsAttention() {
    const [issues, signatures] = await Promise.all([
      this.prisma.importIssue.findMany({
        where: { resolvedAt: null },
        orderBy: [{ kind: 'asc' }, { rowNumber: 'asc' }],
      }),
      this.prisma.signature.findMany({
        where: { needsAttention: true, returnedAt: null },
        include: { soldier: true, item: true, itemInstance: true },
        orderBy: { signedAt: 'asc' },
      }),
    ]);
    return { issues, signatures };
  }
}
