/**
 * Shared helpers for test-local parity recipes (#125 / option B).
 * Deliberately duplicated from examples/ — ADR 024: recipes are not packages.
 */
import type { ReactNode } from 'react'
import type { ValidationError } from '@formframe/core'
import { fieldControlId } from '../../renderer'
import { ACCOUNT_SIGNUP_FIELD_ORDER } from '../fixtures'

export function blankToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value
}

/** TanStack emits `contacts[0].email`; FormFrame seam uses `contacts.0.email`. */
export function bracketPathToDot(path: string): string {
  return path.replace(/\[(\d+)\]/g, '.$1')
}

/** Register TanStack fields under bracket paths so form-level SS errors match. */
export function dotPathToBracket(path: string): string {
  return path.replace(/\.(\d+)(?=\.|$)/g, '[$1]')
}

export function standardIssuesToErrors(
  issues: ReadonlyArray<{
    message: string
    path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>
  }>
): ValidationError[] {
  return issues.map((issue) => ({
    path: issue.path
      ? issue.path
          .map((seg) => (typeof seg === 'object' ? seg.key : seg))
          .map(String)
          .join('.')
      : '',
    message: issue.message,
  }))
}

/** Recipe-local summary: DOM field order, linkable via `fieldControlId`. */
export function ParityValidationSummary({
  errors,
}: {
  errors: ValidationError[]
}): ReactNode {
  if (errors.length === 0) return null
  const order = new Map(ACCOUNT_SIGNUP_FIELD_ORDER.map((path, i) => [path, i]))
  const sorted = [...errors].sort((a, b) => {
    const ai = order.get(a.path as (typeof ACCOUNT_SIGNUP_FIELD_ORDER)[number])
    const bi = order.get(b.path as (typeof ACCOUNT_SIGNUP_FIELD_ORDER)[number])
    return (ai ?? 999) - (bi ?? 999)
  })
  return (
    <ul
      className="jsf-validation-summary"
      data-testid="parity-summary"
      // Intentionally no role="alert" — matches library field-error contract.
    >
      {sorted.map((error, i) => (
        <li key={`${error.path}-${i}`}>
          <a href={`#${fieldControlId(error.path)}`}>
            {error.path}: {error.message}
          </a>
        </li>
      ))}
    </ul>
  )
}

export function PendingBeacon({ pending }: { pending: boolean }): ReactNode {
  return (
    <div
      data-testid="parity-pending"
      data-pending={pending ? 'true' : 'false'}
      aria-busy={pending || undefined}
    />
  )
}

export type ParitySource = 'jsonschema' | 'zod'

export interface ParityRecipeProps {
  source: ParitySource
  /** Controllable username mock from the fixture factory. */
  checkUsername: (name: string) => Promise<boolean>
  onSubmit: (data: Record<string, unknown>) => void
}
