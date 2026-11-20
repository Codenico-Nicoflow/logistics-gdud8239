# feat/nav-counts-link — link ספירת נשקיה into the nav

The daily ספירה screen (`/counts`, the feature added in `feat/daily-summary-sheet`)
was fully built and reachable by direct URL but never linked from `Shell.tsx`'s nav —
same "trimmed on purpose, not abandoned" situation the file's own comment describes
for the other unlinked screens. The user couldn't find it in the UI at all.

## What changed

- Added `CountsIcon` and a `/counts` nav item (admin/logistics only, matching the
  route's own role gate in `App.tsx`) to the main nav group in `Shell.tsx`.
