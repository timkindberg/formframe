import { serializeNode, type ValidationRules } from './utils'
import { presentDefaultLeaf } from '../present/present'
import type { LeafFacts, FieldNode } from './nodeTypes'

// Re-export for type inference
export type { ValidationRules }

/**
 * Neutral builder (ADR 033 §3): assemble a leaf {@link FieldNode} from already-
 * neutral {@link LeafFacts}. It reads NO schema — a front-end produces the facts.
 * Widget + control parts come solely from the present stage's default rule and
 * Core widget catalog (bd 9pb); `useSchemaForm` re-runs `present()` with any
 * consumer resolver on top, while a direct `jsonSchemaToTree` consumer still gets a
 * fully-formed, default-presented tree.
 */
export function createFieldNode(input: { facts: LeafFacts }): FieldNode {
  const { facts } = input
  const { path } = facts
  const wp = presentDefaultLeaf(facts)
  const node: FieldNode = {
    nodeType: 'field',
    path,
    facts,
    widget: wp.widget,
    parts: wp.parts,
    isRoot: path === '',
    depth: path ? path.split('.').length : 0,
    isField: true,
    isGroup: false,
    isArray: false,
    isArrayItem: false,
    toJSON() {
      return serializeNode(this)
    },
  }
  return node
}

export type { FieldNode, FieldParts } from './nodeTypes'
