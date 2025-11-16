import { describe, it, expect } from 'vitest'
import { parseSchema } from '../src/parser'
import type { JSONSchema, GroupNode } from '../src/types'

describe('parseSchema', () => {
  describe('basic object schemas', () => {
    it('parses a simple object schema with one field', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' }
        }
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
          age: { type: 'number' }
        }
      }

      const form = parseSchema(schema)

      expect(form.children).toHaveLength(3)
      expect(form.getAllFields()).toHaveLength(3)
    })

    it('throws error for boolean schemas', () => {
      expect(() => parseSchema(true)).toThrow('Boolean schemas are not yet supported')
      expect(() => parseSchema(false)).toThrow('Boolean schemas are not yet supported')
    })
  })

  describe('field metadata', () => {
    it('extracts title from schema', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Full Name' }
        }
      }

      const form = parseSchema(schema)
      const field = form.getField('name')

      expect(field?.label).toBe('Full Name')
    })

    it('extracts description from schema', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          email: { type: 'string', description: 'Your email address' }
        }
      }

      const form = parseSchema(schema)
      const field = form.getField('email')

      expect(field?.description).toBe('Your email address')
    })

    it('marks required fields correctly', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' }
        },
        required: ['name']
      }

      const form = parseSchema(schema)
      const nameField = form.getField('name')
      const emailField = form.getField('email')

      expect(nameField?.required).toBe(true)
      expect(emailField?.required).toBe(false)
    })
  })

  describe('HTML attributes', () => {
    it('generates correct input type for strings', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' }
        }
      }

      const form = parseSchema(schema)
      const field = form.getField('name')

      expect(field?.attrs.type).toBe('text')
    })

    it('generates email input type for email format', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' }
        }
      }

      const form = parseSchema(schema)
      const field = form.getField('email')

      expect(field?.attrs.type).toBe('email')
    })

    it('generates number input type for numbers', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          age: { type: 'number' }
        }
      }

      const form = parseSchema(schema)
      const field = form.getField('age')

      expect(field?.attrs.type).toBe('number')
    })

    it('generates checkbox input type for booleans', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          subscribe: { type: 'boolean' }
        }
      }

      const form = parseSchema(schema)
      const field = form.getField('subscribe')

      expect(field?.attrs.type).toBe('checkbox')
    })

    it('includes required attribute for required fields', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' }
        },
        required: ['name']
      }

      const form = parseSchema(schema)
      const field = form.getField('name')

      expect(field?.attrs.required).toBe(true)
    })

    it('includes min/max attributes for number constraints', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          age: { type: 'number', minimum: 0, maximum: 120 }
        }
      }

      const form = parseSchema(schema)
      const field = form.getField('age')

      expect(field?.attrs.min).toBe(0)
      expect(field?.attrs.max).toBe(120)
    })

    it('includes minLength/maxLength for string constraints', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 20 }
        }
      }

      const form = parseSchema(schema)
      const field = form.getField('username')

      expect(field?.attrs.minLength).toBe(3)
      expect(field?.attrs.maxLength).toBe(20)
    })

    it('includes pattern attribute', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          zipcode: { type: 'string', pattern: '^[0-9]{5}$' }
        }
      }

      const form = parseSchema(schema)
      const field = form.getField('zipcode')

      expect(field?.attrs.pattern).toBe('^[0-9]{5}$')
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
              city: { type: 'string' }
            }
          }
        }
      }

      const form = parseSchema(schema)

      expect(form.children).toHaveLength(1)
      expect(form.children[0].nodeType).toBe('group')
      
      const group = form.children[0] as GroupNode
      expect(group.label).toBe('Address')
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
              city: { type: 'string' }
            }
          }
        }
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
              city: { type: 'string' }
            },
            required: ['street']
          }
        }
      }

      const form = parseSchema(schema)
      const street = form.getField('address.street')
      const city = form.getField('address.city')

      expect(street?.required).toBe(true)
      expect(city?.required).toBe(false)
    })

    it('allows direct access to children on group nodes', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' }
            }
          }
        }
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
              city: { type: 'string' }
            }
          }
        }
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
          email: { type: 'string', title: 'Email' }
        }
      }

      const form = parseSchema(schema)
      const nameField = form.getField('name')
      const emailField = form.getField('email')

      expect(nameField?.label).toBe('Name')
      expect(emailField?.label).toBe('Email')
    })

    it('getField returns undefined for non-existent path', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' }
        }
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
              city: { type: 'string' }
            }
          }
        }
      }

      const form = parseSchema(schema)
      const allFields = form.getAllFields()

      expect(allFields).toHaveLength(3)
      expect(allFields.map(f => f.path)).toEqual(['name', 'address.street', 'address.city'])
    })

    it('getAllFields only returns FieldNodes, not GroupNodes', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' }
            }
          }
        }
      }

      const form = parseSchema(schema)
      const allFields = form.getAllFields()

      expect(allFields.every(f => f.nodeType === 'field')).toBe(true)
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
                  name: { type: 'string' }
                }
              }
            }
          },
          phone: { type: 'string' }
        }
      }

      const form = parseSchema(schema)
      const addressGroup = form.children.find(c => c.path === 'address') as GroupNode

      // Get all fields from the address group
      const addressFields = addressGroup.getAllFields()

      // Should only include descendants of address (street, city, country.code, country.name)
      expect(addressFields).toHaveLength(4)
      expect(addressFields.map(f => f.path).sort()).toEqual([
        'address.city',
        'address.country.code',
        'address.country.name',
        'address.street'
      ].sort())

      // Should NOT include siblings (name, email, phone)
      expect(addressFields.find(f => f.path === 'name')).toBeUndefined()
      expect(addressFields.find(f => f.path === 'email')).toBeUndefined()
      expect(addressFields.find(f => f.path === 'phone')).toBeUndefined()
    })
  })

  describe('toJSON serialization', () => {
    it('serializes tree structure without circular references', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' }
        }
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
          name: { type: 'string', title: 'Name' }
        }
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
              street: { type: 'string' }
            }
          }
        }
      }

      const form = parseSchema(schema)
      const nameField = form.getField('name')
      const addressGroup = form.children.find(c => c.path === 'address')

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
              street: { type: 'string' }
            }
          }
        }
      }

      const form = parseSchema(schema)
      const nameField = form.getField('name')
      const streetField = form.getField('address.street')

      expect(form.depth).toBe(0)
      expect(nameField?.depth).toBe(1)
      expect(streetField?.depth).toBe(2)
    })

    it('provides displayLabel fallback', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Full Name' },
          email: { type: 'string' }
        }
      }

      const form = parseSchema(schema)
      const nameField = form.getField('name')
      const emailField = form.getField('email')

      expect(form.displayLabel).toBe('root')
      expect(nameField?.displayLabel).toBe('Full Name')
      expect(emailField?.displayLabel).toBe('email')
    })

    it('extracts key from path', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' }
            }
          }
        }
      }

      const form = parseSchema(schema)
      const nameField = form.getField('name')
      const streetField = form.getField('address.street')

      expect(form.key).toBe('')
      expect(nameField?.key).toBe('name')
      expect(streetField?.key).toBe('street')
    })

    it('computes parentPath correctly', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' }
            }
          }
        }
      }

      const form = parseSchema(schema)
      const nameField = form.getField('name')
      const addressGroup = form.children.find(c => c.path === 'address') as GroupNode
      const streetField = form.getField('address.street')

      expect(form.parentPath).toBe('')
      expect(nameField?.parentPath).toBe('')
      expect(addressGroup?.parentPath).toBe('')
      expect(streetField?.parentPath).toBe('address')
    })
  })

  describe('parts API', () => {
    describe('field parts', () => {
      it('includes container part', () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' }
          }
        }

        const form = parseSchema(schema)
        const field = form.getField('name')

        expect(field?.parts.container).toEqual({
          key: 'name'
        })
      })

      it('includes label part with correct data', () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            name: { type: 'string', title: 'Full Name' }
          },
          required: ['name']
        }

        const form = parseSchema(schema)
        const field = form.getField('name')

        expect(field?.parts.label).toEqual({
          text: 'Full Name',
          htmlFor: 'name',
          showRequired: true
        })
      })

      it('includes description part when present', () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'Your email address' }
          }
        }

        const form = parseSchema(schema)
        const field = form.getField('email')

        expect(field?.parts.description).toEqual({
          text: 'Your email address'
        })
      })

      it('omits description part when not present', () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' }
          }
        }

        const form = parseSchema(schema)
        const field = form.getField('name')

        expect(field?.parts.description).toBeUndefined()
      })

      it('includes input part with id, name, and attrs', () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            age: { type: 'number', minimum: 0, maximum: 120 }
          }
        }

        const form = parseSchema(schema)
        const field = form.getField('age')

        expect(field?.parts.input).toEqual({
          id: 'age',
          name: 'age',
          attrs: {
            type: 'number',
            min: 0,
            max: 120
          }
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
                street: { type: 'string' }
              }
            }
          }
        }

        const form = parseSchema(schema)
        const addressGroup = form.children.find(c => c.path === 'address') as GroupNode

        expect(addressGroup.parts.container).toEqual({
          key: 'address'
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
                street: { type: 'string' }
              }
            }
          }
        }

        const form = parseSchema(schema)
        const addressGroup = form.children.find(c => c.path === 'address') as GroupNode

        expect(addressGroup.parts.label).toEqual({
          text: 'Address Information'
        })
      })

      it('omits label part when title not present', () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' }
              }
            }
          }
        }

        const form = parseSchema(schema)
        const addressGroup = form.children.find(c => c.path === 'address') as GroupNode

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
                street: { type: 'string' }
              }
            }
          }
        }

        const form = parseSchema(schema)
        const addressGroup = form.children.find(c => c.path === 'address') as GroupNode

        expect(addressGroup.parts.description).toEqual({
          text: 'Your mailing address'
        })
      })

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
            description: 'I agree to the terms and conditions'
          }
        }
      }

      const form = parseSchema(schema)
      const field = form.getField('terms')

      expect(field?.nodeType).toBe('field')
      expect(field?.label).toBe('Accept Terms')
      expect(field?.description).toBe('I agree to the terms and conditions')
      expect(field?.attrs.type).toBe('checkbox')
    })

    it('handles required boolean fields', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          terms: { type: 'boolean', title: 'Accept Terms' }
        },
        required: ['terms']
      }

      const form = parseSchema(schema)
      const field = form.getField('terms')

      expect(field?.required).toBe(true)
      expect(field?.attrs.required).toBe(true)
      expect(field?.parts.label.showRequired).toBe(true)
    })

    it('works with mixed field types including booleans', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
          age: { type: 'number', title: 'Age' },
          subscribe: { type: 'boolean', title: 'Subscribe to newsletter' },
          terms: { type: 'boolean', title: 'Accept terms' }
        }
      }

      const form = parseSchema(schema)
      const allFields = form.getAllFields()

      expect(allFields).toHaveLength(4)
      expect(form.getField('name')?.attrs.type).toBe('text')
      expect(form.getField('age')?.attrs.type).toBe('number')
      expect(form.getField('subscribe')?.attrs.type).toBe('checkbox')
      expect(form.getField('terms')?.attrs.type).toBe('checkbox')
    })

    it('includes boolean fields in parts API correctly', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          notifications: { 
            type: 'boolean', 
            title: 'Enable Notifications',
            description: 'Receive email notifications'
          }
        },
        required: ['notifications']
      }

      const form = parseSchema(schema)
      const field = form.getField('notifications')

      expect(field?.parts.input).toEqual({
        id: 'notifications',
        name: 'notifications',
        attrs: {
          type: 'checkbox',
          required: true
        }
      })

      expect(field?.parts.label).toEqual({
        text: 'Enable Notifications',
        htmlFor: 'notifications',
        showRequired: true
      })

      expect(field?.parts.description).toEqual({
        text: 'Receive email notifications'
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
              emailNotifications: { type: 'boolean', title: 'Email Notifications' },
              smsNotifications: { type: 'boolean', title: 'SMS Notifications' }
            },
            required: ['emailNotifications']
          }
        }
      }

      const form = parseSchema(schema)
      const emailField = form.getField('preferences.emailNotifications')
      const smsField = form.getField('preferences.smsNotifications')

      expect(emailField?.attrs.type).toBe('checkbox')
      expect(emailField?.required).toBe(true)
      expect(smsField?.attrs.type).toBe('checkbox')
      expect(smsField?.required).toBe(false)
    })
  })
})

