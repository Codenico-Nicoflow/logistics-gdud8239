import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Company, Prisma, type Signature } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import type { IssueDto } from './dto/issue.dto';
import type { ReturnDto } from './dto/return.dto';
import type { QuerySignaturesDto } from './dto/query-signatures.dto';
import type { Paginated } from '../common/pagination.dto';

/** Postgres error code for a unique-constraint violation. */
const UNIQUE_VIOLATION = 'P2002';

/** The soldier fields the audit snapshot needs. */
type SoldierRef = {
  id: string;
  firstName: string;
  lastName: string;
  company: Company;
};

@Injectable()
export class SignaturesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QuerySignaturesDto): Promise<Paginated<unknown>> {
    const where: Prisma.SignatureWhereInput = {
      ...(query.includeReturned ? {} : { returnedAt: null }),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.soldierId ? { soldierId: query.soldierId } : {}),
      ...(query.needsAttentionOnly ? { needsAttention: true } : {}),
      ...(query.company ? { soldier: { company: query.company } } : {}),
      ...(query.q
        ? {
            OR: [
              { soldier: { firstName: { contains: query.q, mode: 'insensitive' } } },
              { soldier: { lastName: { contains: query.q, mode: 'insensitive' } } },
              { soldier: { personalNumber: { contains: query.q } } },
              { itemInstance: { serial: { contains: query.q } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.signature.findMany({
        where,
        include: { soldier: true, item: true, itemInstance: true },
        orderBy: [{ signedAt: 'desc' }],
        skip: query.skip ?? 0,
        take: query.take ?? 50,
      }),
      this.prisma.signature.count({ where }),
    ]);
    return { rows, total };
  }

  /**
   * ניפוק — signs an item to a soldier.
   *
   * The signature and its `movements` audit row are written in one transaction:
   * either both land or neither, so the log can never miss an issue. The acting
   * user comes from the JWT, never from the request body.
   */
  async issue(dto: IssueDto, actor: AuthUser): Promise<Signature> {
    const [soldier, item] = await Promise.all([
      this.prisma.soldier.findUnique({ where: { id: dto.soldierId } }),
      this.prisma.item.findUnique({ where: { id: dto.itemId } }),
    ]);

    if (!soldier) throw new NotFoundException('החייל אינו קיים');
    if (!soldier.isActive) throw new BadRequestException('החייל אינו פעיל');
    if (!item) throw new NotFoundException('הפריט אינו קיים');
    if (!item.isActive) throw new BadRequestException('הפריט אינו פעיל');

    // A logistics user scoped to one company may only sign within it.
    if (actor.companyScope && soldier.company !== actor.companyScope) {
      throw new BadRequestException('אין לך הרשאה לחתום על חיילים מפלוגה זו');
    }

    return item.isSerialized
      ? this.issueSerialized(dto, item, soldier, actor)
      : this.issueBulk(dto, item, soldier, actor);
  }

  private async issueSerialized(
    dto: IssueDto,
    item: { id: string; name: string },
    soldier: SoldierRef,
    actor: AuthUser,
  ): Promise<Signature> {
    // The strict rule: unlike the Excel import, the app refuses to create a
    // signature for a serialized item without a serial.
    const serial = dto.serial?.trim();
    if (!serial) {
      throw new BadRequestException(`הפריט "${item.name}" הוא פריט מסד — חובה להזין מסד`);
    }
    if (dto.quantity !== undefined && dto.quantity !== 1) {
      throw new BadRequestException('פריט מסד מנופק ביחידה אחת בכל חתימה');
    }

    const instance = await this.prisma.itemInstance.findUnique({
      where: { itemId_serial: { itemId: item.id, serial } },
      include: { signatures: { where: { returnedAt: null }, include: { soldier: true } } },
    });
    if (!instance) {
      throw new NotFoundException(`מסד "${serial}" אינו קיים עבור ${item.name}`);
    }
    if (instance.status !== 'OK') {
      throw new BadRequestException(`מסד "${serial}" מסומן כ"${instance.status}" ולא ניתן לניפוק`);
    }

    const existing = instance.signatures[0];
    if (existing) {
      const holder = `${existing.soldier.firstName} ${existing.soldier.lastName}`;
      throw new ConflictException(`מסד "${serial}" חתום כבר על ${holder}`);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const signature = await tx.signature.create({
          data: {
            soldierId: soldier.id,
            itemId: item.id,
            itemInstanceId: instance.id,
            quantity: 1,
            receiptNo: dto.receiptNo ?? null,
            notes: dto.notes ?? null,
            signedByUserId: actor.id,
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
            serialSnapshot: serial,
            quantity: 1,
            receiptNo: dto.receiptNo ?? null,
            performedByUserId: actor.id,
            performedByNameSnapshot: actor.displayName,
            notes: dto.notes ?? null,
            signatureId: signature.id,
          },
        });

        return signature;
      });
    } catch (e) {
      // The partial unique index is the real guarantee; this converts a race
      // between two concurrent issues into a clear message.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === UNIQUE_VIOLATION) {
        throw new ConflictException(`מסד "${serial}" נחתם על חייל אחר בו זמנית. נסה שוב.`);
      }
      throw e;
    }
  }

  private async issueBulk(
    dto: IssueDto,
    item: { id: string; name: string },
    soldier: SoldierRef,
    actor: AuthUser,
  ): Promise<Signature> {
    if (dto.serial) {
      throw new BadRequestException(`הפריט "${item.name}" אינו פריט מסד — אין להזין מסד`);
    }
    const quantity = dto.quantity ?? 1;

    return this.prisma.$transaction(async (tx) => {
      // One open signature per soldier+item; signing more increments it, which
      // matches how the Excel counts non-serialized items.
      const existing = await tx.signature.findFirst({
        where: { soldierId: soldier.id, itemId: item.id, returnedAt: null },
      });

      const signature = existing
        ? await tx.signature.update({
            where: { id: existing.id },
            data: {
              quantity: { increment: quantity },
              ...(dto.receiptNo ? { receiptNo: dto.receiptNo } : {}),
            },
          })
        : await tx.signature.create({
            data: {
              soldierId: soldier.id,
              itemId: item.id,
              quantity,
              receiptNo: dto.receiptNo ?? null,
              notes: dto.notes ?? null,
              signedByUserId: actor.id,
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
          quantity,
          receiptNo: dto.receiptNo ?? null,
          performedByUserId: actor.id,
          performedByNameSnapshot: actor.displayName,
          notes: dto.notes ?? null,
          signatureId: signature.id,
        },
      });

      return signature;
    });
  }

  /**
   * זיכוי — returns an item.
   *
   * A serialized item is returned whole. A non-serialized one may be returned
   * partially, which decrements the quantity and leaves the signature open.
   */
  async return(signatureId: string, dto: ReturnDto, actor: AuthUser): Promise<Signature> {
    const signature = await this.prisma.signature.findUnique({
      where: { id: signatureId },
      include: { soldier: true, item: true, itemInstance: true },
    });
    if (!signature) throw new NotFoundException('החתימה אינה קיימת');
    if (signature.returnedAt) throw new BadRequestException('החתימה זוכתה כבר');

    if (actor.companyScope && signature.soldier.company !== actor.companyScope) {
      throw new BadRequestException('אין לך הרשאה לזכות חיילים מפלוגה זו');
    }

    const isSerialized = signature.itemInstanceId !== null;
    const returnQty = dto.quantity ?? signature.quantity;

    if (isSerialized && returnQty !== 1) {
      throw new BadRequestException('פריט מסד מזוכה ביחידה אחת');
    }
    if (returnQty > signature.quantity) {
      throw new BadRequestException(
        `לא ניתן לזכות ${returnQty} יחידות — חתומות ${signature.quantity} בלבד`,
      );
    }

    const isPartial = !isSerialized && returnQty < signature.quantity;

    return this.prisma.$transaction(async (tx) => {
      const updated = isPartial
        ? await tx.signature.update({
            where: { id: signature.id },
            data: { quantity: { decrement: returnQty } },
          })
        : await tx.signature.update({
            where: { id: signature.id },
            data: { returnedAt: new Date(), returnedByUserId: actor.id },
          });

      await tx.movement.create({
        data: {
          action: 'RETURN',
          soldierId: signature.soldierId,
          soldierNameSnapshot: `${signature.soldier.firstName} ${signature.soldier.lastName}`,
          companySnapshot: signature.soldier.company,
          itemId: signature.itemId,
          itemNameSnapshot: signature.item.name,
          serialSnapshot: signature.itemInstance?.serial ?? null,
          quantity: returnQty,
          receiptNo: signature.receiptNo,
          performedByUserId: actor.id,
          performedByNameSnapshot: actor.displayName,
          notes: dto.notes ?? null,
          signatureId: signature.id,
        },
      });

      return updated;
    });
  }

  /**
   * Fills in a serial that the Excel import could not supply, clearing the
   * "דרוש טיפול" flag. Recorded as a movement so the correction is auditable.
   */
  async backfillSerial(signatureId: string, serial: string, actor: AuthUser): Promise<Signature> {
    const signature = await this.prisma.signature.findUnique({
      where: { id: signatureId },
      include: { soldier: true, item: true },
    });
    if (!signature) throw new NotFoundException('החתימה אינה קיימת');
    if (signature.returnedAt) throw new BadRequestException('החתימה זוכתה כבר');
    if (signature.itemInstanceId) throw new BadRequestException('לחתימה זו יש כבר מסד');
    if (!signature.item.isSerialized) {
      throw new BadRequestException(`הפריט "${signature.item.name}" אינו פריט מסד`);
    }

    const trimmed = serial.trim();
    if (!trimmed) throw new BadRequestException('נדרש מסד');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const instance = await tx.itemInstance.upsert({
          where: { itemId_serial: { itemId: signature.itemId, serial: trimmed } },
          update: {},
          create: { itemId: signature.itemId, serial: trimmed },
        });

        const updated = await tx.signature.update({
          where: { id: signature.id },
          data: { itemInstanceId: instance.id, needsAttention: false },
        });

        await tx.movement.create({
          data: {
            action: 'ISSUE',
            soldierId: signature.soldierId,
            soldierNameSnapshot: `${signature.soldier.firstName} ${signature.soldier.lastName}`,
            companySnapshot: signature.soldier.company,
            itemId: signature.itemId,
            itemNameSnapshot: signature.item.name,
            serialSnapshot: trimmed,
            quantity: signature.quantity,
            performedByUserId: actor.id,
            performedByNameSnapshot: actor.displayName,
            notes: `השלמת מסד חסר (יבוא מאקסל)`,
            signatureId: signature.id,
          },
        });

        // Close the matching import issue, if one is open.
        await tx.importIssue.updateMany({
          where: { signatureId: signature.id, kind: 'MISSING_SERIAL', resolvedAt: null },
          data: { resolvedAt: new Date() },
        });

        return updated;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === UNIQUE_VIOLATION) {
        throw new ConflictException(`מסד "${trimmed}" חתום כבר על חייל אחר`);
      }
      throw e;
    }
  }
}
