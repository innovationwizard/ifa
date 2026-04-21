import { defineConfig, devices } from '@playwright/test';

/*
 * Playwright configuration — end-to-end smoke coverage across the three
 * major engines (Chromium, Firefox, WebKit) per scaffolding §15 CI gate.
 *
 * - Traces are collected on retry so failures in CI ship with a reviewable
 *   replay artifact rather than leaving us to guess from logs.
 * - `webServer` boots the Next.js dev server on demand; CI reuses it if
 *   already running (so local `pnpm dev` + `pnpm e2e` still works).
 */

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${String(PORT)}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 2 } : {}),
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `pnpm dev --port ${String(PORT)}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
