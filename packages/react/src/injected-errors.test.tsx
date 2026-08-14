// Field error-presentation seam (ADR 050): inject via
// `<Default of={field} errors={ValidationError[]} />` (recipe-pre-gated, no show
// flag). Inject-only: the library does not produce/store validation errors
// itself, so omitting `errors` means no errors and no a11y error state.

import { useMemo } from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import type { ValidationError } from '@formframe/core'
import { jsonSchemaToRuntimeTree } from '@formframe/input-jsonschema'
import type { JSONSchema } from '@formframe/input-jsonschema'
import {
  SchemaFields,
  Default,
  fieldControlId,
  fieldErrorId,
  type ErrorA11yProps,
} from './renderer'
import type { FieldControl } from '@formframe/core'

const schema: JSONSchema = {
  type: 'object',
  required: ['username'],
  properties: {
    username: { type: 'string', title: 'Username', minLength: 3 },
    zip: { type: 'string', title: 'Zip', pattern: '^[0-9]{5}$' },
  },
}

describe('<Default errors={ValidationError[]}> inject path', () => {
  it('injected errors render and drive a11y; no role=alert', async () => {
    const injected: ValidationError[] = [
      { path: 'username', message: 'Too short' },
    ]
    function Form() {
      const f = useMemo(() => jsonSchemaToRuntimeTree(schema), [])
      return (
        <SchemaFields form={f}>
          {(root, { Default: D }) => (
            <>
              <D of={root.children.username} errors={injected} />
              <D of={root.children.zip} errors={[]} />
            </>
          )}
        </SchemaFields>
      )
    }
    await render(<Form />)

    const username = document.getElementById(fieldControlId('username'))
    expect(username?.getAttribute('aria-invalid')).toBe('true')
    expect(username?.getAttribute('aria-describedby')).toBe(
      fieldErrorId('username')
    )
    const list = document.getElementById(fieldErrorId('username'))
    expect(list).not.toBeNull()
    expect(list?.getAttribute('role')).toBeNull()
    expect(list?.textContent).toContain('Too short')

    const zip = document.getElementById(fieldControlId('zip'))
    expect(zip?.hasAttribute('aria-invalid')).toBe(false)
    expect(document.getElementById(fieldErrorId('zip'))).toBeNull()
  })

  it('omitting the errors prop renders no error markup, no a11y', async () => {
    function Form() {
      const f = useMemo(() => jsonSchemaToRuntimeTree(schema), [])
      return <SchemaFields form={f} />
    }
    await render(<Form />)

    const username = document.getElementById(fieldControlId('username'))
    expect(username?.hasAttribute('aria-invalid')).toBe(false)
    expect(username?.hasAttribute('aria-describedby')).toBe(false)
    expect(document.getElementById(fieldErrorId('username'))).toBeNull()
    expect(document.querySelector('.jsf-field-errors')).toBeNull()
  })

  it('imported Default of={field} errors={…} works from renderNode', async () => {
    const injected: ValidationError[] = [
      { path: 'username', message: 'Imported Default' },
    ]
    function Form() {
      const f = useMemo(() => jsonSchemaToRuntimeTree(schema), [])
      return (
        <SchemaFields
          form={f}
          intercept={(node) =>
            node.isField && node.path === 'username' ? (
              <Default of={node} errors={injected} />
            ) : (
              <Default of={node} />
            )
          }
        />
      )
    }
    await render(<Form />)
    expect(
      document.getElementById(fieldErrorId('username'))?.textContent
    ).toContain('Imported Default')
  })

  it('parts.errors hijacks the error list', async () => {
    const injected: ValidationError[] = [
      { path: 'username', message: 'Too short' },
    ]
    function Form() {
      const f = useMemo(() => jsonSchemaToRuntimeTree(schema), [])
      return (
        <SchemaFields form={f}>
          {(root, { Default: D }) => (
            <D
              of={root.children.username}
              errors={injected}
              parts={{
                errors: (errs: ValidationError[]) => (
                  <p
                    data-testid="hijacked-errors"
                    id={fieldErrorId('username')}
                  >
                    {errs.map((e) => e.message).join('; ')}
                  </p>
                ),
              }}
            />
          )}
        </SchemaFields>
      )
    }
    await render(<Form />)

    // Default control still gets a11y from the inject path.
    const username = document.getElementById(fieldControlId('username'))
    expect(username?.getAttribute('aria-invalid')).toBe('true')
    expect(username?.getAttribute('aria-describedby')).toBe(
      fieldErrorId('username')
    )
    // Default <ul class="jsf-field-errors"> must not appear.
    expect(document.querySelector('.jsf-field-errors')).toBeNull()
    const custom = document.querySelector('[data-testid="hijacked-errors"]')
    expect(custom?.textContent).toContain('Too short')
    expect(custom?.id).toBe(fieldErrorId('username'))
  })

  it('parts.control merges a11y into c.attrs', async () => {
    const injected: ValidationError[] = [
      { path: 'username', message: 'Too short' },
    ]
    function Form() {
      const f = useMemo(() => jsonSchemaToRuntimeTree(schema), [])
      return (
        <SchemaFields form={f}>
          {(root, { Default: D }) => (
            <D
              of={root.children.username}
              errors={injected}
              parts={{
                control: (
                  c: FieldControl & {
                    errorA11y: ErrorA11yProps
                    Default(): React.ReactNode
                  }
                ) =>
                  c.kind === 'input' ? (
                    <input {...c.attrs} data-testid="hijacked-control" />
                  ) : null,
              }}
            />
          )}
        </SchemaFields>
      )
    }
    await render(<Form />)

    const control = document.querySelector(
      '[data-testid="hijacked-control"]'
    ) as HTMLInputElement | null
    expect(control?.getAttribute('aria-invalid')).toBe('true')
    expect(control?.getAttribute('aria-describedby')).toBe(
      fieldErrorId('username')
    )
  })
})
