// RECIPE TESTS — gallery walkthrough for unknown-shape field mode.
import { createContext, useContext, useEffect, useMemo } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import type { FieldValues } from 'react-hook-form'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import type { FieldControl } from '@formframe/core'
import { toStandardSchema } from '@formframe/core'
import { jsonSchemaToRuntimeTree } from '@formframe/input-jsonschema'
import type { JSONSchema } from '@formframe/input-jsonschema'
import {
  fieldErrorId,
  nativeDefaults,
  useFormTree,
  type ReactPartialDefaults,
} from '@formframe/renderer-react'
import { createAjvValidator } from './ajvValidator.recipe'
import {
  createFieldMode,
  isBlank,
  type FieldModeSnapshot,
} from './fieldMode.recipe'
import { rhfFieldDefaults } from './rhfFieldControls.recipe'
import Recipe from './Recipe_FieldMode_JSONSchema'

describe('fieldMode.recipe · gallery', () => {
  it('hides extra notes when driver is no and shows + requires it when yes', async () => {
    const screen = await render(<Recipe />)
    expect(document.querySelector('[name="extraNotes"]')).toBeNull()

    await screen.getByRole('radio', { name: 'yes', exact: true }).click()
    await expect
      .element(screen.getByRole('textbox', { name: 'Extra notes' }))
      .toBeInTheDocument()

    await screen.getByRole('textbox', { name: 'Title' }).fill('Hello')
    await screen.getByRole('button', { name: 'Submit' }).click()
    await expect
      .element(screen.getByTestId('required-badge-extraNotes'))
      .toBeInTheDocument()
    expect(
      document.getElementById(fieldErrorId('extraNotes'))?.textContent
    ).toContain('required')
  })

  it('read-only stamps the internal comment when driver is yes', async () => {
    const screen = await render(<Recipe />)
    await screen.getByRole('radio', { name: 'yes', exact: true }).click()
    await expect
      .element(screen.getByTestId('readonly-badge-internalComment'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('textbox', { name: 'Internal comment' }))
      .toHaveAttribute('readonly')
  })

  it('clears typed extra notes on hide so they do not survive submit', async () => {
    const screen = await render(<Recipe />)
    await screen.getByRole('radio', { name: 'yes', exact: true }).click()
    await screen.getByRole('textbox', { name: 'Extra notes' }).fill('secret')
    await screen.getByRole('textbox', { name: 'Title' }).fill('Hello')
    await screen.getByRole('radio', { name: 'no', exact: true }).click()
    expect(document.querySelector('[name="extraNotes"]')).toBeNull()

    await screen.getByRole('button', { name: 'Submit' }).click()
    await expect.element(screen.getByTestId('submitted')).toBeInTheDocument()
    const submitted = JSON.parse(
      document.querySelector('[data-testid="submitted"]')?.textContent ?? '{}'
    ) as Record<string, unknown>
    expect(submitted.extraNotes).toBeNull()
    expect(JSON.stringify(submitted)).not.toContain('secret')
  })

  it('typing in title does not remount sibling fields', async () => {
    const screen = await render(<Recipe />)
    const title = document.querySelector('[name="title"]')
    const comment = document.querySelector('[name="internalComment"]')
    expect(title).toBeTruthy()
    expect(comment).toBeTruthy()

    await screen.getByRole('textbox', { name: 'Title' }).fill('Hello')

    expect(document.querySelector('[name="title"]')).toBe(title)
    expect(document.querySelector('[name="internalComment"]')).toBe(comment)
    expect((comment as HTMLInputElement).value).toBe('seeded comment')
  })

  it('toggling the driver remounts extra notes in place without remounting title', async () => {
    const screen = await render(<Recipe />)
    const title = document.querySelector('[name="title"]')
    const comment = document.querySelector('[name="internalComment"]')

    await screen.getByRole('radio', { name: 'yes', exact: true }).click()
    await expect
      .element(screen.getByRole('textbox', { name: 'Extra notes' }))
      .toBeInTheDocument()

    expect(document.querySelector('[name="title"]')).toBe(title)
    expect(document.querySelector('[name="internalComment"]')).toBe(comment)
    expect(document.querySelector('[name="extraNotes"]')).toBeTruthy()
  })
})

// Render-count harness — same compile-once + RHF wiring as the gallery recipe.
type Counts = Record<string, number>

const DRIVER = 'driver'
const NOTES = 'extraNotes'
const EMAIL = 'followUpEmail'
const COMMENT = 'internalComment'
const TITLE = 'title'

const countSchema = {
  type: 'object',
  required: [TITLE],
  properties: {
    [DRIVER]: {
      type: 'string',
      title: 'Need extra details?',
      enum: ['yes', 'no'],
    },
    [NOTES]: { type: 'string', title: 'Extra notes' },
    [EMAIL]: { type: 'string', title: 'Follow-up email' },
    [COMMENT]: { type: 'string', title: 'Internal comment' },
    [TITLE]: { type: 'string', title: 'Title' },
  },
} as const satisfies JSONSchema

const countRules = [
  {
    conditions: { or: [{ [DRIVER]: { not: { eq: 'yes' } } }] },
    event: [
      { type: 'remove' as const, params: { field: NOTES } },
      { type: 'setValue' as const, params: { field: NOTES, value: null } },
    ],
  },
  {
    conditions: { [DRIVER]: { eq: 'yes' } },
    event: [
      { type: 'require' as const, params: { field: EMAIL } },
      { type: 'require' as const, params: { field: NOTES } },
      { type: 'setReadOnly' as const, params: { field: COMMENT } },
    ],
  },
]

const countTree = jsonSchemaToRuntimeTree(countSchema)
const countFieldMode = createFieldMode(countRules)
const countValidator = createAjvValidator(countSchema, {
  fieldMode: countFieldMode,
})
const countResolver = standardSchemaResolver(
  toStandardSchema(countValidator) as StandardSchemaV1<FieldValues>
)

const CountModeCtx = createContext<FieldModeSnapshot>({
  isHidden: () => false,
  isRequired: () => false,
  isReadOnly: () => false,
  hidden: new Set(),
  required: new Set(),
  readOnly: new Set(),
  setValues: {},
})

function controlName(control: FieldControl): string {
  return control.kind === 'choicegroup'
    ? (control.options[0]?.attrs.name ?? '')
    : control.attrs.name
}

function bump(counts: Counts, key: string) {
  counts[key] = (counts[key] ?? 0) + 1
}

function reset(counts: Counts) {
  for (const key of Object.keys(counts)) delete counts[key]
}

function membershipKey(mode: FieldModeSnapshot): string {
  return [
    [...mode.hidden].sort().join(),
    [...mode.required].sort().join(),
    [...mode.readOnly].sort().join(),
    JSON.stringify(mode.setValues),
  ].join('|')
}

const countingCounts: { current: Counts } = { current: {} }

function CountingFieldRoot(
  props: Parameters<NonNullable<typeof nativeDefaults.field.root>>[0]
) {
  bump(countingCounts.current, `field.root:${props.node.path}`)
  const mode = useContext(CountModeCtx)
  const Root = rhfFieldDefaults.field.root
  const rendered = Root ? Root(props) : null
  if (mode.isHidden(props.node.path)) return null
  return rendered
}

function CountingFieldControl(data: FieldControl) {
  bump(countingCounts.current, `field.control:${controlName(data)}`)
  const Control = rhfFieldDefaults.field.control
  return Control ? Control(data) : null
}

const countingDefaults: ReactPartialDefaults = {
  field: { root: CountingFieldRoot, control: CountingFieldControl },
}

function CountingDemo({ counts }: { counts: Counts }) {
  countingCounts.current = counts
  const methods = useForm({
    resolver: countResolver,
    defaultValues: {
      [DRIVER]: 'no',
      [NOTES]: '',
      [EMAIL]: '',
      [COMMENT]: 'seeded comment',
      [TITLE]: '',
    },
  })
  useWatch({
    control: methods.control,
    name: [...countFieldMode.paths],
  })
  const nextMode = countFieldMode(methods.getValues())
  const key = membershipKey(nextMode)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- membership key
  const mode = useMemo(() => nextMode, [key])
  const hiddenKey = [...mode.hidden].sort().join()
  const setValuesKey = JSON.stringify(mode.setValues)

  useEffect(() => {
    const snapshot = countFieldMode(methods.getValues())
    for (const [path, value] of Object.entries(snapshot.setValues)) {
      const current = methods.getValues(path)
      if (current === value) continue
      if (isBlank(current) && value == null) continue
      methods.setValue(path, value as never, { shouldDirty: true })
    }
    for (const path of snapshot.hidden) methods.clearErrors(path)
  }, [hiddenKey, setValuesKey, methods])

  const { SchemaFields } = useFormTree(countTree, {
    defaults: countingDefaults,
  })

  return (
    <CountModeCtx.Provider value={mode}>
      <FormProvider {...methods}>
        <form
          noValidate
          onSubmit={methods.handleSubmit(() => {
            /* validation side effects only */
          })}
        >
          <SchemaFields />
          <button type="submit">Submit</button>
        </form>
      </FormProvider>
    </CountModeCtx.Provider>
  )
}

describe('fieldMode.recipe · render counts', () => {
  it('typing in a non-condition field re-renders zero field roots', async () => {
    const counts: Counts = {}
    const screen = await render(<CountingDemo counts={counts} />)
    await expect
      .poll(() => document.querySelector('[name="title"]'))
      .toBeTruthy()
    await new Promise((r) => setTimeout(r, 30))
    reset(counts)

    await screen.getByRole('textbox', { name: 'Title' }).fill('Hello')
    await new Promise((r) => setTimeout(r, 20))

    expect(counts['field.root:title'] ?? 0).toBe(0)
    expect(counts['field.root:internalComment'] ?? 0).toBe(0)
    expect(counts['field.root:driver'] ?? 0).toBe(0)
    expect(counts['field.root:extraNotes'] ?? 0).toBe(0)
    expect(counts['field.control:title'] ?? 0).toBe(0)
  })

  it('toggling the driver re-renders field roots via field-mode context', async () => {
    const counts: Counts = {}
    const screen = await render(<CountingDemo counts={counts} />)
    await expect
      .poll(() => document.querySelector('[name="title"]'))
      .toBeTruthy()
    await new Promise((r) => setTimeout(r, 30))
    reset(counts)

    await screen.getByRole('radio', { name: 'yes', exact: true }).click()
    await expect
      .poll(() => document.querySelector('[name="extraNotes"]'))
      .toBeTruthy()

    expect(counts['field.root:extraNotes'] ?? 0).toBeGreaterThan(0)
    expect(counts['field.control:extraNotes'] ?? 0).toBeGreaterThan(0)
    expect(counts['field.root:title'] ?? 0).toBeGreaterThan(0)
    expect(counts['field.root:internalComment'] ?? 0).toBeGreaterThan(0)
  })

  it('after submit, typing in title does not re-render sibling field roots', async () => {
    const counts: Counts = {}
    const screen = await render(<CountingDemo counts={counts} />)
    await expect
      .poll(() => document.querySelector('[name="title"]'))
      .toBeTruthy()

    await screen.getByRole('textbox', { name: 'Title' }).fill('Hello')
    await screen.getByRole('button', { name: 'Submit' }).click()
    await new Promise((r) => setTimeout(r, 30))
    reset(counts)

    await screen.getByRole('textbox', { name: 'Title' }).fill('Hello world')
    await new Promise((r) => setTimeout(r, 20))

    expect(counts['field.root:internalComment'] ?? 0).toBe(0)
    expect(counts['field.root:driver'] ?? 0).toBe(0)
    expect(counts['field.root:extraNotes'] ?? 0).toBe(0)
  })
})
