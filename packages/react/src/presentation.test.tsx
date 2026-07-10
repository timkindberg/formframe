// Presentation stage, end-to-end (ADR 029).
//
// The golden scenario: a schema with NO multiselect hint (a scalar `enum`, which
// the default rule renders as a single <select>) is turned into a <select
// multiple> purely by a consumer PresentationResolver — front-end-agnostically,
// without touching the schema. Both the *render* (multiple attribute) and the
// *submit* (value wraps as string[]) must follow the override, proving present()
// feeds the whole pipeline, not just the DOM.

import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import type { PresentationResolver } from '@jsonschema-form/core'
import { jsonSchemaToTree } from '@jsonschema-form/input-jsonschema'
import type { JSONSchema } from '@jsonschema-form/input-jsonschema'
import { useFormTree } from './useFormTree'

const schema: JSONSchema = {
  type: 'object',
  properties: {
    // A scalar string enum: the shipped default presents this as a single select.
    tags: { type: 'string', title: 'Tags', enum: ['a', 'b', 'c'] },
  },
  required: ['tags'],
}
const tree = jsonSchemaToTree(schema)

// Module-scope (stable) so useFormTree's memo does not re-present each render.
const toMultiselect: PresentationResolver = (facts) =>
  facts.path === 'tags' ? { widget: 'multiselect' } : undefined

function Harness({
  onValid,
}: {
  onValid?: (data: Record<string, unknown>) => void
}) {
  const { SchemaFields, submit } = useFormTree(tree, {
    resolvePresentation: toMultiselect,
  })
  return (
    <form onSubmit={submit(onValid)}>
      <SchemaFields />
      <button type="submit">Submit</button>
    </form>
  )
}

describe('present() end-to-end (ADR 029)', () => {
  it('a consumer resolver turns a hint-less scalar enum into a <select multiple>', async () => {
    const screen = await render(<Harness />)
    // A <select multiple> exposes the ARIA `listbox` role (a single select is a
    // `combobox`) — so the role alone proves the widget swap took effect.
    const select = screen
      .getByRole('listbox', { name: 'Tags' })
      .element() as HTMLSelectElement
    expect(select.multiple).toBe(true)
    // The three enum options survived the widget swap.
    const values = Array.from(select.options)
      .map((o) => o.value)
      .filter(Boolean)
    expect(values).toEqual(['a', 'b', 'c'])
  })

  it('submit wraps the multiselect value as string[] — even a single selection', async () => {
    let data: Record<string, unknown> | undefined
    const screen = await render(
      <Harness
        onValid={(d) => {
          data = d
        }}
      />
    )

    // Select exactly one option. A scalar select would submit the string 'a';
    // because the presented widget is 'multiselect', submit's walk wraps it.
    const select = screen
      .getByRole('listbox', { name: 'Tags' })
      .element() as HTMLSelectElement
    const optA = Array.from(select.options).find((o) => o.value === 'a')
    expect(optA).toBeDefined()
    optA!.selected = true

    await screen.getByRole('button', { name: 'Submit' }).click()

    await expect.poll(() => data).toBeDefined()
    expect(data).toEqual({ tags: ['a'] })
  })
})
