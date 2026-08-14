// Intercept sugar (ADR 051) — path maps and `{ paths, where }` bags on the
// `intercept` prop lower to the function floor via `renderNodeRules`.

import { useState } from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { jsonSchemaToRuntimeTree } from '@formframe/input-jsonschema'
import type { JSONSchema } from '@formframe/input-jsonschema'
import { SchemaFields } from './renderer'
import type { FieldHandlerProps, GroupHandlerProps } from './renderNodeRules'
import type { ENode } from './renderer'
import type { InterceptMap } from './intercept'

const schema: JSONSchema = {
  type: 'object',
  properties: {
    email: { type: 'string', title: 'Email', format: 'email' },
    plan: {
      type: 'string',
      title: 'Plan',
      enum: ['free', 'pro'],
    },
    address: {
      type: 'object',
      title: 'Address',
      properties: { street: { type: 'string', title: 'Street' } },
    },
  },
}

const EmailHint = ({ parts }: FieldHandlerProps) => (
  <div data-testid="email-hint">
    <parts.Label />
    <parts.Control />
    <small>Check your inbox</small>
  </div>
)

const StreetHint = ({ parts }: FieldHandlerProps) => (
  <div data-testid="street-hint">
    <parts.Label />
    <parts.Control />
  </div>
)

describe('intercept path-map sugar', () => {
  it('renders handlers for dotted path keys', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        intercept={
          {
            email: EmailHint,
            'address.street': StreetHint,
          } satisfies InterceptMap
        }
      />
    )
    await expect.element(screen.getByTestId('email-hint')).toBeInTheDocument()
    await expect.element(screen.getByTestId('street-hint')).toBeInTheDocument()
    await expect
      .element(screen.getByText('Check your inbox'))
      .toBeInTheDocument()
  })

  it('unmatched nodes fall through to engine defaults', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields form={form} intercept={{ email: EmailHint }} />
    )
    await expect.element(screen.getByTestId('email-hint')).toBeInTheDocument()
    await expect
      .element(screen.getByRole('textbox', { name: 'Street' }))
      .toBeInTheDocument()
  })
})

describe('intercept bag sugar', () => {
  it('accepts { paths, where } together', async () => {
    const AddressCard = ({ parts, children }: GroupHandlerProps) => (
      <fieldset data-testid="address-card">
        <parts.Label />
        {children}
      </fieldset>
    )
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        intercept={{
          paths: { email: EmailHint },
          where: [[(n) => n.isGroup && n.path === 'address', AddressCard]],
        }}
      />
    )
    await expect.element(screen.getByTestId('email-hint')).toBeInTheDocument()
    await expect.element(screen.getByTestId('address-card')).toBeInTheDocument()
  })

  it('exact path beats where predicate', async () => {
    const WhereHandler = () => <div data-testid="where-hit">where</div>
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        intercept={{
          paths: { email: EmailHint },
          where: [[(n: ENode) => n.path === 'email', WhereHandler]],
        }}
      />
    )
    await expect.element(screen.getByTestId('email-hint')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-testid="where-hit"]').length).toBe(
      0
    )
    await expect
      .element(screen.getByRole('textbox', { name: 'Street' }))
      .toBeInTheDocument()
  })
})

describe('intercept function floor', () => {
  it('still accepts a hand-written intercept function', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        intercept={(node, { Default }) =>
          node.path === 'email' ? (
            <p data-testid="fn-intercept">custom email</p>
          ) : (
            <Default of={node} />
          )
        }
      />
    )
    await expect.element(screen.getByTestId('fn-intercept')).toBeInTheDocument()
    await expect
      .element(screen.getByRole('textbox', { name: 'Street' }))
      .toBeInTheDocument()
  })
})

describe('intercept path-map vs bag discrimination', () => {
  const reservedKeysSchema: JSONSchema = {
    type: 'object',
    properties: {
      paths: { type: 'string', title: 'Paths' },
      where: { type: 'string', title: 'Where' },
    },
  }

  it('treats a field named `where` as a path-map entry, not a bag axis', async () => {
    const WhereField = () => <div data-testid="where-field">where field</div>
    const form = jsonSchemaToRuntimeTree(reservedKeysSchema)
    const screen = await render(
      <SchemaFields
        form={form}
        intercept={{ where: WhereField } satisfies InterceptMap}
      />
    )
    await expect.element(screen.getByTestId('where-field')).toBeInTheDocument()
  })

  it('treats a field named `paths` as a path-map entry, not a bag axis', async () => {
    const PathsField = () => <div data-testid="paths-field">paths field</div>
    const form = jsonSchemaToRuntimeTree(reservedKeysSchema)
    const screen = await render(
      <SchemaFields
        form={form}
        intercept={{ paths: PathsField } satisfies InterceptMap}
      />
    )
    await expect.element(screen.getByTestId('paths-field')).toBeInTheDocument()
  })
})

describe('intercept map stability', () => {
  it('does not remount inputs when the map object is new each render', async () => {
    const form = jsonSchemaToRuntimeTree(schema)

    function Parent() {
      const [n, setN] = useState(0)
      return (
        <div>
          <button type="button" onClick={() => setN((x) => x + 1)}>
            bump {n}
          </button>
          <SchemaFields
            form={form}
            intercept={
              {
                email: EmailHint,
                'address.street': StreetHint,
              } satisfies InterceptMap
            }
          />
        </div>
      )
    }

    const screen = await render(<Parent />)
    const street = screen.getByRole('textbox', { name: 'Street' })
    await street.fill('Main St')
    await expect.element(street).toHaveValue('Main St')

    const before = document.querySelector('input[name="address.street"]')
    await screen.getByRole('button', { name: /bump/ }).click()

    await expect.element(street).toHaveValue('Main St')
    const after = document.querySelector('input[name="address.street"]')
    expect(after).toBe(before)
  })
})
