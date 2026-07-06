/**
 * Compile-time inference from JSON Schema literals to data shapes and field paths.
 *
 * Bounded coverage: common object/array/primitive/enum/const constructs only.
 * Unsupported keywords and schema shapes degrade to `unknown` rather than erroring.
 */

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
 * `issue.path` (ADR 018). Object keys use dot notation; each array segment is a
 * `${number}` placeholder matching concrete indexed paths at runtime (e.g.
 * `contacts.0.email`, not `contacts.email`).
 *
 * - Array of objects: `` `users.${number}.name` ``, plus `` `users.${number}` ``
 * - Array of primitives: `` `tags.${number}` ``
 *
 * Recursion is bounded by {@link FieldPathDepthLimit}.
 */
export type FieldPath<S> = FieldPathFromSchema<S>
