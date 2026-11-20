import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

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

    const ws = wb.addWorksheet('מסכם', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    ws.columns = [{ width: 24 }, { width: 14 }, { width: 14 }, { width: 10 }];
    const header = ws.addRow(['שם פריט', 'סה"כ מנופק', 'בנשקייה', 'פער']);
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1E8' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    for (const row of rows) {
      const excelRow = ws.addRow([row.itemName, row.issued, row.nashkiyaQty, row.gap]);
      const gapCell = excelRow.getCell(4);
      if (row.gap !== null && row.gap !== 0) {
        gapCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4CCCC' } };
        gapCell.font = { bold: true };
      } else if (row.gap === 0) {
        gapCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } };
      }
    }

    return { wb, date };
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
