import 'dotenv/config';
import { PrismaClient, Company } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { CATALOG, GEAR_PRICES, ALLOCATIONS, TEAM, SeedItem } from './catalog';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const BCRYPT_ROUNDS = 12;

async function seedUsers(): Promise<void> {
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!seedPassword) {
    throw new Error(
      'SEED_ADMIN_PASSWORD is not set. Set it to a strong password before seeding; ' +
        'no default credential is created.',
    );
  }

  const users: { username: string; displayName: string; role: 'admin' | 'logistics' | 'viewer' }[] = [
    { username: 'admin', displayName: 'מנהל מערכת', role: 'admin' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: {
        username: u.username,
        passwordHash: await bcrypt.hash(seedPassword, BCRYPT_ROUNDS),
        displayName: u.displayName,
        role: u.role,
      },
    });
  }
  console.log(`  משתמשים: ${users.length}`);
}

async function seedItems(): Promise<void> {
  // PRICED_GEAR is the `מחירון פריטים` sheet: uniform and personal kit for the
  // v2 module. The battalion tracks weapons and optics today, and seeding 43
  // zero-stock gear rows only buried the items that are actually counted. The
  // data stays in catalog.ts, unseeded, until that module exists.
  const all: SeedItem[] = [...CATALOG];
  for (const item of all) {
    const price = GEAR_PRICES[item.name];
    await prisma.item.upsert({
      where: { name: item.name },
      // `inSummary` is set only on create. It is an operational choice an admin
      // makes in the UI, and re-running the seed must not undo it.
      update: {
        aliases: item.aliases ?? [],
        category: item.category,
        isSerialized: item.isSerialized,
        authorizedQty: item.authorizedQty,
        unitPrice: price ?? null,
      },
      create: {
        name: item.name,
        aliases: item.aliases ?? [],
        category: item.category,
        isSerialized: item.isSerialized,
        authorizedQty: item.authorizedQty,
        unitPrice: price ?? null,
        // Priced gear is the v2 module and is not part of the nightly count.
        inSummary: price === undefined,
      },
    });
  }
  console.log(`  פריטים: ${all.length}`);
}

async function seedAllocations(): Promise<void> {
  let count = 0;
  for (const [itemName, byCompany] of Object.entries(ALLOCATIONS)) {
    const item = await prisma.item.findUnique({ where: { name: itemName } });
    if (!item) {
      console.warn(`  ! הקצאה לפריט שאינו בקטלוג: ${itemName}`);
      continue;
    }
    for (const [company, targetQty] of Object.entries(byCompany)) {
      await prisma.allocation.upsert({
        where: { itemId_company: { itemId: item.id, company: company as Company } },
        update: { targetQty },
        create: { itemId: item.id, company: company as Company, targetQty },
      });
      count++;
    }
  }
  console.log(`  הקצאות: ${count}`);
}

async function seedTeam(): Promise<void> {
  for (const [i, member] of TEAM.entries()) {
    await prisma.teamMember.upsert({
      where: { nickname: member.nickname },
      update: { gender: member.gender, sortOrder: i },
      create: { nickname: member.nickname, gender: member.gender, sortOrder: i },
    });
  }
  console.log(`  חברי צוות: ${TEAM.length}`);
}

async function main(): Promise<void> {
  console.log('זריעת נתוני בסיס...');
  await seedUsers();
  await seedItems();
  await seedAllocations();
  await seedTeam();
  console.log('הזריעה הושלמה.');
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
