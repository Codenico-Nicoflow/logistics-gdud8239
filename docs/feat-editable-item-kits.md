# feat: editable item kits (ערכות)

What rides along into the 1008 basket when an item is issued (M-4 → 5 מחסניות, מק פורק, רצועה, 3 מתפסים…) used to be hardcoded in `issue-bundle-rules.ts`. An admin now builds and edits those kits in the app.

## Model
- `ItemKit` — one per base item. `ItemKitLine` — an item, a quantity (1–99) and a mode: `ALWAYS`, or `IF_ALLOCATED` (only when the soldier has a nonzero allocation for it in the active תקופת שרות). Lines point at items by id, so renaming an item cannot break a kit.
- One kit per item, no sharing between kits. Any catalog item can be a base (a drone with its controller, a radio with its battery).
- A line that is itself the base of a kit brings that kit along (מטולון → M-203, which replaces the old hardcoded pairing). Quantities multiply down the chain, repeated items merge, depth is capped at 3, and a loop is refused on save. The check runs from every kit, not only the one being saved, because a kit added under an existing chain deepens everything above it.
- `item_kit_changes` — append-only (DB trigger, like `movements`): who, when, the lines before and after. Shown in a history section on the ערכות page.

## Behavior
- `/issue-bundle` and `/item-pairings` keep their contract; both now read the kits. The issue screen is unchanged. "Always only" (entitlement pick-list) takes the ALWAYS lines, still expanding nested ones.
- An item in any kit cannot be deleted or deactivated until it is removed from those kits (the message names them). Deleting a base item takes its kit along and logs it.
- Kits only affect what is pre-filled for the next 1008. Signed forms, signatures and movements are untouched.
- Admin only. The whole kit is edited as a draft and saved in one step ("שמירה"), one history entry per save; a save that changes nothing writes none.
- The migration seeds the old rules by exact item name (a name with no catalog match is skipped and logged with a NOTICE) and writes a "מערכת" history entry per kit. `issue-bundle-rules.ts` is deleted, so there is one source of truth.

## Tests
`kit-graph.spec.ts` (expansion, loops, depth), `item-kits.e2e.spec.ts` (access, validation, loops, depth, what a kit pre-fills, history and its append-only trigger, the delete/deactivate guards), `KitsPage.test.tsx`, and the browser flow `apps/web/e2e/flows-kits.mjs`.
