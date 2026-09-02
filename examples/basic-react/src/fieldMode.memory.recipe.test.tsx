// In-memory React render stress (happy-dom + createRoot). No Playwright.
// Counts field.root / field.control the same way render-counts.test.tsx does:
// the renderer is a function; a real layout engine is not involved.
import { act, createContext, useContext, useMemo } from 'react'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { FieldControl } from '@formframe/core'
import { jsonSchemaToRuntimeTree } from '@formframe/input-jsonschema'
import type { JSONSchema } from '@formframe/input-jsonschema'
import {
  nativeDefaults,
  useFormTree,
  type ReactPartialDefaults,
} from '@formframe/renderer-react'
import {
  createFieldMode,
  type FieldModeSnapshot,
  type UiRule,
} from './fieldMode.recipe'

const N = 200
type Counts = Record<string, number>

const properties: Record<string, JSONSchema> = {
  driver: { type: 'string', enum: ['a', 'b'] },
  title: { type: 'string', title: 'Title' },
}
for (let i = 0; i < N; i++) {
  properties[`f${i}`] = { type: 'string', title: `F${i}` }
}
const schema = {
  type: 'object',
  properties,
} as JSONSchema

const rules: UiRule[] = []
for (let i = 0; i < N; i += 2) {
  rules.push({
    conditions: { driver: { not: { eq: 'a' } } },
    event: [{ type: 'remove', params: { field: `f${i}` } }],
  })
}

const tree = jsonSchemaToRuntimeTree(schema)
const fieldMode = createFieldMode(rules)
const evenCount = Math.ceil(N / 2)

const FieldModeCtx = createContext<FieldModeSnapshot>({
  isHidden: () => false,
  isRequired: () => false,
  isReadOnly: () => false,
  hidden: new Set(),
  required: new Set(),
  readOnly: new Set(),
  setValues: {},
})

const countsRef: { current: Counts } = { current: {} }

function bump(key: string) {
  countsRef.current[key] = (countsRef.current[key] ?? 0) + 1
}

function controlName(control: FieldControl): string {
  return control.kind === 'choicegroup'
    ? (control.options[0]?.attrs.name ?? '')
    : control.attrs.name
}

function CountingFieldRoot(
  props: Parameters<NonNullable<typeof nativeDefaults.field.root>>[0]
) {
  bump(`field.root:${props.node.path}`)
  const mode = useContext(FieldModeCtx)
  const rendered = nativeDefaults.field.root(props)
  if (mode.isHidden(props.node.path)) return null
  return rendered
}

function CountingFieldControl(data: FieldControl) {
  bump(`field.control:${controlName(data)}`)
  return nativeDefaults.field.control(data)
}

const countingDefaults: ReactPartialDefaults = {
  field: { root: CountingFieldRoot, control: CountingFieldControl },
}

function membershipKey(mode: FieldModeSnapshot): string {
  return [
    [...mode.hidden].sort().join(),
    [...mode.required].sort().join(),
    [...mode.readOnly].sort().join(),
    JSON.stringify(mode.setValues),
  ].join('|')
}

function StressForm({ driver }: { driver: string }) {
  const nextMode = fieldMode({ driver, title: 'Hi' })
  const key = membershipKey(nextMode)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- membership key
  const mode = useMemo(() => nextMode, [key])
  const { SchemaFields } = useFormTree(tree, { defaults: countingDefaults })
  return (
    <FieldModeCtx.Provider value={mode}>
      <SchemaFields />
    </FieldModeCtx.Provider>
  )
}

let root: Root | null = null
let host: HTMLDivElement | null = null

function mount(el: ReactElement) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root!.render(el)
  })
}

function rerender(el: ReactElement) {
  act(() => {
    root!.render(el)
  })
}

function reset(counts: Counts) {
  for (const key of Object.keys(counts)) delete counts[key]
}

function fieldRootTotal(counts: Counts): number {
  return Object.entries(counts)
    .filter(([key]) => key.startsWith('field.root:'))
    .reduce((sum, [, n]) => sum + n, 0)
}

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  root = null
  host?.remove()
  host = null
})

describe('fieldMode.recipe · in-memory render stress', () => {
  it(`first paint of ${N} fields runs each field.root once`, () => {
    const counts: Counts = {}
    countsRef.current = counts
    mount(<StressForm driver="b" />)

    expect(counts['field.root:driver'] ?? 0).toBe(1)
    expect(counts['field.root:title'] ?? 0).toBe(1)
    expect(counts['field.root:f0'] ?? 0).toBe(1)
    expect(counts['field.root:f1'] ?? 0).toBe(1)
    expect(fieldRootTotal(counts)).toBe(N + 2)
    expect(counts['field.control:f0'] ?? 0).toBe(0)
    expect(counts['field.control:f1'] ?? 0).toBe(1)
    expect(host?.querySelector('[name="f0"]')).toBeNull()
    expect(host?.querySelector('[name="f1"]')).toBeTruthy()
  })

  it('rerendering with the same driver re-renders zero field roots', () => {
    const counts: Counts = {}
    countsRef.current = counts
    mount(<StressForm driver="b" />)
    reset(counts)

    for (let i = 0; i < 20; i++) rerender(<StressForm driver="b" />)

    expect(fieldRootTotal(counts)).toBe(0)
    expect(counts['field.control:f1'] ?? 0).toBe(0)
  })

  it('toggling the driver re-renders every field.root and mounts previously hidden controls', () => {
    const counts: Counts = {}
    countsRef.current = counts
    mount(<StressForm driver="b" />)
    const shown = host!.querySelector('[name="f1"]')
    reset(counts)

    rerender(<StressForm driver="a" />)

    expect(counts['field.root:f0'] ?? 0).toBeGreaterThan(0)
    expect(counts['field.root:f1'] ?? 0).toBeGreaterThan(0)
    expect(counts['field.root:title'] ?? 0).toBeGreaterThan(0)
    expect(fieldRootTotal(counts)).toBe(N + 2)
    expect(counts['field.control:f0'] ?? 0).toBeGreaterThan(0)
    expect(host?.querySelector('[name="f0"]')).toBeTruthy()
    expect(host?.querySelector('[name="f1"]')).toBe(shown)
    expect(fieldMode({ driver: 'a' }).hidden.size).toBe(0)
    expect(fieldMode({ driver: 'b' }).hidden.size).toBe(evenCount)
  })

  it(`mounts ${N} fields within budget`, () => {
    const counts: Counts = {}
    countsRef.current = counts
    const start = performance.now()
    mount(<StressForm driver="b" />)
    const ms = performance.now() - start
    expect(fieldRootTotal(counts)).toBe(N + 2)
    expect(ms, `mount took ${ms.toFixed(1)}ms`).toBeLessThan(750)
  })
})
