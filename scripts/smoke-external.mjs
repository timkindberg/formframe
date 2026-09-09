// External-consumer smoke test (bd zcd).
//
// Proves the built packages are actually consumable from *outside* the
// workspace — not just via the workspace symlinks + `development` export
// condition the dev loop uses. It:
//   1. packs every publishable package into a tarball (`npm pack`),
//   2. runs `publint` (exports/files sanity) and `@arethetypeswrong/cli`
//      (are-the-types-wrong: resolves under node10/node16/bundler) on each,
//   3. installs the tarballs into a throwaway consumer with only real peers,
//   4. typechecks a consumer importing all six (dist types must resolve, and
//      the `development` condition must NOT leak — no `src` is shipped),
//   5. runs the consumer under both ESM and CJS (compile + vanilla render) to
//      prove the dual-format runtime works.
//
// Validation is recipe-owned (#126), not a published package — so this smoke
// does not cover AJV/Zod validators.
//
// Assumes `npm run build` has already produced dist/ for every package.

import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SCOPE = '@formframe'

// Publishable packages, in dependency order (order is cosmetic here).
const PACKAGES = [
  { name: 'core', directory: 'core' },
  { name: 'input-jsonschema', directory: 'input-jsonschema' },
  { name: 'input-zod', directory: 'input-zod' },
  { name: 'input-conformance', directory: 'input-conformance' },
  { name: 'renderer-vanilla', directory: 'vanilla' },
  { name: 'renderer-react', directory: 'react' },
]

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    cwd: ROOT,
    ...opts,
  })
}

function step(msg) {
  console.log(`\n▶ ${msg}`)
}

const tmp = mkdtempSync(join(tmpdir(), 'jsf-smoke-'))
const tarballsDir = join(tmp, 'tarballs')
const consumerDir = join(tmp, 'consumer')
mkdirSync(tarballsDir)
mkdirSync(consumerDir)

let failed = false
const fail = (label, err) => {
  failed = true
  console.error(
    `\n✗ ${label}\n${err.stdout || ''}${err.stderr || err.message || err}`
  )
}

// 1 + 2: pack + publint + attw for every package.
const tarballs = {}
for (const { name, directory } of PACKAGES) {
  const dir = join('packages', directory)
  step(`pack + publint + attw: ${SCOPE}/${name}`)
  try {
    const out = sh(
      'npm',
      ['pack', '--json', '--pack-destination', tarballsDir],
      {
        cwd: join(ROOT, dir),
      }
    )
    const filename = JSON.parse(out)[0].filename
    tarballs[name] = join(tarballsDir, filename)
  } catch (err) {
    fail(`npm pack ${name}`, err)
    continue
  }
  try {
    sh('npx', ['publint', '--strict', dir])
  } catch (err) {
    fail(`publint ${name}`, err)
  }
  try {
    sh('npx', [
      '@arethetypeswrong/cli',
      '--pack',
      dir,
      '--ignore-rules',
      'cjs-resolves-to-esm',
    ])
  } catch (err) {
    fail(`attw ${name}`, err)
  }
}

if (failed) {
  console.error('\n✗ pack/publint/attw stage failed — see above')
  process.exit(1)
}

// 3: build the throwaway consumer that installs the tarballs + real peers.
step('install tarballs into a throwaway external consumer')
const consumerPkg = {
  name: 'jsf-external-consumer',
  version: '0.0.0',
  private: true,
  type: 'module',
  dependencies: {
    ...Object.fromEntries(
      PACKAGES.map(({ name }) => [`${SCOPE}/${name}`, `file:${tarballs[name]}`])
    ),
    react: '^18.2.0',
    'react-dom': '^18.2.0',
    zod: '^4.0.0',
  },
  devDependencies: {
    '@types/react': '^18.2.0',
    typescript: '^5.3.3',
    vitest: '^4.0.9',
  },
}
writeFileSync(
  join(consumerDir, 'package.json'),
  JSON.stringify(consumerPkg, null, 2)
)

// Consumer typecheck: namespace-import all six so their dist types must
// resolve for an outsider (bundler resolution, no `development` condition).
writeFileSync(
  join(consumerDir, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        module: 'esnext',
        moduleResolution: 'bundler',
        target: 'es2020',
        lib: ['es2020', 'dom'],
        jsx: 'react-jsx',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ['consumer.ts'],
    },
    null,
    2
  )
)
writeFileSync(
  join(consumerDir, 'consumer.ts'),
  `import * as core from '${SCOPE}/core'
import * as ijs from '${SCOPE}/input-jsonschema'
import * as izod from '${SCOPE}/input-zod'
import * as iconf from '${SCOPE}/input-conformance'
import * as vanilla from '${SCOPE}/renderer-vanilla'
import * as react from '${SCOPE}/renderer-react'
export const surfaces = [core, ijs, izod, iconf, vanilla, react].length
`
)

// ESM runtime: compile (JSON Schema + Zod) + vanilla render.
writeFileSync(
  join(consumerDir, 'run.mjs'),
  `import assert from 'node:assert/strict'
import { jsonSchemaToTree } from '${SCOPE}/input-jsonschema'
import { zodToTree } from '${SCOPE}/input-zod'
import { renderToString } from '${SCOPE}/renderer-vanilla'
import { z } from 'zod'

const schema = { type: 'object', properties: { name: { type: 'string', title: 'Name' } }, required: ['name'] }
const tree = jsonSchemaToTree(schema)
const html = renderToString(tree)
assert.ok(html.includes('name'), 'rendered HTML should reference the "name" field')

const ztree = zodToTree(z.object({ name: z.string() }))
assert.equal(ztree.children.length, 1, 'zod tree should have one child')

console.log('ESM runtime OK')
`
)

// CJS runtime: no zod (v4 ESM-first), just prove require() works end to end.
writeFileSync(
  join(consumerDir, 'run.cjs'),
  `const assert = require('node:assert/strict')
const { jsonSchemaToTree } = require('${SCOPE}/input-jsonschema')
const { renderToString } = require('${SCOPE}/renderer-vanilla')

const schema = { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }
const tree = jsonSchemaToTree(schema)
assert.ok(renderToString(tree).includes('name'), 'CJS render should reference "name"')

console.log('CJS runtime OK')
`
)

try {
  sh('npm', ['install', '--no-audit', '--no-fund'], { cwd: consumerDir })
} catch (err) {
  fail('consumer npm install', err)
  // npm prints a path to its debug log, which is useless on a CI runner that
  // evaporates when the job ends — and an arborist crash says nothing without
  // it. Tail it here.
  try {
    const logDir = join(homedir(), '.npm', '_logs')
    const latest = readdirSync(logDir).sort().at(-1)
    if (latest) {
      console.error(`\n--- npm debug log ${latest} (tail)`)
      console.error(readFileSync(join(logDir, latest), 'utf8').slice(-6000))
    }
  } catch {
    // no debug log to show — the error above is all there is
  }
  process.exit(1)
}

// 4: consumer typecheck.
step(
  'consumer typecheck (dist types resolve; development condition must not leak)'
)
try {
  sh('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], { cwd: consumerDir })
  console.log('consumer typecheck OK')
} catch (err) {
  fail('consumer typecheck', err)
}

// 5: dual runtime.
step('consumer runtime (ESM + CJS)')
try {
  console.log(sh('node', ['run.mjs'], { cwd: consumerDir }).trim())
} catch (err) {
  fail('ESM runtime', err)
}
try {
  console.log(sh('node', ['run.cjs'], { cwd: consumerDir }).trim())
} catch (err) {
  fail('CJS runtime', err)
}

if (failed) {
  console.error('\n✗ external-consumer smoke test FAILED')
  process.exit(1)
}

// Clean up only on success, so a failure leaves the consumer for inspection.
rmSync(tmp, { recursive: true, force: true })
console.log('\n✓ external-consumer smoke test passed')
