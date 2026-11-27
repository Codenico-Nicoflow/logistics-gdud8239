import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { CompanyCode } from './company-code';
import type { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';

export type CompanyRow = { id: string; code: CompanyCode; name: string; sortOrder: number; isActive: boolean };

const SELECT = { id: true, code: true, name: true, sortOrder: true, isActive: true } as const;

/**
 * The battalion's companies. Everything that used to loop over a fixed list of five (the grids, the Excel
 * sheets, the dropdowns) asks this instead, so a battalion with three companies, or none yet, just works.
 */
@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every company, inactive ones included, in display order. */
  list(): Promise<CompanyRow[]> {
    return this.prisma.company.findMany({ select: SELECT, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  /** Only the companies new work may be assigned to. */
  async listActive(): Promise<CompanyRow[]> {
    return (await this.list()).filter((c) => c.isActive);
  }

  /** code → display name, for rendering a stored code (including one of a deactivated company). */
  async nameByCode(): Promise<Map<CompanyCode, string>> {
    return new Map((await this.list()).map((c) => [c.code, c.name]));
  }

  /**
   * Refuses a code that is not an active company of this battalion. The database would reject an unknown
   * one with a foreign-key error anyway; this turns that into a message the operator can read, and also
   * stops new work from landing on a deactivated company.
   */
  async assertActive(code: CompanyCode): Promise<void> {
    const found = await this.prisma.company.findFirst({ where: { code }, select: { isActive: true } });
    if (!found || !found.isActive) throw new BadRequestException('פלוגה לא חוקית');
  }

  /** For reading: any company of this battalion, deactivated ones included (their history is still viewable). */
  async assertExists(code: CompanyCode): Promise<void> {
    if (!(await this.prisma.company.findFirst({ where: { code }, select: { id: true } }))) {
      throw new BadRequestException('פלוגה לא חוקית');
    }
  }

  async create(dto: CreateCompanyDto): Promise<CompanyRow> {
    const name = dto.name.trim();
    if (await this.prisma.company.findFirst({ where: { name }, select: { id: true } })) {
      throw new ConflictException(`פלוגה בשם "${name}" כבר קיימת`);
    }
    const last = await this.prisma.company.aggregate({ _max: { sortOrder: true } });
    return this.prisma.company.create({
      // The code is invisible to people and never reused, so a random one is enough for a new company.
      data: { code: `c_${randomBytes(4).toString('hex')}`, name, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      select: SELECT,
    });
  }

  async update(id: string, dto: UpdateCompanyDto): Promise<CompanyRow> {
    const existing = await this.prisma.company.findFirst({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('הפלוגה אינה קיימת');

    const name = dto.name?.trim();
    if (name) {
      const clash = await this.prisma.company.findFirst({ where: { name, NOT: { id } }, select: { id: true } });
      if (clash) throw new ConflictException(`פלוגה בשם "${name}" כבר קיימת`);
    }
    return this.prisma.company.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: SELECT,
    });
  }
}
