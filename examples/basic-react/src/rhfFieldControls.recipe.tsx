// RECIPE (shared half): React Hook Form field controls + error-presentation
// glue — the front-end-agnostic part of the App_12/App_12B RHF recipes.
//
// This is NOT a maintained package (ADR 024) — it's a second file in a
// two-file copy-paste recipe. Copying "the RHF recipe" means copying BOTH
// this file AND the specific front-end file (App_12 for JSON Schema, App_12B
// for Zod). This split is deliberate, not incidental: every export below is
// typed against the NEUTRAL seam (`ControlProps<K>`, not `FieldProps<Shape,
// P>`) — it moved out completely unchanged, no per-front-end variant needed,
// because none of it was ever front-end-specific to begin with. What stays
// OUT of this file, in each App_12*.tsx: the schema, the validator/resolver
// wiring (AJV vs Zod diverge structurally — see App_12's cast vs App_12B's
// none), `mode`, and any cross-field rule (hardcodes field names).
import { useFormContext, useFormState, get } from 'react-hook-form'
import type { ReactNode } from 'react'
import {
  fieldErrorId,
  type ControlProps,
  type PartComponent,
  type LabelData,
  type TextData,
} from '@formframe/renderer-react'

// --- Errors as a PROP, sourced from RHF, never our internal store (#117) -----
//
// `useFormState({ name })`'s `name` only scopes WHEN this re-renders (RHF's
// subscription optimization) — the returned `errors` is always the FULL
// nested `FieldErrors` tree, so a nested-path lookup is still required. `get`
// is RHF's own exported utility (the same one `@hookform/error-message`'s
// `ErrorMessage` component uses internally) — reused here instead of hand-
// rolling a dot-path walk, and it means the `@hookform/error-message` package
// itself buys nothing this recipe doesn't already have via `react-hook-form`.
//
// UNIFIED DISPLAY POLICY (shared by all three recipes — App_12, App_12B,
// App_18): a field's error is revealed only once the field has been DIRTIED
// (differs from its default) AND BLURRED, or after a submit attempt; after a
// submit, changed fields revalidate live. The gate lives here — RHF's `mode`
// only controls when errors are COMPUTED (`'onTouched'` in both RHF recipes:
// first blur, then every change); this gate decides what SHOWS. Per #117 the
// injected errors are pre-gated by the recipe — present == show — so
// `aria-invalid` (below) tracks exactly what's displayed. Note `dirtyFields`
// is COMPARATIVE (a field reverted to its default value un-dirties and
// re-hides pre-submit) — App_18 matches this deliberately by gating on
// TanStack's comparative `isDefaultValue`, not its sticky `isDirty`.

export function useFieldError(path: string): { message?: string } | undefined {
  const { errors, touchedFields, dirtyFields, isSubmitted } = useFormState({
    name: path,
  })
  const error = get(errors, path) as { message?: string } | undefined
  const show =
    isSubmitted || (!!get(touchedFields, path) && !!get(dirtyFields, path))
  return show ? error : undefined
}

export function useFieldA11y(path: string): {
  'aria-invalid'?: true
  'aria-describedby'?: string
} {
  const error = useFieldError(path)
  // Canonical "has an error" check is presence of the error object, not
  // truthiness of `.message` — a validator can legally produce an error with
  // an empty message, and `error?.message` would silently drop aria-invalid
  // for it (a real a11y bug, not just a cosmetic one).
  return error
    ? { 'aria-invalid': true, 'aria-describedby': fieldErrorId(path) }
    : {}
}

export function FieldErrors({ path }: { path: string }): ReactNode {
  const error = useFieldError(path)
  if (!error) return null
  return (
    // No role="alert"/live region — matches the #117 locked seam ("no
    // role=alert by default") and App_18. With post-submit change-
    // revalidation, an assertive region would re-announce on every keystroke
    // while the user fixes a field; `aria-describedby` (wired by
    // `useFieldA11y`) keeps the control↔error association without that.
    <ul id={fieldErrorId(path)} className="jsf-field-errors">
      <li>{error.message}</li>
    </ul>
  )
}

// --- One handler per control archetype (ADR 047 §3 `r.control(kind, …)`) -----
// `parts.Control`'s `render` prop hands back the raw, kind-narrowed
// `FieldControl` — the consumer wires `register()` and owns a11y (spreading
// `c.attrs` and adding our own), exactly like the top-level `Default of={node}
// parts={{…}}` override does for a single field, but generically for every
// field of this archetype.
//
// The label/description/error shell is IDENTICAL across every archetype —
// only what fills `<parts.Control render={…}/>` differs — so it's factored
// into one wrapper instead of repeated per handler.

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

// "EMPTY MEANS ABSENT", uniformly: EVERY control registers with this
// normalization, not just number/select. RHF reads native inputs' DOM values
// at submit, so an untouched text input would otherwise submit `""` — which
// PASSES `required` but fails `format`/`minLength`, a different error set
// than a controlled form library (TanStack, App_18) whose untouched fields
// are genuinely `undefined`. Normalizing "" → undefined everywhere makes an
// empty field mean "absent" (so `required` fires, not "must match format
// \"email\"" against an empty string) and keeps all three recipes'
// validation behavior identical — a divergence found by
// `scripts/recipe-parity-smoke.mjs`, not by reading docs. The radio-group
// variant also maps RHF's no-selection values (null/false) to undefined.
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
