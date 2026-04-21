import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/*
 * Vitest + React Testing Library configuration.
 * - jsdom environment for DOM APIs (jest-dom has better compatibility with jsdom
 *   and our tests may touch CSS-var bearing nodes).
 * - resolve.tsconfigPaths honors the `@/*` alias natively (Vite ≥ 6).
 * - coverage via v8 provider (native, faster than c8 wrapper).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/**/*.d.ts',
        'src/app/design-system/**',
        'src/components/ui/**',
        'src/app/icon.tsx',
        'src/app/apple-icon.tsx',
        'src/app/opengraph-image.tsx',
        'src/messages/**',
      ],
    },
  },
});
