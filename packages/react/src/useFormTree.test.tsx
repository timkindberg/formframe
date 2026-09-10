// Slim `useFormTree` (ADR 050): presentation + bound `SchemaFields` + native
// FormData `submit` only. `submit` always calls the handler with
// FormData-assembled data — no validation gating. Validation production /
// scheduling is a recipe/adapter concern; the library only RENDERS errors via
// the inject seam (see injected-errors.test.tsx).

import type { ReactNode } from 'react'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { z, type ZodType } from 'zod'
import { zodToTree } from '@formframe/input-zod'
import {
  jsonSchemaToRuntimeTree,
  jsonSchemaToTree,
  type JSONSchema,
  type JSONSchemaObject,
} from '@formframe/input-jsonschema'
import { useFormTree } from './index'
import type { BoundSchemaFieldsProps, UseFormTreeOptions } from './index'
import type { FieldControl } from '@formframe/core'
import { Default, type EField, type RenderHelpers } from './renderer'
import type { AnyKindGroup } from './layoutShape'

const schema = z.object({
  name: z.string().min(2).meta({ title: 'Name' }),
})
const tree = zodToTree(schema)

const numberSchema = {
  type: 'object',
  properties: {
    age: { type: 'number', title: 'Age' },
  },
  required: ['age'],
} as const satisfies JSONSchema
const numberTree = jsonSchemaToTree(numberSchema)

describe('useFormTree', () => {
  it('submit always calls the handler with FormData-assembled data — no gating', async () => {
    const onSubmit = vi.fn()
    const schemaFieldsIdentities = new Set<unknown>()

    function Harness() {
      const { SchemaFields, submit } = useFormTree(tree)
      schemaFieldsIdentities.add(SchemaFields)

      return (
        <form noValidate onSubmit={submit(onSubmit)}>
          <SchemaFields />
          <button type="submit">Submit</button>
        </form>
      )
    }

    const screen = await render(<Harness />)
    const submitButton = screen.getByRole('button', { name: 'Submit' })
    const name = screen.getByRole('textbox', { name: 'Name' })
    const inputBeforeSubmit = name.element()

    // Even a value that would fail a schema's own validation (min length 2)
    // still reaches the handler — the hook does not validate. An empty native
    // input submits as absent (Core's FormData assembly), so the payload is `{}`.
    await submitButton.click()
    await expect.poll(() => onSubmit.mock.calls.length).toBe(1)
    expect(onSubmit).toHaveBeenCalledWith({})
    expect(schemaFieldsIdentities.size).toBe(1)
    expect(name.element()).toBe(inputBeforeSubmit)

    await name.fill('Ada')
    await submitButton.click()
    await expect.poll(() => onSubmit.mock.calls.length).toBe(2)
    expect(onSubmit).toHaveBeenLastCalledWith({ name: 'Ada' })
  })

  it('assembles native FormData without any AJV/Zod coercion', async () => {
    const onSubmit = vi.fn()

    function Harness() {
      const { SchemaFields, submit } = useFormTree(numberTree)
      return (
        <form noValidate onSubmit={submit(onSubmit)}>
          <SchemaFields />
          <button type="submit">Submit</button>
        </form>
      )
    }

    const screen = await render(<Harness />)
    await screen.getByRole('spinbutton', { name: 'Age' }).fill('25')
    await screen.getByRole('button', { name: 'Submit' }).click()

    await expect.poll(() => onSubmit.mock.calls.length).toBe(1)
    // Native FormData is untyped strings — no adapter-side coercion in the hook.
    expect(onSubmit).toHaveBeenCalledWith({ age: '25' })
  })

  it('submit() with no handler still assembles data without throwing', async () => {
    function Harness() {
      const { SchemaFields, submit } = useFormTree(tree)
      return (
        <form noValidate onSubmit={submit()}>
          <SchemaFields />
          <button type="submit">Submit</button>
        </form>
      )
    }

    const screen = await render(<Harness />)
    await expect(
      screen.getByRole('button', { name: 'Submit' }).click()
    ).resolves.not.toThrow()
  })

  it('exposes only the slim capability surface — no validation API', () => {
    // Type-only fixture: the gate's `tsc --noEmit` checks the callback bodies.
    // It is intentionally never rendered because calling it would invoke hooks.
    function TypeHarness() {
      const bound = useFormTree(tree)
      expectTypeOf(bound.submit).toBeFunction()
      bound.submit((data) => {
        expectTypeOf(data).toEqualTypeOf<Record<string, unknown>>()
      })

      // Validation is recipe-owned (ADR 050) — none of these keys exist on the
      // slim result.
      expectTypeOf(bound).not.toHaveProperty('validator')
      expectTypeOf(bound).not.toHaveProperty('validation')
      expectTypeOf(bound).not.toHaveProperty('errors')
      expectTypeOf(bound).not.toHaveProperty('touched')
      expectTypeOf(bound).not.toHaveProperty('submitted')
      expectTypeOf(bound).not.toHaveProperty('revalidate')
      expectTypeOf(bound).not.toHaveProperty('handleBlur')

      // @ts-expect-error -- `validator` is not a useFormTree option (ADR 050)
      useFormTree(tree, { validator: undefined })

      return null
    }

    expectTypeOf(TypeHarness).toBeFunction()
  })

  it('binds { defaults } over nativeDefaults so kind-wide slots apply without intercept', async () => {
    const teamDefaults = {
      field: {
        control: (control: FieldControl) =>
          control.kind === 'input' ? (
            <input {...control.attrs} data-team="yes" />
          ) : null,
      },
    }

    function Harness() {
      const { SchemaFields } = useFormTree(tree, { defaults: teamDefaults })
      return <SchemaFields />
    }

    const screen = await render(<Harness />)
    const name = screen.getByRole('textbox', { name: 'Name' })
    await expect.element(name).toBeInTheDocument()
    expect(name.element()).toHaveAttribute('data-team', 'yes')
    // Unspecified slots stay native (the label still names the textbox) —
    // this is mergeDefaults(nativeDefaults, defaults), not createRenderer(partial).
    expect(document.querySelector('[data-jsf-not-implemented]')).toBeNull()
  })

  it('SchemaFields intercept still hijacks a node when defaults are bound', async () => {
    const teamDefaults = {
      field: {
        control: (control: FieldControl) =>
          control.kind === 'input' ? (
            <input {...control.attrs} data-team="yes" />
          ) : null,
      },
    }

    function Harness() {
      const { SchemaFields } = useFormTree(tree, { defaults: teamDefaults })
      return (
        <SchemaFields
          intercept={(node, { Default }) =>
            node.isField && node.path === 'name' ? (
              <p>intercepted</p>
            ) : (
              <Default of={node} />
            )
          }
        />
      )
    }

    const screen = await render(<Harness />)
    await expect.element(screen.getByText('intercepted')).toBeInTheDocument()
    expect(document.querySelector('input')).toBeNull()
  })

  it('public options name defaults and intercept, not renderNode/adapter', () => {
    expectTypeOf<UseFormTreeOptions>().toHaveProperty('defaults')
    expectTypeOf<UseFormTreeOptions>().not.toHaveProperty('adapter')
    expectTypeOf<BoundSchemaFieldsProps>().toHaveProperty('intercept')
    expectTypeOf<BoundSchemaFieldsProps>().toHaveProperty('layout')
    expectTypeOf<BoundSchemaFieldsProps>().not.toHaveProperty('renderNode')
    expectTypeOf<BoundSchemaFieldsProps>().not.toHaveProperty('children')
  })

  it('layout callback params infer from the named prop', async () => {
    function Harness() {
      const { SchemaFields } = useFormTree(tree)
      return (
        <SchemaFields
          layout={(root, { Default: D, Children }) => {
            expectTypeOf(root.children.name).toExtend<EField<ZodType>>()
            expectTypeOf<keyof typeof root.children>().toEqualTypeOf<'name'>()
            expectTypeOf(D).toEqualTypeOf<RenderHelpers['Default']>()
            expectTypeOf(Children).toEqualTypeOf<RenderHelpers['Children']>()
            expectTypeOf(D).toEqualTypeOf<typeof Default>()
            return <D of={root.children.name} />
          }}
        />
      )
    }
    const screen = await render(<Harness />)
    await expect
      .element(screen.getByRole('textbox', { name: 'Name' }))
      .toBeInTheDocument()
  })

  it('layout root.children is FormShape-keyed (field vs group, nested layout)', async () => {
    const nested = z.object({
      from: z.string().meta({ title: 'From' }),
      address: z.object({
        street: z.string().meta({ title: 'Street' }),
      }),
    })
    const nestedTree = zodToTree(nested)
    function Harness() {
      const { SchemaFields } = useFormTree(nestedTree)
      return (
        <SchemaFields
          layout={(root, { Default }) => {
            expectTypeOf(root.children.from).toExtend<EField<ZodType>>()
            expectTypeOf<keyof typeof root.children>().toEqualTypeOf<
              'from' | 'address'
            >()
            expectTypeOf(root.children.address.children.street).toExtend<
              EField<ZodType>
            >()
            // @ts-expect-error — not a child of this schema
            void root.children.nope
            return (
              <>
                <Default of={root.children.from} />
                <Default
                  of={root.children.address}
                  layout={(addr, { Default: D }) => {
                    expectTypeOf(addr.children.street).toExtend<
                      EField<ZodType>
                    >()
                    return <D of={addr.children.street} />
                  }}
                />
              </>
            )
          }}
        />
      )
    }
    const screen = await render(<Harness />)
    await expect
      .element(screen.getByRole('textbox', { name: 'From' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('textbox', { name: 'Street' }))
      .toBeInTheDocument()
  })

  it('jsonSchemaToTree literal also keys children (not the runtime door)', async () => {
    const literal = {
      type: 'object',
      properties: {
        from: { type: 'string', title: 'From' },
        address: {
          type: 'object',
          properties: { street: { type: 'string', title: 'Street' } },
        },
      },
    } as const satisfies JSONSchema
    const literalTree = jsonSchemaToTree(literal)
    function Harness() {
      const { SchemaFields } = useFormTree(literalTree)
      return (
        <SchemaFields
          layout={(root, { Default }) => {
            expectTypeOf<keyof typeof root.children>().toEqualTypeOf<
              'from' | 'address'
            >()
            expectTypeOf(root.children.from).toExtend<
              EField<JSONSchemaObject>
            >()
            // @ts-expect-error — not a child of this schema
            void root.children.nope
            return <Default of={root.children.from} />
          }}
        />
      )
    }
    const screen = await render(<Harness />)
    await expect
      .element(screen.getByRole('textbox', { name: 'From' }))
      .toBeInTheDocument()
  })

  it('a keyed field handle narrows parts.control by widget — no kind guard (#176)', async () => {
    const widgets = {
      type: 'object',
      properties: {
        username: { type: 'string', title: 'Username' }, // → input
        plan: { type: 'string', title: 'Plan', enum: ['free', 'pro'] }, // → choicegroup
      },
    } as const satisfies JSONSchema
    const widgetTree = jsonSchemaToTree(widgets)
    function Harness() {
      const { SchemaFields } = useFormTree(widgetTree)
      return (
        <SchemaFields
          layout={(root, { Default }) => {
            expectTypeOf(
              root.children.username.parts.control.kind
            ).toEqualTypeOf<'input'>()
            expectTypeOf(
              root.children.plan.parts.control.kind
            ).toEqualTypeOf<'choicegroup'>()
            // @ts-expect-error — an input control has no `options`
            void root.children.username.parts.control.options
            return (
              <>
                {/* The point of #176: `c.attrs` / `c.options` with no `c.kind`. */}
                <Default
                  of={root.children.username}
                  parts={{ control: (c) => <input {...c.attrs} /> }}
                />
                <Default
                  of={root.children.plan}
                  parts={{
                    control: (c) => (
                      <div role={c.role} aria-labelledby={c.labelledBy}>
                        {c.options.map((o) => (
                          <label key={o.attrs.id}>
                            <input {...o.attrs} />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    ),
                  }}
                />
              </>
            )
          }}
        />
      )
    }
    const screen = await render(<Harness />)
    await expect
      .element(screen.getByRole('textbox', { name: 'Username' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('radio', { name: 'free' }))
      .toBeInTheDocument()
  })

  it('unbranded FormShape has no literal keys and no kind guards', async () => {
    const runtime = jsonSchemaToRuntimeTree({
      type: 'object',
      properties: { n: { type: 'string', title: 'N' } },
    })
    function Harness() {
      const { SchemaFields } = useFormTree(runtime)
      return (
        <SchemaFields
          layout={(root, { Default }) => {
            expectTypeOf(root).toEqualTypeOf<AnyKindGroup<JSONSchemaObject>>()
            const child = root.children.n
            // A runtime-door child's kind is unknown, but every kind's surface
            // still indexes — `undefined` where this kind has none (ADR 055).
            expectTypeOf(child.parts.addButton).toEqualTypeOf<
              | ({ attrs: { type: 'button' }; label: string } & {
                  Default(): ReactNode
                })
              | undefined
            >()
            expectTypeOf(child.Children).toEqualTypeOf<
              (() => ReactNode) | undefined
            >()
            // …and narrowing still works, for when you do want to branch.
            if (child.isField) expectTypeOf(child.parts.control).not.toBeNever()
            return <Default of={child} />
          }}
        />
      )
    }
    const screen = await render(<Harness />)
    await expect
      .element(screen.getByRole('textbox', { name: 'N' }))
      .toBeInTheDocument()
  })
})
