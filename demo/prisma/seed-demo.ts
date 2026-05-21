/**
 * Demo seed — realistic Guatemalan transactions for a dev account.
 *
 * NOT part of the global seed runner. Run manually before a demo:
 *
 *     pnpm tsx prisma/seed-demo.ts
 *
 * What it does:
 *
 *   1. Looks up the user by email (DEMO_USER_EMAIL — edit below).
 *   2. Finds the user's first profile (ProfileMember row).
 *   3. Upserts ~40 transactions spread across the last 90 days:
 *      INCOME (salary deposits, freelance payment), EXPENSE
 *      (Guatemalan grocery chains, gas stations, restaurants,
 *      utility bills, transport, entertainment, ATM withdrawals).
 *
 * Idempotent. Every row is keyed by
 *   (profileId, source='MANUAL', externalId='DEMO-NNN')
 * which matches the schema's `uniq_profile_source_external`
 * constraint, so re-running this script updates rather than
 * duplicates.
 *
 * Cleanup. Every row carries `metadata.seededBy === 'demo-seed'`,
 * so you can purge them later with:
 *
 *     await prisma.transaction.deleteMany({
 *       where: {
 *         profileId,
 *         source: 'MANUAL',
 *         metadata: { path: ['seededBy'], equals: 'demo-seed' },
 *       },
 *     });
 *
 * This file is intentionally separate from `prisma/seed.ts` (the
 * Badge/Mission global catalog runner). It is NOT registered in
 * package.json `prisma.seed` and never runs automatically.
 */

import { PrismaClient, type Prisma } from '@prisma/client';

const DEMO_USER_EMAIL = 'jorgeluiscontrerasherrera@gmail.com';

const prisma = new PrismaClient();

type TxSeed = {
  externalId: string;
  daysAgo: number;
  type: 'INCOME' | 'EXPENSE';
  amount: string;
  description: string;
  merchantName: string | null;
  merchantNit: string | null;
  category: string;
};

/**
 * 40 transactions across the last 90 days. Amounts in GTQ.
 * Merchants are real Guatemalan brands; NITs are realistic-shape
 * fakes (real NITs would be a privacy issue). Categories use the
 * 12-label vocabulary that Batch 3 will lock in for AI categorization.
 */
const DEMO_TRANSACTIONS: TxSeed[] = [
  // --- Income (monthly salary + a freelance payment) ---
  {
    externalId: 'DEMO-001',
    daysAgo: 5,
    type: 'INCOME',
    amount: '18500.00',
    description: 'TRANSFERENCIA SALARIO — BANCO INDUSTRIAL',
    merchantName: 'Empresa Empleadora SA',
    merchantNit: '1234567-8',
    category: 'Trabajo',
  },
  {
    externalId: 'DEMO-002',
    daysAgo: 35,
    type: 'INCOME',
    amount: '18500.00',
    description: 'TRANSFERENCIA SALARIO — BANCO INDUSTRIAL',
    merchantName: 'Empresa Empleadora SA',
    merchantNit: '1234567-8',
    category: 'Trabajo',
  },
  {
    externalId: 'DEMO-003',
    daysAgo: 65,
    type: 'INCOME',
    amount: '18500.00',
    description: 'TRANSFERENCIA SALARIO — BANCO INDUSTRIAL',
    merchantName: 'Empresa Empleadora SA',
    merchantNit: '1234567-8',
    category: 'Trabajo',
  },
  {
    externalId: 'DEMO-004',
    daysAgo: 22,
    type: 'INCOME',
    amount: '4200.00',
    description: 'TRANSFERENCIA RECIBIDA — PROYECTO FREELANCE',
    merchantName: 'Cliente Independiente',
    merchantNit: null,
    category: 'Trabajo',
  },

  // --- Groceries (recurring weekly-ish pattern across major chains) ---
  {
    externalId: 'DEMO-010',
    daysAgo: 2,
    type: 'EXPENSE',
    amount: '847.50',
    description: 'COMPRA WALMART ZONA 11',
    merchantName: 'Walmart',
    merchantNit: '2345678-9',
    category: 'Alimentación',
  },
  {
    externalId: 'DEMO-011',
    daysAgo: 9,
    type: 'EXPENSE',
    amount: '612.30',
    description: 'COMPRA PAIZ CAYALA',
    merchantName: 'Paiz',
    merchantNit: '3456789-0',
    category: 'Alimentación',
  },
  {
    externalId: 'DEMO-012',
    daysAgo: 16,
    type: 'EXPENSE',
    amount: '923.80',
    description: 'COMPRA LA TORRE ZONA 10',
    merchantName: 'La Torre',
    merchantNit: '4567890-1',
    category: 'Alimentación',
  },
  {
    externalId: 'DEMO-013',
    daysAgo: 24,
    type: 'EXPENSE',
    amount: '485.20',
    description: 'COMPRA DESPENSA FAMILIAR',
    merchantName: 'Despensa Familiar',
    merchantNit: '5678901-2',
    category: 'Alimentación',
  },
  {
    externalId: 'DEMO-014',
    daysAgo: 31,
    type: 'EXPENSE',
    amount: '1240.00',
    description: 'COMPRA HIPER PAIZ ROOSEVELT',
    merchantName: 'Hiper Paiz',
    merchantNit: '3456789-0',
    category: 'Alimentación',
  },
  {
    externalId: 'DEMO-015',
    daysAgo: 38,
    type: 'EXPENSE',
    amount: '712.45',
    description: 'COMPRA WALMART ZONA 11',
    merchantName: 'Walmart',
    merchantNit: '2345678-9',
    category: 'Alimentación',
  },
  {
    externalId: 'DEMO-016',
    daysAgo: 52,
    type: 'EXPENSE',
    amount: '548.10',
    description: 'COMPRA PAIZ CAYALA',
    merchantName: 'Paiz',
    merchantNit: '3456789-0',
    category: 'Alimentación',
  },

  // --- Gas (Puma weekly fill-ups + occasional Shell) ---
  {
    externalId: 'DEMO-020',
    daysAgo: 3,
    type: 'EXPENSE',
    amount: '350.00',
    description: 'COMBUSTIBLE PUMA ZONA 15',
    merchantName: 'Puma Energy',
    merchantNit: '6789012-3',
    category: 'Transporte',
  },
  {
    externalId: 'DEMO-021',
    daysAgo: 11,
    type: 'EXPENSE',
    amount: '380.00',
    description: 'COMBUSTIBLE PUMA ZONA 15',
    merchantName: 'Puma Energy',
    merchantNit: '6789012-3',
    category: 'Transporte',
  },
  {
    externalId: 'DEMO-022',
    daysAgo: 19,
    type: 'EXPENSE',
    amount: '410.00',
    description: 'COMBUSTIBLE SHELL VISTA HERMOSA',
    merchantName: 'Shell',
    merchantNit: '7890123-4',
    category: 'Transporte',
  },
  {
    externalId: 'DEMO-023',
    daysAgo: 27,
    type: 'EXPENSE',
    amount: '365.00',
    description: 'COMBUSTIBLE PUMA ZONA 15',
    merchantName: 'Puma Energy',
    merchantNit: '6789012-3',
    category: 'Transporte',
  },
  {
    externalId: 'DEMO-024',
    daysAgo: 41,
    type: 'EXPENSE',
    amount: '395.00',
    description: 'COMBUSTIBLE PUMA ZONA 15',
    merchantName: 'Puma Energy',
    merchantNit: '6789012-3',
    category: 'Transporte',
  },

  // --- Restaurants + coffee (small frequent purchases) ---
  {
    externalId: 'DEMO-030',
    daysAgo: 1,
    type: 'EXPENSE',
    amount: '78.50',
    description: 'POLLO CAMPERO MIRAFLORES',
    merchantName: 'Pollo Campero',
    merchantNit: '8901234-5',
    category: 'Restaurantes',
  },
  {
    externalId: 'DEMO-031',
    daysAgo: 4,
    type: 'EXPENSE',
    amount: '125.00',
    description: 'MCDONALDS CAYALA',
    merchantName: "McDonald's",
    merchantNit: '9012345-6',
    category: 'Restaurantes',
  },
  {
    externalId: 'DEMO-032',
    daysAgo: 7,
    type: 'EXPENSE',
    amount: '42.00',
    description: 'CAFFE BARISTA OAKLAND',
    merchantName: 'Caffé Barista',
    merchantNit: '0123456-7',
    category: 'Restaurantes',
  },
  {
    externalId: 'DEMO-033',
    daysAgo: 13,
    type: 'EXPENSE',
    amount: '215.00',
    description: 'PIZZA HUT ZONA 10',
    merchantName: 'Pizza Hut',
    merchantNit: '1234567-1',
    category: 'Restaurantes',
  },
  {
    externalId: 'DEMO-034',
    daysAgo: 18,
    type: 'EXPENSE',
    amount: '95.00',
    description: 'POLLO CAMPERO MIRAFLORES',
    merchantName: 'Pollo Campero',
    merchantNit: '8901234-5',
    category: 'Restaurantes',
  },
  {
    externalId: 'DEMO-035',
    daysAgo: 25,
    type: 'EXPENSE',
    amount: '186.00',
    description: 'SARITA HELADOS CAYALA',
    merchantName: 'Sarita',
    merchantNit: '2345678-1',
    category: 'Restaurantes',
  },
  {
    externalId: 'DEMO-036',
    daysAgo: 33,
    type: 'EXPENSE',
    amount: '52.00',
    description: 'CAFFE BARISTA OAKLAND',
    merchantName: 'Caffé Barista',
    merchantNit: '0123456-7',
    category: 'Restaurantes',
  },

  // --- Recurring bills (monthly, predictable) ---
  {
    externalId: 'DEMO-040',
    daysAgo: 6,
    type: 'EXPENSE',
    amount: '485.30',
    description: 'PAGO EEGSA — RECIBO LUZ',
    merchantName: 'EEGSA',
    merchantNit: '3456789-1',
    category: 'Servicios',
  },
  {
    externalId: 'DEMO-041',
    daysAgo: 36,
    type: 'EXPENSE',
    amount: '512.80',
    description: 'PAGO EEGSA — RECIBO LUZ',
    merchantName: 'EEGSA',
    merchantNit: '3456789-1',
    category: 'Servicios',
  },
  {
    externalId: 'DEMO-042',
    daysAgo: 66,
    type: 'EXPENSE',
    amount: '498.50',
    description: 'PAGO EEGSA — RECIBO LUZ',
    merchantName: 'EEGSA',
    merchantNit: '3456789-1',
    category: 'Servicios',
  },
  {
    externalId: 'DEMO-043',
    daysAgo: 8,
    type: 'EXPENSE',
    amount: '350.00',
    description: 'PAGO TIGO — INTERNET HOGAR',
    merchantName: 'Tigo',
    merchantNit: '4567890-2',
    category: 'Servicios',
  },
  {
    externalId: 'DEMO-044',
    daysAgo: 38,
    type: 'EXPENSE',
    amount: '350.00',
    description: 'PAGO TIGO — INTERNET HOGAR',
    merchantName: 'Tigo',
    merchantNit: '4567890-2',
    category: 'Servicios',
  },
  {
    externalId: 'DEMO-045',
    daysAgo: 68,
    type: 'EXPENSE',
    amount: '350.00',
    description: 'PAGO TIGO — INTERNET HOGAR',
    merchantName: 'Tigo',
    merchantNit: '4567890-2',
    category: 'Servicios',
  },
  {
    externalId: 'DEMO-046',
    daysAgo: 10,
    type: 'EXPENSE',
    amount: '180.00',
    description: 'PAGO CLARO — PLAN MOVIL',
    merchantName: 'Claro',
    merchantNit: '5678901-3',
    category: 'Servicios',
  },
  {
    externalId: 'DEMO-047',
    daysAgo: 40,
    type: 'EXPENSE',
    amount: '180.00',
    description: 'PAGO CLARO — PLAN MOVIL',
    merchantName: 'Claro',
    merchantNit: '5678901-3',
    category: 'Servicios',
  },
  {
    externalId: 'DEMO-048',
    daysAgo: 14,
    type: 'EXPENSE',
    amount: '95.00',
    description: 'PAGO EMPAGUA — AGUA POTABLE',
    merchantName: 'Empagua',
    merchantNit: '6789012-4',
    category: 'Servicios',
  },

  // --- Transport (rideshare) ---
  {
    externalId: 'DEMO-050',
    daysAgo: 5,
    type: 'EXPENSE',
    amount: '42.00',
    description: 'UBER VIAJE — ZONA 10',
    merchantName: 'Uber',
    merchantNit: '7890123-5',
    category: 'Transporte',
  },
  {
    externalId: 'DEMO-051',
    daysAgo: 20,
    type: 'EXPENSE',
    amount: '38.00',
    description: 'INDRIVE VIAJE — CAYALA',
    merchantName: 'InDrive',
    merchantNit: '8901234-6',
    category: 'Transporte',
  },

  // --- Entertainment + subscriptions ---
  {
    externalId: 'DEMO-060',
    daysAgo: 12,
    type: 'EXPENSE',
    amount: '128.00',
    description: 'CINEPOLIS CAYALA — 2 BOLETOS',
    merchantName: 'Cinépolis',
    merchantNit: '9012345-7',
    category: 'Entretenimiento',
  },
  {
    externalId: 'DEMO-061',
    daysAgo: 17,
    type: 'EXPENSE',
    amount: '120.00',
    description: 'NETFLIX SUSCRIPCION MENSUAL',
    merchantName: 'Netflix',
    merchantNit: null,
    category: 'Entretenimiento',
  },
  {
    externalId: 'DEMO-062',
    daysAgo: 47,
    type: 'EXPENSE',
    amount: '120.00',
    description: 'NETFLIX SUSCRIPCION MENSUAL',
    merchantName: 'Netflix',
    merchantNit: null,
    category: 'Entretenimiento',
  },

  // --- ATM withdrawals + bank fees ---
  {
    externalId: 'DEMO-070',
    daysAgo: 6,
    type: 'EXPENSE',
    amount: '1500.00',
    description: 'RETIRO CAJERO ATM — BANCO INDUSTRIAL',
    merchantName: 'Banco Industrial',
    merchantNit: null,
    category: 'Otros',
  },
  {
    externalId: 'DEMO-071',
    daysAgo: 28,
    type: 'EXPENSE',
    amount: '2000.00',
    description: 'RETIRO CAJERO ATM — BANCO INDUSTRIAL',
    merchantName: 'Banco Industrial',
    merchantNit: null,
    category: 'Otros',
  },
  {
    externalId: 'DEMO-072',
    daysAgo: 31,
    type: 'EXPENSE',
    amount: '25.00',
    description: 'COMISION MANTENIMIENTO CUENTA',
    merchantName: 'Banco Industrial',
    merchantNit: null,
    category: 'Otros',
  },
];

async function main(): Promise<void> {
  console.warn(`[demo-seed] resolving user by email: ${DEMO_USER_EMAIL}`);

  const user = await prisma.user.findUnique({
    where: { email: DEMO_USER_EMAIL },
    select: { id: true, email: true },
  });

  if (!user) {
    throw new Error(
      `No User row for email=${DEMO_USER_EMAIL}. Sign in to the app at least once so the ` +
        `ensure-user-profile flow creates your User + first Profile, then re-run this script.`,
    );
  }

  const member = await prisma.profileMember.findFirst({
    where: { userId: user.id },
    select: { profileId: true, profile: { select: { displayName: true, type: true } } },
    orderBy: { invitedAt: 'asc' },
  });

  if (!member) {
    throw new Error(
      `User ${user.id} has no Profile membership. Complete the /bienvenida onboarding once, ` +
        `then re-run this script.`,
    );
  }

  const profileId = member.profileId;
  console.warn(
    `[demo-seed] target profile: ${profileId} (${member.profile.displayName}, ${member.profile.type})`,
  );

  /*
   * Reference "now" at midnight UTC so the date-only column on
   * Transaction (`date @db.Date`) doesn't drift with the script's
   * actual run time.
   */
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);

  let upserted = 0;
  for (const tx of DEMO_TRANSACTIONS) {
    const date = new Date(now.getTime() - tx.daysAgo * 24 * 60 * 60 * 1000);
    const metadata: Prisma.InputJsonValue = {
      seededBy: 'demo-seed',
      seedRunAt: new Date().toISOString(),
    };

    await prisma.transaction.upsert({
      where: {
        uniq_profile_source_external: {
          profileId,
          source: 'MANUAL',
          externalId: tx.externalId,
        },
      },
      create: {
        profileId,
        source: 'MANUAL',
        externalId: tx.externalId,
        type: tx.type,
        amount: tx.amount,
        currency: 'GTQ',
        date,
        description: tx.description,
        merchantName: tx.merchantName,
        merchantNit: tx.merchantNit,
        category: tx.category,
        metadata,
      },
      update: {
        type: tx.type,
        amount: tx.amount,
        date,
        description: tx.description,
        merchantName: tx.merchantName,
        merchantNit: tx.merchantNit,
        category: tx.category,
        metadata,
      },
    });
    upserted += 1;
  }

  console.warn(`[demo-seed] done. Upserted ${String(upserted)} transactions on profile ${profileId}.`);
}

main()
  .catch((error: unknown) => {
    console.error('[demo-seed] failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
