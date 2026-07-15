# ADR 047: The Customize Layer — Component Handlers, Arrangeable Parts, and Path-Narrowed Selectors

**Date:** 2026-07-12
**Status:** Accepted (epic `jsonschema-form-8l8`; spike `jsonschema-form-gjq`)
**Deciders:** Tim Kindberg
**Extends / refines:** ADR 010 (continuation primitive), ADR 013 (renderer sets / `createRenderer`), ADR 016 (render by calling, stable types), ADR 017 (component re-entry layer), ADR 012 (per-node part override typing), ADR 031 (present/render boundary), ADR 033 (schema-agnostic Core + front-ends), ADR 038/040 (FormFrame `@formframe/*` package identity)

## Context

`renderNode` (ADR 010/017) is the floor of React customization: one primitive, re-enter with `<Default of={node} />`. It is powerful but low-level — real apps end up writing a `renderNode` mega-function of `if (node.isField && node.path === 'x')` branches (see `examples/.../App_08`). Three limitations pushed us past it:

1. **No safe hooks in customization.** `renderNode` is *called* inside `NodeRenderer`'s render (ADR 016), not mounted, so a hook in a branch is lint-hostile and fragile. Stateful, rule-driven rendering (react to validation, values, a future rule engine) has no clean home.
2. **`parts` is override-only, not layout IOC.** The `parts` record (ADR 012/017) lets you swap *how* a part renders, but the field/group Root owns the *arrangement* (label, description, control, errors — fixed). You cannot put the label under the control or the hint to the side.
3. **The types were leaving inference on the table.** `getField`/`renderNode` accept untyped `string` paths and unnarrowed nodes, even though the const schema literal carries everything needed to narrow path, value, control kind, and part presence (`FieldPath<S>` / `InferData<S>` already existed — ADR 034 era).

A fourth pressure is cohesion: the app-wide renderer adapter (`createRenderer`, ADR 013) and a per-form `customize` should not be two unrelated APIs where the app-wide one is *less* expressive. They should be one selector language at two scopes.

This ADR was designed against a runnable spike (bd `gjq`) that proved each decision typechecks and runs on the existing engine, then shipped as epic `8l8`. The spike is retired; the live, gate-checked demonstration is `examples/basic-react/src/App_16_React+Customize.tsx` (which also serves as the typed-binding recipe, ADR 024). `customize` is pure sugar lowering to `renderNode` — no Core change was required for §1–§3; §4 added the shared `WIDGET_CONTROL_KIND` table + `overrideWidgets` resolver to Core.

## Decision

Add **`customize`** — a selector registry whose handlers are **components** receiving **arrangeable, path-narrowed parts** as props. It rides entirely on ADR 010/016/017; the engine is unchanged.

### 1. Handlers are components, not called callbacks

A matched selector renders `<Handler {...props} />` (mounted), giving each handler **its own fiber** — so `useState`, `useFieldErrors`, and a future `useFieldValue` are legal at the top level, lint-clean and robust. This *refines* ADR 016/017: the engine internals still render by calling (`node.Default()`), but a customize handler is a genuine mounted component. The ADR-016 stable-type rule is preserved by **requiring stable handler identity** — handlers are component references / hoisted rules, never inline closures rebuilt per render. An inline closure as a component type is the remount trap ADR 016 removed and remains forbidden.

A handler takes **one props argument** (`{ node, path, value, Default, children, parts }`, narrowed — see §4), which is deliberately the *same shape as an adapter entry* (`DefaultFieldRoot({ node })`) — what makes §6 (adapter unification) fall out. `Default` (whole-node re-entry) and `children` (inner fields, containers) sit at top level, mirroring the engine's `{ Default, Children }` helpers (ADR 016/017); `parts` holds only the composable sub-slots. Component-valued props are PascalCase by React convention (so they render as JSX) — precedent: `renderNode(node, { Default, Children })` in `examples/basic-react/src/App_08_React+Overrides.tsx`, which lints clean under the gate.

### 2. Parts are provided, arrangeable, stable components — full layout IOC

Each handler receives its parts as **components it places itself**: `parts.Label`, `parts.Control`, `parts.Description`, `parts.Errors` (field); `parts.Label`, `parts.Description` (group/array). Plus the top-level `Default` (whole node) and `children` (inner fields). This is the vndly `common.*` pattern, but **provided and typed** rather than imported.

- Each `parts.X` is **one stable, module-level, context-reading component** (reads the current node from context), so passing `parts` as a prop costs nothing and never remounts.
- **Every part is render-prop-hijackable**: `<parts.X />` (default) or `<parts.X render={data => …} />`, where `data` is that part's **narrowed payload** — `Label`→`{ text, attrs, showRequired }`, `Description`→`{ text }`, `Control`→the narrowed `FieldControl` (§5), `Errors`→`ValidationError[]`. One uniform rule: *a part is a slot you place, optionally hijacked with a render prop that hands you its typed data.*
- **Whole-node re-entry is the top-level `Default` prop, not a part** (`<Default />`). It is *exclusive* with the individual parts — delegate the whole node, or hand-arrange the parts. `<Children of={node} />` becomes real React `{children}` for containers. This retires `<Self />` (Outlet-like) and the zero-`of` `<Default of={node} />` from the surface. **`Root`/`Container` is reserved** for a future placeable wrapper part backed by the existing `parts.container` (`nodeTypes.ts` — a field's `{ key }` wrapper), matching compound-UI (Chakra/Radix/Ark) `Root` semantics; naming the whole-node slot `Root` would have collided with that.
- **`errorMessage` is a first-class part** (`parts.Errors`). It is the telling case: errors are *runtime* validation state (read via `useFieldErrors`/`useFieldErrorDisplay`), not a schema-derived `node.part` — which is only expressible because parts are real components. Promoting it out of the field Root (where `DefaultFieldErrors` lives today) is the concrete change that unlocks arranging errors anywhere. **Consequence:** the control↔errors a11y linkage (`aria-invalid`/`aria-describedby`, `FieldA11yContext`) must be carried by the parts via shared ids/context, not by a fixed layout, so layout freedom does not silently cost accessibility.

### 3. Selectors and precedence

`customize((r) => …)` registers rules by axis: `r.field(path)`, `r.group(path)`, `r.control(kind)`, `r.allFields()/allGroups()/allArrays()`, `r.where(predicate)`. A single node picks **one winning rule by specificity** (exact path > predicate > control kind > kind), CSS-cascade style — order-independent and documented. Kind/path-scoped selectors (`r.group`, `r.allGroups`) also avoid the type-variance casts that a generic `r.where` forces (a group-only handler cannot type-safely sit behind an any-node predicate).

### 4. Path-narrowed props — and how we keep the types honest (low drift)

Handler props narrow off the const schema along every axis:

- **path / kind** — `FieldPath<S>` split into `FieldPaths<S>` / `GroupPaths<S>`; wrong path or wrong kind is a **compile error**.
- **value** — `InferData<SchemaAt<S,P>>` (e.g. `'plan'` → `'free' | 'pro' | 'enterprise'`). Type-only until form-state is reactive (§7).
- **control** — routed through `WidgetAt<S, P, Overrides>` → `WidgetToControlKind<…>` (below), pre-narrowing the `FieldControl` union member so `control.attrs` is the right shape with no runtime `kind` guard.
- **parts** — the bag is **derived per path**: `parts.Description` exists only when the schema defines a description (instance presence); the slot set follows Core's own part-shape keys.

The runtime `present` pipeline this mirrors is **two stages** (`present.ts`): **Stage A — facts→widget** (`defaultPresentation`, a heuristic that splits choice fields on `OPTION_COUNT_THRESHOLD`=5, and which a consumer `resolvePresentation` can *override at runtime*, invisibly to types) and **Stage B — widget→control kind** (`deriveControl`, a finite pure map). Three anti-drift strategies, because the axes have different coupling:

- **Derive, don't re-declare (zero drift).** The parts bag is computed from schema presence + Core's `FieldParts`/`GroupParts` keys. Add a part in Core, or a description in the schema, and the type updates automatically — nothing is hand-mirrored.
- **One shared table for Stage B (zero drift).** A single `WIDGET_CONTROL_KIND` const in Core (next to `deriveControl`) is the source both the runtime switch and the type-level `WidgetToControlKind<W>` read. An exhaustiveness check (every `WidgetName` present) fails to compile if a widget is added without a mapping.
- **Composable seam + gate conformance for Stage A (bounded drift).** The control type is `WidgetToControlKind<WidgetAt<S, P, Overrides>>`, where `WidgetAt<S, P, Overrides = {}>` = `P extends keyof Overrides ? Overrides[P] : DefaultWidgetAt<S, P>`. `DefaultWidgetAt` (in `input-jsonschema`, the front-end that owns schema shape) mirrors `defaultPresentation`; it is kept honest by **paired type-level + runtime conformance tests** over a schema matrix in the gate — each case asserts `expectTypeOf` *and* the runtime `deriveControl(defaultPresentation(facts).widget).kind`, so any divergence turns the gate red.

**Fidelity + forward-compat (the decision).** The control type carries **default-rule fidelity** (ADR-039 choice *a*): it reflects what the *default* presentation produces. A consumer `resolvePresentation` that changes a widget at runtime **voids the control-type warranty** for those paths — documented, because the resolver is the deliberate escape hatch. This is made forward-compatible *now* by routing through the `WidgetAt<…, Overrides>` seam: today `Overrides = {}` (empty), so it is pure default rule; a future **typed per-path resolver** supplies an `Overrides` path→widget map that drives both the runtime `resolvePresentation` *and* the type — re-narrowing `control` with **no rewrite below**, exactly mirroring the runtime `layered(defaultPresentation, …)` composition. *Predicate/fact* resolvers (`where(facts => …)`) cannot be typed without type-level predicate evaluation (out of scope); those paths degrade to a guarded union. Committing to the `WidgetAt`/`Overrides` factoring is the one thing we must get right today to keep typed resolvers a purely additive later step. (The earlier spike hardcoded `enum → select`, already wrong — an enum of ≤5 is `radio` → `choicegroup`; the seam removes that class of hand-mirroring bug.)

### 5. Full control hijack and the neutral-contract boundary

`parts.Control` supports `<parts.Control />` (default) and `<parts.Control render={(c) => …} />`, where `c` is the **path-narrowed** `FieldControl`. To fully hand-author a control while keeping form wiring: **spread `c.attrs`** — `attrs.name` reports the value on native submit, `attrs.defaultValue` seeds it (uncontrolled, no `onChange`); add your own attrs; omit one by destructuring it out.

This makes the ADR-031 boundary enforceable: **change how a control *looks* → customize (render)** — spread + augment `attrs`; **change what it *is* (its `name`/`type`/submit semantics) → present (the resolver)**, upstream where `attrs` is computed from facts. Rewriting `name` in customize would desync submission from the schema. Because `attrs` is a typed discriminated union, spreading the wrong shape (e.g. `options` onto a plain input) is a compile error — types police the boundary. (Genuinely novel widgets that do not fit the closed `FieldControl` union remain the deferred `raw` archetype — ADR 008.)

### 6. `createRenderer` and `customize` are one registrar at two scopes

The renderer adapter (`createRenderer`, ADR 013) is the **app-scope** registrar (the "user-agent stylesheet"); `customize` is the **form-scope** registrar. They share the selector language and the component-handler shape (§1), composing as ordinary functions (save and spread partial `customize` fns; adapters remain by-reference sets). Precedence is a cascade: **adapter (lowest) < customize < inline `renderNode`/parts (highest)**. This resolves the asymmetry where the app-wide surface was less expressive than the one-off one, without making Core aware of either.

### 7. Reactivity stays a separate seam (not conflated with the rule engine)

Customize is static/structural: it decides *what/how to render*. Stateful rendering is **conforming, not conflating**, as long as a handler only *consumes* reactive context the form-state/validation layer provides (a handler is a real component — it may call `useFieldErrors`, and later `useFieldValue`), never *owns* value state. Today forms are uncontrolled (FormData), so: validation reactivity already exists (`ValidationProvider` + `revalidate`, ADR 019/021 — the spike wires live error clearing), while **live typed `value`** awaits a reactive form-state adapter (or native watching). That reactive-value seam — not more type machinery — is what a future rule engine consumes. Customize renders the outcome; the rule engine computes it.

## Consequences

- **Hooks in customization become first-class**, unlocking stateful/rule-driven rendering on the existing uncontrolled substrate for everything the validation store already exposes.
- **Layout is fully invertible** (narrow/wide/deep/shallow/targeted/blanket), the original project goal — via arrangeable parts + selectors, all path-narrowed.
- **Errors must leave the field Root** to become a movable part; the a11y id linkage moves with it. New tests must pin the a11y wiring under custom arrangement.
- **A new type-conformance obligation**: the shared `WIDGET_CONTROL_KIND` table + `DefaultWidgetAt` + paired type/runtime tests join the gate. Bounded and gate-enforced; the cost we accept for pre-narrowed controls.
- **The control type is knowingly unsound under widget-changing resolvers** (default-rule fidelity), documented — until typed per-path `Overrides` land as an additive layer through the `WidgetAt` seam committed to now.
- **Two more mounted component types** (a handler fiber per matched node, plus part-slot fibers), all stable — the ADR-016/017 perf contract (render counts, in-place reconcile, uncontrolled value survival) must stay green.
- **`<Self />` and the zero-`of` `<Default of={node} />` are retired** from the customize surface in favor of the top-level `Default` prop (`<Default />`) and real `{children}`; the underlying `Default`/`Children` handles remain the primitive. `Root`/`Container` is reserved for a future `parts.container` wrapper part.

## Alternatives Considered

- **Object-map `customize={{ … }}` instead of a builder.** Rejected as the primary API: two syntaxes double the surface; the builder is the one selector language (an object map, if ever added, is sugar lowering to it). Both are memo-stable when hoisted — JIT (type) and memo (render) are orthogonal.
- **Keep handlers as called callbacks (no mounting).** Rejected: no safe hooks, and it does not unify with adapter entries.
- **Pure context-defaulted `<Self />`.** Rejected as the *only* mechanism (breaks out-of-position `of={node.children.x}` — ADR 017). The hybrid here keeps explicit `of` for targeting and uses the top-level `Default` prop / `{children}` for the current node, sidestepping that objection.
- **Naming the whole-node slot `Root`, on `parts`.** Rejected: `Root` in compound-UI libs is the wrapper part (which we have as `parts.container`), and the whole-node slot is *exclusive* with the parts, so it is not a part at all — it is a top-level `Default` prop.
- **A per-node pre-bound `Default` closure passed as a component.** Rejected: fresh type per render = the ADR-016 remount trap. Parts are stable module-level components reading context instead.
- **Sound-first control types (full `FieldControl` union + runtime `kind` guard).** Rejected as the default: it throws away the pre-narrowing the feature exists for. We chose default-rule fidelity + the `WidgetAt` seam instead (§4).
- **Full type-level mirror of the whole facts→widget→control resolver, incl. predicate resolvers.** Rejected as unbounded drift risk; replaced by shared-table (Stage B) + `DefaultWidgetAt` conformance tests (Stage A) + a typed-`Overrides` seam for static per-path resolution (§4).

## Relates to

Refines ADR 010/016/017 (customize is component-mounted sugar over the callable continuation), ADR 013 (unifies the renderer adapter and customize as one registrar), ADR 012 (supersedes the override-only `parts` record with arrangeable, presence-narrowed parts), ADR 031 (makes the present/render boundary type-enforced at the control), ADR 033/034 (path/value/control narrowing reads the front-end's const schema; Core stays schema-agnostic), and the deferred rule-engine work (§7 defines the reactive-value seam it will consume).
