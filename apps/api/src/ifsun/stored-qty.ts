import type { Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'ifsunRecord'>;

/**
 * Units currently sitting in the armory under אפסון, per item.
 *
 * Every "how many are out with soldiers" figure (מסכם, summary) subtracts
 * this: a stored weapon is still signed to its soldier but is on the shelf,
 * so counting it as "out" would leave the nightly ספירה one weapon over.
 */
export async function storedQtyByItem(db: Db): Promise<Map<string, number>> {
  const rows = await db.ifsunRecord.groupBy({
    by: ['itemId'],
    where: { status: 'STORED' },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.itemId, r._sum.quantity ?? 0]));
}

/** Units of one signature currently stored — a signature cannot be returned or edited away while any are. */
export async function storedQtyForSignature(db: Db, signatureId: string): Promise<number> {
  const r = await db.ifsunRecord.aggregate({
    where: { signatureId, status: 'STORED' },
    _sum: { quantity: true },
  });
  return r._sum.quantity ?? 0;
}
