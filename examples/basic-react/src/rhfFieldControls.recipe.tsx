// RECIPE (per form library): React Hook Form control bindings for FormFrame.
//
// Layer 2 of the three-layer recipe stack:
//
//   fieldPresentation.recipe.tsx   ← shared blank/match helpers (copy it too)
//   rhfFieldControls.recipe.tsx    ← you are here. RHF-specific.
//   App_12 (JSON Schema) / App_12B (Zod)   ← per schema front-end
//
// Everything here is about RHF and nothing else: `register()` bindings and
// mapping RHF errors → `ValidationError[]` for FormFrame's `#117` inject seam
// (`<Default of={node} errors={…} />`). Field chrome + a11y come from the
// library (`c.a11y` on the control override). Typed against FormFrame's neutral
// `ControlProps<K>` seam (no schema generics), so ONE copy serves every schema
// front-end.
//
// Display timing is RHF's, not this file's: whatever `mode`/`reValidateMode`
// you pass to `useForm` decides when errors exist, and these controls inject
// whatever RHF is holding. RHF's defaults give the recommended out-of-box UX
// (quiet until the first submit attempt, then reveal and clear live). Want
// blur-gated reveal instead? `mode: 'onTouched'` — nothing here changes.
import { useFormContext, useFormState, get } from 'react-hook-form'
import type { FieldError } from 'react-hook-form'
import type { ReactNode } from 'react'
import type { ValidationError } from '@formframe/core'
import { Default, type ControlProps } from '@formframe/renderer-react'
import {
  blankToUndefined,
  unselectedToUndefined,
} from './fieldPresentation.recipe'

/**
 * This field's errors as `ValidationError[]` for the `#117` inject seam.
 * RHF holds at most one error per field, so this yields 0 or 1 entry.
 *
 * `useFormState({ name })` scopes WHEN this re-renders (only on this field's
 * changes), but the `errors` it returns is always the FULL nested tree — so
 * the nested-path lookup still happens here, via RHF's own exported `get`.
 *
 * The `|| 'Invalid value.'` fallback is load-bearing: RHF types `message` as
 * optional, and an error with no message would otherwise produce zero
 * messages — silently dropping both the visible text and `aria-invalid`.
 */
export function useFieldValidationErrors(path: string): ValidationError[] {
  const { errors } = useFormState({ name: path })
  const error = get(errors, path) as FieldError | undefined
  return error
    ? [
        {
          path,
          message: error.message || 'Invalid value.',
          keyword: error.type,
        },
      ]
    : []
}

// `register`'s `setValueAs` is where "empty means absent" is applied for RHF
// (it reads native DOM values, so untouched fields arrive as "").
const blankOption = { setValueAs: blankToUndefined }
const unselectedOption = { setValueAs: unselectedToUndefined }

// --- One handler per control archetype ---------------------------------------
// Registered via `r.control('input' | 'select' | 'choicegroup', …)` in the
// front-end file. Inject errors via `#117`; override only the control part so
// FormFrame keeps label / description / errors / a11y.

export function InputControl({ path, node }: ControlProps<'input'>): ReactNode {
  const { register } = useFormContext()
  const errors = useFieldValidationErrors(path)
  return (
    <Default
      of={node}
      errors={errors}
      parts={{
        control: (c) =>
          c.kind === 'input' ? (
            <input {...c.attrs} {...register(path, blankOption)} {...c.a11y} />
          ) : null,
      }}
    />
  )
}

export function SelectControl({
  path,
  node,
}: ControlProps<'select'>): ReactNode {
  const { register } = useFormContext()
  const errors = useFieldValidationErrors(path)
  return (
    <Default
      of={node}
      errors={errors}
      parts={{
        control: (c) =>
          c.kind === 'select' ? (
            <select
              {...c.attrs}
              {...register(path, c.attrs.multiple ? undefined : blankOption)}
              {...c.a11y}
            >
              {!c.attrs.multiple && <option value="">-- select --</option>}
              {c.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : null,
      }}
    />
  )
}

export function ChoiceGroupControl({
  path,
  node,
}: ControlProps<'choicegroup'>): ReactNode {
  const { register } = useFormContext()
  const errors = useFieldValidationErrors(path)
  return (
    <Default
      of={node}
      errors={errors}
      parts={{
        control: (c) =>
          c.kind === 'choicegroup' ? (
            <div role={c.role} aria-labelledby={c.labelledBy} {...c.a11y}>
              {c.options.map((o) => (
                <label key={o.attrs.id}>
                  <input {...o.attrs} {...register(path, unselectedOption)} />{' '}
                  {o.label}
                </label>
              ))}
            </div>
          ) : null,
      }}
    />
  )
}
