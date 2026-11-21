# גדוד 8239 — Logistics

Hebrew RTL logistics app replacing manual Excel tracking of armory (נשקיה) weapon/equipment signatures and the reserve-duty (תקופת שרות) call-up workflow.

- **apps/api** — NestJS + Prisma + PostgreSQL
- **apps/web** — React + Vite + RTK Query

See `CLAUDE.md` for the full architecture, invariants, local setup, and deployment notes.

## Git workflow

Every feature/fix lives on its own branch (`feat/...`, `fix/...`), opened as a PR into `master` — never pushed to `master` directly. Each branch includes a short write-up of what it does, either in `docs/<branch-name>.md` or folded into this README/CLAUDE.md if small.

## Docs

Per-feature documentation lives in [`docs/`](docs/).

## Disaster recovery

See [docs/RESTORE.md](docs/RESTORE.md) for how to restore the system from a backup.
