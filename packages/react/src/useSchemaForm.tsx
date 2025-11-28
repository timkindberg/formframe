import React, { useMemo } from 'react'
import { parseSchema } from '@jsonschema-form/core'
import type { JSONSchema, GroupNode, WalkHandlers } from '@jsonschema-form/core'
import { DefaultRootTemplate } from './DefaultRootTemplate'
import { DefaultFieldTemplate } from './DefaultFieldTemplate'
import { DefaultGroupTemplate } from './DefaultGroupTemplate'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface UseSchemaFormOptions {
  // Future: custom components, validation, etc.
}

export interface FormProps {
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void
}

export interface UseSchemaFormReturn {
  form: GroupNode
  Form: React.FC<FormProps>
}

/**
 * React hook that creates a form from a JSON Schema
 * Returns a Form component with default rendering using DefaultRootTemplate/Field/GroupTemplate
 *
 * @example
 * ```tsx
 * function MyForm() {
 *   const { Form } = useSchemaForm(schema)
 *
 *   return <Form onSubmit={handleSubmit} />
 * }
 * ```
 */
export function useSchemaForm(
  schema: JSONSchema,
  _options?: UseSchemaFormOptions
): UseSchemaFormReturn {
  // Parse schema once and memoize
  const form = useMemo(() => parseSchema(schema), [schema])

  // Create Form component that uses default handlers
  const Form: React.FC<FormProps> = ({ onSubmit }) => {
    const handlers: WalkHandlers<JSX.Element> = {
      field: (node) => <DefaultFieldTemplate node={node} />,
      group: (node, handlers) => (
        <DefaultGroupTemplate node={node}>
          {node.walk(handlers)}
        </DefaultGroupTemplate>
      ),
    }

    const children = form.walk(handlers)

    // Wrap the walked children in the root template
    return (
      <DefaultRootTemplate onSubmit={onSubmit}>{children}</DefaultRootTemplate>
    )
  }

  return { form, Form }
}
