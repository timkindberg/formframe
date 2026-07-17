// The `deps` escape hatch on `useRenderNodeRules` (bd jsonschema-form-108) — the
// documented, non-silent alternative to a `useCallback(build, [dep])` whose
// deps list is incomplete (stable identity, stale closure, no warning possible).
// Passing an explicit `deps` array makes the rebuild INTENTIONAL: the resolver
// (and every field it matches) rebuilds deliberately whenever a listed dep
// changes — exactly like `useMemo` — instead of freezing render-0 rules forever.

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render } from 'vitest-browser-react'
import { useState } from 'react'
import { jsonSchemaToTree, type FormShapeOf } from '@formframe/input-jsonschema'
import { SchemaFields } from './renderer'
import {
  useRenderNodeRules,
  type TypedRuleRegistrar,
} from './useRenderNodeRules'

const schema = {
  type: 'object',
  properties: { name: { type: 'string', title: 'Name' } },
} as const

type Shape = FormShapeOf<typeof schema>

const g = globalThis as unknown as { process?: { env: { NODE_ENV?: string } } }
let prevProcess: typeof g.process
beforeAll(() => {
  prevProcess = g.process
  g.process = { env: { NODE_ENV: 'development' } }
})
afterAll(() => {
  if (prevProcess) g.process = prevProcess
  else delete g.process
})

describe('useRenderNodeRules `deps` escape hatch (bd jsonschema-form-108)', () => {
  it('rebuilds the resolver when a listed dep changes, with no dev warning', async () => {
    const tree = jsonSchemaToTree(schema)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const seen: unknown[] = []

    function Parent() {
      const [label, setLabel] = useState('first')
      const rules = (r: TypedRuleRegistrar<Shape>) => {
        r.field('name', ({ Default }) => (
          <div data-testid="marker">
            {label}
            {Default()}
          </div>
        ))
      }
      const renderNode = useRenderNodeRules(tree, rules, [label])
      seen.push(renderNode)
      return (
        <div>
          <button type="button" onClick={() => setLabel('second')}>
            swap
          </button>
          <SchemaFields form={tree} renderNode={renderNode} />
        </div>
      )
    }

    const screen = await render(<Parent />)
    await expect
      .element(screen.getByTestId('marker'))
      .toHaveTextContent('first')

    await screen.getByRole('button', { name: 'swap' }).click()
    await expect
      .element(screen.getByTestId('marker'))
      .toHaveTextContent('second')

    // The resolver identity legitimately changed (a deliberate rebuild)…
    expect(seen.length).toBeGreaterThanOrEqual(2)
    expect(seen[0]).not.toBe(seen[seen.length - 1])
    // …but that is the documented contract of `deps`, not the identity-change
    // footgun, so no dev warning fires.
    expect(spy).not.toHaveBeenCalledWith(
      expect.stringContaining('useRenderNodeRules')
    )
    spy.mockRestore()
  })

  it('without `deps`, an identity change on `build` still warns (unchanged default contract)', async () => {
    const tree = jsonSchemaToTree(schema)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    function Parent() {
      const [n, setN] = useState(0)
      const renderNode = useRenderNodeRules(tree, (r) => {
        r.field('name', ({ Default }) => Default())
      })
      return (
        <div>
          <button type="button" onClick={() => setN((x) => x + 1)}>
            bump {n}
          </button>
          <SchemaFields form={tree} renderNode={renderNode} />
        </div>
      )
    }

    const screen = await render(<Parent />)
    await screen.getByRole('button', { name: /bump/ }).click()

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('useRenderNodeRules')
    )
    spy.mockRestore()
  })
})
