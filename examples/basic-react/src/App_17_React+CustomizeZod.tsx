import { useMemo, useState, type ReactNode } from 'react'
import { z } from 'zod'
import { zodToTree, type FormShapeOf } from '@formframe/input-zod'
import {
  useFormTree,
  FormStoreProvider,
  useRenderNodeRules,
  type FieldProps,
  type GroupProps,
  type TypedRuleRegistrar,
  type RulesBuild,
  type RuleRegistrar,
} from '@formframe/renderer-react'
import { createZodValidator } from '@formframe/validation-zod'

// ═══════════════════════════════════════════════════════════════════════════
// The render-node rules layer (ADR 047/048) over a ZOD schema — the SECOND
// front-end (ADR 008), mirroring App_16 field-for-field (bd jsonschema-form-bh7).
//
// The whole point: this file is IDENTICAL to App_16 except the front-end import
// (`@formframe/input-zod` vs `@formframe/input-jsonschema`) and the schema DSL.
// There is NO per-front-end recipe — `zodToTree(schema)` brands the tree with its
// resolved `FormShapeOf<S>`, and the SAME `useRenderNodeRules` from React binds
// off that brand (ADR 048). The one real divergence that still surfaces:
//   • `name` has a `.meta({ description })`, but Zod keeps descriptions in a
//     runtime registry invisible to the type. So `parts.Description` is an
//     OPTIONAL slot here (`PartComponent<…> | undefined` → guard before placing)
//     rather than the statically-present slot App_16 gets from the JSON literal.
//     The runtime still has the data, so the guarded render shows it. Enum arity,
//     by contrast, DOES narrow at the type level (plan → radio), same as App_16.
// ═══════════════════════════════════════════════════════════════════════════

const schema = z.object({
  // Zod carries labels/descriptions in `.meta()` (title → label). The
  // `description` is still runtime-registry-only — invisible to the type.
  name: z
    .string()
    .min(3)
    .meta({ title: 'Full name', description: 'As it appears on your ID.' }),
  plan: z.enum(['free', 'pro', 'enterprise']).meta({ title: 'Plan' }),
  address: z
    .object({
      street: z.string().meta({ title: 'Street' }),
      city: z.string().meta({ title: 'City' }).optional(),
    })
    .meta({ title: 'Address' }),
})

// The resolved FormShape (ADR 048). A Zod VALUE already carries its precise type,
// so there's no `as const` step (unlike the JSON Schema literal in App_16).
type Shape = FormShapeOf<typeof schema>

// ── Handlers (hoisted → stable identity → safe hooks + memo bail, §1) ─────────

function RowName({ parts }: FieldProps<Shape, 'name'>) {
  const [hint, setHint] = useState(false)
  // Zod DIVERGENCE: `name` has a `.meta({ description })` at runtime, but Zod
  // stores it in `z.globalRegistry` — invisible to the static type. So unlike
  // App_16 (present slot from the literal), `parts.Description` is OPTIONAL:
  // `PartComponent<TextData> | undefined`. Guard it, then place it — the runtime
  // still holds the data, so this actually renders "As it appears on your ID."
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <parts.Control />
      <div>
        <parts.Label />{' '}
        <button
          type="button"
          onClick={() => setHint((v) => !v)}
          style={{ fontSize: 11 }}
        >
          {hint ? 'hide' : 'why?'}
        </button>
        {parts.Description && <parts.Description />}
        {hint && (
          <small style={{ color: '#666' }}>
            <code>useState</code> in a customize handler — legal because the
            handler is a mounted component (ADR 047 §1).
          </small>
        )}
        <parts.Errors />
      </div>
    </div>
  )
}

// Group label via the TYPED render prop: `l` is `{ text }`.
function CardGroup({ parts, children }: GroupProps<Shape, 'address'>) {
  return (
    <fieldset
      style={{ border: '2px dashed teal', borderRadius: 8, padding: 12 }}
    >
      <parts.Label render={(l) => <legend>{l.text} (custom)</legend>} />
      {children}
    </fieldset>
  )
}

// FULL control hijack via the TYPED render prop: `c` is narrowed to the input
// member (`ControlAt<'address.street'>`), so `c.attrs` is the input attrs with no
// guard. Spread keeps FormData wiring (ADR 047 §5); we add attrs and drop `type`.
function StreetInput({ parts }: FieldProps<Shape, 'address.street'>) {
  return (
    <div>
      <parts.Label />
      <parts.Control
        render={(c) => {
          const { type: _t, ...attrs } = c.attrs
          return (
            <input
              {...attrs}
              placeholder="123 Main St"
              autoComplete="street-address"
              style={{
                display: 'block',
                border: '2px solid darkorange',
                borderRadius: 6,
                padding: 6,
              }}
            />
          )
        }}
      />
      <parts.Errors />
    </div>
  )
}

function CityNote({ Default }: FieldProps<Shape, 'address.city'>) {
  return (
    <div>
      <Default />
      <small style={{ color: '#888' }}>Used for tax estimation.</small>
    </div>
  )
}

const customizeRules = (r: TypedRuleRegistrar<Shape>): void => {
  r.field('name', RowName)
  r.group('address', CardGroup)
  r.field('address.street', StreetInput)
  r.field('address.city', CityNote)

  // INLINE handler → props inferred as FieldProps<Shape, 'plan'> (no annotation),
  // because `r` is annotated `TypedRuleRegistrar<Shape>` on this builder above.
  r.field('plan', ({ value, Default }) => {
    // Hover `value`: 'free' | 'pro' | 'enterprise' | undefined — the Zod enum plus
    // `undefined` (live values await a form-state adapter, ADR 047 §7). Arity ≤5
    // also picks the radio control (choicegroup), same as JSON Schema.
    void value
    return <Default />
  })

  // ── Guardrails: each is a COMPILE ERROR. ───────────────────────────────────
  // @ts-expect-error 'nope' is not a field path
  r.field('nope', () => null)
  // @ts-expect-error 'address' is a GROUP, not a field
  r.field('address', () => null)
  // @ts-expect-error 'address.city' is a FIELD, not a group
  r.group('address.city', () => null)
}

function LiveCustomizedForm() {
  const tree = useMemo(() => zodToTree(schema), [])
  const validator = useMemo(() => createZodValidator(schema), [])
  const {
    SchemaFields: Fields,
    submit,
    revalidate,
    store,
  } = useFormTree(tree, { validator })
  // `useRenderNodeRules` reads the tree's `FormShape` brand to type the rules,
  // bakes in the memo, and hides the one intrinsic cast — the SAME React hook
  // App_16 uses, no per-front-end binding (ADR 048).
  const renderNode = useRenderNodeRules(tree, customizeRules)
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  return (
    <form noValidate onSubmit={submit((d) => setData(d))} onInput={revalidate}>
      <FormStoreProvider store={store} showErrorsWhen="always">
        <Fields renderNode={renderNode} />
      </FormStoreProvider>
      <button type="submit" style={{ marginTop: 12 }}>
        Submit
      </button>
      {data && (
        <pre style={{ background: '#f5f5f5', padding: 8, marginTop: 8 }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </form>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ borderBottom: '1px solid #ddd' }}>{title}</h2>
      {children}
    </div>
  )
}

// The same source-agnostic neutral floor as App_16 — proof the runtime doesn't
// care which front-end produced the tree.
const _neutralExample: RulesBuild = (r: RuleRegistrar) => {
  r.allGroups(({ parts, children }) => (
    <fieldset>
      <parts.Label />
      {children}
    </fieldset>
  ))
}
void _neutralExample

export default function App() {
  return (
    <div>
      <h1>
        renderNodeRules over Zod — the second front-end (ADR 048 / ADR 008)
      </h1>
      <p>
        Field-for-field the same as example 16, but the schema is a{' '}
        <code>z.object(…)</code> and the front-end import is{' '}
        <code>@formframe/input-zod</code>. There is no per-front-end recipe:{' '}
        <code>zodToTree(schema)</code> brands the tree with its{' '}
        <code>FormShapeOf&lt;S&gt;</code>, and the SAME{' '}
        <code>useRenderNodeRules</code> hook binds off that brand (ADR 048) — so
        this file is identical to App_16 except the front-end import + schema
        DSL. The one real divergence: <code>parts.Description</code> is an{' '}
        <em>optional</em> slot for Zod (descriptions live in a runtime registry,
        so the type can only say &ldquo;maybe&rdquo; — guard it), whereas App_16
        gets a statically-present slot from the JSON literal. Enum arity still
        narrows <code>plan</code> to a radio.
      </p>
      <Section title="renderNodeRules over Zod — narrowed props/parts, typed render-props, live errors">
        <LiveCustomizedForm />
      </Section>
    </div>
  )
}
