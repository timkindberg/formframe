import type { ReactNode } from 'react'
import {
  fieldControlId,
  useDisplayPolicy,
  useValidationErrors,
} from './renderer'

/**
 * Opt-in submit-time error summary with in-page links to each offending field.
 * Renders nothing when there are no errors — safe to mount unconditionally.
 *
 * Its visibility follows the display policy (ADR 027) so it never disagrees with
 * the inline per-field errors: under `'always'` it appears as soon as errors
 * exist (pre-027 behaviour); under `'touched'`/`'submit'` it stays hidden until a
 * submit attempt — the reveal-all moment — because before then the inline errors
 * carry the load and a full list would leak errors the fields are still holding
 * quiet. No policy provider → treated as `'always'`, matching the field gate.
 */
export function ValidationSummary(): ReactNode {
  const errors = useValidationErrors()
  const { mode, submitted } = useDisplayPolicy()
  if (errors.length === 0) return null
  if (mode !== 'always' && !submitted) return null
  return (
    <ul className="jsf-validation-summary" role="alert">
      {errors.map((error, i) => (
        <li key={i}>
          <a href={`#${fieldControlId(error.path)}`}>
            {error.path}: {error.message}
          </a>
        </li>
      ))}
    </ul>
  )
}
