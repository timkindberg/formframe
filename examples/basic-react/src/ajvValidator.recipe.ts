// RECIPE (JSON Schema + AJV): build a FormFrame `Validator` from a JSON Schema.
//
// Copy this with any JSON Schema recipe that needs AJV
// (Recipe_NativeForm_JSONSchema / Recipe_ReactHookForm_JSONSchema /
// Recipe_TanStackForm_JSONSchema, plus the App_* demos that share that stack).
// Zod recipes do not need it — use `fromStandardSchema(schema)` from Core.
//
// `{ fieldMode }` also needs `fieldMode.recipe.ts` (ADR 056). Native / Zod
// use `withFieldMode` from that file instead of this option.
//
// Defaults suit form data: `allErrors`, `strict: false`, `coerceTypes: true`
// (FormData is all strings), and `ajv-formats` so `format: 'email'` etc. work.
// The input is never mutated (clone when AJV would rewrite in place); coerced
// values surface on `result.data`.
import Ajv, { type ErrorObject, type Options as AjvOptions } from 'ajv'
import addFormats from 'ajv-formats'
import type { Validator, ValidationError } from '@formframe/core'
import { joinPath, jsonPointerToPath } from '@formframe/core'
import type { InferData, JSONSchema } from '@formframe/input-jsonschema'
import { withFieldMode, type FieldModeSnapshot } from './fieldMode.recipe'

export interface AjvValidatorOptions {
  /**
   * Extra AJV options, merged over the recipe defaults
   * (`allErrors: true`, `strict: false`, `coerceTypes: true`).
   */
  ajv?: AjvOptions
  /**
   * Register the standard `ajv-formats` vocabulary (`email`, `uri`, `date`, …).
   * Defaults to `true`; set `false` to leave `format` unhandled or register your
   * own formats via {@link AjvValidatorOptions.ajv}.
   */
  formats?: boolean
  /**
   * Same function as field UI: `(values) => snapshot` from `createFieldMode`.
   * AJV then omits hidden paths, drops their errors, and injects field-mode
   * `required`. Derive from the data being validated — not a React ref.
   */
  fieldMode?: (data: unknown) => FieldModeSnapshot
}

/**
 * Build a {@link Validator} backed by AJV. The schema is compiled once; returned
 * errors use the same dot-path as `node.path` so FormFrame can place them.
 * Pass `{ fieldMode }` (from `createFieldMode`) so required/hidden agree with
 * field UI — copy `fieldMode.recipe.ts` when you use that option. Field mode
 * does not mutate `schema.required` or recompile between validations.
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

  const ajvOpts = options.ajv ?? {}
  const mutates =
    (ajvOpts.coerceTypes ?? true) !== false ||
    Boolean(ajvOpts.useDefaults) ||
    Boolean(ajvOpts.removeAdditional)

  const run: Validator<InferData<S>> = (data: unknown) => {
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

  return options.fieldMode ? withFieldMode(run, options.fieldMode) : run
}

/** Deep-clone JSON-shaped form data (plain objects, arrays, primitives). */
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

function toError(error: ErrorObject): ValidationError {
  const base = jsonPointerToPath(error.instancePath)
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
