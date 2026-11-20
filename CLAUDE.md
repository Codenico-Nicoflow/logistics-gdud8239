# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Hebrew RTL logistics app for IDF battalion גדוד 8239, replacing manual Excel tracking of armory (נשקיה) weapon/equipment signatures and the reserve-duty (תקופת שרות) call-up workflow. Every signature, movement, and allocation is auditable in a real database instead of hand-maintained spreadsheets.

## Stack & structure

npm workspaces monorepo (`apps/api`, `apps/web`), no other monorepo tool.

- **apps/api** — NestJS 12.3.2, Prisma 7.10.1 (`prisma.config.ts` + `@prisma/adapter-pg`, not the classic `datasource url` field), PostgreSQL 16 in Docker. TypeScript strict, Vitest.
- **apps/web** — React 19, Vite 6, RTK Query, React Router 7, Tailwind (RTL), react-hook-form + zod. TypeScript strict, Vitest.

## Running locally

```bash
npm run db:up          # docker compose up -d postgres (port 5433, container logistics-db)
npm run migrate        # prisma migrate dev (apps/api)
npm run seed           # tsx prisma/seed.ts (apps/api)
npm run dev            # starts both api (nest start --watch) and web (vite) concurrently
# or individually:
npm run dev:api
npm run dev:web
```

`apps/api/.env` has `DATABASE_URL="postgresql://logistics:logistics_dev@localhost:5433/logistics?schema=public"`, JWT secrets, `PORT=3000`, `WEB_ORIGIN="http://localhost:5173"`. Web dev server is on 5173.

## Testing & typecheck

```bash
cd apps/api && npx vitest run              # 67/67 passing as of last check
cd apps/api && npx tsc --noEmit -p tsconfig.json
cd apps/web && npx tsc --noEmit -p tsconfig.json
```

Run both typechecks and the API test suite after any backend change touching `items`, `signatures`, or `intake` — they share the authorizedQty invariant below.

## Key architectural invariants

**מצבה (authorizedQty) is derived, not typed, for serialized items.** For any `Item` with `isSerialized: true`, `authorizedQty` must always equal `COUNT(item_instances)` for that item — it is never a number an admin types in. The shared helper `apps/api/src/items/sync-authorized-qty.ts` (`syncAuthorizedQty(tx, itemId)`) recalculates and persists this; it's called from `intake.service.ts` (after creating serials), `items.service.ts` (`addInstance`/`removeInstance`), and `signatures.service.ts` (when an unknown serial is auto-registered during an issue). `items.service.ts#update` also silently drops any `authorizedQty` in a PATCH body when the item is/becomes serialized, so a stale client can't desync it again. Bulk (non-serialized) items are untouched by this — their `authorizedQty` is the only record of quantity and is freely editable.

In the UI (`apps/web/src/features/catalog/CatalogPage.tsx`), the edit-item dialog shows מצבה as read-only text + a "נהל מסדים" link for serialized items, instead of an input. All adding/removing of מסדים happens through the `InstancesDialog` (opened via the catalog row's מסדים button or that link), including a confirm-before-delete dialog — removing a מסד held by an open signature is blocked server-side with a 409 naming the holder.

**Append-only audit tables, enforced at the DB level**, not just by omitting routes: `movements` (migration `20261104083100_signature_invariants`) and `issue_forms` (migration `20261109150000_issue_forms_and_accessories`) both have `BEFORE UPDATE OR DELETE` triggers that `RAISE EXCEPTION`. No update/delete endpoint exists for either, and none should ever be added.

**One active holder per serialized instance**: a partial unique index backs `signatures(item_instance_id) WHERE returned_at IS NULL`, so a מסד cannot be double-issued even under a race.

**Role/permission system — mid-migration, not fully rolled out.** There are two parallel mechanisms right now:
- The older `@Roles('admin' | 'logistics' | 'viewer')` decorator + guard (`apps/api/src/auth/decorators/roles.decorator.ts`), a fixed role list hardcoded per route. Still used by: `items`, `signatures`, `intake`, `counts`, `attendance`, `excel`, `issue-forms`, `snapshots`, `users`.
- The newer `@RequirePermission(key, level, alsoAllow?)` decorator + `PermissionsGuard` (`apps/api/src/auth/decorators/permission.decorator.ts`, `apps/api/src/auth/guards/permissions.guard.ts`), backed by an editable `RolePermission` DB table (role × key → NONE/READ/WRITE). `admin` always bypasses the matrix. Only wired into `allocations` and `soldiers` controllers so far.
- The `Role` enum also now includes three new reserve-duty roles beyond admin/logistics/viewer: `SHLISHUT` (שלישות, חיילים CRUD), `SAMGAD` (סמג"ד, sets the battalion-wide cap), `COMPANY_CMDR` (מ"פ, assigns within their company). These only make sense under the permission-matrix system, not the old fixed `@Roles` lists.
- If asked to add a new protected route or extend permissions, prefer `@RequirePermission` over `@Roles` and migrate the controller you're touching rather than mixing both on the same route.

**No `any` type, anywhere in this codebase.** Hard requirement, not a style preference — treat a surfaced `any` as a bug to fix, not tech debt to leave.

**ניפוק must always warn before handing out a weapon beyond its company's allocation.** When adding a `WEAPON`-category item to the basket in `BasketStep.tsx`, if the soldier's company has no quantity left under the active תקופת שרות's חלוקה לפלוגות (`CompanyAllocationGrid`'s plan, via `remaining[company]` from `GET /service-periods/:id/company-allocations`), a confirmation dialog must appear before the line is actually added — never add it silently. This is a soft gate (the samgad's plan can be wrong or stale), not a hard block like the בפועל cap in `AllocationsService`, so the dialog lets the operator proceed on purpose. Keep this working for every future change to the issue flow or the allocation model — it is a standing product requirement, not a one-off feature.

## Current nav/feature scope

`apps/web/src/app/Shell.tsx` nav is intentionally trimmed to: ניפוק, הקצאה לתקופת שרות (service periods), חיילים (soldiers), and an admin-only "ניהול" group (קטלוג פריטים, קליטת ציוד מימ"ח, מיפוי שמות). This is a deliberate simplification while the modern reserve-duty workflow is rebuilt — it is not a sign those other features are abandoned.

Many more screens exist in the code and are fully routed in `apps/web/src/app/App.tsx` but not linked from the nav: דוח תנועות (movements), ספירת נשקיה (counts), מסכם/פלוגות/הקצאות reports, ימי יציאה (attendance), גיבויים (backups/Excel import-export), משתמשים (users), חתימות (signatures list), דרוש טיפול (attention/needs-attention). They're reachable by direct URL for admins/logistics as role allows. Don't assume "not in the nav" means "remove it" — ask before deleting any of these.

## Conventions

- All Hebrew UI strings live in `apps/web/src/i18n/he.ts` — never hardcode a string in a component.
- Comments explain WHY (a constraint, an invariant, a deliberate non-obvious choice), never WHAT the code does — this is the established style throughout both apps' source, not just a preference going forward.
- One-off DB inspection/fix scripts during development go in `apps/api/` as `*.tmp.ts` (using `PrismaClient` + `PrismaPg` adapter + `process.env.DATABASE_URL`, run via `npx tsx <file>.tmp.ts`) and **must be deleted immediately after use** — never commit one.
- `item.aliases` (`String[]` on `Item`) is also where the מיפוי שמות screen's name-mapping lives — no separate aliases table.
- **Every screen must be mobile-usable.** This app runs on phones in the field, not just desks. No horizontal scrolling on data-entry screens — if a table has too many columns for a phone, render it twice: `<table>` wrapped in `hidden sm:block`, plus a parallel `<ul className="... sm:hidden">` of card components below `sm:`, reusing the same field sub-components so business logic isn't duplicated between the two renders (see `apps/web/src/features/intake/IntakePage.tsx` for the reference pattern). Read-only report tables may keep `overflow-x-auto` scroll since they're not being typed into. All shared controls (`Button`, `TextField`, `Select`, `SearchField` in `apps/web/src/components/ui.tsx`) use explicit `h-10`/`h-11` heights for touch targets and must stay visually consistent — don't add one-off padding/sizing overrides on individual pages; fix the shared component instead.
