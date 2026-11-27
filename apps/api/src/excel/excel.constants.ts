import { ItemCategory } from '@prisma/client';

export const CATEGORY_HE: Record<ItemCategory, string> = {
  WEAPON: 'נשק',
  OPTICS: 'אופטיקה',
  DRONE: 'רחפן',
  ACCESSORY: 'אבזור',
  GEAR: 'ציוד',
  AMMO: 'תחמושת',
};
