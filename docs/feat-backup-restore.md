# feat/backup-restore

Adds `scripts/restore-db.sh` (`npm run restore`) and the restore manual, [RESTORE.md](RESTORE.md).

The full DB backup had never been restored. A test restore found that a dump from a newer `pg_dump` fails on an older server (`transaction_timeout`); the script handles that, refuses a non-empty target, and can compare every table against another database. See RESTORE.md for the procedure and what was tested.
