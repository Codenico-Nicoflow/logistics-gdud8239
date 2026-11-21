import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Company, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSoldierDto } from './dto/create-soldier.dto';
import type { UpdateSoldierDto } from './dto/update-soldier.dto';
import type { QuerySoldiersDto } from './dto/query-soldiers.dto';
import type { Paginated } from '../common/pagination.dto';
import { findOperationalServicePeriod } from '../common/active-service-period';

/**
 * Search matches name, מ.א. or phone. A full name is split so "נריה אדלר"
 * matches, since first and last names live in separate columns.
 */
function soldierSearchClauses(raw: string): Prisma.SoldierWhereInput[] {
  const q = raw.trim();
  const clauses: Prisma.SoldierWhereInput[] = [
    { firstName: { contains: q, mode: 'insensitive' } },
    { lastName: { contains: q, mode: 'insensitive' } },
    { personalNumber: { contains: q } },
    { phone: { contains: q } },
  ];

  const parts = q.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const [first, ...rest] = parts;
    const last = rest.join(' ');
    clauses.push({
      AND: [
        { firstName: { contains: first as string, mode: 'insensitive' } },
        { lastName: { contains: last, mode: 'insensitive' } },
      ],
    });
    clauses.push({
      AND: [
        { lastName: { contains: first as string, mode: 'insensitive' } },
        { firstName: { contains: last, mode: 'insensitive' } },
      ],
    });
  }
  return clauses;
}

export type SoldierSummary = {
  id: string;
  firstName: string;
  lastName: string;
  personalNumber: string | null;
  phone: string | null;
  company: Company;
  isActive: boolean;
  isAttached: boolean;
  openSignatureCount: number;
  /** מחויל לתקופת השרות הפעילה. `null` when there is no active service period at all. */
  isEnlisted: boolean | null;
};

/**
 * A user with a `companyScope` (the סגן מפקד פלוגה) sees and edits only his own
 * company's soldiers. Another company's soldier reads as "does not exist", not
 * "forbidden", so the roster cannot be probed by id.
 */
function assertInScope(soldier: { company: Company }, scope: Company | null): void {
  if (scope && soldier.company !== scope) throw new NotFoundException('החייל אינו קיים');
}

function assertCompanyAllowed(company: Company | undefined, scope: Company | null): void {
  if (scope && company !== undefined && company !== scope) {
    throw new ForbiddenException('אין לך הרשאה לנהל חיילים מפלוגה אחרת');
  }
}

@Injectable()
export class SoldiersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QuerySoldiersDto, scope: Company | null = null): Promise<Paginated<SoldierSummary>> {
    const where: Prisma.SoldierWhereInput = {
      ...(query.includeInactive ? {} : { isActive: true }),
      // The scope wins over whatever company the client asked for.
      ...(scope ? { company: scope } : query.company ? { company: query.company } : {}),
      ...(query.withOpenSignatures ? { signatures: { some: { returnedAt: null } } } : {}),
      ...(query.holding === 'with' ? { signatures: { some: { returnedAt: null } } } : {}),
      // `none` rather than counting: a soldier who returned everything holds
      // nothing, and the closed signatures they still have must not hide them.
      ...(query.holding === 'without' ? { signatures: { none: { returnedAt: null } } } : {}),
      // Filtered here rather than in the page, so the count reflects the whole
      // roster: a cleanup list that only searches the rows already loaded
      // hides most of the work it exists to surface.
      ...(query.attachedOnly ? { isAttached: true } : {}),
      ...(query.incompleteOnly
        ? { OR: [{ personalNumber: null }, { phone: null }] }
        : {}),
      ...(query.q ? { AND: [{ OR: soldierSearchClauses(query.q) }] } : {}),
    };

    // Weapon issue is gated on whether a תעסוקה is both ACTIVE and actually
    // running today, not just ACTIVE — so `isEnlisted` here reflects that
    // same operational check, or the roster would show a soldier as מחויל
    // for a weapon the system would then refuse to let him sign for.
    const activePeriod = await findOperationalServicePeriod(this.prisma);

    const orderBy: Prisma.SoldierOrderByWithRelationInput[] =
      query.sort === 'company'
        ? [{ company: 'asc' }, { firstName: 'asc' }, { lastName: 'asc' }]
        : [{ firstName: 'asc' }, { lastName: 'asc' }];

    const [rows, total] = await Promise.all([
      this.prisma.soldier.findMany({
        where,
        orderBy,
        skip: query.skip ?? 0,
        take: query.take ?? 50,
        include: {
          _count: { select: { signatures: { where: { returnedAt: null } } } },
          enlistments: { where: { servicePeriodId: activePeriod?.id ?? '' } },
        },
      }),
      this.prisma.soldier.count({ where }),
    ]);

    return {
      rows: rows.map((s) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        personalNumber: s.personalNumber,
        phone: s.phone,
        company: s.company,
        isActive: s.isActive,
        isAttached: s.isAttached,
        openSignatureCount: s._count.signatures,
        isEnlisted: activePeriod ? s.enlistments.length > 0 : null,
      })),
      total,
    };
  }

  /** שלישות toggles whether a soldier is מחויל for the currently active תקופת שרות. */
  async setEnlisted(
    soldierId: string,
    enlisted: boolean,
    scope: Company | null = null,
  ): Promise<{ isEnlisted: boolean }> {
    const soldier = await this.prisma.soldier.findUnique({ where: { id: soldierId } });
    if (!soldier) throw new NotFoundException('החייל אינו קיים');
    assertInScope(soldier, scope);

    const activePeriod = await this.prisma.servicePeriod.findFirst({ where: { status: 'ACTIVE' } });
    if (!activePeriod) throw new BadRequestException('אין תקופת שרות פעילה');

    if (enlisted) {
      await this.prisma.soldierEnlistment.upsert({
        where: { soldierId_servicePeriodId: { soldierId, servicePeriodId: activePeriod.id } },
        update: {},
        create: { soldierId, servicePeriodId: activePeriod.id },
      });
    } else {
      await this.prisma.soldierEnlistment.deleteMany({
        where: { soldierId, servicePeriodId: activePeriod.id },
      });
    }
    return { isEnlisted: enlisted };
  }

  /**
   * A soldier with every item currently signed to them — the per-soldier
   * view. Carries `isEnlisted` too, same as `findAll`, so ניפוק's confirm
   * step can warn before a weapon basket is even built, not just rely on
   * the 1008 submit rejecting it server-side.
   */
  async findOne(id: string, scope: Company | null = null) {
    const activePeriod = await findOperationalServicePeriod(this.prisma);
    const soldier = await this.prisma.soldier.findUnique({
      where: { id },
      include: {
        signatures: {
          where: { returnedAt: null },
          include: { item: true, itemInstance: true },
          orderBy: { signedAt: 'desc' },
        },
        enlistments: { where: { servicePeriodId: activePeriod?.id ?? '' } },
      },
    });
    if (!soldier) throw new NotFoundException('החייל אינו קיים');
    assertInScope(soldier, scope);
    const { enlistments, ...rest } = soldier;
    return { ...rest, isEnlisted: activePeriod ? enlistments.length > 0 : null };
  }

  /**
   * Flags likely duplicates rather than blocking: the same first and last name
   * in the same company is common enough to be real, but worth warning about.
   */
  async findPossibleDuplicates(dto: CreateSoldierDto, scope: Company | null = null): Promise<SoldierSummary[]> {
    assertCompanyAllowed(dto.company, scope);
    const matches = await this.prisma.soldier.findMany({
      where: {
        isActive: true,
        firstName: dto.firstName,
        lastName: dto.lastName,
        company: dto.company,
      },
      include: { _count: { select: { signatures: { where: { returnedAt: null } } } } },
      take: 5,
    });
    return matches.map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      personalNumber: s.personalNumber,
      phone: s.phone,
      company: s.company,
      isActive: s.isActive,
      isAttached: s.isAttached,
      openSignatureCount: s._count.signatures,
      isEnlisted: null,
    }));
  }

  async create(dto: CreateSoldierDto, scope: Company | null = null) {
    assertCompanyAllowed(dto.company, scope);
    if (dto.personalNumber) {
      const existing = await this.prisma.soldier.findUnique({
        where: { personalNumber: dto.personalNumber },
      });
      if (existing) {
        throw new ConflictException(
          `מספר אישי ${dto.personalNumber} משויך כבר ל${existing.firstName} ${existing.lastName}`,
        );
      }
    }

    return this.prisma.soldier.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        personalNumber: dto.personalNumber ?? null,
        phone: dto.phone ?? null,
        company: dto.company,
        receiptNo: dto.receiptNo ?? null,
        notes: dto.notes ?? null,
        isAttached: dto.isAttached ?? false,
      },
    });
  }

  async update(id: string, dto: UpdateSoldierDto, scope: Company | null = null) {
    const soldier = await this.prisma.soldier.findUnique({
      where: { id },
      include: { _count: { select: { signatures: { where: { returnedAt: null } } } } },
    });
    if (!soldier) throw new NotFoundException('החייל אינו קיים');
    assertInScope(soldier, scope);
    assertCompanyAllowed(dto.company, scope);

    // Deactivating someone who still holds equipment would hide that equipment
    // from every report, so the items must be returned first.
    if (dto.isActive === false && soldier._count.signatures > 0) {
      throw new BadRequestException(
        `לא ניתן להשבית חייל שחתום על ${soldier._count.signatures} פריטים. יש לזכות אותם קודם.`,
      );
    }

    if (dto.personalNumber && dto.personalNumber !== soldier.personalNumber) {
      const clash = await this.prisma.soldier.findUnique({
        where: { personalNumber: dto.personalNumber },
      });
      if (clash) throw new ConflictException(`מספר אישי ${dto.personalNumber} משויך כבר לחייל אחר`);
    }

    return this.prisma.soldier.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.personalNumber !== undefined ? { personalNumber: dto.personalNumber } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.company !== undefined ? { company: dto.company } : {}),
        ...(dto.receiptNo !== undefined ? { receiptNo: dto.receiptNo } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isAttached !== undefined ? { isAttached: dto.isAttached } : {}),
      },
    });
  }

  /**
   * A real delete, not another isActive flag — for a soldier record that was
   * never real to begin with (test data, a duplicate created by mistake).
   * Anyone with actual history (a signature, movement or issue form) is
   * protected at the DB level by `onDelete: Restrict` on those tables, so this
   * fails with a clear message instead of silently erasing audit trail —
   * deactivating is the right tool for someone who really served and left.
   */
  async remove(id: string, scope: Company | null = null): Promise<void> {
    const soldier = await this.prisma.soldier.findUnique({ where: { id } });
    if (!soldier) throw new NotFoundException('החייל אינו קיים');
    assertInScope(soldier, scope);

    try {
      await this.prisma.soldier.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictException(
          `לא ניתן למחוק את ${soldier.firstName} ${soldier.lastName} — קיימת היסטוריה (חתימות/תנועות). ניתן להשבית אותו במקום.`,
        );
      }
      throw err;
    }
  }
}
