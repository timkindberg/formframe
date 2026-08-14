// Intercept sugar (ADR 051) — path maps and `{ paths, where }` bags lower to the
// function-floor `Intercept` via `renderNodeRules`, reusing its handler/parts
// machinery (ADR 047 §1–§2). Stabilized by handler/predicate identity so a
// hoisted map (new object each render, same Handler references) does not remount.

import type { ReactNode } from 'react'
import type { ENode, RenderHelpers } from './renderer'
import {
  renderNodeRules,
  type NodeHandler,
  type RuleRegistrar,
} from './renderNodeRules'
import type {
  ArrayHandler,
  FieldHandler,
  GroupHandler,
} from './renderNodeRules'

/** The function floor — hand-written `(node, { Default, Children }) => …`. */
export type InterceptFn = (node: ENode, helpers: RenderHelpers) => ReactNode

/** Mounted handler component for a dotted `FieldPath` key. */
export type InterceptHandler =
  | NodeHandler
  | FieldHandler
  | GroupHandler
  | ArrayHandler

/** Shorthand path map: `{ email: EmailHint, 'address.street': StreetHint }`. */
export type InterceptMap = Record<string, InterceptHandler>

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

function isHandlerMap(value: unknown): value is InterceptMap {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'function')
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
  Handler: InterceptHandler
): void {
  if (typeof Handler !== 'function') {
    warnInvalidPathMapValue(path, Handler)
    return
  }
  // Kind-agnostic exact path — registered via `where` after bag `where` rules so
  // path keys beat predicates at equal specificity (later wins).
  r.where((n) => n.path === path, Handler as NodeHandler)
}

function lowerInterceptMap(map: InterceptMap): InterceptFn {
  return renderNodeRules((r) => {
    for (const [path, Handler] of Object.entries(map)) {
      registerPath(r, path, Handler)
    }
  })
}

function lowerInterceptBag(bag: InterceptBag): InterceptFn {
  return renderNodeRules((r) => {
    for (const [predicate, Handler] of bag.where ?? []) {
      r.where(predicate, Handler as NodeHandler)
    }
    for (const [path, Handler] of Object.entries(bag.paths ?? {})) {
      registerPath(r, path, Handler)
    }
  })
}

const loweredCache = new Map<string, InterceptFn>()

function cacheKey(deps: unknown[]): string {
  return deps
    .map((d) => (typeof d === 'function' ? `fn:${d}` : String(d)))
    .join('\0')
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

/** Dependency list for stabilizing map/bag across new object identities each render. */
export function interceptStabilityDeps(
  intercept: Intercept | undefined
): unknown[] {
  if (intercept === undefined) return []
  if (isInterceptFn(intercept)) return [intercept]
  if (isInterceptBag(intercept)) {
    const deps: unknown[] = []
    const paths = intercept.paths ?? {}
    for (const p of Object.keys(paths).sort()) deps.push(p, paths[p]!)
    for (const [pred, h] of intercept.where ?? []) deps.push(pred, h)
    return deps
  }
  const deps: unknown[] = []
  for (const p of Object.keys(intercept).sort()) deps.push(p, intercept[p]!)
  return deps
}
