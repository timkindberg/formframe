// Intercept sugar (ADR 051) — path maps and `{ paths, where }` bags on the
// `intercept` prop lower to the function floor via `interceptRules`.

import { useState } from 'react'
import { describe, it, expect, expectTypeOf, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { jsonSchemaToRuntimeTree } from '@formframe/input-jsonschema'
import type { JSONSchema } from '@formframe/input-jsonschema'
import { SchemaFields, Default } from './renderer'
import type { SchemaFieldsProps, ControlOverride } from './renderer'
import type { FieldHandlerProps, GroupHandlerProps } from './interceptRules'
import type { ENode } from './renderer'
import type { Intercept, InterceptMap, InterceptParts } from './intercept'
import type { FieldControl } from '@formframe/core'

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
        intercept={{
          email: EmailHint,
          'address.street': StreetHint,
        }}
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

  // #168: `interceptStabilityDeps` returns a variable-length array, and React
  // compares only the overlapping prefix when a dep list resizes — so going
  // from `undefined` to a function kept the stale resolver and the intercept
  // never fired.
  it('applies a function intercept added after the first render', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    function Toggle() {
      const [on, setOn] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOn(true)}>
            enable intercept
          </button>
          <SchemaFields
            form={form}
            intercept={
              on
                ? (node, { Default }) =>
                    node.path === 'email' ? null : <Default of={node} />
                : undefined
            }
          />
        </>
      )
    }
    const screen = await render(<Toggle />)
    await expect
      .element(screen.getByRole('textbox', { name: 'Email' }))
      .toBeInTheDocument()
    await screen.getByRole('button', { name: 'enable intercept' }).click()
    expect(document.querySelector('[name="email"]')).toBeNull()
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
      <SchemaFields form={form} intercept={{ where: WhereField }} />
    )
    await expect.element(screen.getByTestId('where-field')).toBeInTheDocument()
  })

  it('treats a field named `paths` as a path-map entry, not a bag axis', async () => {
    const PathsField = () => <div data-testid="paths-field">paths field</div>
    const form = jsonSchemaToRuntimeTree(reservedKeysSchema)
    const screen = await render(
      <SchemaFields form={form} intercept={{ paths: PathsField }} />
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
            intercept={{
              email: EmailHint,
              'address.street': StreetHint,
            }}
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

const EmailControl = (c: FieldControl) =>
  c.kind === 'input' ? (
    <input {...c.attrs} data-testid="email-control" name="email" />
  ) : null

describe('intercept parts-object values', () => {
  it('overrides only the named parts; unmatched parts stay defaults', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        intercept={{
          email: {
            control: (c) =>
              c.kind === 'input' ? (
                <input {...c.attrs} data-testid="email-control" name="email" />
              ) : null,
          },
        }}
      />
    )
    await expect
      .element(screen.getByTestId('email-control'))
      .toBeInTheDocument()
    await expect.element(screen.getByText('Email')).toBeInTheDocument()
    await expect
      .element(screen.getByRole('textbox', { name: 'Street' }))
      .toBeInTheDocument()
  })

  it('{ root: Handler } is the long form of passing Handler directly', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields form={form} intercept={{ email: { root: EmailHint } }} />
    )
    await expect.element(screen.getByTestId('email-hint')).toBeInTheDocument()
    await expect
      .element(screen.getByText('Check your inbox'))
      .toBeInTheDocument()
  })

  it('{ root: H, control: X }: H’s parts.Control is X', async () => {
    const RootH = ({ parts }: FieldHandlerProps) => (
      <div data-testid="root-h">
        <parts.Control />
      </div>
    )
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        intercept={{ email: { root: RootH, control: EmailControl } }}
      />
    )
    await expect.element(screen.getByTestId('root-h')).toBeInTheDocument()
    await expect
      .element(screen.getByTestId('email-control'))
      .toBeInTheDocument()
  })

  it('{ root: H, control: X }: <Default /> without parts is native', async () => {
    const RootH = ({ Default }: FieldHandlerProps) => (
      <div data-testid="native-wrap">
        <Default />
      </div>
    )
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        intercept={{ email: { root: RootH, control: EmailControl } }}
      />
    )
    await expect.element(screen.getByTestId('native-wrap')).toBeInTheDocument()
    await expect
      .element(screen.getByRole('textbox', { name: 'Email' }))
      .toBeInTheDocument()
    expect(
      document.querySelectorAll('[data-testid="email-control"]').length
    ).toBe(0)
  })

  it('{ root: H, control: X }: pass-through <Default parts> uses X', async () => {
    const ViaEngine = ({ node, parts }: FieldHandlerProps) => (
      <Default of={node} parts={parts} />
    )
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        intercept={{ email: { root: ViaEngine, control: EmailControl } }}
      />
    )
    await expect
      .element(screen.getByTestId('email-control'))
      .toBeInTheDocument()
    await expect.element(screen.getByText('Email')).toBeInTheDocument()
  })

  it('{ root: H, control: X }: handler <Default parts={parts} /> uses X', async () => {
    const ViaSlot = ({ Default, parts }: FieldHandlerProps) => (
      <Default parts={parts} />
    )
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        intercept={{ email: { root: ViaSlot, control: EmailControl } }}
      />
    )
    await expect
      .element(screen.getByTestId('email-control'))
      .toBeInTheDocument()
    await expect.element(screen.getByText('Email')).toBeInTheDocument()
  })

  it('accepts parts objects on bag `paths`', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        intercept={{ paths: { email: { control: EmailControl } } }}
      />
    )
    await expect
      .element(screen.getByTestId('email-control'))
      .toBeInTheDocument()
    await expect.element(screen.getByText('Email')).toBeInTheDocument()
  })

  it('does not treat nested { address: { street } } as a path map (ADR 051)', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const nested = {
      address: { street: StreetHint },
    } as unknown as Intercept
    const screen = await render(<SchemaFields form={form} intercept={nested} />)
    expect(
      document.querySelectorAll('[data-testid="street-hint"]').length
    ).toBe(0)
    await expect
      .element(screen.getByRole('textbox', { name: 'Street' }))
      .toBeInTheDocument()
    spy.mockRestore()
  })
})

describe('intercept map types', () => {
  it('accepts field handlers and Default-shaped parts without satisfies', () => {
    type InterceptProp = NonNullable<SchemaFieldsProps['intercept']>
    expectTypeOf<{
      email: typeof EmailHint
      'address.street': typeof StreetHint
    }>().toMatchTypeOf<InterceptMap>()
    expectTypeOf<{
      email: typeof EmailHint
      'address.street': typeof StreetHint
    }>().toMatchTypeOf<InterceptProp>()
    expectTypeOf<{
      email: typeof EmailHint
      'address.street': { control: typeof EmailControl }
    }>().toMatchTypeOf<InterceptMap>()
    expectTypeOf<{
      email: { root: typeof EmailHint }
    }>().toMatchTypeOf<InterceptMap>()
    expectTypeOf<typeof EmailControl>().toMatchTypeOf<
      NonNullable<InterceptParts['control']>
    >()
    const _InputOnlyControl: ControlOverride<'input'> = (c) => (
      <input {...c.attrs} />
    )
    expectTypeOf<typeof _InputOnlyControl>().toMatchTypeOf<
      NonNullable<InterceptParts['control']>
    >()
    expectTypeOf<{
      email: { control: typeof _InputOnlyControl }
    }>().toMatchTypeOf<InterceptMap>()
    expectTypeOf<{ where: typeof EmailHint }>().toMatchTypeOf<InterceptMap>()
    expectTypeOf<{ paths: typeof EmailHint }>().toMatchTypeOf<InterceptMap>()
    // Path-literal props (what `FieldProps<Shape, 'email'>` looks like) — not a
    // subtype of `FieldHandlerProps`, so the floor union is not enough.
    const _PathTyped = ({
      path,
      parts,
    }: {
      path: 'email'
      parts: FieldHandlerProps['parts']
    }) => (
      <div>
        {path}
        <parts.Label />
      </div>
    )
    expectTypeOf<{ email: typeof _PathTyped }>().toMatchTypeOf<InterceptMap>()
    expectTypeOf<{ email: typeof _PathTyped }>().toMatchTypeOf<InterceptProp>()
  })

  it('rejects nested path maps and node handlers as part renderers', () => {
    // @ts-expect-error — nested objects are not dotted paths (ADR 051)
    const _nested: InterceptMap = { address: { street: StreetHint } }
    // @ts-expect-error — control is a part renderer, not a node handler
    const _handlerAsPart: InterceptMap = { email: { control: EmailHint } }
    void _nested
    void _handlerAsPart
  })
})
