import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { MovementsService } from '../movements/movements.service';
import {
  ACTION_HE,
  CATEGORY_HE,
  COMPANY_HE,
  COMPANY_ORDER,
  SHEET,
  SIGNATURES_HEADER,
} from './excel.constants';

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9E1E8' },
};

/**
 * Writes the workbook that replaces the hand-maintained file.
 *
 * The `צלמ` sheet keeps the signature columns in their original order (minus
 * מחלקה, retired app-wide), so the export can be re-imported to restore the data.
 * The derived sheets are computed rather than copied, so they cannot disagree
 * with the signatures the way the hand-kept versions did.
 */
@Injectable()
export class ExcelExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly movements: MovementsService,
  ) {}

  async build(): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'מערכת לוגיסטיקה';
    wb.created = new Date();
    wb.views = [{ x: 0, y: 0, width: 20000, height: 20000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];

    await this.addSignatures(wb);
    await this.addSummary(wb);
    await this.addCompanies(wb);
    await this.addAllocations(wb);
    await this.addCount(wb);
    await this.addWeaponNames(wb);
    await this.addPriceList(wb);
    await this.addMovements(wb);
    await this.addIssues(wb);

    return wb;
  }

  async toBuffer(): Promise<Buffer> {
    const wb = await this.build();
    const data = await wb.xlsx.writeBuffer();
    return Buffer.from(data);
  }

  /** Every sheet is right-to-left, with a frozen, styled header row. */
  private sheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
    return wb.addWorksheet(name, {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    });
  }

  private styleHeader(row: ExcelJS.Row): void {
    row.font = { bold: true };
    row.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
  }

  /** `צלמ` — the one sheet that is real data rather than a computed view. */
  private async addSignatures(wb: ExcelJS.Workbook): Promise<void> {
    const ws = this.sheet(wb, SHEET.signatures);
    ws.columns = [
      { width: 18 },
      { width: 14 },
      { width: 14 },
      { width: 16 },
      { width: 10 },
      { width: 15 },
      { width: 12 },
      { width: 10 },
      { width: 24 },
    ];
    this.styleHeader(ws.addRow([...SIGNATURES_HEADER]));

    const signatures = await this.prisma.signature.findMany({
      where: { returnedAt: null },
      include: { soldier: true, item: true, itemInstance: true },
      orderBy: [{ soldier: { lastName: 'asc' } }, { soldier: { firstName: 'asc' } }],
    });

    for (const s of signatures) {
      // A quantity above 1 means a non-serialized item signed several times.
      // It is written as one row per unit so the sheet stays row-per-item, the
      // way the original file counts them.
      const rows = s.itemInstanceId ? 1 : s.quantity;
      for (let i = 0; i < rows; i++) {
        ws.addRow([
          s.item.name,
          s.itemInstance?.serial ?? '',
          s.soldier.firstName,
          s.soldier.lastName,
          COMPANY_HE[s.soldier.company],
          s.soldier.phone ?? '',
          s.soldier.personalNumber ?? '',
          s.receiptNo ?? '',
          s.needsAttention ? `דרוש טיפול: ${s.notes ?? 'חסר מידע'}` : (s.notes ?? ''),
        ]);
      }
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };
  }

  private async addSummary(wb: ExcelJS.Workbook): Promise<void> {
    const ws = this.sheet(wb, SHEET.summary);
    ws.columns = [
      { width: 22 },
      { width: 13 },
      { width: 11 },
      { width: 9 },
      { width: 9 },
      { width: 9 },
    ];
    // מק"ט/תקול/תקין are not tracked by the battalion, so the columns the
    // original sheet carried are no longer written.
    this.styleHeader(ws.addRow(['צלמ', 'סה"כ מנופק', 'בנשקיה', 'סה"כ', 'מצבה', 'פער']));

    for (const r of await this.reports.summary()) {
      ws.addRow([r.itemName, r.issued, r.inArmory, r.total, r.authorized, r.gap]);
    }
  }

  private async addCompanies(wb: ExcelJS.Workbook): Promise<void> {
    const ws = this.sheet(wb, SHEET.companies);
    ws.columns = [{ width: 22 }, ...COMPANY_ORDER.map(() => ({ width: 10 })), { width: 9 }, { width: 11 }];
    this.styleHeader(
      ws.addRow([' ', ...COMPANY_ORDER.map((c) => COMPANY_HE[c]), 'סה"כ', 'בנשקיה']),
    );

    for (const r of await this.reports.companyMatrix()) {
      ws.addRow([
        r.itemName,
        ...COMPANY_ORDER.map((c) => r.byCompany[c]),
        r.total,
        r.inArmory,
      ]);
    }
  }

  /**
   * `הקצאות` keeps the original two-row-per-item shape: the target row followed
   * by a `נשאר לחתום` row, which is computed here rather than typed in.
   */
  private async addAllocations(wb: ExcelJS.Workbook): Promise<void> {
    const ws = this.sheet(wb, SHEET.allocations);
    ws.columns = [{ width: 22 }, ...COMPANY_ORDER.map(() => ({ width: 10 })), { width: 9 }];
    this.styleHeader(ws.addRow([' ', ...COMPANY_ORDER.map((c) => COMPANY_HE[c]), 'סה"כ']));

    for (const r of await this.reports.allocations()) {
      ws.addRow([r.itemName, ...COMPANY_ORDER.map((c) => r.targets[c]), r.totalTarget]);
      ws.addRow(['נשאר לחתום', ...COMPANY_ORDER.map((c) => r.remaining[c]), '']);
    }
  }

  /**
   * `ספירת נשקיה` with the signer block the original sheet carries.
   *
   * `בנשקייה` is one daily figure from מסכם (`DailySummaryLine`), not
   * per-shift, so the same number appears whether it's the evening or morning
   * session being signed — only the signer details genuinely differ by shift.
   */
  private async addCount(wb: ExcelJS.Workbook): Promise<void> {
    const ws = this.sheet(wb, SHEET.count);
    ws.columns = [{ width: 22 }, { width: 13 }, { width: 13 }, { width: 10 }];
    this.styleHeader(ws.addRow(['שם פריט', 'בנשקייה', 'סה"כ מנופק', 'מצבה']));

    const latest = await this.prisma.countSession.findMany({
      orderBy: [{ sessionDate: 'desc' }],
      take: 2,
    });
    const evening = latest.find((s) => s.shift === 'EVENING');
    const morning = latest.find((s) => s.shift === 'MORNING');
    const mostRecent = latest[0];

    const items = await this.prisma.item.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    const summary = mostRecent
      ? await this.reports.summary(mostRecent.sessionDate.toISOString().slice(0, 10))
      : await this.reports.summary();
    const summaryByItemId = new Map(summary.map((r) => [r.itemId, r]));

    for (const item of items) {
      const row = summaryByItemId.get(item.id);
      ws.addRow([item.name, row?.inArmory ?? '', row?.issued ?? 0, item.authorizedQty]);
    }

    ws.addRow([]);
    const signerHeader = ws.addRow(['פרטים', 'אחראי משק', 'בעל תפקיד', 'אחראי משק', 'בעל תפקיד']);
    signerHeader.font = { bold: true };
    ws.addRow([
      'שם ומשפחה',
      evening?.responsibleName ?? '',
      evening?.officerName ?? '',
      morning?.responsibleName ?? '',
      morning?.officerName ?? '',
    ]);
    ws.addRow([
      'מ.א',
      evening?.responsiblePn ?? '',
      evening?.officerPn ?? '',
      morning?.responsiblePn ?? '',
      morning?.officerPn ?? '',
    ]);
    ws.addRow([
      'דרגה',
      evening?.responsibleRank ?? '',
      evening?.officerRank ?? '',
      morning?.responsibleRank ?? '',
      morning?.officerRank ?? '',
    ]);
    ws.addRow(['חתימה', '', '', '', '']);
    ws.addRow([
      'תאריך',
      evening?.sessionDate ?? '',
      evening?.sessionDate ?? '',
      morning?.sessionDate ?? '',
      morning?.sessionDate ?? '',
    ]);
  }

  /** `רשימת שמות נשק` — the per-company print list of who holds a weapon. */
  private async addWeaponNames(wb: ExcelJS.Workbook): Promise<void> {
    const ws = this.sheet(wb, SHEET.weaponNames);
    ws.columns = [
      { width: 10 },
      { width: 14 },
      { width: 16 },
      { width: 10 },
      { width: 18 },
      { width: 14 },
    ];
    this.styleHeader(ws.addRow(['פלוגה', 'שם', 'שם משפחה', 'מ.א.', 'פריט', 'מסד']));

    const weapons = await this.prisma.signature.findMany({
      where: { returnedAt: null, item: { category: 'WEAPON' } },
      include: { soldier: true, item: true, itemInstance: true },
      orderBy: [
        { soldier: { company: 'asc' } },
        { soldier: { lastName: 'asc' } },
        { soldier: { firstName: 'asc' } },
      ],
    });

    for (const s of weapons) {
      ws.addRow([
        COMPANY_HE[s.soldier.company],
        s.soldier.firstName,
        s.soldier.lastName,
        s.soldier.personalNumber ?? '',
        s.item.name,
        s.itemInstance?.serial ?? '',
      ]);
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } };
  }

  private async addPriceList(wb: ExcelJS.Workbook): Promise<void> {
    const ws = this.sheet(wb, SHEET.priceList);
    ws.columns = [{ width: 16 }, { width: 38 }, { width: 14 }, { width: 14 }];
    this.styleHeader(ws.addRow(['מס"ד', 'פריט', 'מחיר ליחידה', 'קטגוריה']));

    const priced = await this.prisma.item.findMany({
      where: { unitPrice: { not: null } },
      orderBy: { name: 'asc' },
    });
    for (const [index, item] of priced.entries()) {
      const row = ws.addRow([
        index + 1,
        item.name,
        item.unitPrice ? Number(item.unitPrice) : '',
        CATEGORY_HE[item.category],
      ]);
      row.getCell(3).numFmt = '#,##0.00';
    }
  }

  /** `דוח תנועות` — the audit log, which the original file only had as a template. */
  private async addMovements(wb: ExcelJS.Workbook): Promise<void> {
    const ws = this.sheet(wb, SHEET.movements);
    ws.columns = [
      { width: 18 },
      { width: 10 },
      { width: 22 },
      { width: 10 },
      { width: 20 },
      { width: 14 },
      { width: 8 },
      { width: 10 },
      { width: 18 },
      { width: 26 },
    ];
    this.styleHeader(
      ws.addRow([
        'תאריך ושעה',
        'פעולה',
        'שם החייל',
        'פלוגה',
        'צל"מ',
        'מסד',
        'כמות',
        "מס' קבלה",
        'בוצע ע"י',
        'הערות',
      ]),
    );

    for (const m of await this.movements.findAllForExport({})) {
      const row = ws.addRow([
        m.occurredAt,
        ACTION_HE[m.action as keyof typeof ACTION_HE] ?? m.action,
        m.soldierName,
        m.company ? COMPANY_HE[m.company as keyof typeof COMPANY_HE] ?? m.company : '',
        m.itemName,
        m.serial ?? '',
        m.quantity,
        m.receiptNo ?? '',
        m.performedBy,
        m.notes ?? '',
      ]);
      row.getCell(1).numFmt = 'dd/mm/yyyy hh:mm';
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 10 } };
  }

  /** `דרוש טיפול` — rows imported with a problem, so the gaps travel with the file. */
  private async addIssues(wb: ExcelJS.Workbook): Promise<void> {
    const ws = this.sheet(wb, SHEET.issues);
    ws.columns = [{ width: 18 }, { width: 10 }, { width: 46 }, { width: 44 }, { width: 14 }];
    this.styleHeader(ws.addRow(['סוג הבעיה', 'שורה באקסל', 'פירוט', 'השורה המקורית', 'מסד']));

    const issues = await this.prisma.importIssue.findMany({
      where: { resolvedAt: null },
      orderBy: [{ kind: 'asc' }, { rowNumber: 'asc' }],
    });
    for (const i of issues) {
      ws.addRow([i.kind, i.rowNumber, i.detail, i.rawRow, i.serial ?? '']);
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };
  }
}
