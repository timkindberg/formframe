import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { zodToTree } from './zodToTree'
import { inputCtl } from './controlTestUtils'
import { assertGroupNode } from './nodeTestUtils'

/**
 * Pins current compiler behavior for shapes documented in `SUPPORT_CATALOG.md`.
 * Add cases here when catalog claims need evidence; do not change product
 * behavior via these tests.
 */
describe('support catalog — degraded and ambiguous shapes', () => {
  it('non-literal union degrades to plain string input', () => {
    const form = zodToTree(
      z.object({ mode: z.union([z.string(), z.number()]) })
    )
    const field = form.getField('mode')

    expect(field?.widget).toBe('input')
    expect(field?.facts.primitive).toBe('string')
    expect(field?.facts.choices).toBeUndefined()
    expect(inputCtl(field).attrs.type).toBe('text')
  })

  it('discriminated union degrades to plain string input', () => {
    const form = zodToTree(
      z.object({
        item: z.discriminatedUnion('type', [
          z.object({ type: z.literal('a'), x: z.string() }),
          z.object({ type: z.literal('b'), y: z.number() }),
        ]),
      })
    )
    const field = form.getField('item')

    expect(field?.widget).toBe('input')
    expect(field?.facts.primitive).toBe('string')
    expect(field?.facts.choices).toBeUndefined()
  })

  it('union with boolean literal is not a choice set', () => {
    const form = zodToTree(
      z.object({
        flag: z.union([z.literal('yes'), z.literal(true)]),
      })
    )
    const field = form.getField('flag')

    expect(field?.widget).toBe('input')
    expect(field?.facts.choices).toBeUndefined()
  })

  it('transform wrapper degrades to string input', () => {
    const form = zodToTree(
      z.object({ len: z.string().transform((s) => s.length) })
    )
    const field = form.getField('len')

    expect(field?.widget).toBe('input')
    expect(field?.facts.primitive).toBe('string')
    expect(field?.facts.choices).toBeUndefined()
  })

  it('pipe degrades to string input', () => {
    const form = zodToTree(z.object({ n: z.string().pipe(z.coerce.number()) }))
    const field = form.getField('n')

    expect(field?.widget).toBe('input')
    expect(field?.facts.primitive).toBe('string')
  })

  it('refine keeps inner base constraints but not the predicate', () => {
    const form = zodToTree(
      z.object({
        code: z
          .string()
          .min(5)
          .refine((s) => s.includes('@')),
      })
    )
    const field = form.getField('code')

    expect(field?.facts.constraints.minLength).toBe(5)
    expect(field?.widget).toBe('input')
  })

  it('record degrades to string input with zod origin preserved', () => {
    const schema = z.record(z.string(), z.string())
    const form = zodToTree(z.object({ meta: schema }))
    const field = form.getField('meta')

    expect(field?.widget).toBe('input')
    expect(field?.facts.primitive).toBe('string')
    expect(field?.facts.origin.source).toBe('zod')
    expect(field?.facts.origin.schema).toBe(schema)
  })

  it('tuple degrades to string input', () => {
    const form = zodToTree(
      z.object({ pair: z.tuple([z.string(), z.number()]) })
    )
    const field = form.getField('pair')

    expect(field?.widget).toBe('input')
    expect(field?.facts.valueShape).toBe('scalar')
  })

  it('lazy degrades to string input without expanding the graph', () => {
    const form = zodToTree(
      z.object({
        node: z.lazy(() => z.object({ name: z.string() })),
      })
    )
    const field = form.getField('node')

    expect(field?.widget).toBe('input')
    expect(form.getField('node.name')).toBeUndefined()
  })

  it('intersection degrades to string input', () => {
    const form = zodToTree(
      z.object({
        both: z.intersection(
          z.object({ a: z.string() }),
          z.object({ b: z.number() })
        ),
      })
    )
    const field = form.getField('both')

    expect(field?.widget).toBe('input')
    expect(field?.facts.primitive).toBe('string')
  })

  it('non-structural scalars degrade to string input', () => {
    const form = zodToTree(
      z.object({
        any: z.any(),
        unknown: z.unknown(),
        never: z.never(),
        nullType: z.null(),
        undef: z.undefined(),
        voidType: z.void(),
        nan: z.nan(),
        bigint: z.bigint(),
      })
    )

    for (const key of [
      'any',
      'unknown',
      'never',
      'nullType',
      'undef',
      'voidType',
      'nan',
      'bigint',
    ]) {
      const field = form.getField(key)
      expect(field?.widget).toBe('input')
      expect(field?.facts.primitive).toBe('string')
    }
  })

  it('single string literal is not a choice field', () => {
    const form = zodToTree(z.object({ fixed: z.literal('only') }))
    const field = form.getField('fixed')

    expect(field?.widget).toBe('input')
    expect(field?.facts.primitive).toBe('string')
    expect(field?.facts.choices).toBeUndefined()
    expect(inputCtl(field).attrs.type).toBe('text')
  })

  it('single numeric literal is not a choice field', () => {
    const form = zodToTree(z.object({ count: z.literal(42) }))
    const field = form.getField('count')

    expect(field?.widget).toBe('input')
    expect(field?.facts.primitive).toBe('number')
    expect(field?.facts.choices).toBeUndefined()
    expect(inputCtl(field).attrs.type).toBe('number')
  })

  it('boolean literal uses boolean primitive without choices', () => {
    const form = zodToTree(z.object({ ok: z.literal(true) }))
    const field = form.getField('ok')

    expect(field?.facts.primitive).toBe('boolean')
    expect(field?.facts.choices).toBeUndefined()
    expect(inputCtl(field).attrs.type).toBe('checkbox')
  })

  it('z.date() compiles to date format input', () => {
    const form = zodToTree(z.object({ born: z.date() }))
    const field = form.getField('born')

    expect(field?.facts.primitive).toBe('string')
    expect(field?.facts.format).toBe('date')
    expect(inputCtl(field).attrs.type).toBe('date')
  })

  it('.datetime() maps to date-time format and datetime-local input', () => {
    const form = zodToTree(z.object({ at: z.string().datetime() }))
    const field = form.getField('at')

    expect(field?.facts.format).toBe('date-time')
    expect(inputCtl(field).attrs.type).toBe('datetime-local')
  })

  it('coerce.number compiles as number primitive', () => {
    const form = zodToTree(z.object({ n: z.coerce.number() }))
    const field = form.getField('n')

    expect(field?.facts.primitive).toBe('number')
    expect(inputCtl(field).attrs.type).toBe('number')
  })

  it('unknown string format keeps format fact but text input', () => {
    const form = zodToTree(z.object({ id: z.string().uuid() }))
    const field = form.getField('id')

    expect(field?.facts.format).toBe('uuid')
    expect(inputCtl(field).attrs.type).toBe('text')
  })

  it('nested arrays compile with array item descriptor', () => {
    const form = zodToTree(z.object({ matrix: z.array(z.array(z.string())) }))
    const matrix = form.children.find((c) => c.path === 'matrix')

    expect(matrix?.nodeType).toBe('array')
    if (matrix?.nodeType === 'array') {
      expect(matrix.facts.item).toEqual({ valueShape: 'array' })
    }
  })

  it('empty object compiles as group with no children', () => {
    const form = zodToTree(z.object({ empty: z.object({}) }))
    const empty = form.children.find((c) => c.path === 'empty')
    assertGroupNode(empty)
    expect(empty.children).toHaveLength(0)
  })

  it('object strict/passthrough/strip modifiers compile the same shape keys', () => {
    const base = { a: z.string(), b: z.number() }
    const strictForm = zodToTree(z.object(base).strict())
    const passForm = zodToTree(z.object(base).passthrough())
    const stripForm = zodToTree(z.object(base).strip())

    for (const form of [strictForm, passForm, stripForm]) {
      expect(form.getAllFields()).toHaveLength(2)
      expect(form.getField('a')?.facts.primitive).toBe('string')
      expect(form.getField('b')?.facts.primitive).toBe('number')
    }
  })
})

describe('support catalog — origin and wrapper semantics', () => {
  it('origin.schema is the declared property schema reference', () => {
    const name = z.string()
    const form = zodToTree(z.object({ name }))
    const field = form.getField('name')

    expect(field?.facts.origin.source).toBe('zod')
    expect(field?.facts.origin.schema).toBe(name)
  })

  it('wrapped default schema is preserved on origin', () => {
    const withDefault = z.string().default('x')
    const form = zodToTree(z.object({ title: withDefault }))
    const field = form.getField('title')

    expect(field?.facts.origin.schema).toBe(withDefault)
    expect(field?.facts.constraints.required).toBe(false)
  })

  it('default and prefault make keys optional without prefill attrs', () => {
    const form = zodToTree(
      z.object({
        a: z.string().default('x'),
        b: z.string().prefault('y'),
      })
    )

    expect(form.getField('a')?.facts.constraints.required).toBe(false)
    expect(form.getField('b')?.facts.constraints.required).toBe(false)
    expect(inputCtl(form.getField('a')).attrs.value).toBeUndefined()
    expect(inputCtl(form.getField('b')).attrs.value).toBeUndefined()
  })

  it('readonly unwraps to inner scalar facts', () => {
    const form = zodToTree(z.object({ label: z.string().min(3).readonly() }))
    const field = form.getField('label')

    expect(field?.facts.primitive).toBe('string')
    expect(field?.facts.constraints.minLength).toBe(3)
    expect(field?.facts.constraints.required).toBe(true)
    expect(inputCtl(field).attrs.type).toBe('text')
  })

  it('catch wrapper keeps key required', () => {
    const form = zodToTree(z.object({ label: z.string().catch('fallback') }))
    const field = form.getField('label')

    expect(field?.facts.constraints.required).toBe(true)
    expect(field?.widget).toBe('input')
  })

  it('brand unwraps to inner scalar leaf', () => {
    const branded = z.string().brand('UserId')
    const form = zodToTree(z.object({ id: branded }))
    const field = form.getField('id')

    expect(field?.widget).toBe('input')
    expect(field?.facts.primitive).toBe('string')
    expect(field?.facts.origin.schema).toBe(branded)
  })
})

describe('support catalog — rejected shapes', () => {
  it('array without element throws', () => {
    const badArray = {
      _zod: {
        def: { type: 'array' as const },
      },
    } as unknown as z.ZodType

    expect(() => zodToTree(z.object({ tags: badArray }))).toThrow(
      /has no element schema/
    )
  })

  it('non-object root throws', () => {
    expect(() => zodToTree(z.string())).toThrow(
      'zodToTree expects a Zod object schema at the root'
    )
  })
})
