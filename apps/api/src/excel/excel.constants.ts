import { Company, ItemCategory, MovementAction } from '@prisma/client';

/**
 * Hebrew labels for export. The API speaks enum keys, but the workbook must
 * read exactly like the original file, so the labels live here.
 */
export const COMPANY_HE: Record<Company, string> = {
  A: 'א',
  B: 'ב',
  C: 'ג',
  SUPPORT: 'מסייעת',
  HQ: 'מפקדה',
};

/** Reverse lookup for import. */
export const COMPANY_FROM_HE: Record<string, Company> = Object.fromEntries(
  Object.entries(COMPANY_HE).map(([key, he]) => [he, key as Company]),
) as Record<string, Company>;

export const ACTION_HE: Record<MovementAction, string> = {
  ISSUE: 'ניפוק',
  RETURN: 'זיכוי',
};

export const CATEGORY_HE: Record<ItemCategory, string> = {
  WEAPON: 'נשק',
  OPTICS: 'אופטיקה',
  DRONE: 'רחפן',
  GEAR: 'ציוד',
};

/** Company column order, as the original sheets lay them out. */
export const COMPANY_ORDER: Company[] = ['A', 'B', 'C', 'SUPPORT', 'HQ'];

/** Sheet names, matching the source workbook exactly. */
export const SHEET = {
  signatures: 'צלמ',
  summary: 'מסכם',
  companies: 'פלוגות',
  allocations: 'הקצאות',
  count: 'ספירת נשקיה',
  weaponNames: ' רשימת שמות נשק',
  priceList: 'מחירון פריטים',
  movements: 'דוח תנועות',
  issues: 'דרוש טיפול',
} as const;

/** `צלמ` header row, in the original column order. */
export const SIGNATURES_HEADER = [
  'סוג',
  'מסד',
  'שם',
  'שם משפחה',
  ' פלוגה',
  'טלפון',
  'מ.א.',
  'קבלה',
  'הערה',
  'מחלקה',
] as const;
