import { describe, it, expect } from 'vitest'
import {
  forceArrayFields,
  normalizeArrayFieldPath,
  omitEmptyFormValues,
  transformCheckboxes,
  unflatten,
} from './groupNode.submitUtils'

describe('omitEmptyFormValues', () => {
  it('omits top-level empty string fields (unfilled native inputs)', () => {
    const input = {
      name: '',
      email: 'a@b.com',
    }

    expect(omitEmptyFormValues(input)).toEqual({
      email: 'a@b.com',
    })
  })

  it('omits nested empty string fields', () => {
    const input = {
      'address.street': '',
      'address.city': 'Springfield',
    }

    expect(omitEmptyFormValues(input)).toEqual({
      'address.city': 'Springfield',
    })
  })

  it('preserves empty strings at numeric array indices', () => {
    const input = {
      'hobbies.0': '',
      'hobbies.1': 'coding',
    }

    expect(omitEmptyFormValues(input)).toEqual(input)
  })

  it('omits empty strings in nested object fields inside arrays', () => {
    const input = {
      'addresses.0.street': '',
      'addresses.0.city': 'Springfield',
    }

    expect(omitEmptyFormValues(input)).toEqual({
      'addresses.0.city': 'Springfield',
    })
  })
})

describe('normalizeArrayFieldPath', () => {
  it('replaces numeric segments with a wildcard', () => {
    expect(normalizeArrayFieldPath('contacts.0.skills')).toBe(
      'contacts.*.skills'
    )
    expect(normalizeArrayFieldPath('contacts.12.skills')).toBe(
      'contacts.*.skills'
    )
  })

  it('leaves non-numeric paths unchanged', () => {
    expect(normalizeArrayFieldPath('skills')).toBe('skills')
    expect(normalizeArrayFieldPath('profile.skills')).toBe('profile.skills')
  })
})

describe('forceArrayFields', () => {
  it('wraps a single value of a known array field in a 1-element array', () => {
    const signatures = new Set(['skills'])
    expect(forceArrayFields({ skills: 'JavaScript' }, signatures)).toEqual({
      skills: ['JavaScript'],
    })
  })

  it('leaves already-array values untouched', () => {
    const signatures = new Set(['skills'])
    expect(
      forceArrayFields({ skills: ['JavaScript', 'TypeScript'] }, signatures)
    ).toEqual({ skills: ['JavaScript', 'TypeScript'] })
  })

  it('does not wrap scalar fields that are not array fields', () => {
    const signatures = new Set(['skills'])
    expect(
      forceArrayFields({ name: 'John', skills: 'JavaScript' }, signatures)
    ).toEqual({ name: 'John', skills: ['JavaScript'] })
  })

  it('matches array-item instances by normalized signature (any index)', () => {
    const signatures = new Set(['contacts.*.skills'])
    expect(
      forceArrayFields(
        { 'contacts.0.skills': 'a', 'contacts.1.skills': 'b' },
        signatures
      )
    ).toEqual({ 'contacts.0.skills': ['a'], 'contacts.1.skills': ['b'] })
  })

  it('does not add absent fields (zero selections stay omitted)', () => {
    const signatures = new Set(['skills'])
    expect(forceArrayFields({ name: 'John' }, signatures)).toEqual({
      name: 'John',
    })
  })

  it('leaves dynamic-array element paths untouched (only leaf array fields)', () => {
    // `hobbies` is a dynamic string array: its elements are scalars assembled
    // into an array by unflatten, not array-valued leaves themselves.
    const signatures = new Set<string>()
    expect(
      forceArrayFields(
        { 'hobbies.0': 'reading', 'hobbies.1': 'coding' },
        signatures
      )
    ).toEqual({ 'hobbies.0': 'reading', 'hobbies.1': 'coding' })
  })
})

describe('transformCheckboxes', () => {
  it('transforms "on" values to true', () => {
    const input = {
      subscribe: 'on',
      name: 'John',
    }

    const result = transformCheckboxes(input)

    expect(result).toEqual({
      subscribe: true,
      name: 'John',
    })
  })

  it('leaves non-"on" values unchanged', () => {
    const input = {
      name: 'Jane',
      age: '30',
      email: 'jane@example.com',
    }

    const result = transformCheckboxes(input)

    expect(result).toEqual(input)
  })

  it('handles multiple checkbox values', () => {
    const input = {
      subscribe: 'on',
      terms: 'on',
      name: 'Bob',
    }

    const result = transformCheckboxes(input)

    expect(result).toEqual({
      subscribe: true,
      terms: true,
      name: 'Bob',
    })
  })

  it('handles empty object', () => {
    const result = transformCheckboxes({})
    expect(result).toEqual({})
  })
})

describe('unflatten', () => {
  it('unflattens single-level dot paths', () => {
    const input = {
      'user.name': 'John',
      'user.email': 'john@example.com',
    }

    const result = unflatten(input)

    expect(result).toEqual({
      user: {
        name: 'John',
        email: 'john@example.com',
      },
    })
  })

  it('unflattens multi-level dot paths', () => {
    const input = {
      'user.address.street': '123 Main St',
      'user.address.city': 'Springfield',
      'user.address.state': 'IL',
    }

    const result = unflatten(input)

    expect(result).toEqual({
      user: {
        address: {
          street: '123 Main St',
          city: 'Springfield',
          state: 'IL',
        },
      },
    })
  })

  it('handles mixed flat and nested paths', () => {
    const input = {
      name: 'John',
      'address.street': '123 Main St',
      'address.city': 'Springfield',
      age: '30',
    }

    const result = unflatten(input)

    expect(result).toEqual({
      name: 'John',
      address: {
        street: '123 Main St',
        city: 'Springfield',
      },
      age: '30',
    })
  })

  it('handles different nested objects', () => {
    const input = {
      'user.name': 'John',
      'company.name': 'Acme Corp',
      'company.location': 'NY',
    }

    const result = unflatten(input)

    expect(result).toEqual({
      user: {
        name: 'John',
      },
      company: {
        name: 'Acme Corp',
        location: 'NY',
      },
    })
  })

  it('handles empty object', () => {
    const result = unflatten({})
    expect(result).toEqual({})
  })

  it('handles values without dots', () => {
    const input = {
      name: 'John',
      age: '30',
    }

    const result = unflatten(input)

    expect(result).toEqual(input)
  })

  it('unflattens numeric indices into arrays', () => {
    const input = {
      'hobbies.0': 'reading',
      'hobbies.1': 'coding',
      'hobbies.2': 'gaming',
    }

    const result = unflatten(input)

    expect(result).toEqual({
      hobbies: ['reading', 'coding', 'gaming'],
    })
  })

  it('handles sparse arrays', () => {
    const input = {
      'hobbies.0': 'reading',
      'hobbies.2': 'gaming',
    }

    const result = unflatten(input)

    expect(result).toEqual({
      // eslint-disable-next-line no-sparse-arrays
      hobbies: ['reading', , 'gaming'],
    })
  })

  it('unflattens nested arrays of objects', () => {
    const input = {
      'addresses.0.street': '123 Main St',
      'addresses.0.city': 'Springfield',
      'addresses.1.street': '456 Oak Ave',
      'addresses.1.city': 'Portland',
    }

    const result = unflatten(input)

    expect(result).toEqual({
      addresses: [
        { street: '123 Main St', city: 'Springfield' },
        { street: '456 Oak Ave', city: 'Portland' },
      ],
    })
  })

  it('handles mixed objects and arrays', () => {
    const input = {
      name: 'John',
      'addresses.0.street': '123 Main St',
      'addresses.1.street': '456 Oak Ave',
      'hobbies.0': 'reading',
      'hobbies.1': 'coding',
    }

    const result = unflatten(input)

    expect(result).toEqual({
      name: 'John',
      addresses: [{ street: '123 Main St' }, { street: '456 Oak Ave' }],
      hobbies: ['reading', 'coding'],
    })
  })

  it('handles multiselect (arrays of values)', () => {
    const input = {
      name: 'John',
      skills: ['JavaScript', 'TypeScript', 'React'],
    }

    const result = unflatten(input)

    expect(result).toEqual({
      name: 'John',
      skills: ['JavaScript', 'TypeScript', 'React'],
    })
  })
})
