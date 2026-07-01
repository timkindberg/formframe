// The touched store (ADR 027) hands each field a boolean and notifies on change.
// These pin the store contract; the render-count test proves the per-field
// re-render isolation end-to-end through React.
import { describe, it, expect, vi } from 'vitest'
import { createTouchedStore } from './touchedStore'

describe('touchedStore (ADR 027)', () => {
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
