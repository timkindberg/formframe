import '@vitest/browser/matchers'
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { useSchemaForm } from './useSchemaForm'
import type { JSONSchema } from '@jsonschema-form/core'

describe('useSchemaForm', () => {
  it('should render a simple form with a text field', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: 'Name',
        },
      },
    }

    function TestComponent() {
      const { Form } = useSchemaForm(schema)
      return <Form />
    }

    const screen = render(<TestComponent />)

    // Check for label
    await expect.element(await screen.getByText('Name')).toBeInTheDocument()
    
    // Check for input
    const input = await screen.getByRole('textbox', { name: 'Name' })
    await expect.element(input).toBeInTheDocument()
    
    // Check for submit button
    const submitButton = await screen.getByRole('button', { name: 'Submit' })
    await expect.element(submitButton).toBeInTheDocument()
  })

  it('should render required fields with asterisk', async () => {
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

    function TestComponent() {
      const { Form } = useSchemaForm(schema)
      return <Form />
    }

    const screen = render(<TestComponent />)

    // Check for asterisk in required field
    await expect.element(await screen.getByText('*')).toBeInTheDocument()
  })

  it('should render field descriptions', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        username: {
          type: 'string',
          title: 'Username',
          description: 'Choose a unique username',
        },
      },
    }

    function TestComponent() {
      const { Form } = useSchemaForm(schema)
      return <Form />
    }

    const screen = render(<TestComponent />)

    await expect
      .element(await screen.getByText('Choose a unique username'))
      .toBeInTheDocument()
  })

  it('should render number fields with correct input type', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        age: {
          type: 'number',
          title: 'Age',
        },
      },
    }

    function TestComponent() {
      const { Form } = useSchemaForm(schema)
      return <Form />
    }

    const screen = render(<TestComponent />)

    const input = await screen.getByRole('spinbutton', { name: 'Age' })
    await expect.element(input).toBeInTheDocument()
    await expect.element(input).toHaveAttribute('type', 'number')
  })

  it('should render boolean fields as checkboxes', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        subscribe: {
          type: 'boolean',
          title: 'Subscribe to newsletter',
        },
      },
    }

    function TestComponent() {
      const { Form } = useSchemaForm(schema)
      return <Form />
    }

    const screen = render(<TestComponent />)

    const checkbox = await screen.getByRole('checkbox', {
      name: 'Subscribe to newsletter',
    })
    await expect.element(checkbox).toBeInTheDocument()
    await expect.element(checkbox).toHaveAttribute('type', 'checkbox')
  })

  it('should render enum fields as select dropdowns', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        color: {
          type: 'string',
          title: 'Favorite Color',
          enum: ['red', 'green', 'blue'],
        },
      },
    }

    function TestComponent() {
      const { Form } = useSchemaForm(schema)
      return <Form />
    }

    const screen = render(<TestComponent />)

    const select = await screen.getByRole('combobox', { name: 'Favorite Color' })
    await expect.element(select).toBeInTheDocument()
    
    // Check for options
    await expect.element(await screen.getByText('red')).toBeInTheDocument()
    await expect.element(await screen.getByText('green')).toBeInTheDocument()
    await expect.element(await screen.getByText('blue')).toBeInTheDocument()
  })

  it('should render nested object properties', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          title: 'Address',
          properties: {
            street: {
              type: 'string',
              title: 'Street',
            },
            city: {
              type: 'string',
              title: 'City',
            },
          },
        },
      },
    }

    function TestComponent() {
      const { Form } = useSchemaForm(schema)
      return <Form />
    }

    const screen = render(<TestComponent />)

    // Check for group title
    await expect.element(await screen.getByText('Address')).toBeInTheDocument()

    // Check for nested fields
    await expect
      .element(await screen.getByRole('textbox', { name: 'Street' }))
      .toBeInTheDocument()
    await expect
      .element(await screen.getByRole('textbox', { name: 'City' }))
      .toBeInTheDocument()
  })

  it('should handle onSubmit callback', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: 'Name',
        },
      },
    }

    let submitted = false
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      submitted = true
    }

    function TestComponent() {
      const { Form } = useSchemaForm(schema)
      return <Form onSubmit={handleSubmit} />
    }

    const screen = render(<TestComponent />)
    const submitButton = await screen.getByRole('button', { name: 'Submit' })
    
    await expect.element(submitButton).toBeInTheDocument()
    
    // Click the submit button
    await submitButton.click()
    
    expect(submitted).toBe(true)
  })

  it('should return form node from hook', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: 'Name',
        },
      },
    }

    let formNode: any = null

    function TestComponent() {
      const { form, Form } = useSchemaForm(schema)

      // Capture form node
      // eslint-disable-next-line react-hooks/globals
      formNode = form

      return <Form />
    }

    const screen = render(<TestComponent />)
    await expect
      .element(await screen.getByRole('button', { name: 'Submit' }))
      .toBeInTheDocument()

    // Check that form node has correct structure after render
    expect(formNode).toBeDefined()
    expect(formNode.nodeType).toBe('group')
    expect(formNode.schema.type).toBe('object')
  })
})
