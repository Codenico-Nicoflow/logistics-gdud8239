import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import type { QueryMovementsDto } from './dto/query-movements.dto';
import type { Paginated } from '../common/pagination.dto';

const ACTION_HE: Record<string, string> = { ISSUE: 'ניפוק', RETURN: 'זיכוי' };
const COMPANY_HE: Record<string, string> = {
  A: 'א',
  B: 'ב',
  C: 'ג',
  SUPPORT: 'מסייעת',
  HQ: 'מפקדה',
};

/**
 * One row of `דוח תנועות`, flattened for display and export.
 *
 * `action` and `company` carry the enum key, not a Hebrew label: the UI holds a
 * single translation table (`he.ts`) so wording is changed in one place rather
 * than in every service.
 */
export type MovementRow = {
  id: string;
  action: string;
  occurredAt: Date;
  soldierName: string;
  company: string | null;
  itemName: string;
  serial: string | null;
  quantity: number;
  receiptNo: string | null;
  performedBy: string;
  notes: string | null;
  /** A bulk ACCESSORY item with no מסד — מחסניות, מק פורק, רצועה and the
   *  like. Never a serialized item, regardless of category: a weapon's own
   *  accessory (e.g. a serialized optic) is still something to track by its
   *  own מסד and always counts as routine = false. Lets the frontend offer
   *  a "הצג הכל" vs "דוח צלם" toggle without a second round-trip. */
  routine: boolean;
};

/**
 * Read-only access to the audit log. There is deliberately no create, update or
 * delete here: rows are written only inside the transaction that performs the
 * underlying action, and the database rejects UPDATE and DELETE outright.
 */
@Injectable()
export class MovementsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(query: QueryMovementsDto): Prisma.MovementWhereInput {
    return {
      ...(query.action ? { action: query.action } : {}),
      ...(query.company ? { companySnapshot: query.company } : {}),
      ...(query.soldierId ? { soldierId: query.soldierId } : {}),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.performedByUserId ? { performedByUserId: query.performedByUserId } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { soldierNameSnapshot: { contains: query.q, mode: 'insensitive' } },
              { itemNameSnapshot: { contains: query.q, mode: 'insensitive' } },
              { serialSnapshot: { contains: query.q } },
              { performedByNameSnapshot: { contains: query.q, mode: 'insensitive' } },
              { receiptNo: { contains: query.q } },
            ],
          }
        : {}),
    };
  }

  async findAll(query: QueryMovementsDto): Promise<Paginated<MovementRow>> {
    const where = this.buildWhere(query);
    const [rows, total] = await Promise.all([
      this.prisma.movement.findMany({
        where,
        include: { item: { select: { category: true, isSerialized: true } } },
        orderBy: { occurredAt: 'desc' },
        skip: query.skip ?? 0,
        take: query.take ?? 100,
      }),
      this.prisma.movement.count({ where }),
    ]);

    return { rows: rows.map((m) => this.toRow(m)), total };
  }

  /** Same filters, no pagination — used by the Excel export of the log. */
  async findAllForExport(query: QueryMovementsDto): Promise<MovementRow[]> {
    const rows = await this.prisma.movement.findMany({
      where: this.buildWhere(query),
      include: { item: { select: { category: true, isSerialized: true } } },
      orderBy: { occurredAt: 'desc' },
    });
    return rows.map((m) => this.toRow(m));
  }

  /**
   * דוח תנועות יומי as a downloadable sheet — same filters and the same
   * "הצג הכל / דוח צלם" toggle the screen itself uses (`hideRoutine` drops
   * every non-serialized ACCESSORY row, same `routine` flag `toRow` already
   * computes), one row per movement, grouped visually by day with a bold
   * separator row rather than a separate sheet per day — simpler to scan
   * and to re-filter in Excel than N sheets would be.
   */
  async exportDaily(query: QueryMovementsDto, hideRoutine: boolean): Promise<Buffer> {
    const all = await this.findAllForExport(query);
    const rows = hideRoutine ? all.filter((r) => !r.routine) : all;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'מערכת לוגיסטיקה';
    wb.created = new Date();
    const ws = wb.addWorksheet('דוח תנועות יומי', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    });
    ws.columns = [
      { width: 12 },
      { width: 10 },
      { width: 22 },
      { width: 10 },
      { width: 20 },
      { width: 14 },
      { width: 8 },
      { width: 18 },
    ];
    const header = ws.addRow(['שעה', 'פעולה', 'שם החייל', 'פלוגה', "צל\"מ", 'מסד', 'כמות', 'בוצע ע"י']);
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1E8' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    const byDay = new Map<string, MovementRow[]>();
    for (const row of rows) {
      // Israel-local day, not the UTC date `occurredAt` is stored in — the
      // server runs in UTC, so anything after ~22:00 local would otherwise
      // land under the wrong, earlier day.
      const day = row.occurredAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
      const list = byDay.get(day) ?? [];
      list.push(row);
      byDay.set(day, list);
    }
    const days = [...byDay.keys()].sort((a, b) => (a < b ? 1 : -1));

    for (const day of days) {
      const [y, m, d] = day.split('-').map(Number);
      const dayRow = ws.addRow([
        new Date(y, m - 1, d).toLocaleDateString('he-IL', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
      ]);
      dayRow.font = { bold: true };
      ws.mergeCells(dayRow.number, 1, dayRow.number, 8);
      dayRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
      });

      const dayRows = byDay.get(day) ?? [];
      for (const m of [...dayRows].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))) {
        // Excel renders a Date cell's UTC wall-clock value as-is, with no
        // timezone conversion of its own — written as text here (Israel
        // local time) rather than a Date + numFmt, so it isn't silently
        // shown 2–3 hours early.
        const time = m.occurredAt.toLocaleTimeString('he-IL', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Jerusalem',
        });
        ws.addRow([
          time,
          ACTION_HE[m.action] ?? m.action,
          m.soldierName,
          m.company ? COMPANY_HE[m.company] ?? m.company : '',
          m.itemName,
          m.serial ?? '',
          m.quantity,
          m.performedBy,
        ]);
      }
    }

    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };
    const data = await wb.xlsx.writeBuffer();
    return Buffer.from(data);
  }

  private toRow(m: {
    id: string;
    action: string;
    occurredAt: Date;
    soldierNameSnapshot: string;
    companySnapshot: string | null;
    itemNameSnapshot: string;
    serialSnapshot: string | null;
    quantity: number;
    receiptNo: string | null;
    performedByNameSnapshot: string;
    notes: string | null;
    item: { category: string; isSerialized: boolean } | null;
  }): MovementRow {
    return {
      id: m.id,
      action: m.action,
      occurredAt: m.occurredAt,
      soldierName: m.soldierNameSnapshot,
      company: m.companySnapshot,
      itemName: m.itemNameSnapshot,
      serial: m.serialSnapshot,
      quantity: m.quantity,
      receiptNo: m.receiptNo,
      performedBy: m.performedByNameSnapshot,
      notes: m.notes,
      routine: m.item ? m.item.category === 'ACCESSORY' && !m.item.isSerialized : false,
    };
  }
}
