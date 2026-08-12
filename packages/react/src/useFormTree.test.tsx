// Slim `useFormTree` (ADR 050 / #116 / #126): presentation + bound
// `SchemaFields` + native FormData `submit` only. `submit` always calls the
// handler with FormData-assembled data — no validation gating. Validation
// production/scheduling is a recipe/adapter concern, side-loaded on top; the
// library only RENDERS errors via the inject seam (see injected-errors.test.tsx).

import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { z } from 'zod'
import { zodToTree } from '@formframe/input-zod'
import { jsonSchemaToTree, type JSONSchema } from '@formframe/input-jsonschema'
import { useFormTree } from './index'

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

      // The validation capability was demoted (ADR 050 / #126) — none of these
      // keys exist on the slim result.
      expectTypeOf(bound).not.toHaveProperty('validator')
      expectTypeOf(bound).not.toHaveProperty('validation')
      expectTypeOf(bound).not.toHaveProperty('errors')
      expectTypeOf(bound).not.toHaveProperty('touched')
      expectTypeOf(bound).not.toHaveProperty('submitted')
      expectTypeOf(bound).not.toHaveProperty('revalidate')
      expectTypeOf(bound).not.toHaveProperty('handleBlur')

      // @ts-expect-error -- `validator` was demoted (ADR 050 / #126)
      useFormTree(tree, { validator: undefined })

      return null
    }

    expectTypeOf(TypeHarness).toBeFunction()
  })
})
