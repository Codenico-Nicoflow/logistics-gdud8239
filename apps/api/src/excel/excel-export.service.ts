import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { MovementsService } from '../movements/movements.service';
import { MesakemService } from '../mesakem/mesakem.service';
import { AllocationsService } from '../allocations/allocations.service';
import { AttendanceService } from '../attendance/attendance.service';
import { ITEM_ORDER } from '../common/item-order';
import { addDaysIso, israelToday } from '../common/israel-date';
import { CATEGORY_HE } from './excel.constants';
import { CompaniesService, type CompanyRow } from '../companies/companies.service';
import {
  CATEGORY_TONE,
  PALETTE,
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
} from './excel-theme';
import type { CompanyCode } from '../companies/company-code';

/** One sheet per page the people actually use. */
const SHEET = {
  overview: 'סקירה',
  summary: 'מסכם',
  count: 'ספירת נשקיה',
  signatures: 'חתימות',
  ifsun: 'אפסון',
  attendance: 'ימי יציאה',
  companies: 'חלוקה לפלוגות',
  soldiers: 'חלוקה לפי חייל',
  movements: 'דוח תנועות יומי',
} as const;

const FOOTER = 'מערכת הלוגיסטיקה של גדוד 8239';
const BOLD = { name: 'Arial', size: 10.5, bold: true, color: { argb: PALETTE.ink } };
const MUTED = { name: 'Arial', size: 10.5, color: { argb: PALETTE.graphite } };

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('he-IL', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function dateTimeLabel(d: Date): string {
  return d.toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The workbook people download and the daily file sent to Slack.
 *
 * Every sheet mirrors a page of the app — the same data, in the same item
 * order — instead of the old hand-kept file's tabs. The sheets that already
 * exist elsewhere (מסכם, דוח תנועות) come from their own services so the
 * standalone file and the workbook can never disagree.
 */
@Injectable()
export class ExcelExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly movements: MovementsService,
    private readonly mesakem: MesakemService,
    private readonly allocations: AllocationsService,
    private readonly attendance: AttendanceService,
    private readonly companies: CompaniesService,
  ) {}

  /** The battalion's companies as the sheets lay them out: their order, and a name for any stored code. */
  private async companyLayout(): Promise<{ list: CompanyRow[]; order: string[]; nameOf: (code: string) => string }> {
    const list = await this.companies.list();
    const names = new Map(list.map((c) => [c.code, c.name]));
    return { list, order: list.map((c) => c.code), nameOf: (code) => names.get(code) ?? code };
  }

  async build(): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'מערכת לוגיסטיקה';
    wb.created = new Date();
    wb.views = [{ x: 0, y: 0, width: 20000, height: 20000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];

    const day = israelToday();
    // Created first so it is the first tab, filled last once the numbers exist.
    const overview = createSheet(wb, SHEET.overview, [22, 22, 22, 22]);

    await this.mesakem.addSheet(wb, day);
    await this.addCount(wb);
    const held = await this.addSignatures(wb);
    await this.addIfsun(wb);
    await this.addAttendance(wb);
    await this.addCompanies(wb);
    await this.addSoldiers(wb);
    await this.movements.addMovementsSheet(wb, {});

    await this.fillOverview(overview, day, held);
    return wb;
  }

  async toBuffer(): Promise<Buffer> {
    const wb = await this.build();
    const data = await wb.xlsx.writeBuffer();
    return Buffer.from(data);
  }

  // ---------- סקירה ----------

  private async fillOverview(
    ws: ExcelJS.Worksheet,
    day: string,
    held: { units: number; soldiers: number },
  ): Promise<void> {
    const COLS = 4;
    const [sheet, movementCount] = await Promise.all([
      this.mesakem.sheet(day),
      this.prisma.movement.count(),
    ]);
    const filled = sheet.rows.filter((r) => r.nashkiyaQty !== null);
    const gaps = filled.filter((r) => r.gap !== 0).length;

    addTitleBlock(ws, COLS, 'סקירת המערכת', `${dayLabel(day)}   ·   הופק ${generatedAtLabel()}`);
    addKpiRow(ws, COLS, [
      { label: 'יחידות חתומות', value: held.units, tone: 'field' },
      { label: 'חיילים עם ציוד', value: held.soldiers, tone: 'sky' },
      {
        label: 'פריטים בפער במסכם',
        value: filled.length === 0 ? '—' : gaps,
        tone: gaps > 0 ? 'oxide' : 'graphite',
      },
      { label: 'תנועות', value: movementCount, tone: 'brass' },
    ]);

    const header = addHeaderRow(ws, ['גיליון', 'מה יש בו', '', '']);
    ws.mergeCells(header.number, 2, header.number, COLS);
    const contents: [string, string][] = [
      [SHEET.summary, 'בנשקייה היומי מול מצבה ומנופק, והפער לכל פריט'],
      [SHEET.count, 'הספירה שנחתמה בערב ובבוקר, עם החתימות'],
      [SHEET.signatures, 'כל הציוד החתום כרגע, לפי פלוגה וחייל'],
      [SHEET.ifsun, 'כל האפסונים: מי הפקיד ומי לקח, ומתי'],
      [SHEET.attendance, 'ימי יציאה של הצוות: ארבעה שבועות אחורה ושבועיים קדימה'],
      [SHEET.companies, 'מה יש בכל פלוגה, וכמה מההקצאה נוצל'],
      [SHEET.soldiers, 'ההקצאה לכל חייל מול מה שנופק לו'],
      [SHEET.movements, 'כל הניפוקים והזיכויים, לפי יום'],
    ];
    contents.forEach(([name, what], i) => {
      const row = addBodyRow(ws, [name, what, '', ''], i);
      ws.mergeCells(row.number, 2, row.number, COLS);
      const link = row.getCell(1);
      link.value = { text: name, hyperlink: `#'${name}'!A1` };
      link.font = { name: 'Arial', size: 11, bold: true, underline: true, color: { argb: PALETTE.sky } };
    });
    finalizeSheet(ws, header, COLS, FOOTER);
  }

  // ---------- ספירת נשקיה ----------

  /**
   * The sign-off sheet for the latest *night*: the evening count of day D and
   * the morning count after it (D+1), side by side, as the original file had
   * them. Both sign the same figure — the בנשקייה entered in מסכם at the end
   * of D — because nothing is issued overnight and D+1's מסכם does not exist
   * yet when the morning count is done.
   *
   * Which night: the one containing the latest count. If that is an evening on
   * D the morning is still pending; if it is a morning on M the evening is the
   * one before it (M-1), which may be missing (e.g. after Shabbat).
   */
  private async addCount(wb: ExcelJS.Workbook): Promise<void> {
    const recent = await this.prisma.countSession.findMany({
      orderBy: { sessionDate: 'desc' },
      take: 4,
    });
    // Within one date the morning happens before the evening, so the evening is the later one.
    const chronological = [...recent].sort(
      (a, b) =>
        b.sessionDate.getTime() - a.sessionDate.getTime() ||
        (a.shift === 'EVENING' ? 1 : 0) - (b.shift === 'EVENING' ? 1 : 0),
    );
    const latest = chronological[0];
    const latestDay = latest ? latest.sessionDate.toISOString().slice(0, 10) : israelToday();
    const eveningDay = !latest || latest.shift === 'EVENING' ? latestDay : addDaysIso(latestDay, -1);
    const morningDay = addDaysIso(eveningDay, 1);

    const [eveningRow, morningRow, items, nashkiya] = await Promise.all([
      this.prisma.countSession.findFirst({
        where: { sessionDate: new Date(eveningDay), shift: 'EVENING' },
      }),
      this.prisma.countSession.findFirst({
        where: { sessionDate: new Date(morningDay), shift: 'MORNING' },
      }),
      this.prisma.item.findMany({ where: { isActive: true, inSummary: true }, orderBy: ITEM_ORDER }),
      this.mesakem.nashkiyaFor(eveningDay),
    ]);
    // A signed evening count keeps the figures it signed, even if מסכם was corrected later.
    const signedFigures = eveningRow?.isClosed
      ? await this.prisma.countSessionFigure.findMany({ where: { countSessionId: eveningRow.id } })
      : [];
    const figureFor = (itemId: string): number | undefined =>
      signedFigures.length > 0
        ? (signedFigures.find((f) => f.itemId === itemId)?.nashkiyaQty ?? undefined)
        : nashkiya.get(itemId);
    type Session = NonNullable<typeof eveningRow>;
    const evening = eveningRow ?? undefined;
    const morning = morningRow ?? undefined;
    const short = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

    const COLS = 3;
    const ws = createSheet(wb, SHEET.count, [34, 26, 26]);
    addTitleBlock(
      ws,
      COLS,
      'ספירת נשקיה',
      `ערב ${dayLabel(eveningDay)}   ·   בוקר ${short(morningDay)}   ·   הופק ${generatedAtLabel()}`,
    );
    const state = (s?: Session) => (s?.isClosed ? 'נחתמה' : 'טרם נחתמה');
    addKpiRow(ws, COLS, [
      { label: 'פריטים', value: items.length, tone: 'graphite' },
      { label: `ספירת ערב ${short(eveningDay)}`, value: state(evening), tone: evening?.isClosed ? 'field' : 'brass' },
      { label: `ספירת בוקר ${short(morningDay)}`, value: state(morning), tone: morning?.isClosed ? 'field' : 'brass' },
    ]);

    const header = addHeaderRow(ws, ['צל"מ', 'קטגוריה', `בנשקייה (מסכם ${short(eveningDay)})`]);
    items.forEach((item, i) => {
      const qty = figureFor(item.id);
      const row = addBodyRow(ws, [item.name, CATEGORY_HE[item.category], qty ?? '—'], i, [2, 3]);
      row.getCell(1).font = BOLD;
      pill(row.getCell(2), CATEGORY_TONE[item.category] ?? 'graphite');
      row.getCell(3).font = qty === undefined ? MUTED : BOLD;
    });

    ws.addRow([]).height = 12;
    addBandRow(ws, COLS, 'חתימות הספירה');
    addHeaderRow(ws, ['', `ספירת ערב · ${short(eveningDay)}`, `ספירת בוקר · ${short(morningDay)}`]);

    let zebra = 0;
    const textRow = (label: string, pick: (s?: Session) => string | null) => {
      const row = addBodyRow(ws, [label, pick(evening) ?? '—', pick(morning) ?? '—'], zebra++, [2, 3]);
      row.getCell(1).font = BOLD;
    };
    const statusRow = addBodyRow(ws, ['סטטוס', state(evening), state(morning)], zebra++, [2, 3]);
    statusRow.getCell(1).font = BOLD;
    pill(statusRow.getCell(2), evening?.isClosed ? 'field' : 'brass');
    pill(statusRow.getCell(3), morning?.isClosed ? 'field' : 'brass');

    const roles = [
      {
        title: 'אחראי משק ארמון',
        name: (s?: Session) => s?.responsibleName ?? null,
        pn: (s?: Session) => s?.responsiblePn ?? null,
        rank: (s?: Session) => s?.responsibleRank ?? null,
        image: (s?: Session) => s?.responsibleSignatureImage ?? null,
      },
      {
        title: 'בעל תפקיד ארמון',
        name: (s?: Session) => s?.officerName ?? null,
        pn: (s?: Session) => s?.officerPn ?? null,
        rank: (s?: Session) => s?.officerRank ?? null,
        image: (s?: Session) => s?.officerSignatureImage ?? null,
      },
    ];
    for (const role of roles) {
      addBandRow(ws, COLS, role.title);
      textRow('שם ומשפחה', role.name);
      textRow('מ.א.', role.pn);
      textRow('דרגה', role.rank);

      const sigRow = addBodyRow(ws, ['חתימה', '', ''], zebra++, [2, 3]);
      sigRow.height = 64;
      sigRow.getCell(1).font = BOLD;
      [evening, morning].forEach((session, i) => {
        const dataUrl = role.image(session);
        const prefix = 'data:image/png;base64,';
        if (dataUrl?.startsWith(prefix)) {
          const id = wb.addImage({ base64: dataUrl.slice(prefix.length), extension: 'png' });
          ws.addImage(id, {
            tl: { col: 1 + i + 0.08, row: sigRow.number - 1 + 0.06 },
            ext: { width: 150, height: 74 },
          });
        } else {
          const cell = sigRow.getCell(2 + i);
          cell.value = 'ממתין לחתימה';
          cell.font = MUTED;
        }
      });
    }
    finalizeSheet(ws, header, COLS, FOOTER);
  }

  // ---------- חתימות ----------

  /** Everything signed out right now, grouped by company and soldier. */
  private async addSignatures(wb: ExcelJS.Workbook): Promise<{ units: number; soldiers: number }> {
    const { order, nameOf } = await this.companyLayout();
    const [signatures, items] = await Promise.all([
      this.prisma.signature.findMany({
        where: { returnedAt: null },
        include: {
          soldier: true,
          item: true,
          itemInstance: true,
          ifsunRecords: { where: { status: 'STORED' }, select: { quantity: true } },
        },
      }),
      this.prisma.item.findMany({ orderBy: ITEM_ORDER, select: { id: true } }),
    ]);
    const rank = new Map(items.map((it, i) => [it.id, i]));
    const company = (c: string) => order.indexOf(c);
    signatures.sort(
      (a, b) =>
        company(a.soldier.company) - company(b.soldier.company) ||
        a.soldier.lastName.localeCompare(b.soldier.lastName, 'he') ||
        a.soldier.firstName.localeCompare(b.soldier.firstName, 'he') ||
        (rank.get(a.itemId) ?? 0) - (rank.get(b.itemId) ?? 0),
    );

    const units = signatures.reduce((sum, s) => sum + s.quantity, 0);
    const soldierIds = new Set(signatures.map((s) => s.soldierId));

    const COLS = 7;
    const ws = createSheet(wb, SHEET.signatures, [20, 12, 22, 13, 8, 16, 14]);
    addTitleBlock(ws, COLS, 'חתימות', `כל הציוד החתום כרגע   ·   הופק ${generatedAtLabel()}`);
    addKpiRow(ws, COLS, [
      { label: 'יחידות חתומות', value: units, tone: 'field' },
      { label: 'חיילים', value: soldierIds.size, tone: 'sky' },
      { label: 'סוגי ציוד', value: new Set(signatures.map((s) => s.itemId)).size, tone: 'brass' },
    ]);
    const header = addHeaderRow(ws, ['חייל', 'מ.א.', 'צל"מ', 'מסד', 'כמות', 'נחתם', 'אפסון']);

    let index = 0;
    for (const c of order) {
      const mine = signatures.filter((s) => s.soldier.company === c);
      if (mine.length === 0) continue;
      const people = new Set(mine.map((s) => s.soldierId)).size;
      addBandRow(
        ws,
        COLS,
        `פלוגה ${nameOf(c)}   ·   ${people} חיילים   ·   ${mine.reduce((n, s) => n + s.quantity, 0)} יחידות`,
      );
      let previous = '';
      for (const s of mine) {
        const first = s.soldierId !== previous;
        previous = s.soldierId;
        const row = addBodyRow(
          ws,
          [
            first ? `${s.soldier.firstName} ${s.soldier.lastName}` : '',
            first ? (s.soldier.personalNumber ?? '') : '',
            s.item.name,
            s.itemInstance?.serial ?? '',
            s.quantity,
            dateTimeLabel(s.signedAt),
            // A stored item is still signed but sits in the armory — flagged so the sheet
            // does not read as if the soldier were carrying it.
            s.ifsunRecords.length > 0 ? `מאופסן ${s.ifsunRecords.reduce((n, r) => n + r.quantity, 0)}` : '',
          ],
          index++,
          [2, 4, 5, 6, 7],
        );
        if (first) row.getCell(1).font = BOLD;
        if (s.itemInstance) mono(row.getCell(4));
        row.getCell(6).font = MUTED;
      }
    }
    if (signatures.length === 0) {
      const row = addBodyRow(ws, ['אין ציוד חתום כרגע', '', '', '', '', '', ''], 0);
      ws.mergeCells(row.number, 1, row.number, COLS);
    }
    finalizeSheet(ws, header, COLS, FOOTER);
    return { units, soldiers: soldierIds.size };
  }

  // ---------- ימי יציאה ----------

  /**
   * The team's weekly ימי יציאה grid — four weeks back through two ahead, one band
   * per week.
   */
  private async addAttendance(wb: ExcelJS.Workbook): Promise<void> {
    const COLS = 8;
    const STATUS_HE = {
      PRESENT: 'נוכח',
      LEAVING: 'יציאה',
      RETURNING: 'חזרה',
      ON_LEAVE: 'חופש',
      GIMELIM: 'גימלים',
      CLOSED_ORDER: 'צו סגור',
      OTHER: 'אחר',
    } as const;
    const TONE_OF = { PRESENT: 'field', RETURNING: 'sky', LEAVING: 'brass' } as const;
    const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

    const today = israelToday();
    const weeks = await Promise.all([-4, -3, -2, -1, 0, 1, 2].map((k) => this.attendance.week(addDaysIso(today, k * 7))));

    const ws = createSheet(wb, SHEET.attendance, [18, 11, 11, 11, 11, 11, 11, 11]);
    addTitleBlock(ws, COLS, 'ימי יציאה', `ארבעה שבועות אחורה, שבועיים קדימה   ·   הופק ${generatedAtLabel()}`);
    const header = addHeaderRow(ws, ['חבר צוות', ...DAYS]);

    let index = 0;
    for (const week of weeks) {
      const first = week.dates[0] as string;
      const last = week.dates[6] as string;
      const marker = first <= today && today <= last ? '   ·   השבוע' : '';
      addBandRow(ws, COLS, `${dayLabel(first)}  –  ${dayLabel(last)}${marker}`);
      for (const row of week.rows) {
        const cells = row.cells.map((c) => (c.status ? STATUS_HE[c.status] : ''));
        const out = addBodyRow(
          ws,
          [row.nickname, ...cells],
          index++,
          [2, 3, 4, 5, 6, 7, 8],
        );
        row.cells.forEach((c, i) => {
          const tone = c.status ? (TONE_OF as Record<string, 'field' | 'sky' | 'brass'>)[c.status] : undefined;
          if (tone) pill(out.getCell(i + 2), tone);
        });
      }
      if (week.rows.length === 0) {
        const empty = addBodyRow(ws, ['אין חברי צוות', '', '', '', '', '', '', ''], 0);
        ws.mergeCells(empty.number, 1, empty.number, COLS);
      }
    }
    finalizeSheet(ws, header, COLS, FOOTER);
  }

  // ---------- אפסון ----------

  /**
   * The whole אפסון ledger — what is stored now and everything that was, with who
   * signed each half. The signature drawings themselves stay in the database
   * backup (a thousand embedded PNGs would make the workbook unusable); this
   * sheet says whether each half was signed and by whom.
   */
  private async addIfsun(wb: ExcelJS.Workbook): Promise<void> {
    const [rows, storeSigned, collectSigned] = await Promise.all([
      this.prisma.ifsunRecord.findMany({
        orderBy: { storedAt: 'desc' },
        omit: { storeSignatureImage: true, collectSignatureImage: true },
      }),
      this.prisma.ifsunRecord.findMany({ where: { storeSignatureImage: { not: null } }, select: { id: true } }),
      this.prisma.ifsunRecord.findMany({ where: { collectSignatureImage: { not: null } }, select: { id: true } }),
    ]);
    const hasStore = new Set(storeSigned.map((r) => r.id));
    const hasCollect = new Set(collectSigned.map((r) => r.id));
    const stored = rows.filter((r) => r.status === 'STORED');
    const STATUS_HE = { STORED: 'מאופסן', COLLECTED: 'נלקח', CREDITED: 'זוכה' } as const;

    const COLS = 11;
    const ws = createSheet(wb, SHEET.ifsun, [20, 20, 13, 7, 11, 16, 18, 16, 18, 16, 16]);
    addTitleBlock(ws, COLS, 'אפסון', `ציוד שהושאר בנשקייה, כולל ההיסטוריה   ·   הופק ${generatedAtLabel()}`);
    addKpiRow(ws, COLS, [
      { label: 'יחידות מאופסנות כעת', value: stored.reduce((n, r) => n + r.quantity, 0), tone: 'brass' },
      { label: 'חיילים', value: new Set(stored.map((r) => r.soldierId)).size, tone: 'sky' },
      { label: 'רשומות בהיסטוריה', value: rows.length, tone: 'field' },
    ]);
    const header = addHeaderRow(ws, [
      'חייל',
      'צל"מ',
      'מסד',
      'כמות',
      'סטטוס',
      'אופסן',
      'הופקד ע"י (חתם)',
      'נסגר',
      'נלקח ע"י (חתם)',
      'נרשם ע"י',
      'חתימות שמורות',
    ]);
    rows.forEach((r, i) => {
      const signed = [hasStore.has(r.id) ? 'הפקדה' : '', hasCollect.has(r.id) ? 'לקיחה' : ''].filter(Boolean).join(' + ');
      const row = addBodyRow(
        ws,
        [
          r.soldierNameSnapshot,
          r.itemNameSnapshot,
          r.serialSnapshot ?? '',
          r.quantity,
          STATUS_HE[r.status],
          dateTimeLabel(r.storedAt),
          r.storeSignerName ?? '',
          r.closedAt ? dateTimeLabel(r.closedAt) : '',
          r.collectSignerName ?? '',
          [r.storedByName, r.closedByName].filter(Boolean).join(' / '),
          signed || 'ללא',
        ],
        i,
        [3, 4, 5, 6, 8, 11],
      );
      if (r.serialSnapshot) mono(row.getCell(3));
    });
    if (rows.length === 0) {
      const row = addBodyRow(ws, ['אין רשומות אפסון', '', '', '', '', '', '', '', '', '', ''], 0);
      ws.mergeCells(row.number, 1, row.number, COLS);
    }
    finalizeSheet(ws, header, COLS, FOOTER);
  }

  // ---------- חלוקה לפלוגות ----------

  /**
   * What each company holds, as the page shows it, with how much of its
   * allocation for the active תקופת שרות has been used (100% = all of it).
   */
  private async addCompanies(wb: ExcelJS.Workbook): Promise<void> {
    const period = await this.allocations.findActivePeriod();
    const [matrix, grid] = await Promise.all([
      this.reports.companyMatrix(),
      period ? this.allocations.findCompanyAllocations(period.id) : Promise.resolve([]),
    ]);
    const rows = matrix.filter((r) => r.inSummary);

    // A column per active company, plus any deactivated one that still holds equipment, so nothing it
    // holds drops out of the totals.
    const { list, nameOf } = await this.companyLayout();
    const order = list.filter((c) => c.isActive || rows.some((r) => (r.byCompany[c.code] ?? 0) > 0)).map((c) => c.code);
    const n = order.length;
    const qty = (r: { byCompany: Record<string, number> }, c: string): number => r.byCompany[c] ?? 0;

    const totals = Object.fromEntries(order.map((c) => [c, 0])) as Record<string, number>;
    for (const r of rows) for (const c of order) totals[c] += qty(r, c);
    const grand = order.reduce((sum, c) => sum + totals[c], 0);

    const usage = (c: string): string => {
      let allocated = 0;
      let used = 0;
      for (const row of grid) {
        allocated += row.quantities[c] ?? 0;
        used += Math.min(row.issued[c] ?? 0, row.quantities[c] ?? 0);
      }
      return allocated === 0 ? 'ללא הקצאה' : `${Math.round((used / allocated) * 100)}%`;
    };

    const COLS = n + 2;
    const numeric = Array.from({ length: n + 1 }, (_, k) => k + 2);
    const ws = createSheet(wb, SHEET.companies, [24, ...Array.from({ length: n + 1 }, () => 13)]);
    addTitleBlock(
      ws,
      COLS,
      'חלוקה לפלוגות',
      ['מה יש כרגע בכל פלוגה, לפי החתימות הפתוחות', `הופק ${generatedAtLabel()}`].join('   ·   '),
    );
    addKpiRow(ws, COLS, [
      ...order.map((c) => ({
        label: nameOf(c),
        value: totals[c],
        tone: 'field' as const,
      })),
      { label: 'סה"כ', value: grand, tone: 'brass' as const },
    ]);
    addBandRow(
      ws,
      COLS,
      period
        ? `ניצול ההקצאה (${period.name})   ·   ${order.map((c) => `${nameOf(c)}: ${usage(c)}`).join('   ·   ')}`
        : 'אין תקופת שרות פעילה, ולכן אין ניצול הקצאה',
    );

    const header = addHeaderRow(ws, ['צל"מ', ...order.map((c) => nameOf(c)), 'סה"כ']);
    rows.forEach((r, i) => {
      const row = addBodyRow(
        ws,
        [r.itemName, ...order.map((c) => (qty(r, c) === 0 ? '—' : qty(r, c))), r.total],
        i,
        numeric,
      );
      row.getCell(1).font = BOLD;
      order.forEach((c, k) => {
        const cell = row.getCell(2 + k);
        if (qty(r, c) === 0) cell.font = MUTED;
        else pill(cell, 'field');
      });
      row.getCell(n + 2).font = BOLD;
    });
    addTotalsRow(ws, ['סה"כ', ...order.map((c) => totals[c]), grand], numeric);
    finalizeSheet(ws, header, COLS, FOOTER);
  }

  // ---------- חלוקה לפי חייל ----------

  /** The per-soldier split of each company's allocation, against what was actually issued. */
  private async addSoldiers(wb: ExcelJS.Workbook): Promise<void> {
    const { order, nameOf } = await this.companyLayout();
    const period = await this.allocations.findActivePeriod();
    const COLS = 5;
    const ws = createSheet(wb, SHEET.soldiers, [26, 26, 10, 10, 14]);
    const subtitle = (extra: string) =>
      [extra, period ? period.name : 'אין תקופת שרות פעילה', `הופק ${generatedAtLabel()}`].join('   ·   ');

    if (!period) {
      addTitleBlock(ws, COLS, 'חלוקה לפי חייל', subtitle('ההקצאה לכל חייל'));
      const header = addHeaderRow(ws, ['חייל', 'צל"מ', 'הוקצה', 'נופק', 'מצב']);
      const row = addBodyRow(ws, ['אין תקופת שרות פעילה', '', '', '', ''], 0);
      ws.mergeCells(row.number, 1, row.number, COLS);
      finalizeSheet(ws, header, COLS, FOOTER);
      return;
    }

    const [allocations, issuedRows, items] = await Promise.all([
      this.prisma.soldierAllocation.findMany({
        where: { servicePeriodId: period.id, quantity: { gt: 0 } },
        include: { soldier: true, item: true },
      }),
      this.prisma.signature.groupBy({
        by: ['soldierId', 'itemId'],
        where: { returnedAt: null },
        _sum: { quantity: true },
      }),
      this.prisma.item.findMany({ orderBy: ITEM_ORDER, select: { id: true } }),
    ]);
    const issuedBy = new Map(issuedRows.map((r) => [`${r.soldierId}|${r.itemId}`, r._sum.quantity ?? 0]));
    const rank = new Map(items.map((it, i) => [it.id, i]));
    const company = (c: string) => order.indexOf(c);
    allocations.sort(
      (a, b) =>
        company(a.soldier.company) - company(b.soldier.company) ||
        a.soldier.lastName.localeCompare(b.soldier.lastName, 'he') ||
        a.soldier.firstName.localeCompare(b.soldier.firstName, 'he') ||
        (rank.get(a.itemId) ?? 0) - (rank.get(b.itemId) ?? 0),
    );

    const lines = allocations.map((a) => ({ a, issued: issuedBy.get(`${a.soldierId}|${a.itemId}`) ?? 0 }));
    const allocated = lines.reduce((n, l) => n + l.a.quantity, 0);
    const issuedTotal = lines.reduce((n, l) => n + Math.min(l.issued, l.a.quantity), 0);
    const over = lines.filter((l) => l.issued > l.a.quantity).length;

    addTitleBlock(ws, COLS, 'חלוקה לפי חייל', subtitle('ההקצאה לכל חייל מול מה שנופק לו'));
    addKpiRow(ws, COLS, [
      { label: 'חיילים בחלוקה', value: new Set(allocations.map((a) => a.soldierId)).size, tone: 'sky' },
      { label: 'יחידות שהוקצו', value: allocated, tone: 'graphite' },
      { label: 'נופקו מהן', value: issuedTotal, tone: 'field' },
      { label: 'בחריגה', value: over, tone: over > 0 ? 'oxide' : 'graphite' },
    ]);
    const header = addHeaderRow(ws, ['חייל', 'צל"מ', 'הוקצה', 'נופק', 'מצב']);

    let index = 0;
    for (const c of order) {
      const mine = lines.filter((l) => l.a.soldier.company === c);
      if (mine.length === 0) continue;
      addBandRow(
        ws,
        COLS,
        `פלוגה ${nameOf(c)}   ·   ${new Set(mine.map((l) => l.a.soldierId)).size} חיילים   ·   ${mine.reduce((n, l) => n + l.a.quantity, 0)} יחידות שהוקצו`,
      );
      let previous = '';
      for (const { a, issued } of mine) {
        const first = a.soldierId !== previous;
        previous = a.soldierId;
        const diff = issued - a.quantity;
        const status = diff > 0 ? `חריגה ${diff}` : diff === 0 ? 'הושלם' : issued === 0 ? 'טרם נופק' : `נותרו ${-diff}`;
        const row = addBodyRow(
          ws,
          [first ? `${a.soldier.firstName} ${a.soldier.lastName}` : '', a.item.name, a.quantity, issued, status],
          index++,
          [3, 4, 5],
        );
        if (first) row.getCell(1).font = BOLD;
        pill(row.getCell(5), diff > 0 ? 'oxide' : diff === 0 ? 'field' : issued === 0 ? 'graphite' : 'brass');
      }
    }
    if (lines.length === 0) {
      const row = addBodyRow(ws, ['עדיין לא חולק לחיילים', '', '', '', ''], 0);
      ws.mergeCells(row.number, 1, row.number, COLS);
    }
    finalizeSheet(ws, header, COLS, FOOTER);
  }
}
