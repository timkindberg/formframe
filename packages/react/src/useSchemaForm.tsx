import {
  useMemo,
  useState,
  useCallback,
  type FC,
  type FocusEvent,
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
 * blocks your handler on failure, and exposes `errors`. Wire `revalidate` for live
 * validation (ADR 021) — `onInput` validates per keystroke; native `onChange`
 * validates on blur for text fields. Same validator, same `errors` state, inputs
 * stay uncontrolled. To render each issue under its field, wrap the fields in
 * `<ValidationProvider issues={errors}>` (kept explicit so you own where issues
 * live — ADR 013).
 *
 * For React-Hook-Form-style **touched-gated errors** (ADR 027), wire
 * `onBlur={handleBlur}` and pass `touched`/`submitted` plus
 * `showErrorsWhen="touched"` to the provider: a field's error stays quiet until
 * it blurs, and submit reveals all. Default is `'always'` (unchanged).
 *
 * `SchemaFields` renders the form's *content only* — wrap it in your own
 * `<form>` and submit (chrome is the consumer's, ADR 013):
 *
 * @example
 * ```tsx
 * const { SchemaFields, submit, revalidate, errors, handleBlur, touched, submitted } =
 *   useSchemaForm(schema, { validator: createAjvValidator(schema) })
 * return (
 *   <form noValidate onSubmit={submit(onValid)} onInput={revalidate} onBlur={handleBlur}>
 *     <ValidationProvider
 *       issues={errors}
 *       touched={touched}
 *       submitted={submitted}
 *       showErrorsWhen="touched"
 *     >
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

  // Validation issues (submit-time and/or live). Mirrored into the per-path
  // issue store by `ValidationProvider` (ADR 023), so a pass re-renders only the
  // fields whose issues changed; uncontrolled inputs keep typed values.
  const [errors, setErrors] = useState<ValidationIssue[]>([])

  // Error-display state (ADR 027) — which fields have been touched (focus→blur)
  // and whether a submit has been attempted. Feeds `ValidationProvider`'s
  // touched/submitted props; the default `showErrorsWhen='always'` ignores them.
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set())
  const [submitted, setSubmitted] = useState(false)

  /**
   * Mark a field touched on blur — wire once at the form: `<form onBlur={...}>`.
   * `focusout` bubbles, so this one handler catches every field; `event.target`
   * is the blurred control and its `name` is the field's dot-path. Idempotent:
   * re-blurring a touched field keeps the same Set reference (no re-render).
   */
  const handleBlur = useCallback((event: FocusEvent<HTMLFormElement>) => {
    const name = (event.target as { name?: string }).name
    if (!name) return
    setTouched((prev) => (prev.has(name) ? prev : new Set(prev).add(name)))
  }, [])

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
    (onValid?: (data: Record<string, unknown>) => void) => {
      const run = form.submit((data) => {
        const result = runValidator(data)
        if (result.valid) onValid?.(data)
      })
      return (event: FormEvent<HTMLFormElement>) => {
        // A submit attempt reveals all errors under the 'touched'/'submit'
        // display policies (ADR 027), matching React Hook Form.
        setSubmitted(true)
        run(event)
      }
    },
    [form, runValidator]
  )

  /**
   * Live validation — wire to the consumer's form event handler. Reads native
   * FormData from `event.currentTarget` (via Core's submit assembler), runs the
   * side-loaded validator, and updates `errors`. Use `onInput={revalidate}` for
   * per-keystroke feedback; `onChange={revalidate}` validates on blur for text
   * fields (native `change` semantics). Opt-in: omit both and behaviour stays
   * submit-only (ADR 021).
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

  return {
    form,
    SchemaFields,
    submit,
    revalidate,
    errors,
    handleBlur,
    touched,
    submitted,
  }
}
