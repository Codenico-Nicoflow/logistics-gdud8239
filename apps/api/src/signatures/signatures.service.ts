import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Company, Prisma, type Item, type ItemInstance, type Signature, type Soldier } from '@prisma/client';
import { storedQtyForSignature } from '../ifsun/stored-qty';
import { PrismaService } from '../prisma/prisma.service';
import { syncAuthorizedQty } from '../items/sync-authorized-qty';
import { findOperationalServicePeriod } from '../common/active-service-period';
import type { AuthUser } from '../auth/auth.types';
import type { IssueDto } from './dto/issue.dto';
import type { ReturnDto } from './dto/return.dto';
import type { QuerySignaturesDto } from './dto/query-signatures.dto';
import type { Paginated } from '../common/pagination.dto';

/** Postgres error code for a unique-constraint violation. */
const UNIQUE_VIOLATION = 'P2002';

/**
 * Search matches a soldier's name, מ.א. or an item's מסד.
 *
 * A full name is split so "נריה אדלר" matches, since first and last names are
 * separate columns and a plain `contains` on either would miss it.
 */
function searchClauses(raw: string): Prisma.SignatureWhereInput[] {
  const q = raw.trim();
  const clauses: Prisma.SignatureWhereInput[] = [
    { soldier: { firstName: { contains: q, mode: 'insensitive' } } },
    { soldier: { lastName: { contains: q, mode: 'insensitive' } } },
    { soldier: { personalNumber: { contains: q } } },
    { itemInstance: { serial: { contains: q, mode: 'insensitive' } } },
  ];

  const parts = q.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const [first, ...rest] = parts;
    const last = rest.join(' ');
    clauses.push({
      AND: [
        { soldier: { firstName: { contains: first as string, mode: 'insensitive' } } },
        { soldier: { lastName: { contains: last, mode: 'insensitive' } } },
      ],
    });
    // Also the other way round, since people write the surname first too.
    clauses.push({
      AND: [
        { soldier: { lastName: { contains: first as string, mode: 'insensitive' } } },
        { soldier: { firstName: { contains: last, mode: 'insensitive' } } },
      ],
    });
  }
  return clauses;
}

/** The soldier fields the audit snapshot needs. */
type SoldierRef = {
  id: string;
  firstName: string;
  lastName: string;
  company: Company;
};

/** The same search as `searchClauses`, expressed against a soldier row. */
function soldierClauses(raw: string): Prisma.SoldierWhereInput[] {
  const q = raw.trim();
  const clauses: Prisma.SoldierWhereInput[] = [
    { firstName: { contains: q, mode: 'insensitive' } },
    { lastName: { contains: q, mode: 'insensitive' } },
    { personalNumber: { contains: q } },
    // A מסד identifies a weapon, and the person holding it is the answer.
    { signatures: { some: { returnedAt: null, itemInstance: { serial: { contains: q, mode: 'insensitive' } } } } },
  ];

  const parts = q.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const [first, ...rest] = parts;
    clauses.push({
      AND: [
        { firstName: { contains: first as string, mode: 'insensitive' } },
        { lastName: { contains: rest.join(' '), mode: 'insensitive' } },
      ],
    });
  }
  return clauses;
}

@Injectable()
export class SignaturesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QuerySignaturesDto): Promise<Paginated<unknown>> {
    const where: Prisma.SignatureWhereInput = {
      ...(query.includeReturned ? {} : { returnedAt: null }),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.soldierId ? { soldierId: query.soldierId } : {}),
      ...(query.company ? { soldier: { company: query.company } } : {}),
      ...(query.q ? { OR: searchClauses(query.q) } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.signature.findMany({
        where,
        include: {
          soldier: true,
          item: true,
          itemInstance: true,
          ifsunRecords: { where: { status: 'STORED' }, select: { id: true, quantity: true, storedAt: true } },
        },
        orderBy: [{ signedAt: 'desc' }],
        skip: query.skip ?? 0,
        take: query.take ?? 50,
      }),
      this.prisma.signature.count({ where }),
    ]);
    return { rows, total };
  }

  /**
   * חתימות grouped by soldier — one row per person, not per item.
   *
   * Once a handover is a rifle plus five magazines, a sling and a cleaning
   * kit, a flat list of signatures is five rows for one event and thousands
   * overall. The question the screen answers is "who holds what", and that is
   * one row per soldier with their items underneath.
   */
  async holders(query: QuerySignaturesDto): Promise<Paginated<unknown>> {
    const where: Prisma.SoldierWhereInput = {
      signatures: { some: { returnedAt: null } },
      ...(query.company ? { company: query.company } : {}),
      ...(query.itemId ? { signatures: { some: { returnedAt: null, itemId: query.itemId } } } : {}),
      ...(query.q ? { OR: soldierClauses(query.q) } : {}),
    };

    const [soldiers, total] = await Promise.all([
      this.prisma.soldier.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: query.skip ?? 0,
        take: query.take ?? 50,
        include: {
          signatures: {
            where: { returnedAt: null },
            include: {
              item: true,
              itemInstance: true,
              ifsunRecords: { where: { status: 'STORED' }, select: { id: true, quantity: true, storedAt: true } },
            },
            orderBy: [{ signedAt: 'desc' }],
          },
          issueForms: {
            orderBy: { signedAt: 'desc' },
            select: { id: true, formNo: true, signedAt: true },
          },
        },
      }),
      this.prisma.soldier.count({ where }),
    ]);

    return {
      rows: soldiers.map((s) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        personalNumber: s.personalNumber,
        phone: s.phone,
        company: s.company,
        itemCount: s.signatures.length,
        needsAttention: s.signatures.some((sig) => sig.needsAttention),
        signatures: s.signatures,
        forms: s.issueForms,
      })),
      total,
    };
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

    // A weapon can only go to a soldier שלישות has marked מחויל for a
    // תעסוקה that is both ACTIVE and actually running today — status from a
    // previous taasuka doesn't carry over, and a planned-ahead-of-time one
    // doesn't count until it's actually started.
    if (item.category === 'WEAPON') {
      const activePeriod = await findOperationalServicePeriod(this.prisma);
      if (!activePeriod) {
        throw new BadRequestException('אין תעסוקה מבצעית פעילה כעת — לא ניתן לנפק נשק');
      }
      const enlistment = await this.prisma.soldierEnlistment.findUnique({
        where: { soldierId_servicePeriodId: { soldierId: soldier.id, servicePeriodId: activePeriod.id } },
      });
      if (!enlistment) {
        throw new BadRequestException(
          `${soldier.firstName} ${soldier.lastName} אינו מחויל לתקופת השרות הנוכחית — לא ניתן לנפק נשק`,
        );
      }
    }

    // An item flagged `isSerialized` MUST have a serial. An item not flagged
    // may still be given one — staff do track מסד on items the catalog calls
    // bulk, and refusing it only pushed the number into a free-text note. So
    // the route is chosen by whether a serial is present, with the flag
    // deciding only whether its absence is an error.
    return item.isSerialized || dto.serial?.trim()
      ? this.issueSerialized(dto, item, soldier, actor)
      : this.issueBulk(dto, item, soldier, actor);
  }

  private async issueSerialized(
    dto: IssueDto,
    item: { id: string; name: string; isSerialized: boolean },
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

    let instance = await this.prisma.itemInstance.findUnique({
      where: { itemId_serial: { itemId: item.id, serial } },
      include: { signatures: { where: { returnedAt: null }, include: { soldier: true } } },
    });
    if (!instance) {
      // A מסד the register has not seen is recorded rather than rejected. The
      // armory's instance list was never complete — it is being built from the
      // signatures as they are entered — so refusing an unknown serial would
      // block real work to protect a register that does not yet exist. The
      // one-active-holder index still applies the moment the serial is known,
      // which is the guarantee that actually matters.
      instance = {
        ...(await this.prisma.itemInstance.create({
          data: { itemId: item.id, serial },
        })),
        signatures: [],
      };
      await syncAuthorizedQty(this.prisma, item.id);
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
    const stored = await storedQtyForSignature(this.prisma, signature.id);
    const returnQty = dto.quantity ?? signature.quantity - stored;
    if (stored > 0 && (returnQty < 1 || returnQty > signature.quantity - stored)) {
      // Crediting a stored unit here would leave the אפסון record pointing at nothing;
      // it is credited from the אפסון screen, which closes the record too.
      throw new BadRequestException('הפריט מאופסן — יש לזכות אותו ממסך האפסון');
    }

    if (isSerialized && returnQty !== 1) {
      throw new BadRequestException('פריט מסד מזוכה ביחידה אחת');
    }
    if (returnQty > signature.quantity) {
      throw new BadRequestException(
        `לא ניתן לזכות ${returnQty} יחידות — חתומות ${signature.quantity} בלבד`,
      );
    }

    return this.prisma.$transaction((tx) => this.applyReturn(tx, signature, returnQty, dto.notes ?? null, actor));
  }

  /** זיכוי from inside another transaction (the אפסון screen's credit) — same rules, same movement row. */
  async returnInTx(
    tx: Prisma.TransactionClient,
    signatureId: string,
    quantity: number,
    notes: string,
    actor: AuthUser,
  ): Promise<Signature> {
    const signature = await tx.signature.findUnique({
      where: { id: signatureId },
      include: { soldier: true, item: true, itemInstance: true },
    });
    if (!signature || signature.returnedAt) throw new NotFoundException('החתימה אינה פעילה');
    return this.applyReturn(tx, signature, quantity, notes, actor);
  }

  private async applyReturn(
    tx: Prisma.TransactionClient,
    signature: Signature & { soldier: Soldier; item: Item; itemInstance: ItemInstance | null },
    returnQty: number,
    notes: string | null,
    actor: AuthUser,
  ): Promise<Signature> {
    const isSerialized = signature.itemInstanceId !== null;
    const isPartial = !isSerialized && returnQty < signature.quantity;
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
        notes,
        signatureId: signature.id,
      },
    });

    return updated;
  }
}
