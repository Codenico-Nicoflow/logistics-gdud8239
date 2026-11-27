import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { ACCESSORIES, CATALOG, GEAR_PRICES, TEAM, SeedItem } from './catalog';

// The seed creates an admin account and writes catalog data. Pointed at production by accident
// (a stray DATABASE_URL in a shell) it would add a login to the live system, so it refuses unless
// someone says, in so many words, that this is intended.
if ((process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') && process.env.ALLOW_PROD_SEED !== '1') {
  throw new Error('Refusing to seed a production environment. Set ALLOW_PROD_SEED=1 if that is really what you want.');
}

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
  const all: SeedItem[] = [...CATALOG, ...ACCESSORIES];
  for (const item of all) {
    const price = GEAR_PRICES[item.name];
    const fields = {
      aliases: item.aliases ?? [],
      category: item.category,
      isSerialized: item.isSerialized,
      authorizedQty: item.authorizedQty,
      defaultQty: item.defaultQty ?? 1,
      unitPrice: price ?? null,
    };
    // A name is only unique within a battalion, so there is no `upsert` by name alone.
    const existing = await prisma.item.findFirst({ where: { name: item.name }, select: { id: true } });
    if (existing) {
      // `inSummary` is set only on create. It is an operational choice an admin
      // makes in the UI, and re-running the seed must not undo it.
      await prisma.item.update({ where: { id: existing.id }, data: fields });
    } else {
      await prisma.item.create({
        data: {
          name: item.name,
          ...fields,
          // Priced gear is the v2 module and is not part of the nightly count.
          inSummary: item.inSummary ?? price === undefined,
        },
      });
    }
  }
  console.log(`  פריטים: ${all.length}`);
}

async function seedTeam(): Promise<void> {
  for (const [i, member] of TEAM.entries()) {
    const existing = await prisma.teamMember.findFirst({ where: { nickname: member.nickname }, select: { id: true } });
    if (existing) {
      await prisma.teamMember.update({ where: { id: existing.id }, data: { gender: member.gender, sortOrder: i } });
    } else {
      await prisma.teamMember.create({ data: { nickname: member.nickname, gender: member.gender, sortOrder: i } });
    }
  }
  console.log(`  חברי צוות: ${TEAM.length}`);
}

async function main(): Promise<void> {
  console.log('זריעת נתוני בסיס...');
  await seedUsers();
  await seedItems();
  await seedTeam();
  console.log('הזריעה הושלמה.');
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
