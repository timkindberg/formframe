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
// parameter down the fold. What an adapter supplies (the `RendererAdapter`,
// ADR 013) is only the `R`-specific **renderer set** — a compound *per node
// kind* (`field`/`group`, each a `root` composition renderer plus its parts) +
// how to `combine` children. The engine dispatches a part's `Default` to
// `adapter[kind][partName]`, so swapping one entry by reference (or supplying a
// partial set over a diagnostic floor) is all the customization machinery there
// is — no privileged engine code for the defaults.
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
  FieldPartsBase,
  InputFieldParts,
  SelectFieldParts,
  GroupParts,
  ArrayParts,
  ArrayItemParts,
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
export type EArray<R> = EContainerOf<ArrayNode, R> & {
  /**
   * Render a caller-owned item core through the active resolver — the seam a
   * stateful adapter (React) uses to mount/keep items under its own identity.
   * Pair with `getItem(index)` (Core) to mint an item core; the adapter caches
   * that core so re-renders keep DOM identity (and uncontrolled values) in
   * place. The string oracle never calls this (arrays are static there).
   */
  renderItem(item: ArrayItemNode): R
}
export type EArrayItem<R> = EContainerOf<ArrayItemNode, R>

export type ENode<R> = EField<R> | EGroup<R> | EArray<R> | EArrayItem<R>

/** Per-node hijack: return a custom `R`, or re-enter via `node.Default()`. */
export type Resolver<R> = (node: ENode<R>) => R

// ---------------------------------------------------------------------------
// Adapter — the only `R`-specific surface a renderer must supply.
//
// A *compound per node kind* renderer set (ADR 013): each kind has a `root`
// (composition renderer) plus its parts. Parts are per-node-context — a field's
// `label` is a `<label>`, a group's/array's `label` is a `<legend>`; an array's
// `addButton` and an arrayItem's `removeButton` are the add/remove controls — so
// they live under their kind, not in one global namespace. Override an entry by
// reference (`{ ...defaultAdapter, field: { ...defaultAdapter.field, label } }`);
// `combine` is plumbing, not content (no "diagnostic" form), so it sits beside
// the kinds. `array`/`arrayItem` `root`s receive their already-rendered
// `children` (the items / the item's content) and compose the add/remove
// controls from their parts, exactly like `group.root` — uniform composition.
// Interactivity is per-adapter, not part of this contract: the engine and the
// renderer set produce *markup*; a stateful adapter (React) wires add/remove
// while the string oracle renders the same controls inert (ADR 008/013).
// ---------------------------------------------------------------------------

/** A child's result paired with a stable key (React needs keys; others ignore). */
export interface ChildResult<R> {
  key: string
  node: R
}

/**
 * Loosely-typed part-override map as seen by `root` (precise at the public call
 * site via `PartsOverrides`). `unknown` lets `root` forward the enriched part
 * without an `as never` cast.
 */
export type PartOverrideMap<R> = Record<string, (part: unknown) => R>

/** Renderers for a field's parts, each typed by its own slice of the IR. */
export interface FieldPartRenderers<R> {
  label(data: FieldPartsBase['label']): R
  description(data: NonNullable<FieldPartsBase['description']>): R
  input(data: InputFieldParts['input']): R
  select(data: SelectFieldParts['select']): R
}

/** Renderers for a group's parts (captions). */
export interface GroupPartRenderers<R> {
  label(data: NonNullable<GroupParts['label']>): R
  description(data: NonNullable<GroupParts['description']>): R
}

/** Renderers for an array's parts: captions + the add control. */
export interface ArrayPartRenderers<R> {
  label(data: NonNullable<ArrayParts['label']>): R
  description(data: NonNullable<ArrayParts['description']>): R
  addButton(data: ArrayParts['addButton']): R
}

/** Renderers for an array item's parts: the remove control. */
export interface ArrayItemPartRenderers<R> {
  removeButton(data: ArrayItemParts['removeButton']): R
}

/**
 * The only `R`-specific surface a renderer supplies. `root` composes a node from
 * its parts (honoring per-call `overrides`); the part renderers produce each
 * part's default markup; `combine` joins sibling results. Every method takes a
 * single object/data argument so a framework component can be passed by
 * reference (e.g. a React `function Label(props)` as `field.label`).
 */
export interface RendererAdapter<R> {
  field: FieldPartRenderers<R> & {
    /** Compose a field's default: its parts, honoring `overrides`. */
    root(props: { node: EField<R>; overrides?: PartOverrideMap<R> }): R
  }
  group: GroupPartRenderers<R> & {
    /** Compose a non-root group's default, given already-rendered `children`. */
    root(props: { node: EGroup<R>; children: R }): R
  }
  array: ArrayPartRenderers<R> & {
    /** Compose an array's default: caption + already-rendered `items` + add. */
    root(props: { node: EArray<R>; children: R }): R
  }
  arrayItem: ArrayItemPartRenderers<R> & {
    /** Compose an item's default: its already-rendered `children` + remove. */
    root(props: { node: EArrayItem<R>; children: R }): R
  }
  /** Combine child results into one `R` (React: keyed fragment; vanilla: join). */
  combine(props: { children: ChildResult<R>[] }): R
}

/**
 * A partial renderer set — what the public floor (`createRenderer`) accepts.
 * Missing content entries fall back to the diagnostic set; `combine` always
 * carries the framework's real default (it is plumbing, not content).
 */
export interface PartialAdapter<R> {
  field?: Partial<RendererAdapter<R>['field']>
  group?: Partial<RendererAdapter<R>['group']>
  array?: Partial<RendererAdapter<R>['array']>
  arrayItem?: Partial<RendererAdapter<R>['arrayItem']>
  combine?: RendererAdapter<R>['combine']
}

/**
 * Fill a partial renderer set over a complete `base` (e.g. the diagnostic floor
 * or the real defaults), by reference. Per-kind shallow merge; `combine` is
 * taken whole. This is the one merge every renderer's `createRenderer` uses.
 */
export function mergeAdapter<R>(
  base: RendererAdapter<R>,
  over: PartialAdapter<R>
): RendererAdapter<R> {
  return {
    field: { ...base.field, ...over.field },
    group: { ...base.group, ...over.group },
    array: { ...base.array, ...over.array },
    arrayItem: { ...base.arrayItem, ...over.arrayItem },
    combine: over.combine ?? base.combine,
  }
}

export interface Continuation<R> {
  /** Wrap a Core node with the continuation re-entry points. */
  enrich(core: AnyNode, resolver: Resolver<R>): ENode<R>
  /** Run the active resolver against a Core node. */
  resolve(core: AnyNode, resolver: Resolver<R>): R
}

/**
 * Engine-level strategy knobs (distinct from the content `RendererAdapter`).
 *
 * `renderChild` is the recursion-strategy seam: how the fold renders *one* child
 * node. The default is the eager fold (`resolve` the child inline) — exactly
 * what the string oracle wants. A lazy adapter (React) overrides it to emit a
 * memoized per-node component that calls back into `resolve`, so a state change
 * re-renders only the nodes that changed and uncontrolled DOM keeps its
 * identity. Output must match the eager fold — conformance is a markup contract.
 */
export interface ContinuationOptions<R> {
  renderChild?(core: AnyNode, resolver: Resolver<R>): R
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

function lastSegment(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot === -1 ? path : path.slice(dot + 1)
}

/** The kinds that own renderer entries — one per concrete node kind. */
type PartKind = 'field' | 'group' | 'array' | 'arrayItem'
function partKind(core: AnyNode): PartKind | null {
  if (core.isField) return 'field'
  if (core.isGroup) return 'group'
  if (core.isArray) return 'array'
  if (core.isArrayItem) return 'arrayItem'
  return null
}

export function createContinuation<R>(
  adapter: RendererAdapter<R>,
  options: ContinuationOptions<R> = {}
): Continuation<R> {
  type Overrides = PartOverrideMap<R>
  type AnyPartRenderer = (data: unknown) => R

  /** Look up the renderer for `kind`'s `name` part; `undefined` if none. */
  function partRenderer(kind: PartKind | null, name: string): AnyPartRenderer | undefined {
    if (!kind) return undefined
    // Internal dynamic dispatch: the public adapter type stays precise; here we
    // index by runtime part name (`root` is never a part name, so no collision).
    const set = adapter[kind] as unknown as Record<string, AnyPartRenderer>
    return set[name]
  }

  function enrichParts(parts: object, kind: PartKind | null): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [name, data] of Object.entries(parts)) {
      out[name] =
        data && typeof data === 'object'
          ? {
              ...data,
              Default: () => {
                const renderer = partRenderer(kind, name)
                // Unrendered parts (e.g. `container`, array buttons) → empty `R`.
                return renderer ? renderer(data) : adapter.combine({ children: [] })
              },
            }
          : data
    }
    return out
  }

  /** Render one child — lazily (adapter-supplied) or eagerly (default fold). */
  function renderChild(core: AnyNode, resolver: Resolver<R>): R {
    return options.renderChild ? options.renderChild(core, resolver) : resolve(core, resolver)
  }

  function renderChildren(core: ContainerNode, resolver: Resolver<R>): R {
    return adapter.combine({
      children: core.children.map((c) => ({
        key: c.path,
        node: renderChild(c, resolver),
      })),
    })
  }

  function renderDefault(
    core: AnyNode,
    resolver: Resolver<R>,
    overrides?: Overrides
  ): R {
    if (core.isField) {
      return adapter.field.root({
        node: enrich(core, resolver) as EField<R>,
        overrides,
      })
    }
    if (core.isGroup) {
      // root is a transparent shell — its default is just its children.
      if (core.isRoot) return renderChildren(core, resolver)
      return adapter.group.root({
        node: enrich(core, resolver) as EGroup<R>,
        children: renderChildren(core, resolver),
      })
    }
    if (core.isArray) {
      return adapter.array.root({
        node: enrich(core, resolver) as EArray<R>,
        children: renderChildren(core, resolver),
      })
    }
    // arrayItem — compose the item's content + its remove control.
    return adapter.arrayItem.root({
      node: enrich(core, resolver) as EArrayItem<R>,
      children: renderChildren(core, resolver),
    })
  }

  function enrich(core: AnyNode, resolver: Resolver<R>): ENode<R> {
    const kind = partKind(core)
    const parts = enrichParts(core.parts, kind)
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

    const enriched = {
      ...core,
      parts,
      children,
      child,
      Children,
      Default,
    }
    if (core.isArray) {
      return {
        ...enriched,
        renderItem: (item: ArrayItemNode): R => renderChild(item, resolver),
      } as unknown as ENode<R>
    }
    return enriched as unknown as ENode<R>
  }

  function resolve(core: AnyNode, resolver: Resolver<R>): R {
    return resolver(enrich(core, resolver))
  }

  return { enrich, resolve }
}
