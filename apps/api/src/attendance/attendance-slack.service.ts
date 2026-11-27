import { BattalionService } from '../battalion/battalion.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenancy/tenant.service';
import { SlackFileSender } from '../common/slack-file-sender';
import { addDaysIso, israelToday } from '../common/israel-date';
import { ModulesService } from '../modules/modules.service';
import { AttendanceService, type Week } from './attendance.service';
import { buildWeekPdf } from './attendance-pdf';

export type SendWeekResult = { sent: boolean; error?: string; weekStart: string };

function ddmm(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

const isEmpty = (week: Week): boolean => week.rows.every((r) => r.cells.every((c) => c.status === null));

/**
 * Posts a week of ימי יציאה to its Slack channel as a PDF, so the team can read it
 * without opening the system: by hand from the screen (any week, any time) and by the
 * Thursday 15:00 job (the coming week).
 */
@Injectable()
export class AttendanceSlackService {
  private readonly logger = new Logger(AttendanceSlackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly attendance: AttendanceService,
    private readonly slack: SlackFileSender,
    private readonly tenants: TenantService,
    private readonly battalion: BattalionService,
    private readonly modules: ModulesService,
  ) {}

  /**
   * Thursday 15:00 Israel time, the week that starts on Sunday. Production only, for the
   * same reason as the backups: a developer's machine must never post its own data to
   * the real channel.
   */
  @Cron('0 15 * * 4', { timeZone: 'Asia/Jerusalem', name: 'attendance-weekly-slack' })
  async weeklyJob(): Promise<void> {
    if (this.config.get<string>('NODE_ENV') !== 'production') return;
    await this.tenants.forEachBattalion(
      async (battalionId) => {
        if (!(await this.modules.isOn('attendance'))) return;
        const result = await this.sendWeek(addDaysIso(israelToday(), 7), 'cron');
        if (!result.sent && result.error) this.logger.error(`Weekly ימי יציאה not sent for ${battalionId}: ${result.error}`);
      },
      (battalionId, e) => this.logger.error(`Weekly ימי יציאה failed for ${battalionId}`, e instanceof Error ? e.stack : String(e)),
    );
  }

  async sendWeek(anyDateInWeek: string, trigger: 'manual' | 'cron', sentBy?: string): Promise<SendWeekResult> {
    const week = await this.attendance.week(anyDateInWeek);
    const weekStart = week.dates[0] as string;
    const weekEnd = week.dates[6] as string;

    const channel = this.slack.channelFor('ATTENDANCE_SLACK_CHANNEL_ID');
    if (!channel) return { sent: false, error: 'Slack אינו מוגדר', weekStart };

    // Claim the scheduled send before posting: a second instance running the same job
    // fails the unique insert and stays quiet.
    let rowId: string | null = null;
    try {
      const row = await this.prisma.attendanceWeekSend.create({
        data: {
          weekStart: new Date(weekStart),
          trigger,
          sentBy: sentBy ?? null,
          cronKey: trigger === 'cron' ? weekStart : null,
        },
      });
      rowId = row.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { sent: false, error: 'השבוע כבר נשלח', weekStart };
      }
      throw e;
    }

    try {
      const label = `${ddmm(weekStart)}–${ddmm(weekEnd)}`;
      if (trigger === 'cron' && isEmpty(week)) {
        // Nothing filled in yet: say so rather than post an empty table people would read as "everyone is present nowhere".
        await this.slack.sendMessage(channel, `ימי יציאה לשבוע ${label} עדיין לא מולאו.`);
      } else {
        const pdf = await buildWeekPdf(week, (await this.battalion.unit()).name, new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }));
        await this.slack.sendFile(channel, pdf, `ימי-יציאה-${weekStart}.pdf`, `ימי יציאה — שבוע ${label}`);
      }
      return { sent: true, weekStart };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      // Released, so the scheduled week can still be sent by hand (or retried) after a failure.
      await this.prisma.attendanceWeekSend.update({
        where: { id: rowId },
        data: { error: error.slice(0, 500), cronKey: null },
      });
      return { sent: false, error, weekStart };
    }
  }
}
