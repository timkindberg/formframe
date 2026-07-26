// RECIPE: React Hook Form field controls for FormFrame — the shared half of a
// two-file copy-paste recipe. Pair this file with a front-end file:
//
//   • App_12  — JSON Schema + AJV
//   • App_12B — Zod
//
// Copy BOTH files into your app; they're yours to edit. Everything here is
// typed against FormFrame's neutral `ControlProps<K>` seam (no schema
// generics), which is why one copy serves every front-end unchanged.
//
// What you get, per control archetype (input / select / radio group):
//
//   • RHF `register()` wired through FormFrame's `parts.Control` render prop —
//     FormFrame renders the field structure, RHF owns the value.
//   • Errors read from RHF (`useFormState`) and rendered inline, with
//     `aria-invalid` + `aria-describedby` pointing at the error list.
//   • Display timing belongs to RHF: whatever `mode`/`reValidateMode` you pick
//     decides when errors exist, and this file simply renders what RHF holds.
//     With RHF's defaults that means the recommended out-of-box UX — quiet
//     until the first submit attempt, then errors reveal and clear live as
//     the user fixes them. Want blur-gated display instead? Just pass
//     `mode: 'onTouched'` to `useForm` — nothing here changes.
//   • "Empty means absent": every control normalizes "" → undefined, so an
//     untouched field submits as missing (fails `required` if required) rather
//     than as an empty string (which would pass `required` but fail
//     format/minLength — confusing errors for fields the user never touched).
import { useFormContext, useFormState, get } from 'react-hook-form'
import type { FieldError } from 'react-hook-form'
import type { ReactNode } from 'react'
import {
  fieldErrorId,
  type ControlProps,
  type PartComponent,
  type LabelData,
  type TextData,
} from '@formframe/renderer-react'

// --- Reading errors out of RHF ----------------------------------------------
//
// `useFormState({ name })` scopes WHEN this component re-renders (only on this
// field's changes), but the returned `errors` is always the FULL nested tree —
// so the nested-path lookup still happens here, via `get`. `get` is RHF's own
// exported utility (the same one `@hookform/error-message` uses internally),
// so you don't need that extra package.

/**
 * This field's current RHF error, or `undefined`. No display gating here —
 * RHF's `mode`/`reValidateMode` already decide WHEN errors exist, so whatever
 * RHF holds is what should show. (If you want display timing RHF's modes
 * can't express — e.g. "only after dirtied AND blurred" — this is the one
 * place to add the gate: read `touchedFields`/`dirtyFields`/`isSubmitted`
 * from the same `useFormState` call and return `undefined` until your
 * condition holds.)
 */
export function useFieldError(path: string): FieldError | undefined {
  const { errors } = useFormState({ name: path })
  return get(errors, path) as FieldError | undefined
}

/** `aria-invalid` + `aria-describedby` for the control. Pure — hand it the
 * error you already read, so a field subscribes once and both the control and
 * the message list work off the same value. Keyed on the error's PRESENCE,
 * not `message` truthiness: RHF types `message` as optional, and dropping
 * `aria-invalid` for a message-less error would be a real a11y bug. */
export function a11yAttrs(
  path: string,
  error: FieldError | undefined
): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
  return error
    ? { 'aria-invalid': true, 'aria-describedby': fieldErrorId(path) }
    : {}
}

export function FieldErrors({
  path,
  error,
}: {
  path: string
  error: FieldError | undefined
}): ReactNode {
  if (!error) return null
  return (
    // Deliberately NO role="alert"/live region: errors revalidate on every
    // keystroke after a submit, and an assertive region would re-announce on
    // every character while the user fixes the field. `aria-describedby`
    // (wired by `a11yAttrs`) keeps the control↔error association without the
    // noise. The fallback text matters: `message` is optional in RHF's types,
    // and an empty <li> would leave `aria-describedby` pointing at nothing a
    // screen reader can announce.
    <ul id={fieldErrorId(path)} className="jsf-field-errors">
      <li>{error.message || 'Invalid value.'}</li>
    </ul>
  )
}

// --- One handler per control archetype ---------------------------------------
// Registered via `r.control('input' | 'select' | 'choicegroup', …)` in the
// front-end file. `parts.Control`'s `render` prop hands back the raw,
// kind-narrowed control description — you wire `register()` and own the a11y
// attributes (spread `c.attrs`, add your own). The label/description/error
// shell is identical across archetypes, so it's one component.

export interface FieldShellParts {
  Label: PartComponent<LabelData>
  Description?: PartComponent<TextData>
}

export function FieldShell({
  path,
  parts,
  error,
  children,
}: {
  path: string
  parts: FieldShellParts
  error: FieldError | undefined
  children: ReactNode
}): ReactNode {
  return (
    <div className="jsf-field">
      <parts.Label />
      {parts.Description && <parts.Description />}
      {children}
      <FieldErrors path={path} error={error} />
    </div>
  )
}

// "Empty means absent", applied to EVERY control (not just numbers/selects).
// RHF reads native inputs' DOM values, so an untouched text input would
// otherwise submit "" — passing `required` but failing format/minLength with
// errors the user can't make sense of. The radio-group variant also maps
// RHF's no-selection values (null/false) to undefined.
const emptyToUndefined = {
  setValueAs: (v: unknown) => (v === '' ? undefined : v),
}
const noChoiceToUndefined = {
  setValueAs: (v: unknown) =>
    v === '' || v === false || v == null ? undefined : v,
}

export function InputControl({
  path,
  parts,
}: ControlProps<'input'>): ReactNode {
  const { register } = useFormContext()
  const error = useFieldError(path)
  const a11y = a11yAttrs(path, error)
  return (
    <FieldShell path={path} parts={parts} error={error}>
      <parts.Control
        render={(c) => (
          <input {...c.attrs} {...register(path, emptyToUndefined)} {...a11y} />
        )}
      />
    </FieldShell>
  )
}

export function SelectControl({
  path,
  parts,
}: ControlProps<'select'>): ReactNode {
  const { register } = useFormContext()
  const error = useFieldError(path)
  const a11y = a11yAttrs(path, error)
  return (
    <FieldShell path={path} parts={parts} error={error}>
      <parts.Control
        render={(c) => (
          <select
            {...c.attrs}
            {...register(path, c.attrs.multiple ? undefined : emptyToUndefined)}
            {...a11y}
          >
            {!c.attrs.multiple && <option value="">-- select --</option>}
            {c.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      />
    </FieldShell>
  )
}

export function ChoiceGroupControl({
  path,
  parts,
}: ControlProps<'choicegroup'>): ReactNode {
  const { register } = useFormContext()
  const error = useFieldError(path)
  const a11y = a11yAttrs(path, error)
  return (
    <FieldShell path={path} parts={parts} error={error}>
      <parts.Control
        render={(c) => (
          <div role={c.role} aria-labelledby={c.labelledBy} {...a11y}>
            {c.options.map((o) => (
              <label key={o.attrs.id}>
                <input {...o.attrs} {...register(path, noChoiceToUndefined)} />{' '}
                {o.label}
              </label>
            ))}
          </div>
        )}
      />
    </FieldShell>
  )
}

// ─── MAINTAINER NOTES (temporary — not part of the recipe) ───────────────────
// Build-log for the #116 epic ("demote validation to a non-goal"); safe to
// delete wholesale when copying this file into your app.
//
// • Errors-as-a-prop is the #117 locked seam ("the library renders, recipes
//   produce") — no ValidationProvider / internal error store here, and
//   `aria-invalid` tracking the displayed error + no role="alert" both match
//   the seam's decisions. Handler registration shape is ADR 047 §3.
// • Display policy = each library's OWN defaults, deliberately: RHF's
//   default mode (onSubmit + reValidateMode onChange) and TanStack's
//   `revalidateLogic()` no-args default agree observably (quiet until first
//   submit, live after) — TanStack's doc comment says revalidateLogic exists
//   to emulate RHF. That agreement is what `scripts/recipe-parity-smoke.mjs`
//   asserts across App_12/App_12B/App_18 with one shared interaction script;
//   no hand-rolled display gate needed in any recipe. (An earlier iteration
//   imposed a custom dirtied+blurred gate here — reverted in favor of
//   library defaults; the hook doc above shows where a gate would go.)
// • "Empty means absent" on ALL controls (not just number/select) was a
//   parity-smoke finding: DOM-read "" vs controlled undefined produced
//   different error sets between RHF and TanStack at submit.
// • `useFieldError` subscribes twice per field (a11y + error list) —
//   deliberate simplicity; `useFormState({name})` is scoped and cheap.
// ──────────────────────────────────────────────────────────────────────────────
