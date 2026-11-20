import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { syncAuthorizedQty } from '../items/sync-authorized-qty';
import type { SubmitIntakeDto } from './dto/submit-intake.dto';

/**
 * קליטת ציוד — registering what actually arrived (from ימ"ח, חטיבה, or any
 * other source) before a תקופת שרות, so הקצאה/ניפוק work against real stock
 * rather than a spreadsheet. The source sheet names things its own way
 * ("MMX3", "לאור 3*"), so the review grid resolves every row to a real
 * catalog item before it ever reaches this service — nothing here guesses a
 * match.
 *
 * No `Movement` row is written: that log is deliberately the two actions a
 * soldier is party to, issuing and returning. Stock arriving at the armory
 * touches no soldier, so it is not one of them.
 */
@Injectable()
export class IntakeService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(dto: SubmitIntakeDto) {
    const itemIds = [...new Set(dto.rows.map((r) => r.itemId))];
    const items = await this.prisma.item.findMany({ where: { id: { in: itemIds } } });
    const itemById = new Map(items.map((i) => [i.id, i]));

    for (const row of dto.rows) {
      const item = itemById.get(row.itemId);
      if (!item) throw new NotFoundException('אחד הפריטים בשורות אינו קיים');
      if (row.kind === 'serial' && !row.serial?.trim()) {
        throw new BadRequestException(`שורת מסד ל"${item.name}" חסרה מסד`);
      }
      if (row.kind === 'bulk' && !row.quantity) {
        throw new BadRequestException(`שורת כמות ל"${item.name}" חסרה כמות`);
      }
      if (row.kind === 'bulk' && item.isSerialized) {
        throw new BadRequestException(
          `"${item.name}" דורש מסד — לא ניתן לקלוט אותו ככמותי`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      let serialsCreated = 0;
      let serialsSkipped = 0;
      const bulkTotals = new Map<string, number>();
      const touchedSerializedItems = new Set<string>();

      for (const row of dto.rows) {
        if (row.kind === 'serial') {
          const serial = row.serial!.trim();
          const existing = await tx.itemInstance.findUnique({
            where: { itemId_serial: { itemId: row.itemId, serial } },
          });
          if (existing) {
            serialsSkipped++;
            continue;
          }
          await tx.itemInstance.create({
            data: { itemId: row.itemId, serial, status: 'OK', notes: row.notes?.trim() || null },
          });
          serialsCreated++;
          touchedSerializedItems.add(row.itemId);
        } else {
          bulkTotals.set(row.itemId, (bulkTotals.get(row.itemId) ?? 0) + row.quantity!);
        }
      }

      for (const itemId of touchedSerializedItems) {
        await syncAuthorizedQty(tx, itemId);
      }

      for (const [itemId, addQty] of bulkTotals) {
        await tx.item.update({
          where: { id: itemId },
          data: { authorizedQty: { increment: addQty } },
        });
      }

      return {
        serialsCreated,
        serialsSkipped,
        bulkItemsUpdated: bulkTotals.size,
      };
    });
  }
}
