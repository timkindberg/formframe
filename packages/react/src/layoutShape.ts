// FormShape-keyed layout handles (ADR 055).
//
// `useFormTree` already closes over the tree's `FormShape` brand (ADR 048). Bound
// `SchemaFields layout` was still typed as `EGroup` (`children: Record<string,
// ENode>`). That was a typing hole, not a missing factory skin: the primitive
// `root.children.x` just was not indexed by the brand. This file is the overlay
// — runtime handles stay `EGroup`; the layout callback's `root` is a phantom
// narrowing of `children` to direct child names at a path prefix. Child
// fields/groups/arrays reuse the public `EField` / `EGroup` / `EArray` aliases
// so Quick Info is `EField<Origin>`, not a second `type EField = …` (`EField$1`).
// `Origin` is the tree-wide `facts.origin.schema` type, not a per-path subschema.

import type { FormShape } from '@formframe/core'
import type { EArray, EField, EGroup, ENode } from './enriched'

type Pretty<T> = { [K in keyof T]: T[K] } & {}

/** Direct child names of `Prefix` among dotted `FormShape` paths. */
type DirectOf<P extends string, Prefix extends string> = [Prefix] extends ['']
  ? P extends `${string}.${string}`
    ? never
    : P
  : P extends `${Prefix}.${infer Rest}`
    ? Rest extends `${string}.${string}`
      ? never
      : Rest
    : never

type ShapePath<TS extends FormShape> =
  | (keyof TS['fields'] & string)
  | (keyof TS['groups'] & string)
  | (keyof TS['arrays'] & string)

type DirectChildKey<TS extends FormShape, Prefix extends string> = DirectOf<
  ShapePath<TS>,
  Prefix
>

type JoinPath<Prefix extends string, K extends string> = [Prefix] extends ['']
  ? K
  : `${Prefix}.${K}`

/**
 * The base `FormShape` uses `string` index keys on every axis. Keyed children
 * would collapse to `Record<string, EField>` (first branch of {@link LayoutNode}).
 * Unbranded / runtime trees keep plain `EGroup`.
 */
type IsConcreteFormShape<TS extends FormShape> = string extends
  | keyof TS['fields']
  | keyof TS['groups']
  | keyof TS['arrays']
  ? false
  : true

/** Enriched node at a `FormShape` path — field / nested group / array.
 * `Origin` is the tree-wide `facts.origin.schema` type (JSON Schema →
 * `JSONSchemaObject`, Zod → `ZodType`), not a per-path subschema (ADR 033). */
export type LayoutNode<
  TS extends FormShape,
  Path extends string,
  Origin = unknown,
> = Path extends keyof TS['fields'] & string
  ? EField<Origin>
  : Path extends keyof TS['groups'] & string
    ? LayoutGroup<TS, Path, Origin>
    : Path extends keyof TS['arrays'] & string
      ? EArray<Origin>
      : ENode<Origin>

/** Group handle whose `children` are the direct child names under `Prefix`. */
export type LayoutGroup<
  TS extends FormShape,
  Prefix extends string = '',
  Origin = unknown,
> = Omit<EGroup<Origin>, 'children'> & {
  children: Pretty<{
    [K in DirectChildKey<TS, Prefix>]: LayoutNode<
      TS,
      JoinPath<Prefix, K>,
      Origin
    >
  }>
}

/** Root of a `layout` callback: keyed children when `TS` is a concrete brand. */
export type LayoutRoot<TS extends FormShape = FormShape, Origin = unknown> =
  IsConcreteFormShape<TS> extends true
    ? LayoutGroup<TS, '', Origin>
    : EGroup<Origin>
