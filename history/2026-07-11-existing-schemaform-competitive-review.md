# Competitive review: published `@schemaform/*` vs local `@jsonschema-form/*`

**Date:** 2026-07-11 (revised after lead review)  
**Scope:** `@schemaform/core@0.1.8`, `@schemaform/vue@0.1.23`, `@schemaform/wc@0.1.8` on npm, compared to local `@jsonschema-form/*`.

**Local baseline:** Product/architecture claims use **`origin/main` as of 2026-07-11**, including merged [PR #54](https://github.com/timkindberg/jsonschema-form/pull/54) (dual ESM/CJS builds, declarations, external-consumer smoke test). An earlier draft incorrectly described local packaging from the stale `feat/input-zod` branch manifests; that is corrected below.

**Evidence legend:** **Verified** = primary artifact inspected directly (npm tarball, registry JSON, `origin/main` file, CI config). **Inferred** = conclusion from minified bundles or circumstantial correlation, explicitly labeled.

---

## Executive summary

The npm scope `@schemaform` (branded **Formify** in package descriptions) is a **very new, dist-only, Vue-first form-builder stack** published July 7–9, 2026 by maintainer `chenguanqi`. It couples a simplified JSON-Schema-like **data schema** with a separate **view schema**, ships built-in validation and a rule engine in core, and targets **visual form design + Element Plus rendering** in Vue.

The local project (`@jsonschema-form/*`, **still unpublished** on npm at `0.0.0`) is architecturally different: a **source-agnostic form-tree IR** with JSON Schema and Zod front-ends, **side-loaded validation**, **React continuation/JSX customization**, and **no maintained visual designer**. On **`origin/main`**, all nine maintained packages are **publish-ready artifacts** (dual ESM/CJS, declarations, publint/attw, external tarball smoke test)—but **no version has been released to the registry yet**.

They overlap at the marketing layer (“schema-driven forms”) but not at product shape, framework, or extension model.

**Authoritative GitHub/source repository for `@schemaform/*`: not found** (see §1).

---

## 1. Authoritative source repository

### Verdict

**No authoritative GitHub (or other VCS) URL ties to the `@schemaform/*` npm packages.** Do not treat any GitHub profile or repo as the Formify source unless future npm metadata or an official publisher link appears.

The npm maintainer username `chenguanqi` matches a GitHub account at [https://github.com/chenguanqi](https://github.com/chenguanqi) (“Guanqi Chen”). That profile is **only a plausible identity correlation** with the npm publisher—not a package source link. That account’s public repos contain an academic personal site only; **no Formify/schemaform source code**.

### What was checked (verified)

| Method | Result |
|--------|--------|
| npm `repository` / `homepage` / `bugs` on `@schemaform/core`, `@schemaform/vue`, `@schemaform/wc` | **Absent** on all inspected versions |
| npm `readme` field | **Empty** for `@schemaform/core` and `@schemaform/vue` |
| npm `gitHead` → GitHub commit search (`c7b6662144a0733251fda64479a09c0130b84ea8`, `d325674929fba42a4cf796aeb7951f6b2b5cdf69`) | **No public matches** |
| GitHub code search for unique symbols (`inferViewSchemaFromDataSchema`, `SchemaDesigner Formify`, etc.) | **No public matches** |
| Tarball `package.json` / dist bundles | **No `repository` field**; no `sourceMappingURL`; no GitHub URLs in `@schemaform/core` dist |

### npm publisher correlation (verified registry + inferred identity)

- **Verified:** npm `_npmUser` / `maintainers` = `chenguanqi <1065426768@qq.com>` for `@schemaform/core@0.1.8` and `@schemaform/vue@0.1.23`.
- **Verified:** Same maintainer published predecessor packages `@chenguanqi/schemaform-core@0.1.0`, `@chenguanqi/schemaform-vue@0.1.0`, `@chenguanqi/schemaform-wc@0.1.0` (same descriptions), then the `@schemaform` scope—suggesting **rename/re-scope**, not a different product.
- **Verified:** [@schemaform/wc@0.1.8](https://www.npmjs.com/package/@schemaform/wc) — “Web Component wrappers for Formify”; depends on `@schemaform/core` + `@schemaform/vue` + Vue + Element Plus; **same `gitHead` as core**; still **no repository metadata**.
- **Inferred:** GitHub user [chenguanqi](https://github.com/chenguanqi) is the same person as the npm maintainer (username match only; not cryptographically proven).

### Conclusion

All architectural claims for `@schemaform/*` below come from **verified published tarballs and npm metadata only**—not from readable source, issues, CI, or commit history.

---

## 2. Verified facts about `@schemaform/*`

### Package inventory (npm)

| Package | npm | Latest (checked) | Description |
|---------|-----|------------------|-------------|
| `@schemaform/core` | [npmjs.com/package/@schemaform/core](https://www.npmjs.com/package/@schemaform/core) | 0.1.8 | Framework-agnostic JSON Schema form engine — validate, infer, normalize, rule engine |
| `@schemaform/vue` | [npmjs.com/package/@schemaform/vue](https://www.npmjs.com/package/@schemaform/vue) | 0.1.23 | Vue 3 integration for Formify — SchemaRenderer, SchemaDesigner, built-in widgets |
| `@schemaform/wc` | [npmjs.com/package/@schemaform/wc](https://www.npmjs.com/package/@schemaform/wc) | 0.1.8 | Web Component wrappers for Formify |

**Verified — download velocity** (npm downloads API, last month ending 2026-07-10): core ≈861, vue ≈3,861 — non-trivial but tiny vs established form libraries.

**Verified — release activity:** All versions timestamped **2026-07-07 through 2026-07-09**; `@schemaform/vue` had **24 patch releases in ~2 days** — indicative of early churn, not long-term stability.

**Verified — publish shape:** Tarballs ship **`dist/` only** (no `src/`, no tests, no README in registry). `@schemaform/vue@0.1.23` tarball contains **no `index.d.ts`** despite `"types": "./dist/index.d.ts"` in `package.json` — a **publish defect** for TypeScript consumers.

**Verified — naming vs exports:** Description mentions `SchemaRenderer` / `SchemaDesigner`; runtime exports use **`FormRenderer`** and **`FormDesigner`** (from `dist/index.js` export list).

### `@schemaform/core@0.1.8 — published API (verified: `dist/index.d.ts`)

Dual-schema model:

- **`DataSchema`** — custom subset of JSON Schema: object root with `properties`, per-property `type` (`string|number|integer|boolean|array|object`), `enum`, length/range/pattern constraints, nested object/array `items`. Not full draft-07 (no `$ref`, `allOf`, etc. in types).
- **`ViewSchema`** — UI layout: `layout`, `labelPosition`, `elements[]` of `ControlElement | ContainerElement | TabPaneElement`.
- **`ControlElement`** — `{ widget, scope, label?, hidden?, props?, rules? }` where `scope` is a JSON-Pointer-like path (e.g. `#/properties/foo`).
- **`SchemaDefinition`** — `{ version?, dataSchema, viewSchema }` plus optional `defaults`.
- **`normalizeDefinition`** — fills missing layers via **`detectSchemaLevel`** (`EMPTY|DEFAULTS|DATA|FULL`) and inference between defaults ↔ dataSchema ↔ viewSchema.
- **`WidgetRegistry`** — register widgets with `acceptsTypes`, optional `acceptsEnum`; `inferWidget(prop)`.
- **`validateProperties(values, dataSchema, viewSchema?, messages?)`** — **built-in**, synchronous validator (required, enum, string length/pattern, number min/max); view-level `props.required` also consulted.
- **Rule engine** — `Rule` with effects `SHOW|HIDE|ENABLE|DISABLE|SET_VALUE|CLEAR_VALUE|SET_OPTIONS|SET_REQUIRED|SET_PROPS`; composable `Condition` (`and|or|not`, comparisons on `scope`); `applyRuleEffects`, `isElementVisible`, `isElementEnabled`.

Runtime bundle ≈565 lines / ~19KB ESM (minified single file) + typings — small, monolithic.

**Inferred (dist-only, cannot confirm intent without source):** `getRuleTargetScope` in published `index.js` returns `""` for all rules; cross-field effects that need an explicit target scope may be incomplete.

### `@schemaform/vue@0.1.23 — published surface (verified + inferred)

**Verified — peers:** `vue ^3.4`, `element-plus ^2.9`, `@element-plus/icons-vue ^2.3` — **Element Plus is mandatory**, not optional.

**Verified — dependencies:** `@schemaform/core`, CodeMirror 6 + JSON lang, SortableJS.

**Verified — exports (selected):** `FormRenderer`, `FormDesigner`, `SchemaFormVuePlugin`, `createSchemaFormVue`, `useSchemaForm`, `registerWidget` / `registerBuiltinWidgets`, `FieldFormDialog`, layout/i18n helpers (`en`, `zhCN`, `zhTW`), designer import/export helpers (`buildDefinitionFromItems`, `definitionToItems`, `useHistory`).

**Inferred — architecture from minified bundle:** heavy `modelValue` usage (Vue v-model), references to `formValues`, `normalizeDefinition`, `validateProperties`; **no `aria-` or `role=` strings** in `@schemaform/vue` dist grep (weak negative signal on a11y). Unpacked vue package ~284KB — mostly UI/designer.

---

## 3. Local `@jsonschema-form/*` (verified from `origin/main`)

| Aspect | Local project (`origin/main`, post–PR #54) |
|--------|---------------------------------------------|
| **npm** | **Not published** — `npm view @jsonschema-form/core` returns **404** (verified 2026-07-11); scope `@jsonschema-form/*`, version `0.0.0` |
| **Build / packaging** | **Implemented:** all 9 maintained packages build via **tsup** → dual **ESM** (`dist/index.js`) + **CJS** (`dist/index.cjs`) + **declarations** (`.d.ts` / `.d.cts`), sourcemaps; dual `import`/`require` exports map; `development` condition → `src` for in-repo gate (ADR 036) |
| **Publish verification** | **`scripts/smoke-external.mjs`:** `npm pack` all 9 → **publint** + **@arethetypeswrong/cli** per tarball → install in throwaway consumer → typecheck + **dual ESM/CJS runtime** (JSON Schema + Zod compile, vanilla render, AJV validate) |
| **CI** | **`build-and-smoke`** job in `.github/workflows/ci.yml` (separate from fast `gate`) |
| **Core** | Stateless form-tree IR (`FieldNode`, `GroupNode`, `ArrayNode`); **zero runtime dependencies**; imports nothing |
| **Front-ends** | `@jsonschema-form/input-jsonschema` (draft-07 via `json-schema-typed`), `@jsonschema-form/input-zod` (Zod v4) |
| **Framework** | React adapter (`useFormTree`, `SchemaFields`, continuation renderer); vanilla DOM/string renderer |
| **Validation** | Side-loaded adapters (`validation-ajv`, `validation-zod`); Core exposes `Validator` contract + Standard Schema interop |
| **Customization** | **JSX continuation** (`renderNode`, `<Default of={node} />`, part overrides)—code-first, not serialized view schema |
| **Designer** | **None** in maintained packages; DB-driven serialization explicitly deferred to user adapters (ADR 007) |
| **Form state** | Default: native `<form>` + FormData (uncontrolled); RHF/TanStack optional later |
| **Conditionals** | JSON Schema `if/then/else` **ignored** today (documented in support catalog); no built-in rule engine like Formify |
| **Tests** | Gate suite: typecheck + lint + test across workspaces (verified green on branch history; ~356 test cases counted on pre-merge branch) |
| **Docs** | `ARCHITECTURE.md`, 30+ ADRs (including **ADR 036** packaging), JSON Schema support catalog with evidence tests |

**Correction note:** Prior draft text saying local `"build": "echo 'Build script not yet configured'"` or that packaging was unimplemented reflected **stale `feat/input-zod` manifests**. That was superseded on **`origin/main`** by PR #54 (merged 2026-07-11).

---

## 4. Comparison by dimension

### Intended user / use cases

| | `@schemaform/*` (Formify) | `@jsonschema-form/*` |
|--|---------------------------|----------------------|
| **Primary user** | Vue 3 teams wanting **drag-and-drop form builder + renderer** with Element Plus | React teams wanting **schema-generated forms with JSX escape hatches**, closer to “RJSF but customizable in code” |
| **Sweet spot** | Admin builders, internal tools, JSON-driven forms edited in a UI | App forms where developers own layout and override in JSX |
| **Anti-goals** | Not evidenced as headless-only or framework-neutral in practice (Vue + EP required) | Explicit non-goal: hand-authoring entire forms; no first-party designer |

### Schema / input model / source-agnostic?

| | `@schemaform/*` | `@jsonschema-form/*` |
|--|-----------------|----------------------|
| **Model** | **Dual schema:** `dataSchema` + `viewSchema` (+ optional `defaults`); normalization/inference between layers | **Single compile pipeline:** schema → **form tree IR**; presentation is a separate fold (`present`) |
| **JSON Schema** | Custom **`DataSchema` subset** embedded in core types—not a general JSON Schema compiler | Dedicated front-end; draft-07 catalog with honest supported/ignored/rejected matrix |
| **Other sources** | No Zod/TypeScript front-end on npm | **Zod v4 front-end** shipped; Core stays schema-agnostic (ADR 033) |
| **“Framework-agnostic core”** | Marketing true for *Vue-less logic* (validate/infer/rules), but types and inference are **JSON-schema-shaped** and view schema is **Formify-specific** | Core is **genuinely source-agnostic** IR; JSON Schema is one adapter |

### Core / IR architecture / state ownership

| | `@schemaform/*` | `@jsonschema-form/*` |
|--|-----------------|----------------------|
| **IR** | Serializable **`SchemaDefinition`** (data + view + defaults), not a navigable node tree with walk/query | **`GroupNode` / `FieldNode` / `ArrayNode`** tree with `walk`, `getField`, `getAllFields` |
| **State** | Vue layer owns reactive `formValues` / v-model (**inferred** from vue bundle) | Core **stateless**; form-state is explicit adapter slot (default FormData) |
| **Validation in core** | **Yes** — `validateProperties` built in | **No** — validation is pluggable adapter |
| **Rules** | **First-class rule engine** in core | **No equivalent**; conditionals mostly unimplemented at schema level |

### Rendering / framework support

| | `@schemaform/*` | `@jsonschema-form/*` |
|--|-----------------|----------------------|
| **Shipped UI** | Vue 3 + Element Plus widgets, visual designer, CodeMirror JSON editor, SortableJS DnD | React default templates + vanilla reference; UI kits are **copy-paste recipes** (ADR 024) |
| **Other frameworks** | `@schemaform/wc` wraps Vue designer/renderer (still pulls Vue + EP) | No Vue/Angular package; continuation model is React-centric today |
| **Web components** | `@schemaform/wc` | Not shipped |

### Customization model

| | `@schemaform/*` | `@jsonschema-form/*` |
|--|-----------------|----------------------|
| **Primary** | Edit **`viewSchema`** (widget, scope, props, rules); widget registry; visual designer | **JSX** at any node/part via continuation primitives |
| **Registry** | `WidgetRegistry` + Vue `registerWidget` / builtin sync | Widget assignment via `present()` resolver layers; no serialized control list |
| **Designer** | **`FormDesigner`** is a headline feature | Deferred / non-goal for core product |

### Validation semantics

| | `@schemaform/*` | `@jsonschema-form/*` |
|--|-----------------|----------------------|
| **Engine** | Custom synchronous checks in core | AJV / Zod via adapters |
| **Coverage** | Small fixed set (required, enum, string/number bounds, pattern with safety guard) | JSON Schema coverage follows AJV + catalog; Zod via Standard Schema |
| **Messages** | Injectable `ValidationMessages` templates | Adapter-defined |
| **View interaction** | Validates using dataSchema; can respect view `props.required` | Compiler does not validate; front-end documents what compiles vs what validates separately |

### Dynamic rules / conditional behavior

| | `@schemaform/*` | `@jsonschema-form/*` |
|--|-----------------|----------------------|
| **Mechanism** | Per-control **`rules[]`** with SHOW/HIDE/ENABLE/DISABLE/SET_VALUE/… | JSON Schema conditionals **not implemented**; live behavior needs reactive form-state (planned slot) |
| **Maturity** | API surface exists; **`getRuleTargetScope` stub** (**inferred** from dist) raises quality questions | Honest gap documented with beads |

### Form state / submission

| | `@schemaform/*` | `@jsonschema-form/*` |
|--|-----------------|----------------------|
| **Default** | Vue reactive model (v-model-oriented) (**inferred**) | Native FormData, submit-time |
| **Evidence** | `FormData` referenced once in vue bundle (**verified** grep); designer/export JSON flows | `groupNode.submitUtils`, FormData-first ADR 011 |

### Accessibility / UI assumptions

| | `@schemaform/*` | `@jsonschema-form/*` |
|--|-----------------|----------------------|
| **UI kit** | **Element Plus** — inherits EP a11y behavior/limitations | Minimal default HTML templates; consumer owns a11y polish |
| **Evidence in bundle** | No explicit `aria-` / `role` strings in vue dist (**verified** grep) | React tests in browser mode; no dedicated a11y suite cited |

### Package / build quality / maturity

| | `@schemaform/*` | `@jsonschema-form/*` |
|--|-----------------|----------------------|
| **License** | MIT | MIT |
| **Published on npm** | **Yes** (July 2026) | **No** (404 on registry; publish-ready artifacts on `origin/main`) |
| **Age** | ~Days old at time of review | Active monorepo; pre-release versioning |
| **Source availability** | **Dist-only** on npm | Full source + ADRs in GitHub repo |
| **Types** | Core typings OK; **vue package missing `.d.ts` in tarball** (**verified** pack) | Dual `.d.ts`/`.d.cts`; **attw** + consumer typecheck in smoke (**verified** PR #54) |
| **Tests** | `vitest run` in core `package.json` scripts but **tests not published**; no public CI | Gate + external-consumer smoke; tests not shipped in tarballs (by design until publish) |
| **README** | **None on npm** | Extensive README/ARCHITECTURE (repo; not yet on npm) |
| **Build** | tsup (core), vite (vue) — **verified** tarball scripts | tsup dual ESM/CJS + dts for all 9 packages — **verified** `origin/main` manifests + ADR 036 |
| **Pack lint** | Not evidenced on npm | **publint** + **attw** per tarball in smoke — **verified** |

---

## 5. Feature overlap and differentiation

### Overlap

- Schema-driven generation of form fields from declarative definitions.
- JSON Schema–ish typing for strings, numbers, booleans, enums, arrays, nested objects (at varying fidelity).
- Widget/type inference from schema shape.
- Dynamic forms as a problem domain.

### `@schemaform/*` has; local lacks (today)

- Visual **form designer** (`FormDesigner`) with DnD, history, import/export JSON.
- **Dual-schema** persistence (data + view) suited to DB-stored form definitions.
- **Built-in rule engine** for show/hide/enable/disable/value/options mutations.
- **Vue 3 + Element Plus** integration out of the box.
- **Web component** packaging path (`@schemaform/wc`).
- **Defaults ↔ schema ↔ view** normalization ladder (`SCHEMA_LEVEL`).
- **Live on npm** with installable tarballs (however rough).

### Local has; `@schemaform/*` lacks (evidence)

- **Zod** (and pluggable) front-end compiling to shared IR.
- **React continuation / JSX** customization model.
- **Side-loaded validation** (AJV, Zod) with Standard Schema interop.
- **Array node** as first-class tree node with dedicated parts.
- **Honest JSON Schema support catalog** and `$ref` inlining in front-end.
- **Stateless core boundary** enforced by ADRs and zero dependencies.
- **Vanilla** renderer; no mandatory UI framework in core/reference stack.
- **Publish hygiene pipeline** (dual format, publint, attw, external tarball consumer)—**verified on `origin/main`**, though not yet released.

---

## 6. Naming collision / user confusion

| Factor | Assessment |
|--------|------------|
| npm scope | **`@schemaform`** vs **`@jsonschema-form`** — different install names, but both read as “schema form” |
| Search noise | npm search for “schemaform” returns many unrelated packages; `@schemaform/vue` appears alongside `@engler/schemaform`, `@up-group-ui/react-schemaform`, etc. |
| Brand | Formify (chenguanqi) vs jsonschema-form (local) — **no shared branding**, but overlapping keywords (`json-schema`, `dynamic-form`, `form-builder`) |
| Maturity signal | **`@schemaform/*` is on npm but days old and dist-only**; local is **packaging-ready but not published**—evaluators may conflate “exists on npm” with “more mature” |
| Practical confusion | **Moderate for npm discovery**, **low at install time** if scopes differ—but **high** if local project ever publishes as `@schemaform/*` or drops “jsonschema-” prefix without checking npm |

**Recommendation:** Treat [@schemaform on npm](https://www.npmjs.com/search?q=%40schemaform) as **occupied** by Formify; keep **`@jsonschema-form`** or another verified-unused scope; document non-affiliation before first publish.

---

## 7. Lessons and risks for the local project (no cheerleading)

1. **Formify validates the “designer + dual schema” product lane** local explicitly deprioritized. Teams asking for drag-and-drop builders may reach for `@schemaform/vue` regardless of architectural purity—local should not pretend to compete there without a deliberate adapter story.

2. **Rule/conditional behavior is a visible gap.** Formify ships a rule engine; local ignores `if/then/else` and has no equivalent. For tenant-specific dynamic forms, Formify is closer to market expectations today—even if its implementation quality is unproven (**inferred** concerns like `getRuleTargetScope`).

3. **Formify’s dist-only publish with missing vue types is still a negative comparator**—but local should not over-index on “we have builds now.” PR #54 closed the **artifact gap**; remaining work is **registry release** (README, version, changelog, npm scope claim). Formify’s empty README and broken vue typings remain cautionary **for npm page trust**, not for build mechanics.

4. **“Framework-agnostic core” means different things.** Formify’s core still encodes Formify’s `DataSchema`/`ViewSchema` pair; local’s IR is closer to a true intermediate representation. Competing on “headless core” messaging without explaining **dual-schema vs form-tree IR** will confuse evaluators.

5. **Element Plus bundling is a moat and a lock-in.** Formify’s value is integrated designer + EP widgets. Local’s React + bare templates trade faster framework neutrality for more UI work—appropriate for our ADRs, but not interchangeable for Vue/EP shops.

6. **Naming:** `@schemaform` is taken and actively publishing. Renaming or scope collision would create real support burden.

7. **Cannot audit Formify deeply** without source—security, correctness, and test coverage are **unknown unknowns**. Do not copy APIs by reverse-engineering minified dist alone.

---

## 8. Primary sources

### `@schemaform/*` (competitor)

1. npm registry: [@schemaform/core](https://www.npmjs.com/package/@schemaform/core), [@schemaform/vue](https://www.npmjs.com/package/@schemaform/vue), [@schemaform/wc](https://www.npmjs.com/package/@schemaform/wc) (versions 0.1.8 / 0.1.23 / 0.1.8).
2. npm pack tarballs (2026-07-11): `package.json`, `dist/index.d.ts`, `dist/index.js` (core); `dist/index.js`, `dist/vue.css` (vue).
3. npm downloads API: `/downloads/point/last-month/@schemaform/core` and `.../vue`.
4. npm maintainer search: `chenguanqi` → six packages including `@chenguanqi/schemaform-*` predecessors.
5. GitHub: commit/code search for npm `gitHead` and unique exports — **no repo link**; [github.com/chenguanqi](https://github.com/chenguanqi) inspected as **identity hint only**.

### Local `@jsonschema-form/*`

6. **`origin/main`** (fetched 2026-07-11): `package.json`, `packages/*/package.json`, `scripts/smoke-external.mjs`, `.github/workflows/ci.yml`.
7. [PR #54](https://github.com/timkindberg/jsonschema-form/pull/54) — merged 2026-07-11, dual build + smoke.
8. [ADR 036](https://github.com/timkindberg/jsonschema-form/blob/main/architecture_records/036_dual_build_and_development_condition.md) — packaging decision record.
9. `npm view @jsonschema-form/core` → **404** (unpublished).
10. Repo docs: `README.md`, `ARCHITECTURE.md`, `packages/input-jsonschema/SUPPORT_CATALOG.md`.

### Limitations

- **No authoritative VCS for Formify** → no line-level source review, issue history, or test runs for `@schemaform/*`.
- **Vue bundle analysis is inferred** from minified strings unless marked verified (export list, grep counts, tarball file list).
- **GitHub user chenguanqi** may or may not be the npm publisher; username correlation only.
- Download counts are one-month snapshot; Formify package age is days.
- Local packaging claims reflect **`origin/main`**, not stale branch manifests.

---

## 9. Decisions needed

None blocking this research artifact. Before **first npm publish**:

- Confirm npm scope/branding (`@jsonschema-form` availability).
- Decide whether **designer / serialized view schema** belongs in ecosystem (adapter) vs out of scope permanently.

---

## 10. Recommended next step

**Claim `@jsonschema-form` on npm** (or verified alternative scope) and cut a first release from `origin/main` smoke-green tarballs—then add a README note: **not affiliated with [@schemaform/Formify on npm](https://www.npmjs.com/search?q=%40schemaform)**.
