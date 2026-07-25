// RECIPE (front-end half): React Hook Form as the form-state layer (ADR 024),
// on the shipped `renderNodeRules`/`useRenderNodeRules` API (ADR 047/048).
// Ticket: #123 (wayfinder epic #116 — "demote validation to a non-goal"; seam
// locked at #117).
//
// TWO-FILE RECIPE — copy BOTH this file and `rhfFieldControls.recipe.tsx`
// (see that file for why the split: everything there is front-end-agnostic,
// everything here is JSON-Schema/AJV-specific). This is NOT a maintained
// package — it's copy-pasteable. It answers the questions the native path
// (ADR 023) leaves open, and RHF's audit (#120) named the exact glue this
// pair of files provides:
//
//  1. Our `Validator` seam (ADR 019) survives unchanged — handed to RHF as a
//     Standard Schema via `toStandardSchema` (ADR 026). `@hookform/resolvers`'s
//     `standardSchemaResolver` calls `schema['~standard'].validate()` and maps
//     Standard Schema's `issues` into RHF's nested error shape (no bespoke
//     resolver shim). AJV/Zod/Valibot all slot in because they already implement
//     `Validator`. RHF does NOT make our validation layer redundant — it
//     *consumes* it.
//  2. RHF owns form *state* (values, touched, submit) — it replaces the ADR-023
//     error store, which is exactly the swappable form-state slot. Our Core tree
//     + `renderNodeRules` (ADR 047) render the structure; `parts.Control`'s
//     `render` prop wires any control (input AND select) through `register()`,
//     no engine change.
//  3. Touched-gated error UX is FREE (glue #4) and we must NOT hand-roll it. RHF
//     field-scopes resolver errors itself, so `mode: 'onTouched'` alone gives
//     "show only after touched" — the RHF equivalent of ADR 027's `'touched'`
//     display policy. `mode: 'onSubmit'` (RHF's default) matches `'submit'`;
//     there is no exact RHF equivalent of `'always'` (nothing validates before
//     the first event), which the audit flagged as a real capability delta, not
//     a recipe bug.
//  4. Errors are injected as a PROP, not read from our internal `ValidationStore`
//     (the locked #117 seam: "the library renders, recipes produce"). Each
//     control handler in `rhfFieldControls.recipe.tsx` reads its own error from
//     RHF's `useFormState({name})` and threads it straight into the markup —
//     no `ValidationProvider`, no `useFieldErrors`. `fieldErrorId` (from
//     `@formframe/renderer-react`) is reused there so the a11y wiring matches
//     the library's own convention even though the error source is entirely
//     RHF's.
//  5. Cross-field rules attach to a CONCRETE path, never root/pathless (the #118
//     fixture-design decision): `confirmPassword`'s "must match password" error
//     is produced with `path: 'confirmPassword'`, so it renders through the
//     exact same per-field mechanism as a structural AJV error — no whole-
//     document wrapper or summary needed for this recipe.
//  6. Nested groups (`address.street`/`address.city`) prove nested error paths:
//     RHF's nested `errors.address.street` shape is walked by RHF's own `get`
//     utility (the same one `@hookform/error-message`'s `ErrorMessage` uses
//     internally, in `rhfFieldControls.recipe.tsx`) — no special-casing, no
//     extra dependency.
//
// Upgrade from the pre-renderNodeRules version of this file: the old `RHFField`
// hand-rolled a `switch (ctl.kind)` for every control kind inline. Registering
// one handler PER ARCHETYPE via `r.control('input', …)` / `r.control('select', …)`
// (ADR 047 §3 — control-kind selectors) replaces that switch with ordinary
// selector dispatch, typed against the schema's resolved `FormShape` (ADR 048).
//
// Bugs this shook out (still true, unchanged by the above)
// -----------------------------------------------------------------------------
//  - `format` (e.g. `email`) was silently ignored: AJV v8 needs `ajv-formats`,
//    which `createAjvValidator` now registers by default.
//  - A mutating validator must NEVER touch the form library's state. AJV's
//    `coerceTypes` mutates in place; handing it RHF's live values corrupted RHF's
//    change tracking, so a fixed field's error never cleared. This drove ADR 025:
//    the `Validator` contract is now pure (the AJV adapter clones internally and
//    returns coerced data as `result.data`), so this recipe needs no clone —
//    `withCrossFieldRule` below composes on top of that same purity invariant.
//
// Out of scope for this recipe (left to #125's shared parity fixtures)
// -----------------------------------------------------------------------------
//  - Async validation (e.g. a username-availability check) and its pending/
//    stale-result rows.
//  - Array fields (`contacts[]`) — RHF's `useFieldArray` is the relevant glue,
//    not exercised here.
//  - A run-failure-vs-invalid wrapper (only needed to prove a thrown/rejected
//    validator is distinct from an invalid verdict).
import { useState } from 'react'
import { useForm, FormProvider } from 'react-hook-form'
import type { FieldValues } from 'react-hook-form'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { toStandardSchema, type Validator } from '@formframe/core'
import { jsonSchemaToTree, type FormShapeOf } from '@formframe/input-jsonschema'
import type { JSONSchema } from '@formframe/input-jsonschema'
import {
  SchemaFields,
  useRenderNodeRules,
  type TypedRuleRegistrar,
} from '@formframe/renderer-react'
import { createAjvValidator } from '@formframe/validation-ajv'
import {
  InputControl,
  SelectControl,
  ChoiceGroupControl,
} from './rhfFieldControls.recipe'

const schema = {
  type: 'object',
  required: [
    'firstName',
    'email',
    'contactMethod',
    'password',
    'confirmPassword',
    'address',
  ],
  properties: {
    firstName: {
      type: 'string',
      title: 'First name',
      description: 'At least 2 characters.',
      minLength: 2,
    },
    email: { type: 'string', format: 'email', title: 'Email' },
    age: {
      type: 'number',
      title: 'Age',
      description: 'Must be 18 or older (string coerced by the validator).',
      minimum: 18,
    },
    // 6 options clears the shipped OPTION_COUNT_THRESHOLD (5), so this defaults
    // to a 'select' widget — 'contactMethod' below stays under it and defaults
    // to 'choicegroup' (radio), exercising both archetypes. The option set is
    // static, read at present() (compile) time — Core has no async/remote
    // option-set capability yet (ADR 029 §5, tracked as bd cm7); a fetched
    // option list is a consumer resolver's job today (`{ widget: 'select' }`,
    // pinned so a later count change can't re-pick the archetype).
    plan: {
      type: 'string',
      title: 'Plan',
      enum: ['free', 'starter', 'pro', 'team', 'business', 'enterprise'],
    },
    contactMethod: {
      type: 'string',
      title: 'Preferred contact method',
      enum: ['email', 'phone'],
    },
    password: { type: 'string', title: 'Password', minLength: 8 },
    confirmPassword: { type: 'string', title: 'Confirm password' },
    address: {
      type: 'object',
      title: 'Address',
      properties: {
        street: { type: 'string', title: 'Street' },
        city: { type: 'string', title: 'City' },
      },
      required: ['street'],
    },
  },
} as const satisfies JSONSchema

type Shape = FormShapeOf<typeof schema>

// --- Cross-field rule, composed on top of AJV without touching Core ----------
// Attaches its error to `confirmPassword` (a concrete field path), per the #118
// fixture-design decision — so it needs no root/pathless wrapper downstream.
// Purity (ADR 025) holds: reads `result.data`/`data`, mutates neither.
//
// FORM-LIBRARY-AGNOSTIC, not schema-agnostic: this only touches our own
// `Validator`/`ValidationResult` types (no RHF import), so it would compose
// unchanged into the native or TanStack recipes — but it hardcodes the
// `password`/`confirmPassword` field names, so it's specific to this schema,
// not a generic "add a cross-field rule" combinator.
function withCrossFieldRule<T>(validator: Validator<T>): Validator<T> {
  return (data) => {
    const result = validator(data)
    const value = (result.data ?? data) as Partial<
      Record<'password' | 'confirmPassword', unknown>
    >
    if (
      typeof value.password === 'string' &&
      typeof value.confirmPassword === 'string' &&
      value.password !== value.confirmPassword
    ) {
      return {
        valid: false,
        errors: [
          ...result.errors,
          {
            path: 'confirmPassword',
            message: 'Passwords must match.',
            keyword: 'confirmPassword',
          },
        ],
        data: result.data,
      }
    }
    return result
  }
}

// Errors as a PROP (#117), one handler per control archetype (ADR 047 §3),
// and the shared `FieldShell` composition all live in the OTHER half of this
// two-file recipe — see `rhfFieldControls.recipe.tsx`. Everything there is
// front-end-agnostic (typed against the neutral `ControlProps<K>`, not this
// file's `Shape`), which is exactly why it's shared verbatim rather than
// duplicated per front-end.

const rhfRules = (r: TypedRuleRegistrar<Shape>): void => {
  r.control('input', InputControl)
  r.control('select', SelectControl)
  r.control('choicegroup', ChoiceGroupControl)
}

// `schema` is a static, module-level literal (not derived from props/state),
// so the tree and resolver are built ONCE at module evaluation rather than
// per-mount via `useMemo` — matching App_15's precedent. (Trade-off: this
// means every example's schema/validator compiles eagerly when the demo
// bundle loads, not lazily on that tab's first render — fine for a dev-only
// examples app with ~20 small schemas, worth reconsidering if that stops
// being true.)
const tree = jsonSchemaToTree(schema)
const validator = withCrossFieldRule(createAjvValidator(schema))
const resolver = standardSchemaResolver(
  // Core emits input: unknown; RHF's resolver expects FieldValues at the
  // boundary. This cast IS load-bearing (unlike App_12B's Zod resolver,
  // which needs none): `toStandardSchema`'s `Input` is `unknown` by design
  // — our neutral `Validator` type accepts `unknown` data — and `unknown`
  // does not satisfy RHF's `Input extends FieldValues` constraint.
  toStandardSchema(validator) as StandardSchemaV1<FieldValues, FieldValues>
)

export default function App() {
  // 'onTouched' == ADR 027's 'touched' display policy (glue #4) — RHF gates
  // display itself; we never hand-gate on `touchedFields`.
  const methods = useForm({ resolver, mode: 'onTouched' })
  const renderNode = useRenderNodeRules(tree, rhfRules)
  const [submitted, setSubmitted] = useState<FieldValues | null>(null)

  return (
    <div>
      <h1>React Hook Form as the form-state layer (recipe, ADR 024)</h1>
      <p>
        RHF owns state + submit; our Core tree + <code>renderNodeRules</code>{' '}
        (ADR 047/048) render the structure via typed control-kind selectors; our{' '}
        <code>Validator</code> (AJV, plus a hand-composed cross-field rule) is
        adapted to a Standard Schema via <code>toStandardSchema</code> (ADR 026)
        and wired into RHF through <code>standardSchemaResolver</code>. Errors
        are injected as a prop straight from RHF&apos;s{' '}
        <code>useFormState</code> — never our internal validation store (the
        #117 seam: the library renders, this recipe produces). Touch a field and
        blur to see touched-gated display; mismatch the passwords to see the
        cross-field rule attach to <code>confirmPassword</code>. This is a
        copy-paste recipe (two files — <code>rhfFieldControls.recipe.tsx</code>{' '}
        holds the front-end-agnostic half), not a published adapter.
      </p>

      <FormProvider {...methods}>
        <form
          noValidate
          onSubmit={methods.handleSubmit((data) => setSubmitted(data))}
        >
          <SchemaFields form={tree} renderNode={renderNode} />
          <button type="submit" style={{ marginTop: 12 }}>
            Submit
          </button>
        </form>
      </FormProvider>

      {submitted && (
        <>
          <p style={{ color: 'green' }}>Submitted valid data:</p>
          <pre>{JSON.stringify(submitted, null, 2)}</pre>
        </>
      )}
    </div>
  )
}
