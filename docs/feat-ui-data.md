# feat/ui-data — tables, chips and states in the liquid-glass language

Stacked on `feat/ui-core` (#81), which is stacked on `feat/liquid-nav` (#80). Shared components only, so every screen picks it up.

- **Tables:** one header rule, a faint hairline between rows and no per-row outlines; the pointer lights a row as a soft rounded tint with a bar on its leading edge. `SortableTh` is now a shared component, so sortable headers match plain ones (the soldiers page used to carry its own old-styled copy).
- **Chips (`Tag`, `CategoryTag`):** a lit top edge, like the nav's glass tiles.
- **`Figure`:** glass card, glowing gradient top bar, and the number rolls to its new value when it changes (never on first paint, and not under reduced motion).
- **Spinner:** a droplet of light travelling a ring. **Empty states:** a dashed glass panel with a floating orb. **`Skeleton`:** new shimmer placeholder rows, ready to use where a spinner replaced a table.
- **Focus fixes (in ui-core, merged here):** a focused input keeps its own corner radius (a global `:focus-visible` rule used to force 2px), and shows one border plus a soft halo instead of stacked outlines.

No behaviour changes.
