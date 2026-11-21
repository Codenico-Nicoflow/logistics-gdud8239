import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import type { QueryMovementsDto } from './dto/query-movements.dto';
import type { Paginated } from '../common/pagination.dto';
import {
  addBandRow,
  addBodyRow,
  addHeaderRow,
  addKpiRow,
  addTitleBlock,
  addTotalsRow,
  createSheet,
  finalizeSheet,
  generatedAtLabel,
  mono,
  pill,
} from '../excel/excel-theme';

const ACTION_HE: Record<string, string> = { ISSUE: 'ניפוק', RETURN: 'זיכוי', STORE: 'אופסן', COLLECT: 'נלקח מאפסון' };
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
};

/**
 * Read-only access to the audit log. There is deliberately no create, update or
 * delete here: rows are written only inside the transaction that performs the
 * underlying action, and the database rejects UPDATE and DELETE outright.
 */
@Injectable()
export class MovementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Only צל"מ items: anything serialized, and everything that is not a bulk
   * accessory. Bulk accessories with no מסד (מחסניות, מק פורק, רצועה…) go out
   * with nearly every handover and only add noise to a report about what
   * actually happened. They stay in the audit log itself; this report just
   * never lists them. Rows whose item no longer exists are kept.
   */
  private readonly TRACKED_ONLY: Prisma.MovementWhereInput = {
    OR: [{ itemId: null }, { item: { OR: [{ isSerialized: true }, { category: { not: 'ACCESSORY' } }] } }],
  };

  private buildWhere(query: QueryMovementsDto): Prisma.MovementWhereInput {
    return {
      AND: [this.TRACKED_ONLY],
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
              { serialSnapshot: { contains: query.q, mode: 'insensitive' } },
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
   * דוח תנועות יומי as a downloadable sheet — the same filters (and the same
   * צל"מ-only rule) the screen uses, one row per movement, grouped visually by
   * day with a band row rather than a separate sheet per day — simpler to scan
   * and to re-filter in Excel than N sheets would be.
   */
  async exportDaily(query: QueryMovementsDto): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'מערכת לוגיסטיקה';
    wb.created = new Date();
    await this.addMovementsSheet(wb, query);
    const data = await wb.xlsx.writeBuffer();
    return Buffer.from(data);
  }

  /** Adds the styled תנועות sheet — shared by the standalone file and the full workbook. */
  async addMovementsSheet(wb: ExcelJS.Workbook, query: QueryMovementsDto): Promise<void> {
    const rows = await this.findAllForExport(query);

    const COLS = 8;
    const ws = createSheet(wb, 'דוח תנועות יומי', [11, 11, 24, 11, 22, 16, 9, 20]);

    const range = [
      query.from ? `מ-${query.from.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}` : null,
      query.to ? `עד ${query.to.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}` : null,
    ]
      .filter((s): s is string => s !== null)
      .join(' ');
    addTitleBlock(
      ws,
      COLS,
      'דוח תנועות',
      [range || 'כל התאריכים', `הופק ${generatedAtLabel()}`].join('   ·   '),
    );

    const issued = rows.filter((r) => r.action === 'ISSUE');
    const returned = rows.filter((r) => r.action === 'RETURN');
    addKpiRow(ws, COLS, [
      { label: 'תנועות', value: rows.length, tone: 'graphite' },
      { label: 'ניפוקים', value: issued.length, tone: 'field' },
      { label: 'זיכויים', value: returned.length, tone: 'sky' },
      { label: 'חיילים', value: new Set(rows.map((r) => r.soldierName)).size, tone: 'brass' },
    ]);

    const header = addHeaderRow(ws, ['שעה', 'פעולה', 'שם החייל', 'פלוגה', 'צל"מ', 'מסד', 'כמות', 'בוצע ע"י']);

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

    let index = 0;
    for (const day of days) {
      const [y, m, d] = day.split('-').map(Number);
      const dayRows = byDay.get(day) ?? [];
      const dayIssued = dayRows.filter((r) => r.action === 'ISSUE').length;
      const dayLabel = new Date(y, m - 1, d).toLocaleDateString('he-IL', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      addBandRow(
        ws,
        COLS,
        `${dayLabel}   ·   ${dayRows.length} תנועות (${dayIssued} ניפוק, ${dayRows.length - dayIssued} זיכוי)`,
      );

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
        const row = addBodyRow(
          ws,
          [
            time,
            ACTION_HE[m.action] ?? m.action,
            m.soldierName,
            m.company ? COMPANY_HE[m.company] ?? m.company : '',
            m.itemName,
            m.serial ?? '',
            m.quantity,
            m.performedBy,
          ],
          index++,
          [1, 2, 4, 6, 7],
        );
        pill(row.getCell(2), m.action === 'ISSUE' ? 'field' : 'sky');
        if (m.serial) mono(row.getCell(6));
        row.getCell(3).font = { name: 'Arial', size: 10.5, bold: true };
      }
    }

    addTotalsRow(
      ws,
      ['סה"כ', `${rows.length}`, '', '', '', '', rows.reduce((s, r) => s + r.quantity, 0), ''],
      [2, 7],
    );
    finalizeSheet(ws, header, COLS, 'דוח תנועות · מערכת הלוגיסטיקה של גדוד 8239');
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
    };
  }
}
