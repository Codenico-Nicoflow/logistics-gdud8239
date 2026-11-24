# feat/nav-hubs — fewer rail items, tabs inside

The side rail had ~21 flat links. It is now one entry per **hub**; related screens are tabs inside the hub.

| Rail entry | Tabs |
|---|---|
| ניפוק וחתימות `/issue` | ניפוק · חתימות `/issue/documents` · אפסון `/issue/ifsun` |
| תקופת שרות `/periods` | הקצאה לתקופת שרות · חלוקה לפי חייל `/periods/by-soldier` |
| חיילים `/soldiers` | — |
| דוחות `/reports` | מסכם · חלוקה לפלוגות `/reports/companies` · ספירת נשקיה `/reports/counts` · דוח תנועות `/reports/movements` |
| ציוד (admin) `/equipment` | קטלוג · קליטת ציוד `/intake` · ערכות `/kits` · מיפוי שמות `/naming` |
| מערכת (admin) `/system` | משתמשים · גיבויים `/system/backups` |
| ימי יציאה `/attendance` (under ניהול) | — admin manages it, logistics views; unrelated to the issuing work, so it sits with ניהול, not under חיילים |
| החשבון שלי | מדריך · אבטחה |

## Why it is built this way
- `apps/web/src/app/navConfig.ts` is the **only** place that lists screens, grouping and roles. Before, the rail (`Shell.tsx`) and the router (`App.tsx`) each had their own role lists. Both now derive from it.
- A tab shows only if the role may open it; a hub shows only if at least one of its tabs is allowed; the rail link goes to the first allowed tab. A hub with a single allowed tab (a viewer in ניפוק וחתימות, a סמג"ד in דוחות) shows no tab bar. Tabs a role may not open get no route at all, so typing the address lands on the role's default screen, same as before.
- `TabBar` lives in `components/ui.tsx` (shared control, `h-11` touch targets, scrolls sideways on a phone — it is navigation, not data entry).
- Old addresses (`/documents`, `/summary`, `/kits`, …) redirect to the new ones with router `state` preserved (`LEGACY_REDIRECTS`). Code that links to a screen uses `addressOf(tabId)` instead of a string.
- No API or database change; no screen's behavior changed.

## Adding a screen
Add a tab (or hub) to `HUBS` in `navConfig.ts` with its roles, add its element in `screenFor` in `App.tsx`, add a guide topic. The guide test fails if a screen has no topic.
