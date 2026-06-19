import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { DefaultFieldTemplate } from './DefaultFieldTemplate'
import { jsonSchemaToTree } from '@jsonschema-form/core'
import type { FieldNode, JSONSchema } from '@jsonschema-form/core'

describe('DefaultFieldTemplate', () => {
  it('should render a text input field', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: 'Full Name',
        },
      },
    }

    const parsed = jsonSchemaToTree(schema)
    const nameField = parsed.children[0] as FieldNode

    const screen = await render(<DefaultFieldTemplate node={nameField} />)

    const label = screen.getByText('Full Name')
    await expect.element(label).toBeInTheDocument()

    const input = screen.getByRole('textbox', { name: 'Full Name' })
    await expect.element(input).toBeInTheDocument()
    await expect.element(input).toHaveAttribute('type', 'text')
  })

  it('should render a number input field', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        age: {
          type: 'number',
          title: 'Age',
        },
      },
    }

    const parsed = jsonSchemaToTree(schema)
    const ageField = parsed.children[0] as FieldNode

    const screen = await render(<DefaultFieldTemplate node={ageField} />)

    const input = screen.getByRole('spinbutton', { name: 'Age' })
    await expect.element(input).toBeInTheDocument()
    await expect.element(input).toHaveAttribute('type', 'number')
  })

  it('should render a checkbox for boolean fields', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        active: {
          type: 'boolean',
          title: 'Is Active',
        },
      },
    }

    const parsed = jsonSchemaToTree(schema)
    const activeField = parsed.children[0] as FieldNode

    const screen = await render(<DefaultFieldTemplate node={activeField} />)

    const checkbox = screen.getByRole('checkbox', { name: 'Is Active' })
    await expect.element(checkbox).toBeInTheDocument()
    await expect.element(checkbox).toHaveAttribute('type', 'checkbox')
  })

  it('should render a select dropdown for enum fields', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          title: 'Status',
          enum: ['pending', 'active', 'completed'],
        },
      },
    }

    const parsed = jsonSchemaToTree(schema)
    const statusField = parsed.children[0] as FieldNode

    const screen = await render(<DefaultFieldTemplate node={statusField} />)

    const select = screen.getByRole('combobox', { name: 'Status' })
    await expect.element(select).toBeInTheDocument()

    // Check for placeholder option
    await expect.element(screen.getByText('-- Select --')).toBeInTheDocument()

    // Check for enum options
    await expect.element(screen.getByText('pending')).toBeInTheDocument()
    await expect.element(screen.getByText('active')).toBeInTheDocument()
    await expect.element(screen.getByText('completed')).toBeInTheDocument()
  })

  it('should show asterisk for required fields', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          title: 'Email',
        },
      },
      required: ['email'],
    }

    const parsed = jsonSchemaToTree(schema)
    const emailField = parsed.children[0] as FieldNode

    const screen = await render(<DefaultFieldTemplate node={emailField} />)

    await expect.element(screen.getByText('*')).toBeInTheDocument()
  })

  it('should not show asterisk for optional fields', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        nickname: {
          type: 'string',
          title: 'Nickname',
        },
      },
    }

    const parsed = jsonSchemaToTree(schema)
    const nicknameField = parsed.children[0] as FieldNode

    const screen = await render(<DefaultFieldTemplate node={nicknameField} />)

    // Check that asterisk is not present by verifying the label doesn't contain a span
    const label = screen.getByText('Nickname')
    await expect.element(label).toBeInTheDocument()

    // Query for asterisk should not find it
    const asteriskElements = screen.container.querySelectorAll('span')
    expect(asteriskElements.length).toBe(0)
  })

  it('should render field description when provided', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        password: {
          type: 'string',
          title: 'Password',
          description: 'Must be at least 8 characters',
        },
      },
    }

    const parsed = jsonSchemaToTree(schema)
    const passwordField = parsed.children[0] as FieldNode

    const screen = await render(<DefaultFieldTemplate node={passwordField} />)

    const description = screen.getByText('Must be at least 8 characters')
    await expect.element(description).toBeInTheDocument()
    await expect.element(description).toHaveProperty('tagName', 'SMALL')
  })

  it('should not render description element when not provided', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        username: {
          type: 'string',
          title: 'Username',
        },
      },
    }

    const parsed = jsonSchemaToTree(schema)
    const usernameField = parsed.children[0] as FieldNode

    const screen = await render(<DefaultFieldTemplate node={usernameField} />)

    const small = screen.container.querySelector('small')
    expect(small).toBeNull()
  })

  it('should set correct input attributes from parts API', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        quantity: {
          type: 'number',
          title: 'Quantity',
          minimum: 1,
          maximum: 100,
        },
      },
    }

    const parsed = jsonSchemaToTree(schema)
    const quantityField = parsed.children[0] as FieldNode

    const screen = await render(<DefaultFieldTemplate node={quantityField} />)

    const input = screen.getByRole('spinbutton', { name: 'Quantity' })
    await expect.element(input).toHaveAttribute('name', 'quantity')
    await expect.element(input).toHaveAttribute('id', 'quantity')
    await expect.element(input).toHaveAttribute('min', '1')
    await expect.element(input).toHaveAttribute('max', '100')
  })
})
