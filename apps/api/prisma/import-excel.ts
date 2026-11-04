/**
 * Imports the armory Excel into the database.
 *
 * Policy: import EVERYTHING, including rows with data problems, and record each
 * problem in `import_issues` so the app's "דרוש טיפול" tab can list it. Nothing
 * is silently dropped — the Excel is the record of reality, errors included.
 *
 * The strict rule (a serialized item must have a serial) applies to signatures
 * created through the API, not to this import.
 *
 * Usage: tsx prisma/import-excel.ts <path-to-xlsx>
 */
import 'dotenv/config';
import { PrismaClient, Company, IssueKind, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import ExcelJS from 'exceljs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const COMPANY_BY_HEBREW: Record<string, Company> = {
  'א': 'A',
  'ב': 'B',
  'ג': 'C',
  'מסייעת': 'SUPPORT',
  'מפקדה': 'HQ',
};

/** Placeholder item for rows whose `סוג` column is empty. */
const UNKNOWN_ITEM_NAME = 'לא מזוהה';
/** Placeholder company for rows whose `פלוגה` column is empty or unrecognised. */
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

type Issue = {
  kind: IssueKind;
  rowNumber: number;
  rawRow: string;
  detail: string;
  signatureId?: string;
  soldierId?: string;
  itemId?: string;
  serial?: string;
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

function readRows(sheet: ExcelJS.Worksheet): RawRow[] {
  const rows: RawRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const itemName = cellText(row.getCell(1));
    const firstName = cellText(row.getCell(3));
    const lastName = cellText(row.getCell(4));
    const serial = cellText(row.getCell(2));
    // Skip only rows that are entirely empty.
    if (!itemName && !firstName && !lastName && !serial) return;
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
  return rows;
}

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) throw new Error('נדרש נתיב לקובץ אקסל');

  const importer = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (!importer) throw new Error('לא נמצא משתמש מנהל. הרץ קודם את הזריעה.');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const sheet = wb.getWorksheet('צלמ');
  if (!sheet) throw new Error('גיליון "צלמ" לא נמצא בקובץ');

  const rows = readRows(sheet);
  console.log(`נקראו ${rows.length} שורות מגיליון "צלמ".`);

  const issues: Issue[] = [];
  let soldiersCreated = 0;
  let instancesCreated = 0;
  let signaturesCreated = 0;
  let bulkMerged = 0;
  let flagged = 0;

  await prisma.$transaction(
    async (tx) => {
      // Wipe-and-replace of the signature side. The movements audit log is
      // append-only and deliberately survives this.
      await tx.importIssue.deleteMany();
      await tx.signature.deleteMany();
      await tx.itemInstance.deleteMany();
      await tx.soldier.deleteMany();

      const items = await tx.item.findMany();
      const itemByName = new Map<string, (typeof items)[number]>();
      for (const item of items) {
        itemByName.set(item.name, item);
        for (const alias of item.aliases) itemByName.set(alias, item);
      }

      // Placeholder item so rows with no `סוג` value still import.
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
        itemByName.set(UNKNOWN_ITEM_NAME, unknownItem);
      }

      const soldierKey = (r: RawRow): string =>
        r.personalNumber ? `pn:${r.personalNumber}` : `nm:${r.firstName}|${r.lastName}|${r.company}`;
      const soldierCache = new Map<string, string>();
      const activeSerialHolder = new Map<string, string>(); // itemId|serial -> soldierId
      const instanceCache = new Map<string, string>(); // itemId|serial -> instanceId
      const activeBulk = new Map<string, string>(); // soldierId|itemId -> signatureId

      for (const r of rows) {
        const raw = `${r.itemName} | ${r.serial ?? ''} | ${r.firstName} ${r.lastName} | ${r.company}`;
        const rowIssues: Issue[] = [];

        // --- item ---
        let item = itemByName.get(r.itemName);
        if (!item) {
          item = unknownItem;
          rowIssues.push({
            kind: r.itemName ? 'UNKNOWN_ITEM' : 'UNKNOWN_ITEM',
            rowNumber: r.rowNumber,
            rawRow: raw,
            detail: r.itemName
              ? `שם פריט לא קיים בקטלוג: "${r.itemName}"`
              : 'עמודת "סוג" ריקה — לא ידוע על איזה פריט החייל חתום',
            serial: r.serial ?? undefined,
          });
        }

        // --- company ---
        let company = COMPANY_BY_HEBREW[r.company];
        if (!company) {
          company = FALLBACK_COMPANY;
          rowIssues.push({
            kind: 'UNKNOWN_COMPANY',
            rowNumber: r.rowNumber,
            rawRow: raw,
            detail: r.company
              ? `פלוגה לא מזוהה: "${r.company}" — שויך זמנית למפקדה`
              : 'עמודת "פלוגה" ריקה — שויך זמנית למפקדה',
          });
        }

        // --- soldier ---
        if (!r.firstName && !r.lastName) {
          rowIssues.push({
            kind: 'MISSING_SOLDIER_NAME',
            rowNumber: r.rowNumber,
            rawRow: raw,
            detail: 'שורה ללא שם חייל',
            serial: r.serial ?? undefined,
          });
        }
        const key = soldierKey(r);
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
        }

        // --- serial / instance ---
        let itemInstanceId: string | null = null;
        if (item.isSerialized) {
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
              // The database allows only one active holder per instance, so this
              // row is imported without the instance link and flagged instead.
              rowIssues.push({
                kind: 'DUPLICATE_SERIAL',
                rowNumber: r.rowNumber,
                rawRow: raw,
                detail: `מסד "${r.serial}" של "${item.name}" מופיע באקסל על יותר מחייל אחד`,
                soldierId,
                itemId: item.id,
                serial: r.serial,
              });
            } else if (holder === soldierId) {
              rowIssues.push({
                kind: 'DUPLICATE_ROW',
                rowNumber: r.rowNumber,
                rawRow: raw,
                detail: `שורה כפולה באקסל: אותו חייל ואותו מסד "${r.serial}"`,
                soldierId,
                itemId: item.id,
                serial: r.serial,
              });
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

        // --- signature ---
        // Non-serialized items are one active row per soldier+item; a repeat row
        // increments the quantity, matching how the Excel counts them.
        const needsAttention = rowIssues.length > 0;
        if (!item.isSerialized || itemInstanceId === null) {
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
            bulkMerged++;
            for (const i of rowIssues) issues.push({ ...i, signatureId: existingId });
            if (needsAttention) flagged++;
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
            signedByUserId: importer.id,
          },
        });
        signaturesCreated++;
        if (needsAttention) flagged++;
        if (itemInstanceId === null) {
          activeBulk.set(`${soldierId}|${item.id}`, signature.id);
        }
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

      await tx.movement.create({
        data: {
          action: 'IMPORT',
          soldierNameSnapshot: '—',
          itemNameSnapshot: '—',
          quantity: signaturesCreated,
          performedByUserId: importer.id,
          performedByNameSnapshot: importer.displayName,
          notes:
            `יבוא מאקסל: ${rows.length} שורות, ${signaturesCreated} חתימות, ` +
            `${flagged} דורשות טיפול, ${issues.length} ממצאים`,
        },
      });
    },
    { timeout: 600_000, maxWait: 30_000 },
  );

  console.log(`\nחיילים:                      ${soldiersCreated}`);
  console.log(`מופעי פריט (מסד):            ${instancesCreated}`);
  console.log(`חתימות:                      ${signaturesCreated}`);
  console.log(`שורות שאוחדו לכמות:          ${bulkMerged}`);
  console.log(`חתימות המסומנות "דרוש טיפול": ${flagged}`);
  console.log(`ממצאים שנרשמו:               ${issues.length}`);

  if (issues.length) {
    const byKind = new Map<string, number>();
    for (const i of issues) byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + 1);
    console.log('\n--- ממצאים לפי סוג ---');
    for (const [kind, n] of [...byKind].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}x  ${kind}`);
    }
    console.log('\n--- דוגמאות ---');
    for (const i of issues.slice(0, 12)) {
      console.log(`  שורה ${String(i.rowNumber).padStart(4)}: ${i.detail}`);
    }
  }
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
