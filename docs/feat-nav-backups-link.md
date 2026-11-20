# feat/nav-backups-link — link גיבויים into the nav

`/backups` (Excel snapshots + full DB backups, each with "send to Slack") was
routed for admins but never linked in `Shell.tsx`. Added under ניהול, admin
only, matching the route's own `isAdmin` gate. Needed to manually trigger a
backup on the deployed Render API to confirm `pg_dump` and the Slack env vars
work there before relying on the daily 18:00/18:05 cron.
