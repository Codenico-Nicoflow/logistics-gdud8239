# Multi-tenant step 6: Slack per battalion, and the full dump kept private

## Per-battalion channels

Each battalion has its own Slack channels for three posts: the daily Excel snapshot, מסכם, and ימי יציאה. They are
stored in `app_settings` (`slack.snapshots`, `slack.mesakem`, `slack.attendance`) and set by the **platform admin**
on מערכת ← Slack while acting inside the battalion. The bot token stays one platform-level `SLACK_BOT_TOKEN`; a
battalion admin cannot point the bot at an arbitrary channel.

- No channel set = no Slack for that battalion. There is **no fallback** to another battalion's channel or to the
  environment.
- The screens ask `GET /slack` and hide what cannot work: the ימי יציאה send button, "סיים יום ושלח" in מסכם, and the
  snapshot send link.
- 8239 keeps what it had: at boot, `SLACK_CHANNEL_ID`, `MESAKEM_SLACK_CHANNEL_ID` and `ATTENDANCE_SLACK_CHANNEL_ID` are
  copied once into 8239's settings if it has none. A channel changed later in the app is never overwritten. After the
  first deploy those three variables can be removed from Render.
- `slackAllowedHere()` (the interim "only 8239 may post" guard) is gone; `common/slack-bridge.ts` became
  `common/home-battalion.ts`, holding only `HOME_BATTALION_ID`.

## The full-database dump

`pg_dump` holds every battalion's data. It used to go to `SLACK_CHANNEL_ID`, which is 8239's shared channel. It now goes
only to `DB_BACKUP_SLACK_CHANNEL_ID`, a private platform channel, and **only after Slack confirms the channel is
private** (`conversations.info`; a failed lookup refuses too). Unset or public = the dump is kept on disk only and the
send reports why.

**Deploy:** set `DB_BACKUP_SLACK_CHANNEL_ID` on Render to a private channel with the bot invited. The bot needs the
`groups:read` scope for the privacy check. Until it is set, the nightly dump is stored but not sent.

## Known gaps

- The backups screen is still platform-only, so a battalion's admin cannot list their own Excel snapshots.
