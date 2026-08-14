import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'

const pkgRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(pkgRoot, '../..')

export default defineConfig({
  plugins: [react() as any],
  resolve: {
    alias: {
      // Worktree node_modules symlinks to the main checkout; alias workspace
      // packages to THIS worktree's sources so recipe tests exercise the branch.
      '@formframe/renderer-react': path.join(pkgRoot, 'src/index.ts'),
      '@formframe/core': path.join(repoRoot, 'packages/core/src/index.ts'),
      '@formframe/input-jsonschema': path.join(
        repoRoot,
        'packages/input-jsonschema/src/index.ts'
      ),
      '@formframe/input-zod': path.join(
        repoRoot,
        'packages/input-zod/src/index.ts'
      ),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Recipe tests live next to the copy-paste recipes in examples/ so
    // consumers get coverage with the stack (ADR 024). Run them here against
    // the existing browser harness rather than a second Vitest setup.
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
