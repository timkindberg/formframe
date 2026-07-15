// Resolver-stability contract for `useRenderNodeRules` (bd jsonschema-form-bh7.5).
//
// The footgun this locks down: rules are STRUCTURAL (ADR 047 §1/§7), but nothing
// stops a consumer from passing an inline `(r) => { r.field('x', ({…}) => …) }`
// builder that is rebuilt every render. If the hook rebuilt the resolver on each
// new builder identity, the inline handler inside it would get a fresh component
// type every render → React remounts the matched field → the user's uncontrolled
// input value and focus are discarded. For a form library that is a blocker.
//
// The hook therefore captures the builder ONCE and holds a stable `RenderNode`
// for the component's lifetime. These tests assert (1) an inline builder+handler
// does NOT remount the field (DOM identity + value survive an unrelated
// re-render) and warns in dev, and (2) a stable builder yields a stable resolver
// identity and stays silent.

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

// The dev-warning is gated on `process.env.NODE_ENV` (the portable dev signal a
// consumer's bundler defines). vitest's raw browser env has no `process`, so we
// establish a non-production dev env here to exercise that path deterministically.
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

describe('useRenderNodeRules resolver stability (bd bh7.5)', () => {
  it('an inline builder + inline handler does not remount fields (value survives) and warns in dev', async () => {
    const tree = jsonSchemaToTree(schema)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    function Parent() {
      const [n, setN] = useState(0)
      // The footgun: a brand-new builder closure AND a brand-new inline handler
      // on every render. The hook must capture them once regardless.
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
    const name = screen.getByRole('textbox', { name: 'Name' })
    await name.fill('hello')
    await expect.element(name).toHaveValue('hello')

    const before = document.querySelector('input')
    await screen.getByRole('button', { name: /bump/ }).click()

    // value must survive and the DOM node must be the very same one (no remount)
    await expect.element(name).toHaveValue('hello')
    expect(document.querySelector('input')).toBe(before)

    // …and the unstable builder is called out loudly in dev
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('useRenderNodeRules')
    )
    spy.mockRestore()
  })

  it('a stable builder yields a stable resolver identity and stays silent', async () => {
    const tree = jsonSchemaToTree(schema)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const seen: unknown[] = []
    const rules = (r: TypedRuleRegistrar<Shape>) => {
      r.field('name', ({ Default }) => Default())
    }

    function Parent() {
      const [n, setN] = useState(0)
      const renderNode = useRenderNodeRules(tree, rules)
      seen.push(renderNode)
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

    expect(seen.length).toBeGreaterThanOrEqual(2)
    expect(seen[0]).toBe(seen[seen.length - 1])
    expect(spy).not.toHaveBeenCalledWith(
      expect.stringContaining('useRenderNodeRules')
    )
    spy.mockRestore()
  })
})
