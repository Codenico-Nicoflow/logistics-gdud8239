import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CountShift } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MesakemService } from '../mesakem/mesakem.service';
import type { AuthUser } from '../auth/auth.types';
import type { SaveCountDto } from './dto/save-count.dto';
import { ITEM_ORDER } from '../common/item-order';

export type CountSheetRow = {
  itemId: string;
  itemName: string;
  category: string;
  /** The day's בנשקייה figure from מסכם — read-only here, never typed twice. */
  nashkiyaQty: number | null;
};

/**
 * `ספירת נשקיה` — the two-party sign-off on the day's already-entered מסכם
 * figure. Deliberately shows only `nashkiyaQty`: it used to also show
 * מצבה/מנופק/פער and take its own hand-typed count, but that duplicated what
 * מסכם already collects once a day. This screen's only job now is verifying
 * and signing that existing number, not re-deriving it.
 */
@Injectable()
export class CountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mesakem: MesakemService,
  ) {}

  /**
   * The sign-off sheet for a date and shift: every active item with the
   * day's מסכם figure next to it. Pre-filled from an existing session so the
   * signer details can be corrected before closing.
   *
   * The item list is exactly מסכם's, so whatever an admin removes from the
   * summary disappears from here too — one list, maintained once.
   */
  async sheet(sessionDate: string, shift: CountShift): Promise<{
    session: {
      id: string;
      isClosed: boolean;
      /** The most recent admin cancellation of a closed count, if there was one. */
      lastReopen: { at: Date; by: string; reason: string } | null;
    } | null;
    rows: CountSheetRow[];
    signers: {
      responsibleName: string | null;
      responsiblePn: string | null;
      responsibleRank: string | null;
      responsibleSignatureImage: string | null;
      officerName: string | null;
      officerPn: string | null;
      officerRank: string | null;
      officerSignatureImage: string | null;
    };
  }> {
    const date = new Date(sessionDate);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('תאריך לא תקין');

    const [items, nashkiyaByItem, session] = await Promise.all([
      this.prisma.item.findMany({
        where: { isActive: true, inSummary: true },
        orderBy: ITEM_ORDER,
      }),
      this.mesakem.nashkiyaFor(sessionDate),
      this.prisma.countSession.findUnique({
        where: { sessionDate_shift: { sessionDate: date, shift } },
        include: {
          reopens: {
            orderBy: { reopenedAt: 'desc' },
            take: 1,
            include: { reopenedBy: { select: { displayName: true } } },
          },
        },
      }),
    ]);

    const rows: CountSheetRow[] = items.map((item) => ({
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      nashkiyaQty: nashkiyaByItem.get(item.id) ?? null,
    }));

    return {
      session: session
        ? {
            id: session.id,
            isClosed: session.isClosed,
            lastReopen: session.reopens[0]
              ? {
                  at: session.reopens[0].reopenedAt,
                  by: session.reopens[0].reopenedBy.displayName,
                  reason: session.reopens[0].reason,
                }
              : null,
          }
        : null,
      rows,
      signers: {
        responsibleName: session?.responsibleName ?? null,
        responsiblePn: session?.responsiblePn ?? null,
        responsibleRank: session?.responsibleRank ?? null,
        responsibleSignatureImage: session?.responsibleSignatureImage ?? null,
        officerName: session?.officerName ?? null,
        officerPn: session?.officerPn ?? null,
        officerRank: session?.officerRank ?? null,
        officerSignatureImage: session?.officerSignatureImage ?? null,
      },
    };
  }

  /**
   * Saves (or updates) the signer details for a session. Re-saving the same
   * date and shift replaces them, so a correction before closing doesn't
   * create a second session.
   */
  async save(dto: SaveCountDto, actor: AuthUser): Promise<{ id: string }> {
    const date = new Date(dto.sessionDate);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('תאריך לא תקין');

    const existing = await this.prisma.countSession.findUnique({
      where: { sessionDate_shift: { sessionDate: date, shift: dto.shift } },
    });
    if (existing?.isClosed) {
      throw new BadRequestException('הספירה נסגרה ולא ניתן לשנות אותה');
    }

    const session = await this.prisma.countSession.upsert({
      where: { sessionDate_shift: { sessionDate: date, shift: dto.shift } },
      update: {
        responsibleName: dto.responsibleName ?? null,
        responsiblePn: dto.responsiblePn ?? null,
        responsibleRank: dto.responsibleRank ?? null,
        officerName: dto.officerName ?? null,
        officerPn: dto.officerPn ?? null,
        officerRank: dto.officerRank ?? null,
        responsibleSignatureImage: dto.responsibleSignatureImage ?? null,
        officerSignatureImage: dto.officerSignatureImage ?? null,
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
        responsibleSignatureImage: dto.responsibleSignatureImage ?? null,
        officerSignatureImage: dto.officerSignatureImage ?? null,
        recordedByUserId: actor.id,
      },
    });

    return { id: session.id };
  }

  /** A closed session's sheet, for printing — same rows as `sheet()`, pinned to what was actually signed rather than recomputed live. */
  async forPrint(id: string): Promise<{
    session: {
      sessionDate: Date;
      shift: CountShift;
      responsibleName: string | null;
      responsiblePn: string | null;
      responsibleRank: string | null;
      responsibleSignatureImage: string | null;
      officerName: string | null;
      officerPn: string | null;
      officerRank: string | null;
      officerSignatureImage: string | null;
    };
    rows: CountSheetRow[];
  }> {
    const session = await this.prisma.countSession.findUniqueOrThrow({ where: { id } });

    const [items, nashkiyaByItem] = await Promise.all([
      this.prisma.item.findMany({ where: { isActive: true, inSummary: true }, orderBy: ITEM_ORDER }),
      this.mesakem.nashkiyaFor(session.sessionDate.toISOString().slice(0, 10)),
    ]);

    const rows: CountSheetRow[] = items.map((item) => ({
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      nashkiyaQty: nashkiyaByItem.get(item.id) ?? null,
    }));

    return {
      session: {
        sessionDate: session.sessionDate,
        shift: session.shift,
        responsibleName: session.responsibleName,
        responsiblePn: session.responsiblePn,
        responsibleRank: session.responsibleRank,
        responsibleSignatureImage: session.responsibleSignatureImage,
        officerName: session.officerName,
        officerPn: session.officerPn,
        officerRank: session.officerRank,
        officerSignatureImage: session.officerSignatureImage,
      },
      rows,
    };
  }

  /**
   * Closing freezes a sign-off so it cannot drift afterwards. Both signers'
   * full details are required at this point — the fields stay optional on
   * every earlier `save()` so progress can be kept before either party is
   * present, but a closed sheet without a name, מ.א., דרגה and drawn
   * signature for both sides is not actually a signed document.
   */
  async close(id: string): Promise<{ id: string; isClosed: boolean }> {
    const session = await this.prisma.countSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('הספירה אינה קיימת');

    const missing =
      !session.responsibleName?.trim() ||
      !session.responsiblePn?.trim() ||
      !session.responsibleRank?.trim() ||
      !session.responsibleSignatureImage ||
      !session.officerName?.trim() ||
      !session.officerPn?.trim() ||
      !session.officerRank?.trim() ||
      !session.officerSignatureImage;
    if (missing) {
      throw new BadRequestException('יש למלא שם, מ.א., דרגה ולהחתים את שני הצדדים לפני סגירת הספירה');
    }

    const updated = await this.prisma.countSession.update({
      where: { id },
      data: { isClosed: true },
    });
    return { id: updated.id, isClosed: updated.isClosed };
  }

  /**
   * Admin-only undo of a closed count, for when someone closed it by mistake.
   *
   * Both signatures are cleared: the people signed a sheet that is about to be
   * changed, so a signature on the corrected version has to be given again.
   * Names, מ.א. and דרגה stay so they need not be retyped. The act itself is
   * recorded — who, when, and the reason — so the history stays honest.
   */
  async reopen(id: string, reason: string, actor: AuthUser): Promise<{ id: string; isClosed: boolean }> {
    const session = await this.prisma.countSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('הספירה אינה קיימת');
    if (!session.isClosed) throw new BadRequestException('הספירה אינה סגורה');

    await this.prisma.$transaction([
      this.prisma.countSessionReopen.create({
        data: { countSessionId: id, reopenedByUserId: actor.id, reason: reason.trim() },
      }),
      this.prisma.countSession.update({
        where: { id },
        data: { isClosed: false, responsibleSignatureImage: null, officerSignatureImage: null },
      }),
    ]);
    return { id, isClosed: false };
  }

  /** Recent sessions, for picking a date to review. */
  recent(limit = 30) {
    return this.prisma.countSession.findMany({
      orderBy: [{ sessionDate: 'desc' }, { shift: 'asc' }],
      take: limit,
      include: {
        recordedBy: { select: { displayName: true } },
      },
    });
  }
}
