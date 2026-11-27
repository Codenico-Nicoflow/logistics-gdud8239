# Multi-tenant step 5: optional modules

A battalion's super admin switches three optional parts on or off on מערכת ← מודולים:

| Module | What goes away when it is off |
|---|---|
| חלוקה לפלוגות (`companySplit`) | the allocation grid, per-soldier allocation, the חלוקה לפלוגות report tab, the ניפוק entitlement list and over-allocation warning, two Excel sheets |
| ימי יציאה (`attendance`) | the screen, the API, the Thursday Slack job, the Excel sheet |
| ערכות (`kits`) | the screen and API; ניפוק gets no riding-along lines |

Everything else is core and always on.

## How it works

- Stored as `app_settings` rows `module.<id>` = `true`/`false`, per battalion. **No row means ON**, so 8239 and any
  battalion that existed before this change keep everything. `create_battalion` (migration `20261201100000`) inserts
  three `false` rows, so a newly created battalion starts as the empty skeleton.
- `apps/api/src/modules/module-manifest.ts` is the single list, with a `requires` field per module. Switching a module
  on while something it needs is off, or off while an enabled module needs it, is refused (tested with a fake manifest;
  no real module depends on another yet).
- Server: `@RequireModule('id')` on a controller or route, enforced by the global `ModulesGuard` (403). Reads that
  ניפוק makes on every soldier or line (`entitlement`, `issue-bundle`) return `[]` instead of failing. The weekly job and
  the Excel export check the flag per battalion.
- Web: `useModules()`; `navConfig` tabs carry `module` and `superAdminOnly`; `Viewer` now carries `modules` and
  `canChangeModules`. A role whose landing screen is switched off falls back to אבטחה instead of redirect-looping.
- Turning a module off deletes nothing; turning it on restores it. Each change is a `MODULE_CHANGED` security event.

## Known gaps

- Deactivating a catalog item that sits in a hidden kit is still blocked by that kit.
- The permission matrix and the roles SAMGAD / COMPANY_CMDR stay visible in the users screen with companySplit off.
