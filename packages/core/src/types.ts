// Core type definitions for JSON Schema Form.
// The node interfaces live in ./parser/nodeTypes; this file is the public surface.

import type { JSONSchema } from 'json-schema-typed/draft-07'

export type { JSONSchema }

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
} from './parser/nodeTypes'

export type { ValidationIssue, ValidationResult, Validator } from './validation'

export type { InferData, FieldPath } from './infer'
