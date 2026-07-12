import { describe, it, expect } from 'vitest'
import type { GroupNode } from '@jsonschema-form/core'
import { jsonSchemaToTree } from './jsonSchemaToTree'
import type { JSONSchema } from './types'
// The field control is a single discriminated slot now (ADR 029 §5, v60); these
// shared helpers narrow `control.kind` to reach archetype-specific attrs/options.
import { inputCtl, selectCtl, choicegroupCtl } from './controlTestUtils'
import { submitWith } from './submitTestUtils'

describe('jsonSchemaToTree', () => {
  describe('basic object schemas', () => {
    it('parses a simple object schema with one field', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
        },
      }

      const form = jsonSchemaToTree(schema)

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

      const form = jsonSchemaToTree(schema)

      expect(form.children).toHaveLength(3)
      expect(form.getAllFields()).toHaveLength(3)
    })

    it('throws error for boolean schemas', () => {
      expect(() => jsonSchemaToTree(true)).toThrow(
        'Boolean schemas are not yet supported'
      )
      expect(() => jsonSchemaToTree(false)).toThrow(
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

      const form = jsonSchemaToTree(schema)
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

      const form = jsonSchemaToTree(schema)
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

      const form = jsonSchemaToTree(schema)
      const nameField = form.getField('name')
      const emailField = form.getField('email')

      expect(nameField?.facts.constraints.required).toBe(true)
      expect(emailField?.facts.constraints.required).toBe(false)
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

      const form = jsonSchemaToTree(schema)
      const field = form.getField('name')

      expect(inputCtl(field).attrs.type).toBe('text')
    })

    it('generates email input type for email format', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
        },
      }

      const form = jsonSchemaToTree(schema)
      const field = form.getField('email')

      expect(inputCtl(field).attrs.type).toBe('email')
    })

    it('generates number input type for numbers', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          age: { type: 'number' },
        },
      }

      const form = jsonSchemaToTree(schema)
      const field = form.getField('age')

      expect(inputCtl(field).attrs.type).toBe('number')
    })

    it('generates checkbox input type for booleans', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          subscribe: { type: 'boolean' },
        },
      }

      const form = jsonSchemaToTree(schema)
      const field = form.getField('subscribe')

      expect(inputCtl(field).attrs.type).toBe('checkbox')
    })

    it('includes required attribute for required fields', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      }

      const form = jsonSchemaToTree(schema)
      const field = form.getField('name')

      expect(inputCtl(field).attrs.required).toBe(true)
    })

    it('includes min/max attributes for number constraints', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          age: { type: 'number', minimum: 0, maximum: 120 },
        },
      }

      const form = jsonSchemaToTree(schema)
      const field = form.getField('age')

      expect(inputCtl(field).attrs.min).toBe(0)
      expect(inputCtl(field).attrs.max).toBe(120)
    })

    it('includes minLength/maxLength for string constraints', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 20 },
        },
      }

      const form = jsonSchemaToTree(schema)
      const field = form.getField('username')

      expect(inputCtl(field).attrs.minLength).toBe(3)
      expect(inputCtl(field).attrs.maxLength).toBe(20)
    })

    it('includes pattern attribute', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          zipcode: { type: 'string', pattern: '^[0-9]{5}$' },
        },
      }

      const form = jsonSchemaToTree(schema)
      const field = form.getField('zipcode')

      expect(inputCtl(field).attrs.pattern).toBe('^[0-9]{5}$')
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

      const form = jsonSchemaToTree(schema)

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

      const form = jsonSchemaToTree(schema)
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

      const form = jsonSchemaToTree(schema)
      const street = form.getField('address.street')
      const city = form.getField('address.city')

      expect(street?.facts.constraints.required).toBe(true)
      expect(city?.facts.constraints.required).toBe(false)
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

      const form = jsonSchemaToTree(schema)
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

      const form = jsonSchemaToTree(schema)
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

      const form = jsonSchemaToTree(schema)
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

      const form = jsonSchemaToTree(schema)
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

      const form = jsonSchemaToTree(schema)
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

      const form = jsonSchemaToTree(schema)
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

      const form = jsonSchemaToTree(schema)
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

      const form = jsonSchemaToTree(schema)
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

      const form = jsonSchemaToTree(schema)
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

      const form = jsonSchemaToTree(schema)
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

      const form = jsonSchemaToTree(schema)
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

      const form = jsonSchemaToTree(schema)
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

      const form = jsonSchemaToTree(schema)
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

        const form = jsonSchemaToTree(schema)
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

        const form = jsonSchemaToTree(schema)
        const field = form.getField('name')

        expect(field?.parts.label).toEqual({
          text: 'Full Name',
          attrs: {
            id: 'name-label',
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

        const form = jsonSchemaToTree(schema)
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

        const form = jsonSchemaToTree(schema)
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

        const form = jsonSchemaToTree(schema)
        const field = form.getField('age')

        expect(inputCtl(field)).toEqual({
          kind: 'input',
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

        const form = jsonSchemaToTree(schema)
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

        const form = jsonSchemaToTree(schema)
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

        const form = jsonSchemaToTree(schema)
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

        const form = jsonSchemaToTree(schema)
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

      const form = jsonSchemaToTree(schema)
      const field = form.getField('color')

      expect(field?.nodeType).toBe('field')
      // 3 options (≤ threshold) → radio by default (bd cm7); the widget heuristic
      // itself is unit-tested in present.test.ts. Here we assert the parser's job:
      // enum → neutral choices, independent of which control renders them.
      expect(field?.widget).toBe('radio')
      expect(field?.parts.label.text).toBe('Favorite Color')
    })

    it('extracts neutral choices from an enum', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          size: {
            type: 'string',
            enum: ['small', 'medium', 'large'],
          },
        },
      }

      const form = jsonSchemaToTree(schema)
      const field = form.getField('size')

      expect(field?.facts.choices).toEqual([
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

      const form = jsonSchemaToTree(schema)
      const field = form.getField('size')

      expect(field?.facts.choices).toEqual([
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

      const form = jsonSchemaToTree(schema)
      const field = form.getField('status')

      expect(field?.widget).toBe('radio')
      expect(field?.facts.choices).toEqual([
        { value: 'draft', label: 'draft' },
        { value: 'published', label: 'Published' },
        { value: 'archived', label: 'archived' },
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

      const form = jsonSchemaToTree(schema)
      const field = form.getField('country')

      expect(field?.facts.constraints.required).toBe(true)
      // 3 options → radio group; `required` lands on each radio input.
      expect(choicegroupCtl(field).options[0].attrs.required).toBe(true)
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

      const form = jsonSchemaToTree(schema)
      const allFields = form.getAllFields()

      expect(allFields).toHaveLength(4)
      expect(form.getField('name')?.widget).toBe('input')
      expect(form.getField('size')?.widget).toBe('radio')
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

      const form = jsonSchemaToTree(schema)
      const methodField = form.getField('shipping.method')
      const priorityField = form.getField('shipping.priority')

      expect(methodField?.widget).toBe('radio')
      expect(methodField?.facts.constraints.required).toBe(true)
      expect(methodField?.facts.choices).toHaveLength(3)
      expect(methodField?.facts.choices?.[0].label).toBe('Standard (5-7 days)')
      expect(priorityField?.widget).toBe('input')
    })

    it('includes select part with id and name in parts API', () => {
      // 6 options (> threshold) so the default lands on `select` and we can pin the
      // select control shape here (the radio/checkbox shapes live in present.test.ts).
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['a', 'b', 'c', 'd', 'e', 'f'],
            title: 'Status',
          },
        },
        required: ['status'],
      }

      const form = jsonSchemaToTree(schema)
      const field = form.getField('status')

      expect(selectCtl(field)).toEqual({
        kind: 'select',
        attrs: {
          id: 'status',
          name: 'status',
          required: true,
        },
        options: [
          { value: 'a', label: 'a' },
          { value: 'b', label: 'b' },
          { value: 'c', label: 'c' },
          { value: 'd', label: 'd' },
          { value: 'e', label: 'e' },
          { value: 'f', label: 'f' },
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

      const form = jsonSchemaToTree(schema)
      const field = form.getField('field')

      expect(field?.widget).toBe('input')
      expect(field?.parts.control.kind).toBe('input')
    })

    it('select widgets expose a single select control (ADR 029 §5, v60)', () => {
      // 6 options (> threshold) → select by default.
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          color: {
            type: 'string',
            enum: ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow'],
          },
        },
      }

      const form = jsonSchemaToTree(schema)
      const field = form.getField('color')

      // Widget is the resolved name; the render archetype is `control.kind` — the
      // only discriminant. There are no longer per-widget `input`/`select` keys.
      expect(field?.widget).toBe('select')
      expect(field?.parts.control.kind).toBe('select')
      expect(Object.keys(field?.parts ?? {})).not.toContain('input')
    })

    it('input widgets expose a single input control (ADR 029 §5, v60)', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      }

      const form = jsonSchemaToTree(schema)
      const field = form.getField('name')

      expect(field?.widget).toBe('input')
      expect(field?.parts.control.kind).toBe('input')
      expect(Object.keys(field?.parts ?? {})).not.toContain('select')
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

      const form = jsonSchemaToTree(schema)
      const field = form.getField('terms')

      expect(field?.nodeType).toBe('field')
      expect(field?.parts.label.text).toBe('Accept Terms')
      expect(field?.parts.description?.text).toBe(
        'I agree to the terms and conditions'
      )
      expect(inputCtl(field).attrs.type).toBe('checkbox')
    })

    it('handles required boolean fields', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          terms: { type: 'boolean', title: 'Accept Terms' },
        },
        required: ['terms'],
      }

      const form = jsonSchemaToTree(schema)
      const field = form.getField('terms')

      expect(field?.facts.constraints.required).toBe(true)
      expect(inputCtl(field).attrs.required).toBe(true)
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

      const form = jsonSchemaToTree(schema)
      const allFields = form.getAllFields()

      expect(allFields).toHaveLength(4)
      expect(inputCtl(form.getField('name')).attrs.type).toBe('text')
      expect(inputCtl(form.getField('age')).attrs.type).toBe('number')
      expect(inputCtl(form.getField('subscribe')).attrs.type).toBe('checkbox')
      expect(inputCtl(form.getField('terms')).attrs.type).toBe('checkbox')
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

      const form = jsonSchemaToTree(schema)
      const field = form.getField('notifications')

      expect(inputCtl(field)).toEqual({
        kind: 'input',
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
          id: 'notifications-label',
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

      const form = jsonSchemaToTree(schema)
      const emailField = form.getField('preferences.emailNotifications')
      const smsField = form.getField('preferences.smsNotifications')

      expect(inputCtl(emailField).attrs.type).toBe('checkbox')
      expect(emailField?.facts.constraints.required).toBe(true)
      expect(inputCtl(smsField).attrs.type).toBe('checkbox')
      expect(smsField?.facts.constraints.required).toBe(false)
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

      const form = jsonSchemaToTree(schema)
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

      const form = jsonSchemaToTree(schema)
      const addressNode = form.children.find(
        (child) => child.path === 'address'
      )

      expect(() => {
        if (addressNode?.isGroup) {
          addressNode.submit(() => {})
        }
      }).toThrow('submit() can only be called on root GroupNode')
    })

    it('ensures multiselect fields always return arrays (single value)', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          skills: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['JavaScript', 'TypeScript', 'React'],
            },
          },
        },
      }

      const form = jsonSchemaToTree(schema)
      let submittedData: Record<string, unknown> | null = null
      const handleSubmit = form.submit((data) => {
        submittedData = data
      })

      // Simulate form submission with a single selected value
      const mockFormData = new Map([['skills', 'JavaScript']])
      const mockEvent = {
        preventDefault: () => {},
        currentTarget: {
          entries: () => mockFormData.entries(),
        } as unknown as HTMLFormElement,
      }

      // Mock FormData
      const originalFormData = globalThis.FormData
      globalThis.FormData = class MockFormData {
        entries() {
          return mockFormData.entries()
        }
      } as unknown as typeof FormData

      handleSubmit(
        mockEvent as {
          preventDefault(): void
          currentTarget: EventTarget | null
        }
      )

      globalThis.FormData = originalFormData

      expect(submittedData).toEqual({
        skills: ['JavaScript'], // Should be array, not single value
      })
    })

    it('ensures multiselect fields return arrays (multiple values)', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          skills: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['JavaScript', 'TypeScript', 'React'],
            },
          },
        },
      }

      const form = jsonSchemaToTree(schema)
      let submittedData: Record<string, unknown> | null = null
      const handleSubmit = form.submit((data) => {
        submittedData = data
      })

      // Simulate form submission with multiple selected values.
      // Real FormData is a multimap (duplicate keys allowed); a JS Map is not,
      // so back the mock with an array of [key, value] pairs to preserve both.
      const mockFormData: Array<[string, string]> = [
        ['skills', 'JavaScript'],
        ['skills', 'TypeScript'],
      ]
      const mockEvent = {
        preventDefault: () => {},
        currentTarget: {
          entries: () => mockFormData.values(),
        } as unknown as HTMLFormElement,
      }

      // Mock FormData
      const originalFormData = globalThis.FormData
      globalThis.FormData = class MockFormData {
        entries() {
          return mockFormData.values()
        }
      } as unknown as typeof FormData

      handleSubmit(
        mockEvent as {
          preventDefault(): void
          currentTarget: EventTarget | null
        }
      )

      globalThis.FormData = originalFormData

      expect(submittedData).toEqual({
        skills: ['JavaScript', 'TypeScript'], // Should be array
      })
    })

    it('ensures multiselect fields with oneOf return arrays (single value)', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          colors: {
            type: 'array',
            items: {
              oneOf: [
                { const: 'red', title: 'Red' },
                { const: 'blue', title: 'Blue' },
                { const: 'green', title: 'Green' },
              ],
            },
          },
        },
      }

      const form = jsonSchemaToTree(schema)
      let submittedData: Record<string, unknown> | null = null
      const handleSubmit = form.submit((data) => {
        submittedData = data
      })

      // Simulate form submission with a single selected value from oneOf
      const mockFormData = new Map([['colors', 'red']])
      const mockEvent = {
        preventDefault: () => {},
        currentTarget: {
          entries: () => mockFormData.entries(),
        } as unknown as HTMLFormElement,
      }

      // Mock FormData
      const originalFormData = globalThis.FormData
      globalThis.FormData = class MockFormData {
        entries() {
          return mockFormData.entries()
        }
      } as unknown as typeof FormData

      handleSubmit(
        mockEvent as {
          preventDefault(): void
          currentTarget: EventTarget | null
        }
      )

      globalThis.FormData = originalFormData

      expect(submittedData).toEqual({
        colors: ['red'], // Should be array, not single value
      })
    })

    it('multiselect fields with no selections do not appear in submitted data', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          skills: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['JavaScript', 'TypeScript', 'React'],
            },
          },
        },
      }

      const form = jsonSchemaToTree(schema)
      let submittedData: Record<string, unknown> | null = null
      const handleSubmit = form.submit((data) => {
        submittedData = data
      })

      // Simulate form submission with no multiselect values (field not in FormData)
      const mockFormData = new Map([['name', 'John']])
      const mockEvent = {
        preventDefault: () => {},
        currentTarget: {
          entries: () => mockFormData.entries(),
        } as unknown as HTMLFormElement,
      }

      // Mock FormData
      const originalFormData = globalThis.FormData
      globalThis.FormData = class MockFormData {
        entries() {
          return mockFormData.entries()
        }
      } as unknown as typeof FormData

      handleSubmit(
        mockEvent as {
          preventDefault(): void
          currentTarget: EventTarget | null
        }
      )

      globalThis.FormData = originalFormData

      // When no values are selected, the field doesn't appear in FormData
      // So it won't be in the submitted data (not even as empty array)
      expect(submittedData).toEqual({
        name: 'John',
      })
    })

    it('omits empty string fields so required validation can fail on absence', () => {
      const schema: JSONSchema = {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          nickname: { type: 'string' },
        },
      }

      const form = jsonSchemaToTree(schema)
      let submittedData: Record<string, unknown> | null = null
      const handleSubmit = form.submit((data) => {
        submittedData = data
      })

      const mockFormData = new Map([
        ['name', ''],
        ['nickname', ''],
      ])
      const mockEvent = {
        preventDefault: () => {},
        currentTarget: {
          entries: () => mockFormData.entries(),
        } as unknown as HTMLFormElement,
      }

      const originalFormData = globalThis.FormData
      globalThis.FormData = class MockFormData {
        entries() {
          return mockFormData.entries()
        }
      } as unknown as typeof FormData

      handleSubmit(
        mockEvent as {
          preventDefault(): void
          currentTarget: EventTarget | null
        }
      )

      globalThis.FormData = originalFormData

      expect(submittedData).toEqual({})
    })

    it('preserves filled required string fields unchanged', () => {
      const schema: JSONSchema = {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
        },
      }

      const form = jsonSchemaToTree(schema)
      let submittedData: Record<string, unknown> | null = null
      const handleSubmit = form.submit((data) => {
        submittedData = data
      })

      const mockFormData = new Map([['name', 'Jane']])
      const mockEvent = {
        preventDefault: () => {},
        currentTarget: {
          entries: () => mockFormData.entries(),
        } as unknown as HTMLFormElement,
      }

      const originalFormData = globalThis.FormData
      globalThis.FormData = class MockFormData {
        entries() {
          return mockFormData.entries()
        }
      } as unknown as typeof FormData

      handleSubmit(
        mockEvent as {
          preventDefault(): void
          currentTarget: EventTarget | null
        }
      )

      globalThis.FormData = originalFormData

      expect(submittedData).toEqual({ name: 'Jane' })
    })

    it('preserves empty string elements in dynamic arrays', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          hobbies: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      }

      const form = jsonSchemaToTree(schema)
      let submittedData: Record<string, unknown> | null = null
      const handleSubmit = form.submit((data) => {
        submittedData = data
      })

      const mockFormData = new Map([
        ['hobbies.0', ''],
        ['hobbies.1', 'coding'],
      ])
      const mockEvent = {
        preventDefault: () => {},
        currentTarget: {
          entries: () => mockFormData.entries(),
        } as unknown as HTMLFormElement,
      }

      const originalFormData = globalThis.FormData
      globalThis.FormData = class MockFormData {
        entries() {
          return mockFormData.entries()
        }
      } as unknown as typeof FormData

      handleSubmit(
        mockEvent as {
          preventDefault(): void
          currentTarget: EventTarget | null
        }
      )

      globalThis.FormData = originalFormData

      expect(submittedData).toEqual({
        hobbies: ['', 'coding'],
      })
    })

    it('ensures dynamic array fields return arrays', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          hobbies: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
      }

      const form = jsonSchemaToTree(schema)
      let submittedData: Record<string, unknown> | null = null
      const handleSubmit = form.submit((data) => {
        submittedData = data
      })

      // Simulate form submission with array items
      const mockFormData = new Map([
        ['hobbies.0', 'reading'],
        ['hobbies.1', 'coding'],
      ])
      const mockEvent = {
        preventDefault: () => {},
        currentTarget: {
          entries: () => mockFormData.entries(),
        } as unknown as HTMLFormElement,
      }

      // Mock FormData
      const originalFormData = globalThis.FormData
      globalThis.FormData = class MockFormData {
        entries() {
          return mockFormData.entries()
        }
      } as unknown as typeof FormData

      handleSubmit(
        mockEvent as {
          preventDefault(): void
          currentTarget: EventTarget | null
        }
      )

      globalThis.FormData = originalFormData

      expect(submittedData).toEqual({
        hobbies: ['reading', 'coding'], // Should be array
      })
    })

    it('wraps a multiselect nested in an array item (single selection)', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          contacts: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                skills: {
                  type: 'array',
                  items: { type: 'string', enum: ['a', 'b'] },
                },
              },
            },
          },
        },
      }

      expect(submitWith(schema, [['contacts.0.skills', 'a']])).toEqual({
        contacts: [{ skills: ['a'] }],
      })
    })

    it('wraps a nested multiselect for a runtime item beyond minItems', () => {
      // minItems: 0 means the compiled tree has no items, yet a runtime-added
      // item's single selection must still submit as an array. Signatures are
      // derived from the item schema (getItem), so any index matches.
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          contacts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                skills: {
                  type: 'array',
                  items: { type: 'string', enum: ['a', 'b'] },
                },
              },
            },
          },
        },
      }

      expect(
        submitWith(schema, [
          ['contacts.0.name', 'x'],
          ['contacts.1.skills', 'a'],
        ])
      ).toEqual({
        contacts: [{ name: 'x' }, { skills: ['a'] }],
      })
    })

    it('leaves scalar fields and nested objects unchanged', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: {
            type: 'object',
            properties: { city: { type: 'string' } },
          },
        },
      }

      expect(
        submitWith(schema, [
          ['name', 'John'],
          ['address.city', 'Springfield'],
        ])
      ).toEqual({
        name: 'John',
        address: { city: 'Springfield' },
      })
    })

    it('does not turn dynamic-array object scalars into arrays', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          people: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' } },
            },
          },
        },
      }

      expect(submitWith(schema, [['people.0.name', 'Bob']])).toEqual({
        people: [{ name: 'Bob' }],
      })
    })

    it('keeps ADR 018 dense arrays dense (single survivor is a 1-element array)', () => {
      // After removing the first of two dynamic items, the survivor re-paths to
      // index 0 (dense). Submission must be a contiguous 1-element array.
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          contacts: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' } },
            },
          },
        },
      }

      expect(submitWith(schema, [['contacts.0.name', 'Bob']])).toEqual({
        contacts: [{ name: 'Bob' }],
      })
    })
  })

  describe('array fields - multiselect', () => {
    it('creates multiselect FieldNode for primitive array with enum', () => {
      // 6 options (> threshold) → multiselect by default; the checkbox-group shape
      // for small array enums is covered in present.test.ts.
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          skills: {
            type: 'array',
            title: 'Skills',
            items: {
              type: 'string',
              enum: [
                'JavaScript',
                'TypeScript',
                'React',
                'Vue',
                'Svelte',
                'Solid',
              ],
            },
          },
        },
      }

      const form = jsonSchemaToTree(schema)
      const skillsField = form.children.find((child) => child.path === 'skills')

      expect(skillsField?.nodeType).toBe('field')
      expect(skillsField?.isField).toBe(true)
      if (skillsField?.isField) {
        const field = skillsField
        expect(field.widget).toBe('multiselect')
        expect(selectCtl(field).attrs.multiple).toBe(true)
        expect(selectCtl(field).options).toHaveLength(6)
        expect(selectCtl(field).options[0]).toEqual({
          value: 'JavaScript',
          label: 'JavaScript',
        })
      }
    })

    it('creates multiselect FieldNode for primitive array with oneOf', () => {
      // 6 options (> threshold) → multiselect by default.
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          colors: {
            type: 'array',
            title: 'Favorite Colors',
            items: {
              oneOf: [
                { const: 'red', title: 'Red' },
                { const: 'blue', title: 'Blue' },
                { const: 'green', title: 'Green' },
                { const: 'cyan', title: 'Cyan' },
                { const: 'magenta', title: 'Magenta' },
                { const: 'yellow', title: 'Yellow' },
              ],
            },
          },
        },
      }

      const form = jsonSchemaToTree(schema)
      const colorsField = form.children.find((child) => child.path === 'colors')

      expect(colorsField?.nodeType).toBe('field')
      expect(colorsField?.isField).toBe(true)
      if (colorsField?.isField) {
        const field = colorsField
        expect(field.widget).toBe('multiselect')
        expect(selectCtl(field).options).toHaveLength(6)
        expect(selectCtl(field).options[0]).toEqual({
          value: 'red',
          label: 'Red',
        })
      }
    })

    it('respects minItems and maxItems for multiselect', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          skills: {
            type: 'array',
            minItems: 2,
            maxItems: 5,
            items: {
              type: 'string',
              enum: ['JavaScript', 'TypeScript', 'React'],
            },
          },
        },
      }

      const form = jsonSchemaToTree(schema)
      const skillsField = form.children.find((child) => child.path === 'skills')

      expect(skillsField?.nodeType).toBe('field')
      if (skillsField?.isField) {
        expect(skillsField.facts.constraints.minItems).toBe(2)
        expect(skillsField.facts.constraints.maxItems).toBe(5)
      }
    })
  })

  describe('array fields - dynamic arrays', () => {
    it('creates ArrayNode for object array', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          addresses: {
            type: 'array',
            title: 'Addresses',
            items: {
              type: 'object',
              properties: {
                street: { type: 'string', title: 'Street' },
                city: { type: 'string', title: 'City' },
              },
            },
          },
        },
      }

      const form = jsonSchemaToTree(schema)
      const addressesNode = form.children.find(
        (child) => child.path === 'addresses'
      )

      expect(addressesNode?.nodeType).toBe('array')
      expect(addressesNode?.widget).toBe('array')
      expect(addressesNode?.isArray).toBe(true)

      if (addressesNode?.isArray) {
        expect(addressesNode.parts.addButton.label).toBe('Add Addresses')
        expect(addressesNode.parts.label?.text).toBe('Addresses')
      }
    })

    it('respects minItems for ArrayNode', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          addresses: {
            type: 'array',
            minItems: 2,
            items: {
              type: 'object',
              properties: {
                street: { type: 'string' },
              },
            },
          },
        },
      }

      const form = jsonSchemaToTree(schema)
      const addressesNode = form.children.find(
        (child) => child.path === 'addresses'
      )

      expect(addressesNode?.isArray).toBe(true)
      if (addressesNode?.isArray) {
        expect(addressesNode.children).toHaveLength(2)
        expect(addressesNode.facts.constraints.minItems).toBe(2)
      }
    })

    it('creates ArrayItemNode children with correct paths', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          addresses: {
            type: 'array',
            minItems: 2,
            items: {
              type: 'object',
              properties: {
                street: { type: 'string' },
              },
            },
          },
        },
      }

      const form = jsonSchemaToTree(schema)
      const addressesNode = form.children.find(
        (child) => child.path === 'addresses'
      )

      if (addressesNode?.isArray) {
        expect(addressesNode.children[0].nodeType).toBe('arrayItem')
        expect(addressesNode.children[0].path).toBe('addresses.0')
        expect(addressesNode.children[1].path).toBe('addresses.1')
      }
    })

    it('ArrayNode.getItem creates new ArrayItemNode', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          hobbies: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
      }

      const form = jsonSchemaToTree(schema)
      const hobbiesNode = form.children.find(
        (child) => child.path === 'hobbies'
      )

      if (hobbiesNode?.isArray) {
        const newItem = hobbiesNode.getItem(5)
        expect(newItem.nodeType).toBe('arrayItem')
        expect(newItem.path).toBe('hobbies.5')
      }
    })

    it('handles nested arrays of primitives', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                tags: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['urgent', 'later', 'done'],
                  },
                },
              },
            },
          },
        },
      }

      const form = jsonSchemaToTree(schema)
      const todosNode = form.children.find((child) => child.path === 'todos')

      expect(todosNode?.isArray).toBe(true)
      if (todosNode?.isArray) {
        const item = todosNode.getItem(0)
        expect(item.children[0].isGroup).toBe(true)

        if (item.children[0].isGroup) {
          const tagsField = item.children[0].children.find(
            (c) => c.path === 'todos.0.tags'
          )
          expect(tagsField?.widget).toBe('checkboxes')
        }
      }
    })
  })

  describe('$ref / $defs local resolution', () => {
    it('produces the same tree as an inlined schema for $defs + $ref', () => {
      const inlined: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Full Name', minLength: 2 },
          email: { type: 'string', format: 'email', title: 'Email' },
        },
        required: ['name'],
      }

      const withRefs = {
        type: 'object',
        properties: {
          name: { $ref: '#/$defs/Name' },
          email: { $ref: '#/$defs/Email' },
        },
        required: ['name'],
        $defs: {
          Name: { type: 'string', title: 'Full Name', minLength: 2 },
          Email: { type: 'string', format: 'email', title: 'Email' },
        },
      }

      const inlinedTree = jsonSchemaToTree(inlined)
      const refTree = jsonSchemaToTree(withRefs)

      expect(refTree.toJSON()).toEqual(inlinedTree.toJSON())
    })

    it('supports legacy definitions', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          nickname: { $ref: '#/definitions/Nickname' },
        },
        definitions: {
          Nickname: { type: 'string', title: 'Nickname' },
        },
      }

      const form = jsonSchemaToTree(schema)
      const field = form.getField('nickname')

      expect(field?.parts.label.text).toBe('Nickname')
      expect(inputCtl(field).attrs.type).toBe('text')
    })

    it('resolves $ref inside array items', () => {
      const inlined: JSONSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            title: 'Tags',
            items: { type: 'string', enum: ['a', 'b', 'c'] },
          },
        },
      }

      const withRefs = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            title: 'Tags',
            items: { $ref: '#/$defs/Tag' },
          },
        },
        $defs: {
          Tag: { type: 'string', enum: ['a', 'b', 'c'] },
        },
      }

      const inlinedTree = jsonSchemaToTree(inlined)
      const refTree = jsonSchemaToTree(withRefs)

      expect(refTree.toJSON()).toEqual(inlinedTree.toJSON())
    })

    it('resolves transitive nested refs', () => {
      const schema = {
        type: 'object',
        properties: {
          street: { $ref: '#/$defs/Street' },
        },
        $defs: {
          Street: { $ref: '#/$defs/StreetName' },
          StreetName: { type: 'string', title: 'Street', minLength: 1 },
        },
      }

      const form = jsonSchemaToTree(schema)
      const field = form.getField('street')

      expect(field?.parts.label.text).toBe('Street')
      expect(field?.facts.constraints.minLength).toBe(1)
    })

    it('resolves refs to nested object schemas', () => {
      const inlined: JSONSchema = {
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

      const withRefs = {
        type: 'object',
        properties: {
          address: { $ref: '#/$defs/Address' },
        },
        $defs: {
          Address: {
            type: 'object',
            title: 'Address',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
            },
          },
        },
      }

      const inlinedTree = jsonSchemaToTree(inlined)
      const refTree = jsonSchemaToTree(withRefs)

      expect(refTree.toJSON()).toEqual(inlinedTree.toJSON())
    })

    it('shallow-merges $ref siblings over the resolved target', () => {
      const schema = {
        type: 'object',
        properties: {
          label: {
            $ref: '#/$defs/BaseString',
            title: 'Override Title',
          },
        },
        $defs: {
          BaseString: { type: 'string', title: 'Base Title' },
        },
      }

      const form = jsonSchemaToTree(schema)
      const field = form.getField('label')

      expect(field?.parts.label.text).toBe('Override Title')
    })

    it('throws on circular $ref chains without hanging', () => {
      const schema = {
        type: 'object',
        properties: {
          a: { $ref: '#/$defs/A' },
        },
        $defs: {
          A: { $ref: '#/$defs/B' },
          B: { $ref: '#/$defs/A' },
        },
      }

      expect(() => jsonSchemaToTree(schema)).toThrow(/Circular \$ref detected/)
    })

    it('throws on external $ref', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { $ref: 'https://example.com/schema.json#/definitions/Name' },
        },
      }

      expect(() => jsonSchemaToTree(schema)).toThrow(
        /External \$ref is not supported/
      )
    })

    it('resolves refs via properties pointer', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
          alias: { $ref: '#/properties/name' },
        },
      }

      const form = jsonSchemaToTree(schema)
      const aliasField = form.getField('alias')

      expect(aliasField?.parts.label.text).toBe('Name')
      expect(inputCtl(aliasField).attrs.type).toBe('text')
    })

    it('resolves JSON Pointer escape sequences in $defs keys', () => {
      const schema = {
        type: 'object',
        properties: {
          note: { $ref: '#/$defs/a~1b~0c' },
        },
        $defs: {
          'a/b~c': { type: 'string', title: 'Slash and tilde' },
        },
      }

      const form = jsonSchemaToTree(schema)
      const field = form.getField('note')

      expect(field?.parts.label.text).toBe('Slash and tilde')
    })

    it('throws when a local $ref target is missing', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          missing: { $ref: '#/$defs/DoesNotExist' },
        },
      }

      expect(() => jsonSchemaToTree(schema)).toThrow(/\$ref target not found/)
    })
  })
})
