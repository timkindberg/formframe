// RECIPE (shared, form-library-agnostic): helpers every form-lib recipe needs
// that are NOT per-field error chrome — blank-value normalization, cross-field
// match rules, and a tree-order ValidationSummary. Per-field errors + a11y
// come from FormFrame's inject seam:
// `<Default of={field} errors={ValidationError[]} />`.
//
// This is the bottom layer of a three-layer recipe stack:
//
//   fieldPresentation.recipe.tsx   ← you are here. Shared by EVERY recipe.
//   <library>FieldControls.recipe  ← per form library (RHF / TanStack).
//   Recipe_ReactHookForm_JSONSchema / Recipe_TanStackForm_JSONSchema …        ← per schema front-end (JSON Schema / Zod).
//
// Copy this file once; it serves every recipe you use.
import type { ReactNode } from 'react'
import type { ValidationError, Validator } from '@formframe/core'
import { fieldControlId } from '@formframe/renderer-react'

// --- "Empty means absent" ----------------------------------------------------
// A field the user never filled in should submit as MISSING, not as "". An
// empty string passes a `required` check but then fails `format`/`minLength`,
// producing errors that make no sense for a field nobody touched. Controlled
// libraries (TanStack) hand you `undefined` already; uncontrolled ones (RHF,
// reading DOM values) hand you "" — so both normalize through these.

/** Text/number/select values: "" means the user left it alone. */
export function blankToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value
}

/** Radio/checkbox groups, where "nothing selected" can also surface as
 * `false` or `null` depending on the library. */
export function unselectedToUndefined(value: unknown): unknown {
  return value === '' || value === false || value == null ? undefined : value
}

// --- Validator composition ---------------------------------------------------

/**
 * Materialize missing nested group objects as `{}` before validating.
 *
 * Native FormData omits empty children and therefore drops the parent key
 * entirely — so a required `address.street` failure lands on the invisible
 * `address` group instead of the street field. RHF materializes nested values;
 * TanStack seeds `defaultValues: { address: {} }`. Native recipes reach for
 * this wrapper instead.
 *
 * Only top-level group keys today (enough for the shared parity schema).
 */
export function withMissingGroups<T>(
  validator: Validator<T>,
  groups: readonly string[]
): Validator<T> {
  return (data) => {
    const values = { ...(data as Record<string, unknown>) }
    let changed = false
    for (const key of groups) {
      if (values[key] === undefined) {
        values[key] = {}
        changed = true
      }
    }
    return validator((changed ? values : data) as T)
  }
}

/**
 * Add a "these two fields must match" rule on top of any FormFrame
 * `Validator`. Pure composition over FormFrame's own validation contract, so
 * it works with any validator (AJV, Zod, Valibot) and any form library.
 *
 * The error attaches to `field` — a concrete path — so it renders through the
 * exact same per-field mechanism as a structural schema error, with no
 * "form-level error" special case anywhere downstream.
 *
 * (Zod expresses this natively with `.refine(fn, { path })`; reach for this
 * when your schema language can't, as plain JSON Schema can't.)
 */
export function withMatchRule<T>(
  validator: Validator<T>,
  field: string,
  mustMatch: string,
  message: string
): Validator<T> {
  return (data) => {
    const result = validator(data)
    const values = (result.data ?? data) as Record<string, unknown>
    const a = values?.[field]
    const b = values?.[mustMatch]
    if (a !== undefined && b !== undefined && a !== b) {
      return {
        valid: false,
        errors: [...result.errors, { path: field, message, keyword: 'match' }],
        data: result.data,
      }
    }
    return result
  }
}

// --- Validation summary ------------------------------------------------------
// Convenient copy-paste helper — not a library API (#109 / ADR 050). Order
// follows `form.getAllFields()` (tree / DOM order). Unknown paths append at
// the end, in the order they arrived. Each row links via `fieldControlId`.

/** Minimal tree surface the summary needs — a Core `GroupNode` satisfies this. */
export interface ValidationSummaryForm {
  getAllFields(): ReadonlyArray<{ path: string }>
}

export function ValidationSummary({
  errors,
  form,
}: {
  errors: readonly ValidationError[]
  form: ValidationSummaryForm
}): ReactNode {
  if (errors.length === 0) return null
  const order = new Map(form.getAllFields().map((field, i) => [field.path, i]))
  const sorted = [...errors].sort((a, b) => {
    const ai = order.get(a.path)
    const bi = order.get(b.path)
    if (ai === undefined && bi === undefined) return 0
    if (ai === undefined) return 1
    if (bi === undefined) return -1
    return ai - bi
  })
  return (
    <ul className="jsf-validation-summary">
      {sorted.map((error, i) => (
        <li key={`${error.path}-${i}`}>
          <a href={`#${fieldControlId(error.path)}`}>
            {error.path}: {error.message}
          </a>
        </li>
      ))}
    </ul>
  )
}
