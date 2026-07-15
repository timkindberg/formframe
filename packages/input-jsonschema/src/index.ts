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
// renderNodeRules narrowing. Framework-agnostic. The per-path PARTS bag is NOT
// re-exported here: its single public source is Core's `FieldPartsData` /
// `GroupPartsData`, which a React binding maps onto the `parts` slots (bd bh7.11).
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
  DescriptionStateOf,
  FormShapeOf,
} from './infer'
