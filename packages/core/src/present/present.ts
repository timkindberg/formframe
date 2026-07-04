// The presentation stage (ADR 029) — a pure fold that assigns each leaf a widget
// and derives its control parts from neutral `FieldFacts`, driven by a layered,
// source-agnostic resolver. It runs between parse and render; it NEVER reads
// `origin.schema` to build parts (the parser already turned `enum` into neutral
// `choices`), so it is front-end-agnostic — a future Zod front-end inherits it by
// filling `FieldFacts`.
//
// Identity is preserved by structural sharing: a field whose resolved widget
// matches what it already is returns the SAME reference, and a container whose
// children are all unchanged returns itself — so the React `NodeRenderer` memo
// bail keeps holding and only overridden subtrees re-render.

import type {
  AnyNode,
  FieldControl,
  FieldFacts,
  FieldNode,
  FieldParts,
  GroupNode,
  HtmlInputAttrs,
  HtmlSelectAttrs,
  HtmlTextareaAttrs,
  WidgetName,
} from '../parser/nodeTypes'

/** The normalized presentation for one field (ADR 029). `args` is the generic
 * per-widget config bag — named to avoid collision with a select's `options`. */
export interface Presentation {
  widget: string
  args?: Record<string, unknown>
}

/**
 * Assigns a widget to a leaf from its neutral facts. Source-agnostic: a resolver
 * may match on facts or reach into `facts.origin.schema` (accepting front-end
 * coupling, which the consumer owns). `undefined` means "no opinion" — a lower
 * layer decides. The library recognizes NO source keyword.
 */
export type PresentationResolver = (facts: FieldFacts) => Presentation | undefined

/**
 * The shipped default widget rule — the floor. Replaces the parser's old
 * hard-coding: array-of-choices → multiselect, scalar-with-choices → select,
 * else a plain input. `valueShape` (not `choices` alone) distinguishes the array
 * case so submit-wrapping (`widget === 'multiselect'`) stays correct.
 */
export const defaultPresentation: PresentationResolver = (f) =>
  f.valueShape === 'array' && f.choices
    ? { widget: 'multiselect' }
    : f.choices
      ? { widget: 'select' }
      : { widget: 'input' }

/** Compose resolvers lowest→highest precedence; later (consumer) wins, and an
 * `undefined` return defers to the layer below. Use `layered(defaultPresentation,
 * consumerResolver)`. */
export function layered(
  ...resolvers: PresentationResolver[]
): PresentationResolver {
  return (facts) => {
    let result: Presentation | undefined
    for (const resolver of resolvers) {
      const p = resolver(facts)
      if (p) result = p
    }
    return result
  }
}

// --- Core widget catalog: neutral part derivers (ADR 029 §4) --------------------
// These consume only `FieldFacts` (never `origin.schema`) and reproduce exactly
// what the parser builds today, so the dual-period migration and conformance stay
// consistent. Shared with the string oracle so React ≡ vanilla markup holds.

function commonParts(f: FieldFacts) {
  const base = {
    container: { key: f.path },
    label: {
      text: f.label,
      attrs: { for: f.attrs.id },
      showRequired: f.required,
    },
  }
  return f.description ? { ...base, description: { text: f.description } } : base
}

function inputAttrsFromFacts(f: FieldFacts): HtmlInputAttrs {
  const attrs: HtmlInputAttrs = { id: f.attrs.id, name: f.attrs.name, type: 'text' }
  if (f.primitive === 'boolean') attrs.type = 'checkbox'
  else if (f.primitive === 'number' || f.primitive === 'integer')
    attrs.type = 'number'
  else if (f.primitive === 'string' && f.format) {
    switch (f.format) {
      case 'email':
        attrs.type = 'email'
        break
      case 'date':
        attrs.type = 'date'
        break
      case 'date-time':
        attrs.type = 'datetime-local'
        break
      case 'time':
        attrs.type = 'time'
        break
      case 'uri':
      case 'url':
        attrs.type = 'url'
        break
      case 'color':
        attrs.type = 'color'
        break
      case 'tel':
        attrs.type = 'tel'
        break
    }
  }
  const c = f.constraints
  if (c.required) attrs.required = true
  if (c.minLength !== undefined) attrs.minLength = c.minLength
  if (c.maxLength !== undefined) attrs.maxLength = c.maxLength
  if (c.minimum !== undefined) attrs.min = c.minimum
  if (c.maximum !== undefined) attrs.max = c.maximum
  if (c.pattern !== undefined) attrs.pattern = c.pattern
  return attrs
}

function selectAttrsFromFacts(f: FieldFacts, multiple: boolean): HtmlSelectAttrs {
  const attrs: HtmlSelectAttrs = { id: f.attrs.id, name: f.attrs.name }
  if (multiple) attrs.multiple = true
  if (f.constraints.required) attrs.required = true
  return attrs
}

function textareaAttrsFromFacts(f: FieldFacts): HtmlTextareaAttrs {
  const attrs: HtmlTextareaAttrs = { id: f.attrs.id, name: f.attrs.name }
  const c = f.constraints
  if (c.required) attrs.required = true
  if (c.minLength !== undefined) attrs.minLength = c.minLength
  if (c.maxLength !== undefined) attrs.maxLength = c.maxLength
  return attrs
}

/**
 * Derive the unified control facet (ADR 029 §5) for a widget name from neutral
 * facts. `multiselect` maps to the `select` archetype + `attrs.multiple`. Returns
 * `undefined` for a widget the built-in catalog doesn't know (custom widgets are a
 * later tracer — a no-op for now). This is the ONE place widget→control lives.
 */
export function deriveControl(
  f: FieldFacts,
  widget: string
): FieldControl | undefined {
  switch (widget) {
    case 'input':
      return { kind: 'input', attrs: inputAttrsFromFacts(f) }
    case 'select':
      return {
        kind: 'select',
        attrs: selectAttrsFromFacts(f, false),
        options: f.choices ?? [],
      }
    case 'multiselect':
      return {
        kind: 'select',
        attrs: selectAttrsFromFacts(f, true),
        options: f.choices ?? [],
      }
    case 'textarea':
      return { kind: 'textarea', attrs: textareaAttrsFromFacts(f) }
    default:
      return undefined
  }
}

/** A field's full parts (common + control) for a widget, or `undefined` for a
 * widget the catalog doesn't know. Shared by the parser leaf builders and the pass. */
export function deriveFieldParts(
  f: FieldFacts,
  widget: string
): FieldParts | undefined {
  const control = deriveControl(f, widget)
  return control ? { ...commonParts(f), control } : undefined
}

/** The widget name + its derived parts. `widget` is the resolved name (a label);
 * the archetype discriminant lives in `parts.control.kind` (ADR 029 §5/§6, v60). */
interface WidgetParts {
  widget: WidgetName
  parts: FieldParts
}

function widgetParts(f: FieldFacts, widget: string): WidgetParts | undefined {
  const parts = deriveFieldParts(f, widget)
  // `deriveFieldParts` returns non-undefined only for the known built-in names, so
  // the cast is sound at this boundary; custom widgets (a later tracer) are a no-op.
  return parts ? { widget: widget as WidgetName, parts } : undefined
}

/**
 * Finalize a facts-only leaf via the shipped default rule — the parser calls this
 * so `present()` (this module) is the SOLE source of widget selection AND parts
 * derivation (bd 9pb closes the ADR 029 dual period). `jsonSchemaToTree`'s return
 * stays fully-formed for direct renders; `useSchemaForm` re-runs `present()` with
 * any consumer resolver layered on top, identity-preservingly.
 */
export function presentDefaultLeaf(f: FieldFacts): WidgetParts {
  const p = defaultPresentation(f)
  // `defaultPresentation` always yields input/select/multiselect for parser
  // facts; the fallback guards a future default rule returning something unmapped.
  return (
    (p && widgetParts(f, p.widget)) ?? {
      widget: 'input',
      parts: deriveFieldParts(f, 'input')!,
    }
  )
}

// --- The pass -------------------------------------------------------------------

function presentField(node: FieldNode, resolve: PresentationResolver): FieldNode {
  const p = resolve(node.facts)
  if (!p) return node
  // Unchanged widget (and no args) → keep identity so the memo bail holds.
  if (p.widget === node.widget && !p.args) return node
  const wp = widgetParts(node.facts, p.widget)
  // Custom / raw widgets are deferred to a later tracer (ADR 029). Until the
  // catalog earns a generic control facet, an unknown widget name is a no-op.
  if (!wp) return node
  return { ...node, widget: wp.widget, parts: wp.parts }
}

// Generic in the node type so callers get their exact node back (e.g. `present`
// returns a `GroupNode`, not a widened `AnyNode`). The `as TNode` casts are the
// unavoidable cost of narrowing a generic by a discriminant / rebuilding via
// spread — they are internal and structurally sound (a field stays a field; a
// rebuilt container keeps its shape, only `children` changes).
function presentNode<TNode extends AnyNode>(
  node: TNode,
  resolve: PresentationResolver
): TNode {
  // Widen to the union locally so the `isField` discriminant narrows soundly
  // (control-flow narrowing on a bare type parameter can't reach `.children`).
  const n: AnyNode = node
  if (n.isField) return presentField(n, resolve) as TNode
  let changed = false
  const next = n.children.map((child) => {
    const presented = presentNode(child, resolve)
    if (presented !== child) changed = true
    return presented
  })
  if (!changed) return node
  // A rebuilt container: same `this`-based methods (getField/walk/submit) now
  // read the new `children` (see groupNode/arrayNode). Structural sharing keeps
  // every unchanged subtree by reference.
  return { ...n, children: next } as TNode
}

/**
 * Apply a presentation resolver over the tree (ADR 029). Pure and identity-
 * preserving. Wrap the consumer's resolver under the default:
 * `present(tree, layered(defaultPresentation, consumerResolver))`.
 */
export function present(
  root: GroupNode,
  resolve: PresentationResolver
): GroupNode {
  return presentNode(root, resolve)
}
