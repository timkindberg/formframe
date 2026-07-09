// Array add/remove UI (bead jsonschema-form-bi4).
//
// Complex arrays (objects / bare primitives) render a captioned container, the
// seed items (minItems), an Add control, and a Remove control per item. The
// interactive behavior is React-only (the string oracle renders the same markup
// inert); these tests assert the React behavior — markup first, then add/remove
// with the render/identity contract from render-stability.test.tsx.

import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { jsonSchemaToTree } from '@jsonschema-form/input-jsonschema'
import type { JSONSchema } from '@jsonschema-form/input-jsonschema'
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

  it('removes the clicked item, preserving the survivor’s value and re-pathing it densely', async () => {
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
    // the survivor (Bob) keeps its value — it was not remounted — but its path
    // re-mints to the dense position 0 (ADR 018): the React key is its stable id,
    // the form path follows its position, so submission is dense.
    expect(inputs()[0].value).toBe('Bob')
    expect(inputs()[0].name).toBe('contacts.0.name')
  })

  it('removes a MIDDLE item, re-pathing later survivors densely without losing values', async () => {
    const form = jsonSchemaToTree(schema)
    const screen = await render(<SchemaFields form={form} />)

    const inputs = () =>
      document.querySelectorAll<HTMLInputElement>('input[name$=".name"]')
    await screen.getByRole('button', { name: /add/i }).click()
    await screen.getByRole('button', { name: /add/i }).click()
    await expect.poll(() => inputs().length).toBe(3)

    const name = screen.getByRole('textbox', { name: 'Contact name' })
    await name.nth(0).fill('Alice')
    await name.nth(1).fill('Bob')
    await name.nth(2).fill('Carol')

    // remove the MIDDLE item (Bob); Carol shifts from index 2 → 1
    await screen.getByRole('button', { name: 'Remove' }).nth(1).click()
    await expect.poll(() => inputs().length).toBe(2)

    // Alice is unmoved (still index 0). Carol, though its index shifted, kept its
    // value (no remount) and re-pathed densely to index 1 — proving the relative
    // keys (not the volatile index) anchor identity: the survivor's React key is
    // its synthetic id in ArrayRoot, and its descendants key by name / constant.
    expect(inputs()[0].value).toBe('Alice')
    expect(inputs()[0].name).toBe('contacts.0.name')
    expect(inputs()[1].value).toBe('Carol')
    expect(inputs()[1].name).toBe('contacts.1.name')
  })
})

describe('dense array submission (ADR 018)', () => {
  it('submits a dense array after removing the first item', async () => {
    const form = jsonSchemaToTree(schema)
    let submitted: Record<string, unknown> | undefined
    const screen = await render(
      <form
        onSubmit={form.submit((data) => {
          submitted = data
        })}
      >
        <SchemaFields form={form} />
        <button type="submit">Submit</button>
      </form>
    )

    await screen.getByRole('button', { name: /add/i }).click()
    const inputs = () =>
      document.querySelectorAll<HTMLInputElement>('input[name$=".name"]')
    await expect.poll(() => inputs().length).toBe(2)

    const name = screen.getByRole('textbox', { name: 'Contact name' })
    await name.nth(0).fill('Alice')
    await name.nth(1).fill('Bob')

    // drop the first item, then submit — the survivor must land at index 0
    await screen.getByRole('button', { name: 'Remove' }).nth(0).click()
    await expect.poll(() => inputs().length).toBe(1)

    await screen.getByRole('button', { name: 'Submit' }).click()

    await expect.poll(() => submitted).toBeDefined()
    // dense: a single contiguous element, no leading hole (would be [null, …])
    expect(submitted).toEqual({ contacts: [{ name: 'Bob' }] })
  })
})
