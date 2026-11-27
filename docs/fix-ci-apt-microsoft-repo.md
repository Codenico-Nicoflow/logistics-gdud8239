# fix: CI no longer fails when Microsoft's apt repo is unavailable

The API job installs `postgresql-client` (the backup tests spawn `pg_dump`). It ran `apt-get update`
first, which also refreshes the Microsoft package repo preinstalled on GitHub's Ubuntu 24.04 runners.
When that repo answers `403 Forbidden` / "is no longer signed", `apt-get update` exits 100, the step
fails, and every later step (`npm ci`, migrations, typecheck, tests, build) is skipped, so a PR gets a red
check without its code ever being tested. It is intermittent, which is why other branches passed.

The job needs nothing from that repo, so the step now deletes `/etc/apt/sources.list.d/microsoft-prod.*`
before updating. `postgresql-client` still comes from Ubuntu's own archive, unchanged.
