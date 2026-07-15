/**
 * @formframe/input-jsonschema
 *
 * The JSON Schema front-end (ADR 033): compiles a JSON Schema into the neutral
 * @formframe/core form tree via Core's neutral builders. Core imports
 * nothing from here — the dependency points one way (front-end → Core).
 */

export const VERSION = '0.0.0'

export { jsonSchemaToTree } from './jsonSchemaToTree'
export type { JSONSchema, JSONSchemaObject } from './types'
export type { InferData, FieldPath } from './infer'
// Path-narrowed presentation types (ADR 047 §4) — the schema-owning half of the
// customize narrowing. Framework-agnostic; a React binding maps `*PartsFor` DATA
// payloads onto the customize `parts` slots.
export type {
  SchemaAt,
  KindOf,
  FieldPaths,
  GroupPaths,
  ArrayPaths,
  ValueAt,
  NodeAt,
  DefaultWidgetAt,
  WidgetAt,
  NoOverrides,
  ControlKindAt,
  ControlAt,
  HasDescription,
  FieldPartsFor,
  GroupPartsFor,
  DescriptionStateOf,
  FormShapeOf,
} from './infer'
