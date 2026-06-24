// Array add/remove UI (bead jsonschema-form-bi4).
//
// Complex arrays (objects / bare primitives) render a captioned container, the
// seed items (minItems), an Add control, and a Remove control per item. The
// interactive behavior is React-only (the string oracle renders the same markup
// inert); these tests assert the React behavior — markup first, then add/remove
// with the render/identity contract from render-stability.test.tsx.

import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { jsonSchemaToTree } from '@jsonschema-form/core'
import type { JSONSchema } from '@jsonschema-form/core'
import { SchemaFields } from './renderer'

const schema: JSONSchema = {
  type: 'object',
  properties: {
    contacts: {
      type: 'array',
      title: 'Contacts',
      minItems: 1,
      items: {
        type: 'object',
        properties: { name: { type: 'string', title: 'Contact name' } },
      },
    },
  },
}

describe('array rendering', () => {
  it('renders the array label, its seed item, and an Add button', async () => {
    const form = jsonSchemaToTree(schema)
    const screen = await render(<SchemaFields form={form} />)

    // the array is a captioned grouping (fieldset + legend → role "group")
    await expect
      .element(screen.getByRole('group', { name: 'Contacts' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('textbox', { name: 'Contact name' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: /add/i }))
      .toBeInTheDocument()
  })

  it('appends an item on Add, preserving existing items’ typed values', async () => {
    const form = jsonSchemaToTree(schema)
    const screen = await render(<SchemaFields form={form} />)

    const first = screen.getByRole('textbox', { name: 'Contact name' })
    await first.fill('Alice')
    await expect.element(first).toHaveValue('Alice')

    await screen.getByRole('button', { name: /add/i }).click()

    // a second contact-name input now exists…
    const inputs = () =>
      document.querySelectorAll<HTMLInputElement>('input[name$=".name"]')
    await expect.poll(() => inputs().length).toBe(2)
    // …and the pre-existing item kept its value (it was not remounted)
    expect(inputs()[0].value).toBe('Alice')
    expect(inputs()[1].value).toBe('')
  })

  it('removes the clicked item, preserving the survivor’s value and identity', async () => {
    const form = jsonSchemaToTree(schema)
    const screen = await render(<SchemaFields form={form} />)

    await screen.getByRole('button', { name: /add/i }).click()
    const inputs = () =>
      document.querySelectorAll<HTMLInputElement>('input[name$=".name"]')
    await expect.poll(() => inputs().length).toBe(2)

    const name = screen.getByRole('textbox', { name: 'Contact name' })
    await name.nth(0).fill('Alice')
    await name.nth(1).fill('Bob')

    // remove the FIRST item
    await screen.getByRole('button', { name: 'Remove' }).nth(0).click()

    await expect.poll(() => inputs().length).toBe(1)
    // the survivor (Bob) keeps its value — it was not remounted — and keeps its
    // own stable path (no reindex; dense submission is handled at submit-time).
    expect(inputs()[0].value).toBe('Bob')
    expect(inputs()[0].name).toBe('contacts.1.name')
  })
})
