// Intercept sugar (ADR 051) — path maps and `{ paths, where }` bags lower to the
// function-floor `Intercept` via `renderNodeRules`, reusing its handler/parts
// machinery (ADR 047 §1–§2). Stabilized by handler/predicate identity so a
// hoisted map (new object each render, same Handler references) does not remount.

import type { ReactNode } from 'react'
import type { ENode, RenderHelpers } from './renderer'
import { renderNodeRules, type NodeHandler } from './renderNodeRules'

/** The function floor — hand-written `(node, { Default, Children }) => …`. */
export type InterceptFn = (node: ENode, helpers: RenderHelpers) => ReactNode

/** Mounted handler component for a dotted `FieldPath` key. */
export type InterceptHandler = NodeHandler

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

/** Bag has `paths` and/or `where` as own keys; a path-map is path → handler. */
export function isInterceptBag(value: Intercept): value is InterceptBag {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.prototype.hasOwnProperty.call(value, 'paths') ||
      Object.prototype.hasOwnProperty.call(value, 'where'))
  )
}

function lowerInterceptMap(map: InterceptMap): InterceptFn {
  return renderNodeRules((r) => {
    for (const [path, Handler] of Object.entries(map)) {
      r.path(path, Handler)
    }
  })
}

function lowerInterceptBag(bag: InterceptBag): InterceptFn {
  return renderNodeRules((r) => {
    for (const [path, Handler] of Object.entries(bag.paths ?? {})) {
      r.path(path, Handler)
    }
    for (const [predicate, Handler] of bag.where ?? []) {
      r.where(predicate, Handler)
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
