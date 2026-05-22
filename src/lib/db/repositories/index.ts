/**
 * Repository layer — the only sanctioned entrypoint for data access
 * outside of `src/lib/db/**`.
 *
 * Repositories are added here as feature stories need them. The initial
 * export is `auditLogRepo` (S-1.10) because audit immutability is the
 * strongest contract we need enforced from day one. Other repositories
 * (transactions, accounts, journal entries, ...) land alongside their
 * respective phase-2+ stories.
 *
 * Consumers:
 *   import { auditLogRepo } from '@/lib/db/repositories';
 *
 * Never:
 *   import { prisma } from '@/lib/db/prisma';
 *
 * The ESLint `no-restricted-imports` rule enforces the above outside
 * the `src/lib/db/**` directory itself.
 */

export { auditLogRepo } from './audit-log';
export type { AuditLogRepo } from './audit-log';

export { accountRepo } from './account';
export type { AccountRepo } from './account';

export { profileRepo } from './profile';
export type { ProfileRepo } from './profile';

export { userRepo } from './user';
export type { UserRepo } from './user';

export { transactionRepo } from './transaction';
export type {
  CreateManualInput,
  CreateManualResult,
  ImportRow,
  TransactionRepo,
  TransactionDetail,
  TransactionListArgs,
  TransactionListCursor,
  TransactionListFilters,
  TransactionListResult,
} from './transaction';

export { merchantCategoryRepo } from './merchant-category';
export type { MerchantCategoryRepo } from './merchant-category';

export { healthScoreRepo } from './health-score';
export type {
  CreateHealthScoreInput,
  CreateHealthScoreResult,
  HealthScoreRepo,
} from './health-score';
