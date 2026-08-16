// Render-count perf contract (bead jsonschema-form-bi4 follow-up).
//
// render-stability.test.tsx + arrays.test.tsx assert *value/identity* preservation
// (a remount IS a value loss) as the proxy. These tests assert the sharper,
// underlying contract directly: a localized state change re-renders ONLY the
// nodes that actually changed. We measure it with a "counting adapter" — a real
// RendererAdapter that tallies how many times each node/part renderer runs,
// keyed by path — so "did node X re-render?" becomes a hard number.

import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { jsonSchemaToRuntimeTree } from '@formframe/input-jsonschema'
import type { JSONSchema } from '@formframe/input-jsonschema'
import { useState } from 'react'
import type { FieldControl } from '@formframe/core'
import {
  createRenderer,
  nativeDefaults,
  type ReactPartialDefaults,
} from './renderer'

type Counts = Record<string, number>

/** The field's submitted `name` from any control archetype — every option in a
 * `choicegroup` shares the field name, so its first option carries it. */
function controlName(control: FieldControl): string {
  return control.kind === 'choicegroup'
    ? (control.options[0]?.attrs.name ?? '')
    : control.attrs.name
}

/** Wrap the real defaults, tallying each renderer invocation by a stable key. */
function countingAdapter(counts: Counts): ReactPartialDefaults {
  const bump = (key: string) => {
    counts[key] = (counts[key] ?? 0) + 1
  }
  const d = nativeDefaults
  return {
    field: {
      root: (p) => {
        bump(`field.root:${p.node.path}`)
        return d.field.root(p)
      },
      label: d.field.label,
      description: d.field.description,
      control: {
        input: (data) => {
          bump(`field.control:${controlName(data)}`)
          return d.field.control.input(data)
        },
        select: (data) => {
          bump(`field.control:${controlName(data)}`)
          return d.field.control.select(data)
        },
        textarea: (data) => {
          bump(`field.control:${controlName(data)}`)
          return d.field.control.textarea(data)
        },
        choicegroup: (data) => {
          bump(`field.control:${controlName(data)}`)
          return d.field.control.choicegroup(data)
        },
      },
    },
    group: {
      root: (p) => {
        bump(`group.root:${p.node.path}`)
        return d.group.root(p)
      },
      label: d.group.label,
      description: d.group.description,
    },
    array: {
      root: (p) => {
        bump(`array.root:${p.node.path}`)
        return d.array.root(p)
      },
      label: d.array.label,
      description: d.array.description,
      addButton: (data) => {
        bump('array.addButton')
        return d.array.addButton(data)
      },
    },
    arrayItem: {
      root: (p) => {
        bump(`arrayItem.root:${p.node.path}`)
        return d.arrayItem.root(p)
      },
      removeButton: (data) => {
        bump('arrayItem.removeButton')
        return d.arrayItem.removeButton(data)
      },
    },
    combine: d.combine,
  }
}

const arraySchema: JSONSchema = {
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

const flatSchema: JSONSchema = {
  type: 'object',
  properties: { name: { type: 'string', title: 'Name' } },
}

const reset = (counts: Counts) => {
  for (const k of Object.keys(counts)) delete counts[k]
}

const total = (counts: Counts) =>
  Object.values(counts).reduce((a, b) => a + b, 0)

describe('render-count contract', () => {
  it('appending an item re-renders nothing in the existing items', async () => {
    const counts: Counts = {}
    const Counting = createRenderer(countingAdapter(counts))
    const form = jsonSchemaToRuntimeTree(arraySchema)
    const screen = await render(<Counting form={form} />)

    reset(counts)
    await screen.getByRole('button', { name: /add/i }).click()
    await expect
      .poll(() => document.querySelectorAll('input[name$=".name"]').length)
      .toBe(2)

    // the pre-existing item (contacts.0) must not re-render any of its parts…
    expect(counts['field.root:contacts.0.name'] ?? 0).toBe(0)
    expect(counts['field.control:contacts.0.name'] ?? 0).toBe(0)
    expect(counts['arrayItem.root:contacts.0'] ?? 0).toBe(0)
    // …including its Remove button: only the ONE new item's button renders.
    expect(counts['arrayItem.removeButton'] ?? 0).toBe(1)
  })

  // ADR 018: removing the LAST item shifts no survivor's position, so dense
  // re-pathing is a no-op and nothing of the survivor re-renders (its slot — and
  // thus its actions/core — is untouched, so React keeps the whole subtree).
  it('removing the last item re-renders nothing in the survivors', async () => {
    const counts: Counts = {}
    const Counting = createRenderer(countingAdapter(counts))
    const form = jsonSchemaToRuntimeTree(arraySchema)
    const screen = await render(<Counting form={form} />)

    await screen.getByRole('button', { name: /add/i }).click()
    await expect
      .poll(() => document.querySelectorAll('input[name$=".name"]').length)
      .toBe(2)

    reset(counts)
    // drop the SECOND (last) item — the survivor at contacts.0 does not shift
    await screen
      .getByRole('button', { name: /remove/i })
      .nth(1)
      .click()
    await expect
      .poll(() => document.querySelectorAll('input[name$=".name"]').length)
      .toBe(1)

    expect(counts['field.root:contacts.0.name'] ?? 0).toBe(0)
    expect(counts['field.control:contacts.0.name'] ?? 0).toBe(0)
    expect(counts['arrayItem.root:contacts.0'] ?? 0).toBe(0)
    expect(counts['arrayItem.removeButton'] ?? 0).toBe(0)
  })

  // ADR 018: removing a NON-last item re-paths the items after it densely, so
  // exactly those survivors re-render (to update their `name`s) while the ones
  // before the gap stay untouched. Values survive in place (see arrays.test).
  it('removing a middle item re-renders only the items after it', async () => {
    const counts: Counts = {}
    const Counting = createRenderer(countingAdapter(counts))
    const form = jsonSchemaToRuntimeTree(arraySchema)
    const screen = await render(<Counting form={form} />)

    // grow to three items: contacts.0, .1, .2
    await screen.getByRole('button', { name: /add/i }).click()
    await screen.getByRole('button', { name: /add/i }).click()
    await expect
      .poll(() => document.querySelectorAll('input[name$=".name"]').length)
      .toBe(3)

    reset(counts)
    // drop the MIDDLE item (contacts.1); the tail (contacts.2) re-paths to .1
    await screen
      .getByRole('button', { name: /remove/i })
      .nth(1)
      .click()
    await expect
      .poll(() => document.querySelectorAll('input[name$=".name"]').length)
      .toBe(2)

    // the item BEFORE the gap is untouched (same position → memo bail)…
    expect(counts['field.root:contacts.0.name'] ?? 0).toBe(0)
    expect(counts['field.control:contacts.0.name'] ?? 0).toBe(0)
    expect(counts['arrayItem.root:contacts.0'] ?? 0).toBe(0)
    // …the tail re-rendered at its new dense path contacts.1 (in place, no remount)
    expect(counts['arrayItem.root:contacts.1'] ?? 0).toBeGreaterThan(0)
    expect(counts['field.control:contacts.1.name'] ?? 0).toBeGreaterThan(0)
  })

  // Guard for the NodeRenderer memo floor (ADR 015 / render-stability.test.tsx),
  // stated as a number: an unrelated ancestor re-render bails at the root and
  // reaches zero node renderers.
  it('an unrelated parent re-render runs zero node renderers', async () => {
    const counts: Counts = {}
    const Counting = createRenderer(countingAdapter(counts))
    const form = jsonSchemaToRuntimeTree(flatSchema)

    function Parent(): React.ReactNode {
      const [, setN] = useState(0)
      return (
        <>
          <button type="button" onClick={() => setN((n) => n + 1)}>
            bump
          </button>
          <Counting form={form} />
        </>
      )
    }

    const screen = await render(<Parent />)
    reset(counts)
    await screen.getByRole('button', { name: 'bump' }).click()
    // Give a stray re-render a chance to land before asserting silence.
    await new Promise((r) => setTimeout(r, 20))

    expect(total(counts)).toBe(0)
  })
})
