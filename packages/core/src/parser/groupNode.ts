import {
  transformCheckboxes,
  omitEmptyFormValues,
  unflatten,
  forceArrayFields,
  normalizeArrayFieldPath,
} from './groupNode.submitUtils'
import { serializeNode, walkNode } from './utils'
import type {
  AnyNode,
  ContainerFacts,
  FieldNode,
  GroupNode,
  GroupParts,
  WalkHandlers,
} from './nodeTypes'

/**
 * Neutral builder (ADR 033 §3): assemble a {@link GroupNode} from already-neutral
 * container facts, its already-built `children`, and its `parts`. Reads NO schema —
 * a front-end recurses its own structure to produce the children and derives the
 * parts. Core owns only the query/traversal/submit surface below.
 */
export function createGroupNode<S = unknown>(input: {
  facts: ContainerFacts<S>
  children: AnyNode<S>[]
  parts: GroupParts
}): GroupNode<S> {
  const { facts, children, parts } = input
  const { path } = facts

  const groupNode: GroupNode<S> = {
    nodeType: 'group',
    path,
    widget: 'fieldset',
    facts,
    children,

    // Computed properties
    isRoot: path === '',
    depth: path ? path.split('.').length : 0,

    // Parts API
    parts,

    // Read `this.children`/`this.path` (not the closure) so a rebuilt node from
    // the present() pass (ADR 029) — a spread with new `children` — queries its
    // own children, not the pre-present ones.
    getField(targetPath: string): FieldNode<S> | undefined {
      // Search descendants relative to this group
      // If this group has path 'address', searching for 'street' finds 'address.street'
      const fullPath = this.path ? `${this.path}.${targetPath}` : targetPath

      for (const child of this.children) {
        if (child.nodeType === 'field' && child.path === fullPath) {
          return child
        } else if (child.nodeType === 'group' || child.nodeType === 'array') {
          // Target is within this child's subtree. Groups and arrays both take a
          // path relative to themselves; the array consumes the leading segment
          // as an item index (ADR 032). `fullPath === child.path` only matters
          // for a group (a bare group is not a field); an array is never a leaf.
          if (
            fullPath.startsWith(child.path + '.') ||
            fullPath === child.path
          ) {
            const relativePath = fullPath.substring(child.path.length + 1)
            const found = child.getField(relativePath)
            if (found) return found
          }
        }
      }
      return undefined
    },

    getAllFields(): FieldNode<S>[] {
      const fields: FieldNode<S>[] = []

      for (const child of this.children) {
        if (child.nodeType === 'field') {
          fields.push(child)
        } else if (child.nodeType === 'group' || child.nodeType === 'array') {
          // Arrays fold over their instantiated items (ADR 032), so array-item
          // leaves are included — getAllFields() ≡ walk({ field }).
          fields.push(...child.getAllFields())
        }
      }

      return fields
    },

    walk<R>(handlers?: WalkHandlers<R, S>): R[] {
      return walkNode(this, handlers)
    },

    isField: false,
    isGroup: true,
    isArray: false,
    isArrayItem: false,

    toJSON() {
      return serializeNode(this)
    },

    submit(onSubmit: (data: Record<string, unknown>) => void) {
      // Only allow submit on root nodes
      if (!this.isRoot) {
        throw new Error(
          'submit() can only be called on root GroupNode. Use form.submit() where form is the root node.'
        )
      }

      return (e: {
        preventDefault(): void
        currentTarget: EventTarget | null
      }) => {
        e.preventDefault()

        const target = e.currentTarget as HTMLFormElement
        if (!target) return

        const formData = new FormData(target)

        // Signatures of every array-valued leaf field, keyed by normalized path so
        // one signature covers all item instances. A leaf submits an array when
        // EITHER its neutral `facts.valueShape === 'array'` (a native array-enum
        // leaf) OR its resolved *control* is multi-valued — a `multiple` select or
        // a checkbox `choicegroup`. Multiplicity is read off the typed control
        // archetype (`kind` + `multiple`), NOT the widget name, so submit stays
        // decoupled from presentation vocabulary and any custom widget that renders
        // as a multi-select/checkbox group is covered for free. The control arm is
        // load-bearing: a resolver can present a scalar-valueShape enum as a
        // multi-select (ADR 029 golden scenario), and submit must follow the
        // control — wrapping a lone selection as a 1-element array — even though the
        // underlying facts stayed scalar. (Keying on valueShape alone, bd cm7,
        // silently dropped that case.) A representative item (getItem(0)) is walked
        // so nested array leaves are found even when the array has no compiled items.
        const arrayFieldSignatures = new Set<string>()
        const collectHandlers: WalkHandlers<void, S> = {
          field(fieldNode) {
            const control = fieldNode.parts.control
            const submitsArray =
              fieldNode.facts.valueShape === 'array' ||
              (control.kind === 'select' && control.attrs.multiple === true) ||
              (control.kind === 'choicegroup' && control.multiple === true)
            if (submitsArray) {
              arrayFieldSignatures.add(normalizeArrayFieldPath(fieldNode.path))
            }
          },
          array(arrayNode) {
            arrayNode.getItem(0).walk<void>(collectHandlers)
          },
        }
        this.walk<void>(collectHandlers)

        // Collect all values, handling multiselect (multiple entries with same name)
        const flat: Record<string, unknown> = {}
        for (const [key, value] of formData.entries()) {
          if (key in flat) {
            // Multiple values for same key - collect as array (e.g., multiselect)
            if (Array.isArray(flat[key])) {
              ;(flat[key] as unknown[]).push(value)
            } else {
              flat[key] = [flat[key], value]
            }
          } else {
            flat[key] = value
          }
        }

        // Unfilled native inputs submit as '' — treat as absent so required
        // validation fails on missing keys, not on type/format of empty string.
        const withoutEmpty = omitEmptyFormValues(flat)

        // Ensure array fields are always arrays, even with a single value.
        const withArrays = forceArrayFields(withoutEmpty, arrayFieldSignatures)

        // Transform: checkbox "on" -> true
        const transformed = transformCheckboxes(withArrays)

        // Unflatten: "address.street" -> { address: { street: ... } }
        const nested = unflatten(transformed)

        onSubmit(nested)
      }
    },
  }

  return groupNode
}

export type { GroupNode, GroupParts, WalkHandlers }
