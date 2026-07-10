// The store's one job is reference stability (ADR 023): a path whose errors did
// not change must return the SAME array reference across `setResult`, so its
// `useSyncExternalStore` subscriber bails. These tests pin that invariant
// directly (the render-count test proves it end-to-end through React).
import { describe, it, expect, vi } from 'vitest'
import type { ValidationError } from '@jsonschema-form/core'
import { createErrorStore, EMPTY_ERRORS } from './errorStore'

const error = (path: string, message = 'bad'): ValidationError => ({
  path,
  message,
})

describe('errorStore (ADR 023/037)', () => {
  it('returns the shared EMPTY_ERRORS for an unknown path', () => {
    const store = createErrorStore()
    expect(store.getErrors('a')).toBe(EMPTY_ERRORS)
    expect(store.getErrors('b')).toBe(EMPTY_ERRORS)
  })

  it('keeps the same reference for a path whose errors are unchanged', () => {
    const store = createErrorStore([error('a'), error('b')])
    const beforeB = store.getErrors('b')

    // change only `a`; `b` is structurally identical in the next result
    store.setResult([error('a', 'different'), error('b')])

    expect(store.getErrors('b')).toBe(beforeB) // stable → b's subscriber bails
    expect(store.getErrors('a')).not.toBe(undefined)
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
