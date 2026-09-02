import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'

const recipeTests = '../../examples/basic-react/src/**/*.recipe.test.{ts,tsx}'
const memoryRecipeTests =
  '../../examples/basic-react/src/**/*.memory.recipe.test.{ts,tsx}'

export default defineConfig({
  plugins: [react() as any],
  test: {
    globals: true,
    // Browser locators vs in-memory createRoot. Render-count stress does not
    // need Chromium — field.root is a function call (ADR 015).
    projects: [
      {
        plugins: [react() as any],
        test: {
          name: 'browser',
          globals: true,
          setupFiles: ['./vitest.setup.ts'],
          include: ['src/**/*.{test,spec}.{ts,tsx}', recipeTests],
          exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/dist-test/**',
            '**/*.memory.test.{ts,tsx}',
            memoryRecipeTests,
          ],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            headless: true,
          },
        },
      },
      {
        plugins: [react() as any],
        test: {
          name: 'memory',
          globals: true,
          environment: 'happy-dom',
          setupFiles: ['./vitest.memory.setup.ts'],
          include: ['src/**/*.memory.test.{ts,tsx}', memoryRecipeTests],
        },
      },
    ],
  },
})
