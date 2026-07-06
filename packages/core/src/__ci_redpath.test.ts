import { describe, it, expect } from 'vitest'

// TEMPORARY: proves CI red-path blocks merge. Reverted immediately after.
describe('ci red-path probe', () => {
  it('intentionally fails to confirm branch protection blocks the merge', () => {
    expect(1).toBe(2)
  })
})
