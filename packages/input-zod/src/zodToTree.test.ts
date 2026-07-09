import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { zodToTree } from './zodToTree'
import { assertArrayNode } from './nodeTestUtils'
import { inputCtl, selectCtl, choicegroupCtl } from './controlTestUtils'

describe('zodToTree', () => {
  describe('basic object schemas', () => {
    it('compiles a simple object schema with one field', () => {
      const form = zodToTree(z.object({ name: z.string() }))
      expect(form.nodeType).toBe('group')
      expect(form.path).toBe('')
      expect(form.children).toHaveLength(1)
      expect(form.children[0].nodeType).toBe('field')
    })

    it('compiles multiple fields', () => {
      const form = zodToTree(
        z.object({ name: z.string(), email: z.string(), age: z.number() })
      )
      expect(form.children).toHaveLength(3)
      expect(form.getAllFields()).toHaveLength(3)
    })

    it('throws for a non-object root schema', () => {
      expect(() => zodToTree(z.string())).toThrow(
        'zodToTree expects a Zod object schema at the root'
      )
    })

    it('accepts a wrapped (described) root object', () => {
      const form = zodToTree(
        z.object({ name: z.string() }).describe('A person')
      )
      expect(form.nodeType).toBe('group')
      expect(form.children).toHaveLength(1)
    })
  })

  describe('field metadata', () => {
    it('reads the label from .meta({ title })', () => {
      const form = zodToTree(
        z.object({ name: z.string().meta({ title: 'Full Name' }) })
      )
      expect(form.getField('name')?.parts.label.text).toBe('Full Name')
    })

    it('reads the description from .describe()', () => {
      const form = zodToTree(
        z.object({ email: z.string().describe('Your email address') })
      )
      expect(form.getField('email')?.parts.description?.text).toBe(
        'Your email address'
      )
    })

    it('falls back to the path when no title is given', () => {
      const form = zodToTree(z.object({ name: z.string() }))
      expect(form.getField('name')?.facts.label).toBe('name')
    })
  })

  describe('requiredness (wrapper chain)', () => {
    it('a plain property is required; .optional() and .default() are not', () => {
      const form = zodToTree(
        z.object({
          a: z.string(),
          b: z.string().optional(),
          c: z.string().default('x'),
        })
      )
      expect(form.getField('a')?.facts.constraints.required).toBe(true)
      expect(form.getField('b')?.facts.constraints.required).toBe(false)
      expect(form.getField('c')?.facts.constraints.required).toBe(false)
    })

    it('.nullable() alone keeps the key required (value may be null, key present)', () => {
      const form = zodToTree(z.object({ a: z.string().nullable() }))
      expect(form.getField('a')?.facts.constraints.required).toBe(true)
    })

    it('.nullish() makes the key optional', () => {
      const form = zodToTree(z.object({ a: z.string().nullish() }))
      expect(form.getField('a')?.facts.constraints.required).toBe(false)
    })
  })

  describe('primitives and input types', () => {
    it('string → text input', () => {
      const form = zodToTree(z.object({ name: z.string() }))
      const field = form.getField('name')
      expect(field?.facts.primitive).toBe('string')
      expect(inputCtl(field).attrs.type).toBe('text')
    })

    it('number → number input', () => {
      const form = zodToTree(z.object({ age: z.number() }))
      const field = form.getField('age')
      expect(field?.facts.primitive).toBe('number')
      expect(inputCtl(field).attrs.type).toBe('number')
    })

    it('z.int() and z.number().int() → integer primitive, number input', () => {
      const form = zodToTree(z.object({ a: z.int(), b: z.number().int() }))
      expect(form.getField('a')?.facts.primitive).toBe('integer')
      expect(form.getField('b')?.facts.primitive).toBe('integer')
      expect(inputCtl(form.getField('a')).attrs.type).toBe('number')
    })

    it('boolean → checkbox input', () => {
      const form = zodToTree(z.object({ agree: z.boolean() }))
      const field = form.getField('agree')
      expect(field?.facts.primitive).toBe('boolean')
      expect(inputCtl(field).attrs.type).toBe('checkbox')
    })

    it('email format → email input', () => {
      const form = zodToTree(z.object({ email: z.string().email() }))
      const field = form.getField('email')
      expect(field?.facts.format).toBe('email')
      expect(inputCtl(field).attrs.type).toBe('email')
    })

    it('url format → url input', () => {
      const form = zodToTree(z.object({ site: z.string().url() }))
      expect(inputCtl(form.getField('site')).attrs.type).toBe('url')
    })
  })

  describe('constraints', () => {
    it('string min/max length → minLength/maxLength attrs', () => {
      const form = zodToTree(z.object({ name: z.string().min(2).max(5) }))
      const ctl = inputCtl(form.getField('name'))
      expect(ctl.attrs.minLength).toBe(2)
      expect(ctl.attrs.maxLength).toBe(5)
    })

    it('number min/max → min/max attrs', () => {
      const form = zodToTree(z.object({ age: z.number().min(1).max(10) }))
      const ctl = inputCtl(form.getField('age'))
      expect(ctl.attrs.min).toBe(1)
      expect(ctl.attrs.max).toBe(10)
    })

    it('regex → pattern attr', () => {
      const form = zodToTree(z.object({ code: z.string().regex(/^a+$/) }))
      expect(inputCtl(form.getField('code')).attrs.pattern).toBe('^a+$')
    })

    it('required → required attr', () => {
      const form = zodToTree(z.object({ name: z.string() }))
      expect(inputCtl(form.getField('name')).attrs.required).toBe(true)
    })
  })

  describe('choices (enum / literal union)', () => {
    it('a small enum → radio group', () => {
      const form = zodToTree(
        z.object({ color: z.enum(['red', 'green', 'blue']) })
      )
      const field = form.getField('color')
      expect(field?.widget).toBe('radio')
      const ctl = choicegroupCtl(field)
      expect(ctl.options.map((o) => o.attrs.value)).toEqual([
        'red',
        'green',
        'blue',
      ])
    })

    it('a large enum → select dropdown', () => {
      const form = zodToTree(
        z.object({ n: z.enum(['a', 'b', 'c', 'd', 'e', 'f']) })
      )
      const field = form.getField('n')
      expect(field?.widget).toBe('select')
      expect(selectCtl(field).options).toHaveLength(6)
    })

    it('a union of literals → radio group', () => {
      const form = zodToTree(
        z.object({
          size: z.union([z.literal('s'), z.literal('m'), z.literal('l')]),
        })
      )
      const field = form.getField('size')
      expect(field?.widget).toBe('radio')
      expect(choicegroupCtl(field).options.map((o) => o.attrs.value)).toEqual([
        's',
        'm',
        'l',
      ])
    })

    it('a numeric literal union → numeric-valued choices', () => {
      const form = zodToTree(
        z.object({ n: z.union([z.literal(1), z.literal(2)]) })
      )
      const field = form.getField('n')
      expect(field?.facts.primitive).toBe('number')
      expect(choicegroupCtl(field).options.map((o) => o.attrs.value)).toEqual([
        1, 2,
      ])
    })
  })

  describe('arrays', () => {
    it('array of scalars → an open add/remove array', () => {
      const form = zodToTree(z.object({ tags: z.array(z.string()) }))
      const tags = form.children.find((c) => c.path === 'tags')
      assertArrayNode(tags)
      expect(tags.widget).toBe('array')
      expect(tags.facts.item).toEqual({ valueShape: 'scalar' })
      expect(tags.facts.choices).toBeUndefined()
    })

    it('min/max → minItems/maxItems constraints and seeded items', () => {
      const form = zodToTree(
        z.object({ tags: z.array(z.string()).min(2).max(4) })
      )
      const tags = form.children.find((c) => c.path === 'tags')
      assertArrayNode(tags)
      expect(tags.facts.constraints.minItems).toBe(2)
      expect(tags.facts.constraints.maxItems).toBe(4)
      expect(tags.children).toHaveLength(2)
    })

    it('array of a small enum → collapses to a checkbox group', () => {
      const form = zodToTree(
        z.object({ roles: z.array(z.enum(['admin', 'user'])) })
      )
      const field = form.getField('roles')
      expect(field?.nodeType).toBe('field')
      expect(field?.widget).toBe('checkboxes')
      expect(field?.facts.valueShape).toBe('array')
      expect(choicegroupCtl(field).multiple).toBe(true)
    })

    it('array of a large enum → collapses to a multiselect', () => {
      const form = zodToTree(
        z.object({
          picks: z.array(z.enum(['a', 'b', 'c', 'd', 'e', 'f'])),
        })
      )
      const field = form.getField('picks')
      expect(field?.widget).toBe('multiselect')
      expect(selectCtl(field).attrs.multiple).toBe(true)
    })

    it('array of objects → object item descriptor exposing member keys', () => {
      const form = zodToTree(
        z.object({
          contacts: z.array(z.object({ name: z.string(), email: z.string() })),
        })
      )
      const contacts = form.children.find((c) => c.path === 'contacts')
      assertArrayNode(contacts)
      expect(contacts.facts.item).toEqual({
        valueShape: 'object',
        keys: ['name', 'email'],
      })
    })
  })

  describe('nesting', () => {
    it('nested objects → nested groups with dotted paths', () => {
      const form = zodToTree(
        z.object({
          user: z.object({ name: z.string(), age: z.number() }),
        })
      )
      const user = form.children.find((c) => c.path === 'user')
      expect(user?.nodeType).toBe('group')
      expect(form.getField('user.name')?.facts.primitive).toBe('string')
      expect(form.getField('user.age')?.facts.primitive).toBe('number')
    })

    it('marks nested requiredness from the wrapper chain', () => {
      const form = zodToTree(
        z.object({
          user: z.object({
            name: z.string(),
            nick: z.string().optional(),
          }),
        })
      )
      expect(form.getField('user.name')?.facts.constraints.required).toBe(true)
      expect(form.getField('user.nick')?.facts.constraints.required).toBe(false)
    })
  })

  describe('origin', () => {
    it('pins origin.source to "zod" and carries the declared schema', () => {
      const form = zodToTree(z.object({ name: z.string() }))
      const field = form.getField('name')
      expect(field?.facts.origin.source).toBe('zod')
      expect(field?.facts.origin.schema).toBeDefined()
    })
  })
})
