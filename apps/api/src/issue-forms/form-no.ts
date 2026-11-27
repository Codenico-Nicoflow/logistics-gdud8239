import type { PrismaClient } from '@prisma/client';

/**
 * The next 1008 number for the current battalion, taken from its own counter instead of a database-wide
 * sequence, so every battalion's forms run 1, 2, 3 on their own.
 *
 * Call it inside the transaction that creates the form: the increment holds the counter row's lock until
 * the transaction ends, so two forms cannot take the same number, and a form that fails to save rolls
 * the number back with it (no gap on the printed paperwork).
 *
 * The counter is never trusted alone: the number is also at least one above the highest form already on
 * file. While the previous version of the app is still serving during a deploy it can insert forms from
 * the old sequence, and a counter that fell behind would then collide on every attempt. Taking the
 * higher of the two makes that impossible, and repairs any drift on the next form.
 *
 * A battalion must have a counter row from the moment it exists — creating one is part of creating a
 * battalion. `findFirstOrThrow` fails loudly otherwise rather than inventing a number.
 */
export async function takeFormNo(tx: Pick<PrismaClient, 'formCounter' | 'issueForm'>): Promise<number> {
  const { battalionId } = await tx.formCounter.findFirstOrThrow({ select: { battalionId: true } });
  // The increment comes first: it takes the counter row's lock, so concurrent callers queue here and each
  // sees the previous one's committed number. Reading the counter and writing it back later would let two
  // forms read the same value.
  const bumped = await tx.formCounter.update({
    where: { battalionId },
    data: { nextFormNo: { increment: 1 } },
    select: { nextFormNo: true },
  });
  let formNo = bumped.nextFormNo - 1;

  const { _max } = await tx.issueForm.aggregate({ _max: { formNo: true } });
  const highest = _max.formNo ?? 0;
  if (formNo <= highest) {
    formNo = highest + 1;
    await tx.formCounter.update({ where: { battalionId }, data: { nextFormNo: formNo + 1 } });
  }
  return formNo;
}
