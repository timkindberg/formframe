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
export { DefaultRootTemplate } from './DefaultRootTemplate'
export { DefaultFieldTemplate } from './DefaultFieldTemplate'
export { DefaultGroupTemplate } from './DefaultGroupTemplate'
export {
  DefaultArrayTemplate,
  DefaultArrayItemTemplate,
  useArrayField,
  useArrayItem,
  ArrayItemContext,
} from './DefaultArrayTemplate'
export type { DefaultRootProps } from './DefaultRootTemplate'
export type { DefaultFieldProps } from './DefaultFieldTemplate'
export type { DefaultGroupProps } from './DefaultGroupTemplate'
export type {
  DefaultArrayProps,
  DefaultArrayItemProps,
  UseArrayFieldReturn,
  ArrayContext,
} from './DefaultArrayTemplate'
