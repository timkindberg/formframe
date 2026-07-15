import type { TypedTree } from '@formframe/core'
import { present, defaultPresentation } from '@formframe/core'
import type { ZodType } from 'zod'
import type { FormShapeOf } from './infer'
import { compileRoot } from './compile'

/**
 * Compile a Zod schema into the neutral @formframe/core tree (ADR 034), branded
 * with its resolved {@link FormShapeOf} (ADR 042).
 *
 * The Zod front-end transcribes the schema into the neutral tree by DIRECT
 * introspection (no Zod → JSON Schema round-trip) — it calls Core's neutral
 * builders (ADR 033 §3) — then the shipped default presentation runs over it:
 * scalar-choice array containers collapse into one multiselect/checkboxes leaf
 * (ADR 030 §3) and every leaf gets its widget/parts. All *lowering* lives in
 * present(), never the front-end. `useFormTree` re-runs present() with a consumer
 * resolver layered on top, identity-preservingly. `S` is captured from the passed
 * schema value (a Zod schema is already a precise type) so paths/values narrow off
 * it; the `FormShapeOf<S>` brand is a compile-time phantom (ADR 042 §3), so the
 * runtime value is an ordinary tree and the cast is honest.
 */
export function zodToTree<S extends ZodType>(
  schema: S
): TypedTree<FormShapeOf<S>, ZodType> {
  return present<ZodType>(
    compileRoot(schema),
    defaultPresentation
  ) as unknown as TypedTree<FormShapeOf<S>, ZodType>
}
