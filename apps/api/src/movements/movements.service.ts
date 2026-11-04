import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { QueryMovementsDto } from './dto/query-movements.dto';
import type { Paginated } from '../common/pagination.dto';

/**
 * One row of `דוח תנועות`, flattened for display and export.
 *
 * `action` and `company` carry the enum key, not a Hebrew label: the UI holds a
 * single translation table (`he.ts`) so wording is changed in one place rather
 * than in every service.
 */
export type MovementRow = {
  id: string;
  action: string;
  occurredAt: Date;
  soldierName: string;
  company: string | null;
  itemName: string;
  serial: string | null;
  quantity: number;
  receiptNo: string | null;
  performedBy: string;
  notes: string | null;
};

/**
 * Read-only access to the audit log. There is deliberately no create, update or
 * delete here: rows are written only inside the transaction that performs the
 * underlying action, and the database rejects UPDATE and DELETE outright.
 */
@Injectable()
export class MovementsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(query: QueryMovementsDto): Prisma.MovementWhereInput {
    return {
      ...(query.action ? { action: query.action } : {}),
      ...(query.company ? { companySnapshot: query.company } : {}),
      ...(query.soldierId ? { soldierId: query.soldierId } : {}),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.performedByUserId ? { performedByUserId: query.performedByUserId } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { soldierNameSnapshot: { contains: query.q, mode: 'insensitive' } },
              { itemNameSnapshot: { contains: query.q, mode: 'insensitive' } },
              { serialSnapshot: { contains: query.q } },
              { performedByNameSnapshot: { contains: query.q, mode: 'insensitive' } },
              { receiptNo: { contains: query.q } },
            ],
          }
        : {}),
    };
  }

  async findAll(query: QueryMovementsDto): Promise<Paginated<MovementRow>> {
    const where = this.buildWhere(query);
    const [rows, total] = await Promise.all([
      this.prisma.movement.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: query.skip ?? 0,
        take: query.take ?? 100,
      }),
      this.prisma.movement.count({ where }),
    ]);

    return { rows: rows.map((m) => this.toRow(m)), total };
  }

  /** Same filters, no pagination — used by the Excel export of the log. */
  async findAllForExport(query: QueryMovementsDto): Promise<MovementRow[]> {
    const rows = await this.prisma.movement.findMany({
      where: this.buildWhere(query),
      orderBy: { occurredAt: 'desc' },
    });
    return rows.map((m) => this.toRow(m));
  }

  private toRow(m: {
    id: string;
    action: string;
    occurredAt: Date;
    soldierNameSnapshot: string;
    companySnapshot: string | null;
    itemNameSnapshot: string;
    serialSnapshot: string | null;
    quantity: number;
    receiptNo: string | null;
    performedByNameSnapshot: string;
    notes: string | null;
  }): MovementRow {
    return {
      id: m.id,
      action: m.action,
      occurredAt: m.occurredAt,
      soldierName: m.soldierNameSnapshot,
      company: m.companySnapshot,
      itemName: m.itemNameSnapshot,
      serial: m.serialSnapshot,
      quantity: m.quantity,
      receiptNo: m.receiptNo,
      performedBy: m.performedByNameSnapshot,
      notes: m.notes,
    };
  }
}
