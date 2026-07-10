// Standard Schema interop for the Validator seam (ADR 026).
//
// Standard Schema (https://standardschema.dev) is the cross-library interface
// that form/router tooling — React Hook Form, TanStack Form, … — uses to consume
// "a schema for validation" without per-library adapters. Our `Validator`
// (ADR 019) stays the lightweight native seam; these two pure adapters let it
// *speak* Standard Schema at the boundary:
//
//   • toStandardSchema(validator)   — emit: hand our validator to any
//     Standard-Schema consumer (RHF's `standardSchemaResolver`, TanStack Form, …)
//     with no bespoke resolver shim.
//   • fromStandardSchema(schema)    — consume: use any Standard-Schema library
//     (Zod, Valibot, ArkType, … all implement it natively) as a `Validator`.
//
// The Standard Schema v1 interface is inlined below. The spec is explicitly
// copy/paste-friendly, so this keeps Core zero-dependency while staying
// structurally identical to `@standard-schema/spec` — a value typed as our
// `StandardSchemaV1` is accepted anywhere the real one is.

import type { Validator } from './validation'

/** The Standard Schema v1 interface (inlined from standardschema.dev). */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1Props<Input, Output>
}

/** The `~standard` properties carried by a Standard Schema. */
export interface StandardSchemaV1Props<Input = unknown, Output = Input> {
  readonly version: 1
  readonly vendor: string
  readonly validate: (
    value: unknown
  ) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>
  readonly types?:
    | { readonly input: Input; readonly output: Output }
    | undefined
}

/** Success carries the typed `value`; failure carries `issues` (its presence is the verdict). */
export type StandardSchemaV1Result<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaV1Issue> }

/** One Standard Schema issue: a message and an optional array-of-segments path. */
export interface StandardSchemaV1Issue {
  readonly message: string
  readonly path?:
    | ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>
    | undefined
}

/**
 * Emit: adapt a {@link Validator} into a {@link StandardSchemaV1}, so any
 * Standard-Schema consumer can drive it. Always synchronous (our Validator is).
 *
 * Mappings: our `result.data` (the coerced value, ADR 025) becomes Standard's
 * required success `value` — falling back to the input when the validator
 * transforms nothing; our dot-path `error.path` becomes Standard's segment array
 * (`'contacts.0.email'` → `['contacts','0','email']`, root `''` → no path). Our
 * `keyword` is intentionally dropped: Standard Schema has no keyword vocabulary.
 */
export function toStandardSchema<T>(
  validator: Validator<T>,
  vendor = 'jsonschema-form'
): StandardSchemaV1<unknown, T> {
  return {
    '~standard': {
      version: 1,
      vendor,
      validate: (value) => {
        const result = validator(value)
        if (result.valid) {
          return { value: (result.data ?? value) as T }
        }
        return {
          issues: result.errors.map((error) => ({
            message: error.message,
            path: dotPathToStandardPath(error.path),
          })),
        }
      },
    },
  }
}

/**
 * Consume: adapt a {@link StandardSchemaV1} into a {@link Validator}. Lets a
 * Standard-Schema library (Zod/Valibot/ArkType, …) plug straight into our seam
 * without a dedicated adapter package.
 *
 * The Validator seam is synchronous (ADR 019), so a schema that validates
 * asynchronously (returns a `Promise`) throws — async is a separate seam
 * evolution. Standard's segment-array path is collapsed to our dot-path; Standard
 * carries no keyword, so `error.keyword` is left unset (a dedicated adapter like
 * `createZodValidator` preserves more — e.g. Zod's issue `code`).
 */
export function fromStandardSchema<O>(
  schema: StandardSchemaV1<unknown, O>
): Validator<O> {
  const validate = schema['~standard'].validate
  return (data) => {
    const result = validate(data)
    if (result instanceof Promise) {
      throw new TypeError(
        'fromStandardSchema: schema validated asynchronously (returned a Promise); ' +
          'the Validator seam is synchronous (ADR 019).'
      )
    }
    if (result.issues) {
      return {
        valid: false,
        errors: result.issues.map((issue) => ({
          path: standardPathToDotPath(issue.path),
          message: issue.message,
        })),
      }
    }
    return { valid: true, errors: [], data: result.value }
  }
}

/** Dot-path (`contacts.0.email`) → Standard segment array; root `''` → no path. */
function dotPathToStandardPath(path: string): readonly string[] | undefined {
  return path === '' ? undefined : path.split('.')
}

/** Standard segment array (`['contacts', 0, {key:'email'}]`) → dot-path. */
function standardPathToDotPath(path: StandardSchemaV1Issue['path']): string {
  if (!path) return ''
  return path
    .map((segment) => (typeof segment === 'object' ? segment.key : segment))
    .map(String)
    .join('.')
}
