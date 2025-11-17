/**
 * @jsonschema-form/react
 *
 * React adapter for JSON Schema forms.
 */

export const VERSION = '0.0.0'

// React hook
export { useSchemaForm } from './useSchemaForm'
export type {
  UseSchemaFormOptions,
  UseSchemaFormReturn,
  FormProps,
} from './useSchemaForm'

// Default component renderers
export { DefaultRoot } from './DefaultRoot'
export { DefaultField } from './DefaultField'
export { DefaultGroup } from './DefaultGroup'
export type { DefaultRootProps } from './DefaultRoot'
export type { DefaultFieldProps } from './DefaultField'
export type { DefaultGroupProps } from './DefaultGroup'
