import { useMemo, type FC, type FormEvent, type ReactNode } from 'react'
import { jsonSchemaToTree } from '@jsonschema-form/core'
import type { JSONSchema } from '@jsonschema-form/core'
import { FormRenderer, type EGroup, type RenderNode } from './renderer'

/**
 * Props accepted by the `Form` component returned from `useSchemaForm`.
 * These pass straight through to {@link FormRenderer}.
 */
export interface SchemaFormProps {
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void
  /** Per-node hijack (ADR 010). Omit to render every node's default. */
  renderNode?: RenderNode
  /** Place-yourself at the root: receives the enriched root node. */
  children?: (root: EGroup) => ReactNode
}

/**
 * Convenience hook: compiles a JSON Schema into the Core form tree and hands
 * back a ready `Form` component. The hook is pure sugar over
 * {@link FormRenderer} (ADR 010) — `useSchemaForm` holds the tree for you and
 * forwards `renderNode`/place-yourself children to the same continuation engine.
 *
 * @example
 * ```tsx
 * const { Form } = useSchemaForm(schema)
 * return <Form onSubmit={handleSubmit} />
 * ```
 */
export function useSchemaForm(schema: JSONSchema) {
  const form = useMemo(() => jsonSchemaToTree(schema), [schema])

  const Form = useMemo<FC<SchemaFormProps>>(() => {
    return function Form({ onSubmit, renderNode, children }: SchemaFormProps) {
      return (
        <FormRenderer form={form} onSubmit={onSubmit} renderNode={renderNode}>
          {children}
        </FormRenderer>
      )
    }
  }, [form])

  return { form, Form }
}
