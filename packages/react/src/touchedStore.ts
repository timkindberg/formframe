// Per-path touched store (ADR 027) — the fan-out-free sibling of the ADR 023
// error store. It holds *which field paths have been touched* (focus→blur) plus
// a single `submitted` flag, and hands each field its own boolean through
// `useSyncExternalStore`. Because a field's snapshot is a primitive boolean,
// React's `Object.is` bail skips every field whose touched/submitted-derived
// state didn't change — so blurring one field re-renders only that field, and
// flipping `submitted` re-renders exactly the fields whose display state flips.
//
// Kept parallel to (not folded into) the error store on purpose (ADR 027):
// touched is monotonic per session, errors churn every validation pass. Two
// stores keep each store's invariant trivial.

/**
 * Reactive touched/submitted state, read per-field. `getTouched(path)` is a
 * bare boolean (value-compared, so no reference-stability dance is needed), and
 * `isSubmitted()` is the one-time reveal-all flag.
 */
export interface TouchedStore {
  /** Whether this field path has been touched. */
  getTouched(path: string): boolean
  /** Whether the form has had a submit attempt (reveals all under 'touched'/'submit'). */
  isSubmitted(): boolean
  /** Subscribe to any change; returns an unsubscribe. */
  subscribe(listener: () => void): () => void
  /** Replace the touched set + submitted flag; notifies iff something changed. */
  sync(touched: ReadonlySet<string>, submitted: boolean): void
}

export function createTouchedStore(
  initialTouched: ReadonlySet<string> = new Set(),
  initialSubmitted = false
): TouchedStore {
  let touched = initialTouched
  let submitted = initialSubmitted
  const listeners = new Set<() => void>()

  return {
    getTouched(path) {
      return touched.has(path)
    },
    isSubmitted() {
      return submitted
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    sync(nextTouched, nextSubmitted) {
      // Cheap identity guard: `useFormTree` mints a new Set on each mark, so an
      // actual change flips the reference. Unchanged fields bail via `Object.is`
      // on their boolean snapshot regardless; this just avoids a no-op notify.
      if (nextTouched === touched && nextSubmitted === submitted) return
      touched = nextTouched
      submitted = nextSubmitted
      for (const listener of listeners) listener()
    },
  }
}
