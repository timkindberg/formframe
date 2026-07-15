# PR #70 review — `renderNodeRules` / `useRenderNodeRules` (ADR 042 typed-tree binding)

**PR:** https://github.com/timkindberg/formframe/pull/70
**Date:** 2026-07-15
**Reviewers:** three independent sub-agents — an adversarial "Sol" (GPT-5.6) pass via `/review`, a fake **Matt Pocock** (type-DX lens), and a fake **Tanner Linsley** (form-library-author lens).

All three landed on **ship it**: Sol (0 CRITICAL, 4 HIGH / 6 MED / 2 LOW), "Pocock" 8.5/10 on type-DX, "Tanner" yes-with-guardrails. What matters is where they **independently converged**.

## Consensus findings (flagged by 2–3 reviewers)

1. **Unbranded tree degrades silently → the headline risk.** *(Sol HIGH · Pocock footgun · implied by Tanner's "trust-me cast")* The phantom was optional and `TypedTree` defaulted `TS = FormShape`, so a plain `GroupNode` was *accepted* by `useRenderNodeRules` and all narrowing vanished with no error.
   - **✅ FIXED in this PR** (commit "reject unbranded trees"): the `FORM_SHAPE` phantom is now **required**, so a plain `GroupNode` fails the hook with a loud type error. Re-presenting a tree intentionally returns an unbranded `GroupNode` (the brand rides the original `jsonSchemaToTree`/`zodToTree` result the hook consumes).

2. **`TypedRuleRegistrar` is a partial subset — the "typing cliff."** *(all three; Tanner P0, Pocock "biggest gap")* Only `field`/`group` are typed; `array`/`control`/`allFields`/`where`/`default` drop to the untyped registrar. `FormShape` already carries `arrays` — add `ArrayProps<TS,P>` and a typed `control(kind)`. → **bd bh7.6 (P1)**

3. **Stable-builder footgun → "input loses focus."** *(Sol MED · Tanner P0 · USER: BLOCKER)* Inline `(r)=>{…}` defeats `useMemo([build])`, remounts nodes, drops focus and resets hook state. Want a dev-mode warning on `build` identity change (reuse the `void tree` seam), possibly also accepting a rules *object*. → **bd bh7.5 (P0)**

4. **The `FormShapeOf` cast is unverified.** *(Sol HIGH · Tanner "non-negotiable")* No test wires `jsonSchemaToTree → FormShapeOf<typeof schema> → FieldProps` end-to-end; this is the root-of-trust for the binding. → **bd bh7.4 (bumped to P1)**

5. **`<const S>` / `as const` asymmetry.** *(all three)* Works for inline literals; hoisted schemas still need `as const` (our examples do), and a fetched `JSONSchema` degrades silently. Docs + ideally an error when `S` is exactly `JSONSchema`. → **bd bh7.10 (P2)**

## Sharpest single-reviewer catches (Sol, adversarial)

- **`value` is compile-time-only but runtime passes `undefined`** — `FormShape` *elevates* `value`, so `r.field('plan', ({value}) => …)` looks typed but is `undefined` at runtime until form-state lands (ADR 041 §7). → **bd bh7.7 (P1)**
- **Override desync** — `FormShapeOf` hardcodes `NoOverrides`, but `useFormTree` can re-present with `overrideWidgets`; type says `choicegroup`, runtime renders `textarea`. → **bd bh7.8 (P1)**
- **Scalar-choice array collapse** vs `KindOf` disagreement; **`HasDescription`** only matches a `description: string` literal. → **bd bh7.9 (P2)**

## Pocock's type-niceties

`ShapeOf` → `TreeShapeOf` (collides with Zod's internal `ShapeOf`); the leftover `FieldPartsFor`/`GroupPartsFor` duplicate Core's `FieldPartsData` — pick one public surface. → **bd bh7.11 (P3)**

## Where they disagreed (already settled)

Tanner wanted consumer-vocabulary names (`useFormRules`/`createFormRules`); Pocock tolerated `useRenderNodeRules` given the layering ladder. **Decision:** keep `renderNodeRules` / `useRenderNodeRules` — "rules" here means *render* rules; `useFormRules` reads as stateful show/hide/disable logic, which this is not.

## Fixed in this PR (quick wins)

- Finding #1 — unbranded trees now rejected (required `FORM_SHAPE` brand).
- App_17 stale on-screen copy — the JSX intro paragraph still named the deleted `./customizeZod` recipe; rewritten to describe `zodToTree` branding + `useRenderNodeRules` (ADR 042). *(Only the header comment had been updated originally — Sol caught the rendered paragraph.)*

## Filed as bd issues (parent `jsonschema-form-bh7`), prioritized

| Priority | Issue | Finding |
|---|---|---|
| **P0** | bh7.5 — unstable `build` identity remounts nodes → input loses focus | #3 |
| **P1** | bh7.4 — `FormShapeOf` conformance oracle (bumped from P2) | #4 |
| **P1** | bh7.6 — complete `TypedRuleRegistrar` (array/control/…) | #2 |
| **P1** | bh7.7 — `value` compile-time-only vs runtime `undefined` | Sol HIGH |
| **P1** | bh7.8 — `FormShapeOf` ignores `overrideWidgets` (desync) | Sol HIGH |
| **P2** | bh7.9 — `FormShapeOf` type-accuracy edges (KindOf/HasDescription) | Sol MED |
| **P2** | bh7.10 — document/enforce `as const` requirement | #5 |
| **P3** | bh7.11 — rename `ShapeOf`→`TreeShapeOf`; dedupe `*PartsFor` | Pocock |
| **P3** | bh7.12 — docs sweep `customize`→`renderNodeRules` | naming |
