import { describe, it, expect } from 'vitest'
import { transformCheckboxes, unflatten } from './groupNode.submitUtils'

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
})
