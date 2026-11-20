import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Company } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import type { CreateServicePeriodDto, UpdateServicePeriodDto } from './dto/service-period.dto';
import type { SetCompanyAllocationDto } from './dto/company-allocation.dto';
import type { SetOnHandOverrideDto } from './dto/on-hand-override.dto';
import type { SetSoldierAllocationDto } from './dto/soldier-allocation.dto';
import { bundleRuleFor, pairingsFor } from './issue-bundle-rules';
import { computeOnHand } from './compute-on-hand';

const COMPANIES: Company[] = ['A', 'B', 'C', 'SUPPORT', 'HQ'];

/**
 * תקופת שרות planning: the samgad splits each item's בפועל (what is actually
 * on hand, not מצבה) across the five companies before the period opens. Once
 * a soldier actually signs, the basket is built fresh in `IssueFormsService` —
 * this screen is only the battalion-level planning step, nothing per-soldier.
 */
@Injectable()
export class AllocationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- service periods ----------

  findAllPeriods() {
    return this.prisma.servicePeriod.findMany({ orderBy: { startsAt: 'desc' } });
  }

  createPeriod(dto: CreateServicePeriodDto) {
    if (dto.endsAt < dto.startsAt) {
      throw new BadRequestException('תאריך הסיום לא יכול להיות לפני תאריך ההתחלה');
    }
    return this.prisma.servicePeriod.create({ data: dto });
  }

  async updatePeriod(id: string, dto: UpdateServicePeriodDto) {
    const existing = await this.getPeriod(id);
    const startsAt = dto.startsAt ?? existing.startsAt;
    const endsAt = dto.endsAt ?? existing.endsAt;
    if (endsAt < startsAt) {
      throw new BadRequestException('תאריך הסיום לא יכול להיות לפני תאריך ההתחלה');
    }
    return this.prisma.servicePeriod.update({ where: { id }, data: dto });
  }

  private async getPeriod(id: string) {
    const period = await this.prisma.servicePeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundException('תקופת השרות אינה קיימת');
    return period;
  }

  // ---------- company allocations ----------

  /**
   * Only items the samgad has actually added to this period's grid — not the
   * whole catalog. Adding one (`addItemToGrid`) seeds all five companies at
   * 0, which is what makes it show up here at all.
   */
  async findCompanyAllocations(servicePeriodId: string) {
    await this.getPeriod(servicePeriodId);

    const rows = await this.prisma.companyAllocation.findMany({
      where: { servicePeriodId },
      include: { item: true },
    });

    const byItem = new Map<string, { item: (typeof rows)[number]['item']; byCompany: Partial<Record<Company, number>> }>();
    for (const row of rows) {
      const entry = byItem.get(row.itemId) ?? { item: row.item, byCompany: {} };
      entry.byCompany[row.company] = row.quantity;
      byItem.set(row.itemId, entry);
    }

    const itemIds = [...byItem.keys()];

    // What each company has actually been handed, independent of the plan
    // above — open signatures, not allocation rows. Compared against the
    // planned quantity, this is what tells a company how much it still has
    // left to hand out of its own share.
    const openSignatures = itemIds.length
      ? await this.prisma.signature.findMany({
          where: { itemId: { in: itemIds }, returnedAt: null },
          select: { itemId: true, quantity: true, soldier: { select: { company: true } } },
        })
      : [];
    const issuedByItemCompany = new Map<string, number>();
    for (const sig of openSignatures) {
      const key = `${sig.itemId}|${sig.soldier.company}`;
      issuedByItemCompany.set(key, (issuedByItemCompany.get(key) ?? 0) + sig.quantity);
    }

    const overrides = itemIds.length
      ? await this.prisma.servicePeriodItemOverride.findMany({
          where: { servicePeriodId, itemId: { in: itemIds } },
        })
      : [];
    const overrideByItem = new Map(overrides.map((o) => [o.itemId, o.onHand]));

    return Promise.all(
      [...byItem.values()]
        .sort((a, b) => a.item.name.localeCompare(b.item.name, 'he'))
        .map(async ({ item, byCompany }) => {
        const realOnHand = await computeOnHand(this.prisma, item);
        const override = overrideByItem.get(item.id) ?? null;
        const onHand = override ?? realOnHand;
        const quantities = Object.fromEntries(
          COMPANIES.map((c) => [c, byCompany[c] ?? 0]),
        ) as Record<Company, number>;
        const issued = Object.fromEntries(
          COMPANIES.map((c) => [c, issuedByItemCompany.get(`${item.id}|${c}`) ?? 0]),
        ) as Record<Company, number>;
        const remaining = Object.fromEntries(
          COMPANIES.map((c) => [c, quantities[c] - issued[c]]),
        ) as Record<Company, number>;
        const total = COMPANIES.reduce((sum, c) => sum + quantities[c], 0);
        return {
          itemId: item.id,
          item: {
            id: item.id,
            name: item.name,
            category: item.category,
            unitOfMeasure: item.unitOfMeasure,
          },
          // `onHand` is what the grid plans against (override if set, else the
          // real בפועל) — `realOnHand` is always the catalog's true figure, so
          // the admin-only override control knows its own ceiling.
          onHand,
          realOnHand,
          onHandOverride: override,
          quantities,
          issued,
          remaining,
          total,
        };
        }),
    );
  }

  /**
   * Admin-only: caps what the samgad plans against for this one item, in this
   * one period, without touching the catalog's real authorizedQty/yamahQty.
   * Never above the real בפועל — that would let the plan promise more than
   * physically exists, which is exactly what the uncapped version already
   * guards against.
   */
  async setOnHandOverride(servicePeriodId: string, dto: SetOnHandOverrideDto) {
    await this.getPeriod(servicePeriodId);

    const item = await this.prisma.item.findUnique({ where: { id: dto.itemId } });
    if (!item) throw new NotFoundException('הפריט אינו קיים');

    const realOnHand = await computeOnHand(this.prisma, item);

    if (dto.onHand === null) {
      await this.prisma.servicePeriodItemOverride.deleteMany({
        where: { servicePeriodId, itemId: dto.itemId },
      });
      return { onHand: realOnHand, onHandOverride: null };
    }

    if (dto.onHand > realOnHand) {
      throw new BadRequestException(
        `לא ניתן לקבוע בפועל גבוה מהכמות האמיתית (${realOnHand})`,
      );
    }

    await this.prisma.servicePeriodItemOverride.upsert({
      where: { servicePeriodId_itemId: { servicePeriodId, itemId: dto.itemId } },
      update: { onHand: dto.onHand },
      create: { servicePeriodId, itemId: dto.itemId, onHand: dto.onHand },
    });
    return { onHand: dto.onHand, onHandOverride: dto.onHand };
  }

  /** Adds an item to the grid at 0 for every company, so it shows up at all. */
  async addItemToGrid(servicePeriodId: string, itemId: string) {
    await this.getPeriod(servicePeriodId);
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('הפריט אינו קיים');

    await this.prisma.$transaction(
      COMPANIES.map((company) =>
        this.prisma.companyAllocation.upsert({
          where: { servicePeriodId_itemId_company: { servicePeriodId, itemId, company } },
          update: {},
          create: { servicePeriodId, itemId, company, quantity: 0 },
        }),
      ),
    );
  }

  /** Drops an item from the grid entirely — deletes all five company rows. */
  async removeItemFromGrid(servicePeriodId: string, itemId: string) {
    await this.getPeriod(servicePeriodId);
    await this.prisma.companyAllocation.deleteMany({ where: { servicePeriodId, itemId } });
  }

  /**
   * One cell of the grid. Validated against the item's בפועל: the sum across
   * all five companies can never exceed what is physically on hand — there is
   * no override, unlike the old battalion cap, since this is a hard physical
   * limit rather than a planning target.
   */
  async setCompanyAllocation(servicePeriodId: string, dto: SetCompanyAllocationDto) {
    await this.getPeriod(servicePeriodId);

    const item = await this.prisma.item.findUnique({ where: { id: dto.itemId } });
    if (!item) throw new NotFoundException('הפריט אינו קיים');

    const override = await this.prisma.servicePeriodItemOverride.findUnique({
      where: { servicePeriodId_itemId: { servicePeriodId, itemId: dto.itemId } },
    });
    const onHand = override?.onHand ?? (await computeOnHand(this.prisma, item));

    const othersTotal = await this.prisma.companyAllocation.aggregate({
      where: { servicePeriodId, itemId: dto.itemId, company: { not: dto.company } },
      _sum: { quantity: true },
    });
    const projected = (othersTotal._sum.quantity ?? 0) + dto.quantity;
    if (projected > onHand) {
      throw new ConflictException(
        `אין מספיק "${item.name}" בפועל: ${projected} מבוקש מתוך ${onHand} בלבד`,
      );
    }

    return this.prisma.companyAllocation.upsert({
      where: {
        servicePeriodId_itemId_company: { servicePeriodId, itemId: dto.itemId, company: dto.company },
      },
      update: { quantity: dto.quantity },
      create: { servicePeriodId, itemId: dto.itemId, company: dto.company, quantity: dto.quantity },
    });
  }

  /** The period currently open for signing, if any — at most one at a time. */
  findActivePeriod() {
    return this.prisma.servicePeriod.findFirst({ where: { status: 'ACTIVE' } });
  }

  // ---------- soldier allocations (סגן מפקד פלוגה) ----------

  /** A COMPANY_CMDR's own company — admin may pass any, everyone else is locked to their own. */
  private resolveCompanyScope(actor: AuthUser, requested?: Company): Company {
    if (actor.role === 'admin') {
      if (!requested) throw new BadRequestException('יש לבחור פלוגה');
      return requested;
    }
    if (!actor.companyScope) {
      throw new ForbiddenException('לא שויכת לפלוגה — פנה למנהל המערכת');
    }
    if (requested && requested !== actor.companyScope) {
      throw new ForbiddenException('אין לך הרשאה לפלוגה זו');
    }
    return actor.companyScope;
  }

  /**
   * Only items on the samgad's grid for this period and company, with that
   * company's own planned quantity as the ceiling — breaking a company's
   * number down per soldier can never promise more than the company itself
   * was given. Items the samgad hasn't allocated anything to for this
   * company don't appear: there is nothing to break down yet.
   */
  async findSoldierAllocations(servicePeriodId: string, actor: AuthUser, requestedCompany?: Company) {
    await this.getPeriod(servicePeriodId);
    const company = this.resolveCompanyScope(actor, requestedCompany);

    const companyRows = await this.prisma.companyAllocation.findMany({
      where: { servicePeriodId, company, quantity: { gt: 0 } },
      include: { item: true },
    });
    if (companyRows.length === 0) return [];

    const itemIds = companyRows.map((r) => r.itemId);
    const soldiers = await this.prisma.soldier.findMany({
      where: { company, isActive: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    });

    const soldierRows = await this.prisma.soldierAllocation.findMany({
      where: { servicePeriodId, itemId: { in: itemIds }, soldierId: { in: soldiers.map((s) => s.id) } },
    });
    const quantityByItemSoldier = new Map(
      soldierRows.map((r) => [`${r.itemId}|${r.soldierId}`, r.quantity]),
    );

    return companyRows
      .sort((a, b) => a.item.name.localeCompare(b.item.name, 'he'))
      .map((row) => {
        const bySoldier = Object.fromEntries(
          soldiers.map((s) => [s.id, quantityByItemSoldier.get(`${row.itemId}|${s.id}`) ?? 0]),
        );
        const total = Object.values(bySoldier).reduce((sum, n) => sum + n, 0);
        return {
          itemId: row.itemId,
          item: {
            id: row.item.id,
            name: row.item.name,
            category: row.item.category,
            unitOfMeasure: row.item.unitOfMeasure,
            isSerialized: row.item.isSerialized,
          },
          companyQuantity: row.quantity,
          bySoldier,
          total,
        };
      });
  }

  /** The soldiers a סגן מפקד פלוגה can break an item's quantity down across. */
  async findCompanySoldiers(actor: AuthUser, requestedCompany?: Company) {
    const company = this.resolveCompanyScope(actor, requestedCompany);
    return this.prisma.soldier.findMany({
      where: { company, isActive: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    });
  }

  /**
   * One cell of the company commander's breakdown. Capped against the
   * company's own planned quantity from CompanyAllocation — planning only,
   * same as the rest of this screen: it does not touch what an actual 1008
   * can issue.
   */
  async setSoldierAllocation(servicePeriodId: string, dto: SetSoldierAllocationDto, actor: AuthUser) {
    await this.getPeriod(servicePeriodId);

    const soldier = await this.prisma.soldier.findUnique({ where: { id: dto.soldierId } });
    if (!soldier) throw new NotFoundException('החייל אינו קיים');
    this.resolveCompanyScope(actor, soldier.company);

    const item = await this.prisma.item.findUnique({ where: { id: dto.itemId } });
    if (!item) throw new NotFoundException('הפריט אינו קיים');

    const companyAllocation = await this.prisma.companyAllocation.findUnique({
      where: {
        servicePeriodId_itemId_company: { servicePeriodId, itemId: dto.itemId, company: soldier.company },
      },
    });
    const companyQuantity = companyAllocation?.quantity ?? 0;

    const othersTotal = await this.prisma.soldierAllocation.aggregate({
      where: {
        servicePeriodId,
        itemId: dto.itemId,
        soldierId: { not: dto.soldierId },
        soldier: { company: soldier.company },
      },
      _sum: { quantity: true },
    });
    const projected = (othersTotal._sum.quantity ?? 0) + dto.quantity;
    if (projected > companyQuantity) {
      throw new ConflictException(
        `אין מספיק "${item.name}" לפלוגה: ${projected} מבוקש מתוך ${companyQuantity} שהוקצו`,
      );
    }

    return this.prisma.soldierAllocation.upsert({
      where: {
        servicePeriodId_itemId_soldierId: { servicePeriodId, itemId: dto.itemId, soldierId: dto.soldierId },
      },
      update: { quantity: dto.quantity },
      create: { servicePeriodId, itemId: dto.itemId, soldierId: dto.soldierId, quantity: dto.quantity },
    });
  }

  /**
   * Everything this soldier is entitled to this period, straight from his
   * own חלוקה לפי חייל (SoldierAllocation), regardless of what's already in
   * his basket. This drives the opening list on the ניפוק basket step — the
   * operator sees the whole entitlement up front and picks what to actually
   * hand out, instead of hunting for each item one at a time. A personal
   * weapon the soldier is entitled to is included like anything else; its
   * own accessory bundle (`findIssueBundle`) still only expands once that
   * weapon line is actually added, same as before.
   */
  async findSoldierEntitlement(soldierId: string) {
    const soldier = await this.prisma.soldier.findUnique({ where: { id: soldierId } });
    if (!soldier) throw new NotFoundException('החייל אינו קיים');

    const activePeriod = await this.prisma.servicePeriod.findFirst({ where: { status: 'ACTIVE' } });
    if (!activePeriod) return [];

    const rows = await this.prisma.soldierAllocation.findMany({
      where: { servicePeriodId: activePeriod.id, soldierId, quantity: { gt: 0 } },
      include: { item: true },
      orderBy: { item: { name: 'asc' } },
    });

    return rows
      .filter((r) => r.item.isActive)
      .map((r) => ({ item: r.item, quantity: r.quantity }));
  }

  /**
   * Hard pairings only (no eligibility, no weapon-bundle context) — used by
   * the entitlement pick-list, where each row is added on its own. Toggling
   * מטולון on there still needs to pull in M-203 (it requires a מסד and the
   * battalion never hands one out without the other), without also dragging
   * in the rest of a weapon's optional accessory bundle.
   */
  async findItemPairings(itemName: string) {
    const names = pairingsFor(itemName).map((l) => l.itemName);
    if (names.length === 0) return [];
    const items = await this.prisma.item.findMany({ where: { name: { in: names }, isActive: true } });
    const quantityByName = new Map(pairingsFor(itemName).map((l) => [l.itemName, l.quantity]));
    return items.map((item) => ({ item, quantity: quantityByName.get(item.name) ?? 1 }));
  }

  // ---------- ניפוק bundle expansion ----------

  /**
   * When a personal weapon (M-4/M-16/קלע variants) or נגב goes into the 1008
   * basket, this returns everything that should ride along with it: the
   * standard accessories always, plus anything the soldier's own
   * SoldierAllocation says he's actually getting this period (מטולון, מכפל,
   * שחמ, etc). Every returned line is a plain basket line afterward — the
   * operator can still edit the quantity or remove any of them before
   * signing, same as a manually-added line.
   *
   * Eligibility only ever widens what the operator *may* add, never forces a
   * weapon in — issuing the base item itself still goes through the existing
   * BasketStep flow (serial, over-allocation warning) untouched.
   *
   * `alwaysOnly` skips the eligibility expansion entirely — used when a
   * weapon is checked from the entitlement pick-list rather than added via
   * search. There, every optional accessory (מטולון, מכפל, שחמ, …) is
   * already its own separate row in that same list for the operator to tick
   * on its own; only the non-optional load (מחסניות, מק פורק, רצועה) should
   * come along automatically, same as the weapon itself not being a choice
   * once it's in the basket.
   */
  async findIssueBundle(baseItemName: string, soldierId: string, alwaysOnly = false) {
    const rule = bundleRuleFor(baseItemName);
    if (!rule) return [];

    const eligibleNames = new Set<string>();
    if (!alwaysOnly) {
      const activePeriod = await this.prisma.servicePeriod.findFirst({ where: { status: 'ACTIVE' } });
      if (activePeriod && rule.ifEligible.length > 0) {
        const allocations = await this.prisma.soldierAllocation.findMany({
          where: {
            servicePeriodId: activePeriod.id,
            soldierId,
            quantity: { gt: 0 },
            item: { name: { in: rule.ifEligible.map((l) => l.itemName) } },
          },
          include: { item: true },
        });
        for (const a of allocations) eligibleNames.add(a.item.name);
      }
    }

    const wantedLines = [
      ...rule.always,
      ...rule.ifEligible.filter((l) => eligibleNames.has(l.itemName)),
    ];
    // Hard pairings chain off whatever just got included above — right now
    // that's just מטולון pulling in M-203, regardless of which list מטולון
    // itself came from.
    for (const line of [...wantedLines]) {
      for (const paired of pairingsFor(line.itemName)) {
        if (!wantedLines.some((l) => l.itemName === paired.itemName)) wantedLines.push(paired);
      }
    }

    const wantedNames = wantedLines.map((l) => l.itemName);
    if (wantedNames.length === 0) return [];

    const items = await this.prisma.item.findMany({ where: { name: { in: wantedNames }, isActive: true } });
    const itemByName = new Map(items.map((i) => [i.name, i]));
    const quantityByName = new Map(wantedLines.map((l) => [l.itemName, l.quantity]));

    return wantedNames
      .map((name) => itemByName.get(name))
      .filter((item): item is NonNullable<typeof item> => item !== undefined)
      .map((item) => ({ item, quantity: quantityByName.get(item.name) ?? 1 }));
  }
}
