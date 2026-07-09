import { jsonSchemaToTree } from '@jsonschema-form/input-jsonschema'
import type { JSONSchema } from '@jsonschema-form/input-jsonschema'
import { createRenderer, defaultAdapter } from '@jsonschema-form/react'

// The floor (ADR 013): the lowest public rendering rung. `createRenderer` binds
// a renderer set and returns a `SchemaFields`-style component. The set is *partial* —
// anything you don't supply falls back to the visible `[… not implemented]`
// diagnostic markers, so an incomplete adapter still runs and tells you exactly
// what's missing. Watch the same form come alive as we fill entries in, and
// note the punchline: the batteries-included `SchemaFields` is just
// `createRenderer(defaultAdapter)`.

const schema: JSONSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Full Name' },
    color: { type: 'string', title: 'Color', enum: ['red', 'green', 'blue'] },
    address: {
      type: 'object',
      title: 'Address',
      properties: {
        street: { type: 'string', title: 'Street' },
      },
    },
  },
  required: ['name'],
}

const form = jsonSchemaToTree(schema)

// 1. Nothing supplied — the whole tree renders diagnostic markers.
const FieldsEmpty = createRenderer({})

// 2. Supply just the field control for text inputs — inputs light up; the rest
// (including selects) stay markers. One unified `control` slot (ADR 029 §5).
const FieldsInput = createRenderer({
  field: {
    control: (control) =>
      control.kind === 'input' ? <input {...control.attrs} /> : null,
  },
})

// 3. Supply the field's parts + the group's caption — almost there. The single
// `control` renderer narrows on `control.kind` to cover every archetype.
const FieldsMost = createRenderer({
  field: {
    label: ({ text, attrs, showRequired }) => (
      // Neutral caption attrs: spread the `id`, rename `for`→`htmlFor` (bd l8j).
      <label id={attrs.id} htmlFor={attrs.for}>
        {text}
        {showRequired && <span aria-hidden> *</span>}
      </label>
    ),
    control: (control) => {
      switch (control.kind) {
        case 'input':
          return <input {...control.attrs} />
        case 'textarea':
          return <textarea {...control.attrs} />
        case 'select':
          return (
            <select {...control.attrs}>
              <option value="">-- select --</option>
              {control.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )
        case 'choicegroup':
          return (
            <div role={control.role} aria-labelledby={control.labelledBy}>
              {control.options.map((o) => (
                <label key={o.attrs.id}>
                  <input {...o.attrs} /> {o.label}
                </label>
              ))}
            </div>
          )
      }
    },
  },
  group: { label: ({ text }) => <legend>{text}</legend> },
})

// 4. The punchline: spread the real defaults → this *is* `SchemaFields`.
const FieldsBatteries = createRenderer(defaultAdapter)

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
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
      <h1>The renderer adapter — the floor (ADR 013)</h1>
      <p>
        <code>createRenderer(partialAdapter)</code> is the lowest public rung.
        Missing content renderers fall back to visible{' '}
        <code>[… not implemented]</code> markers. Fill entries in by reference
        and the same form comes alive.
      </p>

      <Section title="1. createRenderer({}) — everything is a diagnostic marker">
        <FieldsEmpty form={form} />
      </Section>

      <Section title="2. …{ field: { input } } — inputs light up, the rest stay markers">
        <FieldsInput form={form} />
      </Section>

      <Section title="3. …+ field label/select + group label — nearly there">
        <FieldsMost form={form} />
      </Section>

      <Section title="4. createRenderer(defaultAdapter) — this is exactly <SchemaFields/>">
        <FieldsBatteries form={form} />
      </Section>
    </div>
  )
}
