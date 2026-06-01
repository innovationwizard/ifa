import 'server-only';
import { extractText } from 'unpdf';

/**
 * Pure server-side PDF → text-rows transformation (Phase L2.2).
 *
 * Thin wrapper around `unpdf.extractText()` that:
 *
 *   1. Times the extraction for trace telemetry.
 *   2. Pins the per-page `string[]` shape (`mergePages` left at its
 *      default `false`) so callers see page boundaries — the AI
 *      prose-mode extractor (L2.3) reasons about statement
 *      structure across pages.
 *   3. Documents the failure modes the L2.6 route layer must catch.
 *
 * **Engine:** `unpdf` (wraps Mozilla PDF.js, serverless-optimized
 * build, MIT, maintained by unjs/Johann Schopplich; latest verified
 * 2026-04-29). Chosen over pdfjs-dist-direct because unpdf
 * eliminates the canvas + worker + FinalizationRegistry configuration
 * steps on Vercel; chosen over pdf-parse because pdf-parse 2.x pulls
 * in `@napi-rs/canvas` (platform-specific native binary requiring
 * `serverExternalPackages`) and pdf-parse 1.x has the documented
 * `ENOENT ./test/data/05-versions-space.pdf` serverless footgun.
 * Text-extraction quality is identical to pdfjs-dist since unpdf
 * wraps it. GT-specific layout quirks (multi-column tables, Spanish
 * diacritics, BAC/Industrial/Banrural variations) are not yet
 * empirically verified — see
 * [\_PDF_LIB_RESEARCH.md](../../../docs_operations/_PDF_LIB_RESEARCH.md)
 * "Open questions" for the full caveat list.
 *
 * **Locked guarantees** (load-bearing — don't silently weaken):
 *
 *   1. Pure transformation. No IO beyond the in-memory unpdf call.
 *      Deterministic for a given input buffer (modulo PDF.js version
 *      drift across releases of unpdf itself).
 *   2. Errors propagate. We do NOT catch + return a `failed` result
 *      here. If unpdf throws (corrupt PDF, encrypted/password-
 *      protected PDF, non-PDF input, etc.), the throw bubbles to
 *      the L2.6 route handler which maps it to a user-facing
 *      error (Spanish copy in the wizard). This is the OPPOSITE
 *      of ai-detect's never-throw contract: PDF parsing failures
 *      are user-action errors ("your file is broken / encrypted"),
 *      and the user needs to know.
 *   3. Per-page output. `pages: string[]` preserves page boundaries.
 *      The AI prose-mode extractor (L2.3) uses these for sample
 *      construction — a typical bank PDF's first page often has
 *      header/account metadata, while page 2+ has transaction
 *      rows; the page boundary signal lets the AI skip the header.
 */

export interface PdfExtractResult {
  /**
   * One entry per page, in document order. Each entry is the text
   * content of that page. Empty strings are legal — they indicate
   * an image-only / scanned page (no text layer) and the L2.6
   * route layer surfaces those as a "couldn't read this PDF"
   * error if `pages.every(p => p.trim() === '')`.
   */
  pages: string[];
  /** Page count reported by the PDF document. Equals `pages.length`. */
  totalPages: number;
  /** Wall-clock extraction duration in milliseconds. Trace-only. */
  durationMs: number;
}

/**
 * Extract text from a PDF buffer. See file-level docblock for the
 * locked guarantees + failure modes.
 *
 * @param buffer — PDF bytes. Accepts `Uint8Array` (universal),
 *   `Buffer` (structurally compatible with `Uint8Array` in Node),
 *   or an `ArrayBuffer` (wrap in `new Uint8Array(ab)` first if
 *   strict-typing complains).
 * @throws when the input is not a valid PDF, is encrypted/
 *   password-protected, or unpdf otherwise rejects it. The L2.6
 *   route catches + maps to user-facing copy.
 */
export async function extractPdfText(buffer: Uint8Array): Promise<PdfExtractResult> {
  const start = Date.now();
  const result = await extractText(buffer);
  return {
    pages: result.text,
    totalPages: result.totalPages,
    durationMs: Date.now() - start,
  };
}
