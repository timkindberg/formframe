/**
 * @jsonschema-form/react
 *
 * React adapter for JSON Schema forms.
 */

// React hook
export { useSchemaForm } from './useSchemaForm'
export type {
  BoundSchemaFieldsProps,
  UseSchemaFormOptions,
} from './useSchemaForm'

// Continuation renderer (ADR 010/013) — typed, front-end-agnostic (operates on
// the Core tree). The JSON Schema entry point lives only in useSchemaForm.
//
// `SchemaFields` is batteries-included; `createRenderer` is the public floor
// (bind a partial renderer set; gaps fall back to `diagnosticAdapter` markers);
// spread `defaultAdapter` to override entries by reference.
export {
  SchemaFields,
  createRenderer,
  defaultAdapter,
  diagnosticAdapter,
  ValidationProvider,
  useFieldIssues,
  useFieldErrorDisplay,
  useDisplayPolicy,
  useValidationIssues,
  fieldControlId,
  fieldErrorId,
} from './renderer'
// Error-display policy (ADR 027): touched-gated / submit-gated error visibility.
export {
  shouldDisplayFieldErrors,
  DEFAULT_SHOW_ERRORS_WHEN,
  type ShowErrorsWhen,
} from './displayPolicy'
export { ValidationSummary } from './ValidationSummary'
export type {
  SchemaFieldsProps,
  RenderNode,
  ReactAdapter,
  ReactPartialAdapter,
  ENode,
  EField,
  EGroup,
  EArray,
  EArrayItem,
} from './renderer'
