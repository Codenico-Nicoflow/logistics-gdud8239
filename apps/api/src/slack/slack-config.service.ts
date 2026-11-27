import { BadRequestException, ForbiddenException, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../auth/auth.types';
import { HOME_BATTALION_ID } from '../common/home-battalion';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityEventsService, SecurityEventType } from '../security-events/security-events.service';
import { runAsBattalion } from '../tenancy/tenant-context';
import { CHANNEL_ID, isSlackKind, LEGACY_ENV, SLACK_KINDS, type SlackKind } from './slack-kinds';

const keyOf = (kind: SlackKind): string => `slack.${kind}`;

export type SlackOverview = {
  /** Whether the deployment has a bot at all; without one nothing can be sent, whatever is configured. */
  botReady: boolean;
  /** Per kind: will a send go anywhere. Safe for every role, so the screens can hide what cannot work. */
  configured: Record<SlackKind, boolean>;
  /** The channel ids themselves, for the platform admin only. */
  channels: Record<SlackKind, string | null> | null;
};

/**
 * Which Slack channel each of a battalion's posts goes to. The bot token is the platform's and shared; the
 * channels are the battalion's own, set by the platform admin. A battalion with none configured has no
 * Slack: there is no fallback to another battalion's channel.
 */
@Injectable()
export class SlackConfigService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SlackConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: SecurityEventsService,
  ) {}

  /**
   * 8239 already posts to the channels in the environment. Copy them into its settings once, so it keeps
   * working untouched and from then on is configured like every other battalion.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await runAsBattalion(HOME_BATTALION_ID, async () => {
        for (const kind of SLACK_KINDS) {
          const legacy = this.config.get<string>(LEGACY_ENV[kind]);
          if (!legacy || !CHANNEL_ID.test(legacy)) continue;
          if (await this.stored(kind)) continue;
          await this.prisma.appSetting.create({ data: { key: keyOf(kind), value: legacy } });
          this.logger.log(`Seeded ${kind} Slack channel for the home battalion from the environment`);
        }
      });
    } catch (e) {
      this.logger.error('Could not seed the home battalion Slack channels', e instanceof Error ? e.stack : String(e));
    }
  }

  private botReady(): boolean {
    return !!this.config.get<string>('SLACK_BOT_TOKEN');
  }

  private async stored(kind: SlackKind): Promise<string | null> {
    const row = await this.prisma.appSetting.findFirst({ where: { key: keyOf(kind) } });
    return row?.value ? row.value : null;
  }

  /** The channel to post to, or undefined when there is no bot or this battalion has not set one. */
  async channel(kind: SlackKind): Promise<string | undefined> {
    if (!this.botReady()) return undefined;
    return (await this.stored(kind)) ?? undefined;
  }

  async overview(user: AuthUser): Promise<SlackOverview> {
    const stored = await Promise.all(SLACK_KINDS.map(async (k) => [k, await this.stored(k)] as const));
    const botReady = this.botReady();
    const configured = Object.fromEntries(stored.map(([k, v]) => [k, botReady && v !== null])) as Record<SlackKind, boolean>;
    const channels = user.isPlatformAdmin ? (Object.fromEntries(stored) as Record<SlackKind, string | null>) : null;
    return { botReady, configured, channels };
  }

  async set(rawKind: string, channelId: string | null, actor: AuthUser): Promise<SlackOverview> {
    if (!actor.isPlatformAdmin) throw new ForbiddenException('רק מנהל הפלטפורמה יכול לשנות את ערוצי הסלאק');
    if (!isSlackKind(rawKind)) throw new BadRequestException('סוג שליחה לא מוכר');
    const kind = rawKind;
    if (channelId !== null && !CHANNEL_ID.test(channelId)) {
      throw new BadRequestException('מזהה ערוץ לא תקין. מזהה ערוץ בסלאק מתחיל באות C או G, למשל C0123ABCDEF');
    }

    if (channelId === null) {
      await this.prisma.appSetting.deleteMany({ where: { key: keyOf(kind) } });
    } else {
      // Only unique together with the battalion, so no `upsert` by key; the battalion is filled in by the database.
      const data = { value: channelId, updatedByUserId: actor.id };
      const { count } = await this.prisma.appSetting.updateMany({ where: { key: keyOf(kind) }, data });
      if (count === 0) await this.prisma.appSetting.create({ data: { key: keyOf(kind), ...data } });
    }
    await this.events.record(SecurityEventType.SLACK_CHANGED, { actorUserId: actor.id, detail: `${kind}=${channelId ?? 'cleared'}` });
    return this.overview(actor);
  }
}
