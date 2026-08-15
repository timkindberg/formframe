import { useMemo, useState, type ReactNode } from 'react'
import { z } from 'zod'
import { zodToTree, type FormShapeOf } from '@formframe/input-zod'
import {
  useFormTree,
  type DefaultParts,
  type FieldProps,
  type GroupProps,
} from '@formframe/renderer-react'
import { fromStandardSchema } from '@formframe/core'
import { nativeFieldDefaults } from './nativeFieldControls.recipe'
import {
  NativeValidationProvider,
  useFieldValidationErrors,
  useNativeValidator,
} from './nativeValidation.recipe'

// ═══════════════════════════════════════════════════════════════════════════
// Defaults then intercept (ADR 051) over a ZOD schema — the SECOND front-end
// (ADR 008), mirroring App_16 field-for-field (bd jsonschema-form-bh7).
//
// Identical to App_16 except the front-end import and schema DSL. One real
// divergence: Zod descriptions live in a runtime registry, so `parts.Description`
// is optional here — guard before placing it.
// ═══════════════════════════════════════════════════════════════════════════

const schema = z.object({
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

type Shape = FormShapeOf<typeof schema>

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
        {parts.Description && <parts.Description />}
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
// so label / errors / recipe error-inject stay. Not a handler that re-places
// them. (RowName / CardGroup / CityNote still place themselves.)
const StreetControl: NonNullable<DefaultParts['control']> = (c) => {
  if (c.kind !== 'input') return null
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
  const tree = useMemo(() => zodToTree(schema), [])
  const validator = useMemo(() => fromStandardSchema(schema), [])
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
      <h1>Defaults then intercept over Zod (ADR 051 / ADR 008)</h1>
      <p>
        Field-for-field the same as example 16, but the schema is a{' '}
        <code>z.object(…)</code> and the front-end import is{' '}
        <code>@formframe/input-zod</code>. Recipe defaults on{' '}
        <code>useFormTree</code>, path map on <code>intercept</code>. The one
        real divergence: <code>parts.Description</code> is optional for Zod
        (descriptions live in a runtime registry — guard it), whereas App_16
        gets a statically-present slot from the JSON literal.
      </p>
      <Section title="Path intercept map over Zod — handlers, one parts overlay, live errors">
        <LiveCustomizedForm />
      </Section>
    </div>
  )
}
