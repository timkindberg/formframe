import { describe, it, expect } from 'vitest'
import { parseSchema } from './index'
import type { JSONSchema, GroupNode } from '../types'

describe('parseSchema', () => {
  describe('basic object schemas', () => {
    it('parses a simple object schema with one field', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
        },
      }

      const form = parseSchema(schema)

      expect(form.nodeType).toBe('group')
      expect(form.path).toBe('')
      expect(form.children).toHaveLength(1)
      expect(form.children[0].nodeType).toBe('field')
    })

    it('parses multiple fields', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
          age: { type: 'number' },
        },
      }

      const form = parseSchema(schema)

      expect(form.children).toHaveLength(3)
      expect(form.getAllFields()).toHaveLength(3)
    })

    it('throws error for boolean schemas', () => {
      expect(() => parseSchema(true)).toThrow(
        'Boolean schemas are not yet supported'
      )
      expect(() => parseSchema(false)).toThrow(
        'Boolean schemas are not yet supported'
      )
    })
  })

  describe('field metadata', () => {
    it('extracts title from schema', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Full Name' },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('name')

      expect(field?.parts.label.text).toBe('Full Name')
    })

    it('extracts description from schema', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          email: { type: 'string', description: 'Your email address' },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('email')

      expect(field?.parts.description?.text).toBe('Your email address')
    })

    it('marks required fields correctly', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['name'],
      }

      const form = parseSchema(schema)
      const nameField = form.getField('name')
      const emailField = form.getField('email')

      expect(nameField?.validation.required).toBe(true)
      expect(emailField?.validation.required).toBe(false)
    })
  })

  describe('HTML attributes', () => {
    it('generates correct input type for strings', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('name')

      expect(field?.parts.input?.attrs.type).toBe('text')
    })

    it('generates email input type for email format', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('email')

      expect(field?.parts.input?.attrs.type).toBe('email')
    })

    it('generates number input type for numbers', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          age: { type: 'number' },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('age')

      expect(field?.parts.input?.attrs.type).toBe('number')
    })

    it('generates checkbox input type for booleans', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          subscribe: { type: 'boolean' },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('subscribe')

      expect(field?.parts.input?.attrs.type).toBe('checkbox')
    })

    it('includes required attribute for required fields', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      }

      const form = parseSchema(schema)
      const field = form.getField('name')

      expect(field?.parts.input?.attrs.required).toBe(true)
    })

    it('includes min/max attributes for number constraints', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          age: { type: 'number', minimum: 0, maximum: 120 },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('age')

      expect(field?.parts.input?.attrs.min).toBe(0)
      expect(field?.parts.input?.attrs.max).toBe(120)
    })

    it('includes minLength/maxLength for string constraints', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 20 },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('username')

      expect(field?.parts.input?.attrs.minLength).toBe(3)
      expect(field?.parts.input?.attrs.maxLength).toBe(20)
    })

    it('includes pattern attribute', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          zipcode: { type: 'string', pattern: '^[0-9]{5}$' },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('zipcode')

      expect(field?.parts.input?.attrs.pattern).toBe('^[0-9]{5}$')
    })
  })

  describe('nested objects (groups)', () => {
    it('creates group nodes for nested objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          address: {
            type: 'object',
            title: 'Address',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
            },
          },
        },
      }

      const form = parseSchema(schema)

      expect(form.children).toHaveLength(1)
      expect(form.children[0].nodeType).toBe('group')

      const group = form.children[0] as GroupNode
      expect(group.parts.label?.text).toBe('Address')
      expect(group.children).toHaveLength(2)
    })

    it('uses dot notation for nested field paths', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
            },
          },
        },
      }

      const form = parseSchema(schema)
      const street = form.getField('address.street')
      const city = form.getField('address.city')

      expect(street?.path).toBe('address.street')
      expect(city?.path).toBe('address.city')
    })

    it('handles required fields in nested objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
            },
            required: ['street'],
          },
        },
      }

      const form = parseSchema(schema)
      const street = form.getField('address.street')
      const city = form.getField('address.city')

      expect(street?.validation.required).toBe(true)
      expect(city?.validation.required).toBe(false)
    })

    it('allows direct access to children on group nodes', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
            },
          },
        },
      }

      const form = parseSchema(schema)
      const group = form.children[0] as GroupNode

      expect(group.children).toHaveLength(2)
      expect(group.children[0].path).toBe('address.street')
    })

    it('getField works on any group node with relative paths', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
            },
          },
        },
      }

      const form = parseSchema(schema)
      const addressGroup = form.children[0] as GroupNode

      // Query relative to the group
      const street = addressGroup.getField('street')
      expect(street?.path).toBe('address.street')

      const city = addressGroup.getField('city')
      expect(city?.path).toBe('address.city')
    })
  })

  describe('tree traversal methods', () => {
    it('getField returns field by path', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
          email: { type: 'string', title: 'Email' },
        },
      }

      const form = parseSchema(schema)
      const nameField = form.getField('name')
      const emailField = form.getField('email')

      expect(nameField?.parts.label.text).toBe('Name')
      expect(emailField?.parts.label.text).toBe('Email')
    })

    it('getField returns undefined for non-existent path', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('nonexistent')

      expect(field).toBeUndefined()
    })

    it('getAllFields returns flat array of all fields', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
            },
          },
        },
      }

      const form = parseSchema(schema)
      const allFields = form.getAllFields()

      expect(allFields).toHaveLength(3)
      expect(allFields.map((f) => f.path)).toEqual([
        'name',
        'address.street',
        'address.city',
      ])
    })

    it('getAllFields only returns FieldNodes, not GroupNodes', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
            },
          },
        },
      }

      const form = parseSchema(schema)
      const allFields = form.getAllFields()

      expect(allFields.every((f) => f.nodeType === 'field')).toBe(true)
    })

    it('getAllFields from nested group only returns descendants, not siblings or parents', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
              country: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  name: { type: 'string' },
                },
              },
            },
          },
          phone: { type: 'string' },
        },
      }

      const form = parseSchema(schema)
      const addressGroup = form.children.find(
        (c) => c.path === 'address'
      ) as GroupNode

      // Get all fields from the address group
      const addressFields = addressGroup.getAllFields()

      // Should only include descendants of address (street, city, country.code, country.name)
      expect(addressFields).toHaveLength(4)
      expect(addressFields.map((f) => f.path).sort()).toEqual(
        [
          'address.city',
          'address.country.code',
          'address.country.name',
          'address.street',
        ].sort()
      )

      // Should NOT include siblings (name, email, phone)
      expect(addressFields.find((f) => f.path === 'name')).toBeUndefined()
      expect(addressFields.find((f) => f.path === 'email')).toBeUndefined()
      expect(addressFields.find((f) => f.path === 'phone')).toBeUndefined()
    })
  })

  describe('toJSON serialization', () => {
    it('serializes tree structure without circular references', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
        },
      }

      const form = parseSchema(schema)
      const json = form.toJSON()

      expect(() => JSON.stringify(json)).not.toThrow()
      expect(json).toHaveProperty('nodeType', 'group')
      expect(json).toHaveProperty('path', '')
      expect(json).toHaveProperty('children')
    })

    it('omits methods and schema from serialization', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
        },
      }

      const form = parseSchema(schema)
      const json = form.toJSON()
      const jsonString = JSON.stringify(json)

      expect(jsonString).not.toContain('getField')
      expect(jsonString).not.toContain('getAllFields')
      expect(jsonString).not.toContain('schema')
    })
  })

  describe('computed properties', () => {
    it('sets isRoot correctly', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
            },
          },
        },
      }

      const form = parseSchema(schema)
      const nameField = form.getField('name')
      const addressGroup = form.children.find((c) => c.path === 'address')

      expect(form.isRoot).toBe(true)
      expect(nameField?.isRoot).toBe(false)
      expect(addressGroup?.isRoot).toBe(false)
    })

    it('calculates depth correctly', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
            },
          },
        },
      }

      const form = parseSchema(schema)
      const nameField = form.getField('name')
      const streetField = form.getField('address.street')

      expect(form.depth).toBe(0)
      expect(nameField?.depth).toBe(1)
      expect(streetField?.depth).toBe(2)
    })

    it('provides label fallback (displayLabel logic baked into parts.label.text)', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Full Name' },
          email: { type: 'string' },
        },
      }

      const form = parseSchema(schema)
      const nameField = form.getField('name')
      const emailField = form.getField('email')

      // Root group only has label part if schema.title is present
      expect(form.parts.label).toBeUndefined()
      // Field with title uses title
      expect(nameField?.parts.label.text).toBe('Full Name')
      // Field without title falls back to path
      expect(emailField?.parts.label.text).toBe('email')
    })

    it('container key matches path', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
            },
          },
        },
      }

      const form = parseSchema(schema)
      const nameField = form.getField('name')
      const streetField = form.getField('address.street')

      // container.key should match the node's path
      expect(form.parts.container.key).toBe('')
      expect(nameField?.parts.container.key).toBe('name')
      expect(streetField?.parts.container.key).toBe('address.street')
    })
  })

  describe('parts API', () => {
    describe('field parts', () => {
      it('includes container part', () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        }

        const form = parseSchema(schema)
        const field = form.getField('name')

        expect(field?.parts.container).toEqual({
          key: 'name',
        })
      })

      it('includes label part with correct data', () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            name: { type: 'string', title: 'Full Name' },
          },
          required: ['name'],
        }

        const form = parseSchema(schema)
        const field = form.getField('name')

        expect(field?.parts.label).toEqual({
          text: 'Full Name',
          attrs: {
            for: 'name',
          },
          showRequired: true,
        })
      })

      it('includes description part when present', () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'Your email address' },
          },
        }

        const form = parseSchema(schema)
        const field = form.getField('email')

        expect(field?.parts.description).toEqual({
          text: 'Your email address',
        })
      })

      it('omits description part when not present', () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        }

        const form = parseSchema(schema)
        const field = form.getField('name')

        expect(field?.parts.description).toBeUndefined()
      })

      it('includes input part with id, name, and attrs', () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            age: { type: 'number', minimum: 0, maximum: 120 },
          },
        }

        const form = parseSchema(schema)
        const field = form.getField('age')

        expect(field?.parts.input).toEqual({
          attrs: {
            id: 'age',
            name: 'age',
            type: 'number',
            min: 0,
            max: 120,
          },
        })
      })
    })

    describe('group parts', () => {
      it('includes container part', () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' },
              },
            },
          },
        }

        const form = parseSchema(schema)
        const addressGroup = form.children.find(
          (c) => c.path === 'address'
        ) as GroupNode

        expect(addressGroup.parts.container).toEqual({
          key: 'address',
        })
      })

      it('includes label part when title present', () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            address: {
              type: 'object',
              title: 'Address Information',
              properties: {
                street: { type: 'string' },
              },
            },
          },
        }

        const form = parseSchema(schema)
        const addressGroup = form.children.find(
          (c) => c.path === 'address'
        ) as GroupNode

        expect(addressGroup.parts.label).toEqual({
          text: 'Address Information',
        })
      })

      it('omits label part when title not present', () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' },
              },
            },
          },
        }

        const form = parseSchema(schema)
        const addressGroup = form.children.find(
          (c) => c.path === 'address'
        ) as GroupNode

        expect(addressGroup.parts.label).toBeUndefined()
      })

      it('includes description part when present', () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            address: {
              type: 'object',
              description: 'Your mailing address',
              properties: {
                street: { type: 'string' },
              },
            },
          },
        }

        const form = parseSchema(schema)
        const addressGroup = form.children.find(
          (c) => c.path === 'address'
        ) as GroupNode

        expect(addressGroup.parts.description).toEqual({
          text: 'Your mailing address',
        })
      })
    })
  })

  describe('enum/select fields', () => {
    it('parses enum fields with string values', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          color: {
            type: 'string',
            enum: ['red', 'green', 'blue'],
            title: 'Favorite Color',
          },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('color')

      expect(field?.nodeType).toBe('field')
      expect(field?.widget).toBe('select')
      expect(field?.parts.label.text).toBe('Favorite Color')
    })

    it('generates select part with options from enum', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          size: {
            type: 'string',
            enum: ['small', 'medium', 'large'],
          },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('size')

      expect(field?.parts.select).toBeDefined()
      expect(field?.parts.select?.options).toEqual([
        { value: 'small', label: 'small' },
        { value: 'medium', label: 'medium' },
        { value: 'large', label: 'large' },
      ])
    })

    it('supports oneOf with const + title for custom option labels', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          size: {
            oneOf: [
              { const: 'sm', title: 'Small' },
              { const: 'md', title: 'Medium' },
              { const: 'lg', title: 'Large' },
            ],
          },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('size')

      expect(field?.parts.select?.options).toEqual([
        { value: 'sm', label: 'Small' },
        { value: 'md', label: 'Medium' },
        { value: 'lg', label: 'Large' },
      ])
    })

    it('oneOf without title falls back to const value as label', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          status: {
            oneOf: [
              { const: 'draft' },
              { const: 'published', title: 'Published' },
              { const: 'archived' },
            ],
          },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('status')

      expect(field?.widget).toBe('select')
      expect(field?.parts.select?.options).toEqual([
        { value: 'draft', label: 'draft' },
        { value: 'published', label: 'Published' },
        { value: 'archived', label: 'archived' },
      ])
    })

    it('handles enum fields with number values', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          rating: {
            type: 'number',
            enum: [1, 2, 3, 4, 5],
            title: 'Rating',
          },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('rating')

      expect(field?.widget).toBe('select')
      expect(field?.parts.select?.options).toEqual([
        { value: 1, label: '1' },
        { value: 2, label: '2' },
        { value: 3, label: '3' },
        { value: 4, label: '4' },
        { value: 5, label: '5' },
      ])
    })

    it('handles required enum fields', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          country: {
            type: 'string',
            enum: ['US', 'UK', 'CA'],
          },
        },
        required: ['country'],
      }

      const form = parseSchema(schema)
      const field = form.getField('country')

      expect(field?.validation.required).toBe(true)
      expect(field?.parts.select?.attrs.required).toBe(true)
      expect(field?.parts.label.showRequired).toBe(true)
    })

    it('works with mixed field types including enums', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
          size: { type: 'string', enum: ['S', 'M', 'L'], title: 'Size' },
          quantity: { type: 'number', title: 'Quantity' },
          inStock: { type: 'boolean', title: 'In Stock' },
        },
      }

      const form = parseSchema(schema)
      const allFields = form.getAllFields()

      expect(allFields).toHaveLength(4)
      expect(form.getField('name')?.widget).toBe('input')
      expect(form.getField('size')?.widget).toBe('select')
      expect(form.getField('quantity')?.widget).toBe('input')
      expect(form.getField('inStock')?.widget).toBe('input')
    })

    it('handles oneOf fields in nested objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          shipping: {
            type: 'object',
            title: 'Shipping',
            properties: {
              method: {
                oneOf: [
                  { const: 'standard', title: 'Standard (5-7 days)' },
                  { const: 'express', title: 'Express (2-3 days)' },
                  { const: 'overnight', title: 'Overnight' },
                ],
                title: 'Shipping Method',
              },
              priority: { type: 'boolean', title: 'Priority' },
            },
            required: ['method'],
          },
        },
      }

      const form = parseSchema(schema)
      const methodField = form.getField('shipping.method')
      const priorityField = form.getField('shipping.priority')

      expect(methodField?.widget).toBe('select')
      expect(methodField?.validation.required).toBe(true)
      expect(methodField?.parts.select?.options).toHaveLength(3)
      expect(methodField?.parts.select?.options[0].label).toBe(
        'Standard (5-7 days)'
      )
      expect(priorityField?.widget).toBe('input')
    })

    it('includes select part with id and name in parts API', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'inactive'],
            title: 'Status',
          },
        },
        required: ['status'],
      }

      const form = parseSchema(schema)
      const field = form.getField('status')

      expect(field?.parts.select).toEqual({
        attrs: {
          id: 'status',
          name: 'status',
          required: true,
        },
        options: [
          { value: 'active', label: 'active' },
          { value: 'inactive', label: 'inactive' },
        ],
      })
    })

    it('does not set widget to select if enum is empty', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: [],
          },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('field')

      expect(field?.widget).toBe('input')
      expect(field?.parts.select).toBeUndefined()
    })

    it('select widgets do not have input part', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          color: {
            type: 'string',
            enum: ['red', 'green', 'blue'],
          },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('color')

      expect(field?.widget).toBe('select')
      expect(field?.parts.select).toBeDefined()
      expect(field?.parts.input).toBeUndefined()
    })

    it('input widgets do not have select part', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('name')

      expect(field?.widget).toBe('input')
      expect(field?.parts.input).toBeDefined()
      expect(field?.parts.select).toBeUndefined()
    })
  })

  describe('boolean fields', () => {
    it('parses boolean fields with title and description', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          terms: {
            type: 'boolean',
            title: 'Accept Terms',
            description: 'I agree to the terms and conditions',
          },
        },
      }

      const form = parseSchema(schema)
      const field = form.getField('terms')

      expect(field?.nodeType).toBe('field')
      expect(field?.parts.label.text).toBe('Accept Terms')
      expect(field?.parts.description?.text).toBe(
        'I agree to the terms and conditions'
      )
      expect(field?.parts.input?.attrs.type).toBe('checkbox')
    })

    it('handles required boolean fields', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          terms: { type: 'boolean', title: 'Accept Terms' },
        },
        required: ['terms'],
      }

      const form = parseSchema(schema)
      const field = form.getField('terms')

      expect(field?.validation.required).toBe(true)
      expect(field?.parts.input?.attrs.required).toBe(true)
      expect(field?.parts.label.showRequired).toBe(true)
    })

    it('works with mixed field types including booleans', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
          age: { type: 'number', title: 'Age' },
          subscribe: { type: 'boolean', title: 'Subscribe to newsletter' },
          terms: { type: 'boolean', title: 'Accept terms' },
        },
      }

      const form = parseSchema(schema)
      const allFields = form.getAllFields()

      expect(allFields).toHaveLength(4)
      expect(form.getField('name')?.parts.input?.attrs.type).toBe('text')
      expect(form.getField('age')?.parts.input?.attrs.type).toBe('number')
      expect(form.getField('subscribe')?.parts.input?.attrs.type).toBe(
        'checkbox'
      )
      expect(form.getField('terms')?.parts.input?.attrs.type).toBe('checkbox')
    })

    it('includes boolean fields in parts API correctly', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          notifications: {
            type: 'boolean',
            title: 'Enable Notifications',
            description: 'Receive email notifications',
          },
        },
        required: ['notifications'],
      }

      const form = parseSchema(schema)
      const field = form.getField('notifications')

      expect(field?.parts.input).toEqual({
        attrs: {
          id: 'notifications',
          name: 'notifications',
          type: 'checkbox',
          required: true,
        },
      })

      expect(field?.parts.label).toEqual({
        text: 'Enable Notifications',
        attrs: {
          for: 'notifications',
        },
        showRequired: true,
      })

      expect(field?.parts.description).toEqual({
        text: 'Receive email notifications',
      })
    })

    it('handles boolean fields in nested objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          preferences: {
            type: 'object',
            title: 'Preferences',
            properties: {
              emailNotifications: {
                type: 'boolean',
                title: 'Email Notifications',
              },
              smsNotifications: { type: 'boolean', title: 'SMS Notifications' },
            },
            required: ['emailNotifications'],
          },
        },
      }

      const form = parseSchema(schema)
      const emailField = form.getField('preferences.emailNotifications')
      const smsField = form.getField('preferences.smsNotifications')

      expect(emailField?.parts.input?.attrs.type).toBe('checkbox')
      expect(emailField?.validation.required).toBe(true)
      expect(smsField?.parts.input?.attrs.type).toBe('checkbox')
      expect(smsField?.validation.required).toBe(false)
    })
  })

  describe('submit handler', () => {
    it('creates a submit handler on root nodes', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      }

      const form = parseSchema(schema)
      const handler = form.submit(() => {})

      expect(typeof handler).toBe('function')
    })

    it('throws error when called on non-root nodes', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
            },
          },
        },
      }

      const form = parseSchema(schema)
      const addressNode = form.children.find(
        (child) => child.path === 'address'
      )

      expect(() => {
        addressNode?.isGroup() && addressNode.submit(() => {})
      }).toThrow('submit() can only be called on root GroupNode')
    })
  })
})
