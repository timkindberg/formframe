// Validation vocabulary (ADR 037 / ADR 050) — display types plus one path-
// grouping helper. Core does not run validators; recipes produce errors and
// the library renders them. Pure types + one pure helper — no imports, no
// state, no DOM.

/**
 * One validation problem, keyed to a field by the **same dot-path as
 * `node.path`** (`name`, `contacts.0.email`; `""` = the root value). Carrying the
 * path here is what lets a renderer map an error back to the field that owns it
 * with no translation layer. `keyword` is an optional machine code — typically
 * the JSON Schema keyword that failed (`required`, `minLength`, `pattern`).
 */
export interface ValidationError {
  path: string
  message: string
  keyword?: string
}

/**
 * The outcome of validating one data value: a verdict, the flat error list, and
 * optionally the validated data after any validator-applied coercion (ADR 025).
 *
 * `T` is the shape of {@link ValidationResult.data}; it defaults to `unknown`, so
 * a plain `ValidationResult` is unchanged from before. Adapters that know the
 * shape specialize it — Zod from its output type, AJV via `InferData<S>`.
 */
export interface ValidationResult<T = unknown> {
  valid: boolean
  errors: ValidationError[]
  /**
   * The validated value after any coercion/normalization the validator applied
   * (e.g. AJV `coerceTypes` turning `"18"` into `18`, Zod `coerce`/transforms).
   *
   * **Optional** — a validator that transforms nothing may omit it, and callers
   * fall back to the value they passed in. When present it is **never a reference
   * to the caller's input** (always a fresh value), per the {@link Validator}
   * purity invariant — so a consumer can adopt typed values without ever
   * observing a mutation of its own state.
   */
  data?: T
}

/**
 * Recipe-owned: given the form's assembled data, return the result.
 * Synchronous (native / Standard Schema path — async is a separate seam).
 * Core defines the shape; recipes implement it (`ajvValidator.recipe.ts`,
 * `fromStandardSchema`, or a form-library resolver).
 *
 * **Purity invariant (ADR 025): a `Validator` MUST NOT mutate its input** (or
 * anything reachable from it). Adapters whose engine mutates (e.g. AJV's
 * `coerceTypes`) must clone internally and validate the clone. This lets any
 * consumer pass a live object — a form library's state, a React ref — without
 * defensive copying. Coercion is surfaced via {@link ValidationResult.data},
 * never via a side effect.
 *
 * `T` is the type of the returned {@link ValidationResult.data} (default
 * `unknown`). A bare `Validator` is `Validator<unknown>` — identical to before.
 */
export type Validator<T = unknown> = (data: unknown) => ValidationResult<T>

/**
 * Group errors by their `path` for O(1) per-field lookup — the shape a renderer
 * wants ("does this field have errors?"). Pure and order-preserving within a path.
 */
export function groupErrorsByPath(
  errors: ValidationError[]
): Map<string, ValidationError[]> {
  const byPath = new Map<string, ValidationError[]>()
  for (const error of errors) {
    const existing = byPath.get(error.path)
    if (existing) existing.push(error)
    else byPath.set(error.path, [error])
  }
  return byPath
}
