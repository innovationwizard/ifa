import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/*
 * Tear down the rendered DOM between tests so assertions in later tests
 * never pick up stale nodes from earlier ones.
 */
afterEach(() => {
  cleanup();
});
