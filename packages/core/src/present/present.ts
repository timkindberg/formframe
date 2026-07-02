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
  FieldFacts,
  FieldNode,
  GroupNode,
  HtmlInputAttrs,
  HtmlSelectAttrs,
  InputFieldNode,
  InputFieldParts,
  SelectFieldNode,
  SelectFieldParts,
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
  if (f.primitive === 'string' && f.format === 'email') attrs.type = 'email'
  else if (f.primitive === 'number' || f.primitive === 'integer')
    attrs.type = 'number'
  else if (f.primitive === 'boolean') attrs.type = 'checkbox'
  const c = f.constraints
  if (c.required) attrs.required = true
  if (c.minLength !== undefined) attrs.minLength = c.minLength
  if (c.maxLength !== undefined) attrs.maxLength = c.maxLength
  if (c.minimum !== undefined) attrs.min = c.minimum
  if (c.maximum !== undefined) attrs.max = c.maximum
  if (c.pattern !== undefined) attrs.pattern = c.pattern
  return attrs
}

export function deriveInputParts(f: FieldFacts): InputFieldParts {
  return { ...commonParts(f), input: { attrs: inputAttrsFromFacts(f) } }
}

export function deriveSelectParts(
  f: FieldFacts,
  multiple: boolean
): SelectFieldParts {
  const attrs: HtmlSelectAttrs = { id: f.attrs.id, name: f.attrs.name }
  if (multiple) attrs.multiple = true
  if (f.constraints.required) attrs.required = true
  return { ...commonParts(f), select: { attrs, options: f.choices ?? [] } }
}

// --- The pass -------------------------------------------------------------------

function presentField(node: FieldNode, resolve: PresentationResolver): FieldNode {
  const p = resolve(node.facts)
  if (!p) return node
  // Unchanged widget (and no args) → keep identity so the memo bail holds.
  if (p.widget === node.widget && !p.args) return node
  if (p.widget === 'input') {
    return {
      ...node,
      widget: 'input',
      parts: deriveInputParts(node.facts),
    } as InputFieldNode
  }
  if (p.widget === 'select' || p.widget === 'multiselect') {
    return {
      ...node,
      widget: p.widget,
      parts: deriveSelectParts(node.facts, p.widget === 'multiselect'),
    } as SelectFieldNode
  }
  // Custom / raw widgets are deferred to a later tracer (ADR 029). Until the
  // catalog + control facet land, an unknown widget name is a no-op.
  return node
}

function presentNode(node: AnyNode, resolve: PresentationResolver): AnyNode {
  if (node.isField) return presentField(node, resolve)
  let changed = false
  const next = node.children.map((child) => {
    const presented = presentNode(child, resolve)
    if (presented !== child) changed = true
    return presented
  })
  if (!changed) return node
  // A rebuilt container: same `this`-based methods (getField/walk/submit) now
  // read the new `children` (see groupNode/arrayNode). Structural sharing keeps
  // every unchanged subtree by reference.
  return { ...node, children: next }
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
  return presentNode(root, resolve) as GroupNode
}
