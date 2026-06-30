import { describe, expect, it } from 'vitest'
import {
  decodeJsonPointerSegment,
  joinPath,
  jsonPointerToPath,
} from './jsonPointer'

describe('decodeJsonPointerSegment', () => {
  it('unescapes ~1 before ~0', () => {
    expect(decodeJsonPointerSegment('properties~1foo')).toBe('properties/foo')
    expect(decodeJsonPointerSegment('a~1b~0c')).toBe('a/b~c')
  })

  it('leaves segments without escapes unchanged', () => {
    expect(decodeJsonPointerSegment('contacts')).toBe('contacts')
    expect(decodeJsonPointerSegment('0')).toBe('0')
  })
})

describe('jsonPointerToPath', () => {
  it('maps root pointer to empty path', () => {
    expect(jsonPointerToPath('')).toBe('')
  })

  it('converts nested object and array segments', () => {
    expect(jsonPointerToPath('/contacts/0/email')).toBe('contacts.0.email')
    expect(jsonPointerToPath('/name')).toBe('name')
  })

  it('unescapes encoded segments in full pointers', () => {
    expect(jsonPointerToPath('/properties~1foo/bar~0baz')).toBe(
      'properties/foo.bar~baz'
    )
  })
})

describe('joinPath', () => {
  it('appends to a non-empty base', () => {
    expect(joinPath('contacts.0', 'email')).toBe('contacts.0.email')
  })

  it('returns the segment alone when base is empty', () => {
    expect(joinPath('', 'name')).toBe('name')
  })
})
