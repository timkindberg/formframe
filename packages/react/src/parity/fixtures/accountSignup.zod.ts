/**
 * Account-signup parity fixtures — Zod source variant (#118).
 *
 * Tree compilation uses the structural Zod object; validation uses a composed
 * Standard Schema (sync refine + async username) so throw→run-failure mapping
 * matches the JSON Schema fixture surface.
 */
import { z } from 'zod'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { UsernameChecker } from './checkUsername'
import {
  PASSWORDS_MUST_MATCH,
  USERNAME_CHECK_FAILED,
  USERNAME_TAKEN,
} from './accountSignup.jsonschema'

type SSResult<T> =
  | { readonly value: T; readonly issues?: undefined }
  | {
      readonly issues: ReadonlyArray<{
        message: string
        path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>
      }>
    }

/** Structural object for `zodToTree` (titles via `.meta`). */
export const accountSignupZodObject = z.object({
  username: z.string().min(3).meta({ title: 'Username' }),
  email: z.email().meta({ title: 'Email' }),
  age: z.coerce.number().min(18).meta({ title: 'Age' }).optional(),
  password: z.string().min(8).meta({ title: 'Password' }),
  confirmPassword: z.string().meta({ title: 'Confirm password' }),
  address: z
    .object({
      line1: z.string().meta({ title: 'Address line 1' }),
      zip: z
        .string()
        .regex(/^[0-9]{5}$/)
        .meta({ title: 'ZIP' })
        .optional(),
    })
    .meta({ title: 'Address' }),
  contacts: z
    .array(
      z.object({
        name: z.string().meta({ title: 'Contact name' }),
        email: z.email().meta({ title: 'Contact email' }),
      })
    )
    .min(1)
    .meta({ title: 'Contacts' }),
})

export type AccountSignupZodData = z.output<typeof accountSignupZodObject>

/** Sync structural + password match (for coercion re-parse on submit). */
export function createAccountSignupZodSyncSchema() {
  return accountSignupZodObject.refine(
    (d) => d.password === d.confirmPassword,
    {
      message: PASSWORDS_MUST_MATCH,
      path: ['confirmPassword'],
    }
  )
}

/**
 * Full Standard Schema: Zod sync validate, then async username availability.
 * `checkUsername` throw → {@link USERNAME_CHECK_FAILED}; taken →
 * {@link USERNAME_TAKEN}. Same documented surface as the JSON Schema fixture.
 */
export function createAccountSignupZodStandardSchema(
  checker: UsernameChecker
): StandardSchemaV1<unknown, AccountSignupZodData> {
  const syncSchema = createAccountSignupZodSyncSchema()

  return {
    '~standard': {
      version: 1,
      vendor: 'formframe-parity-zod',
      validate: (value) => {
        // Peer of JSON Schema `withMissingGroups`: native FormData drops empty
        // nested objects, so materialize `address` before Zod runs or the
        // required failure lands on the invisible group path.
        const normalized =
          value && typeof value === 'object' && !Array.isArray(value)
            ? {
                ...(value as Record<string, unknown>),
                address:
                  (value as { address?: unknown }).address === undefined
                    ? {}
                    : (value as { address: unknown }).address,
              }
            : value

        const syncResult = syncSchema['~standard'].validate(normalized)

        const afterSync = async (
          result: SSResult<AccountSignupZodData>
        ): Promise<SSResult<AccountSignupZodData>> => {
          if (result.issues) return result
          try {
            const available = await checker.checkUsername(result.value.username)
            if (!available) {
              return {
                issues: [{ message: USERNAME_TAKEN, path: ['username'] }],
              }
            }
            return { value: result.value }
          } catch {
            return {
              issues: [{ message: USERNAME_CHECK_FAILED, path: ['username'] }],
            }
          }
        }

        if (syncResult instanceof Promise) {
          return syncResult.then((r) =>
            afterSync(r as SSResult<AccountSignupZodData>)
          )
        }
        return afterSync(syncResult as SSResult<AccountSignupZodData>)
      },
    },
  }
}
