import type { Prisma } from '@prisma/client';

/**
 * The one order items appear in on every screen and sheet that lists them —
 * the catalog, מסכם, ספירת נשקיה, חלוקה לפלוגות and the Excel files. Grouped
 * by category (weapons first, as the enum declares them), then by name, so
 * walking the armory shelf and reading the screen go in the same order.
 */
export const ITEM_ORDER: Prisma.ItemOrderByWithRelationInput[] = [
  { category: 'asc' },
  { name: 'asc' },
];
