// Component re-entry layer (ADR 017) — the JSX handles over the callable engine.
//
// ADR 016 made the React fold render by *calling* `node.Default()` (stable
// component types, no remount). This layer restores JSX ergonomics without the
// remount: `<Default of={node} />` / `<Children of={node} />` are ONE module-
// level stable component each, taking the handle as a prop, delegating to the
// node's own bound callable. So they reconcile in place, work in- and out-of-
// position, render parts too (`of={node.parts.label}`), and are null-safe. The
// two IOC seams (`renderNode`, the root render-prop) inject `{ Default, Children }`.

import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { useState } from 'react'
import { jsonSchemaToTree } from '@jsonschema-form/input-jsonschema'
import type { JSONSchema } from '@jsonschema-form/input-jsonschema'
import { SchemaFields, Default, Children } from './index'

const schema: JSONSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name', description: 'Your name' },
    // 6 options (> OPTION_COUNT_THRESHOLD) so this stays a <select> — the fixture
    // exercises the combobox/select archetype (small enums default to radio, cm7).
    color: {
      type: 'string',
      title: 'Color',
      enum: ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow'],
    },
    address: {
      type: 'object',
      title: 'Address',
      properties: { street: { type: 'string', title: 'Street' } },
    },
  },
  required: ['name'],
}

describe('component handles — <Default of/> / <Children of/>', () => {
  it('injects { Default } into renderNode; <Default of={node}/> renders the default', async () => {
    const form = jsonSchemaToTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        renderNode={(node, { Default }) => <Default of={node} />}
      />
    )
    await expect
      .element(screen.getByRole('textbox', { name: 'Name' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('combobox', { name: 'Color' }))
      .toBeInTheDocument()
  })

  it('is importable AND injected — both refer to the same component', async () => {
    const form = jsonSchemaToTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        renderNode={(node, helpers) => {
          expect(helpers.Default).toBe(Default)
          expect(helpers.Children).toBe(Children)
          return <Default of={node} />
        }}
      />
    )
    await expect
      .element(screen.getByRole('textbox', { name: 'Name' }))
      .toBeInTheDocument()
  })

  it('renders a PART via <Default of={part}/>, and is null-safe for an absent part', async () => {
    const form = jsonSchemaToTree(schema)
    const screen = await render(
      <SchemaFields form={form}>
        {(root, { Default }) => {
          const name = root.children.name
          const color = root.children.color
          return (
            <>
              {name.isField && (
                <div data-testid="name-hand">
                  <Default of={name.parts.label} />
                  {/* present description renders */}
                  <Default of={name.parts.description} />
                </div>
              )}
              {color.isField && (
                <div data-testid="color-hand">
                  <Default of={color.parts.label} />
                  {/* color has NO description → null-safe, must not throw */}
                  <Default of={color.parts.description} />
                </div>
              )}
            </>
          )
        }}
      </SchemaFields>
    )
    // name's description part rendered, color's label part rendered…
    await expect.element(screen.getByText('Your name')).toBeInTheDocument()
    await expect.element(screen.getByText('Color')).toBeInTheDocument()
    // …and color's absent description rendered nothing without throwing.
    await expect.element(screen.getByTestId('color-hand')).toBeInTheDocument()
  })

  it('renders container children via <Children of={node}/> inside a hijacked wrapper', async () => {
    const form = jsonSchemaToTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        renderNode={(node, { Default, Children }) =>
          node.isGroup && node.path === 'address' ? (
            <section data-testid="addr-wrap">
              <Children of={node} />
            </section>
          ) : (
            <Default of={node} />
          )
        }
      />
    )
    await expect.element(screen.getByTestId('addr-wrap')).toBeInTheDocument()
    // the group's child still rendered through the engine
    await expect
      .element(screen.getByRole('textbox', { name: 'Street' }))
      .toBeInTheDocument()
  })

  it('a node that truly re-renders via <Default of/> keeps its value (no remount)', async () => {
    const form = jsonSchemaToTree(schema)

    function Parent() {
      const [n, setN] = useState(0)
      return (
        <div>
          <button type="button" onClick={() => setN((x) => x + 1)}>
            bump {n}
          </button>
          {/* fresh closure every render → resolver identity changes → real re-render */}
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
    const before = document.querySelector('input')
    await screen.getByRole('button', { name: /bump/ }).click()

    await expect.element(name).toHaveValue('hello')
    expect(document.querySelector('input')).toBe(before)
  })
})
