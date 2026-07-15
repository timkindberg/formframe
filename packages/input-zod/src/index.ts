/**
 * @formframe/input-zod
 *
 * The Zod front-end (ADR 034): compiles a Zod schema into the neutral
 * @formframe/core form tree by direct introspection of Zod's internal
 * schema definition (no Zod → JSON Schema conversion). Core imports nothing from
 * here — the dependency points one way (front-end → Core).
 */

export const VERSION = '0.0.0'

export { zodToTree } from './zodToTree'
// Path-narrowed presentation types (ADR 041 §4 / bd jsonschema-form-bh7) — the
// Zod sister of input-jsonschema's inference layer, same names/semantics so a
// React binding differs only by import source. Framework-agnostic (Core deps).
export type {
  SchemaAt,
  KindOf,
  FieldPath,
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
