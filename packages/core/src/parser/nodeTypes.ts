// Explicit node interfaces forming a recursive, discriminated union.
//
// Every node carries `nodeType` plus boolean-literal discriminants
// (`isField`/`isGroup`/`isArray`/`isArrayItem`), so a value typed as
// `AnyNode` narrows on either: `if (node.isArray) { node.getItem(0) }`.
//
// Interfaces (not ReturnType-derived aliases) are required here because
// container `children` reference `AnyNode`, which references the containers —
// a recursion that type aliases cannot express but interfaces can.

import type { ValidationRules } from './utils'

export type NodeType = 'field' | 'group' | 'array' | 'arrayItem'

export interface SelectOption {
  value: string | number
  label: string
}

/**
 * The shape of the value a node contributes to the submitted document —
 * independent of whether the node is currently decomposed into children (ADR 030
 * §2). A leaf enum-array and a collapsed object-array both report `'array'`;
 * `'object'` is the submitted shape of an object-collapsing widget (ADR 030 §2
 * earns the member ADR 029 §1 deferred).
 */
export type ValueShape = 'scalar' | 'array' | 'object'

/**
 * Neutral, front-end-agnostic facts common to EVERY node — the whole-tree waist
 * (ADR 030 §1, generalizing ADR 029's leaf-only `FieldFacts`). The parser
 * produces these instead of deciding a widget; the `present()` stage reads them
 * to assign a widget, derive parts, and (for containers) decide whether to
 * collapse a subtree.
 *
 * Generic in the originating-schema type `S` (ADR 033 §4). `origin.schema` is the
 * front-end's own subschema (JSON Schema → `JSONSchemaObject`; Zod → `ZodType`);
 * Core defaults `S = unknown` and treats it as OPAQUE — it never reads it. A
 * front-end specializes `S` so a consumer's resolver gets a properly typed
 * `origin.schema` for the schemas it owns (ADR 029 §2).
 */
export interface NodeFacts<S = unknown> {
  path: string
  label: string
  description?: string
  required: boolean
  valueShape: ValueShape
  constraints: ValidationRules
  attrs: { id: string; name: string }
  origin: { source: string; schema: S }
}

/**
 * Facts for a leaf field (ADR 029's original `FieldFacts`, now a `NodeFacts`
 * specialization). `valueShape` is `'scalar'` or `'array'` as built by a
 * front-end; a leaf synthesized by collapsing an object subtree may carry
 * `'object'` (ADR 030 §2).
 */
export interface LeafFacts<S = unknown> extends NodeFacts<S> {
  primitive: 'string' | 'number' | 'integer' | 'boolean'
  format?: string
  choices?: SelectOption[]
}

/**
 * Facts projected onto a container (`ArrayNode`/`GroupNode`) so a resolver can
 * opt the subtree into a single collapsed widget (ADR 030 §1/§5). Carries
 * `choices` when the schema constrains a finite set (self-identifying, in-schema),
 * or an `item` descriptor for an open-ended element source (the resolver then
 * supplies the runtime source + value identity via `Presentation.args`, ADR 030 §4).
 */
export interface ContainerFacts<S = unknown> extends NodeFacts<S> {
  valueShape: 'array' | 'object'
  choices?: SelectOption[]
  item?: ItemDescriptor
}

/**
 * The minimum neutral description of one array element (ADR 030 §1). Deliberately
 * thin — its precise shape is settled by real consumers (ADR 008). Discriminated
 * on `valueShape`: an OBJECT item exposes its member `keys` (guaranteed present, so
 * a resolver narrows on `valueShape === 'object'` to name value/label identity
 * WITHOUT reading `origin.schema`); scalar/array items have no member keys.
 */
export type ItemDescriptor =
  | { valueShape: 'object'; keys: string[] }
  | { valueShape: 'scalar' | 'array'; keys?: never }

/**
 * Any node's facts — the type a `PresentationResolver` receives (ADR 030 §5). The
 * union (not the bare `NodeFacts` base) so a resolver / the default rule can read
 * `choices` (on both members) while `primitive`/`item` stay member-specific.
 */
export type AnyFacts<S = unknown> = LeafFacts<S> | ContainerFacts<S>

/** Back-compat alias for {@link LeafFacts} (ADR 029 → ADR 030 migration). */
export type FieldFacts<S = unknown> = LeafFacts<S>

// Framework-neutral HTML attribute contracts, owned by Core (the IR) — they
// model native, schema-derived attributes every renderer/UI-kit needs. NOT
// React/DOM types (importing those would break Core's stubborn boundary).
// Adapters spread `{...attrs}` and add presentation on top. See ADR 012.
export type HtmlInputType =
  | 'text'
  | 'email'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'datetime-local'
  | 'time'
  | 'url'
  | 'tel'
  | 'color'
  | 'range'
  | 'file'

export interface HtmlInputAttrs {
  id: string
  name: string
  type: HtmlInputType
  required?: boolean
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: string
}

export interface HtmlSelectAttrs {
  id: string
  name: string
  required?: boolean
  multiple?: boolean
}

export interface HtmlTextareaAttrs {
  id: string
  name: string
  required?: boolean
  minLength?: number
  maxLength?: number
}

// Per-option `<input>` attrs for a radio/checkbox group (the `choicegroup`
// archetype, bd cm7). Every option is one `<input type=radio|checkbox>` that
// carries its own `value` (submitted when checked) and a unique `id` (so an
// external `<label for>` can target it); all share the field's `name`, so a radio
// group submits one scalar and a checkbox group submits many values under one key.
// Distinct from `HtmlInputAttrs` (single scalar input) — `value` is intrinsic here.
export interface HtmlOptionInputAttrs {
  id: string
  name: string
  type: 'radio' | 'checkbox'
  value: string | number
  required?: boolean
}

// One rendered option in a `choicegroup`: its derived per-input attrs + its label.
// The attrs are derived in Core (not the adapter) so React ≡ vanilla holds (ADR 029 §4).
export interface ChoiceOption {
  attrs: HtmlOptionInputAttrs
  label: string
}

// The resolved widget *name* (ADR 029 §6, amended by bd v60/cm7): the catalog
// identity a resolver picks and consumers read for intent. It is a label, not a
// parts discriminant, and widens to `string & Brand` when custom widgets land.
//
// Widget name and `control.kind` (below) are two axes, mapped MANY-name → ONE-kind:
//   input                 → kind 'input'
//   select | multiselect  → kind 'select'      (multiselect = + attrs.multiple)
//   radio  | checkboxes   → kind 'choicegroup' (checkboxes  = + multiple)
//   textarea              → kind 'textarea'
// The name carries fine-grained identity/intent; the kind is the closed, tiny set
// of *render archetypes* an adapter must handle. That decoupling is the whole point
// of ADR 029 §5/§6: the widget catalog can grow without growing adapter branches —
// `multiselect` and `checkboxes` were added as (kind + a flag), not new adapter code.
export type WidgetName =
  | 'input'
  | 'select'
  | 'multiselect'
  | 'textarea'
  | 'radio'
  | 'checkboxes'

/**
 * The unified control facet (ADR 029 §5) — a single `control` part, discriminated
 * on `kind`, the render **archetype**: literally *which DOM shape to draw*. This is
 * why `select` and `choicegroup` are distinct kinds rather than one "choice" kind,
 * even though both consume `facts.choices`: a `select` is ONE `<select>` element
 * with `<option>` children (one focusable control), while a `choicegroup` is N
 * separate `<input type=radio|checkbox>` elements (each independently focusable) in
 * a labelled wrapper. Same neutral data, fundamentally different markup — so the
 * adapter needs different branches. The shared "all choice widgets" representation
 * lives upstream as `facts.choices`, not here. A generic/`raw` archetype for custom
 * widgets is deferred (ADR 008).
 */
export type FieldControl =
  | { kind: 'input'; attrs: HtmlInputAttrs }
  | { kind: 'select'; attrs: HtmlSelectAttrs; options: SelectOption[] }
  | { kind: 'textarea'; attrs: HtmlTextareaAttrs }
  | {
      kind: 'choicegroup'
      multiple: boolean
      /**
       * Group a11y, derived in Core so every adapter is identical and no adapter
       * recomputes it (bd l8j). `role` is the ARIA grouping role — `radiogroup`
       * for a single-choice radio set, `group` for a multi-choice checkbox set
       * (there is no `checkboxgroup` role). `labelledBy` is the id of this field's
       * caption `<label>` (see `FieldPartsBase.label`); the wrapper carries
       * `aria-labelledby={labelledBy}`, which names the group WITHOUT the
       * label-for-first-option hack (that hack, from cm7, activated the first
       * option on caption click). Together they are the canonical
       * role + aria-labelledby grouping pattern.
       */
      role: 'radiogroup' | 'group'
      labelledBy: string
      options: ChoiceOption[]
    }

export type ControlKind = FieldControl['kind']

export interface FieldPartsBase {
  container: { key: string }
  /**
   * The caption's DOM attributes as ONE spreadable bag (neutral HTML names —
   * adapters rename `for`→`htmlFor` etc. in a single place, never per-part).
   * Every caption carries an `id` so it can always be an `aria-labelledby`
   * target; a field with a single control additionally points `for` at that
   * control (click-to-focus). A `choicegroup` has no single control, so it omits
   * `for` and the group wrapper names itself via `aria-labelledby`
   * (= `control.labelledBy`, which equals this `id`) — bd l8j.
   */
  label: {
    text: string
    attrs: { id: string; for?: string }
    showRequired: boolean
  }
  description?: { text: string }
}

// Every field has the same parts shape: common parts + one `control` facet. The
// widget variation lives inside `control` (discriminated on `kind`), not in the
// node type (ADR 029 §5/§6, amended by bd v60).
export interface FieldParts extends FieldPartsBase {
  control: FieldControl
}

export interface GroupParts {
  container: { key: string }
  label?: { text: string }
  description?: { text: string }
}

export interface ArrayParts {
  container: { key: string }
  itemsContainer: { key: string }
  addButton: { attrs: { type: 'button' }; label: string }
  label?: { text: string }
  description?: { text: string }
}

export interface ArrayItemParts {
  container: { key: string }
  removeButton: { attrs: { type: 'button' }; label: string }
}

// Fields shared by every node. Validation rules are NOT here — they live once on
// `facts.constraints` (ADR 033 §1); nodes without facts (`ArrayItemNode`) carry no
// constraints of their own (item requiredness rides on the array). No `schema` here
// either (ADR 033 §4): the only originating-schema reference is the front-end-owned
// `origin.schema` on facts, which Core treats as opaque.
interface NodeBase {
  path: string
  isRoot: boolean
  depth: number
  toJSON(): object
}

// Traversal/query surface shared by container nodes. All three range over the
// same *instantiated* tree — the nodes `walk` visits — including array items
// (ADR 032). `getField`/`getAllFields` traverse arrays just like `walk`; use
// `ArrayNode.getItem(i)` to reach an item that has not been instantiated yet.
interface ContainerMethods<S = unknown> {
  children: AnyNode<S>[]
  /**
   * Resolve a leaf by path relative to this node. Numeric segments select array
   * items by index (e.g. `'members.0.name'`); an out-of-range index or a
   * non-numeric segment where an index is expected yields `undefined` (ADR 032).
   */
  getField(path: string): FieldNode<S> | undefined
  /** Flat list of every instantiated leaf, arrays included — ≡ `walk({ field })` (ADR 032). */
  getAllFields(): FieldNode<S>[]
  walk<R>(handlers?: WalkHandlers<R, S>): R[]
}

// A field leaf (ADR 029 §5/§6, amended by bd v60): a single interface. The widget
// variation lives in `parts.control` (discriminated on `control.kind`), NOT in the
// node type — so nothing that handles *nodes* narrows on widget. `widget` is the
// resolved name (a label); the adapter dispatches on `control.kind`.
export interface FieldNode<S = unknown> extends NodeBase {
  nodeType: 'field'
  widget: WidgetName
  /** Neutral facts the `present()` stage reads to assign a widget (ADR 029). */
  facts: LeafFacts<S>
  parts: FieldParts
  /**
   * The resolver's generic per-widget config bag (ADR 029 §6), carried through
   * when a `PresentationResolver` returns `args` — e.g. `{ optionsSource,
   * valueKey, labelKey }` for a collapsed object-array multiselect (ADR 030 §4).
   * Source + value identity live here, never in the neutral `facts`.
   */
  args?: Record<string, unknown>
  isField: true
  isGroup: false
  isArray: false
  isArrayItem: false
}

export interface GroupNode<S = unknown> extends NodeBase, ContainerMethods<S> {
  nodeType: 'group'
  widget: 'fieldset'
  /** Neutral container facts (ADR 030 §1) — `valueShape: 'object'`. A resolver
   * may collapse the subtree into one object-valued widget (ADR 030 §2/§5). */
  facts: ContainerFacts<S>
  parts: GroupParts
  isField: false
  isGroup: true
  isArray: false
  isArrayItem: false
  submit(
    onSubmit: (data: Record<string, unknown>) => void
  ): (e: { preventDefault(): void; currentTarget: EventTarget | null }) => void
}

export interface ArrayNode<S = unknown> extends NodeBase, ContainerMethods<S> {
  nodeType: 'array'
  widget: 'array'
  /** Neutral container facts (ADR 030 §1) — `valueShape: 'array'`, plus an `item`
   * descriptor (open-ended element source). A resolver may collapse the add/remove
   * subtree into one array-valued widget, e.g. a multiselect (ADR 030 §5). */
  facts: ContainerFacts<S>
  parts: ArrayParts
  isField: false
  isGroup: false
  isArray: true
  isArrayItem: false
  getItem(index: number): ArrayItemNode<S>
}

export interface ArrayItemNode<S = unknown>
  extends NodeBase,
    ContainerMethods<S> {
  nodeType: 'arrayItem'
  widget: 'arrayItem'
  parts: ArrayItemParts
  isField: false
  isGroup: false
  isArray: false
  isArrayItem: true
}

// Every concrete node.
export type AnyNode<S = unknown> =
  | FieldNode<S>
  | GroupNode<S>
  | ArrayNode<S>
  | ArrayItemNode<S>

// Container nodes (those with children) — used by walk plumbing.
export type ContainerNode<S = unknown> =
  | GroupNode<S>
  | ArrayNode<S>
  | ArrayItemNode<S>

export interface WalkHandlers<R, S = unknown> {
  field?: (node: FieldNode<S>, handlers: WalkHandlers<R, S>) => R
  group?: (node: GroupNode<S>, handlers: WalkHandlers<R, S>) => R
  array?: (node: ArrayNode<S>, handlers: WalkHandlers<R, S>) => R
  arrayItem?: (node: ArrayItemNode<S>, handlers: WalkHandlers<R, S>) => R
}

/**
 * Schema-agnostic boundary aliases for adapters that never read
 * `facts.origin.schema`. Once `S` threads through `walk`, `GroupNode<S>` is
 * invariant in `S` — a front-end-specialized tree is not assignable to
 * `GroupNode<unknown>`. Framework renderers accept these instead (ADR 033 §4).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- invariant GroupNode<S> */
export type AnyGroupNode = GroupNode<any>
export type AnyTreeNode = AnyNode<any>
/* eslint-enable @typescript-eslint/no-explicit-any */
