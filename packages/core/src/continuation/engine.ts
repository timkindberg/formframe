// The continuation engine (ADR 014) — Core's generalization of `walk` (ADR 005).
//
// `walk<R>` folds the tree eagerly with handler-inheritance; this is the same
// fold made *re-entrant*: every node is handed to a `resolver` that may hijack
// it or call back in (`Default`/`Children`/`child`/`parts.X.Default`). That is
// the continuation contract (ADR 010), and it lives here — front-end-agnostic,
// generic over the result type `R` — because it is identical for every renderer.
//
// What the engine owns: enrichment (attaching the re-entry points to a node),
// the recursion, and **scoping** — the active resolver is threaded as a plain
// parameter down the fold. What an adapter supplies (the `ContinuationAdapter`)
// is only the `R`-specific default template-set + how to `combine` children.
//
// The pivotal finding the second implementation forced (ADR 008): React's
// Context was incidental, not essential. Because each node's `Default`/`Children`
// closes over the resolver at enrich time, a lazily-rendered `<node.Default/>`
// still sees the correct (possibly scoped) resolver with no Context — exactly
// what vanilla gets from parameter threading. Eager string fold and lazy React
// fold are the same algorithm; conformance keeps them honest.

import type {
  AnyNode,
  ContainerNode,
  FieldNode,
  GroupNode,
  ArrayNode,
  ArrayItemNode,
  InputFieldNode,
  SelectFieldNode,
} from '../parser/nodeTypes'

// ---------------------------------------------------------------------------
// Enriched node types — the Core form node + the continuation re-entry points,
// generic over the renderer's result type `R`.
// ---------------------------------------------------------------------------

/** Each object-valued part gains a `Default(): R`; primitive parts pass through. */
type EnrichPart<T, R> = T extends object ? T & { Default(): R } : T
type EnrichedParts<P, R> = { [K in keyof P]: EnrichPart<P[K], R> }

/** Override individual parts of a node; each receives the enriched part. */
export type PartsOverrides<P, R> = {
  [K in keyof P]?: (part: EnrichPart<NonNullable<P[K]>, R>) => R
}

/**
 * Enriched field — a leaf: parts + `Default`, no children.
 *
 * Distributive over the widget-discriminated `FieldNode` union (ADR 012): each
 * variant's parts/overrides are keyed by *its own* parts, so narrowing on
 * `node.widget` reaches `input` (input widget) or `select` (select widgets).
 */
type EFieldOf<N extends FieldNode, R> = Omit<N, 'parts'> & {
  parts: EnrichedParts<N['parts'], R>
  Default(opts?: { parts?: PartsOverrides<N['parts'], R> }): R
}
export type EInputField<R> = EFieldOf<InputFieldNode, R>
export type ESelectField<R> = EFieldOf<SelectFieldNode, R>
export type EField<R> = EInputField<R> | ESelectField<R>

/** Enriched container — parts + children + re-entry points. */
type EContainerOf<N extends ContainerNode, R> = Omit<N, 'parts' | 'children'> & {
  parts: EnrichedParts<N['parts'], R>
  /** Children keyed by last path segment — `node.children.street.Default`. */
  children: Record<string, ENode<R>>
  /** Dynamic/relative child lookup (not usable as a JSX tag). */
  child(relativePath: string): ENode<R> | undefined
  /** Render all child nodes through the resolver. */
  Children(): R
  Default(opts?: {
    parts?: PartsOverrides<N['parts'], R>
    renderNode?: Resolver<R>
  }): R
}
export type EGroup<R> = EContainerOf<GroupNode, R>
export type EArray<R> = EContainerOf<ArrayNode, R>
export type EArrayItem<R> = EContainerOf<ArrayItemNode, R>

export type ENode<R> = EField<R> | EGroup<R> | EArray<R> | EArrayItem<R>

/** Per-node hijack: return a custom `R`, or re-enter via `node.Default()`. */
export type Resolver<R> = (node: ENode<R>) => R

// ---------------------------------------------------------------------------
// Adapter — the only `R`-specific surface a renderer must supply.
// ---------------------------------------------------------------------------

/** A child's result paired with a stable key (React needs keys; others ignore). */
export interface ChildResult<R> {
  key: string
  node: R
}

/** Loosely-typed part-override map as seen by the adapter (precise at call site). */
type PartOverrideMap<R> = Record<string, (part: never) => R>

export interface ContinuationAdapter<R> {
  /** Render a field's default: compose its parts (honoring `overrides`). */
  field(node: EField<R>, overrides?: PartOverrideMap<R>): R
  /** Render a non-root group's default, given already-rendered `children`. */
  group(node: EGroup<R>, children: R): R
  /** Render a single part's default markup. */
  part(name: string, data: object): R
  /** Combine child results into one `R` (React: keyed fragment; vanilla: join). */
  combine(children: ChildResult<R>[]): R
}

export interface Continuation<R> {
  /** Wrap a Core node with the continuation re-entry points. */
  enrich(core: AnyNode, resolver: Resolver<R>): ENode<R>
  /** Run the active resolver against a Core node. */
  resolve(core: AnyNode, resolver: Resolver<R>): R
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

function lastSegment(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot === -1 ? path : path.slice(dot + 1)
}

export function createContinuation<R>(
  adapter: ContinuationAdapter<R>
): Continuation<R> {
  type Overrides = Record<string, (part: never) => R>

  function enrichParts(parts: object): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [name, data] of Object.entries(parts)) {
      out[name] =
        data && typeof data === 'object'
          ? { ...data, Default: () => adapter.part(name, data) }
          : data
    }
    return out
  }

  function renderChildren(core: ContainerNode, resolver: Resolver<R>): R {
    return adapter.combine(
      core.children.map((c) => ({ key: c.path, node: resolve(c, resolver) }))
    )
  }

  function renderDefault(
    core: AnyNode,
    resolver: Resolver<R>,
    overrides?: Overrides
  ): R {
    if (core.isField) {
      return adapter.field(enrich(core, resolver) as EField<R>, overrides)
    }
    if (core.isGroup) {
      // root is a transparent shell — its default is just its children.
      if (core.isRoot) return renderChildren(core, resolver)
      return adapter.group(
        enrich(core, resolver) as EGroup<R>,
        renderChildren(core, resolver)
      )
    }
    // array | arrayItem — structural pass-through (interactivity deferred).
    return renderChildren(core, resolver)
  }

  function enrich(core: AnyNode, resolver: Resolver<R>): ENode<R> {
    const parts = enrichParts(core.parts)
    const Default = (opts?: { parts?: Overrides; renderNode?: Resolver<R> }): R =>
      renderDefault(core, opts?.renderNode ?? resolver, opts?.parts)

    if (core.isField) {
      return { ...core, parts, Default } as unknown as ENode<R>
    }

    const children: Record<string, ENode<R>> = {}
    for (const c of core.children) {
      children[lastSegment(c.path)] = enrich(c, resolver)
    }
    const child = (relativePath: string): ENode<R> | undefined => {
      const full = core.path ? `${core.path}.${relativePath}` : relativePath
      const found = core.children.find((c) => c.path === full)
      return found ? enrich(found, resolver) : undefined
    }
    const Children = (): R => renderChildren(core, resolver)

    return {
      ...core,
      parts,
      children,
      child,
      Children,
      Default,
    } as unknown as ENode<R>
  }

  function resolve(core: AnyNode, resolver: Resolver<R>): R {
    return resolver(enrich(core, resolver))
  }

  return { enrich, resolve }
}
