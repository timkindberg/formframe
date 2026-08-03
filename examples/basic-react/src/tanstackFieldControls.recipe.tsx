// RECIPE (per form library): TanStack Form control bindings for FormFrame.
//
// Layer 2 of the three-layer recipe stack — the peer of
// `rhfFieldControls.recipe.tsx`:
//
//   fieldPresentation.recipe.tsx        ← shared blank/match helpers (copy too)
//   tanstackFieldControls.recipe.tsx    ← you are here. TanStack-specific.
//   Recipe_18 (JSON Schema) / Recipe_18B (Zod)      ← per schema front-end
//
// Everything here is about TanStack Form and nothing else. Mapping field
// `meta.errors` → `ValidationError[]` for FormFrame's
// `<Default of={node} errors={…} />` inject. Field chrome + a11y come from the
// library (a11y is merged into `c.attrs` for input/select). Typed against
// FormFrame's neutral `ControlProps<K>` seam (no schema generics), so ONE copy
// serves every schema front-end.
//
// How this differs from the RHF controls file, and why:
//
//   • CONTROLLED binds. TanStack has no uncontrolled `register()` — every
//     control wires `field.state.value` / `handleChange` / `handleBlur`.
//   • No ambient provider. TanStack ships no FormProvider/useFormContext, so
//     this file supplies a small Context. Wrap your form in
//     `<TanStackFormProvider form={form}>`.
//   • Display timing is `validationLogic`'s, not this file's. These controls
//     inject whatever TanStack holds; `revalidateLogic()` (no arguments) is
//     TanStack's recommended default and matches RHF's out-of-box behavior.
import { createContext, useContext, type ReactNode } from 'react'
import type { AnyFieldApi } from '@tanstack/react-form'
import type { ValidationError } from '@formframe/core'
import { Default, type ControlProps } from '@formframe/renderer-react'
import {
  blankToUndefined,
  unselectedToUndefined,
} from './fieldPresentation.recipe'

// --- The slice of TanStack's API these controls consume ----------------------
// TanStack's full `FormApi`/`FieldApi` types carry ~12 interlocking generic
// parameters that can't be pinned from a runtime path string: FormFrame hands
// each control handler `path: string`, while TanStack's `Field` wants a
// compile-time key literal. TanStack's own escape hatch here is `AnyFieldApi`
// (literally `any`). Declaring the narrow structural slice we actually use is
// the typed version of that move — and the indexed lookups below make it a
// real drift guard, not just documentation.

/** One validation issue as TanStack surfaces it (Standard Schema guarantees
 * `message`). */
interface FieldIssue {
  message: string
}

/**
 * Every member these controls read off a TanStack field, written as indexed
 * lookups into TanStack's own `AnyFieldApi`. Rename or remove any of them
 * upstream and THIS fails to compile, instead of the recipe breaking silently
 * at runtime. (The lookups only assert the keys exist — `AnyFieldApi` is
 * generic-erased — so `RecipeFieldApi` re-narrows the types below.)
 */
type TanStackFieldMembers = {
  handleChange: AnyFieldApi['handleChange']
  handleBlur: AnyFieldApi['handleBlur']
  state: {
    value: AnyFieldApi['state']['value']
    meta: { errors: AnyFieldApi['state']['meta']['errors'] }
  }
}

interface RecipeFieldApi extends TanStackFieldMembers {
  state: {
    /** `unknown`, not TanStack's `any` — forces explicit coercion below. */
    value: unknown
    /** Already timed by `validationLogic`; whatever is here should show.
     * (Mutable array only so it stays assignable to TanStack's own `any[]`
     * above; nothing here writes to it.) */
    meta: { errors: FieldIssue[] }
  }
}

interface RecipeFormApi {
  Field: (props: {
    name: string
    children: (field: RecipeFieldApi) => ReactNode
  }) => ReactNode
}

const TanStackFormContext = createContext<RecipeFormApi | null>(null)

/**
 * Makes your `useForm()` instance reachable from the control handlers — the
 * job RHF's `<FormProvider>` does for free.
 *
 * `form` is typed loosely here on purpose: TanStack's real form type is
 * generic over the validator set, and pinning it would force every consumer
 * to thread those generics. The narrowing happens on the way out (into
 * `RecipeFormApi`), and `form.Field` is a CHECKED property lookup, so an
 * upstream rename still fails the build.
 */
export function TanStackFormProvider({
  form,
  children,
}: {
  form: { Field: unknown }
  children: ReactNode
}): ReactNode {
  return (
    <TanStackFormContext.Provider
      value={{ Field: form.Field as RecipeFormApi['Field'] }}
    >
      {children}
    </TanStackFormContext.Provider>
  )
}

function useTanStackForm(): RecipeFormApi {
  const form = useContext(TanStackFormContext)
  if (!form) {
    throw new Error(
      'TanStack controls: wrap your form in <TanStackFormProvider form={form}>'
    )
  }
  return form
}

function toValidationErrors(
  path: string,
  issues: FieldIssue[]
): ValidationError[] {
  return issues.map((e) => ({ path, message: e.message }))
}

/**
 * Mounts the TanStack field for `path` and hands back the field plus its
 * errors as `ValidationError[]` for FormFrame's error inject.
 *
 * No display gate here: `validationLogic` already decides when errors exist.
 */
function Field({
  path,
  children,
}: {
  path: string
  children: (field: RecipeFieldApi, errors: ValidationError[]) => ReactNode
}): ReactNode {
  const form = useTanStackForm()
  return (
    <form.Field name={path}>
      {(field) =>
        children(field, toValidationErrors(path, field.state.meta.errors))
      }
    </form.Field>
  )
}

// --- One handler per control archetype ---------------------------------------
// Registered via `r.control('input' | 'select' | 'choicegroup', …)` in the
// front-end file. Every control applies the shared "empty means absent"
// normalization on change. Inject errors; override only the control.
// `ControlProps<'input'>` narrows `node.parts.control`, so no `c.kind ===` guard.

export function InputControl({ path, node }: ControlProps<'input'>): ReactNode {
  return (
    <Field path={path}>
      {(field, errors) => (
        <Default
          of={node}
          errors={errors}
          parts={{
            control: (c) => (
              <input
                {...c.attrs}
                value={String(field.state.value ?? '')}
                onChange={(e) =>
                  field.handleChange(blankToUndefined(e.target.value))
                }
                onBlur={field.handleBlur}
              />
            ),
          }}
        />
      )}
    </Field>
  )
}

export function SelectControl({
  path,
  node,
}: ControlProps<'select'>): ReactNode {
  return (
    <Field path={path}>
      {(field, errors) => (
        <Default
          of={node}
          errors={errors}
          parts={{
            control: (c) => (
              <select
                {...c.attrs}
                value={String(field.state.value ?? '')}
                onChange={(e) =>
                  field.handleChange(blankToUndefined(e.target.value))
                }
                onBlur={field.handleBlur}
              >
                {!c.attrs.multiple && <option value="">-- select --</option>}
                {c.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ),
          }}
        />
      )}
    </Field>
  )
}

export function ChoiceGroupControl({
  path,
  node,
}: ControlProps<'choicegroup'>): ReactNode {
  return (
    <Field path={path}>
      {(field, errors) => (
        <Default
          of={node}
          errors={errors}
          parts={{
            control: (c) => (
              <div
                role={c.role}
                aria-labelledby={c.labelledBy}
                onBlur={field.handleBlur}
                {...c.a11y}
              >
                {c.options.map((o) => (
                  <label key={o.attrs.id}>
                    <input
                      {...o.attrs}
                      checked={field.state.value === o.attrs.value}
                      onChange={() =>
                        field.handleChange(unselectedToUndefined(o.attrs.value))
                      }
                    />{' '}
                    {o.label}
                  </label>
                ))}
              </div>
            ),
          }}
        />
      )}
    </Field>
  )
}
