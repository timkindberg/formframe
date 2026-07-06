import { describe, expectTypeOf, it } from 'vitest'
import type { FieldPath, InferData } from './infer'
import type {
  FieldPath as PublicFieldPath,
  InferData as PublicInferData,
} from './index'

const _flatSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number' },
  },
  required: ['name'],
} as const

const _nestedSchema = {
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
} as const

const _arraySchema = {
  type: 'object',
  properties: {
    users: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
    },
  },
} as const

const _tagsSchema = {
  type: 'object',
  properties: {
    tags: { type: 'array', items: { type: 'string' } },
  },
} as const

const _literalSchema = {
  type: 'object',
  properties: {
    status: { enum: ['active', 'inactive'] as const },
    version: { const: 1 as const },
    note: { type: 'null' },
  },
  required: ['status'],
} as const

const _booleanSchema = {
  type: 'object',
  properties: {
    active: { type: 'boolean' },
  },
} as const

const _implicitObjectSchema = {
  properties: {
    title: { type: 'string' },
  },
} as const

const _refSchema = { $ref: '#/definitions/Foo' } as const
const _allOfSchema = {
  allOf: [{ type: 'string' }, { minLength: 1 }],
} as const
const _anyOfSchema = {
  anyOf: [{ type: 'string' }, { type: 'number' }],
} as const
const _oneOfSchema = {
  oneOf: [{ type: 'string' }, { type: 'number' }],
} as const
const _tupleSchema = {
  type: 'array',
  items: [{ type: 'string' }, { type: 'number' }],
} as const

const _depthSchema = {
  type: 'object',
  properties: {
    l1: {
      type: 'object',
      properties: {
        l2: {
          type: 'object',
          properties: {
            l3: {
              type: 'object',
              properties: {
                l4: {
                  type: 'object',
                  properties: {
                    l5: {
                      type: 'object',
                      properties: {
                        l6: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const

type FlatData = InferData<typeof _flatSchema>
type NestedData = InferData<typeof _nestedSchema>
type ArrayData = InferData<typeof _arraySchema>
type LiteralData = InferData<typeof _literalSchema>

type FlatPaths = FieldPath<typeof _flatSchema>
type NestedPaths = FieldPath<typeof _nestedSchema>
type ArrayPaths = FieldPath<typeof _arraySchema>
type TagsPaths = FieldPath<typeof _tagsSchema>
type DepthPaths = FieldPath<typeof _depthSchema>

describe('InferData', () => {
  it('infers a flat object with mixed required and optional keys', () => {
    expectTypeOf<FlatData>().toMatchObjectType<{
      name: string
      age?: number
    }>()
    expectTypeOf<FlatData>().not.toMatchObjectType<{
      name?: string
    }>()
  })

  it('infers nested object shapes with required nested keys', () => {
    type Expected = {
      address?: {
        street: string
        city?: string
      }
    }
    expectTypeOf<NestedData>().toExtend<Expected>()
    expectTypeOf<Expected>().toExtend<NestedData>()
  })

  it('infers arrays of objects', () => {
    type Expected = {
      users?: ReadonlyArray<{
        name: string
      }>
    }
    expectTypeOf<ArrayData>().toExtend<Expected>()
    expectTypeOf<Expected>().toExtend<ArrayData>()
  })

  it('infers enum, const, and null', () => {
    expectTypeOf<LiteralData>().toMatchObjectType<{
      status: 'active' | 'inactive'
      version?: 1
      note?: null
    }>()
    expectTypeOf<LiteralData>().not.toMatchObjectType<{
      status?: 'active' | 'inactive'
    }>()
  })

  it('infers boolean primitives', () => {
    expectTypeOf<InferData<typeof _booleanSchema>>().toMatchObjectType<{
      active?: boolean
    }>()
  })

  it('infers implicit objects with properties but no type keyword', () => {
    expectTypeOf<InferData<typeof _implicitObjectSchema>>().toMatchObjectType<{
      title?: string
    }>()
  })

  it('degrades unsupported schema shapes to unknown', () => {
    expectTypeOf<InferData<typeof _refSchema>>().toEqualTypeOf<unknown>()
    expectTypeOf<InferData<typeof _allOfSchema>>().toEqualTypeOf<unknown>()
    expectTypeOf<InferData<typeof _anyOfSchema>>().toEqualTypeOf<unknown>()
    expectTypeOf<InferData<typeof _oneOfSchema>>().toEqualTypeOf<unknown>()
    expectTypeOf<InferData<typeof _tupleSchema>>().toEqualTypeOf<unknown>()
  })
})

describe('FieldPath', () => {
  it('lists top-level field paths', () => {
    expectTypeOf<FlatPaths>().toEqualTypeOf<'name' | 'age'>()
  })

  it('lists nested dot-paths', () => {
    expectTypeOf<NestedPaths>().toEqualTypeOf<
      'address' | 'address.street' | 'address.city'
    >()
  })

  it('lists indexed paths for arrays of objects', () => {
    expectTypeOf<ArrayPaths>().toEqualTypeOf<
      'users' | `users.${number}` | `users.${number}.name`
    >()
  })

  it('lists indexed paths for arrays of primitives', () => {
    expectTypeOf<TagsPaths>().toEqualTypeOf<'tags' | `tags.${number}`>()
  })

  it('stops expanding paths beyond the depth limit', () => {
    expectTypeOf<'l1.l2.l3.l4.l5'>().toExtend<DepthPaths>()
    expectTypeOf<DepthPaths>().not.toExtend<'l1.l2.l3.l4.l5.l6'>()
  })

  it('is exported from the package barrel', () => {
    expectTypeOf<
      PublicInferData<typeof _flatSchema>
    >().toEqualTypeOf<FlatData>()
    expectTypeOf<
      PublicFieldPath<typeof _arraySchema>
    >().toEqualTypeOf<ArrayPaths>()
  })
})

type _InvalidFlatPath = FieldPath<typeof _flatSchema>
// @ts-expect-error -- path does not exist on schema
const _rejectUnknownTopLevel: _InvalidFlatPath = 'missing'
// @ts-expect-error -- nested segment does not exist
const _rejectUnknownNested: FieldPath<typeof _nestedSchema> = 'address.zip'
// @ts-expect-error -- pre-index array-item path is not valid
const _rejectUnindexedArrayLeaf: FieldPath<typeof _arraySchema> = 'users.name'
// @ts-expect-error -- wrong leaf after array index
const _rejectWrongArrayLeaf: FieldPath<typeof _arraySchema> = 'users.0.email'
// @ts-expect-error -- beyond FieldPathDepthLimit
const _rejectBeyondDepthLimit: DepthPaths = 'l1.l2.l3.l4.l5.l6'
