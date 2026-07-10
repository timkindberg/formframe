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
  AnyFacts,
  AnyNode,
  ArrayItemNode,
  ArrayNode,
  ChoiceOption,
  ContainerFacts,
  FieldControl,
  FieldFacts,
  FieldNode,
  FieldParts,
  GroupNode,
  HtmlInputAttrs,
  HtmlSelectAttrs,
  HtmlTextareaAttrs,
  LeafFacts,
  WidgetName,
} from '../parser/nodeTypes'
import { serializeNode } from '../parser/utils'

/** The normalized presentation for one field (ADR 029). `args` is the generic
 * per-widget config bag — named to avoid collision with a select's `options`. */
export interface Presentation {
  widget: string
  args?: Record<string, unknown>
}

/**
 * Assigns a widget to a node from its neutral facts (ADR 030 §5: leaves AND
 * containers). Source-agnostic: a resolver may match on facts or reach into
 * `facts.origin.schema` (accepting front-end coupling, which the consumer owns).
 * Returning a widget for a *container* collapses its subtree into one control
 * (ADR 030 §5). `undefined` means "no opinion" — a lower layer decides. The
 * library recognizes NO source keyword.
 *
 * Receives {@link AnyFacts} (the `LeafFacts | ContainerFacts` union) so a resolver
 * can read `choices` on either; `primitive` (leaf) and `item` (container) are
 * reached by narrowing with {@link isContainerFacts}.
 */
export type PresentationResolver<S = unknown> = (
  facts: AnyFacts<S>
) => Presentation | undefined

/**
 * Leaf-vs-container discriminant for {@link AnyFacts}: a leaf carries a
 * `primitive`, a container never does. The one place that structural distinction
 * is encoded, so callers (and resolvers) read `isContainerFacts(f)` instead of
 * hand-rolling the `'primitive' in f` check.
 */
export function isContainerFacts<S = unknown>(
  f: AnyFacts<S>
): f is ContainerFacts<S> {
  return !('primitive' in f)
}

/**
 * The option-count threshold (bd cm7). At or below it, a constrained field
 * defaults to an inline **group** (radio for single-choice, checkboxes for
 * multi-choice); above it, to a compact **dropdown** (select / multiselect). 5 is
 * the conservative common boundary across UX research (USWDS 2–5 radio then
 * select; Chrome forms 1–5 radio then select; Miller 7±2). It is one named
 * constant so the whole heuristic is tunable in one place, and every default it
 * produces is overridable by a consumer resolver (ADR 029).
 */
export const OPTION_COUNT_THRESHOLD = 5

/**
 * The shipped default widget rule — the floor. Replaces the parser's old
 * hard-coding, now option-count driven (bd cm7): a constrained field with few
 * `choices` gets an inline group (radio / checkboxes), with many a dropdown
 * (select / multiselect); an unconstrained field is a plain input. `valueShape`
 * (not `choices` alone) picks the multi-choice branch so submit-wrapping (array-
 * valued leaves → `string[]`) stays correct. All four choice widgets carry the
 * SAME neutral facts and the SAME submitted-value contract (a radio ≡ a select; a
 * checkbox group ≡ a multiselect) — only the rendered control differs.
 */
export const defaultPresentation: PresentationResolver = (f) => {
  if (f.valueShape === 'array' && f.choices) {
    return f.choices.length <= OPTION_COUNT_THRESHOLD
      ? { widget: 'checkboxes' }
      : { widget: 'multiselect' }
  }
  if (f.choices) {
    return f.choices.length <= OPTION_COUNT_THRESHOLD
      ? { widget: 'radio' }
      : { widget: 'select' }
  }
  // Object and open-ended-array containers are never collapsed by the default rule
  // (ADR 030 §3): returning `undefined` leaves the subtree decomposed unless a
  // consumer resolver opts in. A scalar-choice ARRAY is the one container the
  // default rule DOES collapse — it self-identifies as `valueShape:'array' &&
  // choices` and is caught by the first branch above, whose widget present()
  // applies to the container as a subtree collapse (a leaf multiselect/checkboxes).
  if (isContainerFacts(f)) return undefined
  return { widget: 'input' }
}

/** Compose resolvers lowest→highest precedence; later (consumer) wins, and an
 * `undefined` return defers to the layer below. Use `layered(defaultPresentation,
 * consumerResolver)`. */
export function layered<S = unknown>(
  ...resolvers: PresentationResolver<S>[]
): PresentationResolver<S> {
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
      // Every caption gets an `id` (so it can always be an aria-labelledby
      // target) and points `for` at its control. A choicegroup — which has no
      // single control — drops `for` in deriveFieldParts (id === labelledBy).
      attrs: { id: captionId(f), for: f.attrs.id },
      showRequired: f.required,
    },
  }
  return f.description
    ? { ...base, description: { text: f.description } }
    : base
}

function inputAttrsFromFacts(f: FieldFacts): HtmlInputAttrs {
  const attrs: HtmlInputAttrs = {
    id: f.attrs.id,
    name: f.attrs.name,
    type: 'text',
  }
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

function selectAttrsFromFacts(
  f: FieldFacts,
  multiple: boolean
): HtmlSelectAttrs {
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
 * Per-option `<input>` attrs for a radio/checkbox group (bd cm7). Each option is a
 * distinct `<input>` carrying its own `value` and a unique `id` (`${fieldId}-${i}`)
 * so a `<label>` can target it; all share the field's `name`. `required` is set only
 * for radios (single-choice): native `required` on a shared-name radio group means
 * "pick one", which is correct — but on a checkbox group it would demand EVERY box,
 * so "at least one" is left to the side-loaded validator (ADR 019).
 */
/** The id of a field's caption `<label>` — the anchor a choicegroup wrapper
 * points `aria-labelledby` at (bd l8j). Distinct from the field id (`f.attrs.id`)
 * and the per-option ids (`${f.attrs.id}-0`…), so nothing collides. */
function captionId(f: FieldFacts): string {
  return `${f.attrs.id}-label`
}

function choiceOptions(f: FieldFacts, multiple: boolean): ChoiceOption[] {
  const type = multiple ? 'checkbox' : 'radio'
  return (f.choices ?? []).map((choice, i) => {
    const attrs = {
      id: `${f.attrs.id}-${i}`,
      name: f.attrs.name,
      type,
      value: choice.value,
    } as ChoiceOption['attrs']
    if (!multiple && f.constraints.required) attrs.required = true
    return { attrs, label: choice.label }
  })
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
    case 'radio':
      return {
        kind: 'choicegroup',
        multiple: false,
        role: 'radiogroup',
        labelledBy: captionId(f),
        options: choiceOptions(f, false),
      }
    case 'checkboxes':
      return {
        kind: 'choicegroup',
        multiple: true,
        role: 'group',
        labelledBy: captionId(f),
        options: choiceOptions(f, true),
      }
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
  if (!control) return undefined
  const parts: FieldParts = { ...commonParts(f), control }
  // A choicegroup has no single control for `for` to target, so drop it: the
  // caption is id-only and the group wrapper names itself via
  // `aria-labelledby={control.labelledBy}` (= this id). Single-control captions
  // keep the `for` from commonParts. (Supersedes the cm7 hack of pointing `for`
  // at the first option, which selected it on caption click — bd l8j.)
  if (control.kind === 'choicegroup') {
    parts.label = { ...parts.label, attrs: { id: control.labelledBy } }
  }
  return parts
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
 * stays fully-formed for direct renders; `useFormTree` re-runs `present()` with
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

function presentField<S = unknown>(
  node: FieldNode<S>,
  resolve: PresentationResolver<S>
): FieldNode<S> {
  const p = resolve(node.facts)
  if (!p) return node
  // Unchanged widget (and no args) → keep identity so the memo bail holds.
  if (p.widget === node.widget && !p.args) return node
  const wp = widgetParts(node.facts, p.widget)
  // Custom / raw widgets are deferred to a later tracer (ADR 029). Until the
  // catalog earns a generic control facet, an unknown widget name is a no-op.
  if (!wp) return node
  const next: FieldNode<S> = { ...node, widget: wp.widget, parts: wp.parts }
  // Carry the resolver's per-widget `args` (ADR 029 §6); clear any stale bag when
  // a later resolution drops it.
  if (p.args) next.args = p.args
  else if ('args' in next) delete next.args
  return next
}

/**
 * The leaf facts for a collapsed container (ADR 030 §5). The container's
 * `valueShape` is preserved — load-bearing so submit still assembles the array /
 * object value — while `primitive` is a placeholder: a collapsed container renders
 * as a select/multiselect/choicegroup, whose derivers ignore `primitive`. The
 * option source + value identity are NOT here; they ride on the resolver's `args`
 * (ADR 030 §4).
 */
function containerFactsToLeaf<S = unknown>(
  cf: ContainerFacts<S>
): LeafFacts<S> {
  const leaf: LeafFacts<S> = {
    path: cf.path,
    label: cf.label,
    required: cf.required,
    primitive: 'string',
    valueShape: cf.valueShape,
    constraints: cf.constraints,
    attrs: cf.attrs,
    origin: cf.origin,
  }
  if (cf.description !== undefined) leaf.description = cf.description
  if (cf.choices !== undefined) leaf.choices = cf.choices
  return leaf
}

/**
 * Collapse a container into a single leaf-like control node (ADR 030 §5): prune
 * the subtree's children and emit a `FieldNode` at the container's path carrying
 * the container's facts (so `valueShape` — hence submit assembly — is preserved),
 * the resolved widget, and any `args`. Returns `undefined` (a no-op) when the
 * widget is outside the built-in catalog, so an unknown widget leaves the subtree
 * decomposed rather than erasing it.
 */
function collapseContainer<S = unknown>(
  node: GroupNode<S> | ArrayNode<S>,
  p: Presentation
): FieldNode<S> | undefined {
  const facts = containerFactsToLeaf(node.facts)
  const wp = widgetParts(facts, p.widget)
  if (!wp) return undefined
  const leaf: FieldNode<S> = {
    nodeType: 'field',
    path: node.path,
    widget: wp.widget,
    facts,
    parts: wp.parts,
    isRoot: node.isRoot,
    depth: node.depth,
    isField: true,
    isGroup: false,
    isArray: false,
    isArrayItem: false,
    toJSON() {
      return serializeNode(this)
    },
  }
  if (p.args) leaf.args = p.args
  return leaf
}

// Returns `AnyNode` (not the input node type) because collapse can change a
// node's type — a `GroupNode`/`ArrayNode` becomes a `FieldNode` (ADR 030 §5). The
// `as AnyNode` cast on the rebuilt-container branch is the unavoidable cost of
// rebuilding a union member via spread; it is structurally sound (a rebuilt
// container keeps its shape and `this`-based methods, only `children` changes).
function presentNode<S = unknown>(
  node: AnyNode<S>,
  resolve: PresentationResolver<S>
): AnyNode<S> {
  if (node.isField) return presentField(node, resolve)
  // Offer a collapsible container (group/array) to the resolver before recursing.
  // The root is never collapsed (the whole form is not one control) and an
  // arrayItem is a structural wrapper, not a resolve target — both just recurse.
  if ((node.isGroup || node.isArray) && !node.isRoot) {
    const p = resolve(node.facts)
    if (p) {
      const collapsed = collapseContainer(node, p)
      if (collapsed) return collapsed
    }
  }
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
  return { ...node, children: next } as AnyNode<S>
}

/**
 * Apply a presentation resolver over the tree (ADR 029/030). Pure and identity-
 * preserving; a resolver may also collapse a container subtree into one control
 * (ADR 030 §5). Wrap the consumer's resolver under the default:
 * `present(tree, layered(defaultPresentation, consumerResolver))`. The root group
 * is never collapsed, so the return type stays `GroupNode`.
 */
export function present<S = unknown>(
  root: GroupNode<S>,
  resolve: PresentationResolver<S>
): GroupNode<S> {
  return presentNode(root, resolve) as GroupNode<S>
}

/**
 * Present a lazily-created array item under the SHIPPED default rule (ADR 030 §3).
 * A runtime item — `ArrayNode.getItem(i)`, including seeds the renderer re-mints —
 * is produced by the front-end factory as raw structure, so its nested
 * scalar-choice arrays are still un-collapsed ArrayNodes. This folds the default
 * over that subtree so a lazily-created item matches the static tree: nested
 * scalar-choice arrays collapse to one multiselect/checkboxes leaf and every leaf
 * gets its widget. Consumer resolvers are NOT applied to runtime items (unchanged
 * from when the front-end baked the collapse in — tracked separately).
 */
export function presentDefaultItem<S = unknown>(
  item: ArrayItemNode<S>
): ArrayItemNode<S> {
  // Explicit `<S>` so inference doesn't pit `item` (S) against the unknown-typed
  // `defaultPresentation` (a resolver valid at any S); `defaultPresentation` is
  // assignable to `PresentationResolver<S>` by contravariance.
  return presentNode<S>(item, defaultPresentation) as ArrayItemNode<S>
}
