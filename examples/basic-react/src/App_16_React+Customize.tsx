import { useMemo, useState, type ReactNode } from 'react'
import { jsonSchemaToTree, type FormShapeOf } from '@formframe/input-jsonschema'
import {
  useFormTree,
  type ControlOverride,
  type FieldProps,
  type GroupProps,
} from '@formframe/renderer-react'
import { createAjvValidator } from './ajvValidator.recipe'
import { nativeFieldDefaults } from './nativeFieldControls.recipe'
import {
  NativeValidationProvider,
  useFieldValidationErrors,
  useNativeValidator,
} from './nativeValidation.recipe'

// ═══════════════════════════════════════════════════════════════════════════
// Defaults then intercept (ADR 051) — team-wide recipe defaults first,
// path intercept as the exception. No `useRenderNodeRules` in the teaching path:
// bind `nativeFieldDefaults` on `useFormTree`, then pass a path map to
// `<SchemaFields intercept={…} />`.
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

type Shape = FormShapeOf<typeof schema>

// ── Handlers (hoisted → stable identity → safe hooks) ───────────────────────

// `name` HAS a description in the schema, so `parts.Description` exists here.
// Recipe errors inject on `defaults.field.root`; custom handlers that compose
// parts directly still read gated errors from the recipe hook.
function RowName({ path, parts }: FieldProps<Shape, 'name'>) {
  const [hint, setHint] = useState(false)
  const errors = useFieldValidationErrors(path)
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <parts.Control errors={errors} />
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
            handler is a mounted component.
          </small>
        )}
        <parts.Errors errors={errors} />
      </div>
    </div>
  )
}

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

// Street is only restyling the input — a parts object is `<Default parts>`,
// so label / errors / recipe error-inject stay. `ControlOverride<'input'>`
// is the kind-narrowed parts renderer (no `c.kind` guard).
const StreetControl: ControlOverride<'input'> = (c) => {
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
}

function CityNote({ Default }: FieldProps<Shape, 'address.city'>) {
  return (
    <div>
      <Default />
      <small style={{ color: '#888' }}>Used for tax estimation.</small>
    </div>
  )
}

const customizeIntercept = {
  name: RowName,
  address: CardGroup,
  'address.street': { control: StreetControl },
  'address.city': CityNote,
}

function LiveCustomizedForm() {
  const tree = useMemo(() => jsonSchemaToTree(schema), [])
  const validator = useMemo(() => createAjvValidator(schema), [])
  const { form, SchemaFields: Fields } = useFormTree(tree, {
    defaults: nativeFieldDefaults,
  })
  const { validation, submit, revalidate } = useNativeValidator(form, validator)
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  return (
    <form noValidate onSubmit={submit((d) => setData(d))} onInput={revalidate}>
      <NativeValidationProvider {...validation} showErrorsWhen="always">
        <Fields intercept={customizeIntercept} />
      </NativeValidationProvider>
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

export default function App() {
  return (
    <div>
      <h1>Defaults then intercept — path map (ADR 051)</h1>
      <p>
        Team recipe defaults on <code>useFormTree</code> (
        <code>nativeFieldDefaults</code> injects gated errors), then a path map
        on <code>intercept</code> for the exceptions. Name, address, and city
        are hoisted handlers (<code>FieldProps</code>/<code>GroupProps</code>)
        because they place themselves; street is{' '}
        <code>{'{ control: StreetControl }'}</code> — the same move as{' '}
        <code>{'<Default parts={{ control }} />'}</code> — because only the
        input chrome changes. <code>plan</code> is unmatched and keeps the
        defaults. Type into the orange Street box and Submit. See example 08 for
        the hand-written intercept function this map lowers to.
      </p>
      <Section title="Path intercept map — handlers, one parts overlay, live errors">
        <LiveCustomizedForm />
      </Section>
    </div>
  )
}
