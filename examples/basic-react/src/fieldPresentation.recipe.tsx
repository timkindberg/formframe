// RECIPE (shared, form-library-agnostic): helpers every form-lib recipe needs
// that are NOT error chrome — blank-value normalization and cross-field match
// rules. Per-field errors + a11y come from FormFrame's inject seam:
// `<Default of={field} errors={ValidationError[]} />`.
//
// This is the bottom layer of a three-layer recipe stack:
//
//   fieldPresentation.recipe.tsx   ← you are here. Shared by EVERY recipe.
//   <library>FieldControls.recipe  ← per form library (RHF / TanStack).
//   Recipe_ReactHookForm_JSONSchema / Recipe_TanStackForm_JSONSchema …        ← per schema front-end (JSON Schema / Zod).
//
// Copy this file once; it serves every recipe you use.
import type { Validator } from '@formframe/core'

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
