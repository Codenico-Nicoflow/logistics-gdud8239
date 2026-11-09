import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateKitDto, UpdateKitDto, KitLineDto } from './dto/kit.dto';

/**
 * Kits — a standard handover, named.
 *
 * `ערכת M-4` is the rifle plus the magazines, sling and cleaning kit that
 * always go with it. Picking one on the 1008 fills the lines with their usual
 * quantities, which the operator then edits. The kit is a starting point, not
 * a constraint, so nothing here is enforced at issue time.
 */
@Injectable()
export class KitsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(includeInactive = false) {
    return this.prisma.kit.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        lines: {
          orderBy: { sortOrder: 'asc' },
          include: {
            item: {
              select: {
                id: true,
                name: true,
                category: true,
                isSerialized: true,
                unitOfMeasure: true,
              },
            },
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const kit = await this.prisma.kit.findUnique({
      where: { id },
      include: { lines: { orderBy: { sortOrder: 'asc' }, include: { item: true } } },
    });
    if (!kit) throw new NotFoundException('הערכה אינה קיימת');
    return kit;
  }

  /** Rejects duplicates up front: two rows for one item is two answers to
   *  "how many", with no way to say which is meant. */
  private assertDistinct(lines: KitLineDto[]): void {
    const ids = lines.map((l) => l.itemId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('פריט מופיע יותר מפעם אחת בערכה');
    }
  }

  async create(dto: CreateKitDto) {
    this.assertDistinct(dto.lines);
    const clash = await this.prisma.kit.findUnique({ where: { name: dto.name.trim() } });
    if (clash) throw new ConflictException(`ערכה בשם "${dto.name.trim()}" כבר קיימת`);

    const found = await this.prisma.item.count({
      where: { id: { in: dto.lines.map((l) => l.itemId) } },
    });
    if (found !== dto.lines.length) throw new NotFoundException('אחד הפריטים אינו קיים');

    return this.prisma.kit.create({
      data: {
        name: dto.name.trim(),
        notes: dto.notes ?? null,
        lines: {
          create: dto.lines.map((l, i) => ({
            itemId: l.itemId,
            quantity: l.quantity,
            sortOrder: i,
          })),
        },
      },
      include: { lines: { orderBy: { sortOrder: 'asc' }, include: { item: true } } },
    });
  }

  async update(id: string, dto: UpdateKitDto) {
    await this.findOne(id);
    if (dto.lines) this.assertDistinct(dto.lines);

    return this.prisma.$transaction(async (tx) => {
      if (dto.lines) {
        // Replaced wholesale rather than merged: the operator edited a list,
        // and a partial merge would silently keep a line they removed.
        await tx.kitLine.deleteMany({ where: { kitId: id } });
        await tx.kitLine.createMany({
          data: dto.lines.map((l, i) => ({
            kitId: id,
            itemId: l.itemId,
            quantity: l.quantity,
            sortOrder: i,
          })),
        });
      }

      return tx.kit.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
        include: { lines: { orderBy: { sortOrder: 'asc' }, include: { item: true } } },
      });
    });
  }

  /** A kit is a template, so deleting one destroys no history. */
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.kit.delete({ where: { id } });
    return { deleted: true as const };
  }
}
