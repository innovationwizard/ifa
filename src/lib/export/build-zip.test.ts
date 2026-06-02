/**
 * @vitest-environment node
 *
 * Tests for `buildExportZip` (Phase L3.6) — the data export
 * pure-function. The route handler wrapper is a thin auth-gate;
 * the value-bearing logic (entity gathering, serialization, CSV
 * formatting, README assembly, storage fetch) is here and gets
 * tested directly.
 */
import { Prisma, type Profile, type Transaction, type HealthScore } from '@prisma/client';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * vi.hoisted lifts these declarations alongside vi.mock so the factory
 * closures can reference them. Without this, the mocks try to read
 * the const refs before they're initialized (vi.mock hoists; const
 * doesn't).
 */
const mocks = vi.hoisted(() => ({
  transactionListAllForExport: vi.fn(),
  healthScoreListAllForExport: vi.fn(),
  profileRepoListMembersForExport: vi.fn(),
  storageList: vi.fn(),
  storageDownload: vi.fn(),
}));

vi.mock('@/lib/db/repositories', () => ({
  transactionRepo: { listAllForExport: mocks.transactionListAllForExport },
  healthScoreRepo: { listAllForExport: mocks.healthScoreListAllForExport },
  profileRepo: { listMembersForExport: mocks.profileRepoListMembersForExport },
}));

vi.mock('@/lib/db/tenant-context', () => ({
  /*
   * The real withTenant uses AsyncLocalStorage to inject tenant context
   * into the Prisma extension. For unit tests we bypass it — the
   * findMany mocks already return tenant-correct fixtures.
   */
  withTenant: vi.fn((_ctx: unknown, fn: () => Promise<unknown>) => Promise.resolve(fn())),
}));

vi.mock('@/lib/storage/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    storage: {
      from: () => ({
        list: mocks.storageList,
        download: mocks.storageDownload,
      }),
    },
  })),
  IMPORTS_BUCKET: 'imports',
}));

import { buildExportZip } from './build-zip';

function fakeUser() {
  return {
    id: 'user_uuid_xyz',
    email: 'test@example.com',
    name: 'Jorge Test',
    avatarUrl: null,
    locale: 'es-GT',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
  };
}

function fakeProfile(): Profile {
  return {
    id: 'profile_uuid_abc',
    displayName: 'Jorge Test',
    dpiNumber: '1234567890123',
    dpiPhotoPath: null,
    dateOfBirth: new Date('1990-03-15T00:00:00Z'),
    nit: null,
    industryType: null,
    fiscalRegime: null,
    logoUrl: null,
    currency: 'GTQ',
    timezone: 'America/Guatemala',
    onboardingCompleted: true,
    type: 'INDIVIDUAL',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: 'TRIAL',
    trialEndsAt: null,
    currentPeriodEnd: null,
    earlySupporterSince: null,
    lastHealthScoreRecomputeAt: null,
    deletedAt: null,
  };
}

function fakeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx_uuid_1',
    profileId: 'profile_uuid_abc',
    externalId: null,
    amount: new Prisma.Decimal('123.45'),
    currency: 'GTQ',
    ivaAmount: new Prisma.Decimal('14.81'),
    date: new Date('2026-04-15T00:00:00Z'),
    time: null,
    description: 'Coffee, with "quotes" and, comma',
    merchantName: 'Café Test',
    merchantNit: null,
    category: 'FOOD',
    type: 'EXPENSE',
    source: 'MANUAL',
    reconciliationStatus: 'UNRECONCILED',
    reconciliationConfidence: null,
    aiCategoryConfidence: 0.95,
    metadata: { tags: ['café'] },
    createdAt: new Date('2026-04-15T00:00:00Z'),
    updatedAt: new Date('2026-04-15T00:00:00Z'),
    ...overrides,
  } as Transaction;
}

function fakeHealthScore(): HealthScore {
  return {
    id: 'hs_uuid_1',
    profileId: 'profile_uuid_abc',
    score: 72,
    previousScore: 65,
    factors: { liquidity: 80, spending: 70 },
    computedAt: new Date('2026-05-01T00:00:00Z'),
    period: 'ON_DEMAND',
    metadata: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transactionListAllForExport.mockResolvedValue([]);
  mocks.healthScoreListAllForExport.mockResolvedValue([]);
  mocks.profileRepoListMembersForExport.mockResolvedValue([]);
  mocks.storageList.mockResolvedValue({ data: [], error: null });
});

describe('buildExportZip', () => {
  it('produces a valid ZIP with all expected files (empty data)', async () => {
    const { zipBytes, filename } = await buildExportZip({
      user: fakeUser(),
      profile: fakeProfile(),
    });

    expect(filename).toMatch(/^ifa-export-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(zipBytes).toBeInstanceOf(Uint8Array);
    expect(zipBytes.length).toBeGreaterThan(100);

    const reopened = await JSZip.loadAsync(zipBytes);
    const names = Object.keys(reopened.files).sort();
    expect(names).toEqual([
      'README.txt',
      'health-scores.json',
      'profile-members.json',
      'profile.json',
      'transactions.csv',
      'transactions.json',
      'user.json',
    ]);
  });

  it('serializes profile + user fields into their JSON files', async () => {
    const { zipBytes } = await buildExportZip({ user: fakeUser(), profile: fakeProfile() });
    const reopened = await JSZip.loadAsync(zipBytes);

    const userJson: unknown = JSON.parse(await reopened.file('user.json')!.async('string'));
    expect(userJson).toMatchObject({
      id: 'user_uuid_xyz',
      email: 'test@example.com',
      name: 'Jorge Test',
      locale: 'es-GT',
    });

    const profileJson: unknown = JSON.parse(await reopened.file('profile.json')!.async('string'));
    expect(profileJson).toMatchObject({
      id: 'profile_uuid_abc',
      displayName: 'Jorge Test',
      dpiNumber: '1234567890123',
      dateOfBirth: '1990-03-15',
      currency: 'GTQ',
      timezone: 'America/Guatemala',
    });
  });

  it('serializes transactions to JSON with Decimal as string', async () => {
    mocks.transactionListAllForExport.mockResolvedValue([fakeTransaction()]);

    const { zipBytes } = await buildExportZip({ user: fakeUser(), profile: fakeProfile() });
    const reopened = await JSZip.loadAsync(zipBytes);
    const txJson = JSON.parse(await reopened.file('transactions.json')!.async('string')) as Record<
      string,
      unknown
    >[];

    expect(txJson).toHaveLength(1);
    expect(txJson[0]).toMatchObject({
      id: 'tx_uuid_1',
      amount: '123.45',
      ivaAmount: '14.81',
      currency: 'GTQ',
      date: '2026-04-15',
      description: 'Coffee, with "quotes" and, comma',
    });
  });

  it('builds RFC-4180-compliant CSV with BOM + quoted commas/quotes', async () => {
    mocks.transactionListAllForExport.mockResolvedValue([fakeTransaction()]);

    const { zipBytes } = await buildExportZip({ user: fakeUser(), profile: fakeProfile() });
    const reopened = await JSZip.loadAsync(zipBytes);
    const csv = await reopened.file('transactions.csv')!.async('string');

    expect(csv.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM for Excel
    expect(csv).toContain('id,externalId,date,time,amount');
    // Description contains comma + quote → must be quoted with doubled quotes
    expect(csv).toContain('"Coffee, with ""quotes"" and, comma"');
  });

  it('includes originals from storage under originals/<name>', async () => {
    mocks.storageList.mockResolvedValue({
      data: [{ name: 'abc.csv' }, { name: 'def.csv' }],
      error: null,
    });
    /*
     * Storage.download returns a Blob. We fake one whose arrayBuffer()
     * resolves to a known payload — that's the only Blob method
     * build-zip touches.
     */
    mocks.storageDownload.mockImplementation((path: string) =>
      Promise.resolve({
        data: {
          arrayBuffer: () => Promise.resolve(new TextEncoder().encode(`stub:${path}`).buffer),
        },
        error: null,
      }),
    );

    const { zipBytes } = await buildExportZip({ user: fakeUser(), profile: fakeProfile() });
    const reopened = await JSZip.loadAsync(zipBytes);

    expect(reopened.file('originals/abc.csv')).not.toBeNull();
    expect(reopened.file('originals/def.csv')).not.toBeNull();
    const abc = await reopened.file('originals/abc.csv')!.async('string');
    expect(abc).toBe('stub:profile_uuid_abc/abc.csv');
  });

  it('skips per-file storage errors without sinking the export', async () => {
    mocks.storageList.mockResolvedValue({
      data: [{ name: 'good.csv' }, { name: 'bad.csv' }],
      error: null,
    });
    mocks.storageDownload.mockImplementation((path: string) => {
      if (path.endsWith('bad.csv')) {
        return Promise.resolve({ data: null, error: { message: 'corrupt' } });
      }
      return Promise.resolve({
        data: {
          arrayBuffer: () => Promise.resolve(new TextEncoder().encode('good').buffer),
        },
        error: null,
      });
    });

    const { zipBytes } = await buildExportZip({ user: fakeUser(), profile: fakeProfile() });
    const reopened = await JSZip.loadAsync(zipBytes);

    expect(reopened.file('originals/good.csv')).not.toBeNull();
    expect(reopened.file('originals/bad.csv')).toBeNull();
  });

  it('returns empty arrays in JSON (not nulls) when there is no data', async () => {
    const { zipBytes } = await buildExportZip({ user: fakeUser(), profile: fakeProfile() });
    const reopened = await JSZip.loadAsync(zipBytes);

    const transactions: unknown = JSON.parse(
      await reopened.file('transactions.json')!.async('string'),
    );
    const healthScores: unknown = JSON.parse(
      await reopened.file('health-scores.json')!.async('string'),
    );
    expect(transactions).toEqual([]);
    expect(healthScores).toEqual([]);

    const csv = await reopened.file('transactions.csv')!.async('string');
    // Only BOM + header row; no data rows
    expect(csv.split('\r\n').filter((l) => l.length > 0)).toHaveLength(1);
  });

  it('writes a README with file counts', async () => {
    mocks.transactionListAllForExport.mockResolvedValue([
      fakeTransaction(),
      fakeTransaction({ id: 'tx2' }),
    ]);
    mocks.healthScoreListAllForExport.mockResolvedValue([fakeHealthScore()]);

    const { zipBytes } = await buildExportZip({ user: fakeUser(), profile: fakeProfile() });
    const reopened = await JSZip.loadAsync(zipBytes);
    const readme = await reopened.file('README.txt')!.async('string');

    expect(readme).toContain('IFA — Exportación de datos');
    expect(readme).toContain('2 transacciones');
    expect(readme).toContain('1 reporte');
  });
});
