import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Company, IssueKind, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { COMPANY_FROM_HE, COMPANY_HE, SHEET } from './excel.constants';

/** Placeholder item for rows whose `סוג` column is empty. */
const UNKNOWN_ITEM_NAME = 'לא מזוהה';
/** Rows with an unrecognised company land here until corrected. */
const FALLBACK_COMPANY: Company = 'HQ';

type RawRow = {
  rowNumber: number;
  itemName: string;
  serial: string | null;
  firstName: string;
  lastName: string;
  company: string;
  phone: string | null;
  personalNumber: string | null;
  receiptNo: string | null;
  notes: string | null;
  platoon: string | null;
};

type PendingIssue = {
  kind: IssueKind;
  rowNumber: number;
  rawRow: string;
  detail: string;
  signatureId?: string;
  soldierId?: string;
  itemId?: string;
  serial?: string;
};

export type ImportPreview = {
  totalRows: number;
  soldiers: number;
  signatures: number;
  instances: number;
  mergedIntoQuantity: number;
  issues: { kind: IssueKind; count: number; examples: string[] }[];
  perItem: { itemName: string; count: number }[];
  perCompany: { company: string; count: number }[];
};

export type ImportResult = ImportPreview & {
  snapshotId: string | null;
  committed: true;
};

function cellText(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return '';
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'richText' in v) {
    return v.richText.map((r) => r.text).join('').trim();
  }
  if (typeof v === 'object' && 'text' in v) return String(v.text).trim();
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '').trim();
  return String(v).trim();
}

/**
 * Restores the signature data from a workbook.
 *
 * Policy, set deliberately: import EVERYTHING, including rows with problems,
 * and record each problem so the "דרוש טיפול" tab can list it. The source file
 * is the record of reality, errors included, and silently dropping rows would
 * lose track of equipment that is genuinely signed out.
 *
 * The strict rule (a serialized item must have a serial) applies to signatures
 * created through the app, not to this import.
 */
@Injectable()
export class ExcelImportService {
  private readonly logger = new Logger(ExcelImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async readRows(buffer: Buffer): Promise<RawRow[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);

    const sheet = wb.getWorksheet(SHEET.signatures);
    if (!sheet) {
      const names = wb.worksheets.map((w) => w.name).join(', ');
      throw new BadRequestException(
        `גיליון "${SHEET.signatures}" לא נמצא בקובץ. גיליונות שנמצאו: ${names}`,
      );
    }

    const rows: RawRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header
      const itemName = cellText(row.getCell(1));
      const serial = cellText(row.getCell(2));
      const firstName = cellText(row.getCell(3));
      const lastName = cellText(row.getCell(4));
      if (!itemName && !serial && !firstName && !lastName) return; // blank row
      rows.push({
        rowNumber,
        itemName,
        serial: serial || null,
        firstName,
        lastName,
        company: cellText(row.getCell(5)),
        phone: cellText(row.getCell(6)) || null,
        personalNumber: cellText(row.getCell(7)) || null,
        receiptNo: cellText(row.getCell(8)) || null,
        notes: cellText(row.getCell(9)) || null,
        platoon: cellText(row.getCell(10)) || null,
      });
    });

    if (rows.length === 0) {
      throw new BadRequestException(`גיליון "${SHEET.signatures}" ריק`);
    }
    return rows;
  }

  /**
   * Validates without writing anything: what would be created, and what would
   * be flagged. Shown to the operator before they confirm a wipe-and-replace.
   */
  async preview(buffer: Buffer): Promise<ImportPreview> {
    const rows = await this.readRows(buffer);
    const items = await this.prisma.item.findMany();
    const itemByName = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      itemByName.set(item.name, item);
      for (const alias of item.aliases) itemByName.set(alias, item);
    }

    const issues: PendingIssue[] = [];
    const soldierKeys = new Set<string>();
    const serialHolders = new Map<string, string>();
    const bulkKeys = new Set<string>();
    const perItem = new Map<string, number>();
    const perCompany = new Map<string, number>();
    let signatures = 0;
    let instances = 0;
    let merged = 0;

    for (const r of rows) {
      const raw = `${r.itemName} | ${r.serial ?? ''} | ${r.firstName} ${r.lastName} | ${r.company}`;
      const item = itemByName.get(r.itemName);
      const itemName = item?.name ?? UNKNOWN_ITEM_NAME;

      if (!item) {
        issues.push({
          kind: 'UNKNOWN_ITEM',
          rowNumber: r.rowNumber,
          rawRow: raw,
          detail: r.itemName
            ? `שם פריט לא קיים בקטלוג: "${r.itemName}"`
            : 'עמודת "סוג" ריקה — לא ידוע על איזה פריט החייל חתום',
          serial: r.serial ?? undefined,
        });
      }

      const companyHe = r.company.trim();
      const company = COMPANY_FROM_HE[companyHe];
      if (!company) {
        issues.push({
          kind: 'UNKNOWN_COMPANY',
          rowNumber: r.rowNumber,
          rawRow: raw,
          detail: companyHe
            ? `פלוגה לא מזוהה: "${companyHe}" — תשויך זמנית למפקדה`
            : 'עמודת "פלוגה" ריקה — תשויך זמנית למפקדה',
        });
      }
      if (!r.firstName && !r.lastName) {
        issues.push({
          kind: 'MISSING_SOLDIER_NAME',
          rowNumber: r.rowNumber,
          rawRow: raw,
          detail: 'שורה ללא שם חייל',
          serial: r.serial ?? undefined,
        });
      }

      const soldierKey = r.personalNumber
        ? `pn:${r.personalNumber}`
        : `nm:${r.firstName}|${r.lastName}|${companyHe}`;
      soldierKeys.add(soldierKey);

      const resolvedCompany = company ?? FALLBACK_COMPANY;
      perItem.set(itemName, (perItem.get(itemName) ?? 0) + 1);
      perCompany.set(companyHe || '(ריק)', (perCompany.get(companyHe || '(ריק)') ?? 0) + 1);

      if (item?.isSerialized) {
        if (!r.serial) {
          issues.push({
            kind: 'MISSING_SERIAL',
            rowNumber: r.rowNumber,
            rawRow: raw,
            detail: `פריט "${item.name}" דורש מסד, והשדה ריק באקסל`,
          });
          // Still imported, as a flagged bulk-style row.
          if (bulkKeys.has(`${soldierKey}|${itemName}`)) merged++;
          else {
            bulkKeys.add(`${soldierKey}|${itemName}`);
            signatures++;
          }
          continue;
        }
        const instanceKey = `${item.id}|${r.serial}`;
        const holder = serialHolders.get(instanceKey);
        if (holder && holder !== soldierKey) {
          issues.push({
            kind: 'DUPLICATE_SERIAL',
            rowNumber: r.rowNumber,
            rawRow: raw,
            detail: `מסד "${r.serial}" של "${item.name}" מופיע על יותר מחייל אחד`,
            serial: r.serial,
          });
          signatures++;
          continue;
        }
        if (holder === soldierKey) {
          issues.push({
            kind: 'DUPLICATE_ROW',
            rowNumber: r.rowNumber,
            rawRow: raw,
            detail: `שורה כפולה: אותו חייל ואותו מסד "${r.serial}"`,
            serial: r.serial,
          });
          continue;
        }
        serialHolders.set(instanceKey, soldierKey);
        instances++;
        signatures++;
      } else {
        const bulkKey = `${soldierKey}|${itemName}`;
        if (bulkKeys.has(bulkKey)) merged++;
        else {
          bulkKeys.add(bulkKey);
          signatures++;
        }
      }
      void resolvedCompany;
    }

    const byKind = new Map<IssueKind, PendingIssue[]>();
    for (const i of issues) {
      const list = byKind.get(i.kind) ?? [];
      list.push(i);
      byKind.set(i.kind, list);
    }

    return {
      totalRows: rows.length,
      soldiers: soldierKeys.size,
      signatures,
      instances,
      mergedIntoQuantity: merged,
      issues: [...byKind.entries()]
        .map(([kind, list]) => ({
          kind,
          count: list.length,
          examples: list.slice(0, 5).map((i) => `שורה ${i.rowNumber}: ${i.detail}`),
        }))
        .sort((a, b) => b.count - a.count),
      perItem: [...perItem.entries()]
        .map(([itemName, count]) => ({ itemName, count }))
        .sort((a, b) => b.count - a.count),
      perCompany: [...perCompany.entries()]
        .map(([company, count]) => ({ company, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  /**
   * Wipe-and-replace, in one transaction.
   *
   * The `movements` audit log is append-only and deliberately survives this, so
   * the history of who signed what is never lost by a restore. A failure rolls
   * the whole thing back, leaving the previous data intact.
   */
  async commit(buffer: Buffer, actor: AuthUser, snapshotId: string | null): Promise<ImportResult> {
    const rows = await this.readRows(buffer);
    const issues: PendingIssue[] = [];
    let soldiersCreated = 0;
    let instancesCreated = 0;
    let signaturesCreated = 0;
    let merged = 0;
    let flagged = 0;

    await this.prisma.$transaction(
      async (tx) => {
        await tx.importIssue.deleteMany();
        await tx.signature.deleteMany();
        await tx.itemInstance.deleteMany();
        // A soldier named in דוח תנועות cannot be deleted: the audit log keeps
        // its foreign key precisely so history cannot be orphaned. Those rows
        // are deactivated and re-matched below, so the import re-attaches to
        // the existing soldier instead of creating a duplicate. Soldiers with
        // no history are deleted outright, which keeps the wipe clean.
        await tx.soldier.deleteMany({ where: { movements: { none: {} } } });
        await tx.soldier.updateMany({ data: { isActive: false } });
        const survivors = await tx.soldier.findMany();

        const items = await tx.item.findMany();
        const itemByName = new Map<string, (typeof items)[number]>();
        for (const item of items) {
          itemByName.set(item.name, item);
          for (const alias of item.aliases) itemByName.set(alias, item);
        }

        let unknownItem = itemByName.get(UNKNOWN_ITEM_NAME);
        if (!unknownItem) {
          unknownItem = await tx.item.create({
            data: {
              name: UNKNOWN_ITEM_NAME,
              category: 'GEAR',
              isSerialized: false,
              authorizedQty: 0,
              isActive: false,
            },
          });
        }

        const soldierCache = new Map<string, string>();
        // Keyed exactly as the row loop keys an incoming row, so a surviving
        // soldier is found rather than re-created.
        for (const s of survivors) {
          if (s.personalNumber) soldierCache.set(`pn:${s.personalNumber}`, s.id);
          soldierCache.set(
            `nm:${s.firstName}|${s.lastName}|${COMPANY_HE[s.company]}`,
            s.id,
          );
        }
        const activeSerialHolder = new Map<string, string>();
        const instanceCache = new Map<string, string>();
        const activeBulk = new Map<string, string>();

        for (const r of rows) {
          const raw = `${r.itemName} | ${r.serial ?? ''} | ${r.firstName} ${r.lastName} | ${r.company}`;
          const rowIssues: PendingIssue[] = [];

          let item = itemByName.get(r.itemName);
          if (!item) {
            item = unknownItem;
            rowIssues.push({
              kind: 'UNKNOWN_ITEM',
              rowNumber: r.rowNumber,
              rawRow: raw,
              detail: r.itemName
                ? `שם פריט לא קיים בקטלוג: "${r.itemName}"`
                : 'עמודת "סוג" ריקה — לא ידוע על איזה פריט החייל חתום',
              serial: r.serial ?? undefined,
            });
          }

          const companyHe = r.company.trim();
          let company = COMPANY_FROM_HE[companyHe];
          if (!company) {
            company = FALLBACK_COMPANY;
            rowIssues.push({
              kind: 'UNKNOWN_COMPANY',
              rowNumber: r.rowNumber,
              rawRow: raw,
              detail: companyHe
                ? `פלוגה לא מזוהה: "${companyHe}" — שויך זמנית למפקדה`
                : 'עמודת "פלוגה" ריקה — שויך זמנית למפקדה',
            });
          }
          if (!r.firstName && !r.lastName) {
            rowIssues.push({
              kind: 'MISSING_SOLDIER_NAME',
              rowNumber: r.rowNumber,
              rawRow: raw,
              detail: 'שורה ללא שם חייל',
              serial: r.serial ?? undefined,
            });
          }

          const key = r.personalNumber
            ? `pn:${r.personalNumber}`
            : `nm:${r.firstName}|${r.lastName}|${companyHe}`;
          let soldierId = soldierCache.get(key);
          if (!soldierId) {
            const created = await tx.soldier.create({
              data: {
                firstName: r.firstName || '(לא ידוע)',
                lastName: r.lastName || '(לא ידוע)',
                personalNumber: r.personalNumber,
                phone: r.phone,
                company,
                platoon: r.platoon,
                receiptNo: r.receiptNo,
              },
            });
            soldierId = created.id;
            soldierCache.set(key, soldierId);
            soldiersCreated++;
          } else {
            // A soldier kept for its audit history: bring it back and refresh
            // the details from the file, which is now the source of truth.
            await tx.soldier.update({
              where: { id: soldierId },
              data: {
                firstName: r.firstName || '(לא ידוע)',
                lastName: r.lastName || '(לא ידוע)',
                personalNumber: r.personalNumber,
                phone: r.phone,
                company,
                platoon: r.platoon,
                receiptNo: r.receiptNo,
                isActive: true,
              },
            });
          }

          // Collisions are detected before inserting: the partial unique indexes
          // are the real guarantee, and in PostgreSQL a failed statement aborts
          // the whole transaction, so they cannot be caught and skipped.
          let itemInstanceId: string | null = null;
          // A serial is used whenever the file supplies one, even for an item
          // the catalog calls bulk — the number in the sheet is real and
          // discarding it would lose data on import. The flag only decides
          // whether a MISSING serial is an issue to flag.
          if (item.isSerialized || r.serial) {
            if (!r.serial) {
              rowIssues.push({
                kind: 'MISSING_SERIAL',
                rowNumber: r.rowNumber,
                rawRow: raw,
                detail: `פריט "${item.name}" דורש מסד, והשדה ריק באקסל`,
                soldierId,
                itemId: item.id,
              });
            } else {
              const instanceKey = `${item.id}|${r.serial}`;
              const holder = activeSerialHolder.get(instanceKey);
              if (holder && holder !== soldierId) {
                rowIssues.push({
                  kind: 'DUPLICATE_SERIAL',
                  rowNumber: r.rowNumber,
                  rawRow: raw,
                  detail: `מסד "${r.serial}" של "${item.name}" מופיע על יותר מחייל אחד`,
                  soldierId,
                  itemId: item.id,
                  serial: r.serial,
                });
              } else if (holder === soldierId) {
                rowIssues.push({
                  kind: 'DUPLICATE_ROW',
                  rowNumber: r.rowNumber,
                  rawRow: raw,
                  detail: `שורה כפולה: אותו חייל ואותו מסד "${r.serial}"`,
                  soldierId,
                  itemId: item.id,
                  serial: r.serial,
                });
                for (const i of rowIssues) issues.push(i);
                continue;
              } else {
                let instanceId = instanceCache.get(instanceKey);
                if (!instanceId) {
                  const instance = await tx.itemInstance.create({
                    data: { itemId: item.id, serial: r.serial },
                  });
                  instanceId = instance.id;
                  instanceCache.set(instanceKey, instanceId);
                  instancesCreated++;
                }
                itemInstanceId = instanceId;
                activeSerialHolder.set(instanceKey, soldierId);
              }
            }
          }

          const needsAttention = rowIssues.length > 0;
          if (itemInstanceId === null) {
            const bulkKey = `${soldierId}|${item.id}`;
            const existingId = activeBulk.get(bulkKey);
            if (existingId) {
              await tx.signature.update({
                where: { id: existingId },
                data: {
                  quantity: { increment: 1 },
                  ...(needsAttention ? { needsAttention: true } : {}),
                },
              });
              merged++;
              if (needsAttention) flagged++;
              for (const i of rowIssues) issues.push({ ...i, signatureId: existingId });
              continue;
            }
          }

          const signature = await tx.signature.create({
            data: {
              soldierId,
              itemId: item.id,
              itemInstanceId,
              quantity: 1,
              receiptNo: r.receiptNo,
              notes: r.notes,
              needsAttention,
              signedByUserId: actor.id,
            },
          });
          signaturesCreated++;
          if (needsAttention) flagged++;
          if (itemInstanceId === null) activeBulk.set(`${soldierId}|${item.id}`, signature.id);
          for (const i of rowIssues) issues.push({ ...i, signatureId: signature.id });
        }

        if (issues.length) {
          await tx.importIssue.createMany({
            data: issues.map((i) => ({
              kind: i.kind,
              rowNumber: i.rowNumber,
              rawRow: i.rawRow,
              detail: i.detail,
              signatureId: i.signatureId ?? null,
              soldierId: i.soldierId ?? null,
              itemId: i.itemId ?? null,
              serial: i.serial ?? null,
            })) satisfies Prisma.ImportIssueCreateManyInput[],
          });
        }

        // Recorded in its own log rather than in `movements`: דוח תנועות holds
        // weapon movements only, so an import must not appear there.
        await tx.importLog.create({
          data: {
            totalRows: rows.length,
            signatures: signaturesCreated,
            soldiers: soldiersCreated,
            flagged,
            issues: issues.length,
            snapshotId,
            performedByUserId: actor.id,
            performedByNameSnapshot: actor.displayName,
            notes: snapshotId ? 'גיבוי לפני היבוא נשמר' : null,
          },
        });
      },
      { timeout: 600_000, maxWait: 30_000 },
    );

    this.logger.log(
      `Excel import by ${actor.username}: ${rows.length} rows, ` +
        `${signaturesCreated} signatures, ${flagged} flagged`,
    );

    const byKind = new Map<IssueKind, PendingIssue[]>();
    for (const i of issues) {
      const list = byKind.get(i.kind) ?? [];
      list.push(i);
      byKind.set(i.kind, list);
    }

    return {
      committed: true,
      snapshotId,
      totalRows: rows.length,
      soldiers: soldiersCreated,
      signatures: signaturesCreated,
      instances: instancesCreated,
      mergedIntoQuantity: merged,
      issues: [...byKind.entries()]
        .map(([kind, list]) => ({
          kind,
          count: list.length,
          examples: list.slice(0, 5).map((i) => `שורה ${i.rowNumber}: ${i.detail}`),
        }))
        .sort((a, b) => b.count - a.count),
      perItem: [],
      perCompany: [],
    };
  }
}
