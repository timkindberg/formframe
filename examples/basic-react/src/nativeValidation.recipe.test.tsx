// RECIPE TESTS — copy this file with `nativeValidation.recipe.tsx` (+ the
// field-controls / presentation layers you wire). Covers the store/policy
// helpers and the submit / live / touched / a11y UX of the native form-state
// stack so a pasted recipe stays covered.
//
// Run with the FormFrame React Vitest browser project, e.g.:
//   npx vitest run -w packages/react nativeValidation.recipe.test.tsx
import { useMemo, type ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { ValidationError } from '@formframe/core'
import { jsonSchemaToTree, type JSONSchema } from '@formframe/input-jsonschema'
import { createAjvValidator } from './ajvValidator.recipe'
import {
  fieldControlId,
  fieldErrorId,
  useFormTree,
} from '@formframe/renderer-react'
import { nativeFieldDefaults } from './nativeFieldControls.recipe'
import {
  createErrorStore,
  createTouchedStore,
  EMPTY_ERRORS,
  NativeValidationProvider,
  shouldDisplayFieldErrors,
  useNativeValidator,
  DEFAULT_SHOW_ERRORS_WHEN,
  type ShowErrorsWhen,
} from './nativeValidation.recipe'

// ─── Pure helpers ────────────────────────────────────────────────────────────

const error = (path: string, message = 'bad'): ValidationError => ({
  path,
  message,
})

describe('nativeValidation.recipe · shouldDisplayFieldErrors', () => {
  it("'always' shows regardless of touched/submitted", () => {
    expect(
      shouldDisplayFieldErrors('always', { touched: false, submitted: false })
    ).toBe(true)
    expect(
      shouldDisplayFieldErrors('always', { touched: false, submitted: true })
    ).toBe(true)
    expect(
      shouldDisplayFieldErrors('always', { touched: true, submitted: false })
    ).toBe(true)
  })

  it("'touched' shows once the field is touched, or after submit", () => {
    expect(
      shouldDisplayFieldErrors('touched', { touched: false, submitted: false })
    ).toBe(false)
    expect(
      shouldDisplayFieldErrors('touched', { touched: true, submitted: false })
    ).toBe(true)
    expect(
      shouldDisplayFieldErrors('touched', { touched: false, submitted: true })
    ).toBe(true)
  })

  it("'submit' shows only after a submit attempt", () => {
    expect(
      shouldDisplayFieldErrors('submit', { touched: true, submitted: false })
    ).toBe(false)
    expect(
      shouldDisplayFieldErrors('submit', { touched: false, submitted: true })
    ).toBe(true)
  })

  it("recipe default is 'submit' (parity with RHF/TanStack defaults)", () => {
    expect(DEFAULT_SHOW_ERRORS_WHEN).toBe('submit')
  })
})

describe('nativeValidation.recipe · createErrorStore', () => {
  it('returns the shared EMPTY_ERRORS for an unknown path', () => {
    const store = createErrorStore()
    expect(store.getErrors('a')).toBe(EMPTY_ERRORS)
    expect(store.getErrors('b')).toBe(EMPTY_ERRORS)
  })

  it('keeps the same reference for a path whose errors are unchanged', () => {
    const store = createErrorStore([error('a'), error('b')])
    const beforeB = store.getErrors('b')
    store.setResult([error('a', 'different'), error('b')])
    expect(store.getErrors('b')).toBe(beforeB)
    expect(store.getErrors('a')[0].message).toBe('different')
  })

  it('returns a new reference for a path whose errors changed', () => {
    const store = createErrorStore([error('a')])
    const beforeA = store.getErrors('a')
    store.setResult([error('a', 'changed')])
    expect(store.getErrors('a')).not.toBe(beforeA)
  })

  it('drops a cleared path back to the shared EMPTY_ERRORS', () => {
    const store = createErrorStore([error('a')])
    expect(store.getErrors('a')).not.toBe(EMPTY_ERRORS)
    store.setResult([])
    expect(store.getErrors('a')).toBe(EMPTY_ERRORS)
  })

  it('notifies subscribers on setResult and stops after unsubscribe', () => {
    const store = createErrorStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.setResult([error('a')])
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    store.setResult([error('a'), error('b')])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('exposes the flat error list via getAll', () => {
    const store = createErrorStore()
    const errors = [error('a'), error('b')]
    store.setResult(errors)
    expect(store.getAll()).toBe(errors)
  })
})

describe('nativeValidation.recipe · createTouchedStore', () => {
  it('reports false for an untouched path and true once synced touched', () => {
    const store = createTouchedStore()
    expect(store.getTouched('a')).toBe(false)
    store.sync(new Set(['a']), false)
    expect(store.getTouched('a')).toBe(true)
    expect(store.getTouched('b')).toBe(false)
  })

  it('tracks the submitted flag', () => {
    const store = createTouchedStore()
    expect(store.isSubmitted()).toBe(false)
    store.sync(new Set(), true)
    expect(store.isSubmitted()).toBe(true)
  })

  it('notifies subscribers on a real change and stops after unsubscribe', () => {
    const store = createTouchedStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.sync(new Set(['a']), false)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    store.sync(new Set(['a', 'b']), false)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not notify when nothing changed (same set ref + submitted)', () => {
    const set = new Set(['a'])
    const store = createTouchedStore(set, false)
    const listener = vi.fn()
    store.subscribe(listener)
    store.sync(set, false)
    expect(listener).not.toHaveBeenCalled()
  })
})

// ─── Browser integration (useNativeValidator + inject) ───────────────────────

const schema = {
  type: 'object',
  required: ['username'],
  properties: {
    username: { type: 'string', title: 'Username', minLength: 3 },
    zip: { type: 'string', title: 'Zip', pattern: '^[0-9]{5}$' },
  },
} as const satisfies JSONSchema
const tree = jsonSchemaToTree(schema)

function RecipeHarness({
  onValid,
  mode,
  live,
}: {
  onValid?: (data: Record<string, unknown>) => void
  mode?: ShowErrorsWhen
  /** Wire onInput revalidate (live clear / live produce). */
  live?: boolean
}): ReactNode {
  const validator = useMemo(() => createAjvValidator(schema), [])
  const { form, SchemaFields } = useFormTree(tree, {
    defaults: nativeFieldDefaults,
  })
  const { validation, submit, revalidate, handleBlur } = useNativeValidator(
    form,
    validator
  )
  return (
    <form
      noValidate
      onSubmit={submit(onValid)}
      onInput={live ? revalidate : undefined}
      onBlur={(event) => {
        handleBlur(event)
        if (live) revalidate(event)
      }}
    >
      <NativeValidationProvider {...validation} showErrorsWhen={mode}>
        <SchemaFields />
      </NativeValidationProvider>
      <button type="submit">Submit</button>
    </form>
  )
}

const errorEls = () => document.querySelectorAll('.jsf-field-errors')
const control = (path: string) =>
  document.getElementById(fieldControlId(path)) as HTMLInputElement

describe('nativeValidation.recipe · useNativeValidator + inject', () => {
  it('shows per-field errors and blocks onValid on invalid submit', async () => {
    const onValid = vi.fn()
    const screen = await render(<RecipeHarness onValid={onValid} />)

    await screen.getByRole('button', { name: /submit/i }).click()

    await expect.poll(() => errorEls().length).toBe(1)
    expect(onValid).not.toHaveBeenCalled()
    expect(document.getElementById(fieldErrorId('username'))).not.toBeNull()
  })

  it('preserves typed input across a failed submit (no remount)', async () => {
    const onValid = vi.fn()
    const screen = await render(<RecipeHarness onValid={onValid} />)

    const username = screen.getByRole('textbox', { name: 'Username' })
    const zip = screen.getByRole('textbox', { name: 'Zip' })
    await username.fill('alice')
    await zip.fill('12')
    await screen.getByRole('button', { name: /submit/i }).click()

    await expect.poll(() => errorEls().length).toBeGreaterThan(0)
    await expect.element(username).toHaveValue('alice')
    expect(onValid).not.toHaveBeenCalled()
  })

  it('clears errors and calls onValid once valid (prefers coerced data)', async () => {
    const onValid = vi.fn()
    const screen = await render(<RecipeHarness onValid={onValid} />)

    await screen.getByRole('button', { name: /submit/i }).click()
    await expect.poll(() => errorEls().length).toBe(1)

    await screen.getByRole('textbox', { name: 'Username' }).fill('alice')
    await screen.getByRole('textbox', { name: 'Zip' }).fill('12345')
    await screen.getByRole('button', { name: /submit/i }).click()

    await expect.poll(() => onValid.mock.calls.length).toBe(1)
    expect(onValid).toHaveBeenCalledWith({ username: 'alice', zip: '12345' })
    await expect.poll(() => errorEls().length).toBe(0)
  })

  it("default 'submit' policy: quiet until first submit, then reveal", async () => {
    const screen = await render(<RecipeHarness live />)

    // Pre-submit: typing an invalid value stays quiet.
    await screen.getByRole('textbox', { name: 'Username' }).fill('a')
    await new Promise((r) => setTimeout(r, 30))
    expect(document.getElementById(fieldErrorId('username'))).toBeNull()

    await screen.getByRole('button', { name: /submit/i }).click()
    await expect
      .poll(() => document.getElementById(fieldErrorId('username')))
      .not.toBeNull()
  })

  it("'touched': blur reveals; untouched sibling stays quiet", async () => {
    await render(<RecipeHarness mode="touched" live />)

    const username = control('username')
    username.focus()
    username.blur()

    await expect
      .poll(() => document.getElementById(fieldErrorId('username')))
      .not.toBeNull()
    expect(document.getElementById(fieldErrorId('zip'))).toBeNull()
  })

  it("'touched': submit reveals errors on untouched fields too", async () => {
    const screen = await render(<RecipeHarness mode="touched" />)

    await screen.getByRole('button', { name: /submit/i }).click()
    await expect
      .poll(() => document.getElementById(fieldErrorId('username')))
      .not.toBeNull()
  })

  it('no role=alert on field errors (a11y contract)', async () => {
    const screen = await render(<RecipeHarness />)
    await screen.getByRole('button', { name: /submit/i }).click()
    await expect.poll(() => errorEls().length).toBe(1)
    expect(
      document.querySelector('ul.jsf-field-errors[role="alert"]')
    ).toBeNull()
    const username = control('username')
    expect(username.getAttribute('aria-invalid')).toBe('true')
    expect(username.getAttribute('aria-describedby')).toBe(
      fieldErrorId('username')
    )
  })
})
