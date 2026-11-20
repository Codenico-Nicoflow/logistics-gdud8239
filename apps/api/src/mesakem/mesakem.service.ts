import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import type { ItemCategory } from '@prisma/client';
import { CATEGORY_HE } from '../excel/excel.constants';
import {
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

const CATEGORY_TONE: Record<string, Tone> = {
  WEAPON: 'field',
  OPTICS: 'sky',
  DRONE: 'violet',
  ACCESSORY: 'brass',
  GEAR: 'graphite',
  AMMO: 'oxide',
};

export type MesakemRow = {
  itemId: string;
  itemName: string;
  category: string;
  issued: number;
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
  ) {}

  private parseDate(sessionDate: string): Date {
    const date = new Date(sessionDate);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('תאריך לא תקין');
    return date;
  }

  async sheet(sessionDate: string): Promise<{ rows: MesakemRow[]; sentAt: Date | null }> {
    const date = this.parseDate(sessionDate);

    const [items, issuedRows, lines, exportRow] = await Promise.all([
      this.prisma.item.findMany({ where: { isActive: true, inSummary: true }, orderBy: { name: 'asc' } }),
      this.prisma.signature.groupBy({
        by: ['itemId'],
        where: { returnedAt: null },
        _sum: { quantity: true },
      }),
      this.prisma.dailySummaryLine.findMany({ where: { sessionDate: date } }),
      this.prisma.dailySummaryExport.findUnique({ where: { sessionDate: date } }),
    ]);

    const issuedByItem = new Map(issuedRows.map((r) => [r.itemId, r._sum.quantity ?? 0]));
    const lineByItem = new Map(lines.map((l) => [l.itemId, l]));

    const rows: MesakemRow[] = items.map((item) => {
      const issued = issuedByItem.get(item.id) ?? 0;
      const line = lineByItem.get(item.id);
      const nashkiyaQty = line?.nashkiyaQty ?? null;
      return {
        itemId: item.id,
        itemName: item.name,
        category: item.category,
        issued,
        authorizedQty: item.authorizedQty,
        nashkiyaQty,
        gap: nashkiyaQty === null ? null : item.authorizedQty - (issued + nashkiyaQty),
      };
    });

    return { rows, sentAt: exportRow?.slackSentAt ?? null };
  }

  /** Upserts one day's בנשקייה figures. Re-saving the same date replaces what
   *  was there, same correction-friendly shape as `CountsService#save`. */
  async save(
    sessionDate: string,
    lines: { itemId: string; nashkiyaQty: number }[],
    actor: AuthUser,
  ): Promise<{ saved: number }> {
    const date = this.parseDate(sessionDate);

    await this.prisma.$transaction(
      lines.map((l) =>
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
    );

    return { saved: lines.length };
  }

  private async buildWorkbook(sessionDate: string): Promise<{ wb: ExcelJS.Workbook; date: Date }> {
    const date = this.parseDate(sessionDate);
    const { rows } = await this.sheet(sessionDate);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'מערכת לוגיסטיקה';
    wb.created = new Date();

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
    finalizeSheet(ws, header, COLS, 'מסכם יומי · מערכת הלוגיסטיקה של גדוד 8239');

    return { wb, date };
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

    const exportRow = await this.prisma.dailySummaryExport.upsert({
      where: { sessionDate: date },
      update: {},
      create: { sessionDate: date },
    });

    const token = this.config.get<string>('SLACK_BOT_TOKEN');
    // Its own channel, separate from SLACK_CHANNEL_ID (db-backups/snapshots)
    // — מסכם is a daily business document for the armory team, not a plumbing
    // backup, and belongs in its own channel.
    const channel = this.config.get<string>('MESAKEM_SLACK_CHANNEL_ID');
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
        filename: `מסכם-${dateLabel}.xlsx`,
        initial_comment: `מסכם יומי — ${dateLabel}`,
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
