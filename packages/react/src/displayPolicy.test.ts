// The display policy (ADR 027) is a pure, total function of
// (mode, { touched, submitted }). These pin every cell of that truth table so
// the render-count / integration tests can trust the decision it encodes.
import { describe, it, expect } from 'vitest'
import {
  shouldDisplayFieldErrors,
  DEFAULT_SHOW_ERRORS_WHEN,
} from './displayPolicy'

describe('shouldDisplayFieldErrors (ADR 027)', () => {
  it("'always' shows regardless of touched/submitted", () => {
    expect(
      shouldDisplayFieldErrors('always', { touched: false, submitted: false })
    ).toBe(true)
    expect(
      shouldDisplayFieldErrors('always', { touched: false, submitted: true })
    ).toBe(true)
    expect(
      shouldDisplayFieldErrors('always', { touched: true, submitted: false })
    ).toBe(true)
  })

  it("'touched' shows once the field is touched", () => {
    expect(
      shouldDisplayFieldErrors('touched', { touched: false, submitted: false })
    ).toBe(false)
    expect(
      shouldDisplayFieldErrors('touched', { touched: true, submitted: false })
    ).toBe(true)
  })

  it("'touched' shows everything after submit even if untouched", () => {
    expect(
      shouldDisplayFieldErrors('touched', { touched: false, submitted: true })
    ).toBe(true)
  })

  it("'submit' shows only after a submit attempt", () => {
    expect(
      shouldDisplayFieldErrors('submit', { touched: true, submitted: false })
    ).toBe(false)
    expect(
      shouldDisplayFieldErrors('submit', { touched: false, submitted: true })
    ).toBe(true)
  })

  it('default policy is backward-compatible (always)', () => {
    expect(DEFAULT_SHOW_ERRORS_WHEN).toBe('always')
    expect(
      shouldDisplayFieldErrors(DEFAULT_SHOW_ERRORS_WHEN, {
        touched: false,
        submitted: false,
      })
    ).toBe(true)
  })
})
