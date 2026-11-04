/**
 * Item catalog derived from `דוח צלם עדכני (2).xlsx`.
 *
 * `authorizedQty` (מצבה) comes from the `מסכם` sheet.
 * `aliases` reconcile the spelling drift between sheets — e.g. `מפרו` in `צלמ`
 * is `מפרולייט` in `פלוגות`, and `M5` is `כוונת M5` in `ספירת נשקיה`. The Excel
 * import resolves an incoming name through this list before failing on it.
 */
import { ItemCategory } from '@prisma/client';

export type SeedItem = {
  name: string;
  aliases?: string[];
  category: ItemCategory;
  catalogNo?: string;
  isSerialized: boolean;
  authorizedQty: number;
};

export const CATALOG: SeedItem[] = [
  // --- נשק ---
  { name: 'M-4', category: 'WEAPON', catalogNo: '100012066', isSerialized: true, authorizedQty: 364 },
  { name: 'M-4 קלע', category: 'WEAPON', catalogNo: '100012067', isSerialized: true, authorizedQty: 37 },
  { name: 'M-4 קלע סער', category: 'WEAPON', catalogNo: '100012073', isSerialized: true, authorizedQty: 2 },
  { name: 'M-16', category: 'WEAPON', catalogNo: '100012332', isSerialized: true, authorizedQty: 119 },
  { name: 'M-203', category: 'WEAPON', catalogNo: '100025108', isSerialized: true, authorizedQty: 29 },
  { name: 'M-24', category: 'WEAPON', catalogNo: '100015447', isSerialized: true, authorizedQty: 4 },
  { name: 'מאג', category: 'WEAPON', catalogNo: '100021013', isSerialized: true, authorizedQty: 29 },
  { name: 'נגב', category: 'WEAPON', catalogNo: '100022206', isSerialized: true, authorizedQty: 24 },
  { name: 'מטולון', category: 'WEAPON', isSerialized: false, authorizedQty: 25 },
  { name: 'מטל מפקד', category: 'WEAPON', isSerialized: true, authorizedQty: 11 },
  { name: 'כלבו צלף', category: 'WEAPON', isSerialized: false, authorizedQty: 2 },

  // --- אופטיקה ---
  { name: 'M5', aliases: ['כוונת M5'], category: 'OPTICS', isSerialized: false, authorizedQty: 267 },
  { name: 'מפרו', aliases: ['מפרולייט'], category: 'OPTICS', isSerialized: false, authorizedQty: 92 },
  { name: 'שחמ', category: 'OPTICS', isSerialized: true, authorizedQty: 65 },
  { name: 'משקפת', category: 'OPTICS', catalogNo: '100081067', isSerialized: false, authorizedQty: 55 },
  { name: 'משקפת 15X80', category: 'OPTICS', isSerialized: false, authorizedQty: 1 },
  { name: "טריג'יקון", category: 'OPTICS', catalogNo: '100083647', isSerialized: true, authorizedQty: 37 },
  { name: 'ציין לייזר', aliases: ['ציין'], category: 'OPTICS', isSerialized: true, authorizedQty: 45 },
  { name: 'אקילה X4', category: 'OPTICS', isSerialized: true, authorizedQty: 32 },
  { name: 'אקילה X6', category: 'OPTICS', isSerialized: true, authorizedQty: 4 },
  { name: 'לאופולד 10', category: 'OPTICS', isSerialized: true, authorizedQty: 3 },
  { name: 'לאופולד 20', category: 'OPTICS', isSerialized: false, authorizedQty: 4 },
  { name: 'לאופלד 40', category: 'OPTICS', isSerialized: true, authorizedQty: 1 },
  { name: 'מטל לאופולד', category: 'OPTICS', isSerialized: true, authorizedQty: 0 },
  { name: 'זאבון', category: 'OPTICS', catalogNo: '100085305', isSerialized: true, authorizedQty: 25 },
  { name: 'עידו', category: 'OPTICS', catalogNo: '100072505', isSerialized: true, authorizedQty: 10 },
  { name: 'עכבר', category: 'OPTICS', catalogNo: '100081091', isSerialized: true, authorizedQty: 10 },
  { name: 'מכפל', category: 'OPTICS', isSerialized: true, authorizedQty: 24 },
  { name: 'שחע', category: 'OPTICS', isSerialized: false, authorizedQty: 3 },
  { name: 'יראור', category: 'OPTICS', catalogNo: '100086263', isSerialized: true, authorizedQty: 0 },
  { name: 'מצפן', category: 'OPTICS', catalogNo: '100087278', isSerialized: false, authorizedQty: 10 },
  { name: 'מאפס כוונת למטול', category: 'OPTICS', catalogNo: '100082454', isSerialized: true, authorizedQty: 0 },
  { name: 'מקלר', category: 'OPTICS', isSerialized: true, authorizedQty: 0 },
  { name: 'מקכ', category: 'OPTICS', isSerialized: true, authorizedQty: 0 },
  { name: 'ווילון', category: 'OPTICS', isSerialized: false, authorizedQty: 0 },
  { name: 'כדור ברזל', category: 'OPTICS', isSerialized: false, authorizedQty: 0 },
  { name: 'שבשבת רוח', category: 'OPTICS', isSerialized: false, authorizedQty: 1 },
  // Present as item names in the `מסכם` sheet; flagged for review (see plan open items).
  { name: 'עמית', category: 'OPTICS', isSerialized: false, authorizedQty: 1 },
  { name: 'ליאור', category: 'OPTICS', isSerialized: false, authorizedQty: 1 },

  // --- רחפן ---
  { name: 'רחפן אווטה', category: 'DRONE', isSerialized: true, authorizedQty: 22 },
  { name: 'רחפן איבו', category: 'DRONE', isSerialized: true, authorizedQty: 6 },
  { name: 'שלט לאווטה', category: 'DRONE', isSerialized: true, authorizedQty: 6 },
];

/** `מחירון פריטים` sheet — priced gear, used by the v2 uniform module. */
export const PRICED_GEAR: SeedItem[] = [
  { name: 'מעיל מרופד זית (דגם 2) מ"ג', category: 'GEAR', catalogNo: '400055963', isSerialized: false, authorizedQty: 0 },
  { name: 'חולצת דגמ"ח מ"ק', category: 'GEAR', catalogNo: '400149925', isSerialized: false, authorizedQty: 0 },
  { name: 'מכנס דגמ"ח מ"ק', category: 'GEAR', catalogNo: '400249920', isSerialized: false, authorizedQty: 0 },
  { name: 'חגורת עבודה ש"כ זית ארוכה', category: 'GEAR', catalogNo: '400728992', isSerialized: false, authorizedQty: 0 },
  { name: 'כובע עבודה רחב שוליים', category: 'GEAR', catalogNo: '402028920', isSerialized: false, authorizedQty: 0 },
  { name: 'משפקי מגן בליסטיים פתוחים מ.ק', category: 'GEAR', catalogNo: '408149959', isSerialized: false, authorizedQty: 0 },
  { name: "אפוד מגן נגד רסיסים דור ב'", category: 'GEAR', catalogNo: '408171008', isSerialized: false, authorizedQty: 0 },
  { name: 'מימיה עיסית', category: 'GEAR', catalogNo: '410166402', isSerialized: false, authorizedQty: 0 },
  { name: 'קסדה קבלר מידה ק מוסבת', category: 'GEAR', catalogNo: '410407116', isSerialized: false, authorizedQty: 0 },
  { name: "מנשא ציוד 89 ל' א.נ ירוק 483", category: 'GEAR', catalogNo: '410699117', isSerialized: false, authorizedQty: 0 },
  { name: 'מערכת גב מנשא ציוד כללי דור א', category: 'GEAR', catalogNo: '410699125', isSerialized: false, authorizedQty: 0 },
  { name: 'וסט לוחם', category: 'GEAR', catalogNo: '410700360', isSerialized: false, authorizedQty: 0 },
  { name: 'ווסט לוחם א.נ', category: 'GEAR', catalogNo: '410700484', isSerialized: false, authorizedQty: 0 },
  { name: 'וסט צלף', category: 'GEAR', catalogNo: '410701073', isSerialized: false, authorizedQty: 0 },
  { name: 'ווסט נגב א.נ', category: 'GEAR', catalogNo: '410701081', isSerialized: false, authorizedQty: 0 },
  { name: 'ווסט מטול א.נ', category: 'GEAR', catalogNo: '410701090', isSerialized: false, authorizedQty: 0 },
  { name: 'ווסט תד"ל א.נ', category: 'GEAR', catalogNo: '410702991', isSerialized: false, authorizedQty: 0 },
  { name: 'ארגז ביטחון - מתכת', category: 'GEAR', catalogNo: '425016016', isSerialized: false, authorizedQty: 0 },
  { name: 'אלונקת שכ- מתקפלת', category: 'GEAR', catalogNo: '425310259', isSerialized: false, authorizedQty: 0 },
  { name: 'שק שינה דגמ"ח עם שמשונית', category: 'GEAR', catalogNo: '426619563', isSerialized: false, authorizedQty: 0 },
  { name: 'ווסט לחובש', category: 'GEAR', catalogNo: '962108580', isSerialized: false, authorizedQty: 0 },
  { name: 'רשת הסוואה 2*3', category: 'GEAR', catalogNo: '925118036', isSerialized: false, authorizedQty: 0 },
  { name: 'מצפנת הסוואה זורו דגם אנט', category: 'GEAR', catalogNo: '925100005', isSerialized: false, authorizedQty: 0 },
  { name: 'נעל ח"יר שחורה', category: 'GEAR', isSerialized: false, authorizedQty: 0 },
  { name: 'טרמוקן 40 ליטר', category: 'GEAR', catalogNo: '427903842', isSerialized: false, authorizedQty: 0 },
  { name: 'שולחן מתקפל פלסטיק', category: 'GEAR', catalogNo: '425990063', isSerialized: false, authorizedQty: 0 },
  { name: 'תיבת יראור', category: 'GEAR', catalogNo: '169988692', isSerialized: false, authorizedQty: 0 },
  { name: 'מתאם יראור', category: 'GEAR', catalogNo: '169988650', isSerialized: false, authorizedQty: 0 },
  { name: 'מתאם לM-16', category: 'GEAR', catalogNo: '169988668', isSerialized: false, authorizedQty: 0 },
  { name: 'אלן', category: 'GEAR', catalogNo: '508745044', isSerialized: false, authorizedQty: 0 },
  { name: 'מגני בירכיים - עודפים', category: 'GEAR', catalogNo: '408331064', isSerialized: false, authorizedQty: 0 },
  { name: "ברכיות נינג'ה", category: 'GEAR', isSerialized: false, authorizedQty: 0 },
  { name: 'ברכיות רובוקופ', category: 'GEAR', isSerialized: false, authorizedQty: 0 },
  { name: 'קסדה רב"ש', category: 'GEAR', isSerialized: false, authorizedQty: 0 },
  { name: 'קסדה קלה', category: 'GEAR', isSerialized: false, authorizedQty: 0 },
  { name: 'פלטה קדמית לקרמי', category: 'GEAR', isSerialized: false, authorizedQty: 0 },
  { name: 'פלטה אחורית לקרמי', category: 'GEAR', isSerialized: false, authorizedQty: 0 },
  { name: 'ווסט מודולרי', category: 'GEAR', isSerialized: false, authorizedQty: 0 },
  { name: 'ציפית מודולרי לקרמי', category: 'GEAR', isSerialized: false, authorizedQty: 0 },
  { name: 'ציפית חשמונאי לקרמי', category: 'GEAR', isSerialized: false, authorizedQty: 0 },
  { name: 'חופית', category: 'GEAR', isSerialized: false, authorizedQty: 0 },
  { name: 'שק שינה נייקו', category: 'GEAR', isSerialized: false, authorizedQty: 0 },
  { name: 'יראור - מחירון', category: 'GEAR', catalogNo: '100086263', isSerialized: false, authorizedQty: 0 },
];

/** Unit prices from `מחירון פריטים`, keyed by item name. */
export const GEAR_PRICES: Record<string, number> = {
  'מעיל מרופד זית (דגם 2) מ"ג': 172,
  'חולצת דגמ"ח מ"ק': 68,
  'מכנס דגמ"ח מ"ק': 68,
  'חגורת עבודה ש"כ זית ארוכה': 18.91,
  'כובע עבודה רחב שוליים': 17,
  'משפקי מגן בליסטיים פתוחים מ.ק': 196.14,
  "אפוד מגן נגד רסיסים דור ב'": 1846.13,
  'מימיה עיסית': 7.58,
  'קסדה קבלר מידה ק מוסבת': 499.94,
  "מנשא ציוד 89 ל' א.נ ירוק 483": 1027,
  'מערכת גב מנשא ציוד כללי דור א': 912.98,
  'וסט לוחם': 679.74,
  'ווסט לוחם א.נ': 794,
  'וסט צלף': 632.38,
  'ווסט נגב א.נ': 583,
  'ווסט מטול א.נ': 719,
  'ווסט תד"ל א.נ': 181.4,
  'ארגז ביטחון - מתכת': 433,
  'אלונקת שכ- מתקפלת': 220.01,
  'שק שינה דגמ"ח עם שמשונית': 326,
  'ווסט לחובש': 625.94,
  'רשת הסוואה 2*3': 331.19,
  'מצפנת הסוואה זורו דגם אנט': 89.05,
  'נעל ח"יר שחורה': 306.23,
  'טרמוקן 40 ליטר': 425.14,
  'שולחן מתקפל פלסטיק': 172.14,
  'יראור - מחירון': 471.55,
  'תיבת יראור': 43.46,
  'מתאם יראור': 18.18,
  'מתאם לM-16': 76,
  אלן: 3,
  'מגני בירכיים - עודפים': 75.02,
  "ברכיות נינג'ה": 75.02,
  'ברכיות רובוקופ': 48,
  'קסדה רב"ש': 1135.53,
  'קסדה קלה': 1779,
  'פלטה קדמית לקרמי': 815.36,
  'פלטה אחורית לקרמי': 1816.31,
  'ווסט מודולרי': 934.31,
  'ציפית מודולרי לקרמי': 450.22,
  'ציפית חשמונאי לקרמי': 419.87,
  חופית: 611.39,
  'שק שינה נייקו': 295.89,
};

/** `הקצאות` sheet — allocation targets per item × company. */
export const ALLOCATIONS: Record<string, Record<string, number>> = {
  'M-4': { A: 82, B: 66, C: 85, SUPPORT: 89, HQ: 16 },
  M5: { A: 60, B: 54, C: 59, SUPPORT: 58, HQ: 2 },
  מטולון: { A: 8, B: 3, C: 6, SUPPORT: 4, HQ: 2 },
  'M-4 קלע': { A: 10, B: 6, C: 12, SUPPORT: 7, HQ: 2 },
  עידו: { A: 2, B: 2, C: 2, SUPPORT: 2, HQ: 2 },
  משקפת: { A: 13, B: 12, C: 13, SUPPORT: 13, HQ: 3 },
  שחמ: { A: 12, B: 10, C: 14, SUPPORT: 11, HQ: 7 },
  נגב: { A: 2, B: 2, C: 0, SUPPORT: 0, HQ: 0 },
  'ציין לייזר': { A: 8, B: 7, C: 8, SUPPORT: 8, HQ: 0 },
  'מטל מפקד': { A: 2, B: 2, C: 1, SUPPORT: 4, HQ: 1 },
  מאג: { A: 0, B: 0, C: 4, SUPPORT: 0, HQ: 1 },
  מפרו: { A: 22, B: 11, C: 24, SUPPORT: 28, HQ: 11 },
  מכפל: { A: 5, B: 5, C: 5, SUPPORT: 5, HQ: 4 },
};

/** Logistics team roster from `יציאות.xlsx`. */
export const TEAM: { nickname: string; gender: 'M' | 'F' }[] = [
  { nickname: 'שונם', gender: 'M' },
  { nickname: 'קמרן', gender: 'M' },
  { nickname: 'סנטינו', gender: 'M' },
  { nickname: 'אפי', gender: 'M' },
  { nickname: 'מתן', gender: 'M' },
  { nickname: 'פבל', gender: 'M' },
  { nickname: 'לינור', gender: 'F' },
  { nickname: 'תמר', gender: 'F' },
  { nickname: 'שגיא', gender: 'M' },
  { nickname: 'עומר', gender: 'M' },
  { nickname: 'רון', gender: 'M' },
  { nickname: 'מור', gender: 'F' },
  { nickname: 'שיר', gender: 'F' },
  { nickname: 'נטלי', gender: 'F' },
  { nickname: 'ויקטור', gender: 'M' },
  { nickname: 'דרור', gender: 'M' },
  { nickname: 'נועם', gender: 'M' },
];
