import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CompanyCode } from '../companies/company-code';

type Db = Pick<Prisma.TransactionClient, 'soldier'>;

/** Blank means "no number", so the unique rule never sees an empty string. */
export function normalizeReceiptNo(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/** A number is a company's: the same one in another company is a different note on a different shelf. */
export async function assertReceiptFree(
  db: Db,
  company: CompanyCode,
  receiptNo: string,
  exceptSoldierId?: string,
): Promise<void> {
  const holder = await db.soldier.findFirst({
    where: { company, receiptNo, ...(exceptSoldierId ? { id: { not: exceptSoldierId } } : {}) },
    select: { firstName: true, lastName: true },
  });
  if (holder) {
    throw new ConflictException(`מספר קבלה ${receiptNo} כבר שייך ל${holder.firstName} ${holder.lastName} באותה פלוגה`);
  }
}

/**
 * What to suggest for the next soldier of a company: the highest number in use and the one after it. Only
 * plain numbers count, since a free-text note like "12א" has no successor. Deactivated soldiers count too:
 * their weapon may still be on the shelf under that number.
 */
export async function receiptHint(db: Db, company: CompanyCode): Promise<{ last: string | null; next: string }> {
  const rows = await db.soldier.findMany({ where: { company, receiptNo: { not: null } }, select: { receiptNo: true } });
  let highest: number | null = null;
  for (const { receiptNo } of rows) {
    if (receiptNo && /^\d+$/.test(receiptNo)) highest = Math.max(highest ?? 0, Number(receiptNo));
  }
  return highest === null ? { last: null, next: '1' } : { last: String(highest), next: String(highest + 1) };
}
