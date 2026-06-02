import JSZip from 'jszip';
import type { Profile, Transaction, HealthScore, User, ProfileMember } from '@prisma/client';
import { healthScoreRepo, profileRepo, transactionRepo } from '@/lib/db/repositories';
import { withTenant } from '@/lib/db/tenant-context';
import { getSupabaseAdmin, IMPORTS_BUCKET } from '@/lib/storage/supabase-admin';

/**
 * Phase L3.6 — build the user's complete data export as a single ZIP.
 *
 * Founder-locked scope (2026-06-02):
 *   - Lean MVP entities: Profile + User + ProfileMember + Transactions
 *     + HealthScores (skip gamification/audit/notifications for now)
 *   - Include original uploaded bank statements from Supabase storage
 *     (right-to-be-forgotten / bank-grade respect for user data)
 *   - JSON files for everything + transactions.csv for Excel users +
 *     README.txt explaining each file
 *
 * Synchronous build in-request (per ADR-002 — no Vercel Cron / job
 * queue for friends-and-family beta). At this scale the ZIP build is
 * sub-second. If data volumes ever push past the 60s Vercel Pro
 * window, promote to a background job and return a signed-URL email.
 *
 * Pure function: takes (user, profile), returns Uint8Array + filename.
 * No HTTP concerns — the route handler wraps this with auth + response
 * headers. Tested directly via unit tests.
 */

export interface BuildZipInput {
  user: Pick<User, 'id' | 'email' | 'name' | 'avatarUrl' | 'locale' | 'createdAt' | 'updatedAt'>;
  profile: Profile;
}

export interface BuildZipResult {
  zipBytes: Uint8Array;
  filename: string;
}

/**
 * Builds the export ZIP for the given user+profile.
 *
 * The function gathers every tenant-scoped table the founder chose,
 * fetches uploaded originals from Supabase storage, then zips
 * everything with a README. Returns the raw bytes for the caller to
 * send back as an HTTP response.
 *
 * Throws if Prisma queries fail. Supabase storage errors per-file are
 * logged and skipped (one bad file shouldn't break the whole export)
 * but logged with the file path so we can investigate.
 */
export async function buildExportZip(input: BuildZipInput): Promise<BuildZipResult> {
  const { user, profile } = input;
  const exportedAt = new Date();

  /*
   * All Prisma reads run inside withTenant — the tenancy extension
   * injects `where: { profileId }` automatically. ProfileMember is
   * the link table and IS scoped by profileId.
   */
  const data = await withTenant({ profileId: profile.id, userId: user.id }, async () => {
    const [transactions, healthScores, members] = await Promise.all([
      transactionRepo.listAllForExport(),
      healthScoreRepo.listAllForExport(),
      profileRepo.listMembersForExport(),
    ]);
    return { transactions, healthScores, members };
  });

  const originals = await fetchOriginals(profile.id);

  const zip = new JSZip();

  zip.file('user.json', stableStringify(toExportedUser(user)));
  zip.file('profile.json', stableStringify(toExportedProfile(profile)));
  zip.file('profile-members.json', stableStringify(data.members.map(toExportedMember)));
  zip.file('transactions.json', stableStringify(data.transactions.map(toExportedTransaction)));
  zip.file('transactions.csv', buildTransactionsCsv(data.transactions));
  zip.file('health-scores.json', stableStringify(data.healthScores.map(toExportedHealthScore)));
  zip.file('README.txt', buildReadme(exportedAt, data, originals));

  for (const original of originals) {
    zip.file(`originals/${original.name}`, original.bytes);
  }

  const zipBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const datePart = exportedAt.toISOString().slice(0, 10);
  const filename = `ifa-export-${datePart}.zip`;

  return { zipBytes, filename };
}

interface OriginalFile {
  /** Filename only (no profile-id prefix), e.g. `<uuid>.csv`. */
  name: string;
  bytes: Uint8Array;
}

/**
 * List + download every uploaded original from the imports bucket
 * under the profile's prefix. Per-file errors are logged and skipped
 * so one corrupt object doesn't sink the whole export.
 */
async function fetchOriginals(profileId: string): Promise<OriginalFile[]> {
  const supabase = getSupabaseAdmin();
  const { data: list, error: listErr } = await supabase.storage
    .from(IMPORTS_BUCKET)
    .list(profileId);
  if (listErr || !list) {
    console.warn('[buildExportZip] storage.list failed', listErr);
    return [];
  }

  const results: OriginalFile[] = [];
  for (const item of list) {
    if (!item.name) continue;
    const path = `${profileId}/${item.name}`;
    const { data: blob, error: downloadErr } = await supabase.storage
      .from(IMPORTS_BUCKET)
      .download(path);
    if (downloadErr || !blob) {
      console.warn('[buildExportZip] storage.download failed', { path, error: downloadErr });
      continue;
    }
    const arr = new Uint8Array(await blob.arrayBuffer());
    results.push({ name: item.name, bytes: arr });
  }
  return results;
}

/* -------------------------------------------------------------------------- */
/* Row mappers — produce serialization-safe shapes                            */
/* -------------------------------------------------------------------------- */

function toExportedUser(user: BuildZipInput['user']) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    locale: user.locale,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function toExportedProfile(profile: Profile) {
  return {
    id: profile.id,
    displayName: profile.displayName,
    dpiNumber: profile.dpiNumber,
    dateOfBirth: profile.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    nit: profile.nit,
    currency: profile.currency,
    timezone: profile.timezone,
    onboardingCompleted: profile.onboardingCompleted,
    type: profile.type,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

function toExportedMember(member: ProfileMember) {
  return {
    id: member.id,
    profileId: member.profileId,
    userId: member.userId,
    invitedAt: member.invitedAt.toISOString(),
    joinedAt: member.joinedAt?.toISOString() ?? null,
    deletedAt: member.deletedAt?.toISOString() ?? null,
  };
}

function toExportedTransaction(tx: Transaction) {
  return {
    id: tx.id,
    externalId: tx.externalId,
    amount: tx.amount.toString(),
    currency: tx.currency,
    ivaAmount: tx.ivaAmount.toString(),
    date: tx.date.toISOString().slice(0, 10),
    time: tx.time ? tx.time.toISOString().slice(11, 19) : null,
    description: tx.description,
    merchantName: tx.merchantName,
    merchantNit: tx.merchantNit,
    category: tx.category,
    reconciliationConfidence: tx.reconciliationConfidence,
    aiCategoryConfidence: tx.aiCategoryConfidence,
    metadata: tx.metadata,
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
  };
}

function toExportedHealthScore(hs: HealthScore) {
  return {
    id: hs.id,
    score: hs.score,
    previousScore: hs.previousScore,
    factors: hs.factors,
    period: hs.period,
    computedAt: hs.computedAt.toISOString(),
    metadata: hs.metadata,
  };
}

/* -------------------------------------------------------------------------- */
/* CSV builder                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Build a transactions CSV with a UTF-8 BOM prefix so Excel renders
 * Spanish accents correctly. RFC 4180 quoting: any field containing
 * a comma, quote, or newline gets wrapped in double quotes with
 * internal quotes doubled.
 */
function buildTransactionsCsv(transactions: Transaction[]): string {
  const BOM = '﻿';
  const headers = [
    'id',
    'externalId',
    'date',
    'time',
    'amount',
    'currency',
    'ivaAmount',
    'description',
    'merchantName',
    'merchantNit',
    'category',
    'reconciliationConfidence',
    'aiCategoryConfidence',
    'createdAt',
    'updatedAt',
  ];
  const lines = [headers.join(',')];
  for (const tx of transactions) {
    lines.push(
      [
        tx.id,
        tx.externalId ?? '',
        tx.date.toISOString().slice(0, 10),
        tx.time ? tx.time.toISOString().slice(11, 19) : '',
        tx.amount.toString(),
        tx.currency,
        tx.ivaAmount.toString(),
        tx.description,
        tx.merchantName ?? '',
        tx.merchantNit ?? '',
        tx.category ?? '',
        tx.reconciliationConfidence?.toString() ?? '',
        tx.aiCategoryConfidence?.toString() ?? '',
        tx.createdAt.toISOString(),
        tx.updatedAt.toISOString(),
      ]
        .map(csvField)
        .join(','),
    );
  }
  return BOM + lines.join('\r\n');
}

function csvField(value: string): string {
  if (value === '') return '';
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/* README                                                                     */
/* -------------------------------------------------------------------------- */

function buildReadme(
  exportedAt: Date,
  data: { transactions: Transaction[]; healthScores: HealthScore[]; members: ProfileMember[] },
  originals: OriginalFile[],
): string {
  return [
    'IFA — Exportación de datos',
    `Generada: ${exportedAt.toISOString()}`,
    '',
    'Archivos incluidos:',
    '',
    '  user.json',
    '    Tu cuenta de IFA: correo, nombre, idioma, fechas.',
    '',
    '  profile.json',
    '    Tu perfil: nombre, DPI, fecha de nacimiento, NIT, moneda, zona horaria.',
    '',
    '  profile-members.json',
    `    Membresías del perfil (${data.members.length} fila${data.members.length === 1 ? '' : 's'}).`,
    '',
    `  transactions.json   —   ${data.transactions.length} transaccion${data.transactions.length === 1 ? '' : 'es'}`,
    '    Todas tus transacciones en formato JSON, con cada campo tal como lo guardamos.',
    '',
    '  transactions.csv',
    '    Las mismas transacciones, listas para abrir en Excel o Google Sheets.',
    '',
    `  health-scores.json   —   ${data.healthScores.length} reporte${data.healthScores.length === 1 ? '' : 's'} de Salud Financiera`,
    '    Historial completo de tu Salud Financiera (cálculos y factores).',
    '',
    `  originals/   —   ${originals.length} archivo${originals.length === 1 ? '' : 's'} original${originals.length === 1 ? '' : 'es'}`,
    '    Los estados de cuenta que subiste a IFA, tal como los recibimos.',
    '',
    '— Si tienes dudas sobre algún archivo, escríbenos.',
  ].join('\n');
}

/* -------------------------------------------------------------------------- */
/* Stable JSON                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `JSON.stringify` with 2-space indent. Stable insertion-order keys
 * (callers pass plain literals so we get the natural object order).
 * Decimal columns are already stringified at the mapper layer to
 * avoid `[object Decimal]` artifacts.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
