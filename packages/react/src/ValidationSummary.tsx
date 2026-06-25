import type { ReactNode } from 'react'
import { fieldControlId, useValidationIssues } from './renderer'

/**
 * Opt-in submit-time error summary with in-page links to each offending field.
 * Renders nothing when there are no issues — safe to mount unconditionally.
 */
export function ValidationSummary(): ReactNode {
  const issues = useValidationIssues()
  if (issues.length === 0) return null
  return (
    <ul className="jsf-validation-summary" role="alert" aria-live="polite">
      {issues.map((issue, i) => (
        <li key={i}>
          <a href={`#${fieldControlId(issue.path)}`}>
            {issue.path}: {issue.message}
          </a>
        </li>
      ))}
    </ul>
  )
}
