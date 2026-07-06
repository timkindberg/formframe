// Explicit node interfaces forming a recursive, discriminated union.
//
// Every node carries `nodeType` plus boolean-literal discriminants
// (`isField`/`isGroup`/`isArray`/`isArrayItem`), so a value typed as
// `AnyNode` narrows on either: `if (node.isArray) { node.getItem(0) }`.
//
// Interfaces (not ReturnType-derived aliases) are required here because
// container `children` reference `AnyNode`, which references the containers —
// a recursion that type aliases cannot express but interfaces can.

import type { JSONSchemaObject, ValidationRules } from './utils'

export type NodeType = 'field' | 'group' | 'array' | 'arrayItem'

export interface SelectOption {
  value: string | number
  label: string
}

/**
 * Neutral, front-end-agnostic facts about a leaf field (ADR 029). The parser
 * produces these instead of deciding a widget; the `present()` stage reads them
 * to assign a widget and derive control parts. `valueShape` is `'scalar' |
 * 'array'` today — `'object'` (object-collapsing widgets) is deferred until such
 * a widget earns it. `origin.schema` is the originating subschema (front-end-
 * specific; only front-ends and consumer resolvers read it — ADR 029 §2).
 */
export interface FieldFacts {
  path: string
  label: string
  description?: string
  required: boolean
  primitive: 'string' | 'number' | 'integer' | 'boolean'
  valueShape: 'scalar' | 'array'
  format?: string
  choices?: SelectOption[]
  constraints: ValidationRules
  attrs: { id: string; name: string }
  origin: { source: string; schema: JSONSchemaObject }
}

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

// Fields shared by every node.
interface NodeBase {
  path: string
  schema: JSONSchemaObject
  isRoot: boolean
  depth: number
  validation: ValidationRules
  toJSON(): object
}

// Traversal/query surface shared by container nodes. All three range over the
// same *instantiated* tree — the nodes `walk` visits — including array items
// (ADR 032). `getField`/`getAllFields` traverse arrays just like `walk`; use
// `ArrayNode.getItem(i)` to reach an item that has not been instantiated yet.
interface ContainerMethods {
  children: AnyNode[]
  /**
   * Resolve a leaf by path relative to this node. Numeric segments select array
   * items by index (e.g. `'members.0.name'`); an out-of-range index or a
   * non-numeric segment where an index is expected yields `undefined` (ADR 032).
   */
  getField(path: string): FieldNode | undefined
  /** Flat list of every instantiated leaf, arrays included — ≡ `walk({ field })` (ADR 032). */
  getAllFields(): FieldNode[]
  walk<R>(handlers?: WalkHandlers<R>): R[]
}

// A field leaf (ADR 029 §5/§6, amended by bd v60): a single interface. The widget
// variation lives in `parts.control` (discriminated on `control.kind`), NOT in the
// node type — so nothing that handles *nodes* narrows on widget. `widget` is the
// resolved name (a label); the adapter dispatches on `control.kind`.
export interface FieldNode extends NodeBase {
  nodeType: 'field'
  widget: WidgetName
  /** Neutral facts the `present()` stage reads to assign a widget (ADR 029). */
  facts: FieldFacts
  parts: FieldParts
  isField: true
  isGroup: false
  isArray: false
  isArrayItem: false
}

export interface GroupNode extends NodeBase, ContainerMethods {
  nodeType: 'group'
  widget: 'fieldset'
  parts: GroupParts
  isField: false
  isGroup: true
  isArray: false
  isArrayItem: false
  submit(
    onSubmit: (data: Record<string, unknown>) => void
  ): (e: { preventDefault(): void; currentTarget: EventTarget | null }) => void
}

export interface ArrayNode extends NodeBase, ContainerMethods {
  nodeType: 'array'
  widget: 'array'
  parts: ArrayParts
  itemSchema: JSONSchemaObject
  isField: false
  isGroup: false
  isArray: true
  isArrayItem: false
  getItem(index: number): ArrayItemNode
}

export interface ArrayItemNode extends NodeBase, ContainerMethods {
  nodeType: 'arrayItem'
  widget: 'arrayItem'
  parts: ArrayItemParts
  isField: false
  isGroup: false
  isArray: false
  isArrayItem: true
}

// Every concrete node.
export type AnyNode = FieldNode | GroupNode | ArrayNode | ArrayItemNode

// Container nodes (those with children) — used by walk plumbing.
export type ContainerNode = GroupNode | ArrayNode | ArrayItemNode

export interface WalkHandlers<R> {
  field?: (node: FieldNode, handlers: WalkHandlers<R>) => R
  group?: (node: GroupNode, handlers: WalkHandlers<R>) => R
  array?: (node: ArrayNode, handlers: WalkHandlers<R>) => R
  arrayItem?: (node: ArrayItemNode, handlers: WalkHandlers<R>) => R
}
