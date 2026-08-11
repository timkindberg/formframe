/**
 * Interim recipe-parity smoke — SUPERSEDED by #125.
 *
 * The living proof is the Vitest-browser suite:
 *   packages/react/src/parity/recipe-parity.test.tsx
 *
 * Run it via the normal react package test / `npm run gate`. This script remains
 * as a thin pointer for anyone who still has `npm run smoke:recipes` in muscle
 * memory; it exits 0 after printing the new entry point.
 */

console.log(`recipe-parity-smoke: superseded by #125.

Parity proof now lives in Vitest-browser:

  npx vitest packages/react/src/parity/recipe-parity.test.tsx

  — or just \`npm test -w @formframe/renderer-react\` / \`npm run gate\`

Capability matrix: packages/react/src/parity/CAPABILITY_MATRIX.md
`)
process.exit(0)
