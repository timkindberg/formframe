// Zod v4 introspection (ADR 034). Zod exposes each schema's definition at
// `schema._zod.def`; `def.type` is the discriminant ('string' | 'number' |
// 'object' | 'array' | 'enum' | 'optional' | 'default' | 'nullable' | …) and the
// rest of `def` carries the type's structure (an object's `shape`, an array's
// `element`, an enum's `entries`, a wrapper's `innerType`, a scalar's `checks`).
// This module is the ONE place that reads those internals; it models only the
// slices the form cares about and casts at a single boundary (`asInternal`), so
// the rest of the front-end works against typed helpers, never `_zod`.

import type { ZodType } from 'zod'
import type { SelectOption } from '@jsonschema-form/core'

/** One entry of `def.checks` (or an inline check on a format schema like `z.int()`). */
interface ZodCheckDef {
  check?: string
  // length checks (string/array)
  minimum?: number
  maximum?: number
  // numeric bound checks (greater_than / less_than)
  value?: number
  inclusive?: boolean
  // string_format check
  format?: string
  pattern?: RegExp
}

/** The slices of `schema._zod.def` this front-end reads. */
interface ZodDef {
  type: string
  checks?: Array<{ _zod: { def: ZodCheckDef } }>
  // A format schema (e.g. `z.int()`) carries its check inline on the def itself.
  check?: string
  format?: string
  pattern?: RegExp
  // wrappers: optional / default / nullable / readonly / catch / prefault …
  innerType?: ZodType
  defaultValue?: unknown
  // array
  element?: ZodType
  // object
  shape?: Record<string, ZodType>
  // enum (name → value) and literal / union
  entries?: Record<string, string | number>
  values?: Array<string | number | boolean | null>
  options?: ZodType[]
}

interface ZodMeta {
  title?: string
  description?: string
}

interface ZodInternals {
  _zod: { def: ZodDef }
  meta?: () => ZodMeta | undefined
  description?: string
}

function asInternal(schema: ZodType): ZodInternals {
  return schema as unknown as ZodInternals
}

/** The raw definition of a schema (`schema._zod.def`). */
export function defOf(schema: ZodType): ZodDef {
  return asInternal(schema)._zod.def
}

/** The kind discriminant of a schema (`def.type`). */
export function typeOf(schema: ZodType): string {
  return defOf(schema).type
}

function checkDefsOf(def: ZodDef): ZodCheckDef[] {
  return (def.checks ?? []).map((c) => c._zod.def)
}

export interface Unwrapped {
  /** The inner, unwrapped schema (no optional/default/nullable/… wrappers). */
  schema: ZodType
  /** True when the wrapper chain makes the value optional (optional/default/prefault). */
  optional: boolean
}

/**
 * Peel wrapper schemas (`optional`, `default`, `nullable`, `readonly`, `catch`,
 * `prefault`, `nonoptional`) down to the underlying type. `optional`/`default`/
 * `prefault` make the OWNING object key optional (its absence is valid); the rest
 * pass through without affecting requiredness. Every wrapper carries `innerType`,
 * so the loop is structural rather than a hard-coded wrapper list.
 */
export function unwrap(schema: ZodType): Unwrapped {
  let current = schema
  let optional = false
  for (;;) {
    const def = defOf(current)
    const inner = def.innerType
    if (!inner) break
    if (
      def.type === 'optional' ||
      def.type === 'default' ||
      def.type === 'prefault'
    ) {
      optional = true
    }
    current = inner
  }
  return { schema: current, optional }
}

const INT_FORMATS = new Set([
  'safeint',
  'int',
  'int32',
  'uint32',
  'int64',
  'uint64',
])

/** Neutral scalar facts read off an unwrapped leaf schema. */
export interface ScalarInfo {
  primitive: 'string' | 'number' | 'integer' | 'boolean'
  format?: string
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  pattern?: string
}

// Zod string formats → the neutral `facts.format` vocabulary `present()` maps to
// an HTML input type. Unlisted formats (uuid, ip, …) pass through unchanged: they
// stay a plain text input but remain readable on `facts.format`.
function mapStringFormat(format: string): string {
  switch (format) {
    case 'datetime':
      return 'date-time'
    default:
      return format
  }
}

/**
 * Read the neutral scalar facts (primitive + format + numeric/length bounds) of
 * an unwrapped leaf schema. Enum/literal/union primitives are settled by the
 * caller from the choice values; here they default to `'string'`.
 */
export function readScalar(schema: ZodType): ScalarInfo {
  const def = defOf(schema)
  const checks = checkDefsOf(def)
  const info: ScalarInfo = { primitive: 'string' }

  if (def.type === 'boolean') {
    info.primitive = 'boolean'
    return info
  }

  if (def.type === 'date') {
    info.primitive = 'string'
    info.format = 'date'
    return info
  }

  if (def.type === 'literal') {
    const first = def.values?.[0]
    if (typeof first === 'number') info.primitive = 'number'
    else if (typeof first === 'boolean') info.primitive = 'boolean'
    return info
  }

  if (def.type === 'number') {
    const isInt =
      (def.format !== undefined && INT_FORMATS.has(def.format)) ||
      checks.some(
        (c) =>
          c.check === 'number_format' &&
          c.format !== undefined &&
          INT_FORMATS.has(c.format)
      )
    info.primitive = isInt ? 'integer' : 'number'
    for (const c of checks) {
      if (c.check === 'greater_than' && typeof c.value === 'number') {
        info.minimum = c.value
      } else if (c.check === 'less_than' && typeof c.value === 'number') {
        info.maximum = c.value
      }
    }
    return info
  }

  // string (and enum/union/literal that fell through) — read length + format checks
  for (const c of checks) {
    if (c.check === 'min_length' && typeof c.minimum === 'number') {
      info.minLength = c.minimum
    } else if (c.check === 'max_length' && typeof c.maximum === 'number') {
      info.maxLength = c.maximum
    } else if (c.check === 'string_format') {
      if (c.format === 'regex' && c.pattern) info.pattern = c.pattern.source
      else if (c.format) info.format = mapStringFormat(c.format)
    }
  }
  return info
}

/** Array-length bounds (`minItems`/`maxItems`) read off an array schema's checks. */
export function readArrayLength(schema: ZodType): {
  minItems?: number
  maxItems?: number
} {
  const out: { minItems?: number; maxItems?: number } = {}
  for (const c of checkDefsOf(defOf(schema))) {
    if (c.check === 'min_length' && typeof c.minimum === 'number') {
      out.minItems = c.minimum
    } else if (c.check === 'max_length' && typeof c.maximum === 'number') {
      out.maxItems = c.maximum
    }
  }
  return out
}

function toOption(value: string | number): SelectOption {
  return { value, label: String(value) }
}

/**
 * The finite option set of a scalar-choice schema — a `z.enum(...)` or a union of
 * `z.literal(...)` (mirroring JSON Schema's `enum` / `oneOf`-`const`). Returns
 * `undefined` for anything open-ended (choices XOR item, ADR 030 §3). Non
 * string/number literal values (booleans, null) are not representable as options,
 * so a union containing them is treated as not-a-choice-set.
 */
export function readChoices(schema: ZodType): SelectOption[] | undefined {
  const def = defOf(schema)

  if (def.type === 'enum' && def.entries) {
    const values = Object.values(def.entries)
    return values.length ? values.map(toOption) : undefined
  }

  if (def.type === 'union' && def.options) {
    const options: SelectOption[] = []
    for (const opt of def.options) {
      const optDef = defOf(opt)
      if (optDef.type !== 'literal' || !optDef.values) return undefined
      for (const v of optDef.values) {
        if (typeof v !== 'string' && typeof v !== 'number') return undefined
        options.push(toOption(v))
      }
    }
    return options.length ? options : undefined
  }

  return undefined
}

/** Metadata (`title`/`description`) from `.meta({...})` or `.describe(...)`,
 * checked on the outer (declared) schema first, then the unwrapped inner. */
export function readMeta(
  outer: ZodType,
  inner: ZodType
): { title?: string; description?: string } {
  const from = (schema: ZodType) => {
    const internals = asInternal(schema)
    const meta =
      typeof internals.meta === 'function' ? internals.meta() : undefined
    return {
      title: meta?.title,
      description: meta?.description ?? internals.description,
    }
  }
  const o = from(outer)
  const n = from(inner)
  return {
    title: o.title ?? n.title,
    description: o.description ?? n.description,
  }
}
