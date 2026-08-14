// Deletion-test invariants from the v1 DX review (#78 / #138).
//
// These must stay gone: a source-specific compile-and-bind hook, origin sniffing
// that picks renderer/validator/form-state, and a kitchen-sink <Form> that owns
// chrome. `useFormTree` + content-only `SchemaFields` is the public React path
// (ADR 013). Adding `export function useZodForm` or a chrome `<Form>` fails here.

import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { z } from 'zod'
import { zodToTree } from '@formframe/input-zod'
import * as rendererReact from './index'
import { useFormTree } from './index'

declare global {
  interface ImportMeta {
    glob: (
      pattern: string | string[],
      options: { query: string; eager: true; import: 'default' }
    ) => Record<string, string>
  }
}

const BANNED_HOOKS = [
  'useZodForm',
  'useJsonSchemaForm',
  'useArkTypeForm',
] as const

const BANNED_CHROME = [
  'Form',
  'SchemaForm',
  'JsonSchemaForm',
  'ZodForm',
] as const

const SOURCE_SPECIFIC_HOOK = /^use[A-Z]\w*Form$/

const productionSources = Object.entries(
  import.meta.glob('./**/*.{ts,tsx}', {
    query: '?raw',
    eager: true,
    import: 'default',
  })
).filter(
  ([path]) =>
    !path.includes('.test.') &&
    !path.includes('.spec.') &&
    !path.includes('/parity/')
)

function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

describe('deletion-test invariants (#138)', () => {
  it('does not export source-specific compile-and-bind hooks', () => {
    expect(rendererReact).toHaveProperty('useFormTree')
    for (const name of BANNED_HOOKS) {
      expect(rendererReact, name).not.toHaveProperty(name)
    }
    const extras = Object.keys(rendererReact).filter((key) =>
      SOURCE_SPECIFIC_HOOK.test(key)
    )
    expect(extras).toEqual([])
  })

  it('does not export a kitchen-sink Form that owns chrome', () => {
    for (const name of BANNED_CHROME) {
      expect(rendererReact, name).not.toHaveProperty(name)
    }
  })

  it('does not branch on origin.source to pick renderer, validator, or form-state', () => {
    expect(productionSources.length).toBeGreaterThan(0)
    for (const [path, src] of productionSources) {
      expect(withoutComments(src), path).not.toMatch(
        /origin\s*\??\.\s*source\b/
      )
    }
  })

  it('SchemaFields is content only — consumer owns <form> + submit (ADR 013)', async () => {
    const tree = zodToTree(
      z.object({ name: z.string().meta({ title: 'Name' }) })
    )

    function Harness() {
      const { SchemaFields } = useFormTree(tree)
      return <SchemaFields />
    }

    const screen = await render(<Harness />)
    await expect
      .element(screen.getByRole('textbox', { name: 'Name' }))
      .toBeInTheDocument()
    expect(document.querySelector('form')).toBeNull()
    expect(document.querySelector('button[type="submit"]')).toBeNull()
  })
})
