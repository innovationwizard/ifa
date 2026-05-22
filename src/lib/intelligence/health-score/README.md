# Health Score factor library

> Phase 7 Batch 9. Six pure factor functions that compose into IFA's
> proprietary Financial Health Score (0–1000). Pure (no DB, no IO, no
> implicit clock — `now` is always an argument), deterministic, and
> exhaustively unit-tested with synthetic fixtures.

## Quick reference

| #   | Factor                | Weight | Window   | Formula                                                             |
| --- | --------------------- | ------ | -------- | ------------------------------------------------------------------- |
| 1   | `spendingDiscipline`  | 20%    | last 6mo | `100 / (1 + CV(monthly_expenses))`                                  |
| 2   | `incomeStability`     | 20%    | last 6mo | `100 / (1 + CV(monthly_income))`                                    |
| 3   | `savingsRate`         | 20%    | last 3mo | `clamp((avgIncome − avgExpense) / avgIncome, 0, 0.30) / 0.30 × 100` |
| 4   | `cashFlowConsistency` | 15%    | last 6mo | `100 / (1 + CV(monthly_net))`                                       |
| 5   | `recurringSpending`   | 15%    | last 3mo | `recurring_count / total_count × 100`                               |
| 6   | `anomalyRate`         | 10%    | last 3mo | `100 − min(100, anomaly_rate × 1000)`                               |

Weights sum to **100** (pinned by `factors/index.test.ts`). Each
sub-score is clamped to `[0, 100]` and multiplied by its weight in the
engine (Batch 10) to land in the final 0–1000 range.

## Shared contracts

Every factor implements:

```ts
type FactorFn = (input: FactorInput) => FactorResult;

interface FactorInput {
  transactions: FactorTransaction[]; // caller passes ALL profile transactions; factor filters
  now: Date; // clock injection — required for testability
}

interface FactorResult {
  score: number; // [0, 100]
  partial: boolean; // true when below the factor's minimum-data threshold
  inputs: Record<string, number>; // formula transparency for the UI's "why?" expansion
}
```

`partial: true` does NOT zero the score. The engine still includes the
sub-score in the weighted sum but surfaces a "Faltan datos" badge to
the user, so the score remains directionally useful while their data
is sparse.

The `inputs` record is per-factor (each factor documents its own keys
in its source file). It's the audit trail — users can expand a factor
card on `/dashboard/salud` to see exactly which numbers went into the
score.

## Worked examples

### Factor 1 — Spending Discipline

Six months of expenses: `[1000, 1000, 1000, 1000, 1000, 1000]` (a
saint).

- Sample CV = 0 (no variability)
- score = 100 / (1 + 0) = **100**

Six months of expenses: `[100, 9000, 200, 8000, 500, 7000]` (chaos).

- Sample mean = 4133.33
- Sample stdDev ≈ 4055.8
- CV ≈ 0.981
- score = 100 / (1 + 0.981) ≈ **50.5**

### Factor 3 — Savings Rate

3 months of `(income, expense)` = `[(10000, 7000), (10000, 7000), (10000, 7000)]`:

- avgIncome = 10000, avgExpense = 7000
- rate = (10000 − 7000) / 10000 = 0.30
- clampedRate = 0.30 (at target)
- score = (0.30 / 0.30) × 100 = **100**

Same 3 months with `(10000, 8500)` each:

- rate = 0.15 (half the target)
- score = (0.15 / 0.30) × 100 = **50**

With negative net (spending > income), `(1000, 5000)` each:

- rate ≈ −4.0
- clampedRate = 0 (negative clamps to zero, NOT below)
- score = **0**

### Factor 5 — Recurring Spending Ratio

10 expenses in the last 3 months:

- 5 rows at NIT `1234567-8` (recurring, count ≥ 3)
- 5 rows at 5 distinct one-off merchants

→ recurringCount = 5, total = 10, ratio = 0.5 → **50**.

### Factor 6 — Anomaly Rate

20 expenses in the last 3 months, 1 carrying
`metadata.anomaly.method = 'merchant_zscore'` and not dismissed:

- anomalyCount = 1, total = 20, rate = 0.05
- score = 100 − min(100, 0.05 × 1000) = 100 − 50 = **50**

User-dismissed anomalies are excluded from the count
(`hasActiveAnomalyFlag` returns false for them) — affirmation that the
flagged spending is normal restores the factor's score.

## Minimum-data thresholds

Why "3+ months of relevant data" is the cliff: with 1–2 months the
CV is dominated by sample noise, the savings rate is undefined for
zero-income months, and the recurring-spending threshold (≥3 same-
merchant occurrences) can't physically be met. Below the threshold,
`partial: true` is set and the UI shows the score with a "Faltan
datos" pill. The score is still rendered because the alternative —
hiding it — would block a new user from seeing the system work at all.

Per-factor thresholds:

| Factor              | Threshold                   | Rationale                                    |
| ------------------- | --------------------------- | -------------------------------------------- |
| spendingDiscipline  | ≥3 months with expenses     | CV undefined for n<2                         |
| incomeStability     | ≥3 months with income       | same                                         |
| savingsRate         | ≥3 months with income       | rate is undefined without an income baseline |
| cashFlowConsistency | ≥3 months with any movement | same                                         |
| recurringSpending   | ≥10 EXPENSE rows in window  | recurring-detection needs sample mass        |
| anomalyRate         | ≥10 EXPENSE rows in window  | same                                         |

## Citations + sources

- **30% savings-rate target** (Factor 3 ceiling): a common LatAm
  personal-finance educator benchmark. Banco de Guatemala's own
  educational materials use 30% as the household savings goal.
- **3σ anomaly threshold** (Factor 6 via Batch 8): empirical rule —
  ≈99.7% of values fall within ±3σ for a normal-ish distribution.
  Strict inequality (`> 3`, not `≥ 3`) matches Stephen Few's outlier-
  detection convention.
- **Coefficient of Variation** (Factors 1, 2, 4): standard in
  health-data and consumer-finance variability analysis because it
  normalizes by the mean — a household spending Q500/mo and one
  spending Q50,000/mo with the same relative variability score
  identically. Fair across IFA's economically-diverse user base.
- **Sample stdDev** (in CV calculation): we treat 6 months as a
  sample of an ongoing process, not the full population. Divide by
  N-1 is the honest choice; see `helpers.ts > coefficientOfVariation`.

## Adding or changing a factor

1. Add the factor file under `factors/<key>.ts` with the standard
   `FactorFn` signature.
2. Add the corresponding `<key>.test.ts` covering: happy path, empty
   input, all-zero input, single-month input, edge values, clamp
   bounds. Use synthetic fixtures only — no DB.
3. Wire it into `factors/index.ts`: add to `FACTORS` and to
   `FACTOR_WEIGHTS`. The weights MUST still sum to 100 — the pinned
   test in `index.test.ts` will fail loudly otherwise.
4. Update this README's quick-reference table and add a worked
   example for the new formula.
5. The engine (`engine.ts`, Batch 10) reads `FACTORS` + `FACTOR_WEIGHTS`
   reflectively, so no engine change is needed for additive edits.
