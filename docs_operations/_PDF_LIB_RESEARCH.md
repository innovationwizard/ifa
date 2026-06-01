# PDF library research for IFA — L2.1

> Produced 2026-06-01 via the `deep-research` workflow (101 agents,
> 18 sources fetched, 25 claims adversarially verified, 20 confirmed
> / 5 killed). Caveats and unknowns called out explicitly per
> `_THE_RULES.MD` rule 1 (don't assume / state uncertainty).

## TL;DR — recommendation

**Use `unpdf`** for both INDIVIDUAL (L2 MVP) and BUSINESS (post-launch)
use cases.

- **Engine equivalence:** unpdf wraps Mozilla's PDF.js — accuracy
  is identical to pdfjs-dist. unpdf adds API ergonomics + a
  serverless-optimized bundle, not extraction algorithms.
- **Vercel friction = zero:** worker inlined, canvas mocked,
  `FinalizationRegistry` polyfilled. No `outputFileTracingExcludes`,
  no `serverExternalPackages`, no native binaries.
- **Maintained:** v1.6.2 on 2026-04-29, MIT, unjs (Johann Schopplich).
- **TypeScript-first:** `extractText(data) → {totalPages, text}`.

## Methodology

- 6 search angles fanned out: primary-sources, serverless-vercel-compat,
  maintenance-security, table-and-encoding-accuracy,
  practitioner-benchmarks, unpdf-deep-dive.
- 18 sources fetched (primary docs, npm registry, GitHub
  advisories, NVD, OpenNext docs, Next.js docs, practitioner
  blogs). 15 URL dupes filtered.
- 82 falsifiable claims extracted → 25 verified (3-vote
  adversarial), 20 confirmed / 5 killed.
- Cross-checked maintenance claims against npm publish dates,
  GitHub release cadence, and open-issue counts directly.
- **What couldn't be verified:** Guatemalan-bank-specific
  extraction quality. Zero sources contained GT bank statements,
  Spanish-diacritic edge cases, or FEL invoice tests. This must
  be resolved empirically against real samples (§6.1 founder
  outreach is the right path).

---

## Per-library: unpdf

**Verdict: PRIMARY RECOMMENDATION.**

### Evidence

- **Serverless-purpose-built.** README (verified):
  - "Works in Node.js, browser and serverless environments."
  - "Ships with a serverless build of Mozilla's PDF.js, optimized
    for edge environments."
  - Technical mechanism documented:
    - Rollup bundling strips browser-specific code from pdfjs-dist
    - Worker code inlined ("serverless runtimes can't load
      separate worker files")
    - `FinalizationRegistry` polyfilled (unavailable in CF Workers)
    - Canvas mocked (text extraction doesn't need rendering)
  - Cloudflare's official R2 tutorial uses unpdf. Multiple
    practitioner reports confirm Vercel deployment works
    (chudi.dev March 2026, dev.to). Vercel-compat is INFERENCE
    from "runs on Lambda-class Node.js runtime" — well-grounded
    but not first-party-documented.
- **Engine = Mozilla PDF.js.** Currently bundles PDF.js v5.6.205.
  `definePDFJSModule()` exposes a hook to swap in the official or
  legacy build. **Whatever extraction quirks PDF.js has, unpdf
  inherits — neither better nor worse on raw accuracy.**
- **Maintained.** npm: latest=1.6.2, published 2026-04-29T07:31:35Z,
  MIT. GitHub: 45 releases, 1.2k stars, 1 open issue, two patch
  releases inside 24h (1.6.1 → 1.6.2 responding to issue #51).
  Single primary maintainer (Schopplich, 226 commits vs. next at 2) — unjs ecosystem mitigates bus-factor risk but the dependency
  posture is still "one human's free time". Acceptable for IFA's
  stage; worth noting in the file header.
- **TypeScript API.** Types ship with the package (no `@types/*`).
  README shows two overloads verbatim:
  ```ts
  extractText(data: DocumentInitParameters['data'] | PDFDocumentProxy,
              options?: {mergePages?: false}):
      Promise<{totalPages: number; text: string[]}>
  // and mergePages:true variant returning text as a single string.
  ```
  Per-page `string[]` is ergonomically ideal for IFA: preserves
  page boundaries the Claude Haiku classifier can reason about.
- **Bundle size.** ~1.6 MB minified (verified by direct tarball
  measurement of `pdfjs-serverless@1.2.3 dist/index.mjs` =
  1,691,863 bytes). Vercel function limit is 50 MB unzipped →
  ~3% of cap. Material but well within budget.
- **Security.** Current bundle is PDF.js v5.6.205 — well above the
  CVE-2024-4367 patched threshold (4.2.67). Safe.

### Vercel-compat notes

- Zero configuration needed. Drop-in.
- No `serverExternalPackages` entry required.
- No `outputFileTracingExcludes` entry required.
- No native binary dependencies.

### GT-specific notes

- **Unknown empirically.** No surveyed source tested Guatemalan
  bank PDFs.
- **Theoretical:** PDF.js handles UTF-16 correctly for embedded
  fonts → Spanish accents in text-based PDFs should work.
- **Theoretical weakness:** PDF.js's standard failure mode is
  multi-column tabular layouts. Bank statements are the canonical
  example. **This is the single biggest unknown for IFA.**

### Citations

- https://github.com/unjs/unpdf
- https://www.npmjs.com/package/unpdf
- https://unjs.io/packages/unpdf/
- https://deepwiki.com/unjs/unpdf
- https://github.com/johannschopplich/pdfjs-serverless
- https://www.npmjs.com/package/pdfjs-serverless
- https://chudi.dev/blog/serverless-pdf-processing-unpdf-vs-pdfparse
- https://www.pkgpulse.com/blog/unpdf-vs-pdf-parse-vs-pdfjs-dist-pdf-parsing-extraction-nodejs-2026

---

## Per-library: pdfjs-dist

**Verdict: VIABLE BUT REDUNDANT (unpdf already wraps it for you).**

### Evidence

- **THE engine.** Mozilla's reference PDF parser. unpdf and
  pdf-parse 2.x both bundle it. Direct dependency is fully
  supported — just requires Vercel-specific configuration that
  unpdf eliminates.
- **Serverless-compat = manual.** Requires `outputFileTracingExcludes`
  to drop the optional `canvas` dependency (Next.js 16 docs confirm
  this is now a stable top-level config option, no longer
  experimental). Without that, the unused canvas binary inflates
  the function bundle. Mechanism corroborated by vercel/next.js#58313,
  OpenNext docs, multiple 2026 third-party guides.
- **CVE-2024-4367 (CVSS 8.8 High, EPSS 98th percentile).**
  - Affects pdfjs-dist ≤ 4.1.392.
  - Patched in 4.2.67 (2024-04-29).
  - Attacker-controlled JS execution via `font_loader.js` on a
    malicious PDF. Default config vulnerable (`isEvalSupported=true`).
  - **For IFA:** server-side text-only extraction (no rendering)
    reduces practical exposure. But pin ≥ 4.2.67 and consider
    `isEvalSupported: false` if going direct.
- **TypeScript.** Types ship with package. API is browser-first;
  Node usage requires the `legacy/build` import path + worker
  disabling. More ergonomic boilerplate than unpdf.

### Vercel-compat notes

- Workable with explicit config:
  ```ts
  // next.config.ts
  experimental: {
    outputFileTracingExcludes: { '*': ['node_modules/canvas'] }
  }
  ```
- Going direct reinvents what unpdf already packages.

### GT-specific notes

- Same as unpdf (same engine).

### Citations

- https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq
- https://security.snyk.io/vuln/SNYK-JS-PDFJSDIST-6810403
- https://nvd.nist.gov/vuln/detail/CVE-2024-4367
- https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- https://opennext.js.org/aws/v2/common_issues/bundle_size
- https://github.com/vercel/next.js/issues/58313

---

## Per-library: pdf-parse

**Verdict: NOT RECOMMENDED for IFA.**

### Evidence

- **History:** v1.1.1 published 2018-10-24. Then zero publishes
  until v2.1.1 on 2025-10-02 — a **7-year hiatus.** v2.4.5
  published 2026-10-20. The 2.x line is a TypeScript rewrite by
  the original author Mehmet Kozan.
- **2.x dependencies (THE problem):** pulls `pdfjs-dist@5.4.296`
  AND `@napi-rs/canvas@0.1.80`. `@napi-rs/canvas` is a
  platform-specific native binary (10 platform-specific
  optionalDependencies — `-darwin-x64`, `-linux-x64-gnu`,
  `-linux-x64-musl`, etc.; Skia native backend). pdf-parse's own
  docs tell Vercel/Next/Lambda users to add `@napi-rs/canvas` to
  `serverExternalPackages`.
- **1.x footgun (the ENOENT bug):** broken `!module.parent` check
  triggers a synchronous filesystem read of
  `./test/data/05-versions-space.pdf` that crashes with `ENOENT`
  in bundled/serverless contexts. Well-documented:
  - GitLab issue #24 (AWS Lambda user)
  - Vercel community Discussion #5278
  - Multiple independent practitioner write-ups
  - Was the original motivation for unpdf's existence
  - Fixed in 2.x but the historical context matters: 1.x has been
    the de-facto "pdf-parse" for 7 years.
- **2.x is new (October 2025).** No deep production track record
  yet. Treat with skepticism — the migration story exists but
  empirical evidence on Vercel-at-scale doesn't.
- **TypeScript.** 2.x is TS-rewritten; types ship. API is
  `pdfParse(buffer) → {text, ...}` — simpler than unpdf if you
  don't care about per-page boundaries, less ergonomic if you do.

### Vercel-compat notes

- 2.x: requires `serverExternalPackages: ['@napi-rs/canvas']` in
  `next.config.ts`. Native binary increases function-bundle size
  per platform.
- 1.x: ENOENT crash — **do not use.**

### Refuted claims (killed during verification)

- "pdf-parse's default extraction concatenates text items with
  spaces, producing jumbled output for multi-column tables." —
  REFUTED 0-3. No primary-source evidence; the pkgpulse blog
  claim was not corroborated by any verifier.
- "pdf-parse fails on Vercel because of Python/node-gyp/C++ build
  requirements." — REFUTED 0-3. The native dep is `@napi-rs/canvas`
  which ships prebuilt platform binaries; no compilation step.

### Citations

- https://www.npmjs.com/package/pdf-parse
- https://registry.npmjs.org/pdf-parse
- https://registry.npmjs.org/@napi-rs/canvas
- https://gitlab.com/autokent/pdf-parse/-/issues/24
- https://github.com/vercel/community/discussions/5278

---

## Comparison matrix

|                              | **unpdf**                         | **pdfjs-dist**                                 | **pdf-parse**                                              |
| ---------------------------- | --------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| **Extraction engine**        | Mozilla PDF.js v5.6.205 (bundled) | Mozilla PDF.js (itself)                        | pdfjs-dist 5.4.296 (2.x)                                   |
| **Accuracy**                 | = PDF.js                          | = PDF.js                                       | = PDF.js (2.x)                                             |
| **Maintained**               | ✓ (v1.6.2 on 2026-04-29)          | ✓ (Mozilla)                                    | ✓ resumed Oct 2025 after 7y gap                            |
| **Maintainer concentration** | Soft risk (1 primary)             | Mozilla org                                    | Solo author resumed                                        |
| **Vercel out-of-the-box**    | ✓ Zero config                     | ⚠ Needs `outputFileTracingExcludes` for canvas | ⚠ 2.x needs `serverExternalPackages` for `@napi-rs/canvas` |
| **Bundle footprint**         | ~1.6 MB minified                  | Similar (without canvas)                       | Similar + native binary                                    |
| **Native binary deps**       | None                              | None (if canvas excluded)                      | `@napi-rs/canvas` platform-specific                        |
| **TypeScript ergonomics**    | First-class, simple API           | First-class, browser-first                     | First-class (2.x rewrite)                                  |
| **Per-page output**          | ✓ `text: string[]`                | ✓ via `getTextContent`                         | ✗ single concat string                                     |
| **Known CVEs**               | None (current bundle clean)       | CVE-2024-4367 ≤4.1.392 → 4.2.67+ safe          | None on current 2.x                                        |
| **GT-specific tested**       | Unknown                           | Unknown                                        | Unknown                                                    |
| **AI-pipeline framing**      | README explicitly mentions        | None                                           | None                                                       |

---

## Recommendation per use case

### INDIVIDUAL MVP (L2 — ship now)

**unpdf.** Choice rationale:

1. Zero Vercel friction — drop-in for the L2.6 server route.
2. Engine equivalence with pdfjs-dist; no accuracy tradeoff.
3. Active maintenance.
4. Per-page `string[]` output preserves statement structure
   for the Claude Haiku classifier.
5. The README explicitly mentions "AI applications that need to
   summarize or analyze PDF documents" — mirrors IFA's pipeline.

### BUSINESS (post-launch, FEL + business bank statements)

**Same: unpdf.** FEL e-invoices are PDFs rendered from XML by SAT
certifiers — text-based, no special engine required. If a FEL
parsing edge case emerges (unlikely — the XML is the canonical
source, the PDF is human-readable rendering), we can either
parse the XML directly (preferred) or extend the unpdf pipeline.

### If/when scanned PDFs become required

Out of scope for L2. When (not if) IFA hits image-based / scanned
statements (older Banrural, customer phone-photos of statements),
the layer that slots in is:

- unpdf has a `renderPageAsImage` path (requires `@napi-rs/canvas`
  in Node). That feeds Tesseract or Claude Vision.
- This exceeds Vercel free-tier 10s limits and is a Railway-tier
  concern per the `project_compute_constraints` memory.
- Not blocking the MVP — document and defer.

---

## Open questions / can't-verify items

1. **GT bank layout fidelity.** How does unpdf (= PDF.js) handle
   multi-column tabular layouts in actual BAC Credomatic / Banco
   Industrial / Banrural / G&T / Promerica / Bantrab statements?
   PDF.js's standard weakness is multi-column tables. **Must
   test against real samples** (§6.1 founder outreach is the
   right path; until samples land, L2.2's pdf-extract is unproven
   on real GT data).
2. **FEL extraction quality.** No source tested SAT-certifier-issued
   FEL PDF layouts. Likely fine because FEL is text-based, but
   empirically unverified. BUSINESS-tier concern; not blocking
   L2 MVP.
3. **Vercel cold-start cost.** Documented bundle size (1.6 MB) is
   verified; actual cold-start impact on Vercel free tier is not.
   Will be empirically observed once L2.6's route is live.
4. **Maintainer concentration risk.** unpdf is functionally
   single-maintainer (Schopplich, 226 commits; next contributor
   at 2). unjs as an org mitigates bus-factor but the posture is
   still "one human's free time." Acceptable for IFA's stage but
   worth re-evaluating when the project crosses 1k+ users.
5. **Vercel-compat first-party docs.** unpdf's README names
   Cloudflare Workers verbatim, not Vercel. The compat claim
   rests on (a) Vercel functions running Lambda-class Node.js
   runtime, (b) multiple practitioner reports of successful
   deploys. Well-grounded but not first-party-documented.
6. **Spanish diacritics edge cases.** No source surveyed tested
   Latin-extended encoding. Theoretical fine (UTF-16 handling
   in PDF.js) but empirically unverified for Spanish-specific
   layouts.

---

## What I'd ship today

```bash
pnpm add unpdf
```

`src/lib/ingestion/pdf-extract.ts` (L2.2) header should reference:

> Engine: unpdf (wraps Mozilla PDF.js, serverless-optimized build,
> MIT, maintained by unjs/Johann Schopplich; latest verified
> 2026-04-29). Chosen over pdfjs-dist-direct because unpdf
> eliminates the canvas + worker + FinalizationRegistry
> configuration steps on Vercel; chosen over pdf-parse because
> pdf-parse 2.x pulls in `@napi-rs/canvas` (platform-specific
> native binary requiring `serverExternalPackages`) and pdf-parse
> 1.x has the documented `ENOENT ./test/data/05-versions-space.pdf`
> serverless footgun. Text-extraction quality is identical to
> pdfjs-dist since unpdf wraps it. GT-specific layout quirks
> (multi-column tables, Spanish diacritics, BAC/Industrial/
> Banrural variations) are not yet empirically verified — see
> `_PDF_LIB_RESEARCH.md` "Open questions."
