# IFA — Data-Visualization Best Practices (Research)

> Authoritative source for chart, graph, and report design decisions in IFA.
> Compiled 2026-05-21 from primary sources: industry leaders' product docs,
> Nielsen Norman Group, W3C WCAG 2.2, Edward Tufte, Stephen Few, Cole Knaflic,
> Wexler/Shaffer/Cotgreave, ColorBrewer, peer-reviewed perception research,
> RAE, Banco de Guatemala, and the published GitHub state of every major React
> chart library as of May 2026.
>
> Per [\_THE_RULES.MD](../docs_genesis/_THE_RULES.MD): every claim here is
> sourced. Where the research was unreachable or ambiguous, the gap is called
> out explicitly. No fabrication.

---

## 0. Executive summary

**Tech stack decision:** Keep **Recharts 3.8.1** as the default chart engine.
Adopt **shadcn/ui charts** (Recharts wrappers with Tailwind v4 theming) on top.
Reserve **TradingView Lightweight Charts** for the eventual trading view.
Hold **Apache ECharts** in reserve for advanced charts (heatmaps, Sankey, true
SSR) — do not migrate today. **Reject** Highcharts (commercial $366/seat/yr
for SaaS), LightningChart ($2,695/dev), Chart.js (SSR-hostile canvas), Nivo
(RSC-incompatible), Visx (v4 alpha limbo), Plotly (3 MB bundle).

**Top three design pivots vs. what we shipped in the demo:**

1. **Replace the semicircle Health-Score gauge with a bullet graph.** Stephen
   Few — the dean of dashboard design — has written explicitly against radial
   gauges. They are space-inefficient and degrade in comparison contexts.
   Bullet graphs convey actual / target / threshold bands linearly in a small
   space. See §1.5 + §2.
2. **Currency format `Q 1,234.56`** — `Q`, then a non-breaking space
   (U+00A0), then the amount with comma thousands + period decimal.
   `es-GT` decimal convention matches the US, **opposite** of Spain's
   `1.234,56`. Banco de Guatemala writes its own currency `Q 1.00` with
   a space on the conmemorativo billete page; `Intl.NumberFormat('es-GT',
{ currencyDisplay: 'narrowSymbol' })` produces exactly this shape.
   _Correction:_ an earlier draft of this doc claimed "no space"; that
   was an overspecification not borne out by Banguat's own writing or
   by CLDR locale data. See §3.
3. **Bar by default, horizontal sorted descending for category breakdowns.**
   NN/g: "in the vast majority of cases, use bar charts, line charts, or
   scatterplots." Donut/pie only when ≤5 slices and the explicit job is
   "share of whole."

**Top three product patterns to adopt from leaders:**

- **Sankey for cash flow** (Monarch shipped Sep 2023 — their highest-leverage
  view). Recharts lacks native Sankey; either custom SVG or a one-off
  `@nivo/sankey` import for that single component.
  **Decision (2026-05-21): No Sankey adopted for now (rejected for the
  time being).** Cash-flow reports will use stacked bars + grouped bars
  in Batch 7. Revisit when a dedicated cash-flow view warrants the
  ~50 KB dep, or when ECharts is adopted for other reasons (see §4.3
  "Re-evaluate ECharts when…").
- **Stacked bars with dotted-line previous-period overlay** (Copilot Money
  Cash Flow). One chart answers "how am I doing vs. last month?"
- **Two-mode reports — Breakdown (totals) and Trends (over time)** (Monarch).
  Mirrors how non-technical users think about money: "where" vs "when."

---

## 1. Design principles

### 1.1 Tufte foundations

Edward Tufte, _The Visual Display of Quantitative Information_ (1983):

- **Data-ink ratio:** "A large share of ink on a graphic should present
  data-information, the ink changing as the data change."
  ([InfoVis-Wiki](https://infovis-wiki.net/wiki/Data-Ink_Ratio))
- **Above all else show the data.**
- **Erase non-data-ink, erase redundant data-ink, avoid chartjunk, use small
  multiples for comparisons.** ([EU Data Portal — chart junk and data ink](https://data.europa.eu/apps/data-visualisation-guide/chart-junk-and-data-ink-origins))

### 1.2 Nielsen Norman Group — chart type & dashboard

- **Bar/line/scatter win by default.** "In the vast majority of cases, use bar
  charts, line charts, or scatterplots… bar charts make it easy for people to
  quickly and accurately perceive the differences between values."
  ([NN/g — Choosing Chart Types](https://www.nngroup.com/articles/choosing-chart-types/))
- **Avoid circular charts for quantitative comparison.** Pies, gauges, radar
  rely on area/angle which humans estimate poorly. Donuts are **worse** than
  pies because the central whitespace shrinks each slice's area further.
  (Same NN/g source.)
- **Two dashboard archetypes — pick one per screen.** _Operational_
  (time-sensitive, glanceable) vs. _Analytical_ (exploratory). IFA's
  `/dashboard` is operational; `/reportes` is analytical.
  ([NN/g — Dashboards: Making Charts and Graphs Easier to Understand](https://www.nngroup.com/articles/dashboards-preattentive/))
- **Color is a _secondary_ grouping cue, not primary.** Position, length, and
  shape come first; color saturates the encoding.

### 1.3 Stephen Few — bullet graphs > gauges

- **Radial gauges fail at comparison.** _Information Dashboard Design_:
  gauges "use a great deal of space to say relatively little… they fail
  spectacularly when intended for comparison."
  ([Few — Our Fascination with All Things Circular](http://www.perceptualedge.com/articles/visual_business_intelligence/our_fascination_with_all_things_circular.pdf))
- **Bullet graphs replace them.** Linear, no frills, encode actual value +
  threshold bands + comparison target in a small space.
  ([Few — Bullet Graph Design Spec](https://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf))

**IFA implication:** the demo's semicircle gauge for the Health Score is a
[textbook anti-pattern](http://www.perceptualedge.com/articles/visual_business_intelligence/our_fascination_with_all_things_circular.pdf).
Phase 7 Batch 12 ("Gauge UI component" in the plan) should be retitled
**"Bullet graph UI component"** and built around a horizontal track with
threshold bands (Crítico 0-399 red, En riesgo 400-599 amber, Estable 600-799
teal, Excelente 800-1000 deep teal), an actual-value marker, and a
"comparación" tick (last month's value).

### 1.4 WCAG 2.2 — accessibility floor

- **SC 1.4.11 Non-text Contrast = 3:1 minimum** for "parts of graphics
  required to understand the content" — chart lines, bar fills, slice
  boundaries.
  ([W3C — Understanding 1.4.11](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html))
- **Adjacent-color rule (G209):** if two colored regions have <3:1 contrast
  between themselves, add a ≥3:1 border. Applies to stacked bars and pie
  segments.
  ([W3C — G209](https://www.w3.org/WAI/WCAG21/Techniques/general/G209))
- **SC 1.4.1 — never rely on color alone.** Pair income/expense color with
  shape (▲/▼), position (stack income above expense), or label.
  ([W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/))

### 1.5 Chart-type decisions for IFA's actual surfaces

| IFA surface                                   | Recommended                                                                                                                                                                                                       | Why                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Cash flow over time** (ingresos/gastos)     | **Grouped vertical bars** per month (ingresos + gastos side-by-side) with a thin **line overlay** for neto                                                                                                        | Knaflic catalogs vertical bar + line as the recurring winner       |
| **Net change month-over-month**               | **Waterfall** (starting balance → +ingresos → −gastos → ending)                                                                                                                                                   | Knaflic; purpose-built for this exact narrative                    |
| **Spending by category**                      | **Horizontal bar**, sorted descending, top 6 + "Otros" rollup                                                                                                                                                     | NN/g: bars >> pie/donut for quantitative comparison                |
| **Top merchants**                             | Horizontal bar, top 5–10                                                                                                                                                                                          | Same NN/g rationale                                                |
| **Financial Health Score**                    | **Bullet graph** (not radial gauge)                                                                                                                                                                               | Stephen Few above                                                  |
| **Period-over-period (este mes vs anterior)** | **Side-by-side bars** or **comet chart** ([Wexler](https://www.datarevelations.com/showing-now-versus-then-consider-a-comet-chart/)); never dual-axis lines                                                       | Big Book of Dashboards; comet handles two-point comparison cleanly |
| **Forecast / projection**                     | **Fan chart** with a shaded "rango probable" band ([BIS — Fan Chart PDF](https://www.bis.org/ifc/events/ifc_8thconf/ifc_8thconf_62pap.pdf), [Wikipedia](<https://en.wikipedia.org/wiki/Fan_chart_(time_series)>)) | Never a single deterministic future line                           |
| **At-a-glance KPI cards**                     | Number + **single sparkline** + trend % with ▲/▼ (Stripe Dashboard convention)                                                                                                                                    | Stripe `docs.stripe.com/dashboard/basics`                          |
| **Spending heatmap (calendar)**               | Calendar heatmap (per-day intensity)                                                                                                                                                                              | Future story; not in current scope but flagged                     |

### 1.6 Mobile-first (375 px)

- **Touch targets ≥ 44×44 pt** ([Apple HIG](https://developer.apple.com/design/human-interface-guidelines/)).
- **Charts communicate clearly first, look good second** ([Apple HIG Charts](https://developer.apple.com/design/human-interface-guidelines/charts)).
- **Progressive disclosure on mobile** — tap to reveal details, not hover ([Material Design 3 — Data Viz Accessibility](https://m3.material.io/blog/data-visualization-accessibility)).
- Practical: at 375 px, max 6 categories visible above the fold; vertical
  scroll for the rest; inline labels, no separate legend; font ≥ 11 pt
  (≥ 13 pt preferred).

---

## 2. Anti-patterns — never ship these

| Anti-pattern                                                      | Why                                                                                      | Source                                                                                                                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **3D charts** (3D pie, 3D bar)                                    | Perspective distorts perceived values                                                    | Knaflic                                                                                                                                                            |
| **Pie/donut > 5 slices**                                          | Angle/area imperceptible past ~5; donut whitespace makes it worse                        | NN/g                                                                                                                                                               |
| **Dual y-axes**                                                   | Arbitrary scales; visual crossings carry no semantic meaning                             | [Datawrapper](https://www.datawrapper.de/blog/dualaxis); Few                                                                                                       |
| **Radial gauges**                                                 | Space-inefficient, bad for comparison — bullet graphs win                                | [Few PDF](http://www.perceptualedge.com/articles/visual_business_intelligence/our_fascination_with_all_things_circular.pdf)                                        |
| **Truncated y-axis on bar charts**                                | 83.5% of viewers perceived inflated differences even **after warning**, across 5 studies | [Correll et al. 2020](https://www.sciencedirect.com/science/article/abs/pii/S2211368120300978), [Tableau Research PDF](https://par.nsf.gov/servlets/purl/10196093) |
| **Chartjunk** (gradients, drop shadows, gridlines on every value) | Reduces data-ink ratio; preattentively distracting                                       | Tufte; [NN/g video](https://www.nngroup.com/videos/chartjunk/)                                                                                                     |
| **Color as sole encoder**                                         | Fails WCAG 1.4.1 + ~8% of male users (deutan/protan colorblindness)                      | W3C                                                                                                                                                                |
| **RdYlGn diverging palette**                                      | Not colorblind-safe — use **RdBu**, **PiYG**, or **BrBG** instead                        | [ColorBrewer 2.0](https://colorbrewer2.org/)                                                                                                                       |
| **Verbose chart titles**                                          | "Gastos del mes" > "Total Spending for the Current Calendar Month"                       | Stripe Dashboard convention                                                                                                                                        |
| **Charts on empty state**                                         | Flat-line/empty pie signals broken software                                              | [JPN Fintech — empty-state activation case study](https://www.jpnfintech.com/how-to-design-better-empty-states-for-fintech-products/)                              |
| **Sankey on mobile as primary view**                              | Doesn't read well at 375 px — Monarch deliberately gates Sankey to web                   | [Monarch help](https://help.monarch.com/hc/en-us/articles/21846787088916-Using-Reports)                                                                            |

---

## 3. Spanish / Guatemalan localization

| Item                             | es-GT convention                                                                                                                                                                                              | Source                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Thousands separator**          | `,` — `1,234.56`                                                                                                                                                                                              | [CLDR es-GT](https://www.localeplanet.com/icu/es-GT/index.html); _opposite_ of Spain (`1.234,56`)                                      |
| **Decimal separator**            | `.`                                                                                                                                                                                                           | Same as above                                                                                                                          |
| **Currency code**                | `GTQ` (ISO 4217)                                                                                                                                                                                              | [Wikipedia](https://en.wikipedia.org/wiki/ISO_4217:GTQ)                                                                                |
| **Currency placement**           | `Q` **before** the number, separated by a non-breaking space (U+00A0): `Q 100.00`, `Q 1,234.56` — what `Intl.NumberFormat('es-GT', { currencyDisplay: 'narrowSymbol' })` emits and what Banguat itself writes | [Banco de Guatemala — Billete Conmemorativo Q 1.00](https://banguat.gob.gt/page/billete-conmemorativo-q-100)                           |
| **Decimals**                     | Always show 2 for currency; drop only when chart is tight (label "Miles de Q")                                                                                                                                |                                                                                                                                        |
| **Month abbreviations (RAE)**    | `ene. feb. mar. abr. may. jun. jul. ago. sept. oct. nov. dic.`                                                                                                                                                | RAE / [PTA Spanish Style Guide](https://www.pta.org/docs/default-source/uploadedfiles/downloads/spanishtranslationstyleguide-2017.pdf) |
| **Vocabulary** (per IFA mandate) | _gastos_ not _egresos_; _ingresos_ OK; _neto_ OK; _promedio_ not _media_; _meta_ not _objetivo_; no English borrowings                                                                                        |                                                                                                                                        |

**Implementation:** single source of truth via `Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' })` and `Intl.DateTimeFormat('es-GT', { month: 'short' })`. Both back onto CLDR and produce the right results out of the box. Never hand-format currency.

---

## 4. Tech-stack landscape (May 2026)

### 4.1 Scored matrix (1–5, IFA-weighted; higher = better)

| Library                            | Maint. | Bundle      | A11y | RSC fit         | TS  | Dashboard ergo | License safety | **Total**               |
| ---------------------------------- | ------ | ----------- | ---- | --------------- | --- | -------------- | -------------- | ----------------------- |
| **shadcn/ui charts** (on Recharts) | 5      | 2           | 3    | 3               | 5   | 5              | 5              | **28**                  |
| **ECharts + react-echarts-kit**    | 5      | 3 → 5 (SSR) | 4    | 5               | 4   | 5              | 5              | **31**                  |
| **Recharts 3** (installed)         | 4      | 2           | 2    | 3 (client wrap) | 5   | 4              | 5              | **25**                  |
| **TradingView Lightweight Charts** | 5      | 5           | 3    | 3               | 4   | 5 (finance)    | 4 (attrib.)    | **29** _(trading view)_ |
| **Tremor (Raw)**                   | 3      | 2           | 4    | 3               | 5   | 5              | 5              | **27**                  |
| **Highcharts**                     | 5      | 3           | 4    | 4               | 4   | 5              | **1**          | **26**                  |
| **Nivo**                           | 3      | 2           | 3    | 1               | 5   | 4              | 5              | **23**                  |
| **Chart.js**                       | 5      | 3           | 2    | 1               | 4   | 3              | 5              | **23**                  |
| **Visx**                           | 2      | 4           | 2    | 3               | 4   | 2              | 5              | **22**                  |
| **LightningChart**                 | 5      | 2           | 3    | 3               | 4   | 4              | **1**          | **22**                  |
| **Plotly**                         | 4      | 1           | 3    | 2               | 3   | 3              | 5              | **21**                  |
| **Observable Plot**                | 3      | 4           | 2    | 2               | 3   | 2              | 5              | **21**                  |

### 4.2 Library notes

- **Recharts 3.8.1** — MIT, 27.2k★, last release Mar 25 2026 ([github.com/recharts/recharts](https://github.com/recharts/recharts)). React 19 fit improved but **regression risk persists**: open issue [#6857](https://github.com/recharts/recharts/issues/6857) (Jan 2026, "Recharts not rendering after upgrading to React 19.2.3"). ~136 KB gzipped. SVG-based, needs `"use client"` wrapper. Weak built-in a11y. **Strong at** line, area, bar, stacked bar, pie, radial, sparklines, composed; **weak at** gauges (fiddly), heatmaps (none), Sankey (none), candlesticks (basic).
- **shadcn/ui charts** ([ui.shadcn.com/charts](https://ui.shadcn.com/charts)) — opinionated Recharts wrappers with Tailwind v4 theming + dark mode + accessible tooltips. Copy-paste install, no new runtime dep.
- **Apache ECharts 6.1.0** — Apache-2.0, 66.4k★, last release May 19 2026. **Real SSR**: `init({ssr:true})` emits SVG strings; 5.5+ ships a ~1 KB-gzip client runtime. Best-in-class for gauges, heatmaps, candlesticks, Sankey. React wrapper via `echarts-for-react` or newer [react-echarts-kit](https://dev.to/cimthog/react-echarts-kit-ssr-safe-chart-components-for-react-nextjs-36ed). Bundle is ~900 KB / ~300 KB gzip un-tree-shaken; drops sharply with manual module imports.
- **TradingView Lightweight Charts 5.2.0** — Apache-2.0 + **mandatory attribution**, ~45 KB gzipped, canvas-based, finance-specific (candlesticks, OHLC, volume, crosshairs). Attribution-logo option satisfies the credit requirement in-chart. ([Lightweight Charts docs](https://www.tradingview.com/lightweight-charts/))
- **Tremor** — Vercel-acquired; original repo low-energy, but **Tremor Raw** (Tailwind v4 friendly, copy-paste shadcn-style) is the active surface. Wraps Recharts under the hood — picking Tremor doesn't _replace_ Recharts, it adds opinionated wrappers.
- **Nivo** — RSC-hostile: every chart errors `createContext only works in Client Components` ([issue #2626](https://github.com/plouc/nivo/issues/2626)). One-off use for Sankey (`@nivo/sankey`) is acceptable inside a client component.
- **Highcharts** — **commercial license trap**. Free only for personal/non-commercial. IFA's SaaS requires the **$366/dev/year SaaS license** ([Highcharts shop](https://shop.highcharts.com/)). Hard pass.
- **Chart.js** — Canvas-only → SSR-hostile in Next ([Chart.js Node docs](https://www.chartjs.org/docs/latest/getting-started/using-from-node-js.html)). Bad fit for RSC-first.
- **Visx** — v4 still **alpha** with React 19 ([issue #1883](https://github.com/airbnb/visx/issues/1883)). Wrong cost/benefit for IFA now.
- **Plotly** — ~3 MB min / ~800 KB gzip even minified. Scientific overkill.
- **LightningChart** — $2,695/dev perpetual ([pricing](https://lightningchart.com/js-charts/pricing/)). Built for 100k+ point real-time streams. Overkill.
- **Observable Plot** — grammar-of-graphics, no React component layer (mount into ref), slow release cadence. Not a primary dashboard pick.

### 4.3 Recommendation

```
Default charts:           Recharts (via shadcn/ui charts wrappers)
Sankey (cash flow):       DEFERRED 2026-05-21 — no Sankey adopted for now
                          (rejected for the time being). Cash flow uses
                          stacked + grouped bars in Batch 7. Revisit if a
                          dedicated cash-flow view warrants the dep.
Trading / candlesticks:   TradingView Lightweight Charts (future trading view)
Health Score:             Hand-rolled SVG bullet graph
Heatmaps / advanced:      ECharts (lazy-loaded route, SSR-rendered) — when needed
```

**Re-evaluate ECharts when**: (a) you need spending-calendar heatmaps, (b) Sankey grows beyond a single view, (c) Vercel cold-start budgets force SSR of dashboard charts to cut hydration JS.

---

## 5. Cross-cutting product patterns from leaders

### 5.1 Adopt

1. **One hero number + sparkline per card; one chart per card.** Stripe's
   four-card home and Copilot's single-line dashboard beat Mint's dense grid.
   ([Stripe basics](https://docs.stripe.com/dashboard/basics))
2. **Two-mode reports: "Breakdown" (totals/pie/Sankey) + "Trends" (bars over
   time).** Monarch's split is clean and copyable.
3. **Sankey for cash flow** is the highest-leverage visualization in consumer
   finance. Maps perfectly to "entró → salió" in elementary Spanish.
   ([Monarch announcement](https://www.monarch.com/blog/visualize-your-cash-flow-like-never-before))
   **Decision (2026-05-21): No Sankey adopted for now (rejected for
   the time being).** Cash flow in Batch 7 uses stacked + grouped bars
   instead; Sankey can return when a dedicated cash-flow view earns
   its dep cost.
4. **Stacked bar with dotted-line previous-period overlay** (Copilot Cash
   Flow) — one chart answers "how am I doing vs. last month?"
   ([Copilot help](https://help.copilot.money/en/articles/9682232-cash-flow-tab-overview))
5. **Color semantics:** ingresos green / gastos red / neto in brand teal /
   deudas red / activos blue or brand. Pair with ▲/▼ and explicit number.
6. **Period picker = segmented control:** `Mes · 3M · 6M · Año · Personalizado`. Match Copilot's set. Default to MTD on mobile.
7. **Drill-down is non-negotiable:** every category slice / bar / cell taps
   into a filtered transaction list. Monarch, YNAB, Copilot, Brex all do this.
8. **Empty state as activation surface, not apology.** A wallet-app case
   study saw 30% → 67% activation by replacing an empty dashboard with a
   prompt + CTA. Render charts only at ≥7 transactions or after first parsed
   statement.
   ([JPN Fintech](https://www.jpnfintech.com/how-to-design-better-empty-states-for-fintech-products/))
9. **Mobile-first for daily check-ins, desktop for deep reports.** Monarch
   explicitly web-only for Sankey. IFA's daily score check must fit one
   mobile screen.
10. **Qualitative labels over raw numbers for non-technical users.** Credit
    Karma's "Excellent / Good / Fair" approval odds + Copilot's color-coded
    budget bars. IFA Health Score pairs the number with a Spanish word:
    "Crítico / En riesgo / Estable / Excelente."
11. **Shareable charts with hide-amounts toggle.** Monarch's hide-dollars on
    Sankey is a viral-growth feature; culturally fits Guatemala where users
    may share progress without absolute amounts.

### 5.2 Avoid

- Mint-style dense multi-chart screens (broke trust on off-by-one axis labels).
- > 5–7 metrics on the home screen.
- Stacking sparkline + bar + arrow on a single card (Stripe explicitly picks one visual per card).
- Pie/donut with >6 slices — switch to horizontal bar.
- Generic "net worth" framing for the individual tier (Empower's wealth UX is wrong for IFA's first-time user — keep net worth opt-in).
- Credit-bureau-style factor breakdowns (utilization, credit age) — those don't translate. IFA's Health Score factors come from bank+card data (ingreso estable, gasto bajo control, ahorro consistente, etc.) per the core thesis.

---

## 6. IFA decision rules (concrete, enforceable)

1. **Default chart = horizontal bar, sorted descending.** Deviate only with documented reason.
2. **Time series = vertical bars** (monthly) or **line** (daily, ≥30 points). Never both axes scaled independently.
3. **Cash flow header = waterfall**; sub-cards = sparklines next to KPIs; full cash-flow report = grouped/stacked bars on both desktop and mobile. (Sankey deferred 2026-05-21 — no Sankey adopted for now.)
4. **Health Score = bullet graph**, **not** radial gauge. Show actual value, threshold bands (0-399 / 400-599 / 600-799 / 800-1000), and a "comparación" tick for last month's value.
5. **Y-axis on bars starts at 0.** Line charts may truncate but must label the baseline.
6. **No pie/donut with >5 slices.** Above that, switch to horizontal bar with "Otros" rollup.
7. **No 3D, no drop shadows, no gradients on data marks.** Gridlines: at most 3–5, light gray, behind data.
8. **Color encoding:** green positivo / red negativo — **always paired** with ▲/▼ glyph and the number. Categorical series: ColorBrewer **Set2** or **Tableau 10**; never RdYlGn.
9. **Adjacent regions** (stacked bars, treemap if ever used) get a 1 px white stroke per WCAG SC 1.4.11.
10. **Text alternative on every chart** — `<table>` fallback or `aria-label` summary ("Gastos de mayo: alimentación Q 1,234.50, transporte Q 567.00…").
11. **Touch targets ≥ 44 px** on every interactive chart element. Tap to reveal tooltip; no hover-only states.
12. **At 375 px:** max 6 categories above the fold; legends inline; axis labels rotated only if necessary; font ≥ 11 pt (≥ 13 pt preferred).
13. **All numbers via `Intl.NumberFormat('es-GT')`** — currency `Q 1,234.56` (Q + NBSP + amount), percentages with `,` thousands and `.` decimal. Single source of truth.
14. **Forecasts render as fan charts** with a shaded "rango probable" band and plain-Spanish hover copy. Never a single deterministic line for the future.
15. **Period-over-period comparisons** use side-by-side bars or comet charts. Never overlaid lines on a dual axis.

---

## 7. Implications for the current Phase 6/7 plan

Cross-referencing [docs_operations/\_PHASE_6_7_PLAN.md](./_PHASE_6_7_PLAN.md):

| Batch          | Plan as written                         | Suggested adjustment from this research                                                                                                                                                                                                     |
| -------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B7             | Recharts BarChart + PieChart + table    | Use shadcn/ui charts wrappers on top of Recharts for Tailwind v4 theming. Pie only if ≤5 categories; default to horizontal bar.                                                                                                             |
| B7             | Period picker for last 6 months default | Keep, but offer segmented control with `Mes / 3M / 6M / Año / Personalizado` matching Copilot. Default mobile = `Mes`, desktop = `6M`.                                                                                                      |
| B7             | Monthly Cash Flow report                | Add a **waterfall** view as the hero, with grouped-bars + line-overlay as the secondary. Sankey deferred 2026-05-21 — no Sankey adopted for now (rejected for the time being).                                                              |
| B12            | "Gauge UI component" for Health Score   | **Rename to "Bullet graph UI component"**. Drop the semicircle gauge from the demo kit — it conflicts with Few's published guidance. Implement linear bullet with threshold bands and a previous-period tick.                               |
| All UI batches | _Implicit:_ ad-hoc currency formatting  | Add a `<Money>` primitive built on `Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' })` — single source of truth. Mention it explicitly in B7's acceptance criteria so the negative-amount-parentheses rule is enforceable. |

These are recommendations, not silent changes. The plan stays as written until you approve the deltas explicitly.

---

## 8. Open questions worth user input

1. ~~**Are we OK adding `@nivo/sankey` as a single-component dep for the cash-flow Sankey view, or hold off?**~~
   **Resolved 2026-05-21: No Sankey adopted for now (rejected for the
   time being).** Cash-flow reports in Batch 7 use stacked + grouped
   bars. Sankey can return when a dedicated cash-flow view earns the
   ~50 KB dep cost, or as part of a future ECharts adoption.
2. **Should the Health Score bullet graph fully replace the semicircle gauge in the demo kit?** The demo kit is frozen under `demo/`; updating it requires a separate commit to that snapshot.
3. **Color palette decision:** stick with the IFA brand teal/navy/gold from the design system, or layer ColorBrewer Set2 / Tableau 10 for categorical series? The brand palette is small; categorical needs ≥6 distinguishable hues for top-merchants charts.
4. **Do we want Spanish-localized chart-type names in copy** (e.g., "gráfica de barras" in tooltips) or treat charts as language-neutral?

---

## Sources

### Industry leaders

- Monarch: [blog — Visualize your cash flow](https://www.monarch.com/blog/visualize-your-cash-flow-like-never-before), [help — Using Reports](https://help.monarch.com/hc/en-us/articles/21846787088916-Using-Reports), [features tracking](https://www.monarch.com/features/tracking)
- Copilot Money: [Dashboard overview](https://help.copilot.money/en/articles/6045480-dashboard-tab-overview), [Cash Flow overview](https://help.copilot.money/en/articles/9682232-cash-flow-tab-overview), [Apple Developer feature](https://developer.apple.com/articles/copilot-money/), [9to5Mac review](https://9to5mac.com/2024/10/31/copilot-money-review-ipad-cash-flow-tags/), [SaaSweep review](https://www.saasweep.com/blog/copilot-money-review)
- Rocket Money: [Spending Insights](https://www.rocketmoney.com/feature/spending-insights), [Motley Fool review](https://www.fool.com/money/personal-finance/rocket-money-review/)
- YNAB: [Income v Expense](https://support.ynab.com/en_us/income-v-expense-Byu1BYWRq), [Net Worth report](https://support.ynab.com/en_us/net-worth-BkwQO5WA5), [Reports & Data blog](https://www.ynab.com/blog/ynab-reports-and-data)
- Credit Karma: [Free credit score](https://www.creditkarma.com/free-credit-score), [Approval Odds](https://www.creditkarma.com/credit-cards/i/credit-karma-approval-odds)
- Empower: [Dashboard Overview](https://support-personalwealth.empower.com/hc/en-us/articles/201169740-Dashboard-Overview), [WalletHacks review](https://wallethacks.com/personal-capital-review/)
- Stripe: [Dashboard basics](https://docs.stripe.com/dashboard/basics), [home charts overview](https://support.stripe.com/questions/dashboard-home-charts-overview)
- Mercury: [Insights](https://mercury.com/insights)
- Brex: [Monitor spend](https://www.brex.com/support/monitor--spend), [Reporting](https://www.brex.com/support/brex-reporting)
- Apple: [Wallet HIG](https://developer.apple.com/design/human-interface-guidelines/wallet)
- Empty states case study: [JPN Fintech](https://www.jpnfintech.com/how-to-design-better-empty-states-for-fintech-products/)
- Color psychology: [Billcut — fintech color](https://www.billcut.com/blogs/color-psychology-in-fintech-ui-why-green-dominates/)

### Design principles

- Tufte: [InfoVis-Wiki Data-Ink Ratio](https://infovis-wiki.net/wiki/Data-Ink_Ratio); [EU Data Portal — chart junk](https://data.europa.eu/apps/data-visualisation-guide/chart-junk-and-data-ink-origins)
- NN/g: [Choosing Chart Types](https://www.nngroup.com/articles/choosing-chart-types/), [Dashboards Preattentive](https://www.nngroup.com/articles/dashboards-preattentive/), [Contrast in Charts](https://www.nngroup.com/articles/contrast-charts/), [Complex Application Design](https://www.nngroup.com/articles/complex-application-design/), [Chartjunk video](https://www.nngroup.com/videos/chartjunk/)
- Few: [Bullet Graph Spec](https://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf), [Our Fascination with All Things Circular](http://www.perceptualedge.com/articles/visual_business_intelligence/our_fascination_with_all_things_circular.pdf), [Why Most Dashboards Fail](https://www.perceptualedge.com/articles/misc/WhyMostDashboardsFail.pdf)
- Books: Knaflic, [Storytelling with Data](https://www.wiley.com/en-us/Storytelling+with+Data:+A+Data+Visualization+Guide+for+Business+Professionals-p-9781119002253); Wexler/Shaffer/Cotgreave, [Big Book of Dashboards](https://www.bigbookofdashboards.com/); [Comet chart by Wexler](https://www.datarevelations.com/showing-now-versus-then-consider-a-comet-chart/)
- WCAG: [2.2 spec](https://www.w3.org/TR/WCAG22/), [SC 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html), [G209 Adjoining colors](https://www.w3.org/WAI/WCAG21/Techniques/general/G209)
- Color/culture: [ColorBrewer 2.0](https://colorbrewer2.org/); [Up or Down? How Culture and Color Affect Judgments](https://www.researchgate.net/publication/256252646_Up_or_Down_How_Culture_and_Color_Affect_Judgments); [Experience Reverses the Red Effect among Chinese Stockbrokers](https://pmc.ncbi.nlm.nih.gov/articles/PMC3933460/)
- Dual axes: [Datawrapper](https://www.datawrapper.de/blog/dualaxis)
- Truncated axes: [Correll et al. 2020](https://www.sciencedirect.com/science/article/abs/pii/S2211368120300978), [Tableau Research PDF](https://par.nsf.gov/servlets/purl/10196093), [Wikipedia — Misleading graph](https://en.wikipedia.org/wiki/Misleading_graph)
- Forecast/fan: [BIS — Fan Chart PDF](https://www.bis.org/ifc/events/ifc_8thconf/ifc_8thconf_62pap.pdf), [Wikipedia — Fan chart](<https://en.wikipedia.org/wiki/Fan_chart_(time_series)>)
- Mobile: [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/), [Apple HIG Charts](https://developer.apple.com/design/human-interface-guidelines/charts), [Material Design 3 Data Viz](https://m3.material.io/blog/data-visualization-accessibility)

### Tech stack

- [recharts/recharts](https://github.com/recharts/recharts), [issue #6857 React 19.2 rendering](https://github.com/recharts/recharts/issues/6857), [issue #4590 ResponsiveContainer](https://github.com/recharts/recharts/issues/4590)
- [airbnb/visx issue #1883](https://github.com/airbnb/visx/issues/1883), [discussion #1908](https://github.com/airbnb/visx/discussions/1908)
- [apache/echarts](https://github.com/apache/echarts), [ECharts SSR handbook](https://apache.github.io/echarts-handbook/en/how-to/cross-platform/server/), [5.5 release notes](https://echarts.apache.org/handbook/en/basics/release-note/5-5-0/), [ECharts bundle optimization](https://dev.to/manufac/using-apache-echarts-with-react-and-typescript-optimizing-bundle-size-29l8), [react-echarts-kit](https://dev.to/cimthog/react-echarts-kit-ssr-safe-chart-components-for-react-nextjs-36ed)
- [plouc/nivo issue #2626 RSC](https://github.com/plouc/nivo/issues/2626)
- [Vercel acquires Tremor](https://vercel.com/blog/vercel-acquires-tremor)
- [chartjs/Chart.js Node docs](https://www.chartjs.org/docs/latest/getting-started/using-from-node-js.html), [issue #8831 SSR](https://github.com/chartjs/Chart.js/issues/8831)
- [plotly/plotly.js](https://github.com/plotly/plotly.js)
- [Highcharts shop](https://shop.highcharts.com/), [Highcharts EULA update](https://www.highcharts.com/blog/news/our-new-eula-makes-free-usage-clearer/)
- [observablehq/plot](https://github.com/observablehq/plot)
- [tradingview/lightweight-charts](https://github.com/tradingview/lightweight-charts), [Lightweight Charts product page](https://www.tradingview.com/lightweight-charts/), [community React wrapper](https://github.com/trash-and-fire/lightweight-charts-react-wrapper)
- [LightningChart JS pricing](https://lightningchart.com/js-charts/pricing/)
- [shadcn/ui charts](https://ui.shadcn.com/charts)

### Localization

- [LocalePlanet es-GT](https://www.localeplanet.com/icu/es-GT/index.html); [Banco de Guatemala](https://banguat.gob.gt/); [Billete Conmemorativo Q 1.00](https://banguat.gob.gt/page/billete-conmemorativo-q-100); [ISO 4217:GTQ](https://en.wikipedia.org/wiki/ISO_4217:GTQ); [PTA Spanish Style Guide PDF](https://www.pta.org/docs/default-source/uploadedfiles/downloads/spanishtranslationstyleguide-2017.pdf)

### Honest gaps in this research

- Apple HIG Charts page returned only the title via fetch — citations are to the page URL; granular pt/px specs were not extracted directly.
- No SEC regulation specifically governs y-axis truncation in financial charts; AU Section 550 notes that corporate-report graphs are _not audited_, so the operative authority for IFA's "don't truncate bar y-axes" rule is the peer-reviewed Correll et al. 2020 perception study.
- `bundlephobia.com` / `packagephobia.com` / `npmjs.com` returned 403/429 during the tech-stack research run; bundle sizes above are from the libraries' own docs and third-party comparisons (pkgpulse, dev.to optimization posts), flagged as such inline.
- Several product marketing URLs (e.g., `monarchmoney.com/features`, `rocketmoney.com/features`) returned 404 and were substituted with the canonical help-center / blog / third-party-review sources cited above.
