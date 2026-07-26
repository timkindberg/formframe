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
//   • A shippable display policy: a field's error appears once the field has
//     been EDITED and LEFT (dirtied + blurred), everything is revealed on a
//     submit attempt, and fixes clear live as you type.
//   • "Empty means absent": every control normalizes "" → undefined, so an
//     untouched field submits as missing (fails `required` if required) rather
//     than as an empty string (which would pass `required` but fail
//     format/minLength — confusing errors for fields the user never touched).
import { useFormContext, useFormState, get } from 'react-hook-form'
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
 * This field's error, already gated by the display policy — `undefined` means
 * "show nothing", whether because the field is valid or because the error
 * shouldn't be revealed yet. Reveal rules: (dirtied AND blurred) OR a submit
 * has been attempted. `dirtyFields` is comparative, so a field reverted to its
 * default value re-hides its error pre-submit.
 */
export function useVisibleFieldError(
  path: string
): { message?: string } | undefined {
  const { errors, touchedFields, dirtyFields, isSubmitted } = useFormState({
    name: path,
  })
  const error = get(errors, path) as { message?: string } | undefined
  const show =
    isSubmitted || (!!get(touchedFields, path) && !!get(dirtyFields, path))
  return show ? error : undefined
}

/** `aria-invalid` + `aria-describedby` for the control, tracking exactly what
 * is DISPLAYED (not everything the validator computed). The check is presence
 * of the error object, not `error.message` truthiness — a validator can
 * legally produce an error with an empty message, and dropping `aria-invalid`
 * for it would be a real accessibility bug. */
export function useFieldA11y(path: string): {
  'aria-invalid'?: true
  'aria-describedby'?: string
} {
  const error = useVisibleFieldError(path)
  return error
    ? { 'aria-invalid': true, 'aria-describedby': fieldErrorId(path) }
    : {}
}

export function FieldErrors({ path }: { path: string }): ReactNode {
  const error = useVisibleFieldError(path)
  if (!error) return null
  return (
    // Deliberately NO role="alert"/live region: errors revalidate on every
    // keystroke after a submit, and an assertive region would re-announce on
    // every character while the user fixes the field. `aria-describedby`
    // (wired above) keeps the control↔error association without the noise.
    <ul id={fieldErrorId(path)} className="jsf-field-errors">
      <li>{error.message}</li>
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
  children,
}: {
  path: string
  parts: FieldShellParts
  children: ReactNode
}): ReactNode {
  return (
    <div className="jsf-field">
      <parts.Label />
      {parts.Description && <parts.Description />}
      {children}
      <FieldErrors path={path} />
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
  const a11y = useFieldA11y(path)
  return (
    <FieldShell path={path} parts={parts}>
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
  const a11y = useFieldA11y(path)
  return (
    <FieldShell path={path} parts={parts}>
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
  const a11y = useFieldA11y(path)
  return (
    <FieldShell path={path} parts={parts}>
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
//   `aria-invalid` tracking the DISPLAYED error + no role="alert" both match
//   the seam's decisions. Handler registration shape is ADR 047 §3.
// • The display gate lives HERE (not in `mode`) so all three recipes —
//   App_12, App_12B, App_18 (TanStack) — share one observable policy;
//   `scripts/recipe-parity-smoke.mjs` drives all three through an identical
//   interaction script and asserts identical behavior. App_18 matches
//   `dirtyFields`' comparative semantics via TanStack's `isDefaultValue`
//   (not its sticky `isDirty`) so revert-to-default re-hides in both.
// • "Empty means absent" on ALL controls (not just number/select) was a
//   parity-smoke finding: DOM-read "" vs controlled undefined produced
//   different error sets between RHF and TanStack at submit.
// • `useVisibleFieldError` subscribes twice per field (a11y + error list) —
//   deliberate simplicity; `useFormState({name})` is scoped and cheap.
// ──────────────────────────────────────────────────────────────────────────────
