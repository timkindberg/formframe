// RECIPE TESTS — copy with `fieldMode.recipe.ts` / `ajvValidator.recipe.ts`.
import { describe, expect, it, vi } from 'vitest'
import Ajv from 'ajv'
import type { JSONSchema } from '@formframe/input-jsonschema'
import { createAjvValidator } from './ajvValidator.recipe'
import { createFieldMode, withFieldMode, type UiRule } from './fieldMode.recipe'

const DRIVER = 'driver'
const NOTES = 'notes'
const EMAIL = 'email'
const COMMENT = 'comment'
const TITLE = 'title'

const rules: UiRule[] = [
  {
    conditions: { or: [{ [DRIVER]: { not: { eq: 'yes' } } }] },
    event: [
      { type: 'remove', params: { field: NOTES } },
      { type: 'setValue', params: { field: NOTES, value: null } },
    ],
  },
  {
    conditions: { and: [{ [DRIVER]: { eq: 'yes' } }] },
    event: [
      { type: 'require', params: { field: EMAIL } },
      { type: 'require', params: { field: NOTES } },
    ],
  },
  {
    conditions: { [DRIVER]: { eq: 'yes' } },
    event: [{ type: 'setReadOnly', params: { field: COMMENT } }],
  },
]

const schema = {
  type: 'object',
  required: [TITLE],
  properties: {
    [DRIVER]: { type: 'string', enum: ['yes', 'no'] },
    [NOTES]: { type: 'string' },
    [EMAIL]: { type: 'string' },
    [COMMENT]: { type: 'string' },
    [TITLE]: { type: 'string' },
  },
} as const

describe('fieldMode.recipe · createFieldMode', () => {
  const fieldMode = createFieldMode(rules)

  it('lists condition paths for useWatch', () => {
    expect(fieldMode.paths).toEqual([DRIVER])
  })

  it('hides and clears notes when driver is not yes', () => {
    const mode = fieldMode({ [DRIVER]: 'no' })
    expect(mode.isHidden(NOTES)).toBe(true)
    expect(mode.setValues[NOTES]).toBeNull()
    expect(mode.isRequired(EMAIL)).toBe(false)
    expect(mode.isReadOnly(COMMENT)).toBe(false)
  })

  it('requires email/notes and readOnly-s comment when driver is yes', () => {
    const mode = fieldMode({ [DRIVER]: 'yes' })
    expect(mode.isHidden(NOTES)).toBe(false)
    expect(mode.isRequired(EMAIL)).toBe(true)
    expect(mode.isRequired(NOTES)).toBe(true)
    expect(mode.isReadOnly(COMMENT)).toBe(true)
    expect(mode.setValues[NOTES]).toBeUndefined()
  })

  it('unions field-mode axes and drops required on hidden paths', () => {
    const mode = createFieldMode([
      {
        conditions: { a: { eq: 1 } },
        event: [
          { type: 'remove', params: { field: 'x' } },
          { type: 'require', params: { field: 'x' } },
        ],
      },
    ])({ a: 1 })
    expect(mode.isHidden('x')).toBe(true)
    expect(mode.isRequired('x')).toBe(false)
  })

  it('last setValues write wins', () => {
    const mode = createFieldMode([
      {
        event: [{ type: 'setValue', params: { field: 'x', value: 'one' } }],
      },
      {
        event: [{ type: 'setValue', params: { field: 'x', value: 'two' } }],
      },
    ])({})
    expect(mode.setValues.x).toBe('two')
  })

  it('matches and/or/eq/empty/in', () => {
    const fieldMode = createFieldMode([
      {
        conditions: {
          and: [{ a: { eq: 1 } }, { b: { in: ['x', 'y'] } }],
        },
        event: [{ type: 'require', params: { field: 'z' } }],
      },
    ])
    expect(fieldMode({ a: 1, b: 'y' }).isRequired('z')).toBe(true)
    expect(fieldMode({ a: 1, b: 'nope' }).isRequired('z')).toBe(false)
    expect(
      createFieldMode([
        {
          conditions: { a: 'empty' },
          event: [{ type: 'require', params: { field: 'z' } }],
        },
      ])({ a: '' }).isRequired('z')
    ).toBe(true)
  })
})

describe('fieldMode.recipe · withFieldMode / createAjvValidator({ fieldMode })', () => {
  const fieldMode = createFieldMode(rules)

  it('does not fail type:string when a hidden field is null', () => {
    const validate = createAjvValidator(schema, { fieldMode })
    const input = { [DRIVER]: 'no', [NOTES]: null, [TITLE]: 'Hi' }
    const result = validate(input)
    expect(result.valid).toBe(true)
    expect(input[NOTES]).toBeNull()
  })

  it('drops schema.required errors for hidden paths', () => {
    const validate = createAjvValidator(
      {
        type: 'object',
        required: ['shown', 'hidden'],
        properties: {
          shown: { type: 'string' },
          hidden: { type: 'string' },
        },
      },
      {
        fieldMode: createFieldMode([
          {
            event: [{ type: 'remove', params: { field: 'hidden' } }],
          },
        ]),
      }
    )
    const result = validate({ shown: 'ok' })
    expect(result.valid).toBe(true)
    expect(result.errors.some((e) => e.path === 'hidden')).toBe(false)
  })

  it('injects required for field-mode required blanks', () => {
    const validate = createAjvValidator(schema, { fieldMode })
    const result = validate({
      [DRIVER]: 'yes',
      [TITLE]: 'Hi',
      [EMAIL]: '',
      [NOTES]: '',
    })
    expect(result.valid).toBe(false)
    expect(
      result.errors.filter((e) => e.keyword === 'required').map((e) => e.path)
    ).toEqual(expect.arrayContaining([EMAIL, NOTES]))
  })

  it('keeps compile-time required when the field is shown', () => {
    const validate = createAjvValidator(schema, { fieldMode })
    const result = validate({ [DRIVER]: 'no' })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === TITLE)).toBe(true)
  })

  it('withFieldMode wraps any Validator', () => {
    const inner = createAjvValidator(schema)
    const validate = withFieldMode(inner, fieldMode)
    expect(
      validate({ [DRIVER]: 'no', [NOTES]: null, [TITLE]: 'Hi' }).valid
    ).toBe(true)
  })

  it('compiles the schema once and does not rewrite it as data/mode change', () => {
    const compile = vi.spyOn(Ajv.prototype, 'compile')
    const required = schema.required
    const properties = schema.properties
    const validate = createAjvValidator(schema, { fieldMode })
    const compiles = compile.mock.calls.length
    expect(compiles).toBeGreaterThan(0)

    const afterCompile = {
      required: [...schema.required],
      propertyKeys: Object.keys(schema.properties),
    }
    const input = { [DRIVER]: 'no', [NOTES]: 'keep-me', [TITLE]: 'Hi' }

    validate(input)
    validate({ [DRIVER]: 'yes', [TITLE]: 'Hi', [EMAIL]: '', [NOTES]: '' })
    validate({ [DRIVER]: 'no', [NOTES]: null, [TITLE]: 'Hi' })
    for (let i = 0; i < 50; i++) {
      validate({
        [DRIVER]: i % 2 === 0 ? 'yes' : 'no',
        [TITLE]: 'Hi',
        [NOTES]: i % 2 === 0 ? 'x' : null,
        [EMAIL]: i % 2 === 0 ? 'a@b.c' : '',
      })
    }

    expect(compile.mock.calls.length).toBe(compiles)
    expect(schema.required).toBe(required)
    expect(schema.properties).toBe(properties)
    expect([...schema.required]).toEqual(afterCompile.required)
    expect(Object.keys(schema.properties)).toEqual(afterCompile.propertyKeys)
    expect(input).toEqual({
      [DRIVER]: 'no',
      [NOTES]: 'keep-me',
      [TITLE]: 'Hi',
    })
    compile.mockRestore()
  })
})

// Stress gates against quadratic blowups (lots of removes / setValues /
// nested conditions). Generous ceilings + a ratio vs plain AJV so a slow
// CI box does not flake; an O(n²) omit or a recompile-per-validate will.
const STRESS_FIELDS = 200
const STRESS_FOLDS = 800
const STRESS_VALIDATES = 120

function stressFixture(n: number) {
  const properties: Record<string, JSONSchema> = {
    driver: { type: 'string', enum: ['a', 'b', 'c'] },
    title: { type: 'string' },
    sink: { type: 'string' },
    nest: {
      type: 'object',
      properties: Object.fromEntries(
        Array.from({ length: 40 }, (_, i) => [`n${i}`, { type: 'string' }])
      ),
    },
  }
  for (let i = 0; i < n; i++) {
    properties[`f${i}`] = { type: 'string' }
  }
  const schema = {
    type: 'object',
    required: ['title'],
    properties,
  } as JSONSchema

  const rules: UiRule[] = []
  for (let i = 0; i < n; i += 2) {
    rules.push({
      conditions: { driver: { not: { eq: 'a' } } },
      event: [
        { type: 'remove', params: { field: `f${i}` } },
        { type: 'setValue', params: { field: `f${i}`, value: null } },
      ],
    })
  }
  for (let i = 1; i < n; i += 2) {
    rules.push({
      conditions: { driver: { eq: 'a' } },
      event: [{ type: 'require', params: { field: `f${i}` } }],
    })
  }
  for (let i = 0; i < 40; i++) {
    rules.push({
      conditions: {
        or: [
          {
            and: [{ driver: { eq: 'b' } }, { title: { eq: `t${i}` } }],
          },
          { driver: { in: ['c'] } },
        ],
      },
      event: [{ type: 'setReadOnly', params: { field: `f${i}` } }],
    })
  }
  for (let i = 0; i < 40; i++) {
    rules.push({
      conditions: { driver: { not: { eq: 'a' } } },
      event: [
        { type: 'remove', params: { field: `nest.n${i}` } },
        { type: 'setValue', params: { field: `nest.n${i}`, value: null } },
      ],
    })
  }
  for (let i = 0; i < 80; i++) {
    rules.push({
      event: [{ type: 'setValue', params: { field: 'sink', value: `w${i}` } }],
    })
  }

  function fill(driver: string, title: string): Record<string, unknown> {
    const nest: Record<string, unknown> = {}
    for (let i = 0; i < 40; i++) nest[`n${i}`] = `nested-${i}`
    const data: Record<string, unknown> = { driver, title, sink: 'seed', nest }
    for (let i = 0; i < n; i++) data[`f${i}`] = `v${i}`
    return data
  }

  return { schema, rules, fill }
}

function elapsedMs(rounds: number, run: () => void): number {
  const start = performance.now()
  for (let i = 0; i < rounds; i++) run()
  return performance.now() - start
}

describe('fieldMode.recipe · stress', () => {
  const { schema, rules, fill } = stressFixture(STRESS_FIELDS)
  const fieldMode = createFieldMode(rules)
  const evenCount = Math.ceil(STRESS_FIELDS / 2)
  const oddCount = Math.floor(STRESS_FIELDS / 2)

  it('folds hundreds of removes, requires, nested omits, and last-write setValues', () => {
    const hidden = fieldMode(fill('b', 'Hello'))
    expect(hidden.hidden.size).toBe(evenCount + 40)
    expect(Object.keys(hidden.setValues)).toHaveLength(evenCount + 40 + 1)
    expect(hidden.setValues.sink).toBe('w79')
    expect(hidden.setValues['f0']).toBeNull()
    expect(hidden.setValues['nest.n0']).toBeNull()
    expect(hidden.isRequired('f1')).toBe(false)
    expect(hidden.isReadOnly('f0')).toBe(false)

    const shown = fieldMode(fill('a', 'Hello'))
    expect(shown.hidden.size).toBe(0)
    expect(shown.required.size).toBe(oddCount)
    expect(shown.isRequired('f1')).toBe(true)
    expect(shown.isRequired('f0')).toBe(false)
    expect(shown.setValues.sink).toBe('w79')
    expect(shown.setValues['f0']).toBeUndefined()

    const readOnly = fieldMode(fill('c', 'Hello'))
    for (let i = 0; i < 40; i++) {
      expect(readOnly.isReadOnly(`f${i}`)).toBe(true)
    }
    expect(readOnly.isReadOnly('f40')).toBe(false)

    const titled = fieldMode(fill('b', 't7'))
    expect(titled.isReadOnly('f7')).toBe(true)
    expect(titled.isReadOnly('f8')).toBe(false)
  })

  it('omits many hidden (incl. nested) paths without mutating input or the schema', () => {
    const validate = createAjvValidator(schema, { fieldMode })
    const required = schema.required
    const input = fill('b', 'Hi')
    input.f0 = null
    input.nest = { ...(input.nest as Record<string, unknown>), n0: null }

    const result = validate(input)
    expect(result.valid).toBe(true)
    expect(input.f0).toBeNull()
    expect((input.nest as Record<string, unknown>).n0).toBeNull()
    expect(input.f1).toBe('v1')
    expect(schema.required).toBe(required)
    expect(schema.required).toEqual(['title'])
  })

  it('injects field-mode required across many shown blanks', () => {
    const validate = createAjvValidator(schema, { fieldMode })
    const input = fill('a', 'Hi')
    for (let i = 1; i < STRESS_FIELDS; i += 2) input[`f${i}`] = ''
    const result = validate(input)
    expect(result.valid).toBe(false)
    const requiredPaths = result.errors
      .filter((e) => e.keyword === 'required')
      .map((e) => e.path)
    expect(requiredPaths).toHaveLength(oddCount)
    expect(requiredPaths).toContain('f1')
    expect(requiredPaths).not.toContain('f0')
  })

  it('does not recompile AJV across mixed-mode validates at this size', () => {
    const compile = vi.spyOn(Ajv.prototype, 'compile')
    const validate = createAjvValidator(schema, { fieldMode })
    const compiles = compile.mock.calls.length
    const a = fill('a', 'Hi')
    const b = fill('b', 'Hi')
    const c = fill('c', 'Hi')
    for (let i = 0; i < 40; i++) {
      validate(i % 3 === 0 ? a : i % 3 === 1 ? b : c)
    }
    expect(compile.mock.calls.length).toBe(compiles)
    compile.mockRestore()
  })

  it(`folds ${STRESS_FOLDS} snapshots of ${STRESS_FIELDS} fields / ${rules.length} rules within budget`, () => {
    const a = fill('a', 'Hi')
    const b = fill('b', 't7')
    const c = fill('c', 'Hi')
    const ms = elapsedMs(STRESS_FOLDS, () => {
      fieldMode(a)
      fieldMode(b)
      fieldMode(c)
    })
    // ~360 rules × 3 snapshots × 800 rounds. Locally ~100ms; 750ms is a
    // blow-up tripwire for CI, not a microbench.
    expect(ms, `createFieldMode fold took ${ms.toFixed(1)}ms`).toBeLessThan(750)
  })

  it(`validates ${STRESS_VALIDATES} mixed-mode documents without exploding vs plain AJV`, () => {
    const data = fill('b', 'Hi')
    const plain = createAjvValidator(schema)
    const wrapped = createAjvValidator(schema, { fieldMode })
    const warmup = () => {
      plain(data)
      wrapped(data)
    }
    warmup()
    warmup()
    const plainMs = elapsedMs(STRESS_VALIDATES, () => {
      plain(data)
    })
    const wrappedMs = elapsedMs(STRESS_VALIDATES, () => {
      wrapped(data)
    })
    const ceiling = Math.max(plainMs * 12, 50)
    expect(
      wrappedMs,
      `withFieldMode ${wrappedMs.toFixed(1)}ms vs plain AJV ${plainMs.toFixed(1)}ms`
    ).toBeLessThan(ceiling)
  })
})
