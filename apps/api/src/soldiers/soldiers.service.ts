import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Company, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSoldierDto } from './dto/create-soldier.dto';
import type { UpdateSoldierDto } from './dto/update-soldier.dto';
import type { QuerySoldiersDto } from './dto/query-soldiers.dto';
import type { Paginated } from '../common/pagination.dto';

export type SoldierSummary = {
  id: string;
  firstName: string;
  lastName: string;
  personalNumber: string | null;
  phone: string | null;
  company: Company;
  platoon: string | null;
  isActive: boolean;
  openSignatureCount: number;
};

@Injectable()
export class SoldiersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QuerySoldiersDto): Promise<Paginated<SoldierSummary>> {
    const where: Prisma.SoldierWhereInput = {
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.company ? { company: query.company } : {}),
      ...(query.withOpenSignatures ? { signatures: { some: { returnedAt: null } } } : {}),
      ...(query.q
        ? {
            OR: [
              { firstName: { contains: query.q, mode: 'insensitive' } },
              { lastName: { contains: query.q, mode: 'insensitive' } },
              { personalNumber: { contains: query.q } },
              { phone: { contains: query.q } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.soldier.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: query.skip ?? 0,
        take: query.take ?? 50,
        include: { _count: { select: { signatures: { where: { returnedAt: null } } } } },
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
        platoon: s.platoon,
        isActive: s.isActive,
        openSignatureCount: s._count.signatures,
      })),
      total,
    };
  }

  /** A soldier with every item currently signed to them — the per-soldier view. */
  async findOne(id: string) {
    const soldier = await this.prisma.soldier.findUnique({
      where: { id },
      include: {
        signatures: {
          where: { returnedAt: null },
          include: { item: true, itemInstance: true },
          orderBy: { signedAt: 'desc' },
        },
      },
    });
    if (!soldier) throw new NotFoundException('החייל אינו קיים');
    return soldier;
  }

  /**
   * Flags likely duplicates rather than blocking: the same first and last name
   * in the same company is common enough to be real, but worth warning about.
   */
  async findPossibleDuplicates(dto: CreateSoldierDto): Promise<SoldierSummary[]> {
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
      platoon: s.platoon,
      isActive: s.isActive,
      openSignatureCount: s._count.signatures,
    }));
  }

  async create(dto: CreateSoldierDto) {
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
        platoon: dto.platoon ?? null,
        receiptNo: dto.receiptNo ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateSoldierDto) {
    const soldier = await this.prisma.soldier.findUnique({
      where: { id },
      include: { _count: { select: { signatures: { where: { returnedAt: null } } } } },
    });
    if (!soldier) throw new NotFoundException('החייל אינו קיים');

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
        ...(dto.platoon !== undefined ? { platoon: dto.platoon } : {}),
        ...(dto.receiptNo !== undefined ? { receiptNo: dto.receiptNo } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }
}
