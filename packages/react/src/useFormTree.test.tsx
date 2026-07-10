import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { z } from 'zod'
import { zodToTree } from '@jsonschema-form/input-zod'
import {
  jsonSchemaToTree,
  type JSONSchema,
} from '@jsonschema-form/input-jsonschema'
import type { ValidationError } from '@jsonschema-form/core'
import { createAjvValidator } from '@jsonschema-form/validation-ajv'
import { createZodValidator } from '@jsonschema-form/validation-zod'
import {
  useFormTree,
  ValidationProvider,
  type FormTreeValidation,
} from './index'

const schema = z.object({
  name: z.string().min(2).meta({ title: 'Name' }),
})
const tree = zodToTree(schema)
const validator = createZodValidator(schema)
const transformedValidator = createZodValidator(
  z.object({
    name: z.string().transform((value) => value.toUpperCase()),
  })
)

const numberSchema = {
  type: 'object',
  properties: {
    age: { type: 'number', title: 'Age' },
  },
  required: ['age'],
} as const satisfies JSONSchema
const numberTree = jsonSchemaToTree(numberSchema)
const numberValidator = createAjvValidator(numberSchema)

describe('useFormTree', () => {
  it('spreads complete validation state without remounting bound fields', async () => {
    const onValid = vi.fn()
    const schemaFieldsIdentities = new Set<unknown>()

    function Harness() {
      const { SchemaFields, submit, validation } = useFormTree(tree, {
        validator,
      })
      schemaFieldsIdentities.add(SchemaFields)

      return (
        <form noValidate onSubmit={submit(onValid)}>
          <ValidationProvider {...validation}>
            <SchemaFields />
          </ValidationProvider>
          <output data-testid="error-count">{validation.errors.length}</output>
          <button type="submit">Submit</button>
        </form>
      )
    }

    const screen = await render(<Harness />)
    expect(screen.getByTestId('error-count').element().textContent).toBe('0')
    const submit = screen.getByRole('button', { name: 'Submit' })
    const name = screen.getByRole('textbox', { name: 'Name' })
    const inputBeforeValidation = name.element()

    await submit.click()
    await expect
      .poll(() => document.querySelectorAll('.jsf-field-errors').length)
      .toBe(1)
    expect(onValid).not.toHaveBeenCalled()
    expect(schemaFieldsIdentities.size).toBe(1)
    expect(name.element()).toBe(inputBeforeValidation)

    await name.fill('Ada')
    await submit.click()

    await expect.poll(() => onValid.mock.calls.length).toBe(1)
    expect(onValid).toHaveBeenCalledWith({ name: 'Ada' })
  })

  it('passes Zod-transformed output to the success handler', async () => {
    const onValid = vi.fn()

    function Harness() {
      const { SchemaFields, submit } = useFormTree(tree, {
        validator: transformedValidator,
      })

      return (
        <form noValidate onSubmit={submit(onValid)}>
          <SchemaFields />
          <button type="submit">Submit transformed</button>
        </form>
      )
    }

    const screen = await render(<Harness />)
    await screen.getByRole('textbox', { name: 'Name' }).fill('Ada')
    await screen.getByRole('button', { name: 'Submit transformed' }).click()

    await expect.poll(() => onValid.mock.calls.length).toBe(1)
    expect(onValid).toHaveBeenCalledWith({ name: 'ADA' })
  })

  it('passes AJV-coerced output to the success handler', async () => {
    const onValid = vi.fn()

    function Harness() {
      const { SchemaFields, submit } = useFormTree(numberTree, {
        validator: numberValidator,
      })

      return (
        <form noValidate onSubmit={submit(onValid)}>
          <SchemaFields />
          <button type="submit">Submit coerced</button>
        </form>
      )
    }

    const screen = await render(<Harness />)
    await screen.getByRole('spinbutton', { name: 'Age' }).fill('25')
    await screen.getByRole('button', { name: 'Submit coerced' }).click()

    await expect.poll(() => onValid.mock.calls.length).toBe(1)
    expect(onValid).toHaveBeenCalledWith({ age: 25 })
  })

  it('infers output at type-check time while keeping no-validator submission honest', () => {
    // Type-only fixture: the gate's `tsc --noEmit` checks the callback bodies.
    // It is intentionally never rendered because calling it would invoke hooks.
    function TypeHarness() {
      const bound = useFormTree(tree, { validator: transformedValidator })
      bound.submit((data) => {
        expectTypeOf(data).toEqualTypeOf<{ name: string }>()
      })
      expectTypeOf(bound.validation).toEqualTypeOf<FormTreeValidation>()
      expectTypeOf(bound.validation).toEqualTypeOf<{
        errors: ValidationError[]
        touched: ReadonlySet<string>
        submitted: boolean
      }>()
      expectTypeOf(bound.errors).toEqualTypeOf<ValidationError[]>()

      useFormTree(numberTree, { validator: numberValidator }).submit((data) => {
        expectTypeOf(data).toMatchObjectType<{ age: number }>()
      })

      useFormTree(tree).submit((data) => {
        expectTypeOf(data).toEqualTypeOf<Record<string, unknown>>()
      })

      return null
    }

    expectTypeOf(TypeHarness).toBeFunction()
  })
})
