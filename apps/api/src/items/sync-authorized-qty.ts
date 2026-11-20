import type { Prisma, PrismaClient } from '@prisma/client';

type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * For a serialized item, מצבה is not an independent number someone types in —
 * it is the count of registered מסדים. Call this after any create/delete of
 * an `itemInstance` so the two can never drift apart again. Bulk items are
 * untouched: their authorizedQty is the only record of quantity that exists.
 */
export async function syncAuthorizedQty(tx: Tx, itemId: string): Promise<void> {
  const item = await tx.item.findUnique({ where: { id: itemId } });
  if (!item || !item.isSerialized) return;

  const count = await tx.itemInstance.count({ where: { itemId } });
  if (count !== item.authorizedQty) {
    await tx.item.update({ where: { id: itemId }, data: { authorizedQty: count } });
  }
}
