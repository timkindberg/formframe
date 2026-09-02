// RECIPE (unknown-shape rule_schema → field mode):
//
// Copy with `ajvValidator.recipe.ts` when you pass `{ fieldMode }` into
// `createAjvValidator`. FormFrame does not evaluate rules (ADR 056).
//
//   const fieldMode = createFieldMode(rules)
//   const validate = createAjvValidator(schema, { fieldMode })
//   const { isHidden, isRequired, isReadOnly, setValues } = fieldMode(values)
//
// `createFieldMode` includes a tiny JRES-like matcher so this gallery does not
// depend on `json-rules-engine-simplified`. A host that already has an engine
// keeps `withFieldMode` and replaces only the matcher: fold that engine's
// events into the same snapshot shape (`remove` → hidden, `require` →
// required, `setReadOnly`/`disable` → readOnly, `setValue` → setValues).
//
// `withFieldMode` is the Validator wrap (native / Zod / a hand-rolled
// validator). The AJV helper's `{ fieldMode }` option is sugar on top.
import type { Validator, ValidationError } from '@formframe/core'

/** JRES-shaped demo encoding. Not a FormFrame DSL — swap the matcher. */
export type UiRuleEvent =
  | { type: 'remove'; params: { field: string } }
  | { type: 'require'; params: { field: string } }
  | { type: 'setValue'; params: { field: string; value: unknown } }
  | { type: 'setReadOnly'; params: { field: string } }
  | { type: 'readonly'; params: { field: string } }
  | { type: 'disable'; params: { field: string } }

export type UiRule = {
  conditions?: unknown
  event?: UiRuleEvent | UiRuleEvent[]
}

export type FieldModeSnapshot = {
  isHidden: (path: string) => boolean
  isRequired: (path: string) => boolean
  isReadOnly: (path: string) => boolean
  hidden: ReadonlySet<string>
  required: ReadonlySet<string>
  readOnly: ReadonlySet<string>
  /** Host applies these. Last matching write wins. `null` means clear. */
  setValues: Readonly<Record<string, unknown>>
}

/** `(values) => snapshot`, plus the condition paths to `useWatch`. */
export type FieldMode = ((values: unknown) => FieldModeSnapshot) & {
  paths: readonly string[]
}

/**
 * Compile JSON rules into a field-mode query. Same function drives field UI
 * (`fieldMode(values)`) and validation (`createAjvValidator(schema, { fieldMode })`).
 */
export function createFieldMode(rules: readonly UiRule[]): FieldMode {
  const paths = collectConditionPaths(rules)
  function fieldMode(values: unknown): FieldModeSnapshot {
    const folded = foldMatchingEvents(rules, values)
    const hidden = folded.hidden
    const required = new Set(
      [...folded.required].filter((path) => !hidden.has(path))
    )
    const readOnly = folded.readOnly
    return {
      isHidden: (path) => hidden.has(path),
      isRequired: (path) => required.has(path),
      isReadOnly: (path) => readOnly.has(path),
      hidden,
      required,
      readOnly,
      setValues: folded.setValues,
    }
  }
  fieldMode.paths = paths
  return fieldMode
}

/**
 * Wrap any FormFrame `Validator` so one run agrees with field mode: omit
 * hidden paths on a clone (so hide-and-clear `null` does not fail `type`),
 * drop errors on hidden paths, inject `required` for field-mode required
 * blanks. Derives mode from the **data being validated**, not React state.
 * Does not rewrite the JSON Schema or recompile AJV. Hidden paths are
 * deleted on a clone of the input, not copied-off one key at a time.
 */
export function withFieldMode<T>(
  validator: Validator<T>,
  fieldMode: (data: unknown) => FieldModeSnapshot
): Validator<T> {
  return (data) => {
    const mode = fieldMode(data)
    const projected = omitPaths(cloneJsonish(data), mode.hidden)
    const result = validator(projected)
    const errors = projectErrors(result.errors, mode, data)
    return {
      valid: errors.length === 0,
      errors,
      data: result.data,
    }
  }
}

export function isBlank(value: unknown): boolean {
  if (value == null || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  return false
}

export function getAt(values: unknown, path: string): unknown {
  if (values == null || path === '') return values
  let cur: unknown = values
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

type Folded = {
  hidden: Set<string>
  required: Set<string>
  readOnly: Set<string>
  setValues: Record<string, unknown>
}

function foldMatchingEvents(rules: readonly UiRule[], values: unknown): Folded {
  const folded: Folded = {
    hidden: new Set(),
    required: new Set(),
    readOnly: new Set(),
    setValues: {},
  }
  for (const rule of rules) {
    if (!matchCondition(rule.conditions, values)) continue
    const events = Array.isArray(rule.event)
      ? rule.event
      : rule.event
        ? [rule.event]
        : []
    for (const event of events) applyEvent(folded, event)
  }
  return folded
}

function applyEvent(folded: Folded, event: UiRuleEvent): void {
  switch (event.type) {
    case 'remove':
      folded.hidden.add(event.params.field)
      return
    case 'require':
      folded.required.add(event.params.field)
      return
    case 'setValue':
      folded.setValues[event.params.field] = event.params.value
      return
    case 'setReadOnly':
    case 'readonly':
    case 'disable':
      folded.readOnly.add(event.params.field)
      return
  }
}

function matchCondition(cond: unknown, values: unknown): boolean {
  if (cond == null) return true
  if (typeof cond !== 'object') return false
  if (Array.isArray(cond)) {
    return cond.every((c) => matchCondition(c, values))
  }
  const obj = cond as Record<string, unknown>
  if (Array.isArray(obj.and)) {
    return obj.and.every((c) => matchCondition(c, values))
  }
  if (Array.isArray(obj.or)) {
    return obj.or.some((c) => matchCondition(c, values))
  }
  if ('not' in obj && isConditionNot(obj.not)) {
    return !matchCondition(obj.not, values)
  }
  return Object.entries(obj).every(([path, test]) =>
    matchPathTest(getAt(values, path), test)
  )
}

function isConditionNot(not: unknown): not is Record<string, unknown> {
  if (not == null || typeof not !== 'object' || Array.isArray(not)) return false
  const keys = Object.keys(not)
  return (
    keys.includes('and') ||
    keys.includes('or') ||
    keys.includes('not') ||
    keys.some((k) => k !== 'eq' && k !== 'is' && k !== 'in' && k !== 'not')
  )
}

function matchPathTest(value: unknown, test: unknown): boolean {
  if (test === 'empty') return isBlank(value)
  if (test === 'truthy') return Boolean(value)
  if (test === 'falsey' || test === 'falsy') return !value
  if (test !== null && typeof test !== 'object') {
    return same(value, test)
  }
  if (test !== null && typeof test === 'object') {
    const t = test as Record<string, unknown>
    if ('not' in t) return !matchPathTest(value, t.not)
    if ('eq' in t) return same(value, t.eq)
    if ('is' in t) return same(value, t.is)
    if ('in' in t && Array.isArray(t.in)) {
      return t.in.some((candidate) => same(value, candidate))
    }
    if ('less' in t || 'lessEq' in t || 'greater' in t || 'greaterEq' in t) {
      return matchCompare(value, t)
    }
  }
  return false
}

function matchCompare(value: unknown, t: Record<string, unknown>): boolean {
  const n = Number(value)
  if (!Number.isFinite(n)) return false
  if ('less' in t) return n < Number(t.less)
  if ('lessEq' in t) return n <= Number(t.lessEq)
  if ('greater' in t) return n > Number(t.greater)
  if ('greaterEq' in t) return n >= Number(t.greaterEq)
  return false
}

function same(a: unknown, b: unknown): boolean {
  return a === b || (a == null && b == null)
}

const COMPOSITE = new Set(['and', 'or', 'not'])

function collectConditionPaths(rules: readonly UiRule[]): string[] {
  const paths = new Set<string>()
  for (const rule of rules) walkCondition(rule.conditions, paths)
  return [...paths]
}

function walkCondition(cond: unknown, paths: Set<string>): void {
  if (cond == null || typeof cond !== 'object') return
  if (Array.isArray(cond)) {
    for (const c of cond) walkCondition(c, paths)
    return
  }
  const obj = cond as Record<string, unknown>
  if (Array.isArray(obj.and)) walkCondition(obj.and, paths)
  if (Array.isArray(obj.or)) walkCondition(obj.or, paths)
  if ('not' in obj && isConditionNot(obj.not)) walkCondition(obj.not, paths)
  for (const key of Object.keys(obj)) {
    if (!COMPOSITE.has(key)) paths.add(key)
  }
}

function projectErrors(
  errors: ValidationError[],
  mode: FieldModeSnapshot,
  data: unknown
): ValidationError[] {
  const next = errors.filter((error) => !isHiddenPath(error.path, mode))
  for (const path of mode.required) {
    if (mode.isHidden(path) || !isBlank(getAt(data, path))) continue
    if (next.some((e) => e.path === path && e.keyword === 'required')) continue
    next.push({
      path,
      message: 'is required',
      keyword: 'required',
    })
  }
  return next
}

function isHiddenPath(path: string, mode: FieldModeSnapshot): boolean {
  if (mode.isHidden(path)) return true
  for (const hidden of mode.hidden) {
    if (path === hidden || path.startsWith(`${hidden}.`)) return true
  }
  return false
}

/** Mutates `data`. Caller must pass a clone (`withFieldMode` does). */
function omitPaths(data: unknown, paths: Iterable<string>): unknown {
  for (const path of paths) omitPath(data, path)
  return data
}

function omitPath(data: unknown, path: string): void {
  if (data == null || typeof data !== 'object' || path === '') return
  omitPathParts(data, path.split('.'))
}

function omitPathParts(data: unknown, parts: string[]): void {
  if (data == null || typeof data !== 'object') return
  const [head, ...rest] = parts
  if (Array.isArray(data)) {
    const index = Number(head)
    if (!Number.isInteger(index) || index < 0 || index >= data.length) return
    if (rest.length === 0) {
      data.splice(index, 1)
      return
    }
    omitPathParts(data[index], rest)
    return
  }
  const rec = data as Record<string, unknown>
  if (!(head in rec)) return
  if (rest.length === 0) {
    delete rec[head]
    return
  }
  omitPathParts(rec[head], rest)
}

function cloneJsonish(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJsonish)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = cloneJsonish((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}
