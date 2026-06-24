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
import { jsonSchemaToTree } from '@jsonschema-form/core'
import type { JSONSchema } from '@jsonschema-form/core'
import { useState } from 'react'
import { createRenderer, defaultAdapter, type ReactPartialAdapter } from './renderer'

type Counts = Record<string, number>

/** Wrap the real defaults, tallying each renderer invocation by a stable key. */
function countingAdapter(counts: Counts): ReactPartialAdapter {
  const bump = (key: string) => {
    counts[key] = (counts[key] ?? 0) + 1
  }
  const d = defaultAdapter
  return {
    field: {
      root: (p) => {
        bump(`field.root:${p.node.path}`)
        return d.field.root(p)
      },
      label: d.field.label,
      description: d.field.description,
      input: (data) => {
        bump(`field.input:${data.attrs.name}`)
        return d.field.input(data)
      },
      select: d.field.select,
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

const total = (counts: Counts) => Object.values(counts).reduce((a, b) => a + b, 0)

describe('render-count contract', () => {
  it('appending an item re-renders nothing in the existing items', async () => {
    const counts: Counts = {}
    const Counting = createRenderer(countingAdapter(counts))
    const form = jsonSchemaToTree(arraySchema)
    const screen = await render(<Counting form={form} />)

    reset(counts)
    await screen.getByRole('button', { name: /add/i }).click()
    await expect
      .poll(() => document.querySelectorAll('input[name$=".name"]').length)
      .toBe(2)

    // the pre-existing item (contacts.0) must not re-render any of its parts…
    expect(counts['field.root:contacts.0.name'] ?? 0).toBe(0)
    expect(counts['field.input:contacts.0.name'] ?? 0).toBe(0)
    expect(counts['arrayItem.root:contacts.0'] ?? 0).toBe(0)
    // …including its Remove button: only the ONE new item's button renders.
    expect(counts['arrayItem.removeButton'] ?? 0).toBe(1)
  })

  // Guard for the same Context-stability property on the way down: dropping one
  // item must not re-render the survivor (its slot — and thus its actions — is
  // untouched, so React keeps the whole subtree, button included).
  it('removing an item re-renders nothing in the survivor', async () => {
    const counts: Counts = {}
    const Counting = createRenderer(countingAdapter(counts))
    const form = jsonSchemaToTree(arraySchema)
    const screen = await render(<Counting form={form} />)

    await screen.getByRole('button', { name: /add/i }).click()
    await expect
      .poll(() => document.querySelectorAll('input[name$=".name"]').length)
      .toBe(2)

    reset(counts)
    await screen.getByRole('button', { name: /remove/i }).first().click()
    await expect
      .poll(() => document.querySelectorAll('input[name$=".name"]').length)
      .toBe(1)

    // The survivor (contacts.1) keeps its identity — nothing of it re-renders.
    expect(counts['field.root:contacts.1.name'] ?? 0).toBe(0)
    expect(counts['field.input:contacts.1.name'] ?? 0).toBe(0)
    expect(counts['arrayItem.root:contacts.1'] ?? 0).toBe(0)
    expect(counts['arrayItem.removeButton'] ?? 0).toBe(0)
  })

  // Guard for the NodeRenderer memo floor (ADR 015 / render-stability.test.tsx),
  // stated as a number: an unrelated ancestor re-render bails at the root and
  // reaches zero node renderers.
  it('an unrelated parent re-render runs zero node renderers', async () => {
    const counts: Counts = {}
    const Counting = createRenderer(countingAdapter(counts))
    const form = jsonSchemaToTree(flatSchema)

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
