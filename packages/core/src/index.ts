/**
 * @jsonschema-form/core
 *
 * Headless foundation for JSON Schema form generation.
 * Zero dependencies. No framework coupling.
 */

export const VERSION = '0.0.0'

// Export types
export type {
  JSONSchema,
  NodeType,
  AnyNode,
  ContainerNode,
  FieldNode,
  InputFieldNode,
  SelectFieldNode,
  GroupNode,
  ArrayNode,
  ArrayItemNode,
  WalkHandlers,
  FieldParts,
  InputFieldParts,
  SelectFieldParts,
  FieldPartsBase,
  HtmlInputAttrs,
  HtmlSelectAttrs,
  HtmlInputType,
  SelectOption,
  GroupParts,
  ArrayParts,
  ArrayItemParts,
  ValidationIssue,
  ValidationResult,
  Validator,
  InferData,
  FieldPath,
} from './types'

// Export main parser
export { jsonSchemaToTree } from './parser/index'

// JSON Pointer ↔ tree dot-path helpers (ADR 018) — shared with validation adapters.
export { jsonPointerToPath, joinPath } from './jsonPointer'

// Validation capability slot (ADR 019) — the neutral, side-loaded contract.
// Adapters (e.g. @jsonschema-form/validation-ajv) implement `Validator`.
export { groupIssuesByPath } from './validation'

// Continuation engine (ADR 014) — the generic, front-end-agnostic fold that
// React/vanilla/… renderers instantiate at their own result type `R`.
export { createContinuation, mergeAdapter } from './continuation/engine'
export type {
  ENode,
  EField,
  EInputField,
  ESelectField,
  EGroup,
  EArray,
  EArrayItem,
  Resolver,
  RendererAdapter,
  PartialAdapter,
  FieldPartRenderers,
  GroupPartRenderers,
  ArrayPartRenderers,
  ArrayItemPartRenderers,
  Continuation,
  ContinuationOptions,
  ChildResult,
  PartsOverrides,
  PartOverrideMap,
} from './continuation/engine'
