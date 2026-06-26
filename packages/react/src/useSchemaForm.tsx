import {
  useMemo,
  useState,
  useCallback,
  type FC,
  type FormEvent,
  type ReactNode,
} from 'react'
import { jsonSchemaToTree } from '@jsonschema-form/core'
import type {
  JSONSchema,
  Validator,
  ValidationIssue,
} from '@jsonschema-form/core'
import {
  SchemaFields as SchemaFieldsRenderer,
  type EGroup,
  type RenderNode,
} from './renderer'

/**
 * Props accepted by the `SchemaFields` component returned from `useSchemaForm`.
 * Same as {@link SchemaFieldsProps} minus `form` (the hook holds the tree).
 */
export interface BoundSchemaFieldsProps {
  /** Per-node hijack (ADR 010). Omit to render every node's default. */
  renderNode?: RenderNode
  /** Place-yourself at the root: receives the enriched root node. */
  children?: (root: EGroup) => ReactNode
}

/** Options for {@link useSchemaForm}. */
export interface UseSchemaFormOptions {
  /**
   * A side-loaded, submit-time validator (ADR 019) — e.g. `createAjvValidator`
   * from `@jsonschema-form/validation-ajv`. When set, `submit` runs it, exposes
   * `errors`, and only calls your handler when the data is valid. Omit for no
   * validation (behaviour is unchanged).
   */
  validator?: Validator
}

/**
 * Convenience hook: compiles a JSON Schema into the Core form tree and hands
 * back a `SchemaFields` component already bound to it. Pure sugar over the
 * renderer (ADR 010/013) — `useSchemaForm` holds the tree and forwards
 * `renderNode`/place-yourself children to the same continuation.
 *
 * Pass a `validator` (ADR 019) to get submit-time validation: `submit` runs it,
 * blocks your handler on failure, and exposes `errors`. Wire `onChange={revalidate}`
 * for live validation (ADR 021) — same validator, same errors state, inputs stay
 * uncontrolled. To render each issue under its field, wrap the fields in
 * `<ValidationProvider issues={errors}>` (kept explicit so you own where issues
 * live — ADR 013).
 *
 * `SchemaFields` renders the form's *content only* — wrap it in your own
 * `<form>` and submit (chrome is the consumer's, ADR 013):
 *
 * @example
 * ```tsx
 * const { SchemaFields, submit, revalidate, errors } = useSchemaForm(schema, {
 *   validator: createAjvValidator(schema),
 * })
 * return (
 *   <form noValidate onSubmit={submit(onValid)} onChange={revalidate}>
 *     <ValidationProvider issues={errors}>
 *       <SchemaFields />
 *     </ValidationProvider>
 *     <button type="submit">Submit</button>
 *   </form>
 * )
 * ```
 */
export function useSchemaForm(
  schema: JSONSchema,
  options: UseSchemaFormOptions = {}
) {
  const { validator } = options
  const form = useMemo(() => jsonSchemaToTree(schema), [schema])

  // Validation issues (submit-time and/or live). Surfacing them re-renders only
  // the per-field error consumers (via `ValidationProvider`'s Context), never
  // the uncontrolled inputs (the memoized node renderer bails), so typed values
  // survive.
  const [errors, setErrors] = useState<ValidationIssue[]>([])

  const runValidator = useCallback(
    (data: Record<string, unknown>) => {
      const result = validator
        ? validator(data)
        : { valid: true, issues: [] as ValidationIssue[] }
      setErrors(result.issues)
      return result
    },
    [validator]
  )

  /**
   * Build the form's submit handler. Reuses Core's `submit` to assemble the data
   * from native FormData, then gates on the validator: record issues, and call
   * `onValid` only when the data passes. Without a validator it is a thin
   * pass-through. Returns a DOM submit handler — `<form onSubmit={submit(fn)}>`.
   */
  const submit = useCallback(
    (onValid?: (data: Record<string, unknown>) => void) =>
      form.submit((data) => {
        const result = runValidator(data)
        if (result.valid) onValid?.(data)
      }),
    [form, runValidator]
  )

  /**
   * Validate on change — wire to the consumer's `<form onChange={revalidate}>`.
   * Reads native FormData from the form (via Core's submit assembler), runs the
   * side-loaded validator, and updates `errors`. Opt-in: omit it and behaviour
   * stays submit-only (ADR 021).
   */
  const revalidate = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      if (!validator) return
      form.submit((data) => {
        runValidator(data)
      })({ preventDefault: () => {}, currentTarget: e.currentTarget })
    },
    [form, validator, runValidator]
  )

  // Memoized on `form` for a stable component type — the consumer's
  // `<SchemaFields/>` never remounts across validation passes.
  const SchemaFields = useMemo<FC<BoundSchemaFieldsProps>>(() => {
    return function SchemaFields({
      renderNode,
      children,
    }: BoundSchemaFieldsProps) {
      return (
        <SchemaFieldsRenderer form={form} renderNode={renderNode}>
          {children}
        </SchemaFieldsRenderer>
      )
    }
  }, [form])

  return { form, SchemaFields, submit, revalidate, errors }
}
