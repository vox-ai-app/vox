import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js', 'packages/*/tests/**/*.test.js'],
    testTimeout: 10_000
  }
})
