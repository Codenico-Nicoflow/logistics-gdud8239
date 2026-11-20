/**
 * ניפוק bundle rules — what rides along automatically when a personal weapon
 * goes into the 1008 basket. Keyed by the catalog's own `Item.name`, never a
 * guessed id, so a rename in the catalog breaks this loudly (missing match)
 * instead of silently issuing nothing.
 *
 * Two kinds of line:
 * - `always`: added whenever the base item is added, no eligibility check
 *   (מחסניות, מק פורק, רצועה — every M-4/M-16 soldier gets these).
 * - `ifEligible`: added only if the soldier has a nonzero SoldierAllocation
 *   for that accessory in the active period (מטולון, מכפל, שחמ, etc.) —
 *   that's his סגן מפקד פלוגה saying he's actually getting one, not just
 *   that the item exists in the catalog.
 */
export type BundleLine = { itemName: string; quantity: number };

export type BundleRule = {
  /** Personal weapons this rule attaches to, matched on `Item.name` exactly. */
  baseItemNames: string[];
  always: BundleLine[];
  ifEligible: BundleLine[];
};

export const PERSONAL_WEAPON_NAMES = ['M-4', 'M-16', 'M-4 קלע', 'M-4 קלע סער'] as const;

// The non-optional load every personal rifle gets, before its own מתפסים
// count (which differs per variant — see each rule below) and דורגלים
// (קלע סער only).
const BASE_ALWAYS: BundleLine[] = [
  { itemName: 'מחסנית', quantity: 5 },
  { itemName: 'מק פורק', quantity: 1 },
  { itemName: 'רצועה', quantity: 1 },
];

// M-203 is deliberately never listed in any `ifEligible` below — it's never
// conditioned on eligibility of its own, it rides along with מטולון via
// `ITEM_PAIRINGS` whenever מטולון itself is added.
const STANDARD_OPTICS: BundleLine[] = [
  { itemName: 'מטולון', quantity: 1 },
  { itemName: 'מכפל', quantity: 1 },
  { itemName: 'שחמ', quantity: 1 },
  { itemName: 'שחע', quantity: 1 },
  { itemName: 'ציין לייזר', quantity: 1 },
  { itemName: 'עכבר', quantity: 1 },
  { itemName: 'עידו', quantity: 1 },
  { itemName: 'משקפת', quantity: 1 },
  { itemName: 'מצפן', quantity: 1 },
];

const KALA_OPTICS: BundleLine[] = [
  { itemName: 'מטולון', quantity: 1 },
  { itemName: 'מכפל', quantity: 1 },
  { itemName: "טריג'יקון", quantity: 1 },
  { itemName: 'אקילה X4', quantity: 1 },
  { itemName: 'שחמ', quantity: 1 },
  { itemName: 'שחע', quantity: 1 },
  { itemName: 'ציין לייזר', quantity: 1 },
  { itemName: 'עכבר', quantity: 1 },
  { itemName: 'עידו', quantity: 1 },
  { itemName: 'משקפת', quantity: 1 },
  { itemName: 'מצפן', quantity: 1 },
];

export const ISSUE_BUNDLE_RULES: BundleRule[] = [
  // M-4: 3 מתפסים.
  {
    baseItemNames: ['M-4'],
    always: [...BASE_ALWAYS, { itemName: 'מתפסים', quantity: 3 }],
    ifEligible: STANDARD_OPTICS,
  },
  // M-16: no מתפסים at all.
  {
    baseItemNames: ['M-16'],
    always: BASE_ALWAYS,
    ifEligible: STANDARD_OPTICS,
  },
  // M-4 קלע: 2 מתפסים.
  {
    baseItemNames: ['M-4 קלע'],
    always: [...BASE_ALWAYS, { itemName: 'מתפסים', quantity: 2 }, { itemName: 'דורגלים', quantity: 1 }],
    ifEligible: KALA_OPTICS,
  },
  // M-4 קלע סער: no מתפסים at all, same as M-16.
  {
    baseItemNames: ['M-4 קלע סער'],
    always: [...BASE_ALWAYS, { itemName: 'דורגלים', quantity: 1 }],
    ifEligible: KALA_OPTICS,
  },
  // נגב always comes with its own spare barrel.
  {
    baseItemNames: ['נגב'],
    always: [{ itemName: 'קנה ספייר לנגב', quantity: 1 }],
    ifEligible: [],
  },
];

export function bundleRuleFor(baseItemName: string): BundleRule | null {
  return ISSUE_BUNDLE_RULES.find((r) => r.baseItemNames.includes(baseItemName)) ?? null;
}

/**
 * Hard item pairings — unlike `ifEligible` above, these aren't conditioned on
 * a separate SoldierAllocation row for the paired item; the trigger item
 * itself is the only signal needed. Right now this is just מטולון→M-203:
 * מטולון is the launcher body (not serialized), M-203 is the attachment that
 * actually requires a מסד, and the battalion treats them as one indivisible
 * pair — if a soldier is getting a מטולון he is getting the M-203 with it,
 * full stop, regardless of whether anyone separately ticked M-203 in his
 * חלוקה לפי חייל. Applies whenever מטולון is added, from any path: the
 * weapon-bundle expansion, the entitlement pick-list, or a manual add.
 */
export const ITEM_PAIRINGS: Record<string, BundleLine[]> = {
  מטולון: [{ itemName: 'M-203', quantity: 1 }],
};

export function pairingsFor(itemName: string): BundleLine[] {
  return ITEM_PAIRINGS[itemName] ?? [];
}
