# ימי יציאה to Slack as a PDF (feat/attendance-weekly-slack)

The week's ימי יציאה can be posted to its own Slack channel as a PDF, so the team reads it without opening the system.

## Two ways to send
- **By hand:** an admin-only "שלח לסלאק" button on the ימי יציאה screen sends the **week shown on screen** (any week, any time, as often as needed) after a confirmation that names the week — the whole channel sees it.
- **Scheduled:** every **Thursday 15:00 Israel time** the job sends the **coming** week (Sunday–Saturday). Production only, like the backup jobs, so a developer machine never posts to the real channel.

## Safety
- `attendance_week_sends` logs every send. The scheduled one claims its week through a unique `cron_key`, so two API instances overlapping during a deploy at 15:00 cannot both post. A failed scheduled send releases the claim, so it can still be sent by hand.
- If the scheduled send finds the week completely empty, it posts a one-line "not filled in yet" note instead of an empty table. A manual send always sends the PDF.
- Not configured (`ATTENDANCE_SLACK_CHANNEL_ID` or `SLACK_BOT_TOKEN` missing) answers "Slack אינו מוגדר" instead of failing.

## Setup (Render)
Add `ATTENDANCE_SLACK_CHANNEL_ID` (the channel's ID, `C…`) to the `logistics-api` service — listed in `render.yaml` with `sync: false`. It reuses `SLACK_BOT_TOKEN`; the bot must be invited to the channel.

## The PDF
A4 landscape: member on the right, Sunday to Saturday leftwards, a coloured status per day (female form of נוכח where it applies), and a נוכחים row with the "+N חזרה" addendum. **Notes are left out** — a channel is a wider audience than the screen. Built with PDFKit and the Noto Sans Hebrew font files from `@fontsource/noto-sans-hebrew` (Hebrew and Latin subsets, drawn in runs placed right to left). Text with no Hebrew in it is laid out left to right.

## Tests
`test/attendance-slack.e2e.spec.ts` with Slack replaced by a recorder (`SlackFileSender` seam): button sends a PDF to the channel, hand sends repeat, a scheduled send cannot go out twice, an empty week posts the note, a failure does not lock the week, not-configured, admin only.
