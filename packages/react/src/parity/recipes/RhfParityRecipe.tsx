/**
 * Test-local RHF parity recipe (#125 option B) — field-wiring only.
 */
import { useMemo, type ReactNode } from 'react'
import {
  useForm,
  FormProvider,
  useFormContext,
  useFormState,
  get,
} from 'react-hook-form'
import type { FieldError, FieldValues } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  ValidationError,
  GroupNode,
  FormShape,
  TypedTree,
} from '@formframe/core'
import { jsonSchemaToTree } from '@formframe/input-jsonschema'
import { zodToTree } from '@formframe/input-zod'
import {
  Default,
  SchemaFields,
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
  blankToUndefined,
  ParityValidationSummary,
  PendingBeacon,
  type ParityRecipeProps,
} from './shared'

function useFieldValidationErrors(path: string): ValidationError[] {
  const { errors } = useFormState({ name: path })
  const error = get(errors, path) as FieldError | undefined
  return error
    ? [
        {
          path,
          message: error.message || 'Invalid value.',
          keyword: error.type,
        },
      ]
    : []
}

function InputControl({ path, node }: ControlProps<'input'>): ReactNode {
  const { register } = useFormContext()
  const errors = useFieldValidationErrors(path)
  return (
    <Default
      of={node}
      errors={errors}
      parts={{
        control: (c) => (
          <input
            {...c.attrs}
            {...register(path, { setValueAs: blankToUndefined })}
          />
        ),
      }}
    />
  )
}

function flattenRhfErrors(
  errors: Record<string, unknown>,
  prefix = ''
): ValidationError[] {
  const out: ValidationError[] = []
  for (const [key, value] of Object.entries(errors)) {
    if (!value || typeof value !== 'object') continue
    const path = prefix ? `${prefix}.${key}` : key
    const asField = value as FieldError & Record<string, unknown>
    if (typeof asField.message === 'string') {
      out.push({
        path,
        message: asField.message || 'Invalid value.',
        keyword: asField.type,
      })
      continue
    }
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item && typeof item === 'object') {
          out.push(
            ...flattenRhfErrors(item as Record<string, unknown>, `${path}.${i}`)
          )
        }
      })
    } else {
      out.push(...flattenRhfErrors(asField, path))
    }
  }
  return out
}

function Summary(): ReactNode {
  const { errors } = useFormState()
  const flat = flattenRhfErrors(errors as Record<string, unknown>)
  return <ParityValidationSummary errors={flat} />
}

export function RhfParityRecipe({
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

  const resolver = useMemo(
    () =>
      standardSchemaResolver(
        standardSchema as StandardSchemaV1<FieldValues, Record<string, unknown>>
      ),
    [standardSchema]
  )

  const methods = useForm({ resolver })
  const { isValidating } = useFormState({ control: methods.control })
  const renderNode = useRenderNodeRules(
    tree as TypedTree<FormShape, unknown>,
    (r) => {
      r.control('input', InputControl)
    }
  )

  return (
    <FormProvider {...methods}>
      <PendingBeacon pending={isValidating} />
      <form
        noValidate
        data-testid="parity-form"
        data-recipe="rhf"
        data-source={source}
        onSubmit={methods.handleSubmit((data) =>
          onSubmit(data as Record<string, unknown>)
        )}
      >
        <Summary />
        <SchemaFields form={tree} renderNode={renderNode} />
        <button type="submit">Submit</button>
      </form>
    </FormProvider>
  )
}
