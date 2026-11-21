import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SignaturesService } from '../signatures/signatures.service';
import type { AuthUser } from '../auth/auth.types';
import type { Paginated } from '../common/pagination.dto';
import type { CollectDto, StoreDto } from './dto/store.dto';
import type { QueryIfsunDto } from './dto/query-ifsun.dto';
import { storedQtyForSignature } from './stored-qty';
import { IFSUN_CATEGORIES } from './ifsun-rules';

/** Signature images are big; the list only needs to know they exist, the detail view fetches them. */
const LIST_OMIT = { storeSignatureImage: true, collectSignatureImage: true } as const;

@Injectable()
export class IfsunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signatures: SignaturesService,
  ) {}

  async findAll(query: QueryIfsunDto): Promise<Paginated<unknown>> {
    const status = query.status ?? 'STORED';
    const q = query.q?.trim();
    const where: Prisma.IfsunRecordWhereInput = {
      ...(status === 'ALL' ? {} : { status }),
      ...(query.from || query.to
        ? { storedAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
        : {}),
      ...(q
        ? {
            OR: [
              { soldierNameSnapshot: { contains: q, mode: 'insensitive' } },
              { itemNameSnapshot: { contains: q, mode: 'insensitive' } },
              { serialSnapshot: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.ifsunRecord.findMany({
        where,
        orderBy: { storedAt: 'desc' },
        omit: LIST_OMIT,
        skip: query.skip ?? 0,
        take: query.take ?? 50,
      }),
      this.prisma.ifsunRecord.count({ where }),
    ]);
    return { rows, total };
  }

  /** One record with both signed halves — the אפסון document. */
  async findOne(id: string) {
    const record = await this.prisma.ifsunRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('רשומת האפסון אינה קיימת');
    return record;
  }

  /** אפסון — the item goes on the armory shelf; the soldier's signature stays open. */
  async store(dto: StoreDto, actor: AuthUser) {
    const { signatureId, quantity, notes } = dto;
    return this.prisma.$transaction(async (tx) => {
      const sig = await tx.signature.findUnique({
        where: { id: signatureId },
        include: { soldier: true, item: true, itemInstance: true },
      });
      if (!sig || sig.returnedAt) throw new NotFoundException('החתימה אינה פעילה');
      if (!IFSUN_CATEGORIES.includes(sig.item.category)) {
        throw new BadRequestException('מאפסנים רק פריטים חשובים (נשק, אופטיקה, רחפן) — לא אבזור, ציוד או תחמושת');
      }

      const already = await storedQtyForSignature(tx, sig.id);
      const free = sig.quantity - already;
      if (free <= 0) throw new ConflictException('הפריט כבר מאופסן');
      const qty = quantity ?? free;
      if (sig.itemInstanceId && qty !== 1) throw new BadRequestException('פריט מסד מאופסן ביחידה אחת');
      if (qty > free) throw new BadRequestException(`ניתן לאפסן עד ${free} יחידות`);

      const name = `${sig.soldier.firstName} ${sig.soldier.lastName}`;
      const record = await tx.ifsunRecord.create({
        data: {
          signatureId: sig.id,
          soldierId: sig.soldierId,
          soldierNameSnapshot: name,
          companySnapshot: sig.soldier.company,
          itemId: sig.itemId,
          itemNameSnapshot: sig.item.name,
          serialSnapshot: sig.itemInstance?.serial ?? null,
          quantity: qty,
          notes: notes ?? null,
          storeSignatureImage: dto.signatureImage,
          storeSignerName: dto.signerName?.trim() || name,
          storedByUserId: actor.id,
          storedByName: actor.displayName,
        },
      });
      await this.movement(tx, 'STORE', record, actor, notes);
      return record;
    });
  }

  /** The soldier takes it back out of the armory. */
  async collect(id: string, dto: CollectDto, actor: AuthUser) {
    const notes = dto.notes;
    return this.prisma.$transaction(async (tx) => {
      const record = await this.openRecord(tx, id);
      const updated = await tx.ifsunRecord.update({
        where: { id },
        data: {
          status: 'COLLECTED',
          closedAt: new Date(),
          closedByName: actor.displayName,
          closeNotes: notes ?? null,
          collectSignatureImage: dto.signatureImage,
          collectSignerName: dto.signerName?.trim() || record.soldierNameSnapshot,
        },
      });
      await this.movement(tx, 'COLLECT', record, actor, notes);
      return updated;
    });
  }

  /**
   * He is not coming back for it: credit the signature. The item was already
   * physically here, so it simply stops being his — nothing changes in the
   * armory's count, which is why זיכוי here is safe to do without a recount.
   */
  async credit(id: string, notes: string | undefined, actor: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const record = await this.openRecord(tx, id);
      const updated = await tx.ifsunRecord.update({
        where: { id },
        data: { status: 'CREDITED', closedAt: new Date(), closedByName: actor.displayName, closeNotes: notes ?? null },
      });
      // Closed first so the shared return logic no longer sees these units as stored.
      await this.signatures.returnInTx(tx, record.signatureId, record.quantity, notes ?? 'זיכוי מאפסון', actor);
      return updated;
    });
  }

  private async openRecord(tx: Prisma.TransactionClient, id: string) {
    const record = await tx.ifsunRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('רשומת האפסון אינה קיימת');
    if (record.status !== 'STORED') throw new ConflictException('הפריט כבר אינו מאופסן');
    return record;
  }

  private movement(
    tx: Prisma.TransactionClient,
    action: 'STORE' | 'COLLECT',
    r: { signatureId: string; soldierId: string; soldierNameSnapshot: string; companySnapshot: Prisma.IfsunRecordCreateInput['companySnapshot']; itemId: string; itemNameSnapshot: string; serialSnapshot: string | null; quantity: number },
    actor: AuthUser,
    notes: string | undefined,
  ) {
    return tx.movement.create({
      data: {
        action,
        soldierId: r.soldierId,
        soldierNameSnapshot: r.soldierNameSnapshot,
        companySnapshot: r.companySnapshot,
        itemId: r.itemId,
        itemNameSnapshot: r.itemNameSnapshot,
        serialSnapshot: r.serialSnapshot,
        quantity: r.quantity,
        performedByUserId: actor.id,
        performedByNameSnapshot: actor.displayName,
        notes: notes ?? null,
        signatureId: r.signatureId,
      },
    });
  }
}
