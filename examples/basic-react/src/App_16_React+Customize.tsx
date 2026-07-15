import { useMemo, useState, type ReactNode } from 'react'
import { jsonSchemaToTree, type FormShapeOf } from '@formframe/input-jsonschema'
import {
  useFormTree,
  ValidationProvider,
  useRenderNodeRules,
  type FieldProps,
  type GroupProps,
  type TypedRuleRegistrar,
  type RulesBuild,
  type RuleRegistrar,
} from '@formframe/renderer-react'
import { createAjvValidator } from '@formframe/validation-ajv'

// ═══════════════════════════════════════════════════════════════════════════
// The render-node rules layer (ADR 047/048), on the SHIPPED API.
//
// No recipe file: `jsonSchemaToTree(schema)` brands the tree with its resolved
// `FormShapeOf<S>`, and React's `useRenderNodeRules(tree, rules)` reads that brand
// to type the registrar — React imports NO front-end. The APP side is: define a
// schema (`as const`), write `type Shape = FormShapeOf<typeof schema>` for hoisted
// handler annotations, then author handlers with fully narrowed path/value/
// control/parts. (The `renderNode` prop can do all of this by hand — the hook is
// just typed, memo-safe sugar over it.)
// ═══════════════════════════════════════════════════════════════════════════

const schema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      title: 'Full name',
      description: 'As it appears on your ID.',
      minLength: 3,
    },
    plan: {
      type: 'string',
      title: 'Plan',
      enum: ['free', 'pro', 'enterprise'],
    },
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
  required: ['name'],
} as const

// The resolved FormShape — what the typed binding reads (ADR 048). Hoisted
// handlers annotate `FieldProps<Shape, 'name'>` / `GroupProps<Shape, 'address'>`;
// a module-scope builder is `(r: TypedRuleRegistrar<Shape>) => void`. Inline
// handlers inside `useRenderNodeRules` need no annotation.
type Shape = FormShapeOf<typeof schema>

// ── Handlers (hoisted → stable identity → safe hooks + memo bail, §1) ─────────

// `name` HAS a description in the schema, so `parts.Description` exists here.
function RowName({ parts }: FieldProps<Shape, 'name'>) {
  const [hint, setHint] = useState(false)
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
        <parts.Description />
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
  // presence narrowing: street has no description in the schema.
  // @ts-expect-error 'address.street' has no description part
  void parts.Description
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
    // Hover `value`: 'free' | 'pro' | 'enterprise' — from the schema enum.
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
  const tree = useMemo(() => jsonSchemaToTree(schema), [])
  const validator = useMemo(() => createAjvValidator(schema), [])
  const {
    SchemaFields: Fields,
    submit,
    revalidate,
    errors,
  } = useFormTree(tree, { validator })
  // `useRenderNodeRules` reads the tree's `FormShape` brand to type the rules,
  // bakes in the memo (stable resolver identity is the contract), and hides the
  // one intrinsic cast. `tree` is a compile-time type carrier here (ADR 048).
  const renderNode = useRenderNodeRules(tree, customizeRules)
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  return (
    <form noValidate onSubmit={submit((d) => setData(d))} onInput={revalidate}>
      <ValidationProvider errors={errors} showErrorsWhen="always">
        <Fields renderNode={renderNode} />
      </ValidationProvider>
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

// A plain neutral registrar (no schema types) still works — the source-agnostic
// floor. Here: a blanket rule via the shared `RuleRegistrar` type.
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
      <h1>customize — path-narrowed props &amp; arrangeable parts (ADR 047)</h1>
      <p>
        In-editor: <code>{`r.field('…')`}</code>/<code>{`r.group('…')`}</code>{' '}
        narrow to real paths; <code>value</code> and <code>control</code> narrow
        to the schema; <code>parts</code> is derived per path (
        <code>parts.Description</code> exists on <code>name</code> but not{' '}
        <code>street</code>); every part takes a typed <code>render</code> prop;
        and <code>Default</code> re-enters the whole node. Type into the orange
        Street box and Submit.
      </p>
      <Section title="customize — narrowed props/parts, typed render-props, Default prop, live errors">
        <LiveCustomizedForm />
      </Section>
    </div>
  )
}
