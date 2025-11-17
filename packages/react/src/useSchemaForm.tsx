import React, { useMemo } from 'react'
import { parseSchema } from '@jsonschema-form/core'
import type { JSONSchema, GroupNode } from '@jsonschema-form/core'
import { DefaultRoot } from './DefaultRoot'
import { DefaultField } from './DefaultField'
import { DefaultGroup } from './DefaultGroup'

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
 * Returns a Form component with default rendering using DefaultRoot/Field/Group
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
  options?: UseSchemaFormOptions
): UseSchemaFormReturn {
  // Parse schema once and memoize
  const form = useMemo(() => parseSchema(schema), [schema])

  // Create Form component that uses default handlers
  const Form: React.FC<FormProps> = ({ onSubmit }) => {
    const result = form.walk({
      root: (node) => <DefaultRoot node={node} onSubmit={onSubmit} />,
      field: (node) => <DefaultField node={node} />,
      group: (node) => <DefaultGroup node={node} />,
    })

    // walk returns an array, but with root handler it's a single element
    return <>{result}</>
  }

  return { form, Form }
}

