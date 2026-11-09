import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import type { CreateIssueFormDto } from './dto/create-issue-form.dto';

const UNIQUE_VIOLATION = 'P2002';

/**
 * `טופס 1008` — issuing a soldier everything at once, against one signature.
 *
 * The paper form this replaces covers a whole handover: a weapon with its מסד
 * and the magazines, sling and cleaning kit that go with it. Issuing those as
 * separate actions would leave no single thing the soldier signed, which is
 * the point of the form.
 *
 * Every line is written in one transaction with the form itself. A מסד that
 * turns out to be held by someone else fails the whole handover rather than
 * leaving half of it recorded — the soldier signed for a list, so the list is
 * what lands or does not.
 */
@Injectable()
export class IssueFormsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateIssueFormDto, actor: AuthUser) {
    const soldier = await this.prisma.soldier.findUnique({ where: { id: dto.soldierId } });
    if (!soldier) throw new NotFoundException('החייל אינו קיים');
    if (!soldier.isActive) throw new BadRequestException('החייל אינו פעיל');
    if (actor.companyScope && soldier.company !== actor.companyScope) {
      throw new BadRequestException('אין לך הרשאה לחתום על חיילים מפלוגה זו');
    }

    const items = await this.prisma.item.findMany({
      where: { id: { in: dto.lines.map((l) => l.itemId) } },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));

    // Validated up front, before anything is written: the operator gets one
    // clear reason rather than a partially-applied handover.
    for (const line of dto.lines) {
      const item = itemById.get(line.itemId);
      if (!item) throw new NotFoundException('אחד הפריטים אינו קיים');
      if (!item.isActive) throw new BadRequestException(`הפריט "${item.name}" אינו פעיל`);

      const serial = line.serial?.trim();
      if (item.isSerialized && !serial) {
        throw new BadRequestException(`הפריט "${item.name}" הוא פריט מסד — חובה להזין מסד`);
      }
      if (serial && line.quantity !== 1) {
        throw new BadRequestException(`פריט עם מסד מנופק ביחידה אחת (${item.name})`);
      }
    }

    // A מסד can appear once on a form: the same physical weapon cannot be
    // handed over twice in one handover.
    const serials = dto.lines
      .map((l) => (l.serial ? `${l.itemId}|${l.serial.trim()}` : null))
      .filter((s): s is string => s !== null);
    if (new Set(serials).size !== serials.length) {
      throw new BadRequestException('אותו מסד מופיע יותר מפעם אחת בטופס');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const form = await tx.issueForm.create({
          data: {
            soldierId: soldier.id,
            soldierNameSnapshot: `${soldier.firstName} ${soldier.lastName}`,
            personalNumberSnapshot: soldier.personalNumber,
            companySnapshot: soldier.company,
            phoneSnapshot: soldier.phone,
            signatureImage: dto.signatureImage,
            issuedByUserId: actor.id,
            issuedByNameSnapshot: actor.displayName,
            notes: dto.notes ?? null,
          },
        });

        for (const line of dto.lines) {
          const item = itemById.get(line.itemId);
          if (!item) continue;
          const serial = line.serial?.trim();

          let itemInstanceId: string | null = null;
          if (serial) {
            // The register is still being built from the signatures as they
            // are entered, so an unknown מסד is recorded rather than refused.
            const instance = await tx.itemInstance.upsert({
              where: { itemId_serial: { itemId: item.id, serial } },
              update: {},
              create: { itemId: item.id, serial },
            });
            if (instance.status !== 'OK') {
              throw new BadRequestException(
                `מסד "${serial}" מסומן כ"${instance.status}" ולא ניתן לניפוק`,
              );
            }
            const held = await tx.signature.findFirst({
              where: { itemInstanceId: instance.id, returnedAt: null },
              include: { soldier: true },
            });
            if (held) {
              throw new ConflictException(
                `מסד "${serial}" חתום כבר על ${held.soldier.firstName} ${held.soldier.lastName}`,
              );
            }
            itemInstanceId = instance.id;
          }

          // A bulk item the soldier already holds increments rather than
          // opening a second row, matching how ניפוק behaves elsewhere.
          const existing = itemInstanceId
            ? null
            : await tx.signature.findFirst({
                where: { soldierId: soldier.id, itemId: item.id, returnedAt: null },
              });

          const signature = existing
            ? await tx.signature.update({
                where: { id: existing.id },
                data: { quantity: { increment: line.quantity } },
              })
            : await tx.signature.create({
                data: {
                  soldierId: soldier.id,
                  itemId: item.id,
                  itemInstanceId,
                  quantity: line.quantity,
                  signedByUserId: actor.id,
                },
              });

          await tx.issueFormLine.create({
            data: {
              issueFormId: form.id,
              itemId: item.id,
              itemNameSnapshot: item.name,
              serialSnapshot: serial ?? null,
              quantity: line.quantity,
              signatureId: signature.id,
            },
          });

          await tx.movement.create({
            data: {
              action: 'ISSUE',
              soldierId: soldier.id,
              soldierNameSnapshot: `${soldier.firstName} ${soldier.lastName}`,
              companySnapshot: soldier.company,
              itemId: item.id,
              itemNameSnapshot: item.name,
              serialSnapshot: serial ?? null,
              quantity: line.quantity,
              performedByUserId: actor.id,
              performedByNameSnapshot: actor.displayName,
              signatureId: signature.id,
            },
          });
        }

        return tx.issueForm.findUniqueOrThrow({
          where: { id: form.id },
          include: { lines: { orderBy: { itemNameSnapshot: 'asc' } } },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === UNIQUE_VIOLATION) {
        throw new ConflictException('אחד המסדים נחתם על חייל אחר בו זמנית. נסה שוב.');
      }
      throw e;
    }
  }

  /** Forms for the list view, newest first. The signature image is omitted. */
  async findAll(query: { soldierId?: string; take?: number; skip?: number }) {
    const where = query.soldierId ? { soldierId: query.soldierId } : {};
    const [rows, total] = await Promise.all([
      this.prisma.issueForm.findMany({
        where,
        orderBy: { signedAt: 'desc' },
        take: query.take ?? 50,
        skip: query.skip ?? 0,
        select: {
          id: true,
          formNo: true,
          soldierNameSnapshot: true,
          personalNumberSnapshot: true,
          companySnapshot: true,
          signedAt: true,
          issuedByNameSnapshot: true,
          lines: { select: { itemNameSnapshot: true, serialSnapshot: true, quantity: true } },
        },
      }),
      this.prisma.issueForm.count({ where }),
    ]);
    return { rows, total };
  }

  findOne(id: string) {
    return this.prisma.issueForm.findUniqueOrThrow({
      where: { id },
      include: { lines: { orderBy: { itemNameSnapshot: 'asc' } } },
    });
  }
}
