import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    // Keep tests serial — each one starts its own mock server and the
    // examples share module state (process.env, singletons).
    fileParallelism: false,
    sequence: { concurrent: false },
  },
})
