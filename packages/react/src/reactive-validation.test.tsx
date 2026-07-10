// Reactive (validate-on-change) validation (ADR 021).
//
// Consumer wires `revalidate` to their form's `onInput` (per keystroke) or
// `onChange` (blur for text fields); the hook reads native FormData, runs the
// side-loaded Validator, and updates the same `errors` state — inputs stay
// uncontrolled.
//
// These tests assert *when validation runs* (the ADR 021 seam), not the ADR 027
// touched display policy — so they use `showErrorsWhen="always"` to render any
// issue the instant it exists. Touched-gating has its own suite
// (touched-errors.test.tsx).

import { useMemo } from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { jsonSchemaToTree } from '@jsonschema-form/input-jsonschema'
import type { JSONSchema } from '@jsonschema-form/input-jsonschema'
import { createAjvValidator } from '@jsonschema-form/validation-ajv'
import { useFormTree } from './useFormTree'
import { ValidationProvider, fieldControlId, fieldErrorId } from './renderer'

const schema: JSONSchema = {
  type: 'object',
  required: ['username'],
  properties: {
    username: { type: 'string', title: 'Username', minLength: 3 },
    zip: { type: 'string', title: 'Zip', pattern: '^[0-9]{5}$' },
  },
}
const tree = jsonSchemaToTree(schema)

function InputHarness() {
  const validator = useMemo(() => createAjvValidator(schema), [])
  const { SchemaFields, revalidate, errors } = useFormTree(tree, {
    validator,
  })
  return (
    <form noValidate onInput={revalidate}>
      <ValidationProvider issues={errors} showErrorsWhen="always">
        <SchemaFields />
      </ValidationProvider>
    </form>
  )
}

function ChangeHarness() {
  const validator = useMemo(() => createAjvValidator(schema), [])
  const { SchemaFields, revalidate, errors } = useFormTree(tree, {
    validator,
  })
  return (
    <form noValidate onChange={revalidate}>
      <ValidationProvider issues={errors} showErrorsWhen="always">
        <SchemaFields />
      </ValidationProvider>
    </form>
  )
}

function SubmitOnlyHarness() {
  const validator = useMemo(() => createAjvValidator(schema), [])
  const { SchemaFields, submit, errors } = useFormTree(tree, { validator })
  return (
    <form noValidate onSubmit={submit(() => {})}>
      <ValidationProvider issues={errors} showErrorsWhen="always">
        <SchemaFields />
      </ValidationProvider>
      <button type="submit">Submit</button>
    </form>
  )
}

/** Simulate a keystroke: update value and bubble a native `input` event. */
function dispatchInput(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
}

const errorEls = () => document.querySelectorAll('.jsf-field-errors')

describe('reactive validation (ADR 021)', () => {
  it('shows a field error on native change (blur), without submitting', async () => {
    const screen = await render(<ChangeHarness />)

    expect(errorEls().length).toBe(0)

    const username = screen.getByRole('textbox', { name: 'Username' })
    await username.fill('ab')

    await expect.poll(() => errorEls().length).toBeGreaterThan(0)
  })

  it('shows a field error on native input (per keystroke), without submitting', async () => {
    await render(<InputHarness />)

    expect(errorEls().length).toBe(0)

    const input = document.getElementById(
      fieldControlId('username')
    ) as HTMLInputElement
    input.focus()
    dispatchInput(input, 'a')
    await expect
      .poll(() => document.getElementById(fieldErrorId('username')))
      .not.toBeNull()
  })

  it('does not revalidate on input alone when only onChange is wired', async () => {
    await render(<ChangeHarness />)

    const input = document.getElementById(
      fieldControlId('username')
    ) as HTMLInputElement
    input.focus()
    dispatchInput(input, 'ab')

    expect(document.getElementById(fieldErrorId('username'))).toBeNull()
  })

  it('clears a field error when the value is corrected live', async () => {
    await render(<InputHarness />)

    const input = document.getElementById(
      fieldControlId('username')
    ) as HTMLInputElement
    dispatchInput(input, 'ab')
    await expect
      .poll(() => document.getElementById(fieldErrorId('username')))
      .not.toBeNull()

    dispatchInput(input, 'alice')
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
    await render(<InputHarness />)

    const input = document.getElementById(
      fieldControlId('username')
    ) as HTMLInputElement
    const before = input
    dispatchInput(input, 'ab')

    await expect
      .poll(() => document.getElementById(fieldErrorId('username')))
      .not.toBeNull()
    expect(input.value).toBe('ab')
    expect(document.getElementById(fieldControlId('username'))).toBe(before)
  })

  it('renders native maxLength on a constrained string field (browser constrain layer)', async () => {
    const handleSchema: JSONSchema = {
      type: 'object',
      properties: {
        handle: { type: 'string', title: 'Handle', maxLength: 20 },
      },
    }
    const handleTree = jsonSchemaToTree(handleSchema)

    function Harness() {
      const validator = useMemo(() => createAjvValidator(handleSchema), [])
      const { SchemaFields, revalidate, errors } = useFormTree(handleTree, {
        validator,
      })
      return (
        <form noValidate onInput={revalidate}>
          <ValidationProvider issues={errors} showErrorsWhen="always">
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
