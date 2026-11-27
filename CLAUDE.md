# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Hebrew RTL logistics app for IDF battalion גדוד 8239, replacing manual Excel tracking of armory (נשקיה) weapon/equipment signatures and the reserve-duty (תקופת שרות) call-up workflow. Every signature, movement, and allocation is auditable in a real database instead of hand-maintained spreadsheets.

## Git workflow — hard rule

**Never commit or push directly to `master`.** Every new feature, fix, or change gets its own feature branch (`feat/...`, `fix/...`), opened as a PR into `master`. This applies from here on, no exceptions, regardless of how small the change looks.

Every feature branch also gets a short Markdown doc describing what it does and why — either a new file under `docs/` or an addition to this CLAUDE.md / the root `README.md` if it's small enough to fold in. Document as part of the branch, not as a follow-up.

## Deployment

- **apps/web** → Vercel (free/Hobby tier), deploys from `master` automatically.
- **apps/api** + Postgres → Render, via the committed `render.yaml` blueprint (not manual dashboard config — changes to build/start/env go through that file so they survive recreation and are reviewable).
- Render build: `npm install --include=dev` (prod NODE_ENV would otherwise skip devDependencies, including `@nestjs/cli`) → `prisma generate` → `nest build`.
- Render start: `prisma migrate deploy` runs on every boot before `nest start`, so schema stays in sync with whatever's on `master` automatically.
- Full DB backups (pg_dump, gzip, Slack upload) are separate from this — see `apps/api/src/db-backups/`.

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

`apps/api/.env` has `DATABASE_URL="postgresql://logistics:logistics_dev@localhost:5433/logistics?schema=public"` (the owner), `APP_DATABASE_URL` (the restricted `logistics_app` role the API runs as; give it a password once with `npm run db:app-role`), JWT secrets, `PORT=3000`, `WEB_ORIGIN="http://localhost:5173"`. Web dev server is on 5173.

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

**Every table that holds a battalion's data has `battalion_id`** (multi-tenant, see `docs/feat-mt-foundation.md`). It is `NOT NULL`, defaults in the database to `current_battalion_id()`, and is a foreign key to `battalions`. A new tenant table must add it the same way, and a uniqueness rule on user-facing data is `(battalion_id, field)`, never the field alone. 1008 numbers come from `takeFormNo()` (per-battalion counter), never from a database sequence. Migrations never `UPDATE` the append-only tables: add columns with a constant default.

**Tenant isolation is enforced by the database, not by remembering a `where`.** The API connects as the restricted role `logistics_app` (`APP_DATABASE_URL`), which is subject to row-level security on every table with `battalion_id`; `DATABASE_URL` is the owner (migrations, `pg_dump`, scripts) and the app must never use it — it refuses to boot if its role could bypass RLS. The battalion comes from the token (`JwtAuthGuard` → `bindBattalion`), is written to the connection on every checkout by `TenantPool`, and `current_battalion_id()` is `NULL` without it (reads see nothing, creates fail). A new tenant table needs `battalion_id` **and** an RLS policy (a test fails otherwise; a table with no battalion must be listed as an exception in `test/tenant-isolation.e2e.spec.ts`). Code with no request (cron, scripts) runs in `runAsBattalion` / `TenantService.forEachBattalion` / `scriptPrisma`, never "as nobody". Prisma queries are lazy: await them inside the scope. Platform-wide things (`db-backups`, the permission matrix) are `@PlatformAdminOnly()`. Slack is 8239-only until each battalion has its own config. See `docs/feat-mt-isolation.md`.

**A platform admin acts inside a battalion through a stand-in user of that battalion**, never by reading across battalions (`users.acts_for_id`, see `docs/feat-mt-platform-admin.md`). Anything that lists or counts a battalion's people must filter `actsForId: null`, or the stand-in shows up as one of them (and counts as an extra admin).

**Nothing the app shows or prints may assume one battalion.** The unit's name and number come from `BattalionService.unit()` on the API (printed pages, Excel, PDF, the MFA label) and from `useBattalionQuery()` / `<BattalionMark />` on the web, never a literal "8239". Before sign-in the screens name no battalion at all (`AuthLayout`). See `docs/feat-mt-branding.md`.

**Companies are data, per battalion — never a fixed list.** There is no `Company` enum. `companies` is a per-battalion table (`code` is the stable key, `name` is what people read and can change); `soldiers.company`, `users.company_scope` and `company_allocations.company` store the code with a composite foreign key to `(battalion_id, code)`, and the history snapshots (`companySnapshot` on `movements`, `issue_forms`, `ifsun_records`) store the code as plain text with no foreign key. The API speaks codes everywhere. Anything that needs the list (a grid column, an Excel sheet, a dropdown, a DTO check) asks `CompaniesService` on the API or `useCompanies()` on the web; never write `['A','B','C','SUPPORT','HQ']` or a code-to-label map. A used company is deactivated, never deleted (the foreign key refuses). New assignments go through `CompaniesService.assertActive`; reading a stored code goes through `nameOf`. Admins manage them on מערכת ← פלוגות.

**One active holder per serialized instance**: a partial unique index backs `signatures(item_instance_id) WHERE returned_at IS NULL`, so a מסד cannot be double-issued even under a race.

**Role/permission system — mid-migration, not fully rolled out.** There are two parallel mechanisms right now:
- The older `@Roles('admin' | 'logistics' | 'viewer')` decorator + guard (`apps/api/src/auth/decorators/roles.decorator.ts`), a fixed role list hardcoded per route. Still used by: `items`, `signatures`, `intake`, `counts`, `attendance`, `excel`, `issue-forms`, `snapshots`, `users`.
- The newer `@RequirePermission(key, level, alsoAllow?)` decorator + `PermissionsGuard` (`apps/api/src/auth/decorators/permission.decorator.ts`, `apps/api/src/auth/guards/permissions.guard.ts`), backed by an editable `RolePermission` DB table (role × key → NONE/READ/WRITE). `admin` always bypasses the matrix. Only wired into `allocations` and `soldiers` controllers so far.
- The `Role` enum also now includes three new reserve-duty roles beyond admin/logistics/viewer: `SHLISHUT` (שלישות, חיילים CRUD), `SAMGAD` (סמג"ד, sets the battalion-wide cap), `COMPANY_CMDR` (מ"פ, assigns within their company). These only make sense under the permission-matrix system, not the old fixed `@Roles` lists.
- If asked to add a new protected route or extend permissions, prefer `@RequirePermission` over `@Roles` and migrate the controller you're touching rather than mixing both on the same route.

**No `any` type, anywhere in this codebase.** Hard requirement, not a style preference — treat a surfaced `any` as a bug to fix, not tech debt to leave.

**What rides along with an item at ניפוק is data, not code.** Kits (`ItemKit`/`ItemKitLine`, edited on the admin-only ערכות screen, see `docs/feat-editable-item-kits.md`) replaced the hardcoded `issue-bundle-rules.ts`. Do not reintroduce rules keyed by item name in code; add or change a kit instead. `item_kit_changes` is append-only like `movements`.

**ניפוק must always warn before handing out a weapon beyond its company's allocation.** When adding a `WEAPON`-category item to the basket in `BasketStep.tsx`, if the soldier's company has no quantity left under the active תקופת שרות's חלוקה לפלוגות (`CompanyAllocationGrid`'s plan, via `remaining[company]` from `GET /service-periods/:id/company-allocations`), a confirmation dialog must appear before the line is actually added — never add it silently. This is a soft gate (the samgad's plan can be wrong or stale), not a hard block like the בפועל cap in `AllocationsService`, so the dialog lets the operator proceed on purpose. Keep this working for every future change to the issue flow or the allocation model — it is a standing product requirement, not a one-off feature. **Deliberately out of scope:** a weapon that has no row on the grid (or any weapon while no period is active) is added without a warning — "not planned" is treated as "nothing to check against", not as zero, so unlisted weapons like pistols don't nag on every issue. Decided with the product owner; don't tighten it without asking. The same rule covers a company that has no column on the grid (for example one created after the grid was built): `remainingForCompany` returns `null`, never 0.

## Nav structure

The side rail is one entry per **hub**, with related screens as tabs inside (see `docs/feat-nav-hubs.md`): ניפוק וחתימות (ניפוק · חתימות · אפסון), תקופת שרות, חיילים, דוחות (מסכם · חלוקה לפלוגות · ספירה · תנועות), and a ניהול group: ציוד and מערכת (admin only; משתמשים · פלוגות · גיבויים) plus ימי יציאה (admin, logistics view).

`apps/web/src/app/navConfig.ts` is the single source of truth for screens, grouping and per-role access; `Shell.tsx` (rail) and `App.tsx` (routes) both derive from it. To add a screen, add a tab/hub there plus its element in `App.tsx#screenFor` — never a hand-written role list in either file. Link to a screen with `addressOf(tabId)`, not a path string. Old top-level addresses redirect via `LEGACY_REDIRECTS`. Don't delete a screen just because it is not a rail entry — ask first.

## Conventions

- All Hebrew UI strings live in `apps/web/src/i18n/he.ts` — never hardcode a string in a component.
- Comments explain WHY (a constraint, an invariant, a deliberate non-obvious choice), never WHAT the code does — this is the established style throughout both apps' source, not just a preference going forward.
- One-off DB inspection/fix scripts during development go in `apps/api/` as `*.tmp.ts` (using `PrismaClient` + `PrismaPg` adapter + `process.env.DATABASE_URL`, run via `npx tsx <file>.tmp.ts`) and **must be deleted immediately after use** — never commit one.
- `item.aliases` (`String[]` on `Item`) is also where the מיפוי שמות screen's name-mapping lives — no separate aliases table.
- **Every screen must be mobile-usable.** This app runs on phones in the field, not just desks. No horizontal scrolling on data-entry screens — if a table has too many columns for a phone, render it twice: `<table>` wrapped in `hidden sm:block`, plus a parallel `<ul className="... sm:hidden">` of card components below `sm:`, reusing the same field sub-components so business logic isn't duplicated between the two renders (see `apps/web/src/features/intake/IntakePage.tsx` for the reference pattern). Read-only report tables may keep `overflow-x-auto` scroll since they're not being typed into. All shared controls (`Button`, `TextField`, `Select`, `SearchField` in `apps/web/src/components/ui.tsx`) use explicit `h-10`/`h-11` heights for touch targets and must stay visually consistent — don't add one-off padding/sizing overrides on individual pages; fix the shared component instead.
