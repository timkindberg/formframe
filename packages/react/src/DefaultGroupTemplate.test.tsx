import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { DefaultGroupTemplate } from './DefaultGroupTemplate'
import { parseSchema } from '@jsonschema-form/core'
import type { GroupNode, JSONSchema } from '@jsonschema-form/core'

describe('DefaultGroupTemplate', () => {
  it('should render a fieldset element', async () => {
    const schema: JSONSchema = {
      type: 'object',
      title: 'User Profile',
      properties: {
        name: {
          type: 'string',
          title: 'Name',
        },
      },
    }

    const parsed = parseSchema(schema) as GroupNode

    const screen = await render(
      <DefaultGroupTemplate node={parsed}>
        <div>Test Content</div>
      </DefaultGroupTemplate>
    )

    const fieldset = screen.container.querySelector('fieldset')
    expect(fieldset).toBeDefined()
  })

  it('should render legend with group title', async () => {
    const schema: JSONSchema = {
      type: 'object',
      title: 'Contact Information',
      properties: {
        email: {
          type: 'string',
          title: 'Email',
        },
      },
    }

    const parsed = parseSchema(schema) as GroupNode

    const screen = await render(
      <DefaultGroupTemplate node={parsed}>
        <div>Fields</div>
      </DefaultGroupTemplate>
    )

    const legend = screen.getByText('Contact Information')
    await expect.element(legend).toBeInTheDocument()
    await expect.element(legend).toHaveProperty('tagName', 'LEGEND')
  })

  it('should render children inside the fieldset', async () => {
    const schema: JSONSchema = {
      type: 'object',
      title: 'Address',
      properties: {
        street: {
          type: 'string',
          title: 'Street',
        },
      },
    }

    const parsed = parseSchema(schema) as GroupNode

    const screen = await render(
      <DefaultGroupTemplate node={parsed}>
        <div>Field 1</div>
        <div>Field 2</div>
      </DefaultGroupTemplate>
    )

    await expect.element(screen.getByText('Field 1')).toBeInTheDocument()
    await expect.element(screen.getByText('Field 2')).toBeInTheDocument()
  })

  it('should render description when provided', async () => {
    const schema: JSONSchema = {
      type: 'object',
      title: 'Shipping Address',
      description: 'Where should we ship your order?',
      properties: {
        address: {
          type: 'string',
          title: 'Address',
        },
      },
    }

    const parsed = parseSchema(schema) as GroupNode

    const screen = await render(
      <DefaultGroupTemplate node={parsed}>
        <div>Fields</div>
      </DefaultGroupTemplate>
    )

    const description = screen.getByText('Where should we ship your order?')
    await expect.element(description).toBeInTheDocument()
    await expect.element(description).toHaveProperty('tagName', 'SMALL')
  })

  it('should not render description element when not provided', async () => {
    const schema: JSONSchema = {
      type: 'object',
      title: 'Basic Group',
      properties: {
        field: {
          type: 'string',
          title: 'Field',
        },
      },
    }

    const parsed = parseSchema(schema) as GroupNode

    const screen = await render(
      <DefaultGroupTemplate node={parsed}>
        <div>Fields</div>
      </DefaultGroupTemplate>
    )

    const paragraphs = screen.container.querySelectorAll('p')
    expect(paragraphs.length).toBe(0)
  })

  it('should handle nested groups', async () => {
    const schema: JSONSchema = {
      type: 'object',
      title: 'Outer Group',
      properties: {
        inner: {
          type: 'object',
          title: 'Inner Group',
          properties: {
            field: {
              type: 'string',
              title: 'Field',
            },
          },
        },
      },
    }

    const parsed = parseSchema(schema) as GroupNode

    const screen = await render(
      <DefaultGroupTemplate node={parsed}>
        <div>Nested Content</div>
      </DefaultGroupTemplate>
    )

    await expect.element(screen.getByText('Outer Group')).toBeInTheDocument()
    await expect.element(screen.getByText('Nested Content')).toBeInTheDocument()
  })

  it('should render with empty children', async () => {
    const schema: JSONSchema = {
      type: 'object',
      title: 'Empty Group',
      properties: {},
    }

    const parsed = parseSchema(schema) as GroupNode

    const screen = await render(
      <DefaultGroupTemplate node={parsed}>{null}</DefaultGroupTemplate>
    )

    const fieldset = screen.container.querySelector('fieldset')
    expect(fieldset).toBeDefined()
    await expect.element(screen.getByText('Empty Group')).toBeInTheDocument()
  })
})
