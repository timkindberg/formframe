/**
 * Test-local native `<form>`+FormData parity recipe (#125 option B).
 *
 * Async Standard Schema is recipe-owned (useFormTree's Validator is sync).
 * Stale-result protection uses a generation counter — FormData has no built-in.
 * Display timing matches RHF/TanStack defaults: quiet until first submit, then
 * live clear via onInput revalidate.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import {
  groupErrorsByPath,
  type FormShape,
  type GroupNode,
  type TypedTree,
  type ValidationError,
} from '@formframe/core'
import { jsonSchemaToTree } from '@formframe/input-jsonschema'
import { zodToTree } from '@formframe/input-zod'
import {
  Default,
  useFormTree,
  useRenderNodeRules,
  type ControlProps,
} from '../../index'
import {
  accountSignupJsonSchema,
  createAccountSignupJsonStandardSchema,
  accountSignupZodObject,
  createAccountSignupZodStandardSchema,
  createUsernameChecker,
} from '../fixtures'
import {
  ParityValidationSummary,
  PendingBeacon,
  standardIssuesToErrors,
  type ParityRecipeProps,
} from './shared'

const EMPTY_ERRORS: ValidationError[] = Object.freeze(
  [] as ValidationError[]
) as ValidationError[]

interface ErrorStore {
  getErrors(path: string): ValidationError[]
  getAll(): ValidationError[]
  subscribe(listener: () => void): () => void
  setResult(errors: ValidationError[]): void
}

function createErrorStore(): ErrorStore {
  let all: ValidationError[] = []
  let byPath = groupErrorsByPath([])
  const listeners = new Set<() => void>()
  return {
    getErrors(path) {
      return byPath.get(path) ?? EMPTY_ERRORS
    },
    getAll() {
      return all
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setResult(errors) {
      byPath = groupErrorsByPath(errors)
      all = errors
      for (const listener of listeners) listener()
    },
  }
}

const ErrorStoreContext = createContext<ErrorStore | null>(null)
const SubmittedContext = createContext(false)

function useFieldValidationErrors(path: string): ValidationError[] {
  const store = useContext(ErrorStoreContext)
  const submitted = useContext(SubmittedContext)
  const errors = useSyncExternalStore(
    store ? store.subscribe : () => () => {},
    store ? () => store.getErrors(path) : () => EMPTY_ERRORS,
    store ? () => store.getErrors(path) : () => EMPTY_ERRORS
  )
  return submitted ? errors : EMPTY_ERRORS
}

function InputControl({ path, node }: ControlProps<'input'>): ReactNode {
  const errors = useFieldValidationErrors(path)
  return <Default of={node} errors={errors} />
}

function SummaryBridge(): ReactNode {
  const store = useContext(ErrorStoreContext)
  const submitted = useContext(SubmittedContext)
  const errors = useSyncExternalStore(
    store ? store.subscribe : () => () => {},
    store ? () => store.getAll() : () => EMPTY_ERRORS,
    store ? () => store.getAll() : () => EMPTY_ERRORS
  )
  return <ParityValidationSummary errors={submitted ? errors : EMPTY_ERRORS} />
}

export function NativeParityRecipe({
  source,
  checkUsername,
  onSubmit,
}: ParityRecipeProps): ReactNode {
  const checker = useMemo(() => {
    const c = createUsernameChecker()
    c.checkUsername = checkUsername
    return c
  }, [checkUsername])

  const { tree, standardSchema } = useMemo(() => {
    if (source === 'zod') {
      return {
        tree: zodToTree(accountSignupZodObject) as GroupNode,
        standardSchema: createAccountSignupZodStandardSchema(checker),
      }
    }
    return {
      tree: jsonSchemaToTree(accountSignupJsonSchema) as GroupNode,
      standardSchema: createAccountSignupJsonStandardSchema(checker),
    }
  }, [source, checker])

  // No sync validator — async SS is recipe-owned below.
  const { form, SchemaFields } = useFormTree(
    tree as TypedTree<FormShape, unknown>
  )
  const intercept = useRenderNodeRules(form, (r) => {
    r.control('input', InputControl)
  })

  const [store] = useState(() => createErrorStore())
  const [submitted, setSubmitted] = useState(false)
  const [pending, setPending] = useState(false)
  const generation = useRef(0)

  const runValidate = useCallback(
    async (data: Record<string, unknown>, gen: number) => {
      setPending(true)
      try {
        const result = await Promise.resolve(
          standardSchema['~standard'].validate(data)
        )
        if (gen !== generation.current) return null // stale
        if (result.issues) {
          store.setResult(standardIssuesToErrors(result.issues))
          return { ok: false as const }
        }
        store.setResult([])
        return {
          ok: true as const,
          value: result.value as Record<string, unknown>,
        }
      } finally {
        if (gen === generation.current) setPending(false)
      }
    },
    [standardSchema, store]
  )

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setSubmitted(true)
      const gen = ++generation.current
      form.submit((data) => {
        void runValidate(data, gen).then((result) => {
          if (result?.ok) onSubmit(result.value)
        })
      })(event)
    },
    [form, runValidate, onSubmit]
  )

  const handleInput = useCallback(
    (event: SyntheticEvent<HTMLFormElement>) => {
      if (!submitted) return
      const gen = ++generation.current
      form.submit((data) => {
        void runValidate(data, gen)
      })({
        preventDefault: () => {},
        currentTarget: event.currentTarget,
      } as FormEvent<HTMLFormElement>)
    },
    [submitted, form, runValidate]
  )

  return (
    <ErrorStoreContext.Provider value={store}>
      <SubmittedContext.Provider value={submitted}>
        <PendingBeacon pending={pending} />
        <form
          noValidate
          data-testid="parity-form"
          data-recipe="native"
          data-source={source}
          onSubmit={handleSubmit}
          onInput={handleInput}
        >
          <SummaryBridge />
          <SchemaFields intercept={intercept} />
          <button type="submit">Submit</button>
        </form>
      </SubmittedContext.Provider>
    </ErrorStoreContext.Provider>
  )
}
