# ADR 036: Dual ESM+CJS Build, Source-Resolved Dev Loop, External-Consumer Smoke Test

**Date:** 2026-07-10
**Status:** Accepted (bd `jsonschema-form-zcd`)
**Deciders:** Tim Kindberg
**Extends:** ADR 009 (verification-gated loop — the gate stays fast and free)

## Context

The nine maintained workspaces shipped with placeholder build scripts
(`echo 'Build script not yet configured'`) and `package.json` fields pointing
at TypeScript source (`main`/`module`/`types`/`exports` → `./src/index.ts`).
That is fine for in-repo development but means nothing is actually publishable:
an external consumer installing a tarball would get raw `.ts` with no `dist`,
no declarations, and no CJS entry.

We need real artifacts without giving up the two things the project relies on:

1. **A fast, build-free gate** (ADR 009). `npm run gate` (typecheck + lint +
   test) must keep resolving cross-package imports to source, so a change in
   `core` is seen by `react` tests with no build step in between.
2. **Confidence the published thing works.** The workspace symlinks hide a lot
   of packaging bugs (wrong `exports`, missing `dist`, ESM/CJS mismatch, a
   `.d.ts` that doesn't resolve). Those only surface from outside.

## Decision

### 1. Dual ESM + CJS via `tsup`, one shared build tsconfig

Every publishable package builds with the same command:

```
tsup src/index.ts --format esm,cjs --dts --clean --sourcemap --tsconfig ../../tsconfig.tsup.json
```

Output is `dist/index.js` (ESM), `dist/index.cjs` (CJS), and matching
`dist/index.d.ts` / `dist/index.d.cts`. `tsup` (esbuild) is light and produces
both formats plus declarations in one pass. Cross-package deps are externalized
(they are `dependencies`/`peerDependencies`), so a package's `dist` and `.d.ts`
keep the bare `@jsonschema-form/*` specifier and never inline a sibling.

`tsconfig.tsup.json` extends the root config but sets `composite: false`,
`incremental: false`, `declarationMap: false` (the composite project graph
trips `tsup`'s declaration pass with TS6307), and `jsx: "react-jsx"` (inert for
the non-React packages, required for React's `.d.ts`).

Because deps are external and their **types** resolve via the source condition
below, build order does not matter — each package builds independently.

### 2. `package.json` exports: dist for consumers, a `development` condition for us

```jsonc
{
  "type": "module",
  "sideEffects": false,
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "development": "./src/index.ts",
      "import": { "types": "./dist/index.d.ts",  "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  }
}
```

The `development` condition points at source. The root `tsconfig`
(`customConditions: ["development"]`) and Vite/Vitest (which enable
`development` by default) both select it, so **the gate resolves every
`@jsonschema-form/*` import to `src` with no build** — requirement (1) is met
with zero per-package Vitest/alias wiring. A normal consumer never sets
`development`, so `import`/`require` win and they get `dist`.

**`src` is published** (`files: ["dist", "src", …]`, tests excluded via `!`
negation). This is deliberate: the `development` condition references source, so
the source must exist in the tarball for the condition to be honest (publint
enforces this). The upside is real — a Vite consumer in dev transparently steps
into our source with working sourcemaps; their production build still uses
`dist`. The cost is a larger tarball, accepted for the DX and correctness.

### 3. An external-consumer smoke test, in its own CI job

`scripts/smoke-external.mjs` (run by the separate `build-and-smoke` CI job, NOT
the fast `gate`) proves the artifacts are consumable from outside:

- packs every package (`npm pack`);
- runs **publint** (exports/files correctness) and **@arethetypeswrong/cli**
  (types resolve under node10/node16/bundler) on each;
- installs the tarballs into a throwaway consumer with only real peers;
- typechecks a consumer that namespace-imports all nine (dist types must
  resolve; the `development` condition must **not** leak);
- executes the consumer under **both ESM and CJS** (compile + vanilla render +
  AJV validate).

Keeping this out of `gate` preserves the fast free loop; the heavier
build+pack+install signal runs in parallel.

## Consequences

- All nine packages are publishable with correct dual-format entries and
  declarations; `publint` + `attw` are green.
- The dev gate stays build-free and needs no alias/paths wiring — the
  `development` condition does the redirection for both `tsc` and Vitest.
- Publishing source is a conscious trade (bigger tarball, source visible in dev)
  for sourcemap-accurate DX. A future move to a non-leaking custom condition (no
  shipped `src`) is possible but would require per-package Vitest resolution.
- The build config is name-agnostic; the eventual `@jsonschema-form/*` →
  `@schemaform/*` rename only touches the smoke consumer's import strings.
- `build-and-smoke` adds CI minutes (build + tarball install), isolated from the
  fast gate.

## Alternatives considered

- **Clean dist-only exports + `tsconfig` paths + Vitest aliases.** Purest
  published artifact (no `src` shipped, no condition), but reintroduces
  per-package Vitest resolution wiring and the risk of the gate silently needing
  a build. Rejected for churn and fragility versus the `development` condition.
- **Build before the gate.** Simple and standard, but makes the gate no longer
  free/fast — counter to ADR 009.
- **tsc project references for emit.** Already used for typecheck, but emitting
  dual CJS+ESM + declarations is far simpler with `tsup`.
