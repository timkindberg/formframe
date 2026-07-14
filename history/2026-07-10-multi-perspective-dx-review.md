# A Multi-Perspective DX Review of `jsonschema-form`

> This is a simulated review exercise, not an endorsement or actual review by
> Matt Pocock, Tanner Linsley, or Theo Browne. Each section applies public,
> recognizable technical priorities associated with that person to the current
> repository. The reviews were performed independently by separate models, then
> checked against the code and synthesized.

## Review panel

| Perspective | Model | Why this pairing |
|---|---|---|
| Matt Pocock-inspired TypeScript and teaching lens | Claude Opus 4.8 | Best fit for nuanced type-interface analysis, pedagogy, and tracing inference across several packages |
| Tanner Linsley-inspired headless architecture lens | GPT-5.6 Sol | Best fit for cross-layer systems reasoning, state ownership, adapters, identity, and performance invariants |
| Theo Browne-inspired product and first-run lens | Claude Sonnet 5 | Best fit for direct product criticism, adoption friction, package ceremony, and distinguishing useful interfaces from abstraction theater |

All three read the implementation, active documentation, prospective README,
examples, package manifests, and relevant ADRs.

## First: what Standard Schema does and does not do

The warning you received was correct.

Standard Schema exposes a validation interface:

```ts
schema['~standard'].validate(value)
```

It standardizes validation input, success output, issues, and issue paths. It
does **not** expose object properties, array items, labels, descriptions,
constraints, choices, or enough structural metadata to choose form controls.
There is no portable Standard Schema tree from which this library could generate
a form.

That leaves two deliberately separate seams:

```text
Zod / ArkType / JSON Schema ── introspection/compiler ──> form tree

Zod / ArkType / Valibot ───── Standard Schema ──────────> validation result
JSON Schema ───────────────── AJV adapter ──────────────> validation result
```

When I previously said to “promote Standard Schema,” I meant only:

- document `fromStandardSchema(schema)` as the default validation path for
  compatible libraries;
- avoid shipping a dedicated validation adapter for every Standard Schema
  implementation unless that adapter adds real behavior;
- keep `input-zod`, a future `input-arktype`, and other structural compilers
  completely separate.

I did **not** mean that Standard Schema should replace an input front-end.

I also no longer recommend letting `useFormTree` accept a Standard Schema value
directly. It would save one explicit `fromStandardSchema(schema)` call while
making React recognize another interface. That currently fails the deletion
test. Revisit it only if normalization later acquires real behavior such as
async result ordering and stale-validation cancellation.

---

## Executive synthesis

The three reviews strongly agreed:

1. **The architecture is substantially better than the current onboarding.**
   The neutral tree, presentation stage, continuation renderer, side-loaded
   validation, and native uncontrolled path are real strengths.
2. **Compile, then bind is good ceremony.**
   `zodToTree(schema)` followed by `useFormTree(tree)` teaches the actual seams
   and costs only one visible line.
3. **`useFormTree` earns its weight.**
   It centralizes presentation layering, stable renderer identity, FormData
   assembly, validation orchestration, touched/submitted state, and live
   revalidation. Removing it would reproduce non-trivial correctness and
   performance logic in every application.
4. **The returned validation plumbing is unfinished.**
   The hook creates `errors`, `touched`, and `submitted`, then asks the consumer
   to feed them back into `ValidationProvider`.
5. **The most important validator bug is not factory ceremony.**
   `ValidationResult.data` carries Zod transforms and AJV coercions, but
   `useFormTree.submit` currently calls `onValid` with the original assembled
   FormData object instead.
6. **The success callback loses useful types.**
   It is fixed at `Record<string, unknown>` rather than inheriting the output
   type of `Validator<T>`.
7. **Async validation is the next real seam pressure.**
   Standard Schema permits a promise; `fromStandardSchema` currently throws if
   it receives one.
8. **The recursive IOC model is the product moat.**
   `renderNode`, `<Default>`, `<Children>`, and part overrides solve the hard 20%
   without adding a second customization schema.
9. **Source-specific React hooks, origin sniffing, and a kitchen-sink `<Form>`
   would make the design worse.**
10. **The repository currently presents itself like a framework-author project,
    not a finished application-developer product.**

---

## Simulated Matt Pocock perspective

### Blunt verdict

I trust the internal type architecture more than I trust the current happy-path
types. The project has correctly preserved the source schema on
`GroupNode<S>`, but the most important user callback still ends at
`Record<string, unknown>`.

The system is conceptually teachable:

```text
schema compiler → form tree → React binding
schema validator → neutral validation result
```

The problem is that the type story fades precisely when the user submits the
form.

### What is excellent

#### The schema type survives into presentation

`useFormTree<S>` accepts `GroupNode<S>` and threads `S` into
`PresentationResolver<S>`. A Zod-authored node can expose the original Zod
schema through `facts.origin.schema`; JSON Schema can do the same with its source
type. This is the right generic direction because Core remains ignorant of what
`S` means.

#### The continuation interface is one teachable rule

The best TypeScript interface is often the one whose runtime model can be
explained without types first. Here the rule is:

- accept the default;
- replace one part of the default;
- take over the layout and re-enter for children.

`Default` and `Children` make that rule visible in JSX. The engine does not need
separate override registries for every level.

#### `fromStandardSchema` is appropriately boring

It adapts a common validation protocol into the library's neutral
`Validator<T>`. That is exactly the kind of one-line adapter TypeScript users can
understand and debug. Standard Schema remains validation-only.

### Where the type experience breaks

#### `submit` ignores both transformed output and `T`

`Validator<T>` can return `ValidationResult<T>`, and the maintained adapters
already populate `result.data`:

- Zod returns parsed/transformed output;
- AJV returns coerced output when configured to mutate;
- Standard Schema returns its successful output value.

But `useFormTree` currently does this:

```ts
const result = runValidator(data)
if (result.valid) onValid?.(data)
```

The user receives the raw assembled object, not `result.data ?? data`, and the
callback is declared as `(data: Record<string, unknown>) => void`.

That is the highest-priority DX defect because it makes the sophisticated
validator typing observationally useless at the final boundary.

The desired shape is conceptually:

```ts
useFormTree<S, Output>(
  tree: GroupNode<S>,
  options: { validator: Validator<Output> }
)

submit(onValid: (data: Output) => void)
```

On success, it should call:

```ts
onValid((result.data ?? data) as Output)
```

A successful `Validator<Output>` is the evidence that an untransformed fallback
conforms to `Output`.

#### Customization paths remain stringly typed

The current customization interface often asks for:

```ts
node.path === 'address.street'
```

That is acceptable for runtime schemas, but static TypeScript-authored schemas
will eventually want path autocomplete and typed child handles. The proposed
typed field skin can earn its place later, but it must remain a skin over the
same continuation engine rather than a second renderer.

It should not block v1. Correctly typed submit output matters more.

#### `Default` and `Children` are not exported from the React package root

They are defined in `renderer.tsx`, described as importable in repository
documentation, and form the public customization vocabulary, but
`packages/react/src/index.ts` does not export them. Injecting them into
`renderNode` is sufficient for many examples, but the public surface and docs
should agree.

### Matt-lens recommendation

Keep `useFormTree`; make the generic payoff reach the user's save function.
Teach one customization rule before teaching the IR. Defer typed field handles
until at least JSON Schema and Zod can both support an honest inference story.

---

## Simulated Tanner Linsley perspective

### Blunt verdict

This is already shaped like a serious headless library:

- Core owns a tree and folds, not runtime state;
- source adapters compile into the tree;
- presentation is separate from compilation;
- React binds behavior;
- DOM/FormData owns native values;
- per-path stores isolate subscriptions;
- validation is injected.

The architectural seams are earned. The top React binding simply stops one step
before the composition feels complete.

### What is excellent

#### State ownership is mostly correct

| State | Current owner | Verdict |
|---|---|---|
| Input values | Native DOM / FormData | Correct |
| Presented tree | `useFormTree` memoization | Correct |
| Validation result | `useFormTree` | Correct for native adapter |
| Touched/submitted session state | `useFormTree` | Correct |
| Per-field subscriptions | issue/touched stores | Correct |
| Dynamic array identity | React array renderer | Correct |
| Source structure | input compiler | Correct |

The native path does not pretend to be a general form-state manager. A
React Hook Form or TanStack Form recipe can replace that behavior when an
application actually needs controlled values, derived state, or an existing
form ecosystem.

#### Performance is an actual invariant

The project does not merely claim to be headless and fast. It has designed
around:

- stable module-level React component types;
- called continuation handles rather than mounted closure components;
- referentially stable trees;
- `React.memo` at node boundaries;
- `useSyncExternalStore` subscriptions per path;
- dense array re-pathing without remounting surviving controls.

These choices justify having a React binding module. A consumer wrapper cannot
reproduce them with one trivial function.

#### Front-ends should return trees, not capability bundles

An input compiler should compile structure. It should not silently choose
validation, React behavior, form-state, or presentation policy.

Returning `{ tree, validator }` from every front-end looks convenient but makes
the source package the composition root. It also fails for legitimate
combinations:

- Zod structure with server validation;
- JSON Schema structure with custom business validation;
- an ArkType compiler with validation disabled;
- two validators over one form;
- a validator configured differently from the source compiler.

Keep those capabilities independently injectable.

### Where the composition leaks

#### The provider loopback is real

`useFormTree` is the source of validation and touched state. `ValidationProvider`
turns that state into granular stores for renderers. The split is internally
reasonable, but the consumer should not have to manually translate between two
modules in the same package:

```tsx
<ValidationProvider
  issues={errors}
  touched={touched}
  submitted={submitted}
>
```

The least magical improvement is not necessarily to auto-wrap
`SchemaFields`. A validation summary or custom error UI may need the same
boundary outside the fields component.

A smaller interface improvement is:

```ts
const {
  SchemaFields,
  submit,
  revalidate,
  handleBlur,
  validation,
} = useFormTree(tree, { validator })
```

```tsx
<ValidationProvider {...validation}>
  <ValidationSummary />
  <SchemaFields />
</ValidationProvider>
```

Where:

```ts
validation = { issues, touched, submitted }
```

This preserves the explicit boundary and custom composition while making the
correct wiring one spread operation. Whether that reduction is worth an
interface change should be judged against real examples, but it is safer than
hiding the provider inside fields.

#### Async validation needs concurrency semantics, not merely a promise type

Changing `Validator` to return `Promise | Result` is easy. Correct live
validation is not:

- request N starts;
- request N+1 starts after newer input;
- request N resolves last;
- stale issues must not replace newer issues.

The async seam must define result ordering, cancellation or request IDs, pending
state, and submit behavior. That is a real deepening opportunity. It also may be
the point where a shared validator normalizer starts earning more weight.

### Tanner-lens recommendation

Keep all lower rungs public:

```text
tree builders / present / createContinuation / createRenderer / Validator
```

Keep `useFormTree` as the default native React composition over them. Finish the
validation composition without owning the `<form>` element or event policy.
Surface a short set of stability rules in public docs instead of leaving them
only in ADRs and file headers.

---

## Simulated Theo perspective

### Blunt verdict

The product is better than the repository's first impression.

The code solves a real problem: RJSF makes the easy 80% easy and the hard 20%
turn into schema configuration. This library keeps generation automatic and
makes the hard part JSX. That is a compelling pitch.

But a stranger currently lands on architecture prose, not a working form. The
repository feels like it is for someone building a form library rather than
someone trying to ship a settings page.

### What would make me stay

#### The one-line product description

> Generate forms from schemas. Customize them in JSX.

That is better than leading with IRs, folds, capability slots, or an RJSF
architecture critique.

#### Compile-then-bind is not the problem

This is acceptable:

```ts
const tree = zodToTree(schema)
const form = useFormTree(tree)
```

It is two obvious operations with different jobs. A `useZodForm(schema)` wrapper
would hide the distinction to save one line.

#### The customization demo is the sale

A single example that keeps a field's default control and validation but swaps
the label, followed by one example that takes over an address layout while
rendering its default children, communicates the product faster than the whole
architecture section.

### Where I would bounce

#### No real README quick start

The active README explains the architecture but contains no installation or
first form. The prospective draft is much closer to the correct product order.

#### The example app starts in the machinery

The example application currently defaults to the widget catalog, and early
examples emphasize Core walking. A Zod or JSON Schema `useFormTree` example
should be the landing page.

#### Validation looks unfinished

The user passes a validator into the hook, receives several pieces of validation
state, imports a provider, and threads the pieces back into it. That is the first
place the architecture starts looking like framework tax.

#### The package name and package metadata contradict the positioning

The public thesis is schema-agnostic, but the repository and package scope say
`jsonschema-form`; root metadata still describes a JSON Schema form library; the
Zod validation package says it validates “JSON Schema forms.”

That is not a code problem, but it affects who finds and trusts the project.

#### The packages are not externally consumable yet

Packages remain `0.0.0`, build scripts are placeholders, and exports point at
source files. That is fine during development, but it means the v1 product
experience cannot yet be tested by a real npm consumer.

### Theo-lens recommendation

Ship the README order:

1. working Zod quick start;
2. add Standard Schema validation;
3. customize one label in JSX;
4. show JSON Schema as a peer input;
5. only then explain the tree and adapter model.

Be explicit about who should not use the library: someone wanting a styled,
controlled form kit should probably use React Hook Form plus their design
system.

---

## What “avoid the sugar” means in concrete terms

### Avoid `useZodForm` and sibling hooks

The likely implementation is approximately:

```ts
function useZodForm(schema, options) {
  const tree = useMemo(() => zodToTree(schema), [schema])
  return useFormTree(tree, {
    ...options,
    validator: options.validator ?? fromStandardSchema(schema),
  })
}
```

That creates several problems to save two visible lines:

- React now has a conceptual entry point per source language;
- every new input creates another hook and documentation branch;
- validation is silently selected even though it is an independent capability;
- callers who want a different validator must understand how to disable magic;
- compile timing becomes hidden;
- the architecture's cleanest seam becomes less visible.

A consumer with one application-wide preference can write this wrapper locally.
The library does not gain enough reusable behavior to justify owning it.

### Avoid automatic origin sniffing

Every node preserves source metadata through `origin.schema`, so the hook could
theoretically inspect it and guess a validator. It should not.

Origin answers “where did this node come from?” It does not answer:

- whether validation is enabled;
- which validator should be authoritative;
- what AJV options, formats, or custom keywords to use;
- whether validation is local, remote, or server-backed;
- whether coercion or transforms are desired;
- whether several source schemas contributed to one tree;
- when validation should run.

Using origin for automatic behavior would turn useful provenance into a hidden
dependency injection container.

### Avoid a kitchen-sink `<Form>`

A component like:

```tsx
<SchemaForm
  schema={schema}
  validator={validator}
  onSubmit={save}
  submitLabel="Save"
/>
```

would need to own or parameterize:

- the `<form>` element;
- submit, reset, and cancellation controls;
- loading and success state;
- validation timing;
- display timing;
- layout around fields;
- application-specific navigation;
- design-system chrome.

If it owns those choices, it fights composition. If it exposes props for all of
them, it recreates a configuration language. If it merely wraps the existing
five lines, it is shallow.

The consumer-owned `<form>` is a good architectural constraint.

### Sugar that may earn its weight

Sugar earns its place when removing it causes complex, correctness-sensitive
logic to reappear across consumers.

That standard supports:

- `useFormTree`, because it centralizes stable React identity, presentation,
  native submission, and validation orchestration;
- `SchemaFields`, because it binds the continuation renderer to defaults;
- `fromStandardSchema`, because it performs a real issue/output/path protocol
  translation;
- `createAjvValidator`, because it compiles/configures AJV, protects validator
  purity, handles formats, maps paths, and surfaces coercion;
- possibly a coherent validation-state object, because it prevents incomplete
  touched/submitted wiring.

It does not support wrappers whose implementation is one existing function call
plus renamed arguments.

---

## Agreement and disagreement

| Question | Matt lens | Tanner lens | Theo lens | Synthesis |
|---|---|---|---|---|
| Keep `useFormTree`? | Yes, deepen types | Yes, deep React binding | Yes, bag needs polish | Keep |
| Keep compile-then-bind visible? | Yes | Yes | Yes | Keep |
| Use Standard Schema to compile forms? | No | No | No | Impossible by contract |
| Default Zod-like validation path | `fromStandardSchema` | `fromStandardSchema` | `fromStandardSchema` | Document it |
| Dedicated validation packages | Only richer semantics | Only real behavior | Avoid package ceremony | Keep AJV; position Zod as enriched/optional |
| Auto-detect validator from origin? | No | No | No | Reject |
| Add `useZodForm`? | No | No | No | Reject |
| Add library `<Form>`? | No | No | No | Reject |
| ValidationProvider loopback | Hide/deepen | Internal composition leak | Biggest happy-path papercut | Fix deliberately |
| Typed field handles | Valuable later | Skin over current engine | Do not lead with it | Post-v1 unless inference earns it |
| Biggest correctness issue | Typed transformed submit | Discarded transformed output | Validation feels unfinished | Fix `result.data` first |
| Biggest adoption issue | Types/doc hierarchy | Top-rung integration | README/publishability/name | README and real package consumption |

---

## Recommended v1 call site

This keeps every meaningful IOC point visible while reducing accidental
validation plumbing:

```tsx
import { z } from 'zod'
import { fromStandardSchema } from '@jsonschema-form/core'
import { zodToTree } from '@jsonschema-form/input-zod'
import {
  useFormTree,
  ValidationProvider,
  ValidationSummary,
} from '@jsonschema-form/react'

const schema = z.object({
  name: z.string().min(1).meta({ title: 'Name' }),
  email: z.email().meta({ title: 'Email' }),
})

const tree = zodToTree(schema)
const validator = fromStandardSchema(schema)

export function ProfileForm() {
  const {
    SchemaFields,
    submit,
    revalidate,
    handleBlur,
    validation,
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
      <ValidationProvider {...validation}>
        <ValidationSummary />
        <SchemaFields
          renderNode={(node, { Default }) =>
            node.isField && node.path === 'email' ? (
              <Default
                of={node}
                parts={{
                  label: (label) => (
                    <span>
                      <Default of={label} />
                      <Help text="Account notifications only." />
                    </span>
                  ),
                }}
              />
            ) : (
              <Default of={node} />
            )
          }
        />
      </ValidationProvider>

      <button type="submit">Save profile</button>
    </form>
  )
}
```

Only `validation` is prospective in this example:

```ts
validation = {
  issues: errors,
  touched,
  submitted,
}
```

It is intentionally modest. Validation timing remains explicit in the form's
event handlers. Display policy remains an explicit `ValidationProvider` choice.
The library does not own form chrome.

For JSON Schema, the shape stays identical:

```ts
const tree = jsonSchemaToTree(schema)
const validator = createAjvValidator(schema)
```

---

## Priority order

### P0: complete existing contracts

1. **Pass validated output to `onValid`.**
   `submit` should use `result.data ?? assembledData`.
2. **Thread validator output types into `submit`.**
   A `Validator<Output>` should produce an `onValid(data: Output)` callback.
3. **Correct the primary example.**
   It currently uses `form.submit` instead of the hook's `submit`, bypassing
   `submitted` tracking and validator orchestration.

### P1: finish the native React composition

4. **Resolve the ValidationProvider loopback.**
   Start with the smallest explicit shape, such as a `validation` object that can
   be spread into the provider. Do not auto-wrap until summaries, custom error
   UI, and component identity are proven.
5. **Export and document the public continuation handles consistently.**
   If `Default` and `Children` are intended to be importable, export them.
6. **Design async validation end-to-end.**
   Include stale-result handling for live validation, not just a promise union.

### P2: make the product externally legible

7. **Ship the product-first README.**
   Quick start, validation, one override, then architecture.
8. **Add a first-class Zod example and make a hook example the default.**
9. **Explain validation choices once.**
   Standard Schema for the common Zod/ArkType/Valibot path; dedicated adapters
   only for added semantics.
10. **Publish matching support catalogs for every maintained input.**
11. **Make packages consumable outside the monorepo.**
    Real builds, versions, and exports.
12. **Resolve branding before v1.**
    Either rename toward the schema-agnostic product or make the distinction
    impossible to miss in package metadata and search terms.

---

## Final opinion

The central architecture should not be simplified away. Its explicit pieces are
the reason the library can support multiple source schemas, validators,
presentations, renderers, and state strategies without turning Core into a
registry.

The right goal is not fewer visible concepts at any cost. It is:

> Keep meaningful choices explicit; remove accidental plumbing.

Meaningful choices:

- which input compiler;
- which validator;
- when validation runs;
- when errors display;
- where the `<form>` and application chrome live;
- where custom rendering re-enters the defaults.

Accidental plumbing:

- discarding transformed validator output;
- losing submit types;
- returning three validation values only to feed them into a sibling provider;
- mismatched exports and docs;
- examples that bypass the hook's orchestration.

`useFormTree` passes the deletion test. `useZodForm`, validator sniffing, and a
kitchen-sink `<Form>` do not. The next iteration should deepen the existing
native React binding and complete the validator contract rather than adding
another layer above it.
