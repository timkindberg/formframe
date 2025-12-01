import React, { useMemo } from 'react'
import { parseSchema } from '@jsonschema-form/core'
import type { JSONSchema, GroupNode } from '@jsonschema-form/core'
import { DefaultRootTemplate } from './DefaultRootTemplate'
import { DefaultFieldTemplate } from './DefaultFieldTemplate'
import { DefaultGroupTemplate } from './DefaultGroupTemplate'
import {
  DefaultArrayTemplate,
  DefaultArrayItemTemplate,
} from './DefaultArrayTemplate'

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

  // Memoize Form component to maintain stable identity across renders
  const Form = useMemo(() => {
    const FormComponent: React.FC<FormProps> = ({ onSubmit }) => {
      // Memoize the walk result - handlers defined inside so they don't need to be deps
      const children = useMemo(() => {
        return form.walk({
          field: (node) => <DefaultFieldTemplate key={node.path} node={node} />,
          group: (node, handlers) => (
            <DefaultGroupTemplate key={node.path} node={node}>
              {node.walk(handlers)}
            </DefaultGroupTemplate>
          ),
          array: (node, handlers) => (
            <DefaultArrayTemplate
              key={node.path}
              node={node}
              handlers={handlers}
            />
          ),
          arrayItem: (node, handlers) => (
            <DefaultArrayItemTemplate key={node.path} node={node}>
              {node.walk(handlers)}
            </DefaultArrayItemTemplate>
          ),
        })
      }, [])

      return (
        <DefaultRootTemplate onSubmit={onSubmit}>
          {children}
        </DefaultRootTemplate>
      )
    }
    return FormComponent
  }, [form])

  return { form, Form }
}
