# feat: editable item kits (ערכות)

What rides along into the 1008 basket when an item is issued (M-4 → 5 מחסניות, מק פורק, רצועה, 3 מתפסים…) used to be hardcoded in `issue-bundle-rules.ts`. An admin now builds and edits those kits in the app.

## Model
- **Kit ≠ allocation.** Allocation says what a soldier is entitled to (מטולון, a scope): it lives in חלוקה לפי חייל and shows in his entitlement list. A kit is only what *always goes out together* with an item, so the operator doesn't add each piece by hand (M-4 + 3 מתפסים + רצועה + 5 מחסניות + מק פורק; מטולון + M-203). Optics are not kit.
- `ItemKit` — one per base item. `ItemKitLine` — an item and a quantity (1–99), nothing else. Lines point at items by id, so renaming an item cannot break a kit.
- One kit per item, no sharing between kits. Any catalog item can be a base (a drone with its controller, a radio with its battery).
- A line that is itself the base of a kit brings that kit along (מטולון → M-203, which replaces the old hardcoded pairing). Quantities multiply down the chain, repeated items merge, depth is capped at 3, and a loop is refused on save. The check runs from every kit, not only the one being saved, because a kit added under an existing chain deepens everything above it.
- `item_kit_changes` — append-only (DB trigger, like `movements`): who, when, the lines before and after. Shown in a history section on the ערכות page.

## Behavior
- `GET /issue-bundle?itemName=` returns the expanded kit; `/item-pairings` is gone (it was the same thing). Every add path in the issue basket (search or entitlement list) pulls the kit, and the operator can still edit or remove any line before signing. **Behavior change:** adding a rifle no longer auto-adds the optics the soldier is allocated; they stay as rows in his entitlement list.
- An item in any kit cannot be deleted or deactivated until it is removed from those kits (the message names them). Deleting a base item takes its kit along and logs it.
- Kits only affect what is pre-filled for the next 1008. Signed forms, signatures and movements are untouched.
- Admin only. The whole kit is edited as a draft and saved in one step ("שמירה"), one history entry per save; a save that changes nothing writes none.
- The migration seeds the old always-together rules by exact item name (the optional optics are not seeded; a name with no catalog match is skipped and logged with a NOTICE) and writes a "מערכת" history entry per kit. `issue-bundle-rules.ts` is deleted, so there is one source of truth.

## Tests
`kit-graph.spec.ts` (expansion, loops, depth), `item-kits.e2e.spec.ts` (access, validation, loops, depth, what a kit pre-fills, history and its append-only trigger, the delete/deactivate guards), `KitsPage.test.tsx`, and the browser flow `apps/web/e2e/flows-kits.mjs`.

## Also in this PR: search that runs by itself
`SearchField` now searches when typing pauses (350 ms), or at once on Enter or the button; it never searches for text that is already the committed search, and it keeps a trailing space while a second word is typed. Filters that run in the browser (ערכות, מיפוי שמות) pass `debounceMs={0}` and follow every key. Tables that reload from the server (חיילים, חתימות, אפסון) dim and show a loading status while a new search runs (`Panel busy` / `Refreshing` in `ui.tsx`), instead of leaving stale rows looking final.
