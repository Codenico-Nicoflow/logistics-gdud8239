# חלוקה לפי חייל — soldier × item matrix

**What:** `/company-allocation` was one item at a time (a Select) with a vertical list of soldiers and +/- steppers. It is now a single table: a row per soldier, a column per item the samgad allocated to the company, a count in each cell, one שמור for everything.

**Why:** with many items the operator had to switch item and save repeatedly. The matrix lets a company commander fill a whole company in one pass.

**How:**
- Frontend only (`SoldierAllocationGrid.tsx`). Same endpoints; the per-soldier-per-item POST is unchanged.
- Every cell is a checkbox (0 or 1): at most one of each item per soldier. A pre-existing quantity above 1 shows as ticked and is left alone unless the box is toggled.
- New shared `Checkbox` in `components/ui.tsx` replaces the native checkboxes app-wide: 24px white-faced box with a strong border, solid green + self-drawing tick when on, 44px tap target, focus ring, reduced-motion safe.
- Edits are held as an overlay on server values; dirty = differs from server.
- The cap is checked per column on the client (save disabled, offending items named); the server stays the authority.
- Saves send only changed cells, decreases first, because the server checks the cap one soldier at a time — a swap of the last unit would otherwise 409 mid-batch.
- Mobile: the table is `hidden sm:block`; below `sm:` each soldier is a card listing the items, using the same `AllocationCell`.
