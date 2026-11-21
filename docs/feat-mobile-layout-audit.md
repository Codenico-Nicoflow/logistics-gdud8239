# Mobile layout audit

Full phone pass over every screen. Triggered by cropped tables (catalog) and sideways scrolling on an iPhone Pro Max.

## What changed
- **Global:** `viewport-fit=cover`, safe-area padding, `overflow-x: clip` safety net, 16px inputs on phones (iOS zooms the page on smaller inputs), no number spinners, no tap highlight.
- **Shared:** `Modal` scrolls within the viewport (`dvh`) and respects safe areas; menu is a full-screen overlay with scroll lock and Escape.
- **Tables to cards below `sm:`:** soldiers, catalog, users, summary, company allocation grid, naming map, catalog serial-number dialog. Desktop tables unchanged.
- **ימי יציאה:** day-first phone view (week strip with counts, one day's roster, 44px status cells); team management folded into a collapsible.
- **חתימות:** phone shows list, then soldier details with a back button, instead of details far below the list.
- **ניפוק:** basket serial chips, remove and change-soldier links are 40px+ tap targets.
- Service-period dialogs use the shared `Modal`.

## How it was checked
`apps/web/mobile-audit/audit.mjs` drives WebKit (iPhone profile) at 320, 360, 375, 390, 430, 440 px across every route, dialogs and multi-step flows (issue basket, item picker, soldier details, edit dialogs). It fails on page overflow or any inner sideways-scroll area, and reports small tap targets and sub-16px inputs. Last run: 39 screens, 0 failures.

Run: `cd apps/web && node mobile-audit/audit.mjs --creds <file> --out <dir>`. Needs a local dev DB; `apps/api/scripts/mobile-audit-user.ts create|delete` makes a throwaway admin and refuses non-local databases.
