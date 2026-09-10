// FormShape-keyed layout handles (ADR 055).
//
// A tree carries its `FormShape` brand (ADR 048) and both doors read it — the
// bound `SchemaFields` from `useFormTree` and the unbound one, off its `form`
// prop. `layout` used to be typed as plain `EGroup` (`children: Record<string,
// ENode>`). That was a typing hole, not a missing factory skin: the primitive
// `root.children.x` just was not indexed by the brand. This file is the overlay
// — runtime handles stay `EGroup`; the layout callback's `root` is a phantom
// narrowing of `children` to direct child names at a path prefix. Child
// groups/arrays reuse the public `EGroup` / `EArray` aliases so Quick Info is
// `EGroup<Origin>`, not a second `type EGroup = …` (`EGroup$1`); a keyed field
// gets {@link LayoutField}, an `EField` whose control the brand already narrowed.
// `Origin` is the tree-wide `facts.origin.schema` type, not a per-path subschema.

import type { ControlForWidget, FormShape } from '@formframe/core'
import type { EArray, EArrayItem, EField, EGroup } from './enriched'

type Pretty<T> = { [K in keyof T]: T[K] } & {}

// ---------------------------------------------------------------------------
// Kind-unknown handles — the guard-free half of the overlay.
//
// A keyed path resolves to ONE kind (`EField` / `LayoutGroup` / `EArray`), so
// branded layouts need no narrowing. Two places genuinely cannot know the kind:
// an unbranded (runtime-door) tree, and a dynamic `child(path)` lookup. Typing
// those as Core's `ENode` union forced a `node.isGroup ? … : null` ternary
// before you could touch `children` or `parts` — a guard the consumer cannot
// act on differently anyway, since the re-entry components are already
// null-safe (`<Default of={undefined}/>` renders nothing).
//
// So instead of a union of four disjoint handles, this is a union of four
// handles that each carry the OTHER kinds' keys typed `undefined`. Unnarrowed
// access compiles and yields `T | undefined` (`node.parts.addButton`,
// `node.children?.street`); `if (node.isArray)` still narrows, because the
// discriminants are untouched. Keys come off the union itself, so a new
// kind-only member on a Core handle is covered without editing a list.
// ---------------------------------------------------------------------------

type KeysOfUnion<T> = T extends unknown ? keyof T : never

/** `T` plus every sibling-kind key it lacks, typed `undefined`. */
type WithAbsent<T, All extends PropertyKey> = T & {
  [K in Exclude<All, keyof T>]?: undefined
}

type AnyKind<Origin> =
  | EField<Origin>
  | EGroup<Origin>
  | EArray<Origin>
  | EArrayItem<Origin>

type NodeKey<Origin> = KeysOfUnion<AnyKind<Origin>>
type PartKey<Origin> = KeysOfUnion<AnyKind<Origin>['parts']>

type AbsentParts<N extends { parts: object }, Origin> = WithAbsent<
  N['parts'],
  PartKey<Origin>
>

type AnyKindLeaf<N extends { parts: object }, Origin> = WithAbsent<
  Omit<N, 'parts'> & { parts: AbsentParts<N, Origin> },
  NodeKey<Origin>
>

/** A container whose own `children` / `child` stay kind-unknown too. */
type AnyKindBranch<
  N extends { parts: object; children: unknown; child: unknown },
  Origin,
> = WithAbsent<
  Omit<N, 'parts' | 'children' | 'child'> & {
    parts: AbsentParts<N, Origin>
    children: Record<string, AnyKindNode<Origin>>
    child(relativePath: string): AnyKindNode<Origin> | undefined
  },
  NodeKey<Origin>
>

/** Group handle of unknown kind-shape — the unbranded `layout` root. */
export type AnyKindGroup<Origin = unknown> = AnyKindBranch<
  EGroup<Origin>,
  Origin
>

/** A handle whose kind is not known at compile time (runtime door, `child()`). */
export type AnyKindNode<Origin = unknown> =
  | AnyKindLeaf<EField<Origin>, Origin>
  | AnyKindGroup<Origin>
  | AnyKindBranch<EArray<Origin>, Origin>
  | AnyKindBranch<EArrayItem<Origin>, Origin>

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
 * Unbranded / runtime trees fall back to {@link AnyKindGroup}.
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
  ? LayoutField<TS, Path, Origin>
  : Path extends keyof TS['groups'] & string
    ? LayoutGroup<TS, Path, Origin>
    : Path extends keyof TS['arrays'] & string
      ? EArray<Origin>
      : AnyKindNode<Origin>

/**
 * Field handle at a keyed `FormShape` path, with `parts.control` narrowed to the
 * archetype the brand's widget resolves to (#176).
 *
 * The floor keeps `parts.control` a four-member union on purpose: `FieldNode` is
 * one interface with `widget` as a resolved label, not a discriminant, so a
 * function intercept — which fires for every node — cannot know more (ADR 029
 * §5). A keyed path can: `TS['fields'][Path]['widget']` is a literal, and Core's
 * `ControlForWidget` already maps it to the archetype. Narrowing here is what
 * drops the `c.kind` guard from
 * `<Default of={root.children.username} parts={{ control: (c) => …c.attrs }} />`,
 * matching the typed-rules door (`FieldPartsData`). Widget overrides re-narrow
 * for free: `useFormTree` re-brands `form` through `ApplyWidgetOverrides`.
 *
 * `Extract` runs against the ENRICHED control (each union member already
 * `& { Default(): R }`), so the picked member keeps its re-entry point.
 */
export type LayoutField<
  TS extends FormShape,
  Path extends keyof TS['fields'] & string,
  Origin = unknown,
> = Omit<EField<Origin>, 'parts'> & {
  parts: Omit<EField<Origin>['parts'], 'control'> & {
    control: Extract<
      EField<Origin>['parts']['control'],
      ControlForWidget<TS['fields'][Path]['widget']>
    >
  }
}

/** Group handle whose `children` are the direct child names under `Prefix`.
 * Keyed children are exact; `child(path)` is a dynamic lookup, so it hands back
 * a kind-unknown handle rather than forcing a cast. */
export type LayoutGroup<
  TS extends FormShape,
  Prefix extends string = '',
  Origin = unknown,
> = Omit<EGroup<Origin>, 'children' | 'child'> & {
  children: Pretty<{
    [K in DirectChildKey<TS, Prefix>]: LayoutNode<
      TS,
      JoinPath<Prefix, K>,
      Origin
    >
  }>
  child(relativePath: string): AnyKindNode<Origin> | undefined
}

/** Root of a `layout` callback: keyed children when `TS` is a concrete brand. */
export type LayoutRoot<TS extends FormShape = FormShape, Origin = unknown> =
  IsConcreteFormShape<TS> extends true
    ? LayoutGroup<TS, '', Origin>
    : AnyKindGroup<Origin>
