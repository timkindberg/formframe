// Core type definitions. The node interfaces live in ./parser/nodeTypes; this
// file is the public type surface. Core is schema-agnostic (ADR 033) — the
// JSONSchema type lives in @jsonschema-form/input-jsonschema, not here.

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
  FieldParts,
  FieldPartsBase,
  HtmlInputAttrs,
  HtmlSelectAttrs,
  HtmlTextareaAttrs,
  HtmlOptionInputAttrs,
  HtmlInputType,
  SelectOption,
  ChoiceOption,
  GroupNode,
  GroupParts,
  ArrayNode,
  ArrayParts,
  ArrayItemNode,
  ArrayItemParts,
  WalkHandlers,
  AnyGroupNode,
  AnyTreeNode,
} from './parser/nodeTypes'

export type { ValidationError, ValidationResult, Validator } from './validation'
