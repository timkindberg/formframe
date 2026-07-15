import type { TypedTree } from '@formframe/core'
import { present, defaultPresentation } from '@formframe/core'
import type { JSONSchema, JSONSchemaObject } from './types'
import type { FormShapeOf } from './infer'
import { compileRoot, isObjectSchema } from './compile'
import { resolveLocalRefs } from './resolveRefs'

/**
 * Compile a JSON Schema into the neutral form tree, branded with its resolved
 * {@link FormShapeOf} (ADR 042). The `const S` capture pins the exact schema
 * literal so paths/values/widgets narrow off it — replacing the old `defineSchema`
 * step: pass an inline schema and React's `useRenderNodeRules(tree, …)` types
 * itself off the brand, importing no front-end.
 */
export function jsonSchemaToTree<const S extends JSONSchema>(
  schema: S
): TypedTree<FormShapeOf<S>, JSONSchemaObject> {
  if (!isObjectSchema(schema)) {
    throw new Error('Boolean schemas are not yet supported')
  }

  const resolvedSchema = resolveLocalRefs(schema)

  // The JSON Schema front-end transcribes the resolved schema into the neutral tree
  // (pure structure — it calls Core's neutral builders, ADR 033 §3), then the
  // shipped default presentation runs over it: scalar-choice array containers
  // collapse into one multiselect/checkboxes leaf (ADR 030 §3) and every leaf gets
  // its widget/parts. All *lowering* lives in present(), never the front-end.
  // `useFormTree` re-runs present() with a consumer resolver layered on top,
  // identity-preservingly. The `FormShapeOf<S>` brand is a compile-time phantom
  // (ADR 042 §3) — the runtime value is an ordinary tree, so the cast is honest.
  return present<JSONSchemaObject>(
    compileRoot(resolvedSchema),
    defaultPresentation
  ) as unknown as TypedTree<FormShapeOf<S>, JSONSchemaObject>
}
