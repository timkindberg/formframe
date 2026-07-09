// Test-only helpers (excluded from the build — see tsconfig `exclude`).
//
// Node kinds are a runtime property of the compiled tree, so statically-typed
// `find()`/`children[]` lookups can't know a node is an array or group. These
// helpers narrow `AnyNode` via the boolean-literal discriminants, throwing a
// clear message otherwise.

import type {
  AnyNode,
  ArrayNode,
  FieldNode,
  GroupNode,
} from '@jsonschema-form/core'

export function assertArrayNode(
  node: AnyNode | undefined
): asserts node is ArrayNode {
  if (!node?.isArray) {
    throw new Error(
      `expected an array node at "${node?.path ?? 'missing'}", got "${node?.nodeType ?? 'none'}"`
    )
  }
}

export function assertGroupNode(
  node: AnyNode | undefined
): asserts node is GroupNode {
  if (!node?.isGroup) {
    throw new Error(
      `expected a group node at "${node?.path ?? 'missing'}", got "${node?.nodeType ?? 'none'}"`
    )
  }
}

export function assertField(
  node: AnyNode | undefined
): asserts node is FieldNode {
  if (!node?.isField) {
    throw new Error(
      `expected a field node at "${node?.path ?? 'missing'}", got "${node?.nodeType ?? 'none'}"`
    )
  }
}
