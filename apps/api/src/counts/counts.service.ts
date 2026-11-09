import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CountShift } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import type { SaveCountDto } from './dto/save-count.dto';

export type CountSheetRow = {
  itemId: string;
  itemName: string;
  category: string;
  authorizedQty: number;
  issued: number;
  countedQty: number | null;
  faultyQty: number;
  /** מצבה − (מנופק + נספר). Non-zero means the shelf does not match the books. */
  gap: number | null;
  notes: string | null;
};

@Injectable()
export class CountsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The count sheet for a date and shift: every active item, with the number
   * issued (computed) alongside the number counted on the shelf (entered by
   * hand). Pre-filled from an existing session so a count can be corrected.
   *
   * The item list is exactly מסכם's, so whatever an admin removes from the
   * summary disappears from the evening count too — one list, maintained once.
   */
  async sheet(sessionDate: string, shift: CountShift): Promise<{
    session: { id: string; isClosed: boolean } | null;
    rows: CountSheetRow[];
    signers: Record<string, string | null>;
  }> {
    const date = new Date(sessionDate);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('תאריך לא תקין');

    const [items, issuedRows, session] = await Promise.all([
      this.prisma.item.findMany({
        where: { isActive: true, inSummary: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.signature.groupBy({
        by: ['itemId'],
        where: { returnedAt: null },
        _sum: { quantity: true },
      }),
      this.prisma.countSession.findUnique({
        where: { sessionDate_shift: { sessionDate: date, shift } },
        include: { lines: true },
      }),
    ]);

    const issuedByItem = new Map(issuedRows.map((r) => [r.itemId, r._sum.quantity ?? 0]));
    const lineByItem = new Map((session?.lines ?? []).map((l) => [l.itemId, l]));

    const rows: CountSheetRow[] = items.map((item) => {
      const issued = issuedByItem.get(item.id) ?? 0;
      const line = lineByItem.get(item.id);
      const countedQty = line?.countedQty ?? null;
      return {
        itemId: item.id,
        itemName: item.name,
        category: item.category,
        authorizedQty: item.authorizedQty,
        issued,
        countedQty,
        faultyQty: line?.faultyQty ?? 0,
        gap: countedQty === null ? null : item.authorizedQty - (issued + countedQty),
        notes: line?.notes ?? null,
      };
    });

    return {
      session: session ? { id: session.id, isClosed: session.isClosed } : null,
      rows,
      signers: {
        responsibleName: session?.responsibleName ?? null,
        responsiblePn: session?.responsiblePn ?? null,
        responsibleRank: session?.responsibleRank ?? null,
        officerName: session?.officerName ?? null,
        officerPn: session?.officerPn ?? null,
        officerRank: session?.officerRank ?? null,
      },
    };
  }

  /**
   * Saves a count. Re-saving the same date and shift replaces its lines, so a
   * miscount can be corrected rather than producing a second session.
   */
  async save(dto: SaveCountDto, actor: AuthUser): Promise<{ id: string; lines: number }> {
    const date = new Date(dto.sessionDate);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('תאריך לא תקין');

    const existing = await this.prisma.countSession.findUnique({
      where: { sessionDate_shift: { sessionDate: date, shift: dto.shift } },
    });
    if (existing?.isClosed) {
      throw new BadRequestException('הספירה נסגרה ולא ניתן לשנות אותה');
    }

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.countSession.upsert({
        where: { sessionDate_shift: { sessionDate: date, shift: dto.shift } },
        update: {
          responsibleName: dto.responsibleName ?? null,
          responsiblePn: dto.responsiblePn ?? null,
          responsibleRank: dto.responsibleRank ?? null,
          officerName: dto.officerName ?? null,
          officerPn: dto.officerPn ?? null,
          officerRank: dto.officerRank ?? null,
          recordedByUserId: actor.id,
          recordedAt: new Date(),
        },
        create: {
          sessionDate: date,
          shift: dto.shift,
          responsibleName: dto.responsibleName ?? null,
          responsiblePn: dto.responsiblePn ?? null,
          responsibleRank: dto.responsibleRank ?? null,
          officerName: dto.officerName ?? null,
          officerPn: dto.officerPn ?? null,
          officerRank: dto.officerRank ?? null,
          recordedByUserId: actor.id,
        },
      });

      await tx.countLine.deleteMany({ where: { countSessionId: session.id } });
      if (dto.lines.length) {
        await tx.countLine.createMany({
          data: dto.lines.map((l) => ({
            countSessionId: session.id,
            itemId: l.itemId,
            countedQty: l.countedQty,
            faultyQty: l.faultyQty ?? 0,
            notes: l.notes ?? null,
          })),
        });
      }

      return { id: session.id, lines: dto.lines.length };
    });
  }

  /** Closing freezes a count so the evening figure cannot drift afterwards. */
  async close(id: string): Promise<{ id: string; isClosed: boolean }> {
    const session = await this.prisma.countSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('הספירה אינה קיימת');
    const updated = await this.prisma.countSession.update({
      where: { id },
      data: { isClosed: true },
    });
    return { id: updated.id, isClosed: updated.isClosed };
  }

  /** Recent sessions, for picking a date to review. */
  recent(limit = 30) {
    return this.prisma.countSession.findMany({
      orderBy: [{ sessionDate: 'desc' }, { shift: 'asc' }],
      take: limit,
      include: {
        recordedBy: { select: { displayName: true } },
        _count: { select: { lines: true } },
      },
    });
  }
}
