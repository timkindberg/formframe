# PR #70 — Tribe-of-mentors review, round 2 (`renderNodeRules` typed-tree binding)

**PR:** https://github.com/timkindberg/formframe/pull/70
**Branch:** `feat/customize-layer` vs `origin/main` (merge-base `ef6b90c`)
**Date:** 2026-07-15
**Reviewers:** three independent parallel sub-agents in radical-candor ("kind, not nice") mode — an **unbiased adversarial** pass, a **"Matt Pocock"** type-DX lens, and a **"Tanner Linsley"** library-author lens.
**Context:** re-review after round 1 (`2026-07-15-pr70-renderNodeRules-review.md`) fixes landed — bh7.4 (conformance oracle), bh7.5 (focus/build-once), bh7.6 (complete registrar), bh7.7 (`value | undefined`), bh7.11 (rename/dedupe), bh7.12 (docs), plus the TYPE TOUR comments.

## Verdicts (all three: ship, with edges)

| Reviewer | Verdict |
|---|---|
| Adversarial | **SHIP-WITH-FIXES** — gate green, five prior fixes are real, but the typed surface still lies in the `useFormTree` + `overrideWidgets` path (bh7.8) and a few seams are sharp. |
| Pocock (type-DX) | **8/10** — phantom-brand + `FormShape` split is the right architecture; the `as const`/widening `never` cliff and the two-tier registrar will still floor non-wizards. |
| Tanner (lib-author) | **SHIP-WITH-GUARDRAILS** — mounted-handler + cascade is the right model, focus fix is correct; don't market typed `value` / cross-node selectors as finished, and fix/​document `overrideWidgets` desync. |

## Consensus (flagged by 2–3 reviewers) — the real signal

1. **`overrideWidgets` desync — the #1 remaining issue (all three).** `FormShapeOf` hardcodes `NoOverrides`, but `useFormTree` can re-present with `overrideWidgets`, so `FieldProps` can narrow to `choicegroup` while the DOM renders `<select>`/`<textarea>`. Related root: the recommended demo types off the *original* branded tree while `<Fields>` renders the re-presented `form` (adversarial HIGH ×2, Tanner HIGH, Pocock "types reflect default presentation only"). → already filed **bh7.8 (P1)**. Thread an `Overrides` map through the brand, or brand the *presented* tree, or loudly document "types reflect default presentation only" before calling the types truthful.
2. **`value` is typed but the runtime always passes `undefined` (all three).** `| undefined` is honest, but a dev who writes `if (value === 'pro')` gets silence forever. Until form-state lands: don't surface `value`, or ship a real `useFieldValue(path)`, and add a runtime test asserting the prop is `undefined` today. → bh7.7 follow-up.
3. **`as const` / widened-schema cliff (Pocock HIGH, Tanner + adversarial).** A fetched `JSONSchema` collapses `FieldPaths<S>` to `never` → the worst error TS gives mortals; a hoisted schema without `as const` degrades *partially* (top-level paths work, nested vanish). → already filed **bh7.10 (P2)**; Pocock wants a branded-error return or `defineSchema()` helper, not a silent `never`.
4. **Two-tier registrar feels like two APIs (Pocock MED, Tanner MED).** `r.field('x')` narrows fully; `r.allFields`/`r.where`/`r.default` inherit the neutral floor (`path: string`, `value: unknown`, wide `parts`). Correct (you can't narrow a blanket rule) but consumers will mix them and wonder where narrowing went. → add `AllFieldProps<TS>` or JSDoc on the inherited methods.
5. **Arrays typed but not demonstrated (adversarial LOW, Tanner MED).** `r.array`/`ArrayProps` exist and paths are asserted, but there's no runtime test or example for array-handler layout (add/remove, item customization) — "where form libs die." → add one browser test + an example.
6. **`KindOf` scalar-choice array collapse (adversarial MED, Pocock P2).** Types say array path; runtime collapses an array-of-enum to one leaf field, so `r.array('tags', …)` silently never matches. → already filed **bh7.9 (P2)**.

## Sharpest single-reviewer catches

- **Adversarial:** the non-hook `renderNodeRules((r)=>…)` in a render body *still* remounts on inline builders (the stability fix is hook-only) — mirror the warning or steer docs to the hook. Also: a `useCallback(build, [deps])` whose identity is stable but semantics change silently freezes render-0 rules with no warning.
- **Tanner:** rule matching is O(rules) per node render (`sorted.find` on every `renderNode`); fine for demos, wants a path-indexed lookup for `field/group/array` at 400-field scale. Also: "stylesheet read once" blocks legit flag/locale-driven rule sets — document `key={ruleSetId}` remount as the escape hatch.
- **Pocock:** cross-kind errors don't teach — `r.field('address', …)` (a group) just says `"address"` isn't assignable to the field-path union; it won't tell you to use `r.group`. Consider per-axis branded path types.

## Where they agreed it's genuinely strong

- **Required `[FORM_SHAPE]` phantom brand** — "optional phantoms are security theatre"; required turns silent collapse into a loud jump-to-definition error. Called the single most important DX move in the PR.
- **`DescriptionSlot<D>` via empty `object` for `absent`** — three branches, three *shapes* (required key / optional key / no key). `parts.Description` on a description-less field is a compile error, not `| undefined`. "Chef's kiss."
- **`TypedRuleRegistrar = Omit<…> & {narrowed}`** — closes the typing cliff soundly; typed `field/group/array/control`, inherited blanket selectors.
- **Focus-loss fix with evidence** — `useRef` build-once + browser test proving DOM identity + input value survive re-renders.
- **`formShape.conformance.test.tsx`** — a real root-of-trust pairing runtime `control.kind` with `FieldProps` narrowing from a real `jsonSchemaToTree`/`zodToTree` brand.
- **Mounted handlers + stable parts-bag via context + CSS-cascade specificity** — Tanner would copy all three verbatim; App_16/App_17 differing by one import line proves the brand machinery pays for itself.

## Before-merge shortlist

- **bh7.8** (overrideWidgets / typed-tree-vs-presented-tree desync) — the one all three want *addressed or explicitly documented* before positioning the types as truthful. Everything else is post-merge polish or already filed (bh7.9/7.10) — none is a HOLD.

---

## Full reviews (verbatim)

### 1. Unbiased adversarial

> **Verdict: SHIP-WITH-FIXES** — Gate is green and the five prior-round fixes are real, but the typed surface still lies in the `useFormTree` + `overrideWidgets` path (open bh7.8), and a few runtime/type seams remain sharp enough to bite consumers.
>
> **Findings**
>
> - **[HIGH] `FormShapeOf` ignores `overrideWidgets` → control types can desync from rendered DOM** — `packages/input-jsonschema/src/infer.ts:325-338`, `packages/react/src/useFormTree.tsx:79-87` — `FormShapeOf` hardcodes `WidgetAt<S,P>` with `NoOverrides`, while `useFormTree` re-presents via `resolvePresentation` (including `overrideWidgets`). A consumer can get `FieldProps` narrowing to `choicegroup` while `form` renders `textarea`. The conformance oracle never exercises this pairing. **Fix:** thread an `Overrides` map through `FormShapeOf` (the `WidgetAt` seam already exists) or document/limit the binding to pre-override trees only.
> - **[HIGH] Recommended demo pattern splits type-carrier tree from rendered tree** — `examples/basic-react/src/App_16_React+Customize.tsx:169-185` — `useRenderNodeRules(tree, …)` types off the *original* branded `jsonSchemaToTree` result, but `<Fields>` renders `useFormTree`’s re-presented `form`. Works today with default presentation; breaks typing the moment presentation layers diverge (same root as bh7.8). **Fix:** brand the presented tree, or type off `typeof form` once presentation is applied.
> - **[MED] Prior fix #1 is compile-time only; bypass/fallback holes remain** — `packages/core/src/present/formShape.ts:127-128`, `packages/input-jsonschema/src/jsonSchemaToTree.ts:35` — Required `[FORM_SHAPE]` correctly rejects plain `GroupNode` at `useRenderNodeRules`. But `TreeShapeOf<T>` still falls back to permissive `FormShape` for unbranded trees, and the front-end brand is still an unchecked `as unknown as TypedTree<…>` cast (mitigated, not eliminated, by the oracle). No gate test asserts `useRenderNodeRules(unbrandedTree, …)` is a type error. **Fix:** add a `@ts-expect-error` conformance case; consider making `TreeShapeOf` fail on unbranded input.
> - **[MED] Typed `parts` omit keys the runtime always supplies** — `packages/react/src/renderNodeRules.tsx:177-183`, `360-362` — `FieldProps` correctly omits `Description` when `description: 'absent'`, but every handler receives the same `partsBag` with `Description`/`Control`/`Errors` regardless. Safe today (`Description` no-ops), but `allFields`/`where` handlers get wide `FieldHandlerProps` with slots that typed path rules forbid — consumers can “compile clean” on one axis and hit surprising no-ops on another. **Fix:** document sharply, or split neutral vs path-narrowed part bags at runtime.
> - **[MED] `KindOf` can register `r.array` paths that are runtime fields** — `packages/input-jsonschema/src/infer.ts:170-176` — Scalar-choice arrays collapse to a single leaf at runtime, but `ArrayPaths` still includes them. `r.array('tags', …)` never matches; customization silently falls through. Acknowledged (bh7.9) but still a consumer trap. **Fix:** align `KindOf` with collapse rules or exclude collapsed paths from `arrays`.
> - **[MED] `value` fix is honest in types, dead at runtime** — `packages/react/src/renderNodeRules.tsx:360`, `packages/react/src/useRenderNodeRules.tsx:81` — Prior fix #4 (`T | undefined`) is correct and tested. Runtime *always* passes `value={undefined}` regardless of path. Handlers that guard and use `value` still get `undefined` every time. Acceptable until form-state lands, but easy to miss in demos (`App_16` hovers a typed enum and `void value`). **Fix:** nothing urgent; keep `| undefined` and add a runtime test asserting the prop is undefined today.
> - **[MED] `useCallback` stable identity can freeze stale rules silently** — `packages/react/src/useRenderNodeRules.tsx:233-257` — Prior fix #3 correctly captures the first builder and warns on identity *change*. A `useCallback(fn, [deps])` whose identity stays stable but semantics change (deps update) neither rebuilds rules nor warns. **Fix:** dev warning when `build.toString()`/deps change, or document “module-scope only” more aggressively.
> - **[LOW] `renderNodeRules()` without the hook still remounts on inline builders** — `packages/react/src/renderNodeRules.tsx:301` — Stability fix is hook-only. Direct `renderNodeRules((r)=>…)` in render body still defeats memo and drops focus. JSDoc mentions it; no dev warning. **Fix:** mirror the hook’s identity warning in `renderNodeRules` or steer consumers to the hook exclusively in public docs.
> - **[LOW] No runtime coverage for typed `r.array` / `ArrayProps`** — `packages/react/src/formShape.conformance.test.tsx:177-181` — Oracle checks `keyof arrays` but never `TypedRuleRegistrar['array']` or an array-handler integration test. Prior fix #2 added the type surface without behavioral proof. **Fix:** one browser test rendering a customized array container.
>
> **Genuinely strong**
>
> - **Phantom brand + required `FORM_SHAPE`** is the right seam: React types generically off `FormShape` without importing front-ends, and unbranded `GroupNode` is structurally rejected at the hook boundary (`useRenderNodeRules.tsx:217-219`).
> - **`TypedRuleRegistrar` is now complete** — `Omit` + narrowed re-intersection gives typed `field`/`group`/`array`/`control` while inheriting `allFields`/`where`/`default`; no more “property does not exist” cliff (`useRenderNodeRules.tsx:167-187`, verified in `useRenderNodeRules.test.tsx:123-132`).
> - **Focus-loss blocker is actually fixed** with evidence: `useRef` capture + browser test proving DOM identity and input value survive re-renders (`useRenderNodeRules.stability.test.tsx:48-79`).
> - **`formShape.conformance.test.tsx` is a real root-of-trust**: it pairs runtime `control.kind` with `FieldProps` narrowing from a real `jsonSchemaToTree`/`zodToTree` brand — the best you can do without eliminating the front-end cast entirely.
>
> Merge the layer; treat bh7.8 and the tree/form split as P1 before telling consumers the types are “truthful” under presentation overrides.

### 2. "Matt Pocock" — type-DX

> **Type-DX score: 8/10** — The phantom-brand + `FormShape` split is the right architecture and most path mistakes surface as readable union errors, but the `as const`/widening cliff that collapses to `never`, plus the intentional two-tier registrar, will still floor non-wizard consumers.
>
> ## Findings
>
> **[HIGH] Widened `JSONSchema` → `never` everywhere** — `packages/input-jsonschema/src/jsonSchemaToTree.ts:15` — I probed a fetched `JSONSchema` variable: `r.field('name', …)` fails with `Argument of type '"name"' is not assignable to parameter of type 'never'`. That's the worst error TS gives mortals — it reads like *you* broke generics, not "your schema isn't a literal." Inline literals with `<const S>` are fine; hoisted `as const` is fine; anything widened to `JSONSchema` silently empties `FieldPaths<S>`. **Fix:** gate the return when `S` is exactly the wide interface — e.g. a conditional that resolves to a branded error type, or an overload that only accepts `S extends JSONSchema` when `S` is narrower than `JSONSchema` (the `bh7.10` direction). Don't leave consumers debugging `never`.
>
> **[HIGH] Hoisted schema without `as const` degrades partially, not loudly** — `packages/input-jsonschema/src/infer.ts:195-207` — Same probe: hoisted `{ type: 'object', properties: { name: … } }` (no `as const`) still accepts `r.field('name')` but rejects `r.field('address.street')` with only `"name"` in the union. Top-level paths work; nested paths vanish. A consumer thinks typing is broken on nested fields when they forgot one keyword. **Fix:** pair `<const S>` on `jsonSchemaToTree` with a `satisfies JSONSchema` + `as const` recipe in docs, or a `defineSchema()` helper that enforces both. Ideally lint for hoisted schemas missing `as const`.
>
> **[MEDIUM] Cross-kind errors don't teach** — `packages/react/src/useRenderNodeRules.tsx:171-181` — Wrong-path errors are *legible* but not *pedagogical*:
> - `r.field('nope', …)` → `'"nope"' is not assignable to '"name" | "address.street"'` ✅ shows valid field paths
> - `r.field('address', …)` → same shape, but `"address"` is a **group** — TS won't tell you to use `r.group`
> - `r.group('name', …)` → `'"name"' is not assignable to '"address"'` — same problem inverted
>
> A non-wizard stares at the union and guesses. **Fix:** branded path types per axis (`type FieldPath<TS> = … & { readonly __fieldPath: true }`) so misuse errors mention incompatible brands, or document the three `@ts-expect-error` guardrails in App_16 as mandatory reading.
>
> **[MEDIUM] Two-tier registrar is correct but feels like two APIs** — `useRenderNodeRules.tsx:167-187` / `renderNodeRules.tsx:237-256` — `Omit<RuleRegistrar, axes> & { narrowed }` is sound; `bh7.6` is properly closed (`array`, `control` included). But `r.field('name', …)` gives `FieldProps<Shape, 'name'>` while `r.allFields(…)` inherits `FieldHandlerProps` (`path: string`, `value: unknown`, `parts: PartsBag`). Honest — you *can't* narrow a blanket rule — yet consumers will absolutely mix them and wonder where narrowing went. **Fix:** add `AllFieldProps<TS>` that's wide-but-documented, or JSDoc on the inherited methods inside `TypedRuleRegistrar` explaining "blanket selectors stay on the neutral floor."
>
> **[MEDIUM] Unbranded tree: great primary, hostile secondary** — `packages/core/src/present/formShape.ts:118-121` — Primary error is excellent: `Property '[FORM_SHAPE]' is missing … but required in type 'TypedTree<…>'` with a jump to the symbol. Required phantom brand is the right call. If someone forces past it, callback paths become `never` — acceptable edge, but worth noting in docs.
>
> **[LOW] `value | undefined` is honest; runtime will surprise people anyway** — `useRenderNodeRules.tsx:81` — Adding `| undefined` to the schema-narrowed value is the *right* move (better than lying). The JSDoc explains why. Consumers who don't read it will still file "types are wrong" bugs when `value` is `undefined` at runtime. Not a type defect — a product-comms one.
>
> **[LOW] Zod vs JSON Schema description slots diverge by design** — `formShape.ts:55-59`, `input-zod/src/infer.ts:255-260` — JSON Schema: `Description` **omitted** when absent (compile error on `parts.Description` — App_16 line 107 proves it). Zod: `Description?` always optional. Correct given Zod's registry, but front-end switching changes which mistake you make (forgot guard vs illegal access). Document prominently.
>
> **[P2, acknowledged] `KindOf` vs scalar-choice array collapse** — `packages/input-jsonschema/src/infer.ts:170-176` — Types say array path; runtime may be one leaf field. Accuracy gap, not a lie consumers hit daily.
>
> ## What's elegant
>
> **Required `FORM_SHAPE` phantom** (`formShape.ts:98-120`) — Optional phantoms are security theatre. Required brand turns "silent `FormShape` collapse" into a loud, jump-to-definition error. This is the single most important DX move in the PR.
>
> **`DescriptionSlot<D>` via `object` for absent** (`formShape.ts:55-59`) — Three branches, three *shapes*: required key, optional key, **no key**. `parts.Description` on a description-less field is a compile error, not `PartComponent | undefined`. That's the difference between "forgot to guard" and "this slot doesn't exist." Chef's kiss.
>
> **Union-filter path sets** (`infer.ts:195-207`) — `{ [P in U]: test ? P : never }[U]` is the canonical idiom, applied consistently across field/group/array. Keeps path unions derived from one source.
>
> **`SlotsOf` preserving `?` + `NonNullable` on payload** (`useRenderNodeRules.tsx:54-56`) — Optional slot → optional component; render prop never sees `undefined`. Guard once at placement. Exactly how optional parts should work.
>
> **`Omit &` registrar composition** (`useRenderNodeRules.tsx:167-187`) — Narrow only what's provable per path; inherit the rest. Fixes the old typing cliff without pretending `allFields` can know your schema.
>
> **`Pretty<T>` on consumer-facing props** (`useRenderNodeRules.tsx:43,68`) — Hovers show `{ path; value; Default; parts: { Label; Control; … } }` not `SlotsOf<FieldPartsData<…>>`. The single biggest hover lever, and you pulled it.
>
> **`<const S>` on `jsonSchemaToTree`** (`jsonSchemaToTree.ts:15`) — Inline literals get full inference without `as const`. Zod gets the same for free because `ZodType` is already precise. Asymmetric but fair.
>
> **`WidgetAt` + `Record<never, WidgetName>`** (`infer.ts:256-271`) — Forward-compat seam with zero runtime cost today. Good generic hygiene.
>
> ## Naming / API shape
>
> - `FormShapeOf<S>` (schema → surface) vs `TreeShapeOf<T>` (tree → surface): correct split; `TreeShapeOf` avoids Zod collision. Good.
> - `TypedRuleRegistrar<TS>`: accurate, if verbose. I'd live with it over a misleading `FormRuleRegistrar`.
> - `useRenderNodeRules`: honest about the layering ladder (`renderNode` → rules → hook). Fine.
> - Consumer recipe is clean: `type Shape = FormShapeOf<typeof schema>` + hoisted handlers as `FieldProps<Shape, 'name'>`. Inline handlers infer without annotation when the builder is `TypedRuleRegistrar<Shape>`. That pattern works.
>
> **Bottom line:** Ship it for consumers who follow the recipe (`as const` / inline literal, branded tree, path selectors). The architecture earns trust. The remaining work is at the *edges* — widened schemas, hoisted literals, cross-kind errors — where TypeScript's error messages stop being your friend and you need the library to shout louder.

### 3. "Tanner Linsley" — library-author

> **Verdict**: **SHIP-WITH-GUARDRAILS** — The mounted-handler + cascade model is the right architecture for a serious customization layer, and the focus-loss fix is correct; ship it, but don't pretend the typed `value`, dynamic-rules semantics, or cross-node selectors are production-complete without louder docs and a few remaining type/runtime guardrails.
>
> **Guardrails / findings**
>
> - **[HIGH] `value` is typed but never delivered** — `packages/react/src/renderNodeRules.tsx:360` — Runtime always passes `value={undefined}` while `FieldProps` advertises `TS['fields'][P]['value'] | undefined`. The `| undefined` honesty is better than lying, but at scale this *will* bite: devs write `if (value === 'pro')` in handlers expecting reactive branching, get silence forever, and blame the library. Until form-state lands, either don't surface `value` on handlers, or ship a `useFieldValue(path)` that actually works on the uncontrolled substrate (DOM read on submit isn't enough for live UI).
>
> - **[HIGH] `overrideWidgets` voids the type warranty** — `packages/input-jsonschema/src/infer.ts:258` (open: bh7.8) — `FormShapeOf` hardcodes `NoOverrides`, but `useFormTree` can re-present at runtime. A team that maps `plan` from `choicegroup` → `select` via `overrideWidgets` gets compile-time `Choicegroup` attrs and runtime `<select>` markup. That's a silent production bug class the conformance oracle can't catch. Document as "types reflect default presentation only" on day one, or thread `Overrides` into the brand before promoting this as the typed path.
>
> - **[MED] "Stylesheet read once" fights React intuition** — `packages/react/src/useRenderNodeRules.tsx:233-257` — Capturing `build` in `useRef` on first render is the *right* fix for focus loss (your stability test proves it), and the dev `console.error` is appropriately loud. But it blocks a legitimate pattern: permission/feature-flag-driven rule sets, A/B layouts, or `useCallback(build, [locale])` where locale changes handler *structure*. Users will expect the hook to react; it won't — it warns once and keeps render-0 rules. Guardrail: document `key={ruleSetId}` remount as the escape hatch, and consider an eslint rule for inline `(r) => …` builders.
>
> - **[MED] Cross-node selectors fall off the typed cliff** — `packages/react/src/useRenderNodeRules.tsx:147-148` — `r.field('address.street')` is gorgeous; `r.allFields`, `r.where`, `r.default` revert to `path: string`, `value: unknown`. Real apps start with `r.control('input', …)` or `r.allGroups(…)` before they know every path. The registrar is *complete* now (good), but the typed surface is still bifurcated — you'll see teams split handlers across typed path rules and untyped blankets, losing narrowing exactly where DRY wants it most.
>
> - **[MED] Rule matching is O(rules) per node render** — `packages/react/src/renderNodeRules.tsx:341-348` — `sorted.find` on every `renderNode` invocation is fine for demo schemas; a 400-field admin form with 50 blanket rules will scan on every memo-bailed re-render of touched nodes. Not a ship-blocker, but at TanStack scale I'd want a path-indexed lookup for `field/group/array` rules and reserve linear scan for `where` only.
>
> - **[MED] Arrays are typed but not demonstrated** — `packages/react/src/renderNodeRules.tsx:243-251` — `r.array`/`allArrays` exist, conformance tests assert array *paths*, but there's no runtime test or example for array handler layout (add/remove UX, item field customization). Dynamic arrays are where form libs die; this is the biggest scale gap in the demo surface.
>
> - **[LOW] Adoption docs stop at ADRs + examples** — No `README` mention of `renderNodeRules`/`useRenderNodeRules`; migration from `App_08`-style `renderNode` mega-switches isn't spelled out ("each `if` branch → one registrar call; specificity replaces order"). Examples 16/17 are strong *type* showcases but thin on arrays, `where`, `default`, and `createRenderer` + rules composition (ADR 047 §6).
>
> - **[LOW] `as const` / fetched-schema cliff** — `examples/basic-react/src/App_16_React+Customize.tsx:52` — Inline literals work; API-driven `JSONSchema` degrades to wide paths with no runtime warning (`void tree` seam is still unused). Dynamic forms are a major consumer segment; they'll hit this and think the types are broken.
>
> **What you'd copy into your own lib**
>
> 1. **Mounted handlers, not called callbacks** — Giving each matched node its own fiber (`renderNodeRules.tsx:357`) is the unlock for hooks-in-customization without fighting Rules of Hooks. This is the ADR 016 insight done right.
> 2. **Stable parts bag via context** — Module-level `partsBag` + `HandleCtx` (`renderNodeRules.tsx:177-183`, `356-362`) means layout IOC doesn't trade away memoization. Passing `parts` as props costs nothing; parts never remount. Copy this pattern verbatim.
> 3. **CSS-cascade specificity over registration order** — `SPECIFICITY` + late-wins tiebreak (`renderNodeRules.tsx:261-344`) is teachable, debuggable, and composable across `renderNodeRules(app, form)` scopes. Better than priority integers or first-match-wins.
> 4. **Tree-branded `FormShape` instead of per-front-end React packages** — ADR 048's phantom brand + conformance oracle (`formShape.conformance.test.tsx`) eliminates recipe duplication. App_16/App_17 differing by one import line is the proof this machinery pays for itself.
> 5. **`useRef` capture for structural config** — Treating rules as stylesheet, not state (`useRenderNodeRules.tsx:233-237`), with a dev-only identity warning, is the correct perf/focus trade. I'd ship the same contract with a one-paragraph "this is intentional" in the hook docblock surfaced to consumers.
>
> **Bottom line**: I'd ship this to a large user base *for teams that need layout IOC and path-narrowed customization* — it's meaningfully better than hand-rolled `renderNode` switches. I would not position the typed `value` or cross-node selectors as finished DX yet, and I'd block "typed customization" marketing until `overrideWidgets` desync is scoped or fixed. The abstraction earns its complexity; the remaining risk is consumers trusting types the runtime can't yet honor. Fix bh7.8, add an array example, scream about the stylesheet model in public docs, and you're in TanStack "ship it, document the sharp edges" territory.

---

*Note: some `file:line` citations are approximate (line numbers shifted after the TYPE TOUR comments landed). The findings themselves are accurate to current `HEAD`.*
