// The JSON Schema front-end's own types (ADR 033 §4). Core no longer knows the
// JSON Schema type; it lives here with the front-end that reads it.

import type { JSONSchema } from 'json-schema-typed/draft-07'

export type { JSONSchema }

// JSONSchema can be a boolean in draft-07, but we only compile object schemas.
export type JSONSchemaObject = Exclude<JSONSchema, boolean>
