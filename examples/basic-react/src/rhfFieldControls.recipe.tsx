// RECIPE (per form library): React Hook Form control bindings for FormFrame.
//
// Layer 2 of the three-layer recipe stack:
//
//   fieldPresentation.recipe.tsx   ← shared shell/errors/a11y (copy it too)
//   rhfFieldControls.recipe.tsx    ← you are here. RHF-specific.
//   App_12 (JSON Schema) / App_12B (Zod)   ← per schema front-end
//
// Everything here is about RHF and nothing else: `register()` bindings and
// reading errors out of `useFormState`. It's typed against FormFrame's neutral
// `ControlProps<K>` seam (no schema generics), so ONE copy serves every schema
// front-end — App_12 and App_12B import it unchanged.
//
// Display timing is RHF's, not this file's: whatever `mode`/`reValidateMode`
// you pass to `useForm` decides when errors exist, and these controls render
// whatever RHF is holding. RHF's defaults give the recommended out-of-box UX
// (quiet until the first submit attempt, then reveal and clear live). Want
// blur-gated reveal instead? `mode: 'onTouched'` — nothing here changes.
import { useFormContext, useFormState, get } from 'react-hook-form'
import type { FieldError } from 'react-hook-form'
import type { ReactNode } from 'react'
import type { ControlProps } from '@formframe/renderer-react'
import {
  FieldShell,
  a11yAttrs,
  blankToUndefined,
  unselectedToUndefined,
  type FieldMessages,
} from './fieldPresentation.recipe'

/**
 * This field's error messages, normalized to the shared `FieldMessages`
 * shape. RHF holds at most one error per field, so this yields 0 or 1
 * message.
 *
 * `useFormState({ name })` scopes WHEN this re-renders (only on this field's
 * changes), but the `errors` it returns is always the FULL nested tree — so
 * the nested-path lookup still happens here, via RHF's own exported `get`
 * (the same utility `@hookform/error-message` uses internally, which is why
 * you don't need that package).
 *
 * The `|| 'Invalid value.'` fallback is load-bearing: RHF types `message` as
 * optional, and an error with no message would otherwise produce zero
 * messages — silently dropping both the visible text and `aria-invalid` for a
 * field that really is invalid.
 */
export function useFieldMessages(path: string): FieldMessages {
  const { errors } = useFormState({ name: path })
  const error = get(errors, path) as FieldError | undefined
  return error ? [error.message || 'Invalid value.'] : []
}

// `register`'s `setValueAs` is where "empty means absent" is applied for RHF
// (it reads native DOM values, so untouched fields arrive as "").
const blankOption = { setValueAs: blankToUndefined }
const unselectedOption = { setValueAs: unselectedToUndefined }

// --- One handler per control archetype ---------------------------------------
// Registered via `r.control('input' | 'select' | 'choicegroup', …)` in the
// front-end file. `parts.Control`'s `render` prop hands back the raw,
// kind-narrowed control description — you wire `register()` and spread the
// a11y attrs; FormFrame owns the surrounding structure.

export function InputControl({
  path,
  parts,
}: ControlProps<'input'>): ReactNode {
  const { register } = useFormContext()
  const messages = useFieldMessages(path)
  return (
    <FieldShell path={path} parts={parts} messages={messages}>
      <parts.Control
        render={(c) => (
          <input
            {...c.attrs}
            {...register(path, blankOption)}
            {...a11yAttrs(path, messages)}
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
  const messages = useFieldMessages(path)
  return (
    <FieldShell path={path} parts={parts} messages={messages}>
      <parts.Control
        render={(c) => (
          <select
            {...c.attrs}
            {...register(path, c.attrs.multiple ? undefined : blankOption)}
            {...a11yAttrs(path, messages)}
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
  const messages = useFieldMessages(path)
  return (
    <FieldShell path={path} parts={parts} messages={messages}>
      <parts.Control
        render={(c) => (
          <div
            role={c.role}
            aria-labelledby={c.labelledBy}
            {...a11yAttrs(path, messages)}
          >
            {c.options.map((o) => (
              <label key={o.attrs.id}>
                <input {...o.attrs} {...register(path, unselectedOption)} />{' '}
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
// Build-log for the #116 epic; safe to delete when copying this file.
// • Errors-as-a-prop is the #117 locked seam ("the library renders, recipes
//   produce"): no ValidationProvider / internal error store, `aria-invalid`
//   tracking exactly the displayed messages, no role="alert". Handler
//   registration shape is ADR 047 §3.
// • Display policy is RHF's own default, deliberately — see the header. An
//   earlier iteration hand-rolled a shared dirtied+blurred gate across all
//   recipes; deleted once we confirmed RHF's and TanStack's defaults already
//   agree observably (TanStack's `revalidateLogic` exists to emulate RHF).
//   Re-add a gate HERE (read touchedFields/dirtyFields/isSubmitted off the
//   same useFormState call) if a consumer needs timing modes can't express.
// • "Empty means absent" on ALL controls (not just number/select) was a
//   parity-smoke finding: DOM-read "" vs controlled `undefined` produced
//   different error sets between RHF and TanStack at submit.
// ──────────────────────────────────────────────────────────────────────────────
