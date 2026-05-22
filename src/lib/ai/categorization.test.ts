/**
 * @vitest-environment node
 */
import {
  type Mock,
  type MockInstance,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { MerchantCategory } from '@prisma/client';

/*
 * Shim `@/lib/env` so the categorization service's transitive load
 * of the Claude wrapper (which calls `getServerEnv()`) doesn't trip
 * the module-level env validation in `src/lib/env.ts` during tests.
 */
vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    supabaseServiceRoleKey: 'unused-in-this-suite',
    databaseUrl: 'unused-in-this-suite',
    directUrl: 'unused-in-this-suite',
    anthropicApiKey: 'sk-ant-test-fake-key',
  }),
}));

/*
 * Stub the repositories barrel — the categorization service is the
 * unit under test; the repo is a collaborator we want to drive
 * directly to simulate cache hit / miss / race conditions.
 */
vi.mock('@/lib/db/repositories', () => ({
  merchantCategoryRepo: {
    findByLookupKey: vi.fn(),
    create: vi.fn(),
  },
}));

/*
 * Stub `withTenant` so we don't need a real Prisma + AsyncLocalStorage
 * setup in the unit suite. The categorization service only uses
 * `withTenant` as an outer wrapper; we invoke the callback directly.
 */
vi.mock('@/lib/db/tenant-context', () => ({
  withTenant: <T>(_ctx: unknown, fn: () => T | Promise<T>): Promise<T> => Promise.resolve(fn()),
}));

/*
 * Stub the Claude wrapper. Default behavior set per-test via the
 * mock function below.
 */
vi.mock('./claude', () => ({
  MODEL_HAIKU: 'claude-haiku-4-5-20251001',
  MODEL_OPUS: 'claude-opus-4-7',
  callClaudeWithRetry: vi.fn(),
}));

import { merchantCategoryRepo } from '@/lib/db/repositories';
import { callClaudeWithRetry } from './claude';
import { categorizeMerchant, normalizeLookupKey } from './categorization';

type FindMock = Mock<(lookupKey: string) => Promise<MerchantCategory | null>>;
type CreateMock = Mock<(data: unknown) => Promise<MerchantCategory>>;
type CallClaudeMock = Mock<(req: unknown) => Promise<Anthropic.Message>>;

/*
 * The repo + Claude module are mocked above with `vi.fn()`; cast their
 * imported references to the typed Mock shape so we can drive each
 * call's resolved/rejected value per test. The triple-cast through
 * `unknown` is the standard escape hatch when the source signature
 * (Prisma's typed delegate) does not match the simplified test shape.
 * `unbound-method` does not apply — these are plain mock functions,
 * not real prototype methods that need `this` bound.
 */
/* eslint-disable @typescript-eslint/unbound-method -- mocked vi.fn refs; see comment above */
const findByLookupKey = merchantCategoryRepo.findByLookupKey as unknown as FindMock;
const create = merchantCategoryRepo.create as unknown as CreateMock;
/* eslint-enable @typescript-eslint/unbound-method */
const callClaudeMock = callClaudeWithRetry as unknown as CallClaudeMock;

function fakeClaudeResponse(text: string): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5-20251001',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  } as unknown as Anthropic.Message;
}

function fakeCacheRow(overrides: Partial<MerchantCategory> = {}): MerchantCategory {
  return {
    id: 'mc_test_id',
    profileId: 'prof_test_id',
    lookupKey: 'name:walmart',
    category: 'Alimentación',
    source: 'AI',
    aiConfidence: 0.92,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
  };
}

const PROFILE_ID = 'prof_test_id';

describe('normalizeLookupKey', () => {
  it('prefers NIT when present', () => {
    expect(normalizeLookupKey({ merchantName: 'Walmart', merchantNit: '1234567-8' })).toBe(
      'nit:1234567-8',
    );
  });

  it('falls back to normalized merchant name when NIT is absent', () => {
    expect(normalizeLookupKey({ merchantName: 'Walmart' })).toBe('name:walmart');
  });

  it('strips accents in the merchant name', () => {
    expect(normalizeLookupKey({ merchantName: 'Pollo Campero — Miraflores' })).toBe(
      'name:pollo campero — miraflores',
    );
    expect(normalizeLookupKey({ merchantName: 'Cafetería Sarità' })).toBe('name:cafeteria sarita');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeLookupKey({ merchantName: 'EEGSA    \t  Energía' })).toBe('name:eegsa energia');
  });

  it('treats null / empty / whitespace-only NIT as absent', () => {
    expect(normalizeLookupKey({ merchantName: 'Walmart', merchantNit: null })).toBe('name:walmart');
    expect(normalizeLookupKey({ merchantName: 'Walmart', merchantNit: '' })).toBe('name:walmart');
    expect(normalizeLookupKey({ merchantName: 'Walmart', merchantNit: '   ' })).toBe(
      'name:walmart',
    );
  });

  it('returns empty string when neither NIT nor name is usable', () => {
    expect(normalizeLookupKey({ merchantName: null })).toBe('');
    expect(normalizeLookupKey({ merchantName: '' })).toBe('');
    expect(normalizeLookupKey({ merchantName: '   ', merchantNit: null })).toBe('');
  });
});

describe('categorizeMerchant', () => {
  let warnSpy: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    findByLookupKey.mockReset();
    create.mockReset();
    callClaudeMock.mockReset();
    warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(((..._args: unknown[]) => undefined) as () => void);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('cache hit — returns cached category + cached confidence without calling Claude', async () => {
    findByLookupKey.mockResolvedValue(
      fakeCacheRow({
        category: 'Alimentación',
        aiConfidence: 0.92,
        lookupKey: 'name:walmart',
      }),
    );

    const result = await categorizeMerchant(PROFILE_ID, { merchantName: 'Walmart' });

    expect(result).toEqual({ category: 'Alimentación', confidence: 0.92 });
    expect(findByLookupKey).toHaveBeenCalledTimes(1);
    expect(findByLookupKey).toHaveBeenCalledWith('name:walmart');
    expect(callClaudeMock).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('cache miss → AI success — calls Claude, writes cache, returns category', async () => {
    findByLookupKey.mockResolvedValue(null);
    callClaudeMock.mockResolvedValue(
      fakeClaudeResponse('{"category":"Restaurantes","confidence":0.91}'),
    );
    create.mockResolvedValue(
      fakeCacheRow({
        category: 'Restaurantes',
        aiConfidence: 0.91,
        lookupKey: 'name:pollo campero',
      }),
    );

    const result = await categorizeMerchant(PROFILE_ID, {
      merchantName: 'Pollo Campero',
    });

    expect(result).toEqual({ category: 'Restaurantes', confidence: 0.91 });
    expect(callClaudeMock).toHaveBeenCalledTimes(1);

    /*
     * Inspect the Claude request shape: stable system prompt with
     * ephemeral cache_control + variable user payload. This is what
     * makes the ≥90% prompt-cache-hit target reachable.
     */
    const callArgs = callClaudeMock.mock.calls[0]?.[0] as {
      model: string;
      system: { type: string; cache_control?: { type: string } }[];
      messages: { role: string; content: string }[];
    };
    expect(callArgs.model).toBe('claude-haiku-4-5-20251001');
    expect(callArgs.system[0]?.cache_control?.type).toBe('ephemeral');
    expect(callArgs.messages[0]?.role).toBe('user');

    expect(create).toHaveBeenCalledTimes(1);
    const createArgs = create.mock.calls[0]?.[0] as {
      profileId: string;
      lookupKey: string;
      category: string;
      source: string;
      aiConfidence: number;
    };
    expect(createArgs.profileId).toBe(PROFILE_ID);
    expect(createArgs.lookupKey).toBe('name:pollo campero');
    expect(createArgs.category).toBe('Restaurantes');
    expect(createArgs.source).toBe('AI');
    expect(createArgs.aiConfidence).toBe(0.91);
  });

  it('cache miss → AI error — returns null, does NOT write cache', async () => {
    findByLookupKey.mockResolvedValue(null);
    callClaudeMock.mockRejectedValue(new Error('network down'));

    const result = await categorizeMerchant(PROFILE_ID, { merchantName: 'New Merchant' });

    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('cache miss → malformed AI response — returns null, does NOT write cache', async () => {
    findByLookupKey.mockResolvedValue(null);
    callClaudeMock.mockResolvedValue(fakeClaudeResponse('Sure thing, I think this is groceries.'));

    const result = await categorizeMerchant(PROFILE_ID, { merchantName: 'Some Store' });

    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('cache miss → out-of-vocabulary category — rejects, returns null', async () => {
    findByLookupKey.mockResolvedValue(null);
    callClaudeMock.mockResolvedValue(
      fakeClaudeResponse('{"category":"Groceries","confidence":0.95}'),
    );

    const result = await categorizeMerchant(PROFILE_ID, { merchantName: 'Some Store' });

    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('cache miss → confidence out of range — rejects, returns null', async () => {
    findByLookupKey.mockResolvedValue(null);
    callClaudeMock.mockResolvedValue(fakeClaudeResponse('{"category":"Salud","confidence":1.5}'));

    const result = await categorizeMerchant(PROFILE_ID, { merchantName: 'Some Store' });

    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('empty lookup key (no NIT, no name) — returns null without any IO', async () => {
    const result = await categorizeMerchant(PROFILE_ID, { merchantName: null });

    expect(result).toBeNull();
    expect(findByLookupKey).not.toHaveBeenCalled();
    expect(callClaudeMock).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('concurrent-write race — re-fetches and returns the winning row', async () => {
    /*
     * Simulates: two callers cache-miss simultaneously. First create
     * wins; second hits the `uniq_profile_lookup_key` constraint.
     * The service must re-fetch (not bubble the unique violation up
     * to the caller) and return whatever the winner wrote.
     */
    findByLookupKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(fakeCacheRow({ category: 'Servicios', lookupKey: 'name:eegsa' }));
    callClaudeMock.mockResolvedValue(
      fakeClaudeResponse('{"category":"Servicios","confidence":0.88}'),
    );
    create.mockRejectedValue(new Error('Unique constraint failed: uniq_profile_lookup_key'));

    const result = await categorizeMerchant(PROFILE_ID, { merchantName: 'EEGSA' });

    expect(result).toEqual({ category: 'Servicios', confidence: 0.92 });
    expect(findByLookupKey).toHaveBeenCalledTimes(2);
  });
});
