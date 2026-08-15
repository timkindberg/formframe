/**
 * ADR 051 proof: recipe defaults (error inject + form-lib wiring) survive a path
 * intercept Extra that wraps a field — the motivation for moving recipes off
 * winning `r.control` intercepts.
 */
import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { describe, it, expect } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import type { ValidationError } from '@formframe/core'
import { jsonSchemaToTree } from '@formframe/input-jsonschema'
import type { JSONSchema } from '@formframe/input-jsonschema'
import {
  fieldControlId,
  fieldErrorId,
  InjectFieldErrors,
  nativeDefaults,
  useFormTree,
  type ReactPartialDefaults,
} from '../index'

const schema = {
  type: 'object',
  required: ['username'],
  properties: {
    username: { type: 'string', title: 'Username', minLength: 3 },
    zip: { type: 'string', title: 'Zip', pattern: '^[0-9]{5}$' },
  },
} as const satisfies JSONSchema

const EMPTY: ValidationError[] = []

const ErrorStoreContext = createContext<{
  getErrors(path: string): ValidationError[]
  subscribe(listener: () => void): () => void
} | null>(null)

function useRecipeErrors(path: string): ValidationError[] {
  const store = useContext(ErrorStoreContext)
  return useSyncExternalStore(
    store ? store.subscribe : () => () => {},
    store ? () => store.getErrors(path) : () => EMPTY,
    store ? () => store.getErrors(path) : () => EMPTY
  )
}

function RecipeFieldRoot({
  node,
  overrides,
}: Parameters<NonNullable<typeof nativeDefaults.field.root>>[0]): ReactNode {
  const errors = useRecipeErrors(node.path)
  const Root = nativeDefaults.field.root
  return (
    <InjectFieldErrors errors={errors}>
      <Root node={node} overrides={overrides} />
    </InjectFieldErrors>
  )
}

const recipeDefaults: ReactPartialDefaults = {
  field: { root: RecipeFieldRoot },
}

function createStore() {
  let byPath = new Map<string, ValidationError[]>()
  const listeners = new Set<() => void>()
  return {
    getErrors(path: string) {
      return byPath.get(path) ?? EMPTY
    },
    setErrors(errors: ValidationError[]) {
      byPath = new Map()
      for (const e of errors) {
        const list = byPath.get(e.path) ?? []
        list.push(e)
        byPath.set(e.path, list)
      }
      for (const l of listeners) l()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

function Harness({
  store,
}: {
  store: ReturnType<typeof createStore>
}): ReactNode {
  const tree = useMemo(() => jsonSchemaToTree(schema), [])
  const { SchemaFields } = useFormTree(tree, { defaults: recipeDefaults })
  return (
    <ErrorStoreContext.Provider value={store}>
      <SchemaFields
        intercept={(node, { Default: D }) =>
          node.isField && node.path === 'username' ? (
            <div data-testid="extra-wrap">
              <p data-testid="path-hint">Team hint</p>
              <D of={node} />
            </div>
          ) : (
            <D of={node} />
          )
        }
      />
    </ErrorStoreContext.Provider>
  )
}

describe('ADR 051 · recipe defaults persist under path intercept', () => {
  it('error inject and a11y survive when a path Extra wraps the field', async () => {
    const store = createStore()
    store.setErrors([{ path: 'username', message: 'Too short' }])

    const screen = await render(<Harness store={store} />)

    await expect.element(screen.getByTestId('extra-wrap')).toBeInTheDocument()
    await expect.element(screen.getByTestId('path-hint')).toBeInTheDocument()

    const username = document.getElementById(fieldControlId('username'))
    expect(username?.getAttribute('aria-invalid')).toBe('true')
    expect(username?.getAttribute('aria-describedby')).toBe(
      fieldErrorId('username')
    )
    expect(
      document.getElementById(fieldErrorId('username'))?.textContent
    ).toContain('Too short')
  })

  it('typed input is preserved through the Extra wrapper after interaction', async () => {
    const store = createStore()
    const screen = await render(<Harness store={store} />)

    const username = screen.getByRole('textbox', { name: 'Username' })
    await userEvent.fill(username, 'ab')
    await expect.element(username).toHaveValue('ab')
  })
})
