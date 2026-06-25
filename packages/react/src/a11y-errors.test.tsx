// Accessibility wiring for validation errors (ADR 019) + opt-in ValidationSummary.
//
// All a11y attributes are gated on error presence so the no-error markup stays
// byte-for-byte identical to the vanilla oracle (see conformance.test.tsx).

import { useMemo } from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import type { JSONSchema, ValidationIssue } from '@jsonschema-form/core'
import { jsonSchemaToTree } from '@jsonschema-form/core'
import { SchemaFields, ValidationProvider, fieldControlId, fieldErrorId } from './renderer'
import { ValidationSummary } from './ValidationSummary'

const schema: JSONSchema = {
  type: 'object',
  required: ['username'],
  properties: {
    username: { type: 'string', title: 'Username', minLength: 3 },
    zip: { type: 'string', title: 'Zip', pattern: '^[0-9]{5}$' },
  },
}

const errors: ValidationIssue[] = [
  { path: 'username', message: 'Username is too short' },
  { path: 'zip', message: 'Zip must be 5 digits' },
]

const nestedSchema: JSONSchema = {
  type: 'object',
  properties: {
    address: {
      type: 'object',
      properties: {
        street: { type: 'string', title: 'Street' },
      },
    },
    contacts: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          email: { type: 'string', title: 'Email' },
        },
      },
    },
  },
}

const nestedErrors: ValidationIssue[] = [
  { path: 'address.street', message: 'Street is required' },
  { path: 'contacts.0.email', message: 'Email is invalid' },
]

function FormWithValidation({
  issues,
  showSummary = false,
  formSchema = schema,
}: {
  issues: ValidationIssue[]
  showSummary?: boolean
  formSchema?: JSONSchema
}) {
  const form = useMemo(() => jsonSchemaToTree(formSchema), [formSchema])
  return (
    <ValidationProvider issues={issues}>
      {showSummary && <ValidationSummary />}
      <SchemaFields form={form} />
    </ValidationProvider>
  )
}

describe('validation a11y wiring', () => {
  it('with errors: control gets aria-invalid and aria-describedby to role=alert list', async () => {
    await render(<FormWithValidation issues={errors} />)

    const username = document.getElementById(fieldControlId('username'))
    expect(username).not.toBeNull()
    expect(username?.getAttribute('aria-invalid')).toBe('true')
    expect(username?.getAttribute('aria-describedby')).toBe(
      fieldErrorId('username')
    )

    const usernameErrors = document.getElementById(fieldErrorId('username'))
    expect(usernameErrors).not.toBeNull()
    expect(usernameErrors?.getAttribute('role')).toBe('alert')
    expect(username?.getAttribute('aria-describedby')).toBe(
      usernameErrors?.id
    )

    const zip = document.getElementById(fieldControlId('zip'))
    expect(zip?.getAttribute('aria-invalid')).toBe('true')
    expect(zip?.getAttribute('aria-describedby')).toBe(fieldErrorId('zip'))
  })

  it('ValidationSummary lists all errors with links to field control ids', async () => {
    const screen = await render(
      <FormWithValidation issues={errors} showSummary />
    )

    const summary = document.querySelector('.jsf-validation-summary')
    expect(summary).not.toBeNull()
    expect(summary?.getAttribute('role')).toBe('alert')

    const links = summary?.querySelectorAll('a') ?? []
    expect(links.length).toBe(2)
    expect(links[0]?.getAttribute('href')).toBe(`#${fieldControlId('username')}`)
    expect(links[1]?.getAttribute('href')).toBe(`#${fieldControlId('zip')}`)
    expect(links[0]?.textContent).toContain('username')
    expect(links[0]?.textContent).toContain('Username is too short')
    expect(links[1]?.textContent).toContain('zip')
    expect(links[1]?.textContent).toContain('Zip must be 5 digits')

    await expect
      .element(screen.getByRole('link', { name: /username: Username is too short/ }))
      .toBeInTheDocument()
  })

  it('with no errors: no aria attrs, no error lists, no summary', async () => {
    await render(<FormWithValidation issues={[]} showSummary />)

    const username = document.getElementById(fieldControlId('username'))
    expect(username?.hasAttribute('aria-invalid')).toBe(false)
    expect(username?.hasAttribute('aria-describedby')).toBe(false)

    expect(document.querySelector('.jsf-field-errors')).toBeNull()
    expect(document.querySelector('.jsf-validation-summary')).toBeNull()
  })

  it('nested paths: control id, aria-describedby, error id, and summary href align', async () => {
    await render(
      <FormWithValidation
        issues={nestedErrors}
        showSummary
        formSchema={nestedSchema}
      />
    )

    for (const { path, message } of nestedErrors) {
      const control = document.getElementById(fieldControlId(path))
      expect(control).not.toBeNull()
      expect(control?.id).toBe(path)
      expect(control?.getAttribute('aria-invalid')).toBe('true')
      expect(control?.getAttribute('aria-describedby')).toBe(fieldErrorId(path))

      const errorEl = document.getElementById(fieldErrorId(path))
      expect(errorEl).not.toBeNull()
      expect(errorEl?.id).toBe(fieldErrorId(path))
      expect(control?.getAttribute('aria-describedby')).toBe(errorEl?.id)

      const link = document.querySelector(
        `a[href="#${fieldControlId(path)}"]`
      )
      expect(link).not.toBeNull()
      expect(link?.textContent).toContain(path)
      expect(link?.textContent).toContain(message)
    }
  })
})
