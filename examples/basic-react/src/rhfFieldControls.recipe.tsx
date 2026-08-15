// RECIPE (per form library): React Hook Form defaults bindings for FormFrame.
//
// Layer 2 of the three-layer recipe stack:
//
//   fieldPresentation.recipe.tsx   ← shared blank/match helpers + ValidationSummary (copy it too)
//   rhfFieldControls.recipe.tsx    ← you are here. RHF-specific.
//   Recipe_ReactHookForm_JSONSchema (JSON Schema) / Recipe_ReactHookForm_Zod (Zod)   ← per schema front-end
//
// Everything here is about RHF and nothing else: `register()` bindings and
// mapping RHF errors → `ValidationError[]`, injected on `defaults.field.root`
// via `<InjectFieldErrors>` (form-lib wiring on `defaults.field.control`).
// Field chrome + error-state a11y come from the library (merged into `attrs`
// for input/select; choicegroup spreads error a11y on the wrapper). Typed
// against FormFrame's neutral control seam (no schema generics), so ONE copy
// serves every schema front-end.
//
// Display timing is RHF's, not this file's: whatever `mode`/`reValidateMode`
// you pass to `useForm` decides when errors exist, and these defaults inject
// whatever RHF is holding. RHF's defaults give the recommended out-of-box UX
// (quiet until the first submit attempt, then reveal and clear live). Want
// blur-gated reveal instead? `mode: 'onTouched'` — nothing here changes.
import { useContext, type ReactNode } from 'react'
import { useFormContext, useFormState, get } from 'react-hook-form'
import type { FieldError, FieldErrors } from 'react-hook-form'
import type { FieldControl, ValidationError } from '@formframe/core'
import {
  errorA11yProps,
  FieldA11yContext,
  InjectFieldErrors,
  nativeDefaults,
  type ReactPartialDefaults,
} from '@formframe/renderer-react'
import {
  blankToUndefined,
  unselectedToUndefined,
} from './fieldPresentation.recipe'

/**
 * This field's errors as `ValidationError[]` for FormFrame's error inject.
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

/**
 * Flatten RHF's nested `formState.errors` into the `ValidationError[]`
 * `ValidationSummary` expects. Field-level `useFieldValidationErrors`
 * stays the per-control path; this is only for the form-level list.
 */
export function rhfErrorsToList(errors: FieldErrors): ValidationError[] {
  const out: ValidationError[] = []
  const walk = (node: object, prefix: string) => {
    for (const [key, value] of Object.entries(node)) {
      if (!value || typeof value !== 'object') continue
      const path = prefix ? `${prefix}.${key}` : key
      const asField = value as FieldError & Record<string, unknown>
      if (typeof asField.message === 'string') {
        out.push({
          path,
          message: asField.message || 'Invalid value.',
          keyword: typeof asField.type === 'string' ? asField.type : undefined,
        })
        continue
      }
      if (Array.isArray(value)) {
        value.forEach((item, i) => {
          if (item && typeof item === 'object') walk(item, `${path}.${i}`)
        })
      } else {
        walk(asField, path)
      }
    }
  }
  walk(errors, '')
  return out
}

// `register`'s `setValueAs` is where "empty means absent" is applied for RHF
// (it reads native DOM values, so untouched fields arrive as "").
const blankOption = { setValueAs: blankToUndefined }
const unselectedOption = { setValueAs: unselectedToUndefined }

function RhfRecipeFieldRoot({
  node,
  overrides,
}: Parameters<NonNullable<typeof nativeDefaults.field.root>>[0]): ReactNode {
  const errors = useFieldValidationErrors(node.path)
  const Root = nativeDefaults.field.root
  return (
    <InjectFieldErrors errors={errors}>
      <Root node={node} overrides={overrides} />
    </InjectFieldErrors>
  )
}

function RhfRecipeFieldControl(control: FieldControl): ReactNode {
  const { register } = useFormContext()
  const errorA11y = errorA11yProps(useContext(FieldA11yContext))
  switch (control.kind) {
    case 'input': {
      const path = control.attrs.name
      return (
        <input
          {...control.attrs}
          {...register(path, blankOption)}
          {...errorA11y}
        />
      )
    }
    case 'select': {
      const { attrs, options } = control
      const path = attrs.name
      return (
        <select
          {...attrs}
          {...register(path, attrs.multiple ? undefined : blankOption)}
          {...errorA11y}
        >
          {!attrs.multiple && <option value="">-- select --</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    }
    case 'choicegroup': {
      const path = control.options[0].attrs.name
      return (
        <div
          className="jsf-choicegroup"
          role={control.role}
          aria-labelledby={control.labelledBy}
          {...errorA11y}
        >
          {control.options.map((o) => (
            <label key={o.attrs.id} className="jsf-choice">
              <input {...o.attrs} {...register(path, unselectedOption)} />
              <span className="jsf-choice-text">{o.label}</span>
            </label>
          ))}
        </div>
      )
    }
    default:
      return nativeDefaults.field.control(control)
  }
}

/** Kind-wide RHF recipe defaults — pass to `useFormTree({ defaults })`. */
export const rhfFieldDefaults: ReactPartialDefaults = {
  field: {
    root: RhfRecipeFieldRoot,
    control: RhfRecipeFieldControl,
  },
}
