import { useMemo, type FC, type ReactNode } from 'react'
import { jsonSchemaToTree } from '@jsonschema-form/core'
import type { JSONSchema } from '@jsonschema-form/core'
import {
  SchemaFields as SchemaFieldsRenderer,
  type EGroup,
  type RenderNode,
} from './renderer'

/**
 * Props accepted by the `SchemaFields` component returned from `useSchemaForm`.
 * Same as {@link SchemaFieldsProps} minus `form` (the hook holds the tree).
 */
export interface BoundSchemaFieldsProps {
  /** Per-node hijack (ADR 010). Omit to render every node's default. */
  renderNode?: RenderNode
  /** Place-yourself at the root: receives the enriched root node. */
  children?: (root: EGroup) => ReactNode
}

/**
 * Convenience hook: compiles a JSON Schema into the Core form tree and hands
 * back a `SchemaFields` component already bound to it. Pure sugar over the
 * renderer (ADR 010/013) — `useSchemaForm` holds the tree and forwards
 * `renderNode`/place-yourself children to the same continuation.
 *
 * `SchemaFields` renders the form's *content only* — wrap it in your own
 * `<form>` and submit (chrome is the consumer's, ADR 013):
 *
 * @example
 * ```tsx
 * const { form, SchemaFields } = useSchemaForm(schema)
 * return (
 *   <form onSubmit={form.submit(onSubmit)}>
 *     <SchemaFields />
 *     <button type="submit">Submit</button>
 *   </form>
 * )
 * ```
 */
export function useSchemaForm(schema: JSONSchema) {
  const form = useMemo(() => jsonSchemaToTree(schema), [schema])

  const SchemaFields = useMemo<FC<BoundSchemaFieldsProps>>(() => {
    return function SchemaFields({ renderNode, children }: BoundSchemaFieldsProps) {
      return (
        <SchemaFieldsRenderer form={form} renderNode={renderNode}>
          {children}
        </SchemaFieldsRenderer>
      )
    }
  }, [form])

  return { form, SchemaFields }
}
