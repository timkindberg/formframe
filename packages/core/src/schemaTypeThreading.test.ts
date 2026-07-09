// Type-level tests for schema-type `S` threading (bd wo8, ADR 033 §4).
//
// These are TYPE tests: every assertion is a `expectTypeOf<Type>()` on a TYPE
// (never on a runtime value), so nothing executes and the file has no runtime
// dependencies. They are enforced by the gate's `tsc --noEmit -p tsconfig.test.json`
// pass — a wrong assertion is a compile error — yet run as empty vitest cases.
//
// What wo8 guarantees, and what it deliberately does NOT:
//
//   * GUARANTEE — `S` is PRESERVED (not erased to `unknown`) across `walk`, the
//     query methods, and the continuation engine. A consumer that pins `S` (the
//     JSON Schema front-end pins `JSONSchemaObject`) reads a typed
//     `facts.origin.schema` on every handler/resolver node instead of `unknown`.
//   * NON-GOAL — per-node NARROWING. `S` is UNIFORM: every node — root, nested
//     group, deep leaf — carries the SAME `S`. A leaf does NOT get its own
//     subschema type. That is structurally impossible via `walk` (homogeneous
//     recursion over `AnyNode<S>[]` has a single element type) and would require a
//     path-literal-indexed accessor over the whole schema literal (the
//     `FieldPath`/`InferData` family) — an opt-in front-end feature, not wo8.

import { describe, it, expectTypeOf } from 'vitest'
import type {
  AnyNode,
  ArrayItemNode,
  ArrayNode,
  FieldNode,
  GroupNode,
  WalkHandlers,
  ENode,
  EField,
  EGroup,
  EArray,
  Resolver,
  Continuation,
  AnyGroupNode,
  AnyTreeNode,
  AnySchemaResolver,
} from './index'

// A branded stand-in for a front-end's origin schema. Core is schema-agnostic, so
// the tests never import a real schema type — an opaque brand proves threading
// without coupling Core to JSON Schema or Zod.
interface FakeSchema {
  readonly brand: 'fake-schema'
}
type R = string // an arbitrary render-result type for the continuation

// The first positional param type of a walk handler for kind `K` at schema `S`.
type WalkParam<K extends keyof WalkHandlers<R, FakeSchema>, S> = Parameters<
  NonNullable<WalkHandlers<R, S>[K]>
>[0]

// Whole-type (NON-distributive) assignability, for variance assertions. The tuple
// wrap stops a union like `AnyNode<S>` from distributing, so we test the union as
// a whole (matching how assignment actually behaves).
type Assignable<A, B> = [A] extends [B] ? true : false

describe('walk threads S (bd wo8)', () => {
  it('each handler receives its node kind carrying the SAME S', () => {
    expectTypeOf<WalkParam<'field', FakeSchema>>().toEqualTypeOf<
      FieldNode<FakeSchema>
    >()
    expectTypeOf<WalkParam<'group', FakeSchema>>().toEqualTypeOf<
      GroupNode<FakeSchema>
    >()
    expectTypeOf<WalkParam<'array', FakeSchema>>().toEqualTypeOf<
      ArrayNode<FakeSchema>
    >()
    expectTypeOf<WalkParam<'arrayItem', FakeSchema>>().toEqualTypeOf<
      ArrayItemNode<FakeSchema>
    >()
  })

  it('the handler node exposes a TYPED origin.schema (not unknown)', () => {
    expectTypeOf<
      WalkParam<'field', FakeSchema>['facts']['origin']['schema']
    >().toEqualTypeOf<FakeSchema>()
  })

  it('the second handler arg is WalkHandlers<R, S> (S propagates to re-entry)', () => {
    expectTypeOf<
      Parameters<NonNullable<WalkHandlers<R, FakeSchema>['field']>>[1]
    >().toEqualTypeOf<WalkHandlers<R, FakeSchema>>()
  })

  it('S defaults to unknown when unspecified (back-compat with untyped callers)', () => {
    expectTypeOf<WalkHandlers<R>>().toEqualTypeOf<WalkHandlers<R, unknown>>()
    expectTypeOf<
      WalkParam<'field', unknown>['facts']['origin']['schema']
    >().toEqualTypeOf<unknown>()
  })
})

describe('query methods thread S', () => {
  it('getField / getAllFields return FieldNode<S>', () => {
    expectTypeOf<ReturnType<GroupNode<FakeSchema>['getField']>>().toEqualTypeOf<
      FieldNode<FakeSchema> | undefined
    >()
    expectTypeOf<
      ReturnType<GroupNode<FakeSchema>['getAllFields']>
    >().toEqualTypeOf<FieldNode<FakeSchema>[]>()
  })

  it('getItem returns ArrayItemNode<S>', () => {
    expectTypeOf<ReturnType<ArrayNode<FakeSchema>['getItem']>>().toEqualTypeOf<
      ArrayItemNode<FakeSchema>
    >()
  })
})

describe('S is UNIFORM, not narrowed per node (the wo8 boundary)', () => {
  // The direct answer to "does a nested leaf get its own subschema type?": no.
  // Every accessor at every depth yields the SAME `S`. Per-node narrowing would
  // need a path-literal accessor (`getField<'a.b.c'>()` → subschema-at-path), a
  // separate front-end feature layered on FieldPath/InferData — not wo8.
  it('children carry the same S as the root', () => {
    expectTypeOf<GroupNode<FakeSchema>['children'][number]>().toEqualTypeOf<
      AnyNode<FakeSchema>
    >()
  })

  it('getField yields the uniform FieldNode<S>, never a subschema', () => {
    // `getField` takes a runtime `string`, so it CANNOT index a literal path into
    // the schema — it returns the uniform node type by construction.
    expectTypeOf<ReturnType<GroupNode<FakeSchema>['getField']>>().toEqualTypeOf<
      FieldNode<FakeSchema> | undefined
    >()
  })
})

describe('continuation engine threads S (bd wo8)', () => {
  it('Resolver<R, S> receives ENode<R, S>', () => {
    expectTypeOf<Parameters<Resolver<R, FakeSchema>>[0]>().toEqualTypeOf<
      ENode<R, FakeSchema>
    >()
  })

  it('an enriched field exposes a typed origin.schema', () => {
    expectTypeOf<
      EField<R, FakeSchema>['facts']['origin']['schema']
    >().toEqualTypeOf<FakeSchema>()
  })

  it('enriched container children and child() carry <S>', () => {
    expectTypeOf<EGroup<R, FakeSchema>['children'][string]>().toEqualTypeOf<
      ENode<R, FakeSchema>
    >()
    expectTypeOf<ReturnType<EGroup<R, FakeSchema>['child']>>().toEqualTypeOf<
      ENode<R, FakeSchema> | undefined
    >()
  })

  it('EArray.renderItem accepts ArrayItemNode<S>', () => {
    expectTypeOf<
      Parameters<EArray<R, FakeSchema>['renderItem']>[0]
    >().toEqualTypeOf<ArrayItemNode<FakeSchema>>()
  })

  it('ENode / Resolver default S to unknown', () => {
    expectTypeOf<ENode<R>>().toEqualTypeOf<ENode<R, unknown>>()
    expectTypeOf<Resolver<R>>().toEqualTypeOf<Resolver<R, unknown>>()
    expectTypeOf<
      EField<R>['facts']['origin']['schema']
    >().toEqualTypeOf<unknown>()
  })

  it('enrich/resolve preserve S from the node + resolver', () => {
    expectTypeOf<Continuation<R>['enrich']>().toEqualTypeOf<
      <S = unknown>(core: AnyNode<S>, resolver: Resolver<R, S>) => ENode<R, S>
    >()
    expectTypeOf<Continuation<R>['resolve']>().toEqualTypeOf<
      <S = unknown>(core: AnyNode<S>, resolver: Resolver<R, S>) => R
    >()
  })
})

describe('variance + boundary aliases (why AnyGroupNode/AnyTreeNode exist)', () => {
  it('FieldNode is COVARIANT in S — a specialized field widens to unknown', () => {
    // S appears only in the covariant `facts.origin.schema` position.
    expectTypeOf<
      Assignable<FieldNode<FakeSchema>, FieldNode<unknown>>
    >().toEqualTypeOf<true>()
  })

  it('GroupNode / ArrayNode / AnyNode are INVARIANT in S', () => {
    // S sits in a covariant return (`getField(): FieldNode<S>`) AND a contravariant
    // param (`walk(WalkHandlers<R, S>)`), so a specialized tree is NOT assignable to
    // the unknown-typed one — the exact friction the boundary aliases resolve.
    expectTypeOf<
      Assignable<GroupNode<FakeSchema>, GroupNode<unknown>>
    >().toEqualTypeOf<false>()
    expectTypeOf<
      Assignable<ArrayNode<FakeSchema>, ArrayNode<unknown>>
    >().toEqualTypeOf<false>()
    expectTypeOf<
      Assignable<AnyNode<FakeSchema>, AnyNode<unknown>>
    >().toEqualTypeOf<false>()
  })

  it('the boundary aliases accept a front-end-specialized tree', () => {
    expectTypeOf<
      Assignable<GroupNode<FakeSchema>, AnyGroupNode>
    >().toEqualTypeOf<true>()
    expectTypeOf<
      Assignable<AnyNode<FakeSchema>, AnyTreeNode>
    >().toEqualTypeOf<true>()
  })

  it('AnySchemaResolver bridges the boundary both ways', () => {
    // A resolver that ignores origin.schema (Resolver<R, any>) is usable at any S.
    expectTypeOf<
      Assignable<AnySchemaResolver<R>, Resolver<R, FakeSchema>>
    >().toEqualTypeOf<true>()
    expectTypeOf<
      Assignable<AnySchemaResolver<R>, Resolver<R>>
    >().toEqualTypeOf<true>()
  })
})
