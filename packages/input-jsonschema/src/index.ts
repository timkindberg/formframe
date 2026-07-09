/**
 * @jsonschema-form/input-jsonschema
 *
 * The JSON Schema front-end (ADR 033): compiles a JSON Schema into the neutral
 * @jsonschema-form/core form tree via Core's neutral builders. Core imports
 * nothing from here — the dependency points one way (front-end → Core).
 */

export const VERSION = '0.0.0'

export { jsonSchemaToTree } from './jsonSchemaToTree'
export type { JSONSchema, JSONSchemaObject } from './types'
