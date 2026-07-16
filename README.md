# FormFrame

Automatic forms from schemas without losing control.

FormFrame compiles the schema that already describes your data into a common
form tree, then renders sensible default fields from that tree. Keep the
generated form where it works; replace a node, layout, or field part where your
product needs something specific.

Zod and JSON Schema input packages ship today. Other schema languages and
application-specific models can target the same public tree without requiring a
different renderer.

## Quick start

In an existing React and TypeScript app:

```bash
npm install @formframe/core @formframe/input-zod \
  @formframe/renderer-react zod
```

```tsx
import { z } from 'zod'
import { zodToTree } from '@formframe/input-zod'
import { useFormTree } from '@formframe/renderer-react'

const profileSchema = z.object({
  name: z.string().min(1).meta({ title: 'Name' }),
  email: z.string().email().meta({ title: 'Email' }),
  role: z
    .enum(['Developer', 'Designer', 'Product manager'])
    .meta({ title: 'Role' }),
  updates: z.boolean().optional().meta({ title: 'Send me product updates' }),
})

const profileTree = zodToTree(profileSchema)

export function ProfileForm() {
  const { SchemaFields, submit } = useFormTree(profileTree)

  return (
    <form onSubmit={submit((data) => console.log(data))}>
      <SchemaFields />
      <button type="submit">Save profile</button>
    </form>
  )
}
```

`SchemaFields` renders the form content. You keep ownership of the `<form>`,
buttons, loading state, navigation, and success flow. The default path uses
native uncontrolled controls and assembles nested submission data from
`FormData`.

## Add schema validation

Form generation and validation are separate capabilities. `zodToTree` reads the
schema's structure; Standard Schema validates submitted values. Standard Schema
does **not** expose enough structural information to generate fields.

Adapt any synchronous Standard Schema implementation with
`fromStandardSchema`. For the Zod schema above:

```tsx
import { fromStandardSchema } from '@formframe/core'
import { useFormTree } from '@formframe/renderer-react'

const validator = fromStandardSchema(profileSchema)

export function ProfileForm() {
  const { SchemaFields, submit } = useFormTree(profileTree, { validator })

  return (
    <form noValidate onSubmit={submit((data) => console.log(data))}>
      <SchemaFields />
      <button type="submit">Save profile</button>
    </form>
  )
}
```

The `SchemaFields` returned from the hook is the batteries-included path: it
provides the form store to its own subtree, so each field shows its errors inline
(touched-gated by default, ADR 027) with no provider to wire. Validation runs on
submit; successful (optionally transformed) output is passed to your callback.
Wire the returned `revalidate` to `onInput`/`onChange`/`onBlur` for live
validation.

### Reading form state alongside the fields

For a shared error summary, a submit spinner, or anything that reads form state
as a _sibling_ of the fields, wrap that region in `FormStoreProvider` and render
the raw `SchemaFields` with the hook's `store`:

```tsx
import {
  useFormTree,
  FormStoreProvider,
  SchemaFields,
  ValidationSummary,
} from '@formframe/renderer-react'

export function ProfileForm() {
  const { form, submit, revalidate, handleBlur, store } = useFormTree(
    profileTree,
    { validator }
  )

  return (
    <form
      noValidate
      onSubmit={submit((data) => console.log(data))}
      onBlur={(event) => {
        handleBlur(event)
        revalidate(event)
      }}
    >
      <FormStoreProvider store={store}>
        <ValidationSummary />
        <SchemaFields form={form} />
      </FormStoreProvider>
      <button type="submit">Save profile</button>
    </form>
  )
}
```

Errors, touched, submitted, and pending state all live in the hook's `store`;
`FormStoreProvider` lets the summary and field errors read it without
prop-drilling, and only the components whose data changed re-render.

### Async validation

The same `validator` slot takes an **async** validator (one whose result is a
`Promise`) — `useFormTree` branches on the result's shape, so nothing else in
the form changes. Async unlocks remote checks (uniqueness, server rules) with
built-in pending signals and stale-result protection (ADRs 041–046):

```tsx
import { createZodAsyncValidator } from '@formframe/validation-zod'
import {
  useIsValidating,
  useIsSubmitting,
  useValidationFailure,
} from '@formframe/renderer-react'

const validator = createZodAsyncValidator(schemaWithAsyncRule)
```

- **Pending** — `useIsValidating()` is true while a verdict is in flight;
  `useIsSubmitting()` stays true across an awaited `submit` handler. Both are
  fan-out-free reads, so a spinner or disabled button re-renders on its own.
- **Stale-result protection** — the newest-started run owns the verdict; slower
  earlier runs can't clobber it, and on-screen errors are retained (never
  blanked) until the pending run resolves.
- **Run failure vs. invalid** — a validator that throws/rejects is a run
  *failure*, not an "invalid" verdict: errors are kept and the raw reason is
  surfaced via `useValidationFailure()` so you can show a retry banner.

`submit`'s success handler may also be `async` (e.g. an awaited save);
`useIsSubmitting()` spans it. See `examples/basic-react` example 16 for a
runnable walkthrough.

**Submit vs. live can disagree — guard your submit.** A submit's `onValid` fires
on that submit's _own_ click-time verdict, even if a newer live revalidation has
since superseded the visible errors (ADR 043 — errors are authority-gated,
`onValid` is not). So a submit started before a slow async check finishes can
still hand you click-time data while the form shows a newer verdict. Disable the
submit while a verdict is pending to avoid persisting stale data:
`disabled={useIsSubmitting() || useIsValidating()}` (example 16 does this).

**`onValid` errors are yours.** A throw or rejected promise from your submit
handler clears `isSubmitting` but is **not** routed to `useValidationFailure()`
(that surface is for validator-run failures, not your save). Handle save errors
inside `onValid` (try/catch or `.catch`) — the library won't surface them.

**Costs and caveats.** `revalidate` runs the _whole_ validator each time (no
dirty-diffing), and any async rule makes the whole schema async, so every pass
flips `useIsValidating()`. Debounce, dedupe, and skip-when-unchanged are
therefore consumer-owned (ADR 021) — example 16 shows a value-cache plus a
blur guard. With Zod specifically, prefer **field-level** `.refine` for
single-field async rules: an object-level `.refine` is skipped whenever any
field has an `invalid_type` issue, and since `submit` omits empty inputs, a
blank field arrives as `undefined` (`invalid_type`) — so an object-level remote
check silently won't run until the unrelated field is filled.

## Customize one generated part

Every default is also a re-entry point. This adds context to the generated email
label while preserving its default control, description, errors, and the rest
of the form:

```tsx
<SchemaFields
  renderNode={(node, { Default }) =>
    node.isField && node.path === 'email' ? (
      <Default
        of={node}
        parts={{
          label: (label) => (
            <span>
              <Default of={label} />
              <small> Account notifications only.</small>
            </span>
          ),
        }}
      />
    ) : (
      <Default of={node} />
    )
  }
/>
```

The fallback `<Default of={node} />` renders a whole node normally. To own a
group's layout while preserving its generated descendants, re-enter through
`Children`:

```tsx
renderNode={(node, { Default, Children }) =>
  node.isGroup && node.path === 'address' ? (
    <section className="address-grid">
      <Children of={node} />
    </section>
  ) : (
    <Default of={node} />
  )
}
```

`Default` and `Children` are also exported from
`@formframe/renderer-react` for authored layouts outside `renderNode`.

## Choose a schema input

Input compilers are peers: each translates one source into the same FormFrame
tree. A source's ability to validate through Standard Schema does not make it a
structural form input.

| Source | Form generation | Validation |
|---|---|---|
| Zod v4 | `zodToTree` from the maintained `@formframe/input-zod` package | `fromStandardSchema`, or `createZodValidator` for richer Zod issue metadata |
| JSON Schema draft-07 | `jsonSchemaToTree` from the maintained `@formframe/input-jsonschema` package | `createAjvValidator` from `@formframe/validation-ajv` |
| ArkType | No maintained input package yet; an ArkType compiler can target Core's public tree builders | `fromStandardSchema` |
| Your own source | Write a small compiler against Core's public builders | Supply any FormFrame `Validator` |

Switching the quick start to JSON Schema changes the compiler, not the React
binding:

```tsx
import { jsonSchemaToTree } from '@formframe/input-jsonschema'

const profileTree = jsonSchemaToTree({
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
    email: { type: 'string', format: 'email', title: 'Email' },
  },
  required: ['name', 'email'],
})
```

See the evidence-backed support catalogs for exact current behavior:

- [Zod support](./packages/input-zod/SUPPORT_CATALOG.md)
- [JSON Schema support](./packages/input-jsonschema/SUPPORT_CATALOG.md)

## How it composes

![FormFrame composition reels with Zod, Standard Schema, default presentation, native FormData, and React selected among interchangeable capability options](./assets/how-it-composes.svg)

The highlighted row is the stack used by the complete React example, not the
only supported composition. Asterisks mark planned or bring-your-own examples,
not maintained packages available today.

Core is the neutral boundary: it imports no schema language, framework,
validator, form-state library, or DOM API. Compilation, validation,
presentation, rendering, and form state remain independently composable. Most
React users can stay on the `zodToTree` or `jsonSchemaToTree` plus `useFormTree`
path and only use the lower interfaces when they need a new adapter.

## Clear ownership boundaries

FormFrame owns the reusable form mechanics:

- a schema-neutral tree that input packages compile into;
- sensible default controls and semantic field structure;
- nested objects, repeatable arrays, choices, and `FormData` assembly;
- recursive node, subtree, and part customization;
- presentation, renderer, and validator contracts that applications can
  replace independently.

Your application keeps the product decisions:

- the `<form>` element, buttons, and submit lifecycle;
- loading, saving, cancellation, success, and navigation;
- layout, copy, styling, and design-system components;
- when validation runs and when errors become visible;
- whether a form needs reactive state at all.

There is deliberately no library-owned page shell or kitchen-sink form
component. Generated fields remain content inside ordinary application code.

## Native by default, reactive when needed

The reference path uses native uncontrolled controls and `FormData`: no
form-state dependency, no value-driven React rerender on every keystroke, and
enough behavior for static and submit-time forms.

Reach for a reactive form-state adapter when a form needs live dependencies,
controlled values, dirty-state orchestration, or interop with an existing form
platform. React Hook Form and similar integrations are reference recipes to
copy and adapt, not a growing matrix of maintained wrapper packages. Validation
adapters remain packages because their contracts are reusable without
application-specific UI and state choices.

The same rule applies to customization data. React makes code-first exceptions
easy through JSX. When the customization itself must be stored in a database,
put that serializable policy in a source-specific or application adapter rather
than expanding Core into another UI schema. **Serialize when you must; code when
you can.**

## When FormFrame fits

FormFrame is a good fit when schemas are real application data:

- forms come from APIs, databases, configuration, or shared domain models;
- most fields should be generated, while a few need product-specific UX;
- several forms should share one presentation and validation approach;
- layout belongs in application code rather than a second schema.

If every field is static and hand-designed, or the primary need is a
controlled-value state manager, a regular form library will usually be simpler.

## Main packages

| Package | Purpose |
|---|---|
| `@formframe/core` | Schema-neutral form tree, presentation, submission, validation contract, and Standard Schema interop |
| `@formframe/input-zod` | Zod v4 input compiler |
| `@formframe/input-jsonschema` | JSON Schema draft-07 input compiler |
| `@formframe/renderer-react` | React hook, default renderer, continuation customization, and error display |
| `@formframe/renderer-vanilla` | DOM and string renderer |
| `@formframe/validation-ajv` | AJV-backed JSON Schema validator |
| `@formframe/validation-zod` | Zod validator with source-specific issue metadata |

FormFrame is under active pre-v1 development; public APIs may still change.

## Design principles

- A schema generates the ordinary form; code handles the exceptions.
- No schema language, renderer, validator, or form-state library is privileged
  by Core.
- Every default provides a way back into the engine.
- Capabilities are injected explicitly; FormFrame does not guess behavior from
  a node's origin.
- Core stays stateless and stubborn. User-written adapters extend it rather than
  forking it.
- New seams are earned by real implementations, not designed speculatively.

## Learn more

- [Example app](./examples/basic-react)
- [Architecture](./ARCHITECTURE.md)
- [Project glossary](./CONTEXT.md)
- [Architecture decisions](./architecture_records)
- [Contributor and agent workflow](./AGENTS.md)

## License

MIT
