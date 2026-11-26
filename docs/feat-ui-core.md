# feat/ui-core — shared controls in the liquid-glass language

Stacked on `feat/liquid-nav` (#80): it reuses the nav's palette, lit top edges, spring easing and larger radii, so the content area and the rail read as one design. All changes are in shared components, so every screen picks them up.

- **Canvas:** the page background gets a faint green/navy/brass wash (`.app-canvas`) instead of flat grey, so glass surfaces have something to sit on.
- **Radii:** `rounded-ctl` 4px → 10px, `rounded-panel` 8px → 16px (matches the nav's rounded items).
- **Panel:** `.glass-card` — lit top edge, hairline ring, soft green-tinted depth; the title bar fades from a green wash.
- **Modal:** blurred backdrop, spring-in sheet; `!m-0` fixes a page's `space-y-*` margin pushing the fixed backdrop down 20px and leaving a strip uncovered.
- **Buttons:** primary/danger are lit gradients with a coloured glow; quiet is a glass chip. Springier press.
- **Inputs (`TextField`, `Select`, `SearchField`):** a soft halo on focus instead of a hard ring; a refused value shakes once.
- **Tabs:** the active tab gets a faint brass wash and glow under its underline.
- **Reduced motion:** modal, shake and the rest are off under `prefers-reduced-motion`.

No behaviour changes.
