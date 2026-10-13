import { defineConfig } from 'vitest/config';

// On windows-latest CI the first test in a file can take ~8s (cold start while files run in
// parallel) even though the rest finish under a second; keep the 5s default elsewhere.
const timeout = process.platform === 'win32' ? 30_000 : 5_000;

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: timeout,
    hookTimeout: timeout,
  },
});
