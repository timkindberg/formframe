/**
 * Test-local TanStack parity recipe (#125 option B) — field-wiring only.
 *
 * Async Standard Schema rides `onDynamicAsync` (sync `onDynamic` throws if
 * validate returns a Promise). Array paths: Field names use bracket form so
 * form-level SS error keys match; inject still uses FormFrame dot paths.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useForm, revalidateLogic, useStore } from '@tanstack/react-form'
import type { AnyFieldApi } from '@tanstack/react-form'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  FieldControl,
  ValidationError,
  GroupNode,
  FormShape,
  TypedTree,
} from '@formframe/core'
import { jsonSchemaToTree } from '@formframe/input-jsonschema'
import { zodToTree } from '@formframe/input-zod'
import {
  errorA11yProps,
  FieldA11yContext,
  injectFieldErrors,
  nativeDefaults,
  useFormTree,
  type ReactPartialDefaults,
} from '../../index'
import {
  accountSignupJsonSchema,
  createAccountSignupJsonStandardSchema,
  createAccountSignupSyncValidator,
  accountSignupZodObject,
  createAccountSignupZodStandardSchema,
  createAccountSignupZodSyncSchema,
  createUsernameChecker,
} from '../fixtures'
import {
  blankToUndefined,
  bracketPathToDot,
  dotPathToBracket,
  ParityValidationSummary,
  PendingBeacon,
  type ParityRecipeProps,
} from './shared'

interface FieldIssue {
  message: string
}

type RecipeFieldApi = {
  handleChange: AnyFieldApi['handleChange']
  handleBlur: AnyFieldApi['handleBlur']
  state: {
    value: unknown
    meta: { errors: FieldIssue[] }
  }
}

interface RecipeFormApi {
  Field: (props: {
    name: string
    children: (field: RecipeFieldApi) => ReactNode
  }) => ReactNode
}

const TanStackFormContext = createContext<RecipeFormApi | null>(null)
const TanStackFieldBindingContext = createContext<RecipeFieldApi | null>(null)

function TanStackFormProvider({
  form,
  children,
}: {
  form: { Field: unknown }
  children: ReactNode
}): ReactNode {
  return (
    <TanStackFormContext.Provider
      value={{ Field: form.Field as RecipeFormApi['Field'] }}
    >
      {children}
    </TanStackFormContext.Provider>
  )
}

function useTanStackForm(): RecipeFormApi {
  const form = useContext(TanStackFormContext)
  if (!form) {
    throw new Error('TanStackParityRecipe: missing provider')
  }
  return form
}

function TanStackParityControlInner({
  control,
  field,
}: {
  control: FieldControl
  field: RecipeFieldApi
}): ReactNode {
  const errorA11y = errorA11yProps(useContext(FieldA11yContext))
  switch (control.kind) {
    case 'input':
      return (
        <input
          {...control.attrs}
          {...errorA11y}
          value={String(field.state.value ?? '')}
          onChange={(e) =>
            field.handleChange(blankToUndefined(e.target.value))
          }
          onBlur={field.handleBlur}
        />
      )
    default:
      return nativeDefaults.field.control(control)
  }
}

function TanStackParityFieldRoot({
  node,
  overrides,
}: Parameters<NonNullable<typeof nativeDefaults.field.root>>[0]): ReactNode {
  const form = useTanStackForm()
  const dotPath = node.path
  const tanstackName = dotPathToBracket(dotPath)
  const Root = nativeDefaults.field.root
  return (
    <form.Field name={tanstackName}>
      {(field) => (
        <TanStackFieldBindingContext.Provider value={field}>
          {injectFieldErrors(
            field.state.meta.errors.map((e) => ({
              path: bracketPathToDot(dotPath),
              message: e.message,
            })),
            <Root node={node} overrides={overrides} />
          )}
        </TanStackFieldBindingContext.Provider>
      )}
    </form.Field>
  )
}

function TanStackParityFieldControl(control: FieldControl): ReactNode {
  const field = useContext(TanStackFieldBindingContext)
  if (!field) {
    throw new Error(
      'TanStackParityRecipe: field.control rendered outside TanStackParityFieldRoot'
    )
  }
  return <TanStackParityControlInner control={control} field={field} />
}

const tanstackParityDefaults: ReactPartialDefaults = {
  field: {
    root: TanStackParityFieldRoot,
    control: TanStackParityFieldControl,
  },
}

export function TanStackParityRecipe({
  source,
  checkUsername,
  onSubmit,
}: ParityRecipeProps): ReactNode {
  const checker = useMemo(() => {
    const c = createUsernameChecker()
    c.checkUsername = checkUsername
    return c
  }, [checkUsername])

  const { tree, standardSchema, syncValidate } = useMemo(() => {
    if (source === 'zod') {
      const sync = createAccountSignupZodSyncSchema()
      return {
        tree: zodToTree(accountSignupZodObject) as GroupNode,
        standardSchema: createAccountSignupZodStandardSchema(checker),
        syncValidate: (value: unknown) => {
          const r = sync['~standard'].validate(value)
          if (r instanceof Promise) {
            throw new TypeError('expected sync zod validate')
          }
          return r.issues
            ? value
            : ((r as { value: Record<string, unknown> }).value ?? value)
        },
      }
    }
    const syncValidator = createAccountSignupSyncValidator()
    return {
      tree: jsonSchemaToTree(accountSignupJsonSchema) as GroupNode,
      standardSchema: createAccountSignupJsonStandardSchema(checker),
      syncValidate: (value: unknown) => {
        const result = syncValidator(value)
        return result.data ?? value
      },
    }
  }, [source, checker])

  const form = useForm({
    defaultValues: {
      address: {},
      contacts: [{}],
    } as Record<string, unknown>,
    validators: {
      onDynamicAsync: standardSchema as StandardSchemaV1<
        Record<string, unknown>,
        Record<string, unknown>
      >,
    },
    validationLogic: revalidateLogic(),
    onSubmit: ({ value }) => {
      onSubmit(syncValidate(value) as Record<string, unknown>)
    },
  })

  const isValidating = useStore(form.store, (s) => s.isFormValidating)
  const fieldMeta = useStore(form.store, (s) => s.fieldMeta)

  const flatErrors = useMemo(() => {
    const out: ValidationError[] = []
    for (const [name, meta] of Object.entries(fieldMeta)) {
      const errors = (meta as { errors?: FieldIssue[] }).errors ?? []
      for (const e of errors) {
        out.push({ path: bracketPathToDot(name), message: e.message })
      }
    }
    return out
  }, [fieldMeta])

  const { SchemaFields } = useFormTree(
    tree as TypedTree<FormShape, unknown>,
    { defaults: tanstackParityDefaults }
  )

  return (
    <TanStackFormProvider form={form}>
      <PendingBeacon pending={isValidating} />
      <form
        noValidate
        data-testid="parity-form"
        data-recipe="tanstack"
        data-source={source}
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          void form.handleSubmit()
        }}
      >
        <ParityValidationSummary errors={flatErrors} />
        <SchemaFields />
        <button type="submit">Submit</button>
      </form>
    </TanStackFormProvider>
  )
}
