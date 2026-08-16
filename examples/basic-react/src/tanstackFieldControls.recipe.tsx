// RECIPE (per form library): TanStack Form defaults bindings for FormFrame.
//
// Layer 2 of the three-layer recipe stack — the peer of
// `rhfFieldControls.recipe.tsx`:
//
//   fieldPresentation.recipe.tsx        ← shared blank/match helpers + ValidationSummary (copy too)
//   tanstackFieldControls.recipe.tsx    ← you are here. TanStack-specific.
//   Recipe_TanStackForm_JSONSchema (JSON Schema) / Recipe_TanStackForm_Zod (Zod)      ← per schema front-end
//
// Everything here is about TanStack Form and nothing else. Mapping field
// `meta.errors` → `ValidationError[]`, injected on `defaults.field.root` via
// `<InjectFieldErrors>` (controlled binds on a `defaults.field.control` arm). Field
// chrome + error-state a11y come from the library (merged into `attrs` for
// input/select; choicegroup spreads error a11y on the wrapper). Typed against
// FormFrame's neutral control seam (no schema generics), so ONE copy serves
// every schema front-end.
//
// How this differs from the RHF controls file, and why:
//
//   • CONTROLLED binds. TanStack has no uncontrolled `register()` — every
//     control wires `field.state.value` / `handleChange` / `handleBlur`.
//   • No ambient provider. TanStack ships no FormProvider/useFormContext, so
//     this file supplies a small Context. Wrap your form in
//     `<TanStackFormProvider form={form}>`.
//   • Display timing is `validationLogic`'s, not this file's. These defaults
//     inject whatever TanStack holds; `revalidateLogic()` (no arguments) is
//     TanStack's recommended default and matches RHF's out-of-box behavior.
import { createContext, useContext, type ReactNode } from 'react'
import type { AnyFieldApi } from '@tanstack/react-form'
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
const TanStackFieldBindingContext = createContext<RecipeFieldApi | null>(null)

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
 * Flatten TanStack `form.store` `fieldMeta` into the `ValidationError[]`
 * `ValidationSummary` expects. Per-field errors are injected on
 * `defaults.field.root`; this is only for the form-level list.
 */
export function tanstackFieldMetaToErrors(
  fieldMeta: Record<string, { errors?: ReadonlyArray<{ message: string }> }>
): ValidationError[] {
  const out: ValidationError[] = []
  for (const [name, meta] of Object.entries(fieldMeta)) {
    for (const e of meta.errors ?? []) {
      out.push({ path: name, message: e.message })
    }
  }
  return out
}

function useTanStackBoundField(): RecipeFieldApi {
  const field = useContext(TanStackFieldBindingContext)
  if (!field) {
    throw new Error(
      'TanStack controls: field.control rendered outside TanStackRecipeFieldRoot'
    )
  }
  return field
}

function TanStackRecipeInput(
  control: Extract<FieldControl, { kind: 'input' }>
): ReactNode {
  const field = useTanStackBoundField()
  const errorA11y = errorA11yProps(useContext(FieldA11yContext))
  return (
    <input
      {...control.attrs}
      {...errorA11y}
      value={String(field.state.value ?? '')}
      onChange={(e) => field.handleChange(blankToUndefined(e.target.value))}
      onBlur={field.handleBlur}
    />
  )
}

function TanStackRecipeSelect(
  control: Extract<FieldControl, { kind: 'select' }>
): ReactNode {
  const field = useTanStackBoundField()
  const errorA11y = errorA11yProps(useContext(FieldA11yContext))
  const { attrs, options } = control
  return (
    <select
      {...attrs}
      {...errorA11y}
      value={String(field.state.value ?? '')}
      onChange={(e) => field.handleChange(blankToUndefined(e.target.value))}
      onBlur={field.handleBlur}
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

function TanStackRecipeChoicegroup(
  control: Extract<FieldControl, { kind: 'choicegroup' }>
): ReactNode {
  const field = useTanStackBoundField()
  const errorA11y = errorA11yProps(useContext(FieldA11yContext))
  return (
    <div
      className="jsf-choicegroup"
      role={control.role}
      aria-labelledby={control.labelledBy}
      onBlur={field.handleBlur}
      {...errorA11y}
    >
      {control.options.map((o) => (
        <label key={o.attrs.id} className="jsf-choice">
          <input
            {...o.attrs}
            checked={field.state.value === o.attrs.value}
            onChange={() =>
              field.handleChange(unselectedToUndefined(o.attrs.value))
            }
          />
          <span className="jsf-choice-text">{o.label}</span>
        </label>
      ))}
    </div>
  )
}

function TanStackRecipeFieldRoot({
  node,
  overrides,
}: Parameters<NonNullable<typeof nativeDefaults.field.root>>[0]): ReactNode {
  const form = useTanStackForm()
  const path = node.path
  const Root = nativeDefaults.field.root
  return (
    <form.Field name={path}>
      {(field) => (
        <TanStackFieldBindingContext.Provider value={field}>
          <InjectFieldErrors
            errors={toValidationErrors(path, field.state.meta.errors)}
          >
            <Root node={node} overrides={overrides} />
          </InjectFieldErrors>
        </TanStackFieldBindingContext.Provider>
      )}
    </form.Field>
  )
}

/** Kind-wide TanStack recipe defaults — pass to `useFormTree({ defaults })`. */
export const tanstackFieldDefaults: ReactPartialDefaults = {
  field: {
    root: TanStackRecipeFieldRoot,
    control: {
      input: TanStackRecipeInput,
      select: TanStackRecipeSelect,
      choicegroup: TanStackRecipeChoicegroup,
    },
  },
}
