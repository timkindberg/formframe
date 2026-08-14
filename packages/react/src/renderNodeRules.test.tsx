// The renderNodeRules layer (ADR 047 §1–§3) — selector cascade + arrangeable parts.
//
// Covers: mounted component handlers (safe hooks), the specificity cascade
// (exact path > predicate > control kind > kind > default), arrangeable parts
// with typed render props, and the crux — Errors promoted to a movable part with
// the control↔errors a11y linkage preserved across arbitrary arrangement (§2).

import { useMemo, useState } from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import type { ValidationError } from '@formframe/core'
import { jsonSchemaToRuntimeTree } from '@formframe/input-jsonschema'
import type { JSONSchema } from '@formframe/input-jsonschema'
import { SchemaFields, fieldControlId, fieldErrorId } from './renderer'
import { renderNodeRules } from './renderNodeRules'
import type {
  ArrayHandlerProps,
  FieldHandlerProps,
  GroupHandlerProps,
  NodeHandlerProps,
} from './renderNodeRules'

const schema: JSONSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      title: 'Name',
      description: 'Your full name',
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
      properties: { street: { type: 'string', title: 'Street' } },
    },
  },
  required: ['name'],
}

describe('renderNodeRules — selector cascade (ADR 047 §3)', () => {
  it('exact path beats a blanket kind rule (specificity)', async () => {
    const NameHandler = ({ parts }: FieldHandlerProps) => (
      <div data-testid="exact">
        <parts.Label />
        <parts.Control />
      </div>
    )
    const AllFields = ({ Default }: FieldHandlerProps) => (
      <div data-testid="blanket">{Default()}</div>
    )
    const rn = renderNodeRules((r) => {
      r.allFields(AllFields)
      r.field('name', NameHandler)
    })
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(<SchemaFields form={form} renderNode={rn} />)
    // `name` picks the exact-path rule even though allFields also matches, and
    // order of registration does not matter (registered blanket-first above).
    await expect.element(screen.getByTestId('exact')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-testid="exact"]').length).toBe(1)
    // The other two fields (`plan`, `address.street`) fall to the blanket handler.
    expect(document.querySelectorAll('[data-testid="blanket"]').length).toBe(2)
  })

  it('control(kind) selects by render archetype', async () => {
    const rn = renderNodeRules((r) => {
      r.control('input', ({ parts }: FieldHandlerProps) => (
        <div data-jsf-role="input-control">
          <parts.Label />
          <parts.Control />
        </div>
      ))
    })
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(<SchemaFields form={form} renderNode={rn} />)
    // `name` is an <input>; the small enum `plan` is a radio (choicegroup), so it
    // must NOT match the input-kind rule.
    const inputWrappers = document.querySelectorAll(
      '[data-jsf-role="input-control"]'
    )
    // name + address.street are inputs; plan (radio) is excluded.
    expect(inputWrappers.length).toBe(2)
    await expect
      .element(screen.getByRole('textbox', { name: 'Name' }))
      .toBeInTheDocument()
  })

  it('unmatched nodes fall through to the engine default', async () => {
    const rn = renderNodeRules((r) => {
      r.field('name', ({ Default }: FieldHandlerProps) => <>{Default()}</>)
    })
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(<SchemaFields form={form} renderNode={rn} />)
    await expect
      .element(screen.getByRole('textbox', { name: 'Street' }))
      .toBeInTheDocument()
  })
})

describe('renderNodeRules — arrangeable parts (ADR 047 §2)', () => {
  it('places parts in a custom order and hijacks a group label via render prop', async () => {
    const Card = ({ parts, children }: GroupHandlerProps) => (
      <fieldset data-testid="card">
        <parts.Label
          render={(l) => <legend data-testid="legend">{l.text}!</legend>}
        />
        {children}
      </fieldset>
    )
    const rn = renderNodeRules((r) => {
      r.group('address', Card)
    })
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(<SchemaFields form={form} renderNode={rn} />)
    await expect.element(screen.getByTestId('card')).toBeInTheDocument()
    await expect
      .element(screen.getByTestId('legend'))
      .toHaveTextContent('Address!')
    // children still flow through the engine — the street input renders inside.
    await expect
      .element(screen.getByRole('textbox', { name: 'Street' }))
      .toBeInTheDocument()
  })

  it('supports hooks in a handler (mounted component, §1)', async () => {
    const Stateful = ({ parts }: FieldHandlerProps) => {
      const [n, setN] = useState(0)
      return (
        <div>
          <parts.Control />
          <button type="button" onClick={() => setN((v) => v + 1)}>
            count {n}
          </button>
        </div>
      )
    }
    const rn = renderNodeRules((r) => r.field('name', Stateful))
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(<SchemaFields form={form} renderNode={rn} />)
    await expect
      .element(screen.getByRole('button'))
      .toHaveTextContent('count 0')
    await screen.getByRole('button').click()
    await expect
      .element(screen.getByRole('button'))
      .toHaveTextContent('count 1')
  })
})

describe('renderNodeRules — one registrar, cascading scopes (ADR 047 §6)', () => {
  it('form scope overrides app scope at equal specificity', async () => {
    const app = (r: import('./renderNodeRules').RuleRegistrar) =>
      r.field('name', ({ Default }: FieldHandlerProps) => (
        <div data-testid="app-name">{Default()}</div>
      ))
    const form = (r: import('./renderNodeRules').RuleRegistrar) =>
      r.field('name', ({ Default }: FieldHandlerProps) => (
        <div data-testid="form-name">{Default()}</div>
      ))
    // Composed app-first, form-last: form wins the tie on `name` (CSS cascade).
    const rn = renderNodeRules(app, form)
    const f = jsonSchemaToRuntimeTree(schema)
    const screen = await render(<SchemaFields form={f} renderNode={rn} />)
    await expect.element(screen.getByTestId('form-name')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-testid="app-name"]').length).toBe(0)
  })

  it('inline part render prop overrides the default part (adapter < rules < inline)', async () => {
    // The renderNodeRules handler places `parts.Label`; the INLINE render prop hand-
    // authors it, which must win over the adapter's default <label> markup.
    const rn = renderNodeRules((r) => {
      r.field('name', ({ parts }: FieldHandlerProps) => (
        <div>
          <parts.Label
            render={(l) => (
              <span data-testid="inline-label">{l.text} (inline)</span>
            )}
          />
          <parts.Control />
        </div>
      ))
    })
    const f = jsonSchemaToRuntimeTree(schema)
    const screen = await render(<SchemaFields form={f} renderNode={rn} />)
    await expect
      .element(screen.getByTestId('inline-label'))
      .toHaveTextContent('Name (inline)')
  })
})

describe('renderNodeRules — Errors promoted to a movable part keeps a11y (ADR 047 §2)', () => {
  const issues: ValidationError[] = [
    { path: 'name', message: 'Name is too short' },
  ]

  function CustomArrangement() {
    const form = useMemo(() => jsonSchemaToRuntimeTree(schema), [])
    // Errors deliberately placed in a SEPARATE wrapper from the control, to prove
    // the aria linkage rides on shared ids/context, not a fixed layout. The
    // library does not produce/store errors (ADR 050) — the handler passes them
    // in explicitly (as a validation adapter/recipe would).
    const rn = useMemo(
      () =>
        renderNodeRules((r) => {
          r.field('name', ({ parts }: FieldHandlerProps) => (
            <div>
              <div className="control-slot">
                <parts.Label />
                <parts.Control errors={issues} />
              </div>
              <aside className="errors-slot">
                <parts.Errors errors={issues} />
              </aside>
            </div>
          ))
        }),
      []
    )
    return <SchemaFields form={form} renderNode={rn} />
  }

  it('control keeps aria-describedby pointing at the (separately placed) error list', async () => {
    await render(<CustomArrangement />)
    const control = document.getElementById(fieldControlId('name'))
    expect(control?.getAttribute('aria-invalid')).toBe('true')
    expect(control?.getAttribute('aria-describedby')).toBe(fieldErrorId('name'))
    // The error list carries the matching id, though it lives in a sibling <aside>.
    const errorList = document.getElementById(fieldErrorId('name'))
    expect(errorList).not.toBeNull()
    expect(errorList?.closest('aside')).not.toBeNull()
    expect(errorList?.textContent).toContain('Name is too short')
  })
})

// Array add/remove state lives in ArrayRoot (renderer.tsx). A handler that only
// places Label + {children} skips that root and drops the Add button. Re-enter
// <Default /> for chrome you do not own; customize items via `where` (dynamic
// indices cannot share one exact r.field('contacts.0.name') rule).
const arraySchema: JSONSchema = {
  type: 'object',
  properties: {
    contacts: {
      type: 'array',
      title: 'Contacts',
      minItems: 1,
      items: {
        type: 'object',
        properties: { name: { type: 'string', title: 'Contact name' } },
      },
    },
  },
}

describe('renderNodeRules — r.array handler layout (add/remove)', () => {
  const ContactsArray = ({ Default }: ArrayHandlerProps) => (
    <div data-testid="custom-array">
      <Default />
    </div>
  )
  const ContactName = ({ parts }: NodeHandlerProps) => (
    <div data-testid="custom-item-field">
      <parts.Label />
      <parts.Control />
    </div>
  )
  const rn = renderNodeRules((r) => {
    r.array('contacts', ContactsArray)
    r.where(
      (n) =>
        n.isField && n.path.startsWith('contacts.') && n.path.endsWith('.name'),
      ContactName
    )
  })

  it('customizes array layout and item fields; Add preserves existing values', async () => {
    const form = jsonSchemaToRuntimeTree(arraySchema)
    const screen = await render(<SchemaFields form={form} renderNode={rn} />)

    await expect.element(screen.getByTestId('custom-array')).toBeInTheDocument()
    await expect
      .element(screen.getByTestId('custom-item-field'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: /add/i }))
      .toBeInTheDocument()

    const first = screen.getByRole('textbox', { name: 'Contact name' })
    await first.fill('Alice')
    await expect.element(first).toHaveValue('Alice')

    await screen.getByRole('button', { name: /add/i }).click()

    const inputs = () =>
      document.querySelectorAll<HTMLInputElement>('input[name$=".name"]')
    await expect.poll(() => inputs().length).toBe(2)
    expect(inputs()[0].value).toBe('Alice')
    expect(inputs()[1].value).toBe('')
    expect(
      document.querySelectorAll('[data-testid="custom-item-field"]').length
    ).toBe(2)
  })

  it('Remove preserves the survivor’s value and re-paths it densely', async () => {
    const form = jsonSchemaToRuntimeTree(arraySchema)
    const screen = await render(<SchemaFields form={form} renderNode={rn} />)

    await screen.getByRole('button', { name: /add/i }).click()
    const inputs = () =>
      document.querySelectorAll<HTMLInputElement>('input[name$=".name"]')
    await expect.poll(() => inputs().length).toBe(2)

    const name = screen.getByRole('textbox', { name: 'Contact name' })
    await name.nth(0).fill('Alice')
    await name.nth(1).fill('Bob')

    await screen.getByRole('button', { name: 'Remove' }).nth(0).click()

    await expect.poll(() => inputs().length).toBe(1)
    expect(inputs()[0].value).toBe('Bob')
    expect(inputs()[0].name).toBe('contacts.0.name')
  })
})
