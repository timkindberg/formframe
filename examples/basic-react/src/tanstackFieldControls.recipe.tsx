// RECIPE (per form library): TanStack Form control bindings for FormFrame.
//
// Layer 2 of the three-layer recipe stack — the peer of
// `rhfFieldControls.recipe.tsx`:
//
//   fieldPresentation.recipe.tsx        ← shared shell/errors/a11y (copy too)
//   tanstackFieldControls.recipe.tsx    ← you are here. TanStack-specific.
//   App_18 (JSON Schema) / App_18B (Zod)      ← per schema front-end
//
// Everything here is about TanStack Form and nothing else. It's typed against
// FormFrame's neutral `ControlProps<K>` seam (no schema generics), so ONE copy
// serves every schema front-end — App_18 and App_18B import it unchanged.
//
// How this differs from the RHF controls file, and why:
//
//   • CONTROLLED binds. TanStack has no uncontrolled `register()` — every
//     control wires `field.state.value` / `handleChange` / `handleBlur`.
//   • No ambient provider. TanStack ships no FormProvider/useFormContext, so
//     this file supplies a small Context. Wrap your form in
//     `<TanStackFormProvider form={form}>`.
//   • Display timing is `validationLogic`'s, not this file's. These controls
//     render whatever TanStack holds; `revalidateLogic()` (no arguments) is
//     TanStack's recommended default and matches RHF's out-of-box behavior.
import { createContext, useContext, type ReactNode } from 'react'
import type { AnyFieldApi } from '@tanstack/react-form'
import type { ControlProps } from '@formframe/renderer-react'
import {
  FieldShell,
  a11yAttrs,
  blankToUndefined,
  unselectedToUndefined,
  type FieldMessages,
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

/**
 * Mounts the TanStack field for `path` and hands back the field plus its
 * messages, normalized to the shared `FieldMessages` shape.
 *
 * No display gate here: `validationLogic` already decides when errors exist.
 * (If you need timing `revalidateLogic` can't express, this is the one place
 * to add it — `field.state.meta` also carries `isBlurred` and
 * `isDefaultValue`, and "has a submit been attempted" is `form.Subscribe`'s
 * `state.submissionAttempts`, which must be read reactively through
 * `Subscribe` rather than off a bare `form.state`, or it goes stale.)
 */
function Field({
  path,
  children,
}: {
  path: string
  children: (field: RecipeFieldApi, messages: FieldMessages) => ReactNode
}): ReactNode {
  const form = useTanStackForm()
  return (
    <form.Field name={path}>
      {(field) =>
        children(
          field,
          field.state.meta.errors.map((e) => e.message)
        )
      }
    </form.Field>
  )
}

// --- One handler per control archetype ---------------------------------------
// Registered via `r.control('input' | 'select' | 'choicegroup', …)` in the
// front-end file. Every control applies the shared "empty means absent"
// normalization on change.

export function InputControl({
  path,
  parts,
}: ControlProps<'input'>): ReactNode {
  return (
    <Field path={path}>
      {(field, messages) => (
        <FieldShell path={path} parts={parts} messages={messages}>
          <parts.Control
            render={(c) => (
              <input
                {...c.attrs}
                value={String(field.state.value ?? '')}
                onChange={(e) =>
                  field.handleChange(blankToUndefined(e.target.value))
                }
                onBlur={field.handleBlur}
                {...a11yAttrs(path, messages)}
              />
            )}
          />
        </FieldShell>
      )}
    </Field>
  )
}

export function SelectControl({
  path,
  parts,
}: ControlProps<'select'>): ReactNode {
  return (
    <Field path={path}>
      {(field, messages) => (
        <FieldShell path={path} parts={parts} messages={messages}>
          <parts.Control
            render={(c) => (
              <select
                {...c.attrs}
                value={String(field.state.value ?? '')}
                onChange={(e) =>
                  field.handleChange(blankToUndefined(e.target.value))
                }
                onBlur={field.handleBlur}
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
      )}
    </Field>
  )
}

export function ChoiceGroupControl({
  path,
  parts,
}: ControlProps<'choicegroup'>): ReactNode {
  return (
    <Field path={path}>
      {(field, messages) => (
        <FieldShell path={path} parts={parts} messages={messages}>
          <parts.Control
            render={(c) => (
              <div
                role={c.role}
                aria-labelledby={c.labelledBy}
                onBlur={field.handleBlur}
                {...a11yAttrs(path, messages)}
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
            )}
          />
        </FieldShell>
      )}
    </Field>
  )
}

// ─── MAINTAINER NOTES (temporary — not part of the recipe) ───────────────────
// Build-log for the #116 epic; safe to delete when copying this file.
// • Extracted from App_18 so a second TanStack front-end (App_18B, Zod) could
//   share it verbatim — the ADR 008 forcing function proving this layer is
//   genuinely front-end-agnostic, mirroring App_12/App_12B over the RHF file.
// • Claims verified against @tanstack/form-core SOURCE (not docs):
//   controlled-only (FieldApi.js), issues-only Standard Schema validators
//   (standardSchemaValidator.js discards the transformed value on success),
//   revalidateLogic's RHF-mode emulation (its own doc comment),
//   isBlurred/isDefaultValue semantics (fieldMetaDerived).
// • The `Subscribe` reactivity warning in `Field`'s doc is a real bug the
//   parity smoke caught when a display gate still existed here: a bare
//   `form.state` read left a pre-submit-blurred field's error unrevealed at
//   submit. Keep it in mind before re-adding any gate.
// ──────────────────────────────────────────────────────────────────────────────
