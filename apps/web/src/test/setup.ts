// Runs once before every test file (wired up via vite.config.ts's `test.setupFiles`). It adds the
// jest-dom matchers (`toBeInTheDocument`, `toBeDisabled`, etc.) used throughout the test files, and
// resets state between tests so one test's mocks/rendered DOM can never leak into the next one.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
