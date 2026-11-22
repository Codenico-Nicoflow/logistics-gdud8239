import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Item, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { SaveKitDto } from './dto/save-kit.dto';
import { expandKit, findGraphProblem, type KitMap } from './kit-graph';

type Snapshot = { itemName: string; quantity: number }[];
type Tx = Prisma.TransactionClient;

@Injectable()
export class ItemKitsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const kits = await this.prisma.itemKit.findMany({
      include: { baseItem: { select: { id: true, name: true, category: true } }, _count: { select: { lines: true } } },
      orderBy: { baseItem: { name: 'asc' } },
    });
    return kits.map((k) => ({ baseItem: k.baseItem, lineCount: k._count.lines, updatedAt: k.updatedAt }));
  }

  /** The kit of one base item; an item without a kit answers with no lines, never a 404. */
  async get(baseItemId: string) {
    const baseItem = await this.prisma.item.findUnique({ where: { id: baseItemId } });
    if (!baseItem) throw new NotFoundException('הפריט אינו קיים');
    const kit = await this.prisma.itemKit.findUnique({
      where: { baseItemId },
      include: { lines: { include: { item: true }, orderBy: { position: 'asc' } } },
    });
    return {
      baseItem,
      lines: (kit?.lines ?? []).map((l) => ({ item: l.item, quantity: l.quantity })),
      updatedAt: kit?.updatedAt ?? null,
    };
  }

  history(baseItemId: string) {
    return this.prisma.itemKitChange.findMany({
      where: { baseItemId },
      orderBy: { at: 'desc' },
      take: 100,
    });
  }

  /** Replaces the whole kit in one step. An empty list removes the kit. */
  async save(baseItemId: string, dto: SaveKitDto, actor: AuthUser) {
    const base = await this.prisma.item.findUnique({ where: { id: baseItemId } });
    if (!base) throw new NotFoundException('הפריט אינו קיים');

    const ids = dto.lines.map((l) => l.itemId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('אותו פריט מופיע בערכה יותר מפעם אחת');
    if (ids.includes(baseItemId)) throw new BadRequestException('פריט לא יכול להיות חלק מהערכה של עצמו');

    const items = await this.prisma.item.findMany({ where: { id: { in: ids } } });
    const byId = new Map(items.map((i) => [i.id, i]));
    if (items.length !== ids.length) throw new BadRequestException('אחד הפריטים בערכה אינו קיים');
    const inactive = items.filter((i) => !i.isActive).map((i) => i.name);
    if (inactive.length > 0) throw new BadRequestException(`אי אפשר להוסיף פריט מושבת לערכה: ${inactive.join(', ')}`);

    const others = await this.loadKitMap();
    const proposed = new Map(others);
    if (dto.lines.length > 0) proposed.set(baseItemId, dto.lines);
    else proposed.delete(baseItemId);
    // Not just from this base: putting a kit under an existing chain makes every kit above it deeper, or
    // closes a loop through it.
    for (const start of proposed.keys()) {
      const problem = findGraphProblem(proposed, start);
      if (problem?.kind === 'cycle') {
        const names = await this.namesFor(problem.path, byId);
        throw new BadRequestException(`הערכה יוצרת מעגל: ${names.join(' ← ')}`);
      }
      if (problem?.kind === 'tooDeep') {
        throw new BadRequestException('ערכות מקוננות עמוקות מדי (עד 3 רמות)');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const before = await this.snapshot(tx, baseItemId);
      const after: Snapshot = dto.lines.map((l) => ({
        itemName: byId.get(l.itemId)?.name ?? '',
        quantity: l.quantity,
      }));

      await tx.itemKit.deleteMany({ where: { baseItemId } });
      if (dto.lines.length > 0) {
        await tx.itemKit.create({
          data: {
            baseItemId,
            lines: {
              create: dto.lines.map((l, position) => ({
                itemId: l.itemId,
                quantity: l.quantity,
                position,
              })),
            },
          },
        });
      }
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        await this.record(tx, base, actor.displayName, before, after);
      }
    });

    return this.get(baseItemId);
  }

  /**
   * Called when an item is deleted outright: its kit goes with it (FK cascade), so the change is written
   * first, in the caller's transaction.
   */
  async recordRemovalWithItem(tx: Tx, base: Item, actorName: string): Promise<void> {
    const before = await this.snapshot(tx, base.id);
    if (before.length > 0) await this.record(tx, base, actorName, before, []);
  }

  /** Names of the kits (by base item) that list this item as a line, for the delete/deactivate guard. */
  async kitsContaining(itemId: string): Promise<string[]> {
    const lines = await this.prisma.itemKitLine.findMany({
      where: { itemId },
      include: { kit: { include: { baseItem: { select: { name: true } } } } },
    });
    return lines.map((l) => l.kit.baseItem.name).sort((a, b) => a.localeCompare(b, 'he'));
  }

  /** The basket lines that always go out with `itemName`, nested kits included. */
  async resolve(itemName: string) {
    const root = await this.prisma.item.findUnique({ where: { name: itemName } });
    if (!root) return [];

    const kits = await this.loadKitMap();
    if (!kits.has(root.id)) return [];

    const wanted = expandKit(kits, root.id);
    if (wanted.size === 0) return [];

    const items = await this.prisma.item.findMany({ where: { id: { in: [...wanted.keys()] }, isActive: true } });
    const byId = new Map(items.map((i) => [i.id, i]));
    return [...wanted.entries()]
      .map(([id, quantity]) => ({ item: byId.get(id), quantity }))
      .filter((l): l is { item: Item; quantity: number } => l.item !== undefined);
  }

  private async loadKitMap(): Promise<KitMap> {
    const kits = await this.prisma.itemKit.findMany({ include: { lines: { orderBy: { position: 'asc' } } } });
    return new Map(
      kits.map((k) => [k.baseItemId, k.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity }))]),
    );
  }

  private async namesFor(ids: string[], known: Map<string, Item>): Promise<string[]> {
    const missing = ids.filter((id) => !known.has(id));
    const rows = missing.length ? await this.prisma.item.findMany({ where: { id: { in: missing } } }) : [];
    const all = new Map([...known, ...rows.map((r): [string, Item] => [r.id, r])]);
    return ids.map((id) => all.get(id)?.name ?? '?');
  }

  private async snapshot(tx: Tx, baseItemId: string): Promise<Snapshot> {
    const kit = await tx.itemKit.findUnique({
      where: { baseItemId },
      include: { lines: { include: { item: true }, orderBy: { position: 'asc' } } },
    });
    return (kit?.lines ?? []).map((l) => ({ itemName: l.item.name, quantity: l.quantity }));
  }

  private record(tx: Tx, base: Item, actorName: string, before: Snapshot, after: Snapshot) {
    return tx.itemKitChange.create({
      data: { baseItemId: base.id, baseItemName: base.name, actorName, before, after },
    });
  }
}
