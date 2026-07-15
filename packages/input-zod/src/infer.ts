/**
 * Compile-time inference from Zod v4 schemas to data shapes and field paths —
 * the Zod sister of `@formframe/input-jsonschema`'s `infer.ts` (ADR 034/041 §4).
 *
 * The exported names/semantics match the JSON Schema front-end so a React
 * binding is identical modulo the import source (bd jsonschema-form-bh7). Two
 * divergences are intrinsic to Zod v4 and proven by type-level probe:
 *   • Descriptions live in the runtime `z.globalRegistry`, NOT the static type
 *     (`.describe()`/`.meta()` yield a type identical to the plain schema), so
 *     `HasDescription` is unknowable at compile time and degrades to `false`.
 *   • Enum arity (the radio-vs-select threshold) IS recoverable: `z.infer` gives
 *     the literal union and we count it, mirroring JSON Schema's `AtMost5`.
 *
 * Bounded coverage: object / array / primitive / enum / common wrappers. Anything
 * unresolved degrades to `unknown` rather than erroring.
 */

import type { z } from 'zod'
import type {
  ArrayNode,
  FieldControl,
  FieldNode,
  FieldPartsBase,
  GroupNode,
  ValidationError,
  WidgetName,
  WidgetToControlKind,
} from '@formframe/core'

/** Maximum nesting depth for {@link FieldPath} dot-path expansion. */
type FieldPathDepthLimit = 5
type DecrementDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
type NextDepth<D extends number> = DecrementDepth[D]

type JoinPath<Prefix extends string, Key extends string> = Prefix extends ''
  ? Key
  : `${Prefix}.${Key}`
type IndexedArrayPrefix<Prefix extends string> = `${Prefix}.${number}`

// ── Zod type-level navigation ──────────────────────────────────────────────
// Peel the value-preserving wrappers so navigation/kind see the core type. Value
// inference (`ValueAt`) keeps the wrapper so optional/default widen correctly.
type Unwrap<T> =
  T extends z.ZodOptional<infer I>
    ? Unwrap<I>
    : T extends z.ZodNullable<infer I>
      ? Unwrap<I>
      : T extends z.ZodDefault<infer I>
        ? Unwrap<I>
        : T extends z.ZodReadonly<infer I>
          ? Unwrap<I>
          : T

/** The `{ key: ZodType }` shape of an object schema (after unwrapping), else never. */
type ShapeOf<T> =
  Unwrap<T> extends z.ZodObject<infer S extends z.ZodRawShape> ? S : never
/** The element schema of an array schema (after unwrapping), else never. */
type ElementOf<T> = Unwrap<T> extends z.ZodArray<infer E> ? E : never

/** The sub-schema at a dot-path `P` within schema `S` (JIT: resolves per-`P`). A
 * `${number}` segment descends through the array element; unresolved is `unknown`. */
export type SchemaAt<
  S,
  P extends string,
> = P extends `${infer Head}.${infer Rest}`
  ? Head extends keyof ShapeOf<S>
    ? SchemaAt<ShapeOf<S>[Head], Rest>
    : Head extends `${number}`
      ? [ElementOf<S>] extends [never]
        ? unknown
        : SchemaAt<ElementOf<S>, Rest>
      : unknown
  : P extends keyof ShapeOf<S>
    ? ShapeOf<S>[P]
    : P extends `${number}`
      ? [ElementOf<S>] extends [never]
        ? unknown
        : ElementOf<S>
      : unknown

/** Classify a sub-schema's node kind (object/array/leaf) — the runtime `nodeType`. */
export type KindOf<T> =
  Unwrap<T> extends z.ZodObject<z.ZodRawShape>
    ? 'group'
    : Unwrap<T> extends z.ZodArray<z.ZodType>
      ? 'array'
      : 'field'

type FieldPathFromShape<
  Sh extends z.ZodRawShape,
  Prefix extends string,
  Depth extends number,
> = {
  [K in keyof Sh & string]:
    | JoinPath<Prefix, K>
    | FieldPathFromSchema<Sh[K], JoinPath<Prefix, K>, NextDepth<Depth>>
}[keyof Sh & string]

/**
 * Schema-relative dot-path union aligned with runtime `node.path` / validation
 * `error.path`. Object keys use dot notation; each array segment is a `${number}`
 * placeholder. Recursion is bounded by {@link FieldPathDepthLimit}.
 */
export type FieldPath<
  S,
  Prefix extends string = '',
  Depth extends number = FieldPathDepthLimit,
> = FieldPathFromSchema<S, Prefix, Depth>

type FieldPathFromSchema<
  T,
  Prefix extends string,
  Depth extends number,
> = Depth extends 0
  ? never
  : Unwrap<T> extends z.ZodObject<infer Sh extends z.ZodRawShape>
    ? FieldPathFromShape<Sh, Prefix, Depth>
    : Unwrap<T> extends z.ZodArray<infer El>
      ? Prefix extends ''
        ? never
        :
            | IndexedArrayPrefix<Prefix>
            | FieldPathFromSchema<
                El,
                IndexedArrayPrefix<Prefix>,
                NextDepth<Depth>
              >
      : never

type AllPaths<S> = FieldPath<S> & string

/** Leaf (field) paths of `S` — reject a group/array path at compile time. */
export type FieldPaths<S> = {
  [P in AllPaths<S>]: KindOf<SchemaAt<S, P>> extends 'field' ? P : never
}[AllPaths<S>]

/** Object (group) paths of `S`. */
export type GroupPaths<S> = {
  [P in AllPaths<S>]: KindOf<SchemaAt<S, P>> extends 'group' ? P : never
}[AllPaths<S>]

/** Array paths of `S`. */
export type ArrayPaths<S> = {
  [P in AllPaths<S>]: KindOf<SchemaAt<S, P>> extends 'array' ? P : never
}[AllPaths<S>]

/** The value type at a path (the form-state boundary) — `z.infer` of the resolved
 * sub-schema, so optional/default/nullable widen exactly as Zod parses them. */
export type ValueAt<S, P extends string> =
  SchemaAt<S, P> extends z.ZodType ? z.infer<SchemaAt<S, P>> : unknown

/** The enriched-node type at a path, kind-narrowed off the schema. */
export type NodeAt<S, P extends string> =
  KindOf<SchemaAt<S, P>> extends 'group'
    ? GroupNode<SchemaAt<S, P>>
    : KindOf<SchemaAt<S, P>> extends 'array'
      ? ArrayNode<SchemaAt<S, P>>
      : FieldNode<SchemaAt<S, P>>

// ── Stage A: facts→widget (enum arity is recoverable; mirrors JSON Schema) ───
type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never
type LastOf<U> =
  UnionToIntersection<U extends unknown ? () => U : never> extends () => infer R
    ? R
    : never
// Peel members one at a time (order-independent — only the COUNT is load-bearing).
type UnionToTuple<U, Last = LastOf<U>> = [U] extends [never]
  ? []
  : [...UnionToTuple<Exclude<U, Last>>, Last]
type AtMost5<N> = N extends 0 | 1 | 2 | 3 | 4 | 5 ? true : false

type EnumMemberCount<T> =
  Unwrap<T> extends z.ZodEnum<infer _E>
    ? UnionToTuple<z.infer<Unwrap<T>>>['length']
    : never

/** The DEFAULT widget a path resolves to (Stage A) — an enum splits radio (≤5)
 * vs select (>5) on Core's `OPTION_COUNT_THRESHOLD`; otherwise a plain input. */
export type DefaultWidgetAt<S, P extends string> =
  SchemaAt<S, P> extends z.ZodType
    ? [EnumMemberCount<SchemaAt<S, P>>] extends [never]
      ? 'input'
      : AtMost5<EnumMemberCount<SchemaAt<S, P>>> extends true
        ? 'radio'
        : 'select'
    : 'input'

// ── Front-end-AGNOSTIC composition (identical to input-jsonschema; a candidate
//    to hoist into a shared layer per bd jsonschema-form-bh7.3) ───────────────
/** No-overrides marker: an empty per-path widget-override map. */
export type NoOverrides = Record<never, WidgetName>

/** The forward-compat seam: the widget at `P` is `Overrides[P]` when present, else
 * the default rule. */
export type WidgetAt<
  S,
  P extends string,
  Overrides extends Record<string, WidgetName> = NoOverrides,
> = P extends keyof Overrides ? Overrides[P] : DefaultWidgetAt<S, P>

/** The control archetype at a path — routed through Core's shared Stage B table. */
export type ControlKindAt<
  S,
  P extends string,
  Overrides extends Record<string, WidgetName> = NoOverrides,
> = WidgetToControlKind<WidgetAt<S, P, Overrides>>

/** The pre-narrowed `FieldControl` union member at a path. */
export type ControlAt<
  S,
  P extends string,
  Overrides extends Record<string, WidgetName> = NoOverrides,
> = Extract<FieldControl, { kind: ControlKindAt<S, P, Overrides> }>

/** Whether the sub-schema at `P` declares a description. ALWAYS `false` for Zod:
 * descriptions live in the runtime `z.globalRegistry`, invisible to the type
 * (proven — `.describe()`/`.meta()` don't change the static type). */
export type HasDescription<S, P extends string> = [S, P] extends [never, never]
  ? true
  : false

type LabelData = FieldPartsBase['label']
type TextData = NonNullable<FieldPartsBase['description']>

/**
 * The parts bag derived per field path. `Control` is the pre-narrowed member for
 * the path's widget; `Errors` is runtime validation state.
 *
 * `Description` is an OPTIONAL (possibly-undefined) slot for Zod — unlike JSON
 * Schema, which can prove presence from the literal, Zod keeps descriptions in a
 * runtime registry invisible to the type ({@link HasDescription} is always
 * `false`). The runtime part component is always in the bag and self-noops when a
 * node has no description, so the honest static model is "always placeable, may
 * render nothing" → guard it before use.
 */
export type FieldPartsFor<
  S,
  P extends string,
  Overrides extends Record<string, WidgetName> = NoOverrides,
> = {
  Label: LabelData
  Control: ControlAt<S, P, Overrides>
  Errors: ValidationError[]
  Description?: TextData
}

/** The parts bag for a group/array path (captions only). `Description` is the same
 * optional slot as fields — Zod cannot prove group description presence either.
 * (`S`/`P` are kept for signature parity with the JSON Schema front-end; the
 * shape doesn't depend on them since Zod descriptions are runtime-only.) */
export type GroupPartsFor<S, P extends string> = [S, P] extends [never, never]
  ? never
  : {
      Label: TextData
      Description?: TextData
    }

/** Zod cannot prove description presence (runtime-registry-only), so the neutral
 * {@link DescriptionState} is always `'optional'` — an always-placeable slot that
 * may render nothing (the JSON Schema front-end reports `'present' | 'absent'`).
 * (`S`/`P` are kept for signature parity; the result doesn't depend on them.) */
export type DescriptionStateOf<S, P extends string> = [S, P] extends [
  never,
  never,
]
  ? 'absent'
  : 'optional'

/**
 * The resolved {@link FormShape} for a Zod schema (ADR 048 §2): the
 * schema-specific facts per path — `value`, `widget`, `description` state —
 * eagerly mapped over the schema's own paths (enum arity narrows `widget`;
 * `description` is uniformly `'optional'`). Byte-for-byte the same SHAPE as the
 * JSON Schema `FormShapeOf` — the divergence is entirely inside the per-path
 * primitives — which is exactly why React binds off it without importing either
 * front-end. `zodToTree` brands its tree with this.
 *
 * Type-resolution cost is the same profile as the JSON Schema sister
 * (`input-jsonschema`'s `FormShapeOf`, measured): linear in path count,
 * ~6 instantiations/path, no measurable check-time impact — the eager half is
 * cheap and the widget→control→parts composition stays lazy in Core.
 */
export type FormShapeOf<S> = {
  fields: {
    [P in FieldPaths<S>]: {
      value: ValueAt<S, P>
      widget: WidgetAt<S, P>
      description: DescriptionStateOf<S, P>
    }
  }
  groups: {
    [P in GroupPaths<S>]: { description: DescriptionStateOf<S, P> }
  }
  arrays: {
    [P in ArrayPaths<S>]: { description: DescriptionStateOf<S, P> }
  }
}
