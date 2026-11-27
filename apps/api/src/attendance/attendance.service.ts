import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceStatus, Gender } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  BulkAttendanceDto,
  CreateTeamMemberDto,
  UpdateTeamMemberDto,
} from './dto/attendance.dto';

export type WeekCell = { status: AttendanceStatus | null; note: string | null };

export type WeekRow = {
  teamMemberId: string;
  nickname: string;
  gender: Gender;
  cells: WeekCell[];
};

export type Week = {
  /** Sunday through Saturday, ISO dates. */
  dates: string[];
  rows: WeekRow[];
  /** Count of PRESENT specifically, not RETURNING — נוכח and חזרה are kept
   *  visually and numerically distinct in this row; RETURNING is the
   *  separate "+N" addendum (`returningPerDay`), never folded into this
   *  base number even though both mean "on base today". */
  presentPerDay: number[];
  /** Of that day's roster, how many are specifically חזרה — shown as the
   *  "+3 חזרה" addendum next to the נוכח count, not inside it. */
  returningPerDay: number[];
};

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The week containing `date`, starting Sunday as the Israeli week does. */
function weekDates(date: Date): string[] {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return toIsoDate(d);
  });
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  listMembers(includeInactive = false) {
    return this.prisma.teamMember.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { nickname: 'asc' }],
    });
  }

  /**
   * One week of the grid, shaped the way the original sheet lays it out: a row
   * per person, a column per day, and a computed present count along the bottom.
   */
  async week(anyDateInWeek: string): Promise<Week> {
    const date = new Date(anyDateInWeek);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('תאריך לא תקין');

    const dates = weekDates(date);
    const members = await this.listMembers();
    const records = await this.prisma.attendance.findMany({
      where: {
        date: { gte: new Date(dates[0] as string), lte: new Date(dates[6] as string) },
      },
    });

    const byKey = new Map(
      records.map((r) => [`${r.teamMemberId}|${toIsoDate(r.date)}`, r]),
    );

    const rows: WeekRow[] = members.map((m) => ({
      teamMemberId: m.id,
      nickname: m.nickname,
      gender: m.gender,
      cells: dates.map((d) => {
        const record = byKey.get(`${m.id}|${d}`);
        return { status: record?.status ?? null, note: record?.note ?? null };
      }),
    }));

    const presentPerDay = dates.map(
      (_, i) => rows.filter((r) => r.cells[i]?.status === 'PRESENT').length,
    );
    const returningPerDay = dates.map(
      (_, i) => rows.filter((r) => r.cells[i]?.status === 'RETURNING').length,
    );

    return { dates, rows, presentPerDay, returningPerDay };
  }

  /**
   * Saves a batch of cells. A `null` status clears the cell, which is how a
   * mistaken entry is removed without leaving a placeholder behind.
   */
  async setCells(dto: BulkAttendanceDto): Promise<{ saved: number }> {
    const operations = dto.cells.map((cell) => {
      const date = new Date(cell.date);
      if (Number.isNaN(date.getTime())) throw new BadRequestException('תאריך לא תקין');
      const where = { teamMemberId_date: { teamMemberId: cell.teamMemberId, date } };

      return cell.status
        ? this.prisma.attendance.upsert({
            where,
            update: { status: cell.status, note: cell.note ?? null },
            create: {
              teamMemberId: cell.teamMemberId,
              date,
              status: cell.status,
              note: cell.note ?? null,
            },
          })
        : this.prisma.attendance.deleteMany({
            where: { teamMemberId: cell.teamMemberId, date },
          });
    });

    await this.prisma.$transaction(operations);
    return { saved: dto.cells.length };
  }

  async createMember(dto: CreateTeamMemberDto) {
    const clash = await this.prisma.teamMember.findFirst({ where: { nickname: dto.nickname } });
    if (clash?.isActive) throw new ConflictException(`"${dto.nickname}" כבר קיים ברשימה`);
    // An earlier version of "remove" only deactivated the person, which left the nickname
    // taken and invisible. Such a leftover is cleared here so the name can be used again.
    if (clash) await this.prisma.teamMember.delete({ where: { id: clash.id } });

    const last = await this.prisma.teamMember.findFirst({ orderBy: { sortOrder: 'desc' } });
    return this.prisma.teamMember.create({
      data: {
        nickname: dto.nickname,
        fullName: dto.fullName ?? null,
        personalNumber: dto.personalNumber ?? null,
        gender: dto.gender,
        sortOrder: dto.sortOrder ?? (last?.sortOrder ?? 0) + 1,
      },
    });
  }

  /**
   * A real delete: the person and every entry of theirs (the FK cascades) are gone,
   * from every week and from the next backup. Removing someone has to free the
   * nickname, otherwise they could never be added again.
   */
  async deleteMember(id: string): Promise<{ deleted: true }> {
    const member = await this.prisma.teamMember.findUnique({ where: { id } });
    if (!member) throw new NotFoundException('חבר הצוות אינו קיים');
    await this.prisma.teamMember.delete({ where: { id } });
    return { deleted: true };
  }

  async updateMember(id: string, dto: UpdateTeamMemberDto) {
    const member = await this.prisma.teamMember.findUnique({ where: { id } });
    if (!member) throw new NotFoundException('חבר הצוות אינו קיים');

    if (dto.nickname && dto.nickname !== member.nickname) {
      const clash = await this.prisma.teamMember.findFirst({ where: { nickname: dto.nickname } });
      if (clash) throw new ConflictException(`"${dto.nickname}" כבר קיים ברשימה`);
    }

    return this.prisma.teamMember.update({
      where: { id },
      data: {
        ...(dto.nickname !== undefined ? { nickname: dto.nickname } : {}),
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.personalNumber !== undefined ? { personalNumber: dto.personalNumber } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }
}
