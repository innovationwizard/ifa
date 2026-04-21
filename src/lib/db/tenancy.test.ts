import { describe, expect, it } from 'vitest';
import {
  TenantContextMissingError,
  getTenantContext,
  requireTenant,
  withTenant,
} from './tenant-context';
import { TENANT_SCOPED_MODELS } from './tenancy';

const ORG_A = '00000000-0000-0000-0000-00000000000a';
const ORG_B = '00000000-0000-0000-0000-00000000000b';
const USER_ID = '00000000-0000-0000-0000-00000000001a';

describe('tenant context', () => {
  it('returns undefined outside a withTenant scope', () => {
    expect(getTenantContext()).toBeUndefined();
  });

  it('propagates organizationId and userId inside a scope', async () => {
    await withTenant({ organizationId: ORG_A, userId: USER_ID }, () => {
      const ctx = getTenantContext();
      expect(ctx).toEqual({ organizationId: ORG_A, userId: USER_ID });
    });
  });

  it('allows userId to be null (cron/system path)', async () => {
    await withTenant({ organizationId: ORG_A, userId: null }, () => {
      expect(getTenantContext()?.userId).toBeNull();
    });
  });

  it('isolates contexts across concurrent scopes', async () => {
    const seen: string[] = [];
    await Promise.all([
      withTenant({ organizationId: ORG_A, userId: USER_ID }, async () => {
        await new Promise((r) => setTimeout(r, 10));
        seen.push(getTenantContext()!.organizationId);
      }),
      withTenant({ organizationId: ORG_B, userId: USER_ID }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        seen.push(getTenantContext()!.organizationId);
      }),
    ]);
    expect(seen.sort()).toEqual([ORG_A, ORG_B].sort());
  });

  it('restores outer context after nested scope exits', async () => {
    await withTenant({ organizationId: ORG_A, userId: USER_ID }, async () => {
      await withTenant({ organizationId: ORG_B, userId: USER_ID }, () => Promise.resolve());
      expect(getTenantContext()?.organizationId).toBe(ORG_A);
    });
  });

  it('requireTenant throws TenantContextMissingError outside a scope', () => {
    expect(() => requireTenant('Transaction', 'findMany')).toThrowError(TenantContextMissingError);
  });

  it('TenantContextMissingError carries model and operation in its message', () => {
    try {
      requireTenant('Transaction', 'findMany');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TenantContextMissingError);
      expect((err as Error).message).toContain('Transaction.findMany');
    }
  });

  it('requireTenant returns the context inside a scope', async () => {
    await withTenant({ organizationId: ORG_A, userId: USER_ID }, () => {
      const ctx = requireTenant('Transaction', 'findMany');
      expect(ctx.organizationId).toBe(ORG_A);
    });
  });
});

describe('TENANT_SCOPED_MODELS allowlist', () => {
  it('covers every top-level tenant-owned table from the schema', () => {
    // Top-level tables with an `organizationId` column that take tenant
    // filtering directly. Sidecar tables (FelDteData, TpvTransactionData,
    // JournalEntryLine, XpEvent, UserBadge, UserMission, TransactionAudit)
    // intentionally omitted — they isolate through their parent.
    const expected = [
      'OrganizationMember',
      'Transaction',
      'Reconciliation',
      'Account',
      'AccountingPeriod',
      'JournalEntry',
      'AccountingRule',
      'HealthScore',
      'HealthScoreAction',
      'GamificationProfile',
      'Integration',
      'AuditLog',
      'Notification',
    ];
    for (const model of expected) {
      expect(TENANT_SCOPED_MODELS.has(model)).toBe(true);
    }
  });

  it('excludes global tables (User, Badge, Mission, Organization itself)', () => {
    for (const model of ['User', 'Badge', 'Mission', 'Organization']) {
      expect(TENANT_SCOPED_MODELS.has(model)).toBe(false);
    }
  });

  it('excludes sidecar tables reached via parent relations', () => {
    for (const model of [
      'FelDteData',
      'TpvTransactionData',
      'JournalEntryLine',
      'XpEvent',
      'UserBadge',
      'UserMission',
      'TransactionAudit',
    ]) {
      expect(TENANT_SCOPED_MODELS.has(model)).toBe(false);
    }
  });
});
