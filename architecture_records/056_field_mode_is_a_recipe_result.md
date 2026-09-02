# ADR 056: Field Mode Is a Recipe Result Seam, Not a FormFrame Rules Engine

**Date:** 2026-08-31
**Status:** Accepted
**Deciders:** Tim Kindberg
**Builds on:** ADR 008 (second implementation), ADR 011 (reactive form-state when live behavior needs it), ADR 024 (recipes, not packages), ADR 050 (recipes produce validation), ADR 052 (consumers build capabilities)
**Relates to:** [#74](https://github.com/timkindberg/formframe/issues/74), precursor [#164](https://github.com/timkindberg/formframe/issues/164). Annotates ADR 047 §7 — the “future rule engine” is this recipe, not Core.

## Context

Unknown-shape forms carry serializable `rule_schema` (tenant/DB JSON). VNDLY’s generic-form compiler emits JRES-shaped `{ conditions, event }` and evaluates them with `json-rules-engine-simplified`. The original #74 asked for a source-neutral runner in Core. [#164](https://github.com/timkindberg/formframe/issues/164) showed the #160 `isHidden` / `isRequired` / `isReadOnly` predicates are enough: no hide API, no Core evaluator.

Shipping `{ path, op }` + `evaluate()` would be a third rules engine, worse than the one hosts already have. FormFrame also does not produce validation (ADR 050); requiredness that only stamps field UI would silently disagree with AJV.

## Decision

**FormFrame does not evaluate `rule_schema`.** A host engine folds its result into **field mode** (hidden / required / read-only) and **value effects** (`setValues`). Core stays unaware. There is no `@formframe/field-mode` package until a second host needs the import (ADR 008).

The copyable recipe (`examples/basic-react/src/fieldMode.recipe.ts`):

1. **`createFieldMode(rules)`** → `(values) => snapshot` (and `paths` for `useWatch`). A tiny JRES-like matcher lives *inside* that file so the gallery has no extra dependency. Hosts swap the matcher for `applicableActions` (or anything else) and keep the snapshot shape.
2. **`withFieldMode(validate, fieldMode)`** wraps any `Validator`. Sugar: `createAjvValidator(schema, { fieldMode })`. Derives mode from the **data being validated**, not a React ref. Omits hidden paths on a clone, drops their errors, injects field-mode `required`. One required producer — not also `register({ required })`.
3. **Field UI** reads the same `fieldMode(values)`: `field.root` → `null` (unknown-shape skip), required marker, `readOnly`. Known-shape place-yourself filters in `layout`. The host applies `setValues` (hide-and-clear destroys; no restore).

Live rules need a reactive form-state adapter (ADR 011). Native FormData snapshots go stale. `on` / async / cycles / dynamic options are out of this recipe.

## Consequences

- Field mode does **not** rewrite the JSON Schema. `ajv.compile(schema)` runs once; each validation clones **data**, omits hidden paths on the clone, and projects **errors** (drop hidden, inject required). `schema.required` is not pushed, properties are not deleted, and the compiled AJV function is reused as values change.
- JSON Schema `if`/`then`/`else` ([#86](https://github.com/timkindberg/formframe/issues/86)) compiles into field mode later, not into a second runtime.
- [#167](https://github.com/timkindberg/formframe/issues/167) is the first real consumer of this recipe, not the closer for #74.
- A published overlay/field-mode package remains a watch list, not a commitment.

**Relates to:** ADR 008, 011, 024, 047 §7, 050, 052. Glossary: `CONTEXT.md` (rule_schema, field mode, value effects).
