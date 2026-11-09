/**
 * Excel export, import and the disaster-recovery round trip.
 *
 * The property that matters most: exporting and re-importing must reproduce the
 * same state, because that is the restore path if the data is ever lost. The
 * audit log must survive the wipe, and a pre-import snapshot must be taken.
 */
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SHEET, SIGNATURES_HEADER } from '../src/excel/excel.constants';

const ADMIN = { username: 'e2e_xl_admin', password: 'e2e-xl-admin-123' };
const STAFF = { username: 'e2e_xl_staff', password: 'e2e-xl-staff-123' };

let app: INestApplication;
let prisma: PrismaService;
let adminJar: string;
let staffJar: string;

function jarFrom(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

async function login(creds: { username: string; password: string }): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(creds).expect(200);
  return jarFrom(res);
}

type Counts = { soldiers: number; signatures: number; instances: number };

async function snapshotCounts(): Promise<Counts> {
  const [soldiers, signatures, instances] = await Promise.all([
    prisma.soldier.count(),
    prisma.signature.count({ where: { returnedAt: null } }),
    prisma.itemInstance.count(),
  ]);
  return { soldiers, signatures, instances };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  prisma = app.get(PrismaService);

  // These users cannot simply be deleted: running an import makes every
  // restored signature reference the importer via signed_by_user_id, and that
  // foreign key is what keeps the audit trail intact. Reuse or deactivate.
  await prisma.user.deleteMany({
    where: {
      username: { in: [ADMIN.username, STAFF.username] },
      signaturesIssued: { none: {} },
      movements: { none: {} },
    },
  });
  await prisma.user.upsert({
    where: { username: ADMIN.username },
    update: { isActive: true, role: 'admin', displayName: 'מנהל אקסל' },
    create: {
      username: ADMIN.username,
      displayName: 'מנהל אקסל',
      role: 'admin',
      passwordHash: await bcrypt.hash(ADMIN.password, 12),
    },
  });
  // The password must match on reuse, since the row may already exist.
  await prisma.user.update({
    where: { username: ADMIN.username },
    data: { passwordHash: await bcrypt.hash(ADMIN.password, 12) },
  });
  await prisma.user.upsert({
    where: { username: STAFF.username },
    update: {
      isActive: true,
      role: 'logistics',
      passwordHash: await bcrypt.hash(STAFF.password, 12),
    },
    create: {
      username: STAFF.username,
      displayName: 'לוגיסטיקה',
      role: 'logistics',
      passwordHash: await bcrypt.hash(STAFF.password, 12),
    },
  });

  adminJar = await login(ADMIN);
  staffJar = await login(STAFF);
});

afterAll(async () => {
  // Deactivate rather than delete: an importer is referenced by every signature
  // it restored, which is deliberate so the audit trail cannot be orphaned.
  await prisma?.user.updateMany({
    where: { username: { in: [ADMIN.username, STAFF.username] } },
    data: { isActive: false },
  });
  await app?.close();
});

describe('export', () => {
  it('produces a workbook with the original sheet names', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/excel/export')
      .set('Cookie', staffJar)
      .expect(200)
      .buffer()
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as ArrayBuffer);
    const names = wb.worksheets.map((w) => w.name);

    for (const sheet of Object.values(SHEET)) {
      expect(names, `missing sheet ${sheet}`).toContain(sheet);
    }
  });

  it('keeps the צלמ header exactly as the original file has it', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/excel/export')
      .set('Cookie', staffJar)
      .expect(200)
      .buffer()
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as ArrayBuffer);
    const sheet = wb.getWorksheet(SHEET.signatures);
    expect(sheet).toBeDefined();

    const header = sheet!.getRow(1).values as unknown[];
    // ExcelJS pads index 0, so the header starts at 1.
    const actual = SIGNATURES_HEADER.map((_, i) => String(header[i + 1] ?? ''));
    expect(actual).toEqual([...SIGNATURES_HEADER]);
  });

  it('writes every sheet right-to-left', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/excel/export')
      .set('Cookie', staffJar)
      .expect(200)
      .buffer()
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as ArrayBuffer);
    for (const ws of wb.worksheets) {
      const view = ws.views[0] as { rightToLeft?: boolean } | undefined;
      expect(view?.rightToLeft, `${ws.name} is not RTL`).toBe(true);
    }
  });
});

describe('import', () => {
  it('rejects a non-xlsx upload', async () => {
    await request(app.getHttpServer())
      .post('/api/excel/import/preview')
      .set('Cookie', adminJar)
      .attach('file', Buffer.from('not a spreadsheet'), 'notes.txt')
      .expect(400);
  });

  it('rejects a workbook with no צלמ sheet', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Sheet1').addRow(['a', 'b']);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const res = await request(app.getHttpServer())
      .post('/api/excel/import/preview')
      .set('Cookie', adminJar)
      .attach('file', buffer, 'wrong.xlsx')
      .expect(400);
    expect(res.body.message).toContain(SHEET.signatures);
  });

  it('denies a logistics user the ability to import', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet(SHEET.signatures).addRow([...SIGNATURES_HEADER]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    await request(app.getHttpServer())
      .post('/api/excel/import/commit')
      .set('Cookie', staffJar)
      .attach('file', buffer, 'x.xlsx')
      .expect(403);
  });

  it('previews without writing anything', async () => {
    const before = await snapshotCounts();

    const exported = await request(app.getHttpServer())
      .get('/api/excel/export')
      .set('Cookie', adminJar)
      .expect(200)
      .buffer()
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    const preview = await request(app.getHttpServer())
      .post('/api/excel/import/preview')
      .set('Cookie', adminJar)
      .attach('file', exported.body as Buffer, 'export.xlsx')
      .expect(201);

    expect(preview.body.totalRows).toBeGreaterThan(0);
    expect(await snapshotCounts()).toEqual(before);
  });
});

describe('a returned item — blank סוג', () => {
  /**
   * The battalion records a return by clearing the `סוג` cell and keeping the
   * rest of the row, so the item is easy to re-issue to the same soldier. The
   * row therefore describes something that is back on the shelf: it must not
   * come in as a signature, and the soldier it names must not be restored from
   * it either.
   */
  async function importSheet(rows: unknown[][]): Promise<request.Response> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(SHEET.signatures);
    ws.addRow([...SIGNATURES_HEADER]);
    for (const row of rows) ws.addRow(row);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return request(app.getHttpServer())
      .post('/api/excel/import/preview')
      .set('Cookie', adminJar)
      .attach('file', buffer, 'returns.xlsx')
      .expect(201);
  }

  it('skips the row and the soldier it names', async () => {
    const res = await importSheet([
      // סוג, מסד, שם, שם משפחה, פלוגה, טלפון, מ.א., קבלה, הערה, מחלקה
      ['', '956164', 'יונתן', 'לויה', 'א', '', '6150336', '', '', ''],
      ['', '', 'דב', 'פישמן', 'א', '', '8448432', '', '', ''],
    ]);

    expect(res.body.totalRows).toBe(2);
    expect(res.body.returnedRows).toBe(2);
    expect(res.body.signatures).toBe(0);
    // Neither soldier is restored: every row naming them was a return.
    expect(res.body.soldiers).toBe(0);
  });

  it('still restores a soldier who also holds something', async () => {
    const res = await importSheet([
      ['M-4', 'SERIAL-RT-1', 'יונתן', 'לויה', 'א', '', '6150336', '', '', ''],
      ['', '956164', 'יונתן', 'לויה', 'א', '', '6150336', '', '', ''],
    ]);

    expect(res.body.returnedRows).toBe(1);
    expect(res.body.signatures).toBe(1);
    expect(res.body.soldiers).toBe(1);
  });

  it('does not report a blank סוג as an unknown item', async () => {
    // It is a deliberate convention, not a data error, so it must not land in
    // דרוש טיפול alongside the rows that genuinely need fixing.
    const res = await importSheet([
      ['', '', 'דב', 'פישמן', 'א', '', '8448432', '', '', ''],
      ['פריט שלא קיים', '', 'מישהו', 'אחר', 'ב', '', '1234567', '', '', ''],
    ]);

    const kinds = (res.body.issues as { kind: string; count: number }[]);
    expect(kinds.find((i) => i.kind === 'UNKNOWN_ITEM')?.count).toBe(1);
    expect(res.body.returnedRows).toBe(1);
  });
});

describe('disaster recovery round trip', () => {
  it('restores the same state from its own export, keeps the audit log, and snapshots first', async () => {
    const before = await snapshotCounts();
    const movementsBefore = await prisma.movement.count();
    const snapshotsBefore = await prisma.snapshot.count({ where: { kind: 'pre_import' } });

    const exported = await request(app.getHttpServer())
      .get('/api/excel/export')
      .set('Cookie', adminJar)
      .expect(200)
      .buffer()
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    const result = await request(app.getHttpServer())
      .post('/api/excel/import/commit')
      .set('Cookie', adminJar)
      .attach('file', exported.body as Buffer, 'export.xlsx')
      .expect(201);

    expect(result.body.committed).toBe(true);
    expect(result.body.snapshotId).toBeTruthy();

    // The restored state matches what was exported.
    expect(await snapshotCounts()).toEqual(before);

    // The audit log is append-only and survives the wipe untouched. An import
    // is not a weapon movement, so it must NOT appear in דוח תנועות.
    const movementsAfter = await prisma.movement.count();
    expect(movementsAfter).toBe(movementsBefore);

    // It is recorded in its own log instead.
    const importRow = await prisma.importLog.findFirst({ orderBy: { occurredAt: 'desc' } });
    expect(importRow?.performedByNameSnapshot).toBe('מנהל אקסל');

    // A pre-import snapshot was taken, so the restore is itself reversible.
    expect(await prisma.snapshot.count({ where: { kind: 'pre_import' } })).toBe(
      snapshotsBefore + 1,
    );
  });
});

describe('snapshots', () => {
  it('creates, lists and downloads a snapshot', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/snapshots')
      .set('Cookie', adminJar)
      .expect(201);
    expect(created.body.id).toBeTruthy();

    const list = await request(app.getHttpServer())
      .get('/api/snapshots')
      .set('Cookie', adminJar)
      .expect(200);
    expect(list.body.length).toBeGreaterThan(0);

    const download = await request(app.getHttpServer())
      .get(`/api/snapshots/${created.body.id}/download`)
      .set('Cookie', adminJar)
      .expect(200);
    expect(download.headers['content-disposition']).toContain('.xlsx');
  });

  it('reports a clear error when Slack is not configured, without failing', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/snapshots')
      .set('Cookie', adminJar)
      .expect(201);

    // The snapshot must never depend on Slack succeeding.
    const res = await request(app.getHttpServer())
      .post(`/api/snapshots/${created.body.id}/send-to-slack`)
      .set('Cookie', adminJar)
      .expect(201);
    expect(res.body.sent).toBe(false);
    expect(res.body.error).toBeTruthy();

    const row = await prisma.snapshot.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.slackSentAt).toBeNull();
  });

  it('denies a logistics user access to snapshots', async () => {
    await request(app.getHttpServer()).get('/api/snapshots').set('Cookie', staffJar).expect(403);
  });
});
