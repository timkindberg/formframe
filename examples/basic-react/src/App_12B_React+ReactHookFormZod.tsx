// RECIPE (front-end half): React Hook Form as the form-state layer (ADR 024),
// over the ZOD front-end — the twin of App_12, mirroring the App_16/App_17
// pairing convention: same wiring pattern, front-end + schema DSL swapped,
// plus deliberate divergences worth calling out (not incidental — they
// answer questions raised reviewing App_12).
//
// TWO-FILE RECIPE — copy BOTH this file and `rhfFieldControls.recipe.tsx`
// (shared with App_12; see that file for why the split). Divergences:
//
//  1. NO `withCrossFieldRule` wrapper. App_12's AJV/JSON-Schema path needs a
//     hand-composed `Validator -> Validator` wrapper because plain JSON Schema
//     has no cross-field-equality keyword (AJV's `$data` reference gets close,
//     but isn't enabled by default here and yields a generic message). Zod has
//     this natively: `.refine(fn, { message, path })` on the object schema.
//     Verified this composes cleanly with the front-end's introspection: Zod
//     v4's `.refine()` does NOT wrap the schema in a different class (unlike
//     Zod v3's `ZodEffects`) — `def.type` stays `'object'` and `def.shape` is
//     untouched, `.refine()` only appends to `def.checks` — so `zodToTree`
//     (which reads `def.shape` directly) and `FormShapeOf` see a refined
//     object exactly like an unrefined one. No special-casing needed anywhere.
//  2. NO `toStandardSchema`/`createZodValidator` round-trip. A Zod schema
//     already implements `~standard` natively (confirmed: `schema['~standard']
//     .vendor === 'zod'`), so `standardSchemaResolver(schema)` wires directly
//     — our `Validator` seam (ADR 019) isn't bypassed on principle, it's just
//     not the shortest path when the front-end's own schema library already
//     speaks Standard Schema. (Contrast App_15's native `useFormTree` path,
//     which goes the OTHER direction — `fromStandardSchema(schema)` — because
//     `useFormTree` wants our `Validator` shape, not RHF's resolver shape.)
//
//  3. A THIRD divergence surfaced while verifying this in-browser, worth
//     knowing rather than fixing: AJV's `allErrors: true` (App_12) collects
//     the cross-field issue independently of any other failing field. Zod's
//     `.refine()` does NOT run until the base object shape is otherwise
//     valid — confirmed via a direct `safeParse` repro: with `contactMethod`
//     still unselected and `address.street` still empty, mismatched
//     passwords produce ONLY those two structural issues, no "Passwords must
//     match." at all; fill every other required field first and the refine
//     issue appears. A partially-filled form with a Zod cross-field rule can
//     look like the rule isn't wired up when it's actually just gated behind
//     the rest of the object being valid first.
//  4. DIFFERENT `mode` — deliberately, not an oversight. App_12 sets
//     `mode: 'onTouched'`; this file leaves RHF on its default so the pair
//     demonstrates two display policies instead of the same one twice. See
//     the `useForm` call below for exactly how the default behaves.
//
// Everything else is identical in spirit to App_12 — errors injected as a
// prop via RHF's own `get` rather than our internal store, one
// `r.control(kind, …)` handler per archetype, the `FieldShell` dedup, nested
// error paths, the empty-optional-select normalization — all of it living in
// `rhfFieldControls.recipe.tsx`, shared verbatim with App_12 (see that file).
import { useState } from 'react'
import { useForm, FormProvider } from 'react-hook-form'
import type { FieldValues } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { z } from 'zod'
import { zodToTree, type FormShapeOf } from '@formframe/input-zod'
import {
  SchemaFields,
  useRenderNodeRules,
  type TypedRuleRegistrar,
} from '@formframe/renderer-react'
import {
  InputControl,
  SelectControl,
  ChoiceGroupControl,
} from './rhfFieldControls.recipe'

const schema = z
  .object({
    firstName: z
      .string()
      .min(2)
      .meta({ title: 'First name', description: 'At least 2 characters.' }),
    email: z.string().email().meta({ title: 'Email' }),
    // `z.coerce` here is a genuine DX asymmetry with App_12, worth naming
    // rather than hiding: AJV's `createAjvValidator` turns `coerceTypes: true`
    // on by DEFAULT (an adapter-level switch, applied uniformly), so the
    // JSON-Schema recipe gets numeric coercion for free. Zod has no
    // equivalent "coerce everything" validator-instantiation flag — coercion
    // is baked per-field into the schema TYPE at author time — so a Zod
    // consumer must remember `.coerce` on every field bound to a native
    // uncontrolled input, or get an opaque "expected number, received
    // string" failure. Core can't paper over this (it doesn't touch
    // validation, ADR 019/033), and `@formframe/validation-zod` has no
    // equivalent lever either (Zod's coercion isn't a parse-time option the
    // way AJV's is) — this is a real candidate for its own issue rather than
    // a fix folded into this recipe.
    age: z.coerce
      .number()
      .min(18)
      .meta({
        title: 'Age',
        description: 'Must be 18 or older (string coerced by the validator).',
      })
      .optional(),
    // 6 options clears the shipped OPTION_COUNT_THRESHOLD (5), so this
    // defaults to a 'select' widget — 'contactMethod' below stays under it
    // and defaults to 'choicegroup' (radio). Same present() heuristic as
    // App_12 — Core's, not per-front-end. The option set is static, read at
    // present() (compile) time — no async/remote option-set capability in
    // Core yet (ADR 029 §5, bd cm7); Zod has no native "async enum" either
    // (`z.enum` takes a literal array at authoring time). A fetched option
    // list means building the array first, then constructing `z.enum(...)`
    // from it — the schema (and this tree) only exists once that resolves.
    plan: z
      .enum(['free', 'starter', 'pro', 'team', 'business', 'enterprise'])
      .meta({ title: 'Plan' })
      .optional(),
    contactMethod: z
      .enum(['email', 'phone'])
      .meta({ title: 'Preferred contact method' }),
    password: z.string().min(8).meta({ title: 'Password' }),
    confirmPassword: z.string().meta({ title: 'Confirm password' }),
    address: z
      .object({
        street: z.string().meta({ title: 'Street' }),
        city: z.string().meta({ title: 'City' }).optional(),
      })
      .meta({ title: 'Address' }),
  })
  // The cross-field rule, natively — replaces App_12's `withCrossFieldRule`
  // entirely. `path` attaches the issue to a concrete field (#118's
  // fixture-design decision), so it needs no root/pathless wrapper downstream,
  // exactly like the AJV-composed version.
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords must match.',
    path: ['confirmPassword'],
  })

type Shape = FormShapeOf<typeof schema>

// Errors as a PROP (#117), one handler per control archetype (ADR 047 §3),
// and the shared `FieldShell` composition all live in
// `rhfFieldControls.recipe.tsx` — shared verbatim with App_12.

const rhfRules = (r: TypedRuleRegistrar<Shape>): void => {
  r.control('input', InputControl)
  r.control('select', SelectControl)
  r.control('choicegroup', ChoiceGroupControl)
}

// `schema` is a static, module-level literal, so the tree and resolver are
// built ONCE at module evaluation rather than per-mount via `useMemo` —
// matching App_15's precedent (see App_12 for the same move + its trade-off
// note). Zod IS a Standard Schema natively (`schema['~standard'].vendor ===
// 'zod'`), and its `~standard.types.input` is a concrete object type (not
// `unknown`), so it satisfies RHF's `Input extends FieldValues` constraint
// on its own — no cast needed here, unlike App_12's AJV resolver.
const tree = zodToTree(schema)
const resolver = standardSchemaResolver(schema)

export default function App() {
  // RHF's DEFAULT mode (no `mode` option) — deliberately NOT App_12's
  // 'onTouched', so the pair demonstrates two different display policies
  // rather than the same one twice. Default 'onSubmit' + reValidateMode
  // 'onChange': nothing validates before the first submit attempt (type
  // into any field and blur away — no error, no matter how invalid); on
  // submit the whole form validates and every invalid field's error shows;
  // AFTER that first submit, a field that has an error revalidates on every
  // keystroke (clearing as soon as it's fixed), but a field with no error
  // yet stays silent until the next submit. This is ADR 027's `'submit'`
  // display policy, not `'touched'`.
  const methods = useForm({ resolver })
  const renderNode = useRenderNodeRules(tree, rhfRules)
  const [submitted, setSubmitted] = useState<FieldValues | null>(null)

  return (
    <div>
      <h1>React Hook Form over Zod (recipe, ADR 024 / ADR 008)</h1>
      <p>
        The Zod twin of example 12: same <code>renderNodeRules</code> control-
        kind dispatch, same errors-as-a-prop seam (#117) — but the schema is a{' '}
        <code>z.object(…)</code>, RHF is left on its <em>default</em> mode
        (example 12 shows <code>&apos;onTouched&apos;</code>; nothing here
        validates until the first submit), and two things fall away entirely.
        The password-confirmation rule is Zod&apos;s native{' '}
        <code>.refine(fn, {'{ path }'})</code> — no hand-composed cross-field
        wrapper, unlike plain JSON Schema. And the resolver wires the schema
        straight in — Zod already speaks Standard Schema, so there&apos;s no{' '}
        <code>toStandardSchema</code> round-trip through our{' '}
        <code>Validator</code> seam. This is a copy-paste recipe (two files —{' '}
        <code>rhfFieldControls.recipe.tsx</code>, shared verbatim with example
        12), not a published adapter.
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
