// Test-only helpers (excluded from the build — see tsconfig `exclude`).
//
// Node kinds are a runtime property of the parsed tree, so statically-typed
// `find()`/`children[]` lookups can't know a node is an array or group. These
// helpers narrow `AnyNode` via the boolean-literal discriminants, throwing a
// clear message otherwise.

import type {
  AnyNode,
  ArrayNode,
  FieldNode,
  GroupNode,
} from '@jsonschema-form/core'

export function assertArrayNode<S = unknown>(
  node: AnyNode<S> | undefined
): asserts node is ArrayNode<S> {
  if (!node?.isArray) {
    throw new Error(
      `expected an array node at "${node?.path ?? 'missing'}", got "${node?.nodeType ?? 'none'}"`
    )
  }
}

export function assertGroupNode<S = unknown>(
  node: AnyNode<S> | undefined
): asserts node is GroupNode<S> {
  if (!node?.isGroup) {
    throw new Error(
      `expected a group node at "${node?.path ?? 'missing'}", got "${node?.nodeType ?? 'none'}"`
    )
  }
}

export function assertField<S = unknown>(
  node: AnyNode<S> | undefined
): asserts node is FieldNode<S> {
  if (!node?.isField) {
    throw new Error(
      `expected a field node at "${node?.path ?? 'missing'}", got "${node?.nodeType ?? 'none'}"`
    )
  }
}
