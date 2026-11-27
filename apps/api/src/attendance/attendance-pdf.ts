import { readFileSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import type { AttendanceStatus } from '@prisma/client';
import type { Week } from './attendance.service';

/**
 * The Noto Sans Hebrew files ship as two subsets (Hebrew letters, Latin + digits),
 * so a line is drawn in runs, each in the face that actually has its glyphs.
 */
const FILE = (subset: 'hebrew' | 'latin', weight: 400 | 700): string =>
  require.resolve(`@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-${subset}-${weight}-normal.woff`);

const HE = /[֐-׿]/;

const STATUS_HE: Record<AttendanceStatus, { m: string; f: string }> = {
  PRESENT: { m: 'נוכח', f: 'נוכחת' },
  LEAVING: { m: 'יציאה', f: 'יציאה' },
  RETURNING: { m: 'חזרה', f: 'חזרה' },
  ON_LEAVE: { m: 'חופש', f: 'חופש' },
  GIMELIM: { m: 'גימלים', f: 'גימלים' },
  CLOSED_ORDER: { m: 'צו סגור', f: 'צו סגור' },
  OTHER: { m: 'אחר', f: 'אחר' },
};

const STATUS_COLOR: Record<AttendanceStatus, { bg: string; fg: string }> = {
  PRESENT: { bg: '#d9efdf', fg: '#1d5a35' },
  LEAVING: { bg: '#fbe7c4', fg: '#7a4b00' },
  RETURNING: { bg: '#d6e8f7', fg: '#1b4f7a' },
  ON_LEAVE: { bg: '#e6e6e6', fg: '#444444' },
  GIMELIM: { bg: '#e7dcf3', fg: '#52307a' },
  CLOSED_ORDER: { bg: '#f6d5d2', fg: '#8a2a22' },
  OTHER: { bg: '#eeeeee', fg: '#555555' },
};

const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

type Run = { text: string; hebrew: boolean; space: boolean };

/**
 * Splits logical text into runs by the face that has the glyphs: Hebrew letters in
 * the Hebrew subset, everything else (digits, spaces, punctuation, Latin) in the Latin
 * one. PDFKit's font layout already sets a Hebrew run right-to-left, so a run is handed
 * over in logical order — it is the runs themselves that are placed right to left.
 */
function runsOf(text: string): Run[] {
  const hasHebrew = HE.test(text);
  const runs: Run[] = [];
  for (const ch of text) {
    const hebrew = HE.test(ch);
    // Whitespace is a run of its own: attached to a neighbour it would end up on that
    // neighbour's far side once runs are placed right to left.
    const space = /\s/.test(ch);
    // Brackets flip inside right-to-left text; a plain glyph would point the wrong way.
    const out = !hebrew && hasHebrew ? (MIRROR[ch] ?? ch) : ch;
    const last = runs[runs.length - 1];
    if (last && last.hebrew === hebrew && last.space === space) last.text += out;
    else runs.push({ text: out, hebrew, space });
  }
  return runs;
}

const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '<': '>', '>': '<' };

function ddmm(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

/** The week's grid as an A4-landscape PDF: member on the right, Sunday to Saturday leftwards. */
export function buildWeekPdf(week: Week, unitName: string, generatedAt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, info: { Title: 'ימי יציאה' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const files = {
      he400: readFileSync(FILE('hebrew', 400)),
      he700: readFileSync(FILE('hebrew', 700)),
      la400: readFileSync(FILE('latin', 400)),
      la700: readFileSync(FILE('latin', 700)),
    };
    doc.registerFont('he400', files.he400);
    doc.registerFont('he700', files.he700);
    doc.registerFont('la400', files.la400);
    doc.registerFont('la700', files.la700);

    /** Draws `text` right-aligned to `right` (x of its right edge), or centred in [left,right]. */
    const draw = (
      text: string,
      opts: { right: number; left?: number; y: number; size: number; bold?: boolean; color?: string; center?: boolean },
    ): void => {
      const w = opts.bold ? 700 : 400;
      // Text with no Hebrew in it ("Dan Cohen 2", "10 (+1)") reads left to right, so its
      // runs are laid out in reverse of the right-to-left placement below.
      const logical = runsOf(text);
      const ordered = HE.test(text) ? logical : [...logical].reverse();
      const runs = ordered.map((r) => ({ ...r, font: `${r.hebrew ? 'he' : 'la'}${w}` }));
      doc.fontSize(opts.size);
      const widths = runs.map((r) => doc.font(r.font).widthOfString(r.text));
      const total = widths.reduce((a, b) => a + b, 0);
      // Logical order runs right to left: the first run sits at the right edge.
      let x = opts.center && opts.left !== undefined ? opts.left + (opts.right - opts.left + total) / 2 : opts.right;
      doc.fillColor(opts.color ?? '#14181c');
      runs.forEach((r, i) => {
        x -= widths[i] as number;
        doc.font(r.font).text(r.text, x, opts.y, { lineBreak: false });
      });
    };

    const pageW = doc.page.width;
    const margin = 28;
    const right = pageW - margin;
    const left = margin;
    const nameW = 120;
    const dayW = (right - left - nameW) / 7;
    const rowH = 24;

    // Title bar
    doc.rect(left, margin, right - left, 40).fill('#14352b');
    draw(`ימי יציאה  ·  שבוע ${ddmm(week.dates[0] as string)} – ${ddmm(week.dates[6] as string)}`, {
      right: right - 14,
      y: margin + 10,
      size: 18,
      bold: true,
      color: '#ffffff',
    });
    draw(unitName, { right: left + 110, left: left + 14, y: margin + 14, size: 11, color: '#cfe3d8', center: false });

    // Header row
    let y = margin + 40 + 10;
    doc.rect(left, y, right - left, rowH + 6).fill('#2f6b53');
    draw('חבר צוות', { right: right - 10, y: y + 8, size: 11, bold: true, color: '#ffffff' });
    week.dates.forEach((d, i) => {
      const cellRight = right - nameW - i * dayW;
      draw(`${DAYS[i]}  ${ddmm(d)}`, {
        right: cellRight,
        left: cellRight - dayW,
        y: y + 8,
        size: 10.5,
        bold: true,
        color: '#ffffff',
        center: true,
      });
    });
    y += rowH + 6;

    // Body
    week.rows.forEach((row, index) => {
      if (y + rowH > doc.page.height - margin - rowH - 18) {
        doc.addPage();
        y = margin;
      }
      doc.rect(left, y, right - left, rowH).fill(index % 2 === 0 ? '#ffffff' : '#f4f6f4');
      draw(row.nickname, { right: right - 10, y: y + 6.5, size: 11, bold: true });
      row.cells.forEach((cell, i) => {
        if (!cell.status) return;
        const cellRight = right - nameW - i * dayW;
        const color = STATUS_COLOR[cell.status];
        doc.roundedRect(cellRight - dayW + 4, y + 3, dayW - 8, rowH - 6, 4).fill(color.bg);
        draw(STATUS_HE[cell.status][row.gender === 'F' ? 'f' : 'm'], {
          right: cellRight,
          left: cellRight - dayW,
          y: y + 6.5,
          size: 10.5,
          bold: true,
          color: color.fg,
          center: true,
        });
      });
      doc.moveTo(left, y + rowH).lineTo(right, y + rowH).lineWidth(0.4).strokeColor('#d8ddd8').stroke();
      y += rowH;
    });

    // Present row
    doc.rect(left, y + 2, right - left, rowH + 2).fill('#e8efe9');
    draw('נוכחים', { right: right - 10, y: y + 9, size: 11, bold: true, color: '#1d5a35' });
    week.presentPerDay.forEach((count, i) => {
      const returning = week.returningPerDay[i] ?? 0;
      const cellRight = right - nameW - i * dayW;
      draw(returning > 0 ? `${count} (+${returning})` : String(count), {
        right: cellRight,
        left: cellRight - dayW,
        y: y + 9,
        size: 11,
        bold: true,
        color: '#1d5a35',
        center: true,
      });
    });
    y += rowH + 8;

    draw(`הופק ${generatedAt}`, { right: right, y: doc.page.height - margin - 10, size: 8.5, color: '#777777' });
    doc.end();
  });
}
