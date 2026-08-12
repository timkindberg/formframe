import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  plugins: [react() as any],
  test: {
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Recipe tests live next to the copy-paste recipes in examples/ so
    // consumers get coverage with the stack (ADR 024 / #126). Run them here
    // against the existing browser harness rather than a second Vitest setup.
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      '../../examples/basic-react/src/**/*.recipe.test.{ts,tsx}',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-test/**'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
  },
})
