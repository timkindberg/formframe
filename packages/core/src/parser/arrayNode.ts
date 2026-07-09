import { presentDefaultItem } from '../present/present'
import { serializeNode, walkNode } from './utils'
import type {
  AnyNode,
  ArrayNode,
  ArrayParts,
  ArrayItemNode,
  ArrayItemParts,
  ContainerFacts,
  FieldNode,
  WalkHandlers,
} from './nodeTypes'

/**
 * Neutral builder (ADR 033 §3): assemble an {@link ArrayNode} from already-neutral
 * container facts, its `parts`, its `seed` items (the compiled `minItems` prefix),
 * and an `itemFactory` closure the front-end supplies to materialize one raw item
 * on demand. Reads NO schema — Core no longer knows how to parse an array item; it
 * just calls the factory (replacing the old `itemSchema` + schema-reading getItem).
 * The front-end emits an add/remove ArrayNode carrying either `choices` (finite
 * scalar-choice set) or an `item` descriptor; present()'s default rule collapses a
 * scalar-choice array into one multiselect/checkboxes leaf (ADR 030 §3).
 */
export function createArrayNode<S = unknown>(input: {
  facts: ContainerFacts<S>
  parts: ArrayParts
  seed: ArrayItemNode<S>[]
  itemFactory: (index: number) => ArrayItemNode<S>
}): ArrayNode<S> {
  const { facts, parts, seed, itemFactory } = input
  const { path } = facts

  if (facts.choices !== undefined && facts.item !== undefined) {
    throw new Error(
      `createArrayNode at "${path}": ContainerFacts must set choices OR item, not both (ADR 030 §3)`
    )
  }

  const arrayNode: ArrayNode<S> = {
    nodeType: 'array',
    path,
    widget: 'array',
    facts,
    children: seed,

    // Computed properties
    isRoot: path === '',
    depth: path ? path.split('.').length : 0,

    // Parts API
    parts,

    // Factory method for creating items dynamically. The front-end's factory emits
    // raw structure; Core presents it under the default rule so its nested
    // scalar-choice arrays collapse exactly like the static tree (ADR 030 §3).
    getItem(index: number) {
      return presentDefaultItem(itemFactory(index))
    },

    // `targetPath` is relative to this array; its leading segment is an item
    // index (ADR 032), e.g. '0.name' or '2'. Resolve to the instantiated item at
    // that index and delegate the remainder. Reads `this.children` (not the
    // closure) so a present()-rebuilt node (ADR 029) queries its own children.
    getField(targetPath: string): FieldNode<S> | undefined {
      if (targetPath === '') return undefined // the array itself is not a field
      const dot = targetPath.indexOf('.')
      const indexSeg = dot === -1 ? targetPath : targetPath.slice(0, dot)
      const rest = dot === -1 ? '' : targetPath.slice(dot + 1)

      const index = Number(indexSeg)
      if (!Number.isInteger(index) || index < 0) return undefined

      const itemPath = `${this.path}.${index}`
      for (const child of this.children) {
        if (child.nodeType === 'arrayItem' && child.path === itemPath) {
          return child.getField(rest)
        }
      }
      return undefined
    },

    getAllFields(): FieldNode<S>[] {
      const fields: FieldNode<S>[] = []
      for (const child of this.children) {
        if (child.nodeType === 'arrayItem') {
          fields.push(...child.getAllFields())
        }
      }
      return fields
    },

    walk<R>(handlers?: WalkHandlers<R, S>): R[] {
      return walkNode(this, handlers)
    },

    isField: false,
    isGroup: false,
    isArray: true,
    isArrayItem: false,

    toJSON() {
      return serializeNode(this)
    },
  }

  return arrayNode
}

export type { ArrayNode, ArrayParts }

/**
 * Neutral builder (ADR 033 §3): wrap one already-built `child` node in an
 * {@link ArrayItemNode}. Reads NO schema — the front-end compiles the child at the
 * item path and Core derives the item's path/depth from it and the structural parts
 * (a remove button). The item's path IS the child's path (both are the item path).
 */
export function createArrayItemNode<S = unknown>(input: {
  child: AnyNode<S>
}): ArrayItemNode<S> {
  const { child } = input
  const itemPath = child.path

  const parts: ArrayItemParts = {
    container: { key: itemPath },
    removeButton: { attrs: { type: 'button' }, label: 'Remove' },
  }

  const itemNode: ArrayItemNode<S> = {
    nodeType: 'arrayItem',
    path: itemPath,
    widget: 'arrayItem',
    children: [child],

    // Computed properties
    isRoot: false,
    depth: itemPath.split('.').length,

    // Parts API
    parts,

    // `targetPath` is relative to this item (ADR 032). For a primitive-array
    // item the item *is* the leaf, so the empty remainder selects it; for an
    // object/array item, delegate the remainder to the wrapped child.
    getField(targetPath: string): FieldNode<S> | undefined {
      const c = this.children[0]
      if (c.nodeType === 'field') {
        return targetPath === '' ? c : undefined
      } else if (c.nodeType === 'group' || c.nodeType === 'array') {
        return c.getField(targetPath)
      }
      return undefined
    },

    getAllFields(): FieldNode<S>[] {
      const c = this.children[0]
      if (c.nodeType === 'field') {
        return [c]
      } else if (c.nodeType === 'group' || c.nodeType === 'array') {
        return c.getAllFields()
      }
      return []
    },

    walk<R>(handlers?: WalkHandlers<R, S>): R[] {
      return walkNode(this, handlers)
    },

    isField: false,
    isGroup: false,
    isArray: false,
    isArrayItem: true,

    toJSON() {
      return serializeNode(this)
    },
  }

  return itemNode
}

export type { ArrayItemNode, ArrayItemParts }
