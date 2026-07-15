/**
 * Compile-time inference from JSON Schema literals to data shapes and field paths.
 *
 * Bounded coverage: common object/array/primitive/enum/const constructs only.
 * Unsupported keywords and schema shapes degrade to `unknown` rather than erroring.
 */

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

type RequiredKeys<S> = S extends { readonly required: readonly (infer K)[] }
  ? K extends string
    ? K
    : never
  : never

type InferObjectData<P extends Record<string, unknown>, Req extends string> = {
  [K in keyof P & string as K extends Req ? K : never]: InferSchemaData<P[K]>
} & {
  [K in keyof P & string as K extends Req ? never : K]?: InferSchemaData<P[K]>
}

type InferSchemaData<S> = S extends { readonly const: infer C }
  ? C
  : S extends { readonly enum: readonly (infer E)[] }
    ? E
    : S extends {
          readonly type: 'object'
          readonly properties: infer P extends Record<string, unknown>
        }
      ? InferObjectData<P, RequiredKeys<S>>
      : S extends {
            readonly properties: infer P extends Record<string, unknown>
          }
        ? InferObjectData<P, RequiredKeys<S>>
        : S extends {
              readonly type: 'array'
              readonly items: readonly unknown[]
            }
          ? unknown
          : S extends { readonly type: 'array'; readonly items: infer I }
            ? readonly InferSchemaData<I>[]
            : S extends { readonly type: 'string' }
              ? string
              : S extends { readonly type: 'number' | 'integer' }
                ? number
                : S extends { readonly type: 'boolean' }
                  ? boolean
                  : S extends { readonly type: 'null' }
                    ? null
                    : unknown

type FieldPathFromProperties<
  P extends Record<string, unknown>,
  Prefix extends string,
  Depth extends number,
> = {
  [K in keyof P & string]:
    | JoinPath<Prefix, K>
    | FieldPathFromSchema<P[K], JoinPath<Prefix, K>, NextDepth<Depth>>
}[keyof P & string]

type FieldPathFromArrayItems<I, Prefix extends string, Depth extends number> =
  | IndexedArrayPrefix<Prefix>
  | FieldPathFromSchema<I, IndexedArrayPrefix<Prefix>, NextDepth<Depth>>

type FieldPathFromSchema<
  S,
  Prefix extends string = '',
  Depth extends number = FieldPathDepthLimit,
> = Depth extends 0
  ? never
  : S extends {
        readonly type: 'object'
        readonly properties: infer P extends Record<string, unknown>
      }
    ? FieldPathFromProperties<P, Prefix, Depth>
    : S extends { readonly properties: infer P extends Record<string, unknown> }
      ? FieldPathFromProperties<P, Prefix, Depth>
      : S extends { readonly type: 'array'; readonly items: infer I }
        ? Prefix extends ''
          ? never
          : FieldPathFromArrayItems<I, Prefix, Depth>
        : never

/**
 * Maps a `const`-typed JSON Schema literal to its corresponding data type.
 *
 * Supports: object (with `properties` / `required`), array (single-schema `items`),
 * `string` / `number` / `integer` / `boolean` / `null`, `enum`, and `const`.
 * Tuple `items`, `$ref`, and combiners (`allOf` / `anyOf` / `oneOf`) resolve to
 * `unknown`.
 */
export type InferData<S> = InferSchemaData<S>

/**
 * Schema-relative dot-path union aligned with runtime `node.path` / validation
 * `error.path` (ADR 018/037). Object keys use dot notation; each array segment is a
 * `${number}` placeholder matching concrete indexed paths at runtime (e.g.
 * `contacts.0.email`, not `contacts.email`).
 *
 * - Array of objects: `` `users.${number}.name` ``, plus `` `users.${number}` ``
 * - Array of primitives: `` `tags.${number}` ``
 *
 * Recursion is bounded by {@link FieldPathDepthLimit}.
 */
export type FieldPath<S> = FieldPathFromSchema<S>

// ═══════════════════════════════════════════════════════════════════════════
// Path-narrowed presentation types (ADR 041 §4)
//
// The schema-owning half of the customize narrowing: for a dot-path `P` in a
// const schema `S`, resolve the sub-schema, its node kind, its value, and — via
// the shared Stage B table in Core — its control archetype and present part set.
// Framework-agnostic (Core-only deps): a React binding maps these DATA payloads
// onto the `parts` component slots; nothing here imports a framework.
//
// The types are kept honest against the runtime `present()` pipeline by the
// paired type-level + runtime conformance tests (infer.control.test.ts), the
// "bounded drift" strategy for Stage A (ADR 041 §4).
// ═══════════════════════════════════════════════════════════════════════════

type PropsOf<S> = S extends { readonly properties: infer Q } ? Q : never

/** The sub-schema at a dot-path `P` within schema `S` (JIT: resolves per-`P`). A
 * `${number}` segment descends through `items`; anything unresolved is `unknown`. */
export type SchemaAt<
  S,
  P extends string,
> = P extends `${infer Head}.${infer Rest}`
  ? Head extends keyof PropsOf<S>
    ? SchemaAt<PropsOf<S>[Head], Rest>
    : Head extends `${number}`
      ? S extends { readonly items: infer I }
        ? SchemaAt<I, Rest>
        : unknown
      : unknown
  : P extends keyof PropsOf<S>
    ? PropsOf<S>[P]
    : P extends `${number}`
      ? S extends { readonly items: infer I }
        ? I
        : unknown
      : unknown

/** Classify a sub-schema's node kind (object/array/leaf) — the runtime `nodeType`
 * for the common cases. (Scalar-choice arrays that Core collapses to one leaf are
 * an edge the default rule handles at runtime; this mirrors the structural kind.) */
export type KindOf<S> = S extends { readonly type: 'object' }
  ? 'group'
  : S extends { readonly properties: unknown }
    ? 'group'
    : S extends { readonly type: 'array' }
      ? 'array'
      : 'field'

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

/** The value type at a path (the form-state boundary). */
export type ValueAt<S, P extends string> = InferData<SchemaAt<S, P>>

/** The enriched-node type at a path, kind-narrowed off the schema. */
export type NodeAt<S, P extends string> =
  KindOf<SchemaAt<S, P>> extends 'group'
    ? GroupNode<SchemaAt<S, P>>
    : KindOf<SchemaAt<S, P>> extends 'array'
      ? ArrayNode<SchemaAt<S, P>>
      : FieldNode<SchemaAt<S, P>>

// --- Stage A: facts→widget, mirroring `defaultPresentation` (bounded drift) -----
// A choice field splits on Core's `OPTION_COUNT_THRESHOLD` (5): ≤5 → radio, else
// select. Both sides map to DIFFERENT control kinds, so the count is load-bearing.
type AtMost5<T extends readonly unknown[]> = T extends readonly [
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  ...unknown[],
]
  ? false
  : true
type EnumOf<S> = S extends { readonly enum: infer E extends readonly unknown[] }
  ? E
  : never

/** The DEFAULT widget a path resolves to (Stage A) — mirrors `defaultPresentation`
 * for the scalar cases the const schema can express (enum → radio/select by count;
 * otherwise a plain input). Kept honest by gate conformance (ADR 041 §4). */
export type DefaultWidgetAt<S, P extends string> =
  SchemaAt<S, P> extends {
    readonly enum: readonly unknown[]
  }
    ? AtMost5<EnumOf<SchemaAt<S, P>>> extends true
      ? 'radio'
      : 'select'
    : 'input'

/** No-overrides marker: `Record<never, WidgetName>` = an empty override map, so
 * `WidgetAt` is pure default rule today (ADR 041 §4, `Overrides = {}`). */
export type NoOverrides = Record<never, WidgetName>

/**
 * The forward-compat seam (ADR 041 §4): the widget at `P` is the consumer's
 * `Overrides[P]` when present, else the default rule. Today `Overrides` defaults
 * to empty, so this is pure default-rule fidelity; a typed per-path resolver
 * later supplies an `Overrides` map and the control type re-narrows with NO
 * change below (bd 4bv builds on this seam).
 */
export type WidgetAt<
  S,
  P extends string,
  Overrides extends Record<string, WidgetName> = NoOverrides,
> = P extends keyof Overrides ? Overrides[P] : DefaultWidgetAt<S, P>

/** The control archetype at a path — routed through the shared Stage B table. */
export type ControlKindAt<
  S,
  P extends string,
  Overrides extends Record<string, WidgetName> = NoOverrides,
> = WidgetToControlKind<WidgetAt<S, P, Overrides>>

/** The pre-narrowed `FieldControl` union member at a path — so `control.attrs`
 * is the right shape with no runtime `kind` guard (ADR 041 §4/§5). */
export type ControlAt<
  S,
  P extends string,
  Overrides extends Record<string, WidgetName> = NoOverrides,
> = Extract<FieldControl, { kind: ControlKindAt<S, P, Overrides> }>

/** Whether the sub-schema at `P` declares a description (part presence). */
export type HasDescription<S, P extends string> =
  SchemaAt<S, P> extends {
    readonly description: string
  }
    ? true
    : false

/** JSON Schema proves description presence from the literal, so the neutral
 * {@link DescriptionState} is a definite `'present' | 'absent'` per path. */
export type DescriptionStateOf<S, P extends string> =
  HasDescription<S, P> extends true ? 'present' : 'absent'

/**
 * The resolved {@link FormShape} for a JSON Schema (ADR 042 §2): the
 * schema-specific facts per path — `value`, `widget`, `description` state —
 * eagerly mapped over the schema's own paths. The widget→control→parts
 * composition stays neutral in Core and is instantiated lazily when a handler
 * indexes a specific path. `jsonSchemaToTree` brands its tree with this so React
 * binds off it generically.
 *
 * Type-resolution cost (measured, not assumed): materializing this map is
 * **linear in path count, ~6 type-instantiations/path**, with no measurable
 * `tsc` check-time impact. A/B via `--extendedDiagnostics`: full `FormShapeOf`
 * added +1203 instantiations (+5.8%) over baseline for a ~195-path schema and
 * +4083 (+8.8%) for a ~670-field one (3.6× paths → 3.4× cost — no superlinear
 * blowup), both flat on check time. The eager half here is the cheap half; the
 * expensive `FieldControl` extraction + parts assembly (Core) stays lazy, so real
 * cost tracks the handful of paths you customize, not the whole schema.
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

// The narrowed DATA payload each present part hands its render prop. Core owns
// these shapes; a React binding wraps each as a `PartComponent<data>`.
type LabelData = FieldPartsBase['label']
type TextData = NonNullable<FieldPartsBase['description']>

/**
 * The parts bag DERIVED per field path (ADR 041 §4): `Description` exists only
 * when the schema declares one; `Control` is the pre-narrowed member for the
 * path's widget. `Errors` is runtime validation state (`ValidationError[]`).
 */
export type FieldPartsFor<
  S,
  P extends string,
  Overrides extends Record<string, WidgetName> = NoOverrides,
> = {
  Label: LabelData
  Control: ControlAt<S, P, Overrides>
  Errors: ValidationError[]
} & (HasDescription<S, P> extends true ? { Description: TextData } : object)

/** The parts bag for a group/array path (captions only). */
export type GroupPartsFor<S, P extends string> = {
  Label: TextData
} & (HasDescription<S, P> extends true ? { Description: TextData } : object)
