/** The three things a battalion posts to Slack, each to its own channel. */
export const SLACK_KINDS = ['snapshots', 'mesakem', 'attendance'] as const;
export type SlackKind = (typeof SLACK_KINDS)[number];

export const isSlackKind = (value: string): value is SlackKind => (SLACK_KINDS as readonly string[]).includes(value);

/**
 * The environment variables the single deployment used before channels became per battalion. They are read
 * once, to give גדוד 8239 the channels it already had; no other battalion ever reads them.
 */
export const LEGACY_ENV: Record<SlackKind, string> = {
  snapshots: 'SLACK_CHANNEL_ID',
  mesakem: 'MESAKEM_SLACK_CHANNEL_ID',
  attendance: 'ATTENDANCE_SLACK_CHANNEL_ID',
};

/** Slack conversation ids: C… public, G… older private, D… direct. */
export const CHANNEL_ID = /^[CGD][A-Z0-9]{8,}$/;
