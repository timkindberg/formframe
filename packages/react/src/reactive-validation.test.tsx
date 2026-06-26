// Reactive (validate-on-change) validation (ADR 021).
//
// Consumer wires `revalidate` to their `<form onChange>`; the hook reads native
// FormData, runs the side-loaded Validator, and updates the same `errors` state
// that ValidationProvider already consumes — inputs stay uncontrolled.

import { useMemo } from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import type { JSONSchema } from '@jsonschema-form/core'
import { createAjvValidator } from '@jsonschema-form/validation-ajv'
import { useSchemaForm } from './useSchemaForm'
import { ValidationProvider, fieldControlId, fieldErrorId } from './renderer'

const schema: JSONSchema = {
  type: 'object',
  required: ['username'],
  properties: {
    username: { type: 'string', title: 'Username', minLength: 3 },
    zip: { type: 'string', title: 'Zip', pattern: '^[0-9]{5}$' },
  },
}

function LiveHarness() {
  const validator = useMemo(() => createAjvValidator(schema), [])
  const { SchemaFields, revalidate, errors } = useSchemaForm(schema, {
    validator,
  })
  return (
    <form noValidate onChange={revalidate}>
      <ValidationProvider issues={errors}>
        <SchemaFields />
      </ValidationProvider>
    </form>
  )
}

function SubmitOnlyHarness() {
  const validator = useMemo(() => createAjvValidator(schema), [])
  const { SchemaFields, submit, errors } = useSchemaForm(schema, { validator })
  return (
    <form noValidate onSubmit={submit(() => {})}>
      <ValidationProvider issues={errors}>
        <SchemaFields />
      </ValidationProvider>
      <button type="submit">Submit</button>
    </form>
  )
}

const errorEls = () => document.querySelectorAll('.jsf-field-errors')

describe('reactive validation (ADR 021)', () => {
  it('shows a field error while typing an invalid value, without submitting', async () => {
    const screen = await render(<LiveHarness />)

    expect(errorEls().length).toBe(0)

    const username = screen.getByRole('textbox', { name: 'Username' })
    await username.fill('ab')

    await expect.poll(() => errorEls().length).toBeGreaterThan(0)
  })

  it('clears a field error when the value is corrected live', async () => {
    const screen = await render(<LiveHarness />)

    const username = screen.getByRole('textbox', { name: 'Username' })
    await username.fill('ab')
    await expect
      .poll(() => document.getElementById(fieldErrorId('username')))
      .not.toBeNull()

    await username.fill('alice')
    await expect
      .poll(() => document.getElementById(fieldErrorId('username')))
      .toBeNull()
  })

  it('keeps submit-only behaviour when revalidate is not wired', async () => {
    const screen = await render(<SubmitOnlyHarness />)

    const username = screen.getByRole('textbox', { name: 'Username' })
    await username.fill('ab')

    expect(errorEls().length).toBe(0)

    await screen.getByRole('button', { name: /submit/i }).click()
    await expect.poll(() => errorEls().length).toBeGreaterThan(0)
  })

  it('preserves uncontrolled input value and DOM identity across live revalidation', async () => {
    const screen = await render(<LiveHarness />)

    const username = screen.getByRole('textbox', { name: 'Username' })
    const before = document.getElementById(fieldControlId('username'))
    await username.fill('ab')

    await expect
      .poll(() => document.getElementById(fieldErrorId('username')))
      .not.toBeNull()
    await expect.element(username).toHaveValue('ab')
    expect(document.getElementById(fieldControlId('username'))).toBe(before)
  })

  it('renders native maxLength on a constrained string field (browser constrain layer)', async () => {
    const handleSchema: JSONSchema = {
      type: 'object',
      properties: {
        handle: { type: 'string', title: 'Handle', maxLength: 20 },
      },
    }

    function Harness() {
      const validator = useMemo(() => createAjvValidator(handleSchema), [])
      const { SchemaFields, revalidate, errors } = useSchemaForm(handleSchema, {
        validator,
      })
      return (
        <form noValidate onChange={revalidate}>
          <ValidationProvider issues={errors}>
            <SchemaFields />
          </ValidationProvider>
        </form>
      )
    }

    const screen = await render(<Harness />)
    const handle = screen.getByRole('textbox', { name: 'Handle' })
    await expect.element(handle).toHaveAttribute('maxLength', '20')
  })
})
