import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
