// The validation capability slot (ADR 019) — a neutral, side-loaded contract.
//
// Core does not validate; it only names the shape. An adapter package (AJV, and
// later Zod/Valibot) supplies the implementation, and a consumer (React's submit
// path) runs it. These are pure types plus one pure helper — no imports, no
// state, no DOM — so the stubborn Core boundary holds while validation still
// "rides on" Core as the shared vocabulary every renderer/validator can depend on.

/**
 * One validation problem, keyed to a field by the **same dot-path as
 * `node.path`** (`name`, `contacts.0.email`; `""` = the root value). Carrying the
 * path here is what lets a renderer map an issue back to the field that owns it
 * with no translation layer. `keyword` is an optional machine code — typically
 * the JSON Schema keyword that failed (`required`, `minLength`, `pattern`).
 */
export interface ValidationIssue {
  path: string
  message: string
  keyword?: string
}

/** The outcome of validating one data value: a verdict plus the flat issue list. */
export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
}

/**
 * The slot itself: given the form's assembled data, return the issues.
 * Synchronous (submit-time, native-adapter path — ADR 019); async validators are
 * a future seam evolution. Side-loaded: Core defines this; adapters implement it.
 */
export type Validator = (data: unknown) => ValidationResult

/**
 * Group issues by their `path` for O(1) per-field lookup — the shape a renderer
 * wants ("does this field have issues?"). Pure and order-preserving within a path.
 */
export function groupIssuesByPath(
  issues: ValidationIssue[]
): Map<string, ValidationIssue[]> {
  const byPath = new Map<string, ValidationIssue[]>()
  for (const issue of issues) {
    const existing = byPath.get(issue.path)
    if (existing) existing.push(issue)
    else byPath.set(issue.path, [issue])
  }
  return byPath
}
