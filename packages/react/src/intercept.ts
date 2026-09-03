// Intercept sugar (ADR 051) — path maps and `{ paths, where }` bags lower to the
// function-floor `Intercept` via `interceptRules`, reusing its handler/parts
// machinery (ADR 047 §1–§2). Stabilized by handler/predicate identity so a
// hoisted map (new object each render, same Handler references) does not remount.

import type { ReactNode } from 'react'
import type { DefaultParts, ENode, RenderHelpers } from './renderer'
import {
  interceptRules,
  partsInterceptHandler,
  type NodeHandler,
  type RuleRegistrar,
} from './interceptRules'

/** The function floor — hand-written `(node, { Default, Children }) => …`. */
export type InterceptFn = (node: ENode, helpers: RenderHelpers) => ReactNode

/**
 * Mounted handler for a path-map / bag value. Parameter is `never` so any
 * field/group/array handler is assignable — `FieldProps<Shape, P>` / `GroupProps`
 * are not subtypes of the floor union (`parts` bags differ), so a union of
 * `FieldHandlerProps | GroupHandlerProps | …` is not enough under
 * `strictFunctionTypes`. Same “accept the handler you wrote” goal as the
 * method-bivariance trick.
 */
export type InterceptHandler = {
  bivarianceHack(props: never): ReactNode
}['bivarianceHack']

/** Known part keys — discriminate a parts object from a nested path map (ADR 051). */
export const INTERCEPT_PART_KEYS = [
  'root',
  'label',
  'description',
  'control',
  'errors',
  'addButton',
  'removeButton',
] as const

export type InterceptPartKey = (typeof INTERCEPT_PART_KEYS)[number]

const INTERCEPT_PART_KEY_SET: ReadonlySet<string> = new Set(INTERCEPT_PART_KEYS)

/**
 * Parts-object map value. Non-root keys are the same type `<Default parts>`
 * already takes (part renderers: part data → ReactNode). `{ root: Handler }`
 * is the long form of passing Handler directly — `root` is the template slot,
 * not a Default `parts` key.
 */
export type InterceptParts = DefaultParts & {
  root?: InterceptHandler
}

/** Path-map / bag `paths` value: a node handler or a parts object. */
export type InterceptMapValue = InterceptHandler | InterceptParts

/** Shorthand path map: `{ email: EmailHint, 'address.street': StreetHint }`. */
export type InterceptMap = Record<string, InterceptMapValue>

/** Predicate + handler tuple for the `where` axis. */
export type InterceptWhereRule = [
  predicate: (node: ENode) => boolean,
  Handler: InterceptHandler,
]

/** Bag with optional `paths` and `where` axes. */
export interface InterceptBag {
  paths?: InterceptMap
  where?: InterceptWhereRule[]
}

/** `intercept` prop — function floor, path map, or bag (ADR 051). */
export type Intercept = InterceptFn | InterceptMap | InterceptBag

export function isInterceptFn(value: Intercept): value is InterceptFn {
  return typeof value === 'function'
}

export function isInterceptParts(value: unknown): value is InterceptParts {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const keys = Object.keys(value)
  if (keys.length === 0) return false
  const obj = value as Record<string, unknown>
  return keys.every(
    (k) => INTERCEPT_PART_KEY_SET.has(k) && typeof obj[k] === 'function'
  )
}

function isPathMapValue(value: unknown): value is InterceptMapValue {
  return typeof value === 'function' || isInterceptParts(value)
}

function isHandlerMap(value: unknown): value is InterceptMap {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isPathMapValue)
  )
}

function isWhereRules(value: unknown): value is InterceptWhereRule[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === 'function' &&
        typeof entry[1] === 'function'
    )
  )
}

/** Bag: `paths` is a handler map and/or `where` is `[pred, Handler][]` — not field names. */
export function isInterceptBag(value: Intercept): value is InterceptBag {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const obj = value as Record<string, unknown>
  const hasPathsBag =
    Object.prototype.hasOwnProperty.call(obj, 'paths') &&
    isHandlerMap(obj.paths)
  const hasWhereBag =
    Object.prototype.hasOwnProperty.call(obj, 'where') &&
    isWhereRules(obj.where)
  return hasPathsBag || hasWhereBag
}

declare const process: { env: { NODE_ENV?: string } } | undefined

function warnInvalidPathMapValue(path: string, value: unknown): void {
  if (
    typeof process !== 'undefined' &&
    process.env.NODE_ENV !== 'production' &&
    typeof value === 'object' &&
    value !== null
  ) {
    console.warn(
      `[formframe] intercept path-map: "${path}" value is a nested object, not a handler component. Use dotted paths (e.g. 'address.street').`
    )
  }
}

function registerPath(
  r: RuleRegistrar,
  path: string,
  value: InterceptMapValue
): void {
  if (typeof value === 'function') {
    // Kind-agnostic exact path — registered via `where` after bag `where` rules so
    // path keys beat predicates at equal specificity (later wins).
    r.where((n) => n.path === path, value as NodeHandler)
    return
  }
  if (isInterceptParts(value)) {
    r.where((n) => n.path === path, partsInterceptHandler(value))
    return
  }
  warnInvalidPathMapValue(path, value)
}

function lowerInterceptMap(map: InterceptMap): InterceptFn {
  return interceptRules((r) => {
    for (const [path, value] of Object.entries(map)) {
      registerPath(r, path, value)
    }
  })
}

function lowerInterceptBag(bag: InterceptBag): InterceptFn {
  return interceptRules((r) => {
    for (const [predicate, Handler] of bag.where ?? []) {
      r.where(predicate, Handler as NodeHandler)
    }
    for (const [path, value] of Object.entries(bag.paths ?? {})) {
      registerPath(r, path, value)
    }
  })
}

const loweredCache = new Map<string, InterceptFn>()

function cacheKey(deps: unknown[]): string {
  return deps
    .map((d) => (typeof d === 'function' ? `fn:${d}` : String(d)))
    .join('\0')
}

function pushMapValueDeps(
  deps: unknown[],
  path: string,
  value: InterceptMapValue
): void {
  deps.push(path)
  if (typeof value === 'function') {
    deps.push(value)
    return
  }
  for (const k of Object.keys(value).sort()) {
    deps.push(k, value[k as InterceptPartKey])
  }
}

/** Lower map/bag sugar to the function floor; pass functions through. Cached by handler/pred identity. */
export function resolveIntercept(intercept: Intercept): InterceptFn {
  if (isInterceptFn(intercept)) return intercept
  const key = cacheKey(interceptStabilityDeps(intercept))
  let fn = loweredCache.get(key)
  if (!fn) {
    fn = isInterceptBag(intercept)
      ? lowerInterceptBag(intercept)
      : lowerInterceptMap(intercept)
    loweredCache.set(key, fn)
  }
  return fn
}

/** Dependency list for stabilizing map/bag across new object identities each render.
 *
 * `undefined` and the function floor both yield a ONE-entry list on purpose.
 * React compares only the overlapping prefix of a resized dep list, so an empty
 * list for `undefined` compared equal to `[fn]` over zero entries and a
 * `intercept={undefined}` → `intercept={fn}` toggle kept the stale resolver
 * (#168). Same length, different entry, so the memo now invalidates. */
export function interceptStabilityDeps(
  intercept: Intercept | undefined
): unknown[] {
  if (intercept === undefined || isInterceptFn(intercept)) return [intercept]
  if (isInterceptBag(intercept)) {
    const deps: unknown[] = []
    const paths = intercept.paths ?? {}
    for (const p of Object.keys(paths).sort()) {
      pushMapValueDeps(deps, p, paths[p]!)
    }
    for (const [pred, h] of intercept.where ?? []) deps.push(pred, h)
    return deps
  }
  const deps: unknown[] = []
  for (const p of Object.keys(intercept).sort()) {
    pushMapValueDeps(deps, p, intercept[p]!)
  }
  return deps
}
