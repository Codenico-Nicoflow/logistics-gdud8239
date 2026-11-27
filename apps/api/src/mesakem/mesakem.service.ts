import { ITEM_ORDER } from '../common/item-order';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { BattalionService } from '../battalion/battalion.service';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import ExcelJS from 'exceljs';
import { storedQtyByItem } from '../ifsun/stored-qty';
import { PrismaService } from '../prisma/prisma.service';
import { SlackConfigService } from '../slack/slack-config.service';
import type { AuthUser } from '../auth/auth.types';
import { addDaysIso } from '../common/israel-date';
import { reopenOps } from '../counts/reopen-ops';
import type { ItemCategory } from '@prisma/client';
import { CATEGORY_HE } from '../excel/excel.constants';
import {
  CATEGORY_TONE,
  PALETTE,
  addBodyRow,
  addHeaderRow,
  addKpiRow,
  addTitleBlock,
  addTotalsRow,
  createSheet,
  finalizeSheet,
  generatedAtLabel,
  pill,
  type Tone,
} from '../excel/excel-theme';

export type MesakemRow = {
  itemId: string;
  itemName: string;
  category: string;
  /** Out with soldiers — signatures minus whatever is parked in the armory under אפסון. */
  issued: number;
  /** Units stored (אפסון): signed to a soldier but on the shelf, so counted in בנשקייה, not in מנופק. */
  stored: number;
  authorizedQty: number;
  nashkiyaQty: number | null;
  /** מצבה − (מנופק + בנשקייה); `null` until בנשקייה is filled in for the day. */
  gap: number | null;
};

/**
 * `מסכם` — the once-a-day armory headcount. One `בנשקייה` figure per item per
 * calendar day (no morning/evening split, unlike `ספירת נשקיה`), entered once
 * and read back from `ספירת נשקיה` as the number the two signers verify
 * together — so the same number is never typed twice.
 */
@Injectable()
export class MesakemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly battalion: BattalionService,
    private readonly slackConfig: SlackConfigService,
  ) {}

  /**
   * Counts that signed this day's figures and are closed right now: the evening
   * count of the day, and the morning count after it (which verifies the same
   * number). Changing the figures invalidates what they signed.
   */
  private async signedCountsFor(date: Date): Promise<{ id: string; shift: 'EVENING' | 'MORNING'; date: string }[]> {
    const day = date.toISOString().slice(0, 10);
    const next = addDaysIso(day, 1);
    const sessions = await this.prisma.countSession.findMany({
      where: {
        isClosed: true,
        OR: [
          { sessionDate: date, shift: 'EVENING' },
          { sessionDate: new Date(next), shift: 'MORNING' },
        ],
      },
    });
    return sessions.map((s) => ({ id: s.id, shift: s.shift, date: s.sessionDate.toISOString().slice(0, 10) }));
  }

  private parseDate(sessionDate: string): Date {
    const date = new Date(sessionDate);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('תאריך לא תקין');
    return date;
  }

  async sheet(sessionDate: string): Promise<{
    rows: MesakemRow[];
    sentAt: Date | null;
    /** Closed counts that signed this day's figures — editing them means reopening these. */
    signedCounts: { id: string; shift: 'EVENING' | 'MORNING'; date: string }[];
  }> {
    const date = this.parseDate(sessionDate);

    const [items, issuedRows, lines, exportRow, signedCounts, storedByItem] = await Promise.all([
      this.prisma.item.findMany({ where: { isActive: true, inSummary: true }, orderBy: ITEM_ORDER }),
      this.prisma.signature.groupBy({
        by: ['itemId'],
        where: { returnedAt: null },
        _sum: { quantity: true },
      }),
      this.prisma.dailySummaryLine.findMany({ where: { sessionDate: date } }),
      this.prisma.dailySummaryExport.findFirst({ where: { sessionDate: date } }),
      this.signedCountsFor(date),
      storedQtyByItem(this.prisma),
    ]);

    const issuedByItem = new Map(issuedRows.map((r) => [r.itemId, r._sum.quantity ?? 0]));
    const lineByItem = new Map(lines.map((l) => [l.itemId, l]));

    const rows: MesakemRow[] = items.map((item) => {
      const stored = storedByItem.get(item.id) ?? 0;
      const issued = (issuedByItem.get(item.id) ?? 0) - stored;
      const line = lineByItem.get(item.id);
      const nashkiyaQty = line?.nashkiyaQty ?? null;
      return {
        itemId: item.id,
        itemName: item.name,
        category: item.category,
        issued,
        stored,
        authorizedQty: item.authorizedQty,
        nashkiyaQty,
        gap: nashkiyaQty === null ? null : item.authorizedQty - (issued + nashkiyaQty),
      };
    });

    return { rows, sentAt: exportRow?.slackSentAt ?? null, signedCounts };
  }

  /** Upserts one day's בנשקייה figures. Re-saving the same date replaces what
   *  was there, same correction-friendly shape as `CountsService#save`. */
  async save(
    sessionDate: string,
    lines: { itemId: string; nashkiyaQty: number }[],
    actor: AuthUser,
    correctionReason?: string,
  ): Promise<{ saved: number; reopened: number }> {
    const date = this.parseDate(sessionDate);

    // A correction only matters if a number actually moved: re-saving the same
    // figures must not undo anyone's signature.
    const before = await this.nashkiyaFor(sessionDate);
    const changed = lines.some((l) => before.get(l.itemId) !== l.nashkiyaQty);
    const signed = changed ? await this.signedCountsFor(date) : [];
    const reason = correctionReason?.trim();
    if (signed.length > 0 && !reason) {
      throw new ConflictException('יש ספירה שכבר נחתמה על המסכם הזה — נדרשת סיבה לתיקון, והספירה תיפתח מחדש לחתימה');
    }

    await this.prisma.$transaction([
      ...lines.map((l) =>
        this.prisma.dailySummaryLine.upsert({
          where: { sessionDate_itemId: { sessionDate: date, itemId: l.itemId } },
          update: { nashkiyaQty: l.nashkiyaQty, updatedByUserId: actor.id },
          create: {
            sessionDate: date,
            itemId: l.itemId,
            nashkiyaQty: l.nashkiyaQty,
            updatedByUserId: actor.id,
          },
        }),
      ),
      ...signed.flatMap((c) =>
        reopenOps(this.prisma, c.id, actor.id, `תיקון מסכם ${date.toISOString().slice(0, 10)}: ${reason}`),
      ),
    ]);

    return { saved: lines.length, reopened: signed.length };
  }

  private async buildWorkbook(sessionDate: string): Promise<{ wb: ExcelJS.Workbook; date: Date }> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'מערכת לוגיסטיקה';
    wb.company = (await this.battalion.unit()).name;
    wb.created = new Date();
    const date = await this.addSheet(wb, sessionDate);
    return { wb, date };
  }

  /**
   * Adds the styled מסכם sheet to a workbook — used by the standalone daily
   * file and by the full workbook, so the two can never drift apart.
   */
  async addSheet(wb: ExcelJS.Workbook, sessionDate: string): Promise<Date> {
    const date = this.parseDate(sessionDate);
    const { rows } = await this.sheet(sessionDate);

    const COLS = 6;
    const ws = createSheet(wb, 'מסכם', [26, 13, 12, 13, 13, 14]);
    const dateLabel = date.toLocaleDateString('he-IL', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Jerusalem',
    });
    addTitleBlock(ws, COLS, 'מסכם יומי', `${dateLabel}   ·   הופק ${generatedAtLabel()}`);

    const filled = rows.filter((r) => r.nashkiyaQty !== null);
    const withGap = filled.filter((r) => r.gap !== 0);
    addKpiRow(ws, COLS, [
      { label: 'פריטים', value: rows.length, tone: 'graphite' },
      { label: 'מולאו', value: filled.length, tone: 'sky' },
      { label: 'תקינים', value: filled.length - withGap.length, tone: 'field' },
      { label: 'בפער', value: withGap.length, tone: withGap.length ? 'oxide' : 'field' },
    ]);

    const header = addHeaderRow(ws, ['צל"מ', 'קטגוריה', 'מצבה', 'סה"כ מנופק', 'בנשקייה', 'פער']);

    rows.forEach((r, i) => {
      const row = addBodyRow(
        ws,
        [r.itemName, CATEGORY_HE[r.category as ItemCategory] ?? r.category, r.authorizedQty, r.issued, r.nashkiyaQty, r.gap],
        i,
        [2, 3, 4, 5, 6],
      );
      row.getCell(1).font = { name: 'Arial', size: 10.5, bold: true };
      pill(row.getCell(2), CATEGORY_TONE[r.category] ?? 'graphite');

      const gapCell = row.getCell(6);
      if (r.gap === null) {
        gapCell.value = '—';
        gapCell.font = { name: 'Arial', size: 10.5, color: { argb: PALETTE.graphite } };
      } else {
        gapCell.value = r.gap === 0 ? '✓ תקין' : r.gap > 0 ? `חסר ${r.gap}` : `עודף ${-r.gap}`;
        pill(gapCell, r.gap === 0 ? 'field' : 'oxide');
      }
    });

    addTotalsRow(
      ws,
      [
        'סה"כ',
        '',
        rows.reduce((s, r) => s + r.authorizedQty, 0),
        rows.reduce((s, r) => s + r.issued, 0),
        filled.reduce((s, r) => s + (r.nashkiyaQty ?? 0), 0),
        withGap.length ? `${withGap.length} בפער` : 'הכל תקין',
      ],
      [3, 4, 5, 6],
    );
    finalizeSheet(ws, header, COLS, 'מסכם יומי');

    return date;
  }

  async exportExcel(sessionDate: string): Promise<{ buffer: Buffer; fileName: string }> {
    const { wb, date } = await this.buildWorkbook(sessionDate);
    const data = await wb.xlsx.writeBuffer();
    return { buffer: Buffer.from(data), fileName: `mesakem-${date.toISOString().slice(0, 10)}.xlsx` };
  }

  /**
   * "סיים יום" — exports the day's sheet and sends it to Slack in one step,
   * recording the attempt either way so a failed send is visible and
   * retriable rather than silently lost (same shape as `DbBackupsService`).
   */
  async finishDay(sessionDate: string): Promise<{ sent: boolean; error?: string }> {
    const { wb, date } = await this.buildWorkbook(sessionDate);

    // A second send for a day already sent is a correction, and must say so —
    // two files with the same name in the channel are indistinguishable.
    const previous = await this.prisma.dailySummaryExport.findFirst({ where: { sessionDate: date } });
    const alreadySent = !!previous?.slackSentAt;
    // (day) is only unique within a battalion, so there is no single-key `upsert`; an existing row is kept as is.
    const exportRow = previous ?? (await this.prisma.dailySummaryExport.create({ data: { sessionDate: date } }));

    const token = this.config.get<string>('SLACK_BOT_TOKEN');
    // Its own channel, separate from the snapshots one — מסכם is a daily business document for the
    // armory team, not a plumbing backup, and belongs in its own channel.
    const channel = await this.slackConfig.channel('mesakem');
    if (!token || !channel) {
      const error = 'Slack אינו מוגדר';
      await this.prisma.dailySummaryExport.update({ where: { id: exportRow.id }, data: { slackError: error } });
      return { sent: false, error };
    }

    try {
      const buffer = await wb.xlsx.writeBuffer();
      const dateLabel = date.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
      const slack = new WebClient(token);
      await slack.filesUploadV2({
        channel_id: channel,
        file: Buffer.from(buffer),
        filename: `מסכם-${dateLabel}${alreadySent ? '-מתוקן' : ''}.xlsx`,
        initial_comment: `מסכם יומי${alreadySent ? ' (מתוקן)' : ''} — ${dateLabel}`,
      });

      await this.prisma.dailySummaryExport.update({
        where: { id: exportRow.id },
        data: { slackSentAt: new Date(), slackError: null },
      });
      return { sent: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await this.prisma.dailySummaryExport.update({
        where: { id: exportRow.id },
        data: { slackError: error.slice(0, 500) },
      });
      return { sent: false, error };
    }
  }

  /** The current בנשקייה figure for an item on a given date — what `ספירת
   *  נשקיה` reads back as the number its two signers verify together. */
  async nashkiyaFor(sessionDate: string): Promise<Map<string, number>> {
    const date = this.parseDate(sessionDate);
    const lines = await this.prisma.dailySummaryLine.findMany({ where: { sessionDate: date } });
    return new Map(lines.map((l) => [l.itemId, l.nashkiyaQty]));
  }
}
