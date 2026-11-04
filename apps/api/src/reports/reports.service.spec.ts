/**
 * Pins the computed reports to the numbers in the source Excel.
 *
 * These expectations were read directly out of `דוח צלם עדכני (2).xlsx`
 * (`מסכם` and `פלוגות`). If they pass against a freshly imported database, the
 * computed views genuinely replace the hand-maintained sheets.
 *
 * Requires a database seeded and imported from that workbook:
 *   npm run seed && tsx prisma/import-excel.ts "<path to xlsx>"
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PrismaClient, Company } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ReportsService } from './reports.service';
import type { PrismaService } from '../prisma/prisma.service';

/** `סה"כ מנופק` per item, from the `מסכם` sheet. */
const EXCEL_ISSUED: Record<string, number> = {
  'M-4': 341,
  M5: 252,
  מפרו: 71,
  משקפת: 51,
  שחמ: 51,
  'M-16': 48,
  'ציין לייזר': 35,
  'M-4 קלע': 35,
  "טריג'יקון": 35,
  'אקילה X4': 31,
  מאג: 24,
  'M-203': 21,
  מטולון: 20,
  זאבון: 20,
  'רחפן אווטה': 12,
  נגב: 10,
  עידו: 10,
  מכפל: 10,
  'מטל מפקד': 9,
  'רחפן איבו': 3,
  שחע: 3,
  'לאופולד 10': 2,
  'M-24': 2,
  'לאופולד 20': 2,
  מצפן: 2,
  עכבר: 2,
  'אקילה X6': 2,
  'M-4 קלע סער': 1,
  'משקפת 15X80': 1,
};

/** Selected cells from the `פלוגות` item x company matrix. */
const EXCEL_MATRIX: [string, Company, number][] = [
  ['M-4', 'A', 73],
  ['M-4', 'B', 66],
  ['M-4', 'C', 72],
  ['M-4', 'SUPPORT', 88],
  ['M-4', 'HQ', 42],
  ['M5', 'A', 54],
  ['M5', 'B', 52],
  ['M5', 'C', 61],
  ['M5', 'SUPPORT', 56],
  ['M5', 'HQ', 29],
  ['M-16', 'HQ', 41],
  ['מאג', 'SUPPORT', 7],
  ['נגב', 'C', 5],
  ['שחמ', 'C', 14],
  ['משקפת', 'SUPPORT', 13],
  ["טריג'יקון", 'C', 11],
  ['M-203', 'A', 9],
  ['M-24', 'SUPPORT', 2],
];

let prisma: PrismaClient;
let service: ReportsService;

beforeAll(() => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  service = new ReportsService(prisma as unknown as PrismaService);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe('מסכם — issued per item matches the Excel', () => {
  it('reproduces every non-zero item total', async () => {
    const rows = await service.summary();
    const byName = new Map(rows.map((r) => [r.itemName, r.issued]));

    const mismatches: string[] = [];
    for (const [name, expected] of Object.entries(EXCEL_ISSUED)) {
      const actual = byName.get(name);
      if (actual !== expected) mismatches.push(`${name}: Excel=${expected} app=${actual}`);
    }
    expect(mismatches).toEqual([]);
  });

  it('keeps authorized quantity (מצבה) from the catalog', async () => {
    const rows = await service.summary();
    const m4 = rows.find((r) => r.itemName === 'M-4');
    expect(m4?.authorized).toBe(364);
    expect(m4?.issued).toBe(341);
  });
});

describe('פלוגות — item x company matrix matches the Excel', () => {
  it('reproduces the sampled cells', async () => {
    const rows = await service.companyMatrix();
    const byName = new Map(rows.map((r) => [r.itemName, r.byCompany]));

    const mismatches: string[] = [];
    for (const [item, company, expected] of EXCEL_MATRIX) {
      const actual = byName.get(item)?.[company];
      if (actual !== expected) {
        mismatches.push(`${item}/${company}: Excel=${expected} app=${actual}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('matrix rows sum to the item total', async () => {
    const rows = await service.companyMatrix();
    const summary = await service.summary();
    const issuedByName = new Map(summary.map((r) => [r.itemName, r.issued]));

    for (const row of rows) {
      if (row.total === 0) continue;
      expect(row.total, `${row.itemName} matrix total vs issued`).toBe(
        issuedByName.get(row.itemName),
      );
    }
  });
});

describe('הקצאות — remaining to sign', () => {
  it('computes נשאר לחתום as target minus issued', async () => {
    const rows = await service.allocations();
    const m4 = rows.find((r) => r.itemName === 'M-4');
    expect(m4).toBeDefined();
    // Excel הקצאות: M-4 target for פלוגה א is 82, issued is 73 -> 9 remaining.
    expect(m4?.targets.A).toBe(82);
    expect(m4?.issued.A).toBe(73);
    expect(m4?.remaining.A).toBe(9);
  });
});
