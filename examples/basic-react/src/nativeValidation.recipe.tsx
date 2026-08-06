// RECIPE (native form-state): the demoted validation runtime — error store,
// touched store, display policy, and the provider/hooks that wire them.
//
// Layer 1.5 of the native recipe stack (between shared presentation helpers
// and the per-control inject bindings):
//
//   fieldPresentation.recipe.tsx     shared blank/match helpers
//   nativeValidation.recipe.tsx      ← you are here. Recipe-owned stores.
//   nativeFieldControls.recipe.tsx   injects gated errors into `<Default>`
//   Recipe_NativeForm_*              per schema front-end
//
// This is the verbatim demotion of what used to live in
// `@formframe/renderer-react` (`errorStore`, `touchedStore`, `displayPolicy`,
// `ValidationProvider` + field error hooks) — moved here because validation
// production is a non-goal for the library (ADR 050 / #116). The library
// still ships those symbols until #126 cuts them; this recipe is the
// self-contained copy #125's native leg will keep using.
//
// Display timing default here is `'submit'` (quiet until first submit, then
// reveal + clear live) — matching RHF's default mode and TanStack's
// `revalidateLogic()`, the locked parity target. Pass `showErrorsWhen` to
// opt into `'touched'` or `'always'`.
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { groupErrorsByPath, type ValidationError } from '@formframe/core'

// ─── errorStore (verbatim from packages/react) ───────────────────────────────

/** Shared empty snapshot — one stable reference so "no errors" never re-renders. */
export const EMPTY_ERRORS: ValidationError[] = Object.freeze(
  [] as ValidationError[]
) as ValidationError[]

export interface ErrorStore {
  getErrors(path: string): ValidationError[]
  getAll(): ValidationError[]
  subscribe(listener: () => void): () => void
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

// ─── touchedStore (verbatim from packages/react) ─────────────────────────────

export interface TouchedStore {
  getTouched(path: string): boolean
  isSubmitted(): boolean
  subscribe(listener: () => void): () => void
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
      if (nextTouched === touched && nextSubmitted === submitted) return
      touched = nextTouched
      submitted = nextSubmitted
      for (const listener of listeners) listener()
    },
  }
}

// ─── displayPolicy (verbatim; recipe default flipped to 'submit') ────────────

export type ShowErrorsWhen = 'always' | 'touched' | 'submit'

/**
 * Recipe default for parity with RHF / TanStack defaults: quiet until the
 * first submit attempt, then reveal everything and clear live. (The library
 * copy still defaults to `'touched'` until #126 removes it.)
 */
export const DEFAULT_SHOW_ERRORS_WHEN: ShowErrorsWhen = 'submit'

export function shouldDisplayFieldErrors(
  mode: ShowErrorsWhen,
  state: { touched: boolean; submitted: boolean }
): boolean {
  switch (mode) {
    case 'always':
      return true
    case 'touched':
      return state.touched || state.submitted
    case 'submit':
      return state.submitted
  }
}

// ─── Provider + hooks (recipe-local; feeds the inject seam) ──────────────────

const ValidationStoreContext = createContext<ErrorStore | null>(null)

interface DisplayPolicy {
  store: TouchedStore
  mode: ShowErrorsWhen
}
const DisplayPolicyContext = createContext<DisplayPolicy | null>(null)

const EMPTY_TOUCHED: ReadonlySet<string> = new Set()
const NEVER_SUBSCRIBE = () => () => {}
const getEmptyErrors = () => EMPTY_ERRORS

/**
 * Hold the form's current validation result and display policy for the
 * native field controls below. Spread `useFormTree(…).validation` into this
 * (errors / touched / submitted). Controls read per-path via
 * {@link useFieldValidationErrors} and inject into
 * `<Default of={field} errors={…} />` — recipe-pre-gated, no library store.
 */
export function NativeValidationProvider({
  errors,
  touched = EMPTY_TOUCHED,
  submitted = false,
  showErrorsWhen = DEFAULT_SHOW_ERRORS_WHEN,
  children,
}: {
  errors: ValidationError[]
  touched?: ReadonlySet<string>
  submitted?: boolean
  showErrorsWhen?: ShowErrorsWhen
  children: ReactNode
}): ReactNode {
  const [store] = useState(() => createErrorStore(errors))
  const [touchedStore] = useState(() => createTouchedStore(touched, submitted))
  useLayoutEffect(() => {
    store.setResult(errors)
  }, [store, errors])
  useLayoutEffect(() => {
    touchedStore.sync(touched, submitted)
  }, [touchedStore, touched, submitted])
  const policy = useMemo<DisplayPolicy>(
    () => ({ store: touchedStore, mode: showErrorsWhen }),
    [touchedStore, showErrorsWhen]
  )
  return (
    <ValidationStoreContext.Provider value={store}>
      <DisplayPolicyContext.Provider value={policy}>
        {children}
      </DisplayPolicyContext.Provider>
    </ValidationStoreContext.Provider>
  )
}

/**
 * This field's currently-displayable errors as `ValidationError[]` for
 * FormFrame's `<Default errors={…} />` inject. Empty when the display policy
 * says stay quiet — present == show (no separate `show` flag).
 */
export function useFieldValidationErrors(path: string): ValidationError[] {
  const store = useContext(ValidationStoreContext)
  const policy = useContext(DisplayPolicyContext)
  const errors = useSyncExternalStore(
    store ? store.subscribe : NEVER_SUBSCRIBE,
    store ? () => store.getErrors(path) : getEmptyErrors,
    store ? () => store.getErrors(path) : getEmptyErrors
  )
  const show = useSyncExternalStore(
    policy ? policy.store.subscribe : NEVER_SUBSCRIBE,
    policy
      ? () =>
          shouldDisplayFieldErrors(policy.mode, {
            touched: policy.store.getTouched(path),
            submitted: policy.store.isSubmitted(),
          })
      : () => true,
    policy
      ? () =>
          shouldDisplayFieldErrors(policy.mode, {
            touched: policy.store.getTouched(path),
            submitted: policy.store.isSubmitted(),
          })
      : () => true
  )
  return show ? errors : EMPTY_ERRORS
}
