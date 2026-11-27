import type ExcelJS from 'exceljs';

/**
 * One visual language for every sheet the app hands to people — a title
 * banner, a colored header, zebra rows, status pills and a print setup — so
 * an export reads like a battalion document rather than a raw data dump.
 * Colors follow the app's own palette (field green / brass / oxide) so the
 * file and the screen it came from feel like the same product.
 */

const FONT = 'Arial';

export const PALETTE = {
  ink: 'FF1C2420',
  inkSoft: 'FF4A5650',
  white: 'FFFFFFFF',
  fieldDark: 'FF1F4D3A',
  field: 'FF2F6B53',
  fieldWash: 'FFE3EFE8',
  zebra: 'FFF5F8F6',
  rule: 'FFD3DDD7',
  brass: 'FFB8893A',
  brassWash: 'FFF7EDD8',
  brassInk: 'FF7A5718',
  oxide: 'FFB5452E',
  oxideWash: 'FFF8E1DB',
  sky: 'FF2E6A9E',
  skyWash: 'FFDDEAF5',
  violet: 'FF6B4FA0',
  violetWash: 'FFEAE3F5',
  graphite: 'FF8A938E',
  graphiteWash: 'FFEEF0EF',
} as const;

export type Tone = 'field' | 'oxide' | 'sky' | 'brass' | 'violet' | 'graphite';

const TONE: Record<Tone, { fg: string; bg: string }> = {
  field: { fg: PALETTE.field, bg: PALETTE.fieldWash },
  oxide: { fg: PALETTE.oxide, bg: PALETTE.oxideWash },
  sky: { fg: PALETTE.sky, bg: PALETTE.skyWash },
  brass: { fg: PALETTE.brassInk, bg: PALETTE.brassWash },
  violet: { fg: PALETTE.violet, bg: PALETTE.violetWash },
  graphite: { fg: PALETTE.inkSoft, bg: PALETTE.graphiteWash },
};

/** The same color per item category on every sheet. */
export const CATEGORY_TONE: Record<string, Tone> = {
  WEAPON: 'field',
  OPTICS: 'sky',
  DRONE: 'violet',
  ACCESSORY: 'brass',
  GEAR: 'graphite',
  AMMO: 'oxide',
};

export function solid(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

const THIN: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: PALETTE.rule } };
const GRID: Partial<ExcelJS.Borders> = { top: THIN, bottom: THIN, left: THIN, right: THIN };

export function createSheet(wb: ExcelJS.Workbook, name: string, widths: number[]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, {
    views: [{ rightToLeft: true, showGridLines: false }],
    properties: { defaultRowHeight: 20 },
  });
  ws.columns = widths.map((width) => ({ width }));
  return ws;
}

/**
 * The banner on top of every sheet: unit + title on a dark band, a subtitle
 * line (filters, date, when it was generated) on a light one, and a thin
 * brass rule under both — the same masthead the printed 1008 uses.
 */
/**
 * The unit a workbook was made for. It rides on the workbook's own `company` property so the helpers below
 * can name it without every sheet builder having to pass it down; whoever creates the workbook sets it.
 */
export const unitOf = (ws: ExcelJS.Worksheet): string => ws.workbook.company ?? '';

export function addTitleBlock(
  ws: ExcelJS.Worksheet,
  colCount: number,
  title: string,
  subtitle: string,
): void {
  const titleRow = ws.addRow([`${unitOf(ws)} · ${title}`]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, colCount);
  titleRow.height = 38;
  const titleCell = titleRow.getCell(1);
  titleCell.font = { name: FONT, size: 18, bold: true, color: { argb: PALETTE.white } };
  titleCell.fill = solid(PALETTE.fieldDark);
  titleCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1, readingOrder: 'rtl' };

  const subRow = ws.addRow([subtitle]);
  ws.mergeCells(subRow.number, 1, subRow.number, colCount);
  subRow.height = 22;
  const subCell = subRow.getCell(1);
  subCell.font = { name: FONT, size: 10, color: { argb: PALETTE.fieldDark } };
  subCell.fill = solid(PALETTE.fieldWash);
  subCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1, readingOrder: 'rtl' };

  const ruleRow = ws.addRow([]);
  ws.mergeCells(ruleRow.number, 1, ruleRow.number, colCount);
  ruleRow.height = 4;
  ruleRow.getCell(1).fill = solid(PALETTE.brass);
}

/**
 * A row of headline figures above the table (e.g. "42 פריטים · 3 בפער"),
 * each in its own tinted box so the numbers that matter are seen before the
 * table is read.
 */
export function addKpiRow(
  ws: ExcelJS.Worksheet,
  colCount: number,
  kpis: { label: string; value: number | string; tone: Tone }[],
): void {
  ws.addRow([]).height = 6;
  const row = ws.addRow([]);
  row.height = 36;
  const span = Math.max(1, Math.floor(colCount / kpis.length));
  kpis.forEach((kpi, i) => {
    const start = i * span + 1;
    const end = i === kpis.length - 1 ? colCount : start + span - 1;
    if (end > start) ws.mergeCells(row.number, start, row.number, end);
    const cell = row.getCell(start);
    const tone = TONE[kpi.tone];
    cell.value = {
      richText: [
        { text: `${kpi.value}`, font: { name: FONT, size: 16, bold: true, color: { argb: tone.fg } } },
        { text: `  ${kpi.label}`, font: { name: FONT, size: 10, color: { argb: PALETTE.inkSoft } } },
      ],
    };
    cell.fill = solid(tone.bg);
    cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' };
    cell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
  });
  ws.addRow([]).height = 8;
}

export function addHeaderRow(ws: ExcelJS.Worksheet, labels: string[]): ExcelJS.Row {
  const row = ws.addRow(labels);
  row.height = 26;
  row.eachCell((cell) => {
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: PALETTE.white } };
    cell.fill = solid(PALETTE.field);
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, readingOrder: 'rtl' };
    cell.border = {
      top: { style: 'thin', color: { argb: PALETTE.fieldDark } },
      bottom: { style: 'medium', color: { argb: PALETTE.brass } },
      left: { style: 'thin', color: { argb: PALETTE.fieldDark } },
      right: { style: 'thin', color: { argb: PALETTE.fieldDark } },
    };
  });
  return row;
}

/**
 * A data row: zebra fill, thin grid, text right-aligned (RTL) and the
 * columns listed in `centered` centered — numbers and short codes read
 * better centered under their header.
 */
export function addBodyRow(
  ws: ExcelJS.Worksheet,
  values: (string | number | null)[],
  index: number,
  centered: number[] = [],
): ExcelJS.Row {
  const row = ws.addRow(values.map((v) => (v === null ? '' : v)));
  row.height = 21;
  const fill = solid(index % 2 === 0 ? PALETTE.white : PALETTE.zebra);
  for (let c = 1; c <= values.length; c++) {
    const cell = row.getCell(c);
    cell.font = { name: FONT, size: 10.5, color: { argb: PALETTE.ink } };
    cell.fill = fill;
    cell.border = GRID;
    cell.alignment = {
      horizontal: centered.includes(c) ? 'center' : 'right',
      vertical: 'middle',
      indent: centered.includes(c) ? 0 : 1,
      readingOrder: 'rtl',
    };
  }
  return row;
}

/** Recolors one cell as a tinted pill — action type, status, gap. */
export function pill(cell: ExcelJS.Cell, tone: Tone): void {
  const t = TONE[tone];
  cell.fill = solid(t.bg);
  cell.font = { name: FONT, size: 10.5, bold: true, color: { argb: t.fg } };
  cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' };
}

/** Monospace + muted for serial numbers, so a מסד reads as a code. */
export function mono(cell: ExcelJS.Cell): void {
  cell.font = { name: 'Consolas', size: 10.5, color: { argb: PALETTE.inkSoft } };
}

/** A full-width band separating groups (e.g. one per day). */
export function addBandRow(ws: ExcelJS.Worksheet, colCount: number, text: string): ExcelJS.Row {
  const row = ws.addRow([text]);
  ws.mergeCells(row.number, 1, row.number, colCount);
  row.height = 24;
  const cell = row.getCell(1);
  cell.font = { name: FONT, size: 11.5, bold: true, color: { argb: PALETTE.brassInk } };
  cell.fill = solid(PALETTE.brassWash);
  cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1, readingOrder: 'rtl' };
  cell.border = {
    top: { style: 'thin', color: { argb: PALETTE.brass } },
    bottom: { style: 'thin', color: { argb: PALETTE.brass } },
  };
  return row;
}

/** Closing totals line: bold on the dark band, matching the title. */
export function addTotalsRow(ws: ExcelJS.Worksheet, values: (string | number)[], centered: number[] = []): void {
  const row = ws.addRow(values);
  row.height = 26;
  for (let c = 1; c <= values.length; c++) {
    const cell = row.getCell(c);
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: PALETTE.white } };
    cell.fill = solid(PALETTE.fieldDark);
    cell.alignment = {
      horizontal: centered.includes(c) ? 'center' : 'right',
      vertical: 'middle',
      indent: centered.includes(c) ? 0 : 1,
      readingOrder: 'rtl',
    };
  }
}

/**
 * Freezes everything above the table header, turns on filters for it, and
 * sets the sheet up to print as an A4 landscape page with a footer — so
 * "print" from Excel gives a usable document without fiddling.
 */
export function finalizeSheet(ws: ExcelJS.Worksheet, headerRow: ExcelJS.Row, colCount: number, note?: string): void {
  const footer = `${note ? `${note} · ` : ''}מערכת הלוגיסטיקה של ${unitOf(ws)}`;
  ws.views = [{ state: 'frozen', ySplit: headerRow.number, rightToLeft: true, showGridLines: false }];
  ws.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: colCount },
  };
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    printTitlesRow: `${headerRow.number}:${headerRow.number}`,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 },
  };
  ws.headerFooter = {
    oddFooter: `&R${footer}&L&P / &N`,
  };
}

export function generatedAtLabel(): string {
  return new Date().toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
