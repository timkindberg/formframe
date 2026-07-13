// Error-display policy (ADR 027) — the pure decision of *when* a field's errors
// are shown, kept separate from *when* validation runs (ADR 021's `revalidate`).
//
// This is deliberately a total, framework-agnostic function of
// `(mode, { touched, submitted })`. It has no React, no DOM, no store — the
// per-path touched state and the `submitted` flag are supplied by the caller
// (see `touchedStore.ts` + `ValidationProvider`), so the policy itself stays a
// trivially-testable pure function. Kept in `@formframe/renderer-react` (not Core)
// until a second front-end earns the shared shape (ADR 008).

/**
 * When a field's validation errors become visible.
 *
 * - `'touched'` — only after the field is touched (focus→blur), plus everything
 *   once the form is submitted (React Hook Form's default UX). **The default.**
 * - `'always'` — as soon as the validator produces them (pre-ADR-027 behaviour);
 *   the opt-out for consumers that want to report immediately.
 * - `'submit'` — only after a submit attempt.
 */
export type ShowErrorsWhen = 'always' | 'touched' | 'submit'

/**
 * The default policy (ADR 027): quiet until touched, RHF-style. Note this means a
 * `ValidationProvider` must be fed `touched`/`submitted` (normally by spreading
 * `useFormTree`'s `validation` capability) for errors to appear; pass
 * `showErrorsWhen="always"` to report the moment an error exists regardless of
 * touch.
 */
export const DEFAULT_SHOW_ERRORS_WHEN: ShowErrorsWhen = 'touched'

/**
 * Whether one field's errors should be displayed, given the policy and the
 * field's touched state + whether the form has been submitted. Pure and total.
 */
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
