import { describe, expect, it } from 'vitest';
import { auditLogRepo } from './audit-log';

/*
 * AuditLog immutability contract (S-1.10).
 *
 * The scaffolding §14 mandates an immutable audit trail. We enforce this
 * at the repository boundary rather than the DB layer (Postgres would
 * otherwise allow a superuser to UPDATE/DELETE). These tests assert the
 * contract surface directly: if a future refactor accidentally exposes
 * `update` or `delete` on this repository, tests here fail and the
 * change is visible in review.
 *
 * The ESLint rule in eslint.config.mjs provides the second layer of
 * enforcement by preventing direct prisma imports from app code.
 */

describe('auditLogRepo — immutability surface', () => {
  const FORBIDDEN_METHODS = ['update', 'updateMany', 'delete', 'deleteMany', 'upsert'] as const;

  for (const method of FORBIDDEN_METHODS) {
    it(`does not expose ${method}`, () => {
      expect((auditLogRepo as Record<string, unknown>)[method]).toBeUndefined();
    });
  }

  it('exposes only the append-and-read API', () => {
    expect(Object.keys(auditLogRepo).sort()).toEqual(
      ['count', 'create', 'findFirst', 'findMany'].sort(),
    );
  });

  it('every exposed method is callable', () => {
    for (const [name, method] of Object.entries(auditLogRepo)) {
      expect(typeof method, `auditLogRepo.${name} should be callable`).toBe('function');
    }
  });
});
