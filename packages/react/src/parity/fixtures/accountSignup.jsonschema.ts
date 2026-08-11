/**
 * Account-signup parity fixtures — JSON Schema + AJV structural, with
 * hand-authored cross-field + async composed into one Standard Schema (#118).
 *
 * Async stays out of Core: `~standard.validate` may return a Promise; the
 * sync FormFrame `Validator` seam is never asked to await.
 */
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { toStandardSchema, type Validator } from '@formframe/core'
import type { JSONSchema } from '@formframe/input-jsonschema'
import { createAjvValidator } from '@formframe/validation-ajv'
import type { UsernameChecker } from './checkUsername'

/** Locked medium fixture shape from #118 (line1 + zip, not the demo `street`). */
export const accountSignupJsonSchema = {
  type: 'object',
  required: [
    'username',
    'email',
    'password',
    'confirmPassword',
    'address',
    'contacts',
  ],
  properties: {
    username: {
      type: 'string',
      title: 'Username',
      minLength: 3,
    },
    email: {
      type: 'string',
      title: 'Email',
      format: 'email',
    },
    age: {
      type: 'number',
      title: 'Age',
      minimum: 18,
    },
    password: {
      type: 'string',
      title: 'Password',
      minLength: 8,
    },
    confirmPassword: {
      type: 'string',
      title: 'Confirm password',
    },
    address: {
      type: 'object',
      title: 'Address',
      properties: {
        line1: { type: 'string', title: 'Address line 1' },
        zip: {
          type: 'string',
          title: 'ZIP',
          pattern: '^[0-9]{5}$',
        },
      },
      required: ['line1'],
    },
    contacts: {
      type: 'array',
      title: 'Contacts',
      minItems: 1,
      items: {
        type: 'object',
        required: ['name', 'email'],
        properties: {
          name: { type: 'string', title: 'Contact name' },
          email: {
            type: 'string',
            title: 'Contact email',
            format: 'email',
          },
        },
      },
    },
  },
} as const satisfies JSONSchema

export const PASSWORDS_MUST_MATCH = 'Passwords must match.'
export const USERNAME_TAKEN = 'Username is taken.'
export const USERNAME_CHECK_FAILED = 'Username check failed.'

/** DOM / matrix field order for summary linkability assertions. */
export const ACCOUNT_SIGNUP_FIELD_ORDER = [
  'username',
  'email',
  'age',
  'password',
  'confirmPassword',
  'address.line1',
  'address.zip',
  'contacts.0.name',
  'contacts.0.email',
] as const

function blankToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value
}

/** Normalize empty strings before AJV so required failures beat format noise. */
function normalizeBlanks(data: unknown): unknown {
  if (data == null || typeof data !== 'object') return data
  if (Array.isArray(data)) return data.map(normalizeBlanks)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    out[k] = normalizeBlanks(blankToUndefined(v))
  }
  return out
}

function withMissingGroups(
  validator: Validator,
  groups: readonly string[]
): Validator {
  return (data) => {
    const values = { ...(data as Record<string, unknown>) }
    let changed = false
    for (const key of groups) {
      if (values[key] === undefined) {
        values[key] = {}
        changed = true
      }
    }
    return validator(changed ? values : data)
  }
}

function withMatchRule(
  validator: Validator,
  field: string,
  mustMatch: string,
  message: string
): Validator {
  return (data) => {
    const result = validator(data)
    const values = (result.data ?? data) as Record<string, unknown>
    const a = values?.[field]
    const b = values?.[mustMatch]
    if (a !== undefined && b !== undefined && a !== b) {
      return {
        valid: false,
        errors: [...result.errors, { path: field, message, keyword: 'match' }],
        data: result.data,
      }
    }
    return result
  }
}

/**
 * Sync structural + cross-field validator (AJV + match). Used by recipes that
 * need a sync `Validator` for coercion recovery (TanStack onSubmit re-parse).
 */
export function createAccountSignupSyncValidator(): Validator {
  const ajv = createAjvValidator(accountSignupJsonSchema)
  return withMatchRule(
    withMissingGroups((data) => ajv(normalizeBlanks(data)), ['address']),
    'confirmPassword',
    'password',
    PASSWORDS_MUST_MATCH
  )
}

/**
 * Full Standard Schema for the JSON Schema fixture: sync structural/cross-field,
 * then async username availability. Throws from `checkUsername` become a
 * username field issue ({@link USERNAME_CHECK_FAILED}) — the documented
 * run-failure surface all three recipes assert (#125).
 */
export function createAccountSignupJsonStandardSchema(
  checker: UsernameChecker
): StandardSchemaV1<unknown, Record<string, unknown>> {
  const sync = toStandardSchema(createAccountSignupSyncValidator())

  return {
    '~standard': {
      version: 1,
      vendor: 'formframe-parity',
      validate: (value) => {
        const syncResult = sync['~standard'].validate(value)
        if (syncResult instanceof Promise) {
          throw new TypeError('sync structural validate returned a Promise')
        }
        if (syncResult.issues) return syncResult

        const username = (syncResult.value as { username?: unknown }).username
        if (typeof username !== 'string') {
          return { value: syncResult.value as Record<string, unknown> }
        }

        return checker
          .checkUsername(username)
          .then((available) => {
            if (!available) {
              return {
                issues: [
                  {
                    message: USERNAME_TAKEN,
                    path: ['username'],
                  },
                ],
              }
            }
            return { value: syncResult.value as Record<string, unknown> }
          })
          .catch(() => ({
            issues: [
              {
                message: USERNAME_CHECK_FAILED,
                path: ['username'],
              },
            ],
          }))
      },
    },
  }
}
