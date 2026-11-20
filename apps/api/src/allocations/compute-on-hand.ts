import type { Prisma, PrismaClient } from '@prisma/client';

type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * בפועל — what's physically available to plan or sign out, as opposed to
 * מצבה (authorizedQty). Bulk items subtract the admin-typed yamahQty and
 * repairQty directly. Serialized items subtract yamahQty the same way, plus
 * every instance currently flagged IN_REPAIR — it's physically out of the
 * armory the same way a held signature already keeps that מסד off the
 * available list, just via status instead of a signature.
 *
 * Deliberately does NOT additionally subtract held or FAULTY/DISABLED
 * instances here — that's the existing (separate) behavior of this
 * calculation and out of scope for this change.
 */
export async function computeOnHand(
  tx: Tx,
  item: { id: string; isSerialized: boolean; authorizedQty: number; yamahQty: number; repairQty: number },
): Promise<number> {
  if (!item.isSerialized) {
    return item.authorizedQty - item.yamahQty - item.repairQty;
  }
  const inRepair = await tx.itemInstance.count({
    where: { itemId: item.id, status: 'IN_REPAIR' },
  });
  return item.authorizedQty - item.yamahQty - inRepair;
}
