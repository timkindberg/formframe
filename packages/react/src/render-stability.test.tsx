// Render-stability / re-render contract (bead jsonschema-form-bi4).
//
// The library must behave like a well-optimized, hand-crafted React tree:
// an unrelated re-render somewhere above the form must NOT remount the fields
// or discard the user's typed-in (uncontrolled) values, and a state change must
// re-render only the nodes that actually changed. These tests encode that
// contract — DOM identity + value preservation (black-box) and, later, render
// counts (the perf contract) via a counting adapter.

import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { useState } from 'react'
import { jsonSchemaToTree } from '@jsonschema-form/core'
import type { JSONSchema } from '@jsonschema-form/core'
import { SchemaFields } from './renderer'

const schema: JSONSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
  },
}

describe('render stability', () => {
  it('an unrelated parent re-render preserves typed input values (no remount)', async () => {
    const form = jsonSchemaToTree(schema)

    function Parent() {
      const [n, setN] = useState(0)
      return (
        <div>
          <button type="button" onClick={() => setN((x) => x + 1)}>
            bump {n}
          </button>
          <SchemaFields form={form} />
        </div>
      )
    }

    const screen = await render(<Parent />)
    const name = screen.getByRole('textbox', { name: 'Name' })
    await name.fill('hello')
    await expect.element(name).toHaveValue('hello')

    // capture the live input node, then force an unrelated re-render above the form
    const before = document.querySelector('input')
    await screen.getByRole('button', { name: /bump/ }).click()

    // the typed value must survive…
    await expect.element(name).toHaveValue('hello')
    // …and it must be the very same DOM node (i.e. React did not remount it)
    const after = document.querySelector('input')
    expect(after).toBe(before)
  })

  // The sharper case: a node that ACTUALLY re-renders (not a memo bail) must
  // still reconcile in place. A consumer that inlines `renderNode` hands a new
  // closure every parent render, so the resolver prop changes and every
  // NodeRenderer re-renders — the realistic trigger. The component handle
  // `<Default of={node} />` (a stable module-level type, data via the `of` prop)
  // keeps the uncontrolled input mounted; mounting a per-render closure as a
  // fresh component type would remount it and discard the value (ADR 016/017).
  it('an inlined renderNode (new identity each render) does not remount fields', async () => {
    const form = jsonSchemaToTree(schema)

    function Parent() {
      const [n, setN] = useState(0)
      return (
        <div>
          <button type="button" onClick={() => setN((x) => x + 1)}>
            bump {n}
          </button>
          {/* fresh closure every render → resolver prop changes → real re-render */}
          <SchemaFields
            form={form}
            renderNode={(node, { Default }) => <Default of={node} />}
          />
        </div>
      )
    }

    const screen = await render(<Parent />)
    const name = screen.getByRole('textbox', { name: 'Name' })
    await name.fill('hello')
    await expect.element(name).toHaveValue('hello')

    const before = document.querySelector('input')
    await screen.getByRole('button', { name: /bump/ }).click()

    await expect.element(name).toHaveValue('hello')
    const after = document.querySelector('input')
    expect(after).toBe(before)
  })
})
