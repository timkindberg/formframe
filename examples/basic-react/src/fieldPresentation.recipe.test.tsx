// RECIPE TESTS — copy with `fieldPresentation.recipe.tsx`. Pins ValidationSummary
// tree/DOM order so a pasted native / RHF / TanStack stack stays covered (#109).
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { jsonSchemaToTree } from '@formframe/input-jsonschema'
import type { JSONSchema } from '@formframe/input-jsonschema'
import { fieldControlId } from '@formframe/renderer-react'
import { ValidationSummary } from './fieldPresentation.recipe'

const schema = {
  type: 'object',
  properties: {
    first: { type: 'string' },
    nested: {
      type: 'object',
      properties: { second: { type: 'string' } },
    },
    third: { type: 'string' },
  },
} as const satisfies JSONSchema

const form = jsonSchemaToTree(schema)

const hrefs = () =>
  [...document.querySelectorAll('.jsf-validation-summary a')].map((a) =>
    a.getAttribute('href')
  )

describe('fieldPresentation.recipe · ValidationSummary', () => {
  it('renders nothing when there are no errors', async () => {
    await render(<ValidationSummary errors={[]} form={form} />)
    expect(document.querySelector('.jsf-validation-summary')).toBeNull()
  })

  it('orders links by form.getAllFields() (tree / DOM order)', async () => {
    await render(
      <ValidationSummary
        errors={[
          { path: 'third', message: 'c' },
          { path: 'first', message: 'a' },
          { path: 'nested.second', message: 'b' },
        ]}
        form={form}
      />
    )
    expect(hrefs()).toEqual([
      `#${fieldControlId('first')}`,
      `#${fieldControlId('nested.second')}`,
      `#${fieldControlId('third')}`,
    ])
  })

  it('appends unknown paths at the end, stably', async () => {
    await render(
      <ValidationSummary
        errors={[
          { path: 'zzz', message: 'unknown-1' },
          { path: 'third', message: 'c' },
          { path: 'aaa', message: 'unknown-2' },
        ]}
        form={form}
      />
    )
    expect(hrefs()).toEqual([
      `#${fieldControlId('third')}`,
      `#${fieldControlId('zzz')}`,
      `#${fieldControlId('aaa')}`,
    ])
  })
})
