// RECIPE (native form-state): the demoted validation runtime — error store,
// touched store, display policy, a sync-validator hook, and the provider/
// hooks that wire them.
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
// `ValidationProvider` + field error hooks, and `useFormTree`'s validator
// slot) — moved here because validation production is a non-goal for the
// library (ADR 050 / #116, cut from the library in #126). This recipe is the
// self-contained copy every native-form-state demo in this example app uses.
//
// `useNativeValidator(form, validator)` is the recipe-owned replacement for
// the library's old `useFormTree(tree, { validator })` slot: it takes the
// `form` returned by `useFormTree(tree)` (no validator option anymore) plus a
// sync `Validator`, and owns submit-time gating, live revalidation, and
// touched/submitted state — the exact same behavior, just recipe-side.
//
// Display timing default here is `'submit'` (quiet until first submit, then
// reveal + clear live) — matching RHF's default mode and TanStack's
// `revalidateLogic()`, the locked parity target. Pass `showErrorsWhen` to
// opt into `'touched'` or `'always'`.
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type FormEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import {
  groupErrorsByPath,
  type ValidationError,
  type ValidationResult,
  type Validator,
} from '@formframe/core'

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
 * native field controls below. Spread the `validation` object returned by
 * {@link useNativeValidator} into this (errors / touched / submitted).
 * Controls read per-path via {@link useFieldValidationErrors} and inject into
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

// ─── useNativeValidator (recipe-owned replacement for the old validator slot) ─

/** Minimal shape `useNativeValidator` needs from the `form` `useFormTree(tree)`
 * returns — the same `submit` a native-form recipe already builds its own
 * submit handler from. */
export interface SubmittableForm {
  submit(
    onSubmit: (data: Record<string, unknown>) => void
  ): (event: {
    preventDefault(): void
    currentTarget: EventTarget | null
  }) => void
}

/** Validation state a native-form recipe spreads into
 * {@link NativeValidationProvider}. */
export interface NativeValidationState {
  errors: ValidationError[]
  touched: ReadonlySet<string>
  submitted: boolean
}

export interface UseNativeValidatorResult<Output> {
  validation: NativeValidationState
  /** Build a DOM submit handler: assembles FormData, runs the validator, and
   * only calls `onValid` when `result.valid` — preferring `result.data` (the
   * validator's coerced value) over the raw FormData object when present. */
  submit: (
    onValid?: (data: Output) => void
  ) => (event: FormEvent<HTMLFormElement>) => void
  /** Re-run the validator from the current FormData without submitting. Wire
   * to `onInput`/`onChange`/`onBlur` for live feedback. */
  revalidate: (event: SyntheticEvent<HTMLFormElement>) => void
  /** Mark a field touched on blur. `focusout` bubbles, so one form-level
   * handler covers every named control. */
  handleBlur: (event: FocusEvent<HTMLFormElement>) => void
}

/**
 * Recipe-owned replacement for the library's old `useFormTree(tree, {
 * validator })` slot (cut in #126). Takes the `form` from a validator-less
 * `useFormTree(tree)` plus a sync `Validator` (AJV, `fromStandardSchema`, or
 * hand-rolled) and owns submit-time gating, live revalidation, and
 * touched/submitted state — spread `validation` into
 * {@link NativeValidationProvider}, wire `submit`/`revalidate`/`handleBlur`
 * to the `<form>`.
 */
export function useNativeValidator<Output = Record<string, unknown>>(
  form: SubmittableForm,
  validator: Validator<Output>
): UseNativeValidatorResult<Output> {
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set())
  const [submitted, setSubmitted] = useState(false)

  const handleBlur = useCallback((event: FocusEvent<HTMLFormElement>) => {
    const name = (event.target as { name?: string }).name
    if (!name) return
    setTouched((prev) => (prev.has(name) ? prev : new Set(prev).add(name)))
  }, [])

  const runValidator = useCallback(
    (data: Record<string, unknown>): ValidationResult<Output> => {
      const result = validator(data)
      setErrors(result.errors)
      return result
    },
    [validator]
  )

  const submit = useCallback(
    (onValid?: (data: Output) => void) => {
      const run = form.submit((data) => {
        const result = runValidator(data)
        if (result.valid) {
          onValid?.(result.data === undefined ? (data as Output) : result.data)
        }
      })
      return (event: FormEvent<HTMLFormElement>) => {
        setSubmitted(true)
        run(event)
      }
    },
    [form, runValidator]
  )

  const revalidate = useCallback(
    (event: SyntheticEvent<HTMLFormElement>) => {
      form.submit((data) => {
        runValidator(data)
      })({
        preventDefault: () => {},
        currentTarget: event.currentTarget,
      })
    },
    [form, runValidator]
  )

  const validation = useMemo<NativeValidationState>(
    () => ({ errors, touched, submitted }),
    [errors, touched, submitted]
  )

  return { validation, submit, revalidate, handleBlur }
}
