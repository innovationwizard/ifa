/*
 * Vitest shim for Next.js's `server-only` module.
 *
 * `server-only` exports nothing; its only purpose is to poison client
 * bundles so the Next compiler rejects server code imported from a
 * client component. Vitest isn't doing that split, so we replace the
 * module with an empty file and move on.
 */
export {};
