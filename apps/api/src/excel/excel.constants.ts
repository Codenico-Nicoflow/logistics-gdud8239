import { Company, ItemCategory } from '@prisma/client';

/** Hebrew labels for the workbook — the API speaks enum keys. */
export const COMPANY_HE: Record<Company, string> = {
  A: 'א',
  B: 'ב',
  C: 'ג',
  SUPPORT: 'מסייעת',
  HQ: 'מפקדה',
};

export const CATEGORY_HE: Record<ItemCategory, string> = {
  WEAPON: 'נשק',
  OPTICS: 'אופטיקה',
  DRONE: 'רחפן',
  ACCESSORY: 'אבזור',
  GEAR: 'ציוד',
  AMMO: 'תחמושת',
};

/** Company order, as the pages lay them out. */
export const COMPANY_ORDER: Company[] = ['A', 'B', 'C', 'SUPPORT', 'HQ'];
