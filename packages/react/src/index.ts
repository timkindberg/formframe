/**
 * @jsonschema-form/react
 *
 * React adapter for Core form trees from any schema front-end.
 */

// Source-agnostic React hook
export { useFormTree } from './useFormTree'
export type {
  BoundSchemaFieldsProps,
  FormTreeValidation,
  UseFormTreeOptions,
} from './useFormTree'

// Continuation renderer (ADR 010/013) — typed, front-end-agnostic (operates on
// the Core tree). Schema compilation lives in separate input packages.
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
  useFieldErrors,
  useFieldErrorDisplay,
  useDisplayPolicy,
  useValidationErrors,
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
