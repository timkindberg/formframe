// Touched-gated error display (ADR 027).
//
// Orthogonal to *when* validation runs (ADR 021): here the validator produces
// errors live, but a field's error stays hidden until the field is touched
// (focus→blur), and a submit attempt reveals everything — React Hook Form's
// default UX, and now the library default (ADR 027). `useFormTree` owns
// touched/submitted; `showErrorsWhen` on the provider picks the policy.
// `'always'` is the opt-out that reports immediately.

import { useMemo } from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { jsonSchemaToTree } from '@jsonschema-form/input-jsonschema'
import type { JSONSchema } from '@jsonschema-form/input-jsonschema'
import { createAjvValidator } from '@jsonschema-form/validation-ajv'
import { useFormTree } from './useFormTree'
import { ValidationProvider, fieldControlId, fieldErrorId } from './renderer'
import type { ShowErrorsWhen } from './displayPolicy'

const schema: JSONSchema = {
  type: 'object',
  required: ['username', 'zip'],
  properties: {
    username: { type: 'string', title: 'Username', minLength: 3 },
    zip: { type: 'string', title: 'Zip', pattern: '^[0-9]{5}$' },
  },
}
const tree = jsonSchemaToTree(schema)

// `mode` is optional: omitting it exercises the provider's default policy
// (ADR 027 makes that `'touched'`).
function Harness({ mode }: { mode?: ShowErrorsWhen }) {
  const validator = useMemo(() => createAjvValidator(schema), [])
  const { SchemaFields, submit, revalidate, handleBlur, validation } =
    useFormTree(tree, { validator })
  return (
    <form
      noValidate
      onSubmit={submit(() => {})}
      onInput={revalidate}
      // Blur marks touched AND revalidates (ADR 027 pairing), so a field tabbed
      // through without typing still gets its error computed on blur.
      onBlur={(e) => {
        handleBlur(e)
        revalidate(e)
      }}
    >
      <ValidationProvider {...validation} showErrorsWhen={mode}>
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

const control = (path: string) =>
  document.getElementById(fieldControlId(path)) as HTMLInputElement
const errorEls = () => document.querySelectorAll('.jsf-field-errors')

describe('touched-gated error display (ADR 027)', () => {
  it('default policy is touched: a live error stays hidden until the field blurs', async () => {
    // No `showErrorsWhen` prop → the provider's default applies.
    await render(<Harness />)

    const username = control('username')
    username.focus()
    dispatchInput(username, 'a') // invalid live, but untouched → hidden

    await new Promise((r) => setTimeout(r, 30))
    expect(document.getElementById(fieldErrorId('username'))).toBeNull()

    username.blur()
    await expect
      .poll(() => document.getElementById(fieldErrorId('username')))
      .not.toBeNull()
  })

  it("'touched': blurring an empty required field (no typing) reveals its error", async () => {
    // The exact confusion: tab into a required field, tab out without typing.
    // Because blur revalidates, the error is computed on blur and — the field
    // now being touched — shown, without needing a keystroke elsewhere first.
    await render(<Harness mode="touched" />)

    const username = control('username')
    username.focus()
    username.blur() // never typed

    await expect
      .poll(() => document.getElementById(fieldErrorId('username')))
      .not.toBeNull()
    // a sibling the user never touched stays quiet
    expect(document.getElementById(fieldErrorId('zip'))).toBeNull()
  })

  it("'touched': keeps a live error hidden until the field blurs, then shows it", async () => {
    await render(<Harness mode="touched" />)

    const username = control('username')
    username.focus()
    dispatchInput(username, 'a') // invalid (minLength 3): error is produced live

    // …but not displayed — the field has not been touched yet.
    await new Promise((r) => setTimeout(r, 30))
    expect(document.getElementById(fieldErrorId('username'))).toBeNull()

    // blurring the field marks it touched → its error is revealed.
    username.blur()
    await expect
      .poll(() => document.getElementById(fieldErrorId('username')))
      .not.toBeNull()
  })

  it("'touched': a submit attempt reveals errors on untouched fields too", async () => {
    await render(<Harness mode="touched" />)

    // One keystroke in username runs the whole-form validator, so BOTH username
    // (minLength) and the empty required zip gain errors — both hidden (untouched).
    const username = control('username')
    username.focus()
    dispatchInput(username, 'a')
    await new Promise((r) => setTimeout(r, 30))
    expect(errorEls().length).toBe(0)

    // A submit attempt reveals all — including the never-touched zip. Driven via
    // requestSubmit (not a button click) so a revealed error shifting the button
    // can't make the click miss.
    const form = document.querySelector('form') as HTMLFormElement
    form.requestSubmit()
    await expect.poll(() => errorEls().length).toBe(2)
  })

  it("'always' (opt-out) shows a live error immediately, no touch needed", async () => {
    await render(<Harness mode="always" />)

    const username = control('username')
    username.focus()
    dispatchInput(username, 'a')

    await expect
      .poll(() => document.getElementById(fieldErrorId('username')))
      .not.toBeNull()
  })
})
