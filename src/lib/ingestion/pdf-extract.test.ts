/**
 * @vitest-environment node
 */
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Mock unpdf's `extractText` so we exercise pdf-extract.ts's
 * pure-transformation behavior in isolation. Real-fixture coverage
 * against actual GT bank PDFs lands in L2.8.5 once §6.1 founder
 * outreach lands the sample files.
 */
vi.mock('unpdf', () => ({
  extractText: vi.fn(),
}));

import { extractText } from 'unpdf';
import { extractPdfText } from './pdf-extract';

const extractTextMock = extractText as unknown as Mock;

beforeEach(() => {
  extractTextMock.mockReset();
});

describe('extractPdfText — happy path', () => {
  it('returns {pages, totalPages, durationMs} for a multi-page PDF', async () => {
    extractTextMock.mockResolvedValue({
      totalPages: 3,
      text: ['page one', 'page two', 'page three'],
    });

    const result = await extractPdfText(new Uint8Array([0x25, 0x50, 0x44, 0x46]));

    expect(result.pages).toEqual(['page one', 'page two', 'page three']);
    expect(result.totalPages).toBe(3);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.durationMs)).toBe(true);
  });

  it('forwards the buffer to unpdf unchanged', async () => {
    extractTextMock.mockResolvedValue({ totalPages: 1, text: ['x'] });
    const buffer = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

    await extractPdfText(buffer);

    expect(extractTextMock).toHaveBeenCalledTimes(1);
    expect(extractTextMock).toHaveBeenCalledWith(buffer);
  });
});

describe('extractPdfText — empty input handling', () => {
  it('preserves empty-page arrays from unpdf without coercion', async () => {
    /*
     * unpdf may return a zero-page document for "valid PDF with no
     * content" cases. extractPdfText must NOT silently convert this
     * to an error — that decision lives in the L2.6 route layer
     * (where the wizard sees `result.sample.length === 0` and shows
     * "we couldn't read this PDF"). Per the file-level docblock §3:
     * "pages with empty `text` are legal (image-only/scanned pages)".
     */
    extractTextMock.mockResolvedValue({ totalPages: 0, text: [] });

    const result = await extractPdfText(new Uint8Array([0x25, 0x50, 0x44, 0x46]));

    expect(result.pages).toEqual([]);
    expect(result.totalPages).toBe(0);
  });

  it('preserves per-page empty strings (image-only / scanned pages)', async () => {
    extractTextMock.mockResolvedValue({ totalPages: 3, text: ['', 'real text', ''] });

    const result = await extractPdfText(new Uint8Array([0x25, 0x50, 0x44, 0x46]));

    expect(result.pages).toEqual(['', 'real text', '']);
    expect(result.totalPages).toBe(3);
  });
});

describe('extractPdfText — locked contract: errors propagate (opposite of ai-detect)', () => {
  /*
   * pdf-extract.ts's locked guarantee §2: "Errors propagate. We do
   * NOT catch + return a `failed` result here. If unpdf throws
   * (corrupt PDF, encrypted/password-protected PDF, non-PDF
   * input, etc.), the throw bubbles to the L2.6 route handler
   * which maps it to a user-facing error." This is the OPPOSITE
   * of ai-detect's never-throw contract — pin it explicitly so a
   * future refactor that adds a try/catch wrapper here gets
   * caught by this suite.
   */
  it('throws when unpdf throws (corrupt / encrypted / non-PDF)', async () => {
    extractTextMock.mockRejectedValue(new Error('Invalid PDF structure'));

    await expect(extractPdfText(new Uint8Array([0xff]))).rejects.toThrow('Invalid PDF structure');
  });

  it('preserves the original Error instance (not wrapped or remapped)', async () => {
    const original = new TypeError('Password-protected PDF');
    extractTextMock.mockRejectedValue(original);

    /*
     * Verify the EXACT instance reaches the caller. If a future
     * "helpful" wrapper rewraps the error, this test catches it.
     */
    await expect(extractPdfText(new Uint8Array([0xff]))).rejects.toBe(original);
  });
});
