import Ajv, { type ErrorObject, type Options as AjvOptions } from 'ajv'
import addFormats from 'ajv-formats'
import type { Validator, ValidationError } from '@jsonschema-form/core'
import { joinPath, jsonPointerToPath } from '@jsonschema-form/core'
import type { InferData, JSONSchema } from '@jsonschema-form/input-jsonschema'

export interface AjvValidatorOptions {
  /**
   * Extra AJV options, merged over the adapter defaults
   * (`allErrors: true`, `strict: false`). Use to pass custom keywords, formats,
   * or a stricter mode if your schemas warrant it.
   */
  ajv?: AjvOptions
  /**
   * Register the standard `ajv-formats` vocabulary (`email`, `uri`, `date`, …).
   * Defaults to `true`; set `false` to leave `format` unhandled or register your
   * own formats via {@link AjvValidatorOptions.ajv}.
   */
  formats?: boolean
}

/**
 * Build a {@link Validator} (ADR 019) backed by AJV. The schema is compiled once;
 * the returned function validates data and returns errors keyed by the same
 * dot-path as `node.path`, so a renderer can map each error straight to its field.
 *
 * Defaults suit form data: `allErrors` (collect every problem, not just the
 * first), `strict: false` (form schemas lean on annotations like
 * `title`/`description` and `oneOf`, which strict mode is fussy about), and
 * `coerceTypes: true` — native FormData is all strings, so a `number`/`integer`/
 * `boolean` field would otherwise spuriously fail its type check. Coercion
 * normalizes the validated object in place; override via `options.ajv`.
 *
 * The standard `ajv-formats` vocabulary (`email`, `uri`, `date`, `uuid`, …) is
 * registered by default — AJV v8 ignores `format` otherwise, so an
 * `{ format: 'email' }` field would silently never fail. Skip it with
 * `options.formats: false` if you register your own.
 *
 * Per the {@link Validator} purity invariant (ADR 025) the input is **never
 * mutated**. AJV rewrites its input in place when a mutating mode is on
 * (`coerceTypes` — our default — plus `useDefaults`/`removeAdditional`), so we
 * validate a copy in that case and hand the coerced copy back as `result.data`
 * (where typed values like `"18"` → `18` are surfaced, not via a side effect).
 * When no mutating mode is active we validate the input directly and omit `data`
 * (nothing was transformed) — no clone cost at all. The copy is a plain deep
 * clone, several times cheaper than `structuredClone` on JSON-shaped form data
 * (see `bench/clonePerf.mjs`). When the schema is a literal, `result.data` is
 * typed via {@link InferData}; otherwise it widens to `unknown`.
 */
export function createAjvValidator<const S extends JSONSchema>(
  schema: S,
  options: AjvValidatorOptions = {}
): Validator<InferData<S>> {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    coerceTypes: true,
    ...options.ajv,
  })
  if (options.formats !== false) addFormats(ajv)
  const validate = ajv.compile(schema as object)

  // Does this AJV config mutate its input? Only then must we protect the caller
  // with a copy (ADR 025). Skipping the clone when nothing mutates removes the
  // dominant per-validate cost on the reactive hot path (clone >> validate).
  const ajvOpts = options.ajv ?? {}
  const mutates =
    (ajvOpts.coerceTypes ?? true) !== false ||
    Boolean(ajvOpts.useDefaults) ||
    Boolean(ajvOpts.removeAdditional)

  return (data: unknown) => {
    if (!mutates) {
      const valid = validate(data) === true
      const errors = valid ? [] : (validate.errors ?? []).map(toError)
      return { valid, errors }
    }
    const coerced = cloneJsonish(data)
    const valid = validate(coerced) === true
    const errors = valid ? [] : (validate.errors ?? []).map(toError)
    return { valid, errors, data: coerced as InferData<S> }
  }
}

/**
 * Deep-clone JSON-shaped form data (plain objects, arrays, primitives). Form data
 * assembled from inputs contains no `Map`/`Set`/`Date`/class instances, so this
 * is sufficient and markedly cheaper than `structuredClone` for the shape.
 */
function cloneJsonish(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJsonish)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = cloneJsonish((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/** Map one AJV error to a neutral validation error on the offending field. */
function toError(error: ErrorObject): ValidationError {
  const base = jsonPointerToPath(error.instancePath)

  // `required` (and `dependentRequired`) report the *parent* object's path; the
  // offending key lives in `params.missingProperty`. Append it so the error lands
  // on the missing field itself rather than its container.
  const missing = (error.params as { missingProperty?: string }).missingProperty
  const path =
    (error.keyword === 'required' || error.keyword === 'dependentRequired') &&
    typeof missing === 'string'
      ? joinPath(base, missing)
      : base

  return {
    path,
    message: error.message ?? 'is invalid',
    keyword: error.keyword,
  }
}
