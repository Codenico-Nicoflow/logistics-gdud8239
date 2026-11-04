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
        catalogNo: dto.catalogNo ?? null,
        isSerialized: dto.isSerialized,
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
        ...(dto.catalogNo !== undefined ? { catalogNo: dto.catalogNo } : {}),
        ...(dto.isSerialized !== undefined ? { isSerialized: dto.isSerialized } : {}),
        ...(dto.authorizedQty !== undefined ? { authorizedQty: dto.authorizedQty } : {}),
        ...(dto.unitPrice !== undefined ? { unitPrice: dto.unitPrice } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async addInstance(itemId: string, dto: CreateInstanceDto) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('הפריט אינו קיים');
    if (!item.isSerialized) {
      throw new BadRequestException(`הפריט "${item.name}" אינו פריט מסד`);
    }

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
