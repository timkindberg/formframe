// Dev-warning contract for an unstable `renderNode` prop passed straight to
// `SchemaFields` (bd jsonschema-form-108). `useRenderNodeRules` already warns
// when its `build` argument changes identity, but nothing warned when a
// consumer skips the hook and calls the low-level `renderNodeRules(build)`
// sugar directly inside a render body — that call has no `useRef` of its own,
// so it returns a BRAND NEW `RenderNode` every render regardless of whether
// `build` itself is stable, silently remounting every matched field. This test
// locks down that `SchemaFields` itself now catches an unstable `renderNode`
// prop, no matter which layer produced it.

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render } from 'vitest-browser-react'
import { useState } from 'react'
import { jsonSchemaToRuntimeTree } from '@formframe/input-jsonschema'
import type { JSONSchema } from '@formframe/input-jsonschema'
import { SchemaFields } from './renderer'
import { renderNodeRules } from './renderNodeRules'
import type { FieldHandlerProps } from './renderNodeRules'

const schema: JSONSchema = {
  type: 'object',
  properties: { name: { type: 'string', title: 'Name' } },
}

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

describe('SchemaFields renderNode-stability warning (bd jsonschema-form-108)', () => {
  it('warns when `renderNode` is built inline (renderNodeRules called directly, no hook)', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    function Parent() {
      const [n, setN] = useState(0)
      // The footgun: calling the low-level sugar directly in the render body.
      // Every render produces a fresh `RenderNode` closure, even though the
      // builder below reads no outer state.
      const renderNode = renderNodeRules((r) => {
        r.field('name', ({ Default }: FieldHandlerProps) => Default())
      })
      return (
        <div>
          <button type="button" onClick={() => setN((x) => x + 1)}>
            bump {n}
          </button>
          <SchemaFields form={form} renderNode={renderNode} />
        </div>
      )
    }

    const screen = await render(<Parent />)
    // Two clicks: the guard only flags PERSISTENT churn (two consecutive
    // identity changes) so a one-off deliberate swap (e.g. the `deps` escape
    // hatch on `useRenderNodeRules`) never false-positives.
    await screen.getByRole('button', { name: /bump/ }).click()
    await screen.getByRole('button', { name: /bump/ }).click()

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('SchemaFields'))
    spy.mockRestore()
  })

  it('stays silent when `renderNode` keeps a stable identity across renders', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rn = renderNodeRules((r) => {
      r.field('name', ({ Default }: FieldHandlerProps) => Default())
    })

    function Parent() {
      const [n, setN] = useState(0)
      return (
        <div>
          <button type="button" onClick={() => setN((x) => x + 1)}>
            bump {n}
          </button>
          <SchemaFields form={form} renderNode={rn} />
        </div>
      )
    }

    const screen = await render(<Parent />)
    await screen.getByRole('button', { name: /bump/ }).click()

    expect(spy).not.toHaveBeenCalledWith(
      expect.stringContaining('SchemaFields')
    )
    spy.mockRestore()
  })
})
