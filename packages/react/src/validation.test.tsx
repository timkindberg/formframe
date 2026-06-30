// Submit-time validation wiring (ADR 019, slice 2).
//
// A side-loaded `Validator` (here AJV) passed to `useSchemaForm` gates submit:
// invalid data surfaces per-field issues and blocks the handler; valid data
// clears them and calls through. Crucially, showing errors must NOT remount the
// uncontrolled inputs — typed values survive a failed submit. (Conformance, in
// conformance.test.tsx, separately proves the error slot is invisible when there
// is no validator, so React still matches the vanilla oracle.)

import { useMemo } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { JSONSchema } from '@jsonschema-form/core'
import { createAjvValidator } from '@jsonschema-form/validation-ajv'
import { useSchemaForm } from './useSchemaForm'
import { ValidationProvider } from './renderer'

const schema: JSONSchema = {
  type: 'object',
  required: ['username'],
  properties: {
    username: { type: 'string', title: 'Username', minLength: 3 },
    zip: { type: 'string', title: 'Zip', pattern: '^[0-9]{5}$' },
  },
}

function Harness({
  onValid,
}: {
  onValid: (data: Record<string, unknown>) => void
}) {
  const validator = useMemo(() => createAjvValidator(schema), [])
  const { SchemaFields, submit, errors } = useSchemaForm(schema, { validator })
  // `noValidate`: the schema renders native `required`/`pattern` attrs (ADR 012),
  // which would otherwise block submit before our JS validator runs. Opt out so
  // the side-loaded validator owns the UX.
  return (
    <form noValidate onSubmit={submit(onValid)}>
      <ValidationProvider issues={errors}>
        <SchemaFields />
      </ValidationProvider>
      <button type="submit">Submit</button>
    </form>
  )
}

const errorEls = () => document.querySelectorAll('.jsf-field-errors')

describe('submit-time validation (ADR 019)', () => {
  it('shows per-field issues and blocks the handler on invalid submit', async () => {
    const onValid = vi.fn()
    const screen = await render(<Harness onValid={onValid} />)

    await screen.getByRole('button', { name: /submit/i }).click()

    // Empty required username is omitted → `required` fails. Empty optional zip
    // is omitted too → valid (no spurious pattern error on absence).
    await expect.poll(() => errorEls().length).toBe(1)
    expect(onValid).not.toHaveBeenCalled()
  })

  it('preserves typed input across a failed submit (no remount)', async () => {
    const onValid = vi.fn()
    const screen = await render(<Harness onValid={onValid} />)

    const username = screen.getByRole('textbox', { name: 'Username' })
    const zip = screen.getByRole('textbox', { name: 'Zip' })
    await username.fill('alice') // valid length
    await zip.fill('12') // invalid pattern → submit fails
    await screen.getByRole('button', { name: /submit/i }).click()

    await expect.poll(() => errorEls().length).toBeGreaterThan(0)
    // the uncontrolled input kept its value — the error consumer re-rendered,
    // the input did not remount
    await expect.element(username).toHaveValue('alice')
    expect(onValid).not.toHaveBeenCalled()
  })

  it('clears issues and calls the handler once valid', async () => {
    const onValid = vi.fn()
    const screen = await render(<Harness onValid={onValid} />)

    // first submit fails (required username)…
    await screen.getByRole('button', { name: /submit/i }).click()
    await expect.poll(() => errorEls().length).toBe(1)

    // …fix both fields, then submit again
    await screen.getByRole('textbox', { name: 'Username' }).fill('alice')
    await screen.getByRole('textbox', { name: 'Zip' }).fill('12345')
    await screen.getByRole('button', { name: /submit/i }).click()

    await expect.poll(() => onValid.mock.calls.length).toBe(1)
    expect(onValid).toHaveBeenCalledWith({ username: 'alice', zip: '12345' })
    await expect.poll(() => errorEls().length).toBe(0)
  })
})
