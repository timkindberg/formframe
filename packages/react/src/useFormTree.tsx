import { useMemo, type FC, type FormEvent, type ReactNode } from 'react'
import { present, defaultPresentation, layered } from '@formframe/core'
import type {
  ApplyWidgetOverrides,
  FormShape,
  GroupNode,
  TypedTree,
  PresentationResolver,
  WidgetOverridesOf,
} from '@formframe/core'
import {
  SchemaFields as SchemaFieldsRenderer,
  createRenderer,
  mergeDefaults,
  nativeDefaults,
  type EGroup,
  type Intercept,
  type ReactPartialDefaults,
} from './renderer'

/**
 * Props accepted by the `SchemaFields` component returned from
 * {@link useFormTree}. Same as `SchemaFieldsProps` minus `form` because the hook
 * holds the tree.
 */
export interface BoundSchemaFieldsProps {
  /** Per-node intercept (ADR 010 / ADR 051). Omit to render every node's default. */
  intercept?: Intercept
  /** Place-yourself at the root: receives the enriched root node. */
  children?: (root: EGroup) => ReactNode
}

/** Options for {@link useFormTree}. */
export interface UseFormTreeOptions<
  S = unknown,
  R extends PresentationResolver<S> = PresentationResolver<S>,
> {
  /**
   * Consumer presentation resolver (ADR 029). It runs above the shipped default
   * presentation and receives the tree's source-specific `origin.schema` type.
   * Keep the function reference stable; a new resolver re-presents the tree.
   *
   * When this is a typed `overrideWidgets(map)` resolver, the `const` map is
   * threaded into the returned `form`'s `FormShape` brand, so typing a customize
   * binding off `form` re-narrows the control to the OVERRIDDEN widget — no desync
   * between the typed control and what renders (bd bh7.8).
   */
  resolvePresentation?: R
  /**
   * Partial renderer defaults merged over {@link nativeDefaults} (ADR 051).
   * Kind-wide templates and parts live here; per-node customization is the
   * `intercept` prop on `SchemaFields`. Keep the object reference stable; a new
   * identity rebuilds the bound `SchemaFields` component type.
   */
  defaults?: ReactPartialDefaults
}

/**
 * Bind source-agnostic React form behavior to an existing Core form tree.
 *
 * A front-end such as `jsonSchemaToTree` or `zodToTree` owns schema compilation.
 * This hook owns the React-facing behavior shared by every front-end: layered
 * presentation, a bound `SchemaFields`, and native FormData submission. It does
 * NOT produce, schedule, or store validation errors (ADR 050) — the
 * library renders errors via the inject seam (`<Default of={field} errors={…}
 * />`); a validation adapter or recipe owns producing them.
 *
 * Pass `{ defaults }` to bind a merged renderer set
 * (`createRenderer(mergeDefaults(nativeDefaults, defaults))`). Close over team
 * defaults in userland (`useTeamFormTree`) rather than a library context.
 */
export interface UseFormTreeResult<F, Output> {
  /** The presented tree that actually renders. For a branded input tree it carries
   * the `FormShape` re-narrowed by any widget overrides `resolvePresentation`
   * supplied (bd bh7.8) — type your customize binding off THIS, not the pre-override
   * input, and the typed control cannot desync from what renders. */
  form: F
  SchemaFields: FC<BoundSchemaFieldsProps>
  /** Build a DOM submit handler: assembles FormData into `Output` and always
   * calls `onSubmit` with it — no validation gating. Side-load validation
   * (a `Validator`/Standard Schema adapter) yourself and gate the call, or feed
   * its errors to the inject seam. */
  submit: (
    onSubmit?: (data: Output) => void
  ) => (event: FormEvent<HTMLFormElement>) => void
}

/**
 * Bind React behavior to a **branded** tree (`jsonSchemaToTree`/`zodToTree`): the
 * returned `form` carries the tree's `FormShape` re-narrowed by any widget overrides
 * `resolvePresentation` supplies (bd bh7.8). Type `useRenderNodeRules(form, …)` off
 * this `form`, not the pre-override input tree, and the typed control cannot desync
 * from what actually renders.
 */
export function useFormTree<
  TS extends FormShape,
  S,
  Output = Record<string, unknown>,
  R extends PresentationResolver<S> = PresentationResolver<S>,
>(
  tree: TypedTree<TS, S>,
  options?: UseFormTreeOptions<S, R>
): UseFormTreeResult<
  TypedTree<ApplyWidgetOverrides<TS, WidgetOverridesOf<R>>, S>,
  Output
>
/** Bind React behavior to a plain (unbranded) tree — no `FormShape` to thread. */
export function useFormTree<S = unknown, Output = Record<string, unknown>>(
  tree: GroupNode<S>,
  options?: UseFormTreeOptions<S>
): UseFormTreeResult<GroupNode<S>, Output>
export function useFormTree<S = unknown, Output = Record<string, unknown>>(
  tree: GroupNode<S>,
  options: UseFormTreeOptions<S> = {}
): UseFormTreeResult<GroupNode<S>, Output> {
  const { resolvePresentation, defaults } = options
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

  const submit = useMemo(
    () => (onSubmit?: (data: Output) => void) =>
      form.submit((data) => {
        onSubmit?.(data as Output)
      }),
    [form]
  )

  // Stable component type: re-renders do not remount uncontrolled fields.
  const SchemaFields = useMemo<FC<BoundSchemaFieldsProps>>(() => {
    const Renderer = defaults
      ? createRenderer(mergeDefaults(nativeDefaults, defaults))
      : SchemaFieldsRenderer
    return function SchemaFields({
      intercept,
      children,
    }: BoundSchemaFieldsProps) {
      return (
        <Renderer form={form} intercept={intercept}>
          {children}
        </Renderer>
      )
    }
  }, [form, defaults])

  return { form, SchemaFields, submit }
}
