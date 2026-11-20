import { Injectable } from '@nestjs/common';
import { Company } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type SummaryRow = {
  itemName: string;
  itemId: string;
  issued: number;
  /** בנשקייה — entered by hand once a day. `null` until filled in for the date. */
  inArmory: number | null;
  total: number | null;
  authorized: number;
  /** מצבה − (מנופק + בנשקייה), or `null` when there is nothing to compare against. */
  gap: number | null;
};

export type MatrixRow = {
  itemName: string;
  byCompany: Record<Company, number>;
  total: number;
  inArmory: number;
};

export type AllocationRow = {
  itemName: string;
  targets: Record<Company, number>;
  issued: Record<Company, number>;
  remaining: Record<Company, number>;
  totalTarget: number;
};

const COMPANIES: Company[] = ['A', 'B', 'C', 'SUPPORT', 'HQ'];

/**
 * Raw SQL returns the database label of the `Company` enum (`א`, `מסייעת`, ...),
 * not the Prisma client key (`A`, `SUPPORT`). Prisma maps this automatically for
 * ordinary queries but not for `$queryRaw`, so grouped raw results are translated
 * back here.
 */
const COMPANY_BY_DB_LABEL: Record<string, Company> = {
  'א': 'A',
  'ב': 'B',
  'ג': 'C',
  'מסייעת': 'SUPPORT',
  'מפקדה': 'HQ',
};

function toCompany(label: string): Company {
  const company = COMPANY_BY_DB_LABEL[label];
  if (!company) throw new Error(`Unrecognised company label from database: "${label}"`);
  return company;
}

function emptyByCompany(): Record<Company, number> {
  return { A: 0, B: 0, C: 0, SUPPORT: 0, HQ: 0 };
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The `מסכם` sheet, for a given date (defaults to today).
   *
   * `issued` is the sum of open signatures, so it cannot drift from the
   * signature data the way the hand-kept sheet did. `inArmory` (`בנשקייה`) is
   * entered by hand once a day — deliberately NOT derived from
   * `authorized - issued`, because that formula forces the gap to zero and
   * would hide exactly the discrepancy מסכם exists to find. Until בנשקייה is
   * filled in for the date it reports `null` rather than a number nobody
   * entered.
   *
   * Only items flagged `inSummary` are listed. The catalog also holds priced
   * gear and zero-stock spares that nobody counts daily, and including them
   * buried the figures that matter.
   */
  async summary(sessionDate?: string): Promise<SummaryRow[]> {
    const date = sessionDate ? new Date(sessionDate) : new Date();

    const [items, issuedRows, lines] = await Promise.all([
      this.prisma.item.findMany({
        where: { isActive: true, inSummary: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.signature.groupBy({
        by: ['itemId'],
        where: { returnedAt: null },
        _sum: { quantity: true },
      }),
      this.prisma.dailySummaryLine.findMany({ where: { sessionDate: date } }),
    ]);

    const issuedByItem = new Map(issuedRows.map((r) => [r.itemId, r._sum.quantity ?? 0]));
    const nashkiyaByItem = new Map(lines.map((l) => [l.itemId, l.nashkiyaQty]));

    return items.map((item) => {
      const issued = issuedByItem.get(item.id) ?? 0;
      const inArmory = nashkiyaByItem.get(item.id) ?? null;
      return {
        itemName: item.name,
        itemId: item.id,
        issued,
        inArmory,
        total: inArmory === null ? null : issued + inArmory,
        authorized: item.authorizedQty,
        gap: inArmory === null ? null : item.authorizedQty - (issued + inArmory),
      };
    });
  }

  /**
   * Open signatures grouped by item and the holder's company. `groupBy` cannot
   * reach through the relation to `soldier.company`, so this is one raw query.
   */
  private async issuedPerItemPerCompany(): Promise<
    { itemId: string; company: Company; qty: number }[]
  > {
    const rows = await this.prisma.$queryRaw<{ item_id: string; company: string; qty: bigint }[]>`
      SELECT sg.item_id, s.company::text AS company, SUM(sg.quantity)::bigint AS qty
      FROM signatures sg
      JOIN soldiers s ON s.id = sg.soldier_id
      WHERE sg.returned_at IS NULL
      GROUP BY sg.item_id, s.company
    `;
    return rows.map((r) => ({
      itemId: r.item_id,
      company: toCompany(r.company),
      qty: Number(r.qty),
    }));
  }

  /** The `פלוגות` sheet: item x company counts of open signatures. */
  async companyMatrix(): Promise<MatrixRow[]> {
    const rows = await this.prisma.signature.groupBy({
      by: ['itemId'],
      where: { returnedAt: null },
      _sum: { quantity: true },
    });
    const totals = new Map(rows.map((r) => [r.itemId, r._sum.quantity ?? 0]));

    const perCompany = await this.issuedPerItemPerCompany();

    const items = await this.prisma.item.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    const byItem = new Map<string, Record<Company, number>>();
    for (const r of perCompany) {
      const bucket = byItem.get(r.itemId) ?? emptyByCompany();
      bucket[r.company] = r.qty;
      byItem.set(r.itemId, bucket);
    }

    return items.map((item) => {
      const byCompany = byItem.get(item.id) ?? emptyByCompany();
      return {
        itemName: item.name,
        byCompany,
        total: COMPANIES.reduce((sum, c) => sum + byCompany[c], 0),
        // Unissued stock, which is what the sheet's בנשקיה column means here.
        // The counted figure lives in the מסכם report, where it is entered.
        inArmory: Math.max(item.authorizedQty - (totals.get(item.id) ?? 0), 0),
      };
    });
  }

  /** The `הקצאות` sheet: targets vs issued, with `נשאר לחתום` computed. */
  async allocations(): Promise<AllocationRow[]> {
    const allocations = await this.prisma.allocation.findMany({ include: { item: true } });
    const perCompany = await this.issuedPerItemPerCompany();
    const issuedByItem = new Map<string, Record<Company, number>>();
    for (const r of perCompany) {
      const bucket = issuedByItem.get(r.itemId) ?? emptyByCompany();
      bucket[r.company] = r.qty;
      issuedByItem.set(r.itemId, bucket);
    }

    const grouped = new Map<string, { itemName: string; targets: Record<Company, number> }>();
    for (const a of allocations) {
      const entry = grouped.get(a.itemId) ?? { itemName: a.item.name, targets: emptyByCompany() };
      entry.targets[a.company] = a.targetQty;
      grouped.set(a.itemId, entry);
    }

    return [...grouped.entries()].map(([itemId, { itemName, targets }]) => {
      const issued = issuedByItem.get(itemId) ?? emptyByCompany();
      const remaining = emptyByCompany();
      for (const c of COMPANIES) remaining[c] = targets[c] - issued[c];
      return {
        itemName,
        targets,
        issued,
        remaining,
        totalTarget: COMPANIES.reduce((sum, c) => sum + targets[c], 0),
      };
    });
  }
}
