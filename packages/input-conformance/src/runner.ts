// The oracle runner. A front-end's colocated conformance test calls
// `runInputConformance(label, buildTree)`, passing a function that compiles each
// scenario id into a Core tree with ITS OWN front-end. The runner folds every
// oracle scenario (scenarios.ts) over that tree and asserts the neutral tree
// surface matches — so any front-end is checked against the SAME reference,
// never against another front-end (the packages stay mutually ignorant, ADR 039).
//
// Generic in the origin type `S` so `GroupNode<JSONSchemaObject>` and
// `GroupNode<ZodType>` both satisfy it without tripping over `S`-invariance
// (bd wo8); the runner reads only neutral facts and parts, never `origin.schema`.

import { describe, it, expect } from 'vitest'
import type { AnyNode, GroupNode, ValidationRules } from '@jsonschema-form/core'
import {
  conformanceScenarios,
  type NodeSpec,
  type ScenarioId,
} from './scenarios'

function childPath(parent: string, key: string): string {
  return parent ? `${parent}.${key}` : key
}

function assertConstraints(
  actual: ValidationRules,
  expected: Partial<ValidationRules> | undefined,
  path: string
): void {
  if (!expected) return
  const bag = actual as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries(expected)) {
    expect(bag[key], `"${path}" constraints.${key}`).toBe(value)
  }
}

function assertNode<S>(
  node: AnyNode<S> | undefined,
  spec: NodeSpec,
  path: string
): void {
  expect(node, `expected a node at "${path}"`).toBeDefined()
  if (!node) return

  if (spec.node === 'field') {
    expect(node.isField, `"${path}" should be a field`).toBe(true)
    if (!node.isField) return
    const f = node.facts
    expect(node.widget, `"${path}" widget`).toBe(spec.widget)
    expect(f.primitive, `"${path}" primitive`).toBe(spec.primitive)
    expect(f.valueShape, `"${path}" valueShape`).toBe(spec.valueShape)
    expect(f.required, `"${path}" required`).toBe(spec.required)
    if (spec.format !== undefined) {
      expect(f.format, `"${path}" format`).toBe(spec.format)
    }
    if (spec.choices !== undefined) {
      expect(f.choices, `"${path}" choices`).toEqual(spec.choices)
      const control = node.parts.control
      const controlValues =
        control.kind === 'choicegroup'
          ? control.options.map((option) => option.attrs.value)
          : control.kind === 'select'
            ? control.options.map((option) => option.value)
            : undefined
      expect(controlValues, `"${path}" control choice values`).toEqual(
        spec.choices.map((choice) => choice.value)
      )
    }
    assertConstraints(f.constraints, spec.constraints, path)
    return
  }

  if (spec.node === 'array') {
    expect(node.isArray, `"${path}" should be an array`).toBe(true)
    if (!node.isArray) return
    const f = node.facts
    expect(f.valueShape, `"${path}" valueShape`).toBe('array')
    expect(f.required, `"${path}" required`).toBe(spec.required)
    if (spec.item !== undefined) {
      expect(f.item, `"${path}" item descriptor`).toEqual(spec.item)
    }
    assertConstraints(f.constraints, spec.constraints, path)
    return
  }

  // group
  expect(node.isGroup, `"${path}" should be a group`).toBe(true)
  if (!node.isGroup) return
  expect(node.facts.valueShape, `"${path}" valueShape`).toBe('object')
  expect(node.facts.required, `"${path}" required`).toBe(spec.required)
  assertChildren(node.children, path, spec.children)
}

function assertChildren<S>(
  children: AnyNode<S>[],
  parentPath: string,
  specs: Record<string, NodeSpec>
): void {
  for (const [key, spec] of Object.entries(specs)) {
    const path = childPath(parentPath, key)
    assertNode(
      children.find((c) => c.path === path),
      spec,
      path
    )
  }
}

/**
 * Run the shared oracle against one front-end. `buildTree` compiles a scenario id
 * into a Core tree using that front-end's own compiler (e.g.
 * `(id) => zodToTree(schemas[id])`). Emits one `it` per scenario under a labelled
 * `describe`, so a mismatch names the exact front-end + scenario + path.
 */
export function runInputConformance<S>(
  label: string,
  buildTree: (id: ScenarioId) => GroupNode<S>
): void {
  describe(`input conformance: ${label} ≡ oracle`, () => {
    for (const scenario of conformanceScenarios) {
      it(`${scenario.id} — ${scenario.description}`, () => {
        const tree = buildTree(scenario.id)
        assertChildren(tree.children, '', scenario.expect)
      })
    }
  })
}
