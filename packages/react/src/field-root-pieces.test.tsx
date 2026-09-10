// Custom `field.root` (ADR 052 / #163): `useFieldRootSlots` honors overlays
// and returns placeable nodes. Host chrome owns a11y (Chakra FormControl).
// Native `DefaultFieldRoot` still wires FormFrame a11y — see injected-errors.test.tsx.

import { useMemo, type ReactNode } from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { jsonSchemaToTree } from '@formframe/input-jsonschema'
import type { JSONSchema } from '@formframe/input-jsonschema'
import {
  fieldControlId,
  fieldErrorId,
  nativeDefaults,
  useFieldRootSlots,
  useFormTree,
  type ControlOverride,
} from './index'

const schema = {
  type: 'object',
  required: ['username'],
  properties: {
    username: {
      type: 'string',
      title: 'Username',
      description: 'Your handle',
      minLength: 3,
    },
    zip: { type: 'string', title: 'Zip' },
  },
} as const satisfies JSONSchema

function KitFieldRoot(
  props: Parameters<NonNullable<typeof nativeDefaults.field.root>>[0]
): ReactNode {
  const { label, description, control } = useFieldRootSlots(props)
  return (
    <section data-testid={`kit-field:${props.node.path}`}>
      {label}
      {description}
      {control}
    </section>
  )
}

const kitDefaults = { field: { root: KitFieldRoot } }

// Typing the handler `ControlOverride<'input'>` is how you say "this path is an
// input" — `c.attrs` is `HtmlInputAttrs`, no `c.kind` branch. A node handle
// cannot say it for you: `FieldNode` is deliberately one interface with
// `widget` as a label, not a discriminant on `parts.control` (ADR 029 §5, v60).
const KitControl: ControlOverride<'input'> = (c) => (
  <input {...c.attrs} data-testid="kit-control" />
)

describe('useFieldRootSlots (#163)', () => {
  it('custom chrome places overlay-resolved slots without wrapping div.jsf-field', async () => {
    function Form() {
      const tree = useMemo(() => jsonSchemaToTree(schema), [])
      const { SchemaFields } = useFormTree(tree, { defaults: kitDefaults })
      return <SchemaFields />
    }
    await render(<Form />)

    expect(document.querySelector('.jsf-field')).toBeNull()
    const kit = document.querySelector('[data-testid="kit-field:username"]')
    expect(kit).not.toBeNull()
    expect(kit?.textContent).toContain('Username')
    expect(kit?.textContent).toContain('Your handle')
    expect(document.getElementById(fieldControlId('username'))).not.toBeNull()
  })

  it('does not bake FormFrame error a11y into a custom root', async () => {
    const injected = [{ path: 'username', message: 'Too short' }]
    function Form() {
      const tree = useMemo(() => jsonSchemaToTree(schema), [])
      const { SchemaFields } = useFormTree(tree, { defaults: kitDefaults })
      return (
        <SchemaFields
          intercept={(node, { Default: D }) =>
            node.isField && node.path === 'username' ? (
              <D of={node} errors={injected} />
            ) : (
              <D of={node} />
            )
          }
        />
      )
    }
    await render(<Form />)

    const username = document.getElementById(fieldControlId('username'))
    expect(username?.hasAttribute('aria-invalid')).toBe(false)
    expect(document.getElementById(fieldErrorId('username'))).toBeNull()
    expect(document.querySelector('.jsf-field-errors')).toBeNull()
  })

  it('parts.control overlay is honored without enriching attrs', async () => {
    function Form() {
      const tree = useMemo(() => jsonSchemaToTree(schema), [])
      const { SchemaFields } = useFormTree(tree, { defaults: kitDefaults })
      return (
        <SchemaFields
          intercept={(node, { Default: D }) =>
            node.isField && node.path === 'username' ? (
              <D of={node} parts={{ control: KitControl }} />
            ) : (
              <D of={node} />
            )
          }
        />
      )
    }
    await render(<Form />)

    const control = document.querySelector(
      '[data-testid="kit-control"]'
    ) as HTMLInputElement | null
    expect(control).not.toBeNull()
    expect(control?.name).toBe('username')
    expect(control?.hasAttribute('aria-invalid')).toBe(false)
  })
})
