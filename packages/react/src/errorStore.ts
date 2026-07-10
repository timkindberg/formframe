// Reactive validation-error store (ADR 023 + ADR 037) — the fan-out-free path.
//
// Validation errors are runtime state read by every field (`useFieldErrors`).
// Holding them in a single React Context re-renders *every* consumer on any
// change (Context bypasses the `NodeRenderer` memo), so one keystroke re-renders
// the whole form — the RJSF perf trap. Instead we keep them in an external store
// read through `useSyncExternalStore` with a **per-path snapshot**, and the store
// guarantees a **stable array reference for any path whose errors are unchanged**
// (and a shared `EMPTY` for none). A field's snapshot then only changes identity
// when *its own* errors change, so `useSyncExternalStore`'s `Object.is` check
// bails the re-render for every other field. Result: a validation pass re-renders
// only the fields whose errors actually changed — zero preventable re-renders.
//
// This is deliberately a tiny store we own (not a dependency): the genuinely hard
// part (tearing / concurrent correctness) is delegated to React's official
// `useSyncExternalStore`, and the part that bites hand-rolled stores (selector +
// custom equality) is sidestepped entirely by the reference-stability discipline
// above. It is also the seam a form-library adapter (RHF/TanStack) will later
// implement — kept internal until a second consumer earns the public shape
// (ADR 008).
import { groupErrorsByPath, type ValidationError } from '@jsonschema-form/core'

/** Shared empty snapshot — one stable reference so "no errors" never re-renders. */
export const EMPTY_ERRORS: ValidationError[] = Object.freeze(
  [] as ValidationError[]
) as ValidationError[]

/**
 * The reactive error store. `getErrors(path)` returns a reference that is stable
 * across `setResult` calls that don't change that path — the property the
 * `useSyncExternalStore` bail relies on.
 */
export interface ErrorStore {
  /** Errors for one field path; the shared `EMPTY_ERRORS` when none. */
  getErrors(path: string): ValidationError[]
  /** All errors, flat — stable across no-op `setResult`s. */
  getAll(): ValidationError[]
  /** Subscribe to any change; returns an unsubscribe. */
  subscribe(listener: () => void): () => void
  /** Replace the error set; diffs per path and notifies. */
  setResult(errors: ValidationError[]): void
}

function sameErrors(a: ValidationError[], b: ValidationError[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (x.path !== y.path || x.message !== y.message || x.keyword !== y.keyword)
      return false
  }
  return true
}

export function createErrorStore(initial: ValidationError[] = []): ErrorStore {
  let all: ValidationError[] = initial
  let byPath = groupErrorsByPath(initial)
  const listeners = new Set<() => void>()

  return {
    getErrors(path) {
      return byPath.get(path) ?? EMPTY_ERRORS
    },
    getAll() {
      return all
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setResult(errors) {
      const next = groupErrorsByPath(errors)
      // Preserve the previous array reference for any path whose errors are
      // unchanged, so that path's snapshot stays referentially identical and its
      // subscriber bails. (A path that dropped to zero errors is simply absent
      // from `next` → `getErrors` returns the shared `EMPTY_ERRORS`.)
      for (const [path, nextErrors] of next) {
        const prev = byPath.get(path)
        if (prev && sameErrors(prev, nextErrors)) next.set(path, prev)
      }
      byPath = next
      all = errors
      for (const listener of listeners) listener()
    },
  }
}
