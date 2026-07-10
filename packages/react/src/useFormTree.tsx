import {
  useMemo,
  useState,
  useCallback,
  type FC,
  type FocusEvent,
  type FormEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import { present, defaultPresentation, layered } from '@jsonschema-form/core'
import type {
  GroupNode,
  Validator,
  ValidationIssue,
  ValidationResult,
  PresentationResolver,
} from '@jsonschema-form/core'
import {
  SchemaFields as SchemaFieldsRenderer,
  type EGroup,
  type RenderNode,
} from './renderer'

/**
 * Props accepted by the `SchemaFields` component returned from
 * {@link useFormTree}. Same as `SchemaFieldsProps` minus `form` because the hook
 * holds the tree.
 */
export interface BoundSchemaFieldsProps {
  /** Per-node hijack (ADR 010). Omit to render every node's default. */
  renderNode?: RenderNode
  /** Place-yourself at the root: receives the enriched root node. */
  children?: (root: EGroup) => ReactNode
}

/**
 * Validation state returned by {@link useFormTree}, ready to spread into
 * `ValidationProvider` without omitting touched or submitted state (ADR 036).
 */
export interface FormTreeValidation {
  issues: ValidationIssue[]
  touched: ReadonlySet<string>
  submitted: boolean
}

/** Options for {@link useFormTree}. */
export interface UseFormTreeOptions<
  S = unknown,
  Output = Record<string, unknown>,
> {
  /**
   * A side-loaded validator (ADR 019), normally from the same source adapter as
   * the tree. When set, `submit` runs it, exposes `errors`, and only calls the
   * consumer handler when the data is valid.
   */
  validator?: Validator<Output>
  /**
   * Consumer presentation resolver (ADR 029). It runs above the shipped default
   * presentation and receives the tree's source-specific `origin.schema` type.
   * Keep the function reference stable; a new resolver re-presents the tree.
   */
  resolvePresentation?: PresentationResolver<S>
}

/**
 * Bind source-agnostic React form behavior to an existing Core form tree.
 *
 * A front-end such as `jsonSchemaToTree` or `zodToTree` owns schema compilation.
 * This hook owns the React-facing behavior shared by every front-end: layered
 * presentation, a bound `SchemaFields`, native submission, validation issues,
 * live revalidation, and touched/submit state.
 */
export function useFormTree<S = unknown, Output = Record<string, unknown>>(
  tree: GroupNode<S>,
  options: UseFormTreeOptions<S, Output> = {}
) {
  const { validator, resolvePresentation } = options
  const form = useMemo(
    () =>
      present<S>(
        tree,
        resolvePresentation
          ? layered<S>(defaultPresentation, resolvePresentation)
          : defaultPresentation
      ),
    [tree, resolvePresentation]
  )

  const [errors, setErrors] = useState<ValidationIssue[]>([])
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set())
  const [submitted, setSubmitted] = useState(false)

  /**
   * Mark a field touched on blur. `focusout` bubbles, so one form-level handler
   * covers every named control.
   */
  const handleBlur = useCallback((event: FocusEvent<HTMLFormElement>) => {
    const name = (event.target as { name?: string }).name
    if (!name) return
    setTouched((prev) => (prev.has(name) ? prev : new Set(prev).add(name)))
  }, [])

  const runValidator = useCallback(
    (data: Record<string, unknown>): ValidationResult<Output> => {
      const result: ValidationResult<Output> = validator
        ? validator(data)
        : { valid: true, issues: [] as ValidationIssue[] }
      setErrors(result.issues)
      return result
    },
    [validator]
  )

  /** Build a DOM submit handler that assembles data and gates on validation. */
  const submit = useCallback(
    (onValid?: (data: Output) => void) => {
      const run = form.submit((data) => {
        const result = runValidator(data)
        if (result.valid) {
          onValid?.(result.data === undefined ? (data as Output) : result.data)
        }
      })
      return (event: FormEvent<HTMLFormElement>) => {
        setSubmitted(true)
        run(event)
      }
    },
    [form, runValidator]
  )

  /**
   * Run the same validator from a form event. Wire to `onInput`, `onChange`, or
   * `onBlur` according to the desired validation timing.
   */
  const revalidate = useCallback(
    (event: SyntheticEvent<HTMLFormElement>) => {
      if (!validator) return
      form.submit((data) => {
        runValidator(data)
      })({ preventDefault: () => {}, currentTarget: event.currentTarget })
    },
    [form, validator, runValidator]
  )

  // Stable component type: validation updates do not remount uncontrolled fields.
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

  const validation = useMemo<FormTreeValidation>(
    () => ({ issues: errors, touched, submitted }),
    [errors, touched, submitted]
  )

  return {
    form,
    SchemaFields,
    submit,
    revalidate,
    validation,
    errors,
    handleBlur,
    touched,
    submitted,
  }
}
