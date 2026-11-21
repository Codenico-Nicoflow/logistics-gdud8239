import type { ItemCategory } from '@prisma/client';

/**
 * Only the items worth the shelf space and the paperwork. Slings, magazines,
 * cleaning kits and the like are stripped off the weapon and stay with the
 * soldier — they are ACCESSORY/GEAR/AMMO, never counted in the ספירה anyway.
 */
export const IFSUN_CATEGORIES: readonly ItemCategory[] = ['WEAPON', 'OPTICS', 'DRONE'];
