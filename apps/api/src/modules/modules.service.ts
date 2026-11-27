import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityEventsService, SecurityEventType } from '../security-events/security-events.service';
import {
  isModuleId,
  MODULE_IDS,
  MODULE_MANIFEST,
  toggleRefusal,
  type ModuleId,
  type ModuleState,
} from './module-manifest';

const keyOf = (id: ModuleId): string => `module.${id}`;

/** Hebrew names for refusal messages; the screen has its own copy in he.ts. */
const NAMES: Record<ModuleId, string> = {
  companySplit: 'חלוקה לפלוגות',
  attendance: 'ימי יציאה',
  kits: 'ערכות',
};

@Injectable()
export class ModulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: SecurityEventsService,
  ) {}

  /**
   * A module with no stored row is ON. That is deliberate: a battalion that existed before the switches
   * did keeps everything it had, and only a battalion created afterwards starts with them off.
   */
  async state(): Promise<ModuleState> {
    const rows = await this.prisma.appSetting.findMany({ where: { key: { in: MODULE_IDS.map(keyOf) } } });
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    const out = {} as ModuleState;
    for (const id of MODULE_IDS) out[id] = stored.get(keyOf(id)) !== 'false';
    return out;
  }

  /** What the web app needs to draw the rail: which parts are on, and whether this person may change them. */
  async overview(userId: string): Promise<{ enabled: ModuleState; canChange: boolean }> {
    const [enabled, user] = await Promise.all([
      this.state(),
      this.prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } }),
    ]);
    return { enabled, canChange: user?.isSuperAdmin === true };
  }

  async isOn(id: ModuleId): Promise<boolean> {
    const row = await this.prisma.appSetting.findFirst({ where: { key: keyOf(id) } });
    return row?.value !== 'false';
  }

  async set(rawId: string, on: boolean, actorUserId: string): Promise<{ enabled: ModuleState; canChange: boolean }> {
    if (!isModuleId(rawId)) throw new BadRequestException('מודול לא מוכר');
    const id = rawId;
    const actor = await this.prisma.user.findUnique({ where: { id: actorUserId }, select: { isSuperAdmin: true } });
    if (!actor?.isSuperAdmin) throw new ForbiddenException('רק סופר-מנהל יכול להפעיל או לכבות מודולים');

    const current = await this.state();
    const refusal = toggleRefusal(MODULE_MANIFEST, current, id, on, (m) => NAMES[m]);
    if (refusal) throw new ConflictException(refusal);

    // Only unique together with the battalion, so no `upsert` by key; the battalion is filled in by the database.
    const data = { value: String(on), updatedByUserId: actorUserId };
    const { count } = await this.prisma.appSetting.updateMany({ where: { key: keyOf(id) }, data });
    if (count === 0) await this.prisma.appSetting.create({ data: { key: keyOf(id), ...data } });
    await this.events.record(SecurityEventType.MODULE_CHANGED, { actorUserId, detail: `${id}=${on}` });
    return { enabled: { ...current, [id]: on }, canChange: true };
  }
}
