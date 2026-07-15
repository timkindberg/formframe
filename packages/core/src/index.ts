/**
 * @formframe/core
 *
 * Headless, schema-agnostic form-tree IR + the present() fold (ADR 033).
 * Zero dependencies. No framework coupling. Front-ends (e.g.
 * @formframe/input-jsonschema) compile a schema INTO this tree via the
 * neutral builders below; Core reads no schema language itself.
 */

export const VERSION = '0.0.0'

// Export types
export type {
  NodeType,
  AnyNode,
  ContainerNode,
  FieldNode,
  FieldFacts,
  NodeFacts,
  LeafFacts,
  ContainerFacts,
  ItemDescriptor,
  AnyFacts,
  ValueShape,
  FieldControl,
  ControlKind,
  WidgetName,
  GroupNode,
  ArrayNode,
  ArrayItemNode,
  WalkHandlers,
  AnyGroupNode,
  AnyTreeNode,
  FieldParts,
  FieldPartsBase,
  HtmlInputAttrs,
  HtmlSelectAttrs,
  HtmlTextareaAttrs,
  HtmlOptionInputAttrs,
  HtmlInputType,
  SelectOption,
  ChoiceOption,
  GroupParts,
  ArrayParts,
  ArrayItemParts,
  ValidationError,
  ValidationResult,
  Validator,
} from './types'

// Neutral builders (ADR 033 §3) — a front-end produces neutral facts/parts/
// children and calls these to assemble the tree. They read NO schema language.
export { createFieldNode } from './parser/fieldNode'
export { createGroupNode } from './parser/groupNode'
export { createArrayNode, createArrayItemNode } from './parser/arrayNode'
export type { ValidationRules } from './parser/utils'

// Presentation stage (ADR 029) — assigns a widget + derives control parts from
// neutral FieldFacts via a source-agnostic layered resolver. Runs between parse
// and render (wired by `useFormTree`).
export {
  present,
  defaultPresentation,
  OPTION_COUNT_THRESHOLD,
  layered,
  deriveControl,
  deriveFieldParts,
  isContainerFacts,
  overrideWidgets,
  WIDGET_CONTROL_KIND,
} from './present/present'
export type {
  Presentation,
  PresentationResolver,
  WidgetToControlKind,
} from './present/present'

// Typed-tree binding surface (ADR 048) — the neutral `FormShape` a front-end
// brands its tree with, the widget→control→parts composition (moved out of the
// front-ends so React can bind generically), and the `TypedTree` phantom brand.
export type {
  DescriptionState,
  ControlForWidget,
  FieldPartsData,
  GroupPartsData,
  FormShape,
  TypedTree,
  TreeShapeOf,
} from './present/formShape'

// JSON Pointer ↔ tree dot-path helpers (ADR 018) — shared with validation
// adapters and the JSON Schema front-end (its $ref resolver).
export {
  jsonPointerToPath,
  joinPath,
  decodeJsonPointerSegment,
} from './jsonPointer'

// Validation capability slot (ADR 019) — the neutral, side-loaded contract.
// Adapters (e.g. @formframe/validation-ajv) implement `Validator`.
export { groupErrorsByPath } from './validation'

// Standard Schema interop (ADR 026) — let the Validator seam emit/consume the
// cross-library https://standardschema.dev interface (RHF, TanStack Form, Zod…).
export { toStandardSchema, fromStandardSchema } from './standardSchema'
export type {
  StandardSchemaV1,
  StandardSchemaV1Props,
  StandardSchemaV1Result,
  StandardSchemaV1Issue,
} from './standardSchema'

// Continuation engine (ADR 014) — the generic, front-end-agnostic fold that
// React/vanilla/… renderers instantiate at their own result type `R`.
export { createContinuation, mergeAdapter } from './continuation/engine'
export type {
  ENode,
  EField,
  EGroup,
  EArray,
  EArrayItem,
  Resolver,
  AnySchemaResolver,
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
