<!--
Prospective v1 README draft. This is a product-narrative exercise, not the
repository's current README and not a claim about current release status.
Read through "License" as if you had just found the project. Drafting notes
after the end marker are not part of the proposed README.
-->

# jsonschema-form

Generate forms from schemas. Customize them in JSX.

`jsonschema-form` is a schema-agnostic form engine. A small input adapter
translates the source that already owns your data into a common form tree; the
rest of the library handles presentation, rendering, submission, and optional
validation without knowing which schema language produced it.

Give it a schema and it produces a complete, accessible form with sensible
controls, nested objects, repeatable arrays, submission, and optional validation.
When the generated form is not quite right, keep the defaults you want and
replace the exact node or part you do not.

The schema stays about data. Layout and UI stay in code.

JSON Schema, Zod, ArkType, and other schema systems are inputs to the same
engine, not separate form implementations.

## Quick start

```bash
npm install @jsonschema-form/core \
  @jsonschema-form/input-zod \
  @jsonschema-form/react \
  zod
```

```tsx
import { z } from 'zod'
import { zodToTree } from '@jsonschema-form/input-zod'
import { useFormTree } from '@jsonschema-form/react'

const schema = z.object({
  name: z.string().min(1).meta({ title: 'Name' }),
  email: z.email().meta({ title: 'Email' }),
  role: z
    .enum(['Developer', 'Designer', 'Product manager'])
    .meta({ title: 'Role' }),
  updates: z.boolean().optional().meta({ title: 'Send me product updates' }),
})

const tree = zodToTree(schema)

export function ProfileForm() {
  const { SchemaFields, submit } = useFormTree(tree)

  return (
    <form onSubmit={submit(console.log)}>
      <SchemaFields />
      <button type="submit">Save profile</button>
    </form>
  )
}
```

That renders the form's fields. The surrounding `<form>`, buttons, loading
state, and success flow are yours.

This is deliberate: generated fields compose inside ordinary application code
instead of bringing their own page structure with them.

Zod is only the input chosen for this example. React receives a form tree, so
the same component works with a tree compiled from JSON Schema, ArkType, or a
source model specific to your application.

## Generated does not mean locked in

The defaults are re-entry points, not dead ends.

Every node can render normally, render normally with one part replaced, or hand
its layout back to you. The same mechanism works from the whole tree down to a
single label or control.

For example, add context to one generated label while leaving its control,
description, validation, and descendants alone:

```tsx
<SchemaFields
  renderNode={(node, { Default }) => {
    if (node.isField && node.path === 'email') {
      return (
        <Default
          of={node}
          parts={{
            label: (label) => (
              <span>
                <Default of={label} />
                <Help text="We only use this for account notifications." />
              </span>
            ),
          }}
        />
      )
    }

    return <Default of={node} />
  }}
/>
```

Or take over a whole subtree's layout and let the engine continue rendering its
children:

```tsx
<SchemaFields
  renderNode={(node, { Default, Children }) => {
    if (node.isGroup && node.path === 'address') {
      return (
        <Card>
          <CardHeading>Shipping address</CardHeading>
          <TwoColumnGrid>
            <Children of={node} />
          </TwoColumnGrid>
        </Card>
      )
    }

    return <Default of={node} />
  }}
/>
```

There is no parallel `uiSchema` to keep in sync. A customization is ordinary
typed code built from ordinary components and conditions.

## Bring the schema that already owns your data

The library does not ask you to translate your model into its preferred schema
language. Input adapters compile different schema systems into the same form
tree. Rendering, presentation, submission, and validation operate on that common
structure rather than being rebuilt for every source.

First-party front-ends cover JSON Schema, Zod, and ArkType. The input seam is
also public, so Valibot, TypeBox, an API description, or a domain-specific model
can participate without changing Core or React.

### JSON Schema

```tsx
const tree = jsonSchemaToTree(jsonSchema)
const { SchemaFields, submit } = useFormTree(tree)
```

### Zod

```tsx
import { z } from 'zod'
import { zodToTree } from '@jsonschema-form/input-zod'
import { useFormTree } from '@jsonschema-form/react'

const schema = z.object({
  name: z.string().min(1).meta({ title: 'Name' }),
  email: z.email().meta({ title: 'Email' }),
  role: z.enum(['Developer', 'Designer', 'Product manager']),
})

const tree = zodToTree(schema)

export function ProfileForm() {
  const { SchemaFields, submit } = useFormTree(tree)

  return (
    <form onSubmit={submit(console.log)}>
      <SchemaFields />
      <button type="submit">Save profile</button>
    </form>
  )
}
```

### ArkType and other schema systems

Every front-end has the same job: preserve the source schema on each node,
transcribe the structural facts a form can use, and leave source-only semantics
to that source's validator. Once it returns a form tree, all consumers are
available unchanged.

The input packages are translators, not alternate form implementations:

```text
JSON Schema ─┐
Zod ─────────┤
ArkType ─────┼─→ form tree ─→ presentation ─→ React / DOM / another renderer
your source ─┘
```

Not every validation construct needs a visual representation. Each input package
documents exactly which source constructs affect the generated form, which are
validation-only, and which are not yet compiled:

- [JSON Schema support](../packages/input-jsonschema/SUPPORT_CATALOG.md)
- [Zod support](../packages/input-zod/SUPPORT_CATALOG.md)
- [ArkType support](../packages/input-arktype/SUPPORT_CATALOG.md)

## Validation stays with the schema that understands it

Generating a form and validating submitted data are separate jobs.

Use the generated form on its own, or explicitly inject the validator that owns
the schema. `useFormTree` does not inspect a node's origin and guess what should
validate it.

Zod, ArkType, Valibot, and other Standard Schema implementations can be passed
through the same neutral validator seam:

```tsx
import { fromStandardSchema } from '@jsonschema-form/core'

const validator = fromStandardSchema(schema)
```

JSON Schema can use the maintained AJV adapter:

```tsx
import { createAjvValidator } from '@jsonschema-form/validation-ajv'
import {
  useFormTree,
  ValidationProvider,
  ValidationSummary,
} from '@jsonschema-form/react'

const validator = createAjvValidator(schema)
```

The renderer and error UI consume neutral issues, regardless of where those
issues came from:

```tsx
export function ProfileForm() {
  const {
    SchemaFields,
    submit,
    revalidate,
    handleBlur,
    errors,
    touched,
    submitted,
  } = useFormTree(tree, { validator })

  return (
    <form
      noValidate
      onSubmit={submit(saveProfile)}
      onBlur={(event) => {
        handleBlur(event)
        revalidate(event)
      }}
    >
      <ValidationProvider
        issues={errors}
        touched={touched}
        submitted={submitted}
      >
        <SchemaFields />
        <ValidationSummary />
      </ValidationProvider>

      <button type="submit">Save profile</button>
    </form>
  )
}
```

Validation is submit-time unless you wire `revalidate` to `onInput`, `onChange`,
or `onBlur`. Error visibility is a separate choice: show issues immediately,
after a field is touched, or after submit. These decisions stay visible in your
form rather than being compressed into a mode string.

## Bring your own design system

The default renderer emits semantic, near-styleless HTML with stable class
hooks. Use it directly, style those hooks, replace a control locally, or bind the
tree to your design system.

```tsx
import { createRenderer, defaultAdapter } from '@jsonschema-form/react'

const ProductFields = createRenderer({
  ...defaultAdapter,
  field: {
    ...defaultAdapter.field,
    label: ProductFieldLabel,
    control: ProductFieldControl,
  },
  group: {
    ...defaultAdapter.group,
    root: ProductFieldset,
  },
})
```

`createRenderer` is the public floor. A partial renderer remains runnable and
shows diagnostic markers for missing entries, so an adapter can be built one
piece at a time.

UI-library and form-state integrations are reference recipes rather than a
matrix of thin packages. Copy the recipe, own the code, and adapt it to the
conventions your application already has.

## Native by default

The reference stack uses native, uncontrolled form controls and `FormData`.
Typing does not push every value through React state, and submitting assembles
nested objects, booleans, and arrays from the form tree.

Reach for a reactive form-state adapter when the form actually needs live
dependencies, controlled values, or integration with existing form
infrastructure. It is an option, not a prerequisite for rendering a schema.

## The form tree

The form tree is the small, stable interface between schema languages and
everything that consumes a form.

It represents fields, object groups, repeatable arrays, choices, metadata,
constraints, source schema references, and the parts needed to render them.
Input packages compile into it. Presentation assigns default widgets. Renderers
fold over it. Validators remain beside it.

```text
                            ┌─→ React renderer
JSON Schema ─┐              ├─→ DOM / string renderer
Zod ─────────┤              ├─→ custom presentation
ArkType ─────┼─→ Core tree ─┤
your source ─┘              ├─→ submission
                            └─→ any future consumer
```

Core has no React, DOM, schema-language, validator, or form-state dependency. Its
job is to make the generated form navigable and consumable without becoming a
universal schema language itself.

Most users do not need to work at this level. It is there so the convenient API
has a stable foundation and the escape hatches all lead to the same place.

## What the library owns

- A public input seam and maintained front-ends for common schema systems
- Sensible default controls and accessible semantic structure
- Nested objects, repeatable arrays, and scalar choice collections
- Native form-data assembly and source-shaped submission data
- Recursive node and part customization
- A renderer interface for design systems and other frameworks
- A small validator contract with Standard Schema interop and an AJV adapter
- Explicit support catalogs for each schema input

## What you own

- The `<form>` element and its buttons
- Loading, saving, success, cancellation, and navigation
- Product-specific layout and copy
- Styling or your design-system renderer
- The choice between submit-time and reactive behavior
- Any exceptional field whose UX is more specific than its schema

## When it fits

`jsonschema-form` is a good fit when the schema is real application data:

- forms are generated from APIs, databases, configuration, or shared domain
  models;
- most fields should be automatic, but a few need product-specific UX;
- several forms should share one rendering and validation approach;
- you want schema-driven generation without moving layout into a second schema.

It is probably not the right tool when every field and layout is already static
and hand-designed, or when the main requirement is a controlled-value state
manager. In those cases, a regular form library is simpler.

## Packages

| Package | Purpose |
|---------|---------|
| `@jsonschema-form/core` | Schema-agnostic form tree, presentation fold, submission, and renderer engine |
| `@jsonschema-form/input-*` | Front-ends for JSON Schema, Zod, ArkType, and other schema systems |
| `@jsonschema-form/react` | React renderer, hooks, customization, and error display |
| `@jsonschema-form/vanilla` | DOM and string renderers |
| `@jsonschema-form/validation-ajv` | AJV validation adapter |

## Design principles

- A schema generates the ordinary form; code handles the exceptions.
- No schema language is privileged by Core or React.
- Defaults must always provide a way back into the engine.
- Core describes form structure without owning framework or runtime state.
- Capabilities are injected explicitly; the library does not guess from origin.
- Convenience interfaces compose the lower seams rather than replacing them.
- Swappable interfaces are earned by real second implementations.
- The library provides seams and reference recipes, not an integration package
  for every ecosystem combination.

## License

MIT

<!-- End of prospective README. Everything below is drafting discussion. -->

---

## Drafting notes — not part of the README

### What this draft intentionally relies on

The examples above use interfaces that exist on the current branch:

- `useFormTree(tree)`
- `jsonSchemaToTree` / `zodToTree`
- `SchemaFields`
- `renderNode`, `<Default>`, and `<Children>`
- part overrides
- `createRenderer` / `defaultAdapter`
- `createAjvValidator`, `fromStandardSchema`, `ValidationProvider`, and
  `ValidationSummary`
- native `form.submit`

The prospective claims that are not current interfaces are a maintained ArkType
front-end and complete support catalogs for every maintained input.

### Does `useFormTree` earn its weight?

Yes, but not merely because it binds a tree to `SchemaFields`.

Delete it and every native React consumer must correctly repeat presentation
layering, memoization, a stable bound renderer, FormData assembly, validation
gating, issue state, touched state, submit state, and live revalidation. Some of
that wiring exists specifically to keep uncontrolled inputs mounted and isolate
field re-renders. The complexity comes back at every call site, so the hook is a
deep convenience module rather than a pass-through wrapper.

It also leaves the lower interfaces intact: consumers can call `present`, render
`<SchemaFields form={tree}>`, run a validator, or fold the tree themselves. The
hook is the default native-React composition, not the architecture.

The part that still feels shallow is the validation loopback: the hook returns
`errors`, `touched`, and `submitted`, then every consumer feeds those values back
into `ValidationProvider`. That is library plumbing, not a meaningful product
choice. If the hook is deepened, it should hide or group that wiring while
keeping validation timing (`revalidate`) and display policy visible to the
consumer. It should not grow into a kitchen-sink `<Form>` component.

### Where validation should go

1. Keep the neutral injected `Validator` function as the lowest seam.
2. Make `fromStandardSchema(schema)` the documented default for Zod, ArkType,
   Valibot, and similar libraries. They need no dedicated validation package for
   the common case.
3. Keep dedicated adapters only when they add real behavior: AJV compilation,
   formats and coercion, or richer source-specific issue metadata.
4. Evolve the seam to async validation when the behavior is designed
   end-to-end, including stale live-validation results. Standard Schema already
   exposes the pressure; pretending everything is synchronous will become the
   bigger DX problem.
5. Never infer a validator from `origin.schema`. Explicit injection is the IOC
   point and allows compilation, validation, timing, and rendering to vary
   independently.

Letting `useFormTree` accept a Standard Schema object directly looks smoother,
but it currently fails the deletion test: without that sugar, the consumer adds
one explicit `fromStandardSchema(schema)` call. It would also make the React
module responsible for recognizing another interface. I do not think that earns
its weight unless async validation later gives the normalization step real
behavior such as race handling and result ordering.

I would not add `useZodForm`, `useArkTypeForm`, a generic compile-and-bind
factory, or a library-owned `<Form>`. Those wrappers are trivial for a consumer,
privilege source packages in React, and hide the composition without removing
real complexity.

### Possible second sugar: typed field handles

ADR 010 already names a future typed skin over the continuation engine:

```tsx
// Illustrative only — not an existing interface.
<fields.address.street />
```

It would improve autocomplete and authored layouts, but it is not necessary for
the product story above. The existing `<Default of={root.children.street} />`
primitive is complete and works for dynamic schemas. The typed skin should only
be documented as v1 behavior if the schema-inference work actually earns it.
