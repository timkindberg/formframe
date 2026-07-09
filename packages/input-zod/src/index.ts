/**
 * @jsonschema-form/input-zod
 *
 * The Zod front-end (ADR 034): compiles a Zod schema into the neutral
 * @jsonschema-form/core form tree by direct introspection of Zod's internal
 * schema definition (no Zod → JSON Schema conversion). Core imports nothing from
 * here — the dependency points one way (front-end → Core).
 */

export const VERSION = '0.0.0'

export { zodToTree } from './zodToTree'
