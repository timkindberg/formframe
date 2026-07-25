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

export function useFieldError(path: string): { message?: string } | undefined {
  const { errors } = useFormState({ name: path })
  return get(errors, path) as { message?: string } | undefined
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
    <ul id={fieldErrorId(path)} className="jsf-field-errors" role="alert">
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
          <input
            {...c.attrs}
            {...register(
              path,
              c.attrs.type === 'number'
                ? { setValueAs: (v) => (v === '' ? undefined : v) }
                : undefined
            )}
            {...a11y}
          />
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
            {...register(
              path,
              // A blank "-- select --" placeholder submits "" for an untouched
              // optional field, which fails an `enum` check ("" isn't a member).
              // Map it to `undefined` — mirrors the empty-number normalization
              // above — so "nothing chosen" round-trips as absent, not invalid.
              c.attrs.multiple
                ? undefined
                : { setValueAs: (v) => (v === '' ? undefined : v) }
            )}
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
                <input {...o.attrs} {...register(path)} /> {o.label}
              </label>
            ))}
          </div>
        )}
      />
    </FieldShell>
  )
}
