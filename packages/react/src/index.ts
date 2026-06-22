/**
 * @jsonschema-form/react
 *
 * React adapter for JSON Schema forms.
 */

// React hook
export { useSchemaForm } from './useSchemaForm'

// Continuation renderer (ADR 010) — typed, front-end-agnostic (operates on the
// Core tree). The JSON Schema entry point lives only in useSchemaForm.
export { FormRenderer } from './renderer'
export type {
  RenderNode,
  ENode,
  EField,
  EGroup,
  EArray,
  EArrayItem,
} from './renderer'
