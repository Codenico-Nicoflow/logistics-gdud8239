# feat/liquid-nav — liquid-glass navigation

The rail (desktop) and the menu (phone) are restyled as frosted glass over slowly drifting coloured light.

- **Droplet highlight:** the active-hub highlight is a glass droplet. It travels between entries with an overshooting spring, squashes and stretches along the move, and settles. It takes the active hub's hue and has a slow sheen across it.
- **Per-hub colour:** every hub has its own hue (`HUB_HUES` in `Shell.tsx`, visual only). Icon tiles are tinted glass, light up when active, and pop on hover. A specular spot follows the pointer across the entry.
- **Backdrop:** a deep green/navy pool with three blurred blobs drifting under the glass. Only `transform` is animated.
- **Phone:** a frosted, nearly opaque top bar, a round glass toggle, and the menu pours out from the toggle (`clip-path` reveal).
- **Reduced motion:** blobs, sheen, squash and reveal are off under `prefers-reduced-motion`.
- Also brings in the earlier logo/rail restyle (#74), which was merged into the already-merged `feat/nav-hubs` branch and so never reached main.

No routing, role or behaviour changes. Position classes on `<nav>` are deliberate: `relative` and `fixed` conflict in Tailwind, so `relative` only applies from `lg:` and when closed.
