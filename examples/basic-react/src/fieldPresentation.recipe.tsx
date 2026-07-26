// RECIPE (shared, form-library-agnostic): how a field LOOKS and how its
// errors are announced — with no dependency on React Hook Form, TanStack
// Form, or any particular schema front-end.
//
// This is the bottom layer of a three-layer recipe stack:
//
//   fieldPresentation.recipe.tsx   ← you are here. Shared by EVERY recipe.
//   <library>FieldControls.recipe  ← per form library (RHF / TanStack).
//   App_NN.tsx                     ← per schema front-end (JSON Schema / Zod).
//
// Nothing here imports a form library, which is exactly why it can be shared:
// the only thing a field needs to render its errors is the field's PATH and
// its CURRENT MESSAGES. Each form library's controls file normalizes its own
// error shape into `FieldMessages` and hands it over.
//
// Copy this file once; it serves every recipe you use.
import type { ReactNode } from 'react'
import type { Validator } from '@formframe/core'
import {
  fieldErrorId,
  type PartComponent,
  type LabelData,
  type TextData,
} from '@formframe/renderer-react'

/**
 * A field's currently-displayable error messages. The normalized currency
 * between "whatever your form library holds" and "what gets rendered".
 *
 * Empty means valid (or not-yet-revealed — the timing decision belongs to
 * your form library's validation mode, not to this file). Non-empty means
 * show them AND mark the control invalid, so `aria-invalid` can never
 * disagree with what's on screen.
 */
export type FieldMessages = readonly string[]

/** `aria-invalid` + `aria-describedby` for a control, derived from exactly
 * the messages being displayed. Spread onto the control element. */
export function a11yAttrs(
  path: string,
  messages: FieldMessages
): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
  return messages.length > 0
    ? { 'aria-invalid': true, 'aria-describedby': fieldErrorId(path) }
    : {}
}

export function FieldErrors({
  path,
  messages,
}: {
  path: string
  messages: FieldMessages
}): ReactNode {
  if (messages.length === 0) return null
  return (
    // Deliberately NO role="alert"/live region: with revalidate-on-change
    // (every library's default after the first submit), an assertive region
    // re-announces on every keystroke while the user is fixing the field.
    // The `aria-describedby` association from `a11yAttrs` is what carries the
    // message to a screen reader, without the interruption.
    <ul id={fieldErrorId(path)} className="jsf-field-errors">
      {messages.map((message, i) => (
        <li key={i}>{message}</li>
      ))}
    </ul>
  )
}

export interface FieldShellParts {
  Label: PartComponent<LabelData>
  Description?: PartComponent<TextData>
}

/** Label, description, the control itself, then its errors. The same shell
 * for every control archetype and every form library — only what you pass as
 * `children` changes. */
export function FieldShell({
  path,
  parts,
  messages,
  children,
}: {
  path: string
  parts: FieldShellParts
  messages: FieldMessages
  children: ReactNode
}): ReactNode {
  return (
    <div className="jsf-field">
      <parts.Label />
      {parts.Description && <parts.Description />}
      {children}
      <FieldErrors path={path} messages={messages} />
    </div>
  )
}

// --- "Empty means absent" ----------------------------------------------------
// A field the user never filled in should submit as MISSING, not as "". An
// empty string passes a `required` check but then fails `format`/`minLength`,
// producing errors that make no sense for a field nobody touched. Controlled
// libraries (TanStack) hand you `undefined` already; uncontrolled ones (RHF,
// reading DOM values) hand you "" — so both normalize through these.

/** Text/number/select values: "" means the user left it alone. */
export function blankToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value
}

/** Radio/checkbox groups, where "nothing selected" can also surface as
 * `false` or `null` depending on the library. */
export function unselectedToUndefined(value: unknown): unknown {
  return value === '' || value === false || value == null ? undefined : value
}

// --- Validator composition ---------------------------------------------------

/**
 * Add a "these two fields must match" rule on top of any FormFrame
 * `Validator`. Pure composition over FormFrame's own validation contract, so
 * it works with any validator (AJV, Zod, Valibot) and any form library.
 *
 * The error attaches to `field` — a concrete path — so it renders through the
 * exact same per-field mechanism as a structural schema error, with no
 * "form-level error" special case anywhere downstream.
 *
 * (Zod expresses this natively with `.refine(fn, { path })`; reach for this
 * when your schema language can't, as plain JSON Schema can't.)
 */
export function withMatchRule<T>(
  validator: Validator<T>,
  field: string,
  mustMatch: string,
  message: string
): Validator<T> {
  return (data) => {
    const result = validator(data)
    const values = (result.data ?? data) as Record<string, unknown>
    const a = values?.[field]
    const b = values?.[mustMatch]
    if (a !== undefined && b !== undefined && a !== b) {
      return {
        valid: false,
        errors: [...result.errors, { path: field, message, keyword: 'match' }],
        data: result.data,
      }
    }
    return result
  }
}
