import type { GroupNode } from '@jsonschema-form/core'
import { present, defaultPresentation } from '@jsonschema-form/core'
import type { ZodType } from 'zod'
import { compileRoot } from './compile'

/**
 * Compile a Zod schema into the neutral @jsonschema-form/core tree (ADR 034).
 *
 * The Zod front-end transcribes the schema into the neutral tree by DIRECT
 * introspection (no Zod → JSON Schema round-trip) — it calls Core's neutral
 * builders (ADR 033 §3) — then the shipped default presentation runs over it:
 * scalar-choice array containers collapse into one multiselect/checkboxes leaf
 * (ADR 030 §3) and every leaf gets its widget/parts. All *lowering* lives in
 * present(), never the front-end. `useFormTree` re-runs present() with a consumer
 * resolver layered on top, identity-preservingly. Explicit `<ZodType>` pins S
 * end-to-end (the unknown-typed defaultPresentation is valid at any S by
 * contravariance).
 */
export function zodToTree(schema: ZodType): GroupNode<ZodType> {
  return present<ZodType>(compileRoot(schema), defaultPresentation)
}
