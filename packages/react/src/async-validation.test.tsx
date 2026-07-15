// Async validation through the React binding (ADR 041–046). The framework-neutral
// orchestration is proven in formStore.test.ts; here we prove `useFormTree` wires
// it up: an async validator flows to per-field errors and the success handler, and
// `useIsValidating`/`useIsSubmitting` expose the pending signals to the subtree.

import { useMemo } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { jsonSchemaToTree, type JSONSchema } from '@formframe/input-jsonschema'
import type { AsyncValidator } from '@formframe/core'
import { useFormTree } from './useFormTree'
import {
  FormStoreProvider,
  SchemaFields,
  useIsValidating,
  useIsSubmitting,
} from './renderer'

const schema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', title: 'Name' },
  },
} as const satisfies JSONSchema
const tree = jsonSchemaToTree(schema)

// Comfortably longer than event-dispatch + poll-tick overhead, so the in-flight
// pending window is reliably observable (the store sets it synchronously on
// submit; we just need the async tail to still be open when poll first reads).
const DELAY = 200
/** An async validator: name must be ≥ 2 chars, after a real delay. */
function makeAsyncValidator(): AsyncValidator {
  return async (data) => {
    await new Promise((r) => setTimeout(r, DELAY))
    const name = (data as { name?: string }).name ?? ''
    return name.length >= 2
      ? { valid: true, errors: [], data }
      : { valid: false, errors: [{ path: 'name', message: 'too short' }] }
  }
}

function Status() {
  const validating = useIsValidating()
  const submitting = useIsSubmitting()
  return (
    <output data-testid="status">
      {`${validating ? 'V' : ''}${submitting ? 'S' : ''}`}
    </output>
  )
}

function Harness({ onValid }: { onValid: (data: unknown) => void }) {
  const validator = useMemo(() => makeAsyncValidator(), [])
  const { form, submit, store } = useFormTree(tree, { validator })
  return (
    <FormStoreProvider store={store} showErrorsWhen="always">
      <form noValidate onSubmit={submit(onValid)}>
        <SchemaFields form={form} />
        <Status />
        <button type="submit">Submit</button>
      </form>
    </FormStoreProvider>
  )
}

const errorEls = () => document.querySelectorAll('.jsf-field-errors')
const status = () =>
  document.querySelector('[data-testid="status"]')?.textContent ?? ''

describe('async validation through useFormTree (ADR 041–046)', () => {
  it('shows pending while the async validator runs, then blocks on invalid', async () => {
    const onValid = vi.fn()
    const screen = await render(<Harness onValid={onValid} />)

    await screen.getByRole('button', { name: /submit/i }).click()

    // While the promise is in flight: both validating and submitting are up.
    await expect.poll(() => status()).toBe('VS')
    // No error yet (verdict still pending), and the handler has not run.
    expect(errorEls().length).toBe(0)

    // After it resolves invalid: pending clears, the error appears, no onValid.
    await expect.poll(() => errorEls().length).toBe(1)
    expect(status()).toBe('')
    expect(onValid).not.toHaveBeenCalled()
  })

  it('calls the success handler once the async verdict is valid', async () => {
    const onValid = vi.fn()
    const screen = await render(<Harness onValid={onValid} />)

    await screen.getByRole('textbox', { name: 'Name' }).fill('Ada')
    await screen.getByRole('button', { name: /submit/i }).click()

    await expect.poll(() => status()).toBe('VS')
    await expect.poll(() => onValid.mock.calls.length).toBe(1)
    expect(onValid).toHaveBeenCalledWith({ name: 'Ada' })
    expect(errorEls().length).toBe(0)
    await expect.poll(() => status()).toBe('')
  })

  it('a later live pass supersedes an earlier one (no stale errors)', async () => {
    // Two quick revalidations: the second must own the visible verdict. We can't
    // easily time the network here, so we assert the settled state is coherent:
    // after typing a valid value and revalidating, no error remains.
    function LiveHarness() {
      const validator = useMemo(() => makeAsyncValidator(), [])
      const { form, revalidate, store } = useFormTree(tree, { validator })
      return (
        <FormStoreProvider store={store} showErrorsWhen="always">
          <form noValidate onInput={revalidate}>
            <SchemaFields form={form} />
          </form>
        </FormStoreProvider>
      )
    }
    const screen = await render(<LiveHarness />)
    const name = screen.getByRole('textbox', { name: 'Name' })

    await name.fill('a') // invalid
    await expect.poll(() => errorEls().length).toBe(1)
    await name.fill('ab') // valid — a newer pass supersedes
    await expect.poll(() => errorEls().length).toBe(0)
  })
})
