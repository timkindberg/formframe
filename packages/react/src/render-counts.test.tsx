// Render-count perf contract (bead jsonschema-form-bi4 follow-up).
//
// render-stability.test.tsx + arrays.test.tsx assert *value/identity* preservation
// (a remount IS a value loss) as the proxy. These tests assert the sharper,
// underlying contract directly: a localized state change re-renders ONLY the
// nodes that actually changed. We measure it with a "counting adapter" — a real
// RendererAdapter that tallies how many times each node/part renderer runs,
// keyed by path — so "did node X re-render?" becomes a hard number.

import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { jsonSchemaToTree } from '@jsonschema-form/input-jsonschema'
import type { JSONSchema } from '@jsonschema-form/input-jsonschema'
import { useState, useMemo } from 'react'
import { createAjvValidator } from '@jsonschema-form/validation-ajv'
import {
  createRenderer,
  defaultAdapter,
  ValidationProvider,
  fieldControlId,
  fieldErrorId,
  type ReactPartialAdapter,
} from './renderer'
import { useFormTree } from './useFormTree'
import type { FieldControl } from '@jsonschema-form/core'

type Counts = Record<string, number>

/** The field's submitted `name` from any control archetype — every option in a
 * `choicegroup` shares the field name, so its first option carries it. */
function controlName(control: FieldControl): string {
  return control.kind === 'choicegroup'
    ? (control.options[0]?.attrs.name ?? '')
    : control.attrs.name
}

/** Wrap the real defaults, tallying each renderer invocation by a stable key. */
function countingAdapter(counts: Counts): ReactPartialAdapter {
  const bump = (key: string) => {
    counts[key] = (counts[key] ?? 0) + 1
  }
  const d = defaultAdapter
  return {
    field: {
      root: (p) => {
        bump(`field.root:${p.node.path}`)
        return d.field.root(p)
      },
      label: d.field.label,
      description: d.field.description,
      control: (data) => {
        bump(`field.control:${controlName(data)}`)
        return d.field.control(data)
      },
    },
    group: {
      root: (p) => {
        bump(`group.root:${p.node.path}`)
        return d.group.root(p)
      },
      label: d.group.label,
      description: d.group.description,
    },
    array: {
      root: (p) => {
        bump(`array.root:${p.node.path}`)
        return d.array.root(p)
      },
      label: d.array.label,
      description: d.array.description,
      addButton: (data) => {
        bump('array.addButton')
        return d.array.addButton(data)
      },
    },
    arrayItem: {
      root: (p) => {
        bump(`arrayItem.root:${p.node.path}`)
        return d.arrayItem.root(p)
      },
      removeButton: (data) => {
        bump('arrayItem.removeButton')
        return d.arrayItem.removeButton(data)
      },
    },
    combine: d.combine,
  }
}

const arraySchema: JSONSchema = {
  type: 'object',
  properties: {
    contacts: {
      type: 'array',
      title: 'Contacts',
      minItems: 1,
      items: {
        type: 'object',
        properties: { name: { type: 'string', title: 'Contact name' } },
      },
    },
  },
}

const flatSchema: JSONSchema = {
  type: 'object',
  properties: { name: { type: 'string', title: 'Name' } },
}

const reset = (counts: Counts) => {
  for (const k of Object.keys(counts)) delete counts[k]
}

const total = (counts: Counts) =>
  Object.values(counts).reduce((a, b) => a + b, 0)

describe('render-count contract', () => {
  it('appending an item re-renders nothing in the existing items', async () => {
    const counts: Counts = {}
    const Counting = createRenderer(countingAdapter(counts))
    const form = jsonSchemaToTree(arraySchema)
    const screen = await render(<Counting form={form} />)

    reset(counts)
    await screen.getByRole('button', { name: /add/i }).click()
    await expect
      .poll(() => document.querySelectorAll('input[name$=".name"]').length)
      .toBe(2)

    // the pre-existing item (contacts.0) must not re-render any of its parts…
    expect(counts['field.root:contacts.0.name'] ?? 0).toBe(0)
    expect(counts['field.control:contacts.0.name'] ?? 0).toBe(0)
    expect(counts['arrayItem.root:contacts.0'] ?? 0).toBe(0)
    // …including its Remove button: only the ONE new item's button renders.
    expect(counts['arrayItem.removeButton'] ?? 0).toBe(1)
  })

  // ADR 018: removing the LAST item shifts no survivor's position, so dense
  // re-pathing is a no-op and nothing of the survivor re-renders (its slot — and
  // thus its actions/core — is untouched, so React keeps the whole subtree).
  it('removing the last item re-renders nothing in the survivors', async () => {
    const counts: Counts = {}
    const Counting = createRenderer(countingAdapter(counts))
    const form = jsonSchemaToTree(arraySchema)
    const screen = await render(<Counting form={form} />)

    await screen.getByRole('button', { name: /add/i }).click()
    await expect
      .poll(() => document.querySelectorAll('input[name$=".name"]').length)
      .toBe(2)

    reset(counts)
    // drop the SECOND (last) item — the survivor at contacts.0 does not shift
    await screen
      .getByRole('button', { name: /remove/i })
      .nth(1)
      .click()
    await expect
      .poll(() => document.querySelectorAll('input[name$=".name"]').length)
      .toBe(1)

    expect(counts['field.root:contacts.0.name'] ?? 0).toBe(0)
    expect(counts['field.control:contacts.0.name'] ?? 0).toBe(0)
    expect(counts['arrayItem.root:contacts.0'] ?? 0).toBe(0)
    expect(counts['arrayItem.removeButton'] ?? 0).toBe(0)
  })

  // ADR 018: removing a NON-last item re-paths the items after it densely, so
  // exactly those survivors re-render (to update their `name`s) while the ones
  // before the gap stay untouched. Values survive in place (see arrays.test).
  it('removing a middle item re-renders only the items after it', async () => {
    const counts: Counts = {}
    const Counting = createRenderer(countingAdapter(counts))
    const form = jsonSchemaToTree(arraySchema)
    const screen = await render(<Counting form={form} />)

    // grow to three items: contacts.0, .1, .2
    await screen.getByRole('button', { name: /add/i }).click()
    await screen.getByRole('button', { name: /add/i }).click()
    await expect
      .poll(() => document.querySelectorAll('input[name$=".name"]').length)
      .toBe(3)

    reset(counts)
    // drop the MIDDLE item (contacts.1); the tail (contacts.2) re-paths to .1
    await screen
      .getByRole('button', { name: /remove/i })
      .nth(1)
      .click()
    await expect
      .poll(() => document.querySelectorAll('input[name$=".name"]').length)
      .toBe(2)

    // the item BEFORE the gap is untouched (same position → memo bail)…
    expect(counts['field.root:contacts.0.name'] ?? 0).toBe(0)
    expect(counts['field.control:contacts.0.name'] ?? 0).toBe(0)
    expect(counts['arrayItem.root:contacts.0'] ?? 0).toBe(0)
    // …the tail re-rendered at its new dense path contacts.1 (in place, no remount)
    expect(counts['arrayItem.root:contacts.1'] ?? 0).toBeGreaterThan(0)
    expect(counts['field.control:contacts.1.name'] ?? 0).toBeGreaterThan(0)
  })

  // Guard for the NodeRenderer memo floor (ADR 015 / render-stability.test.tsx),
  // stated as a number: an unrelated ancestor re-render bails at the root and
  // reaches zero node renderers.
  it('an unrelated parent re-render runs zero node renderers', async () => {
    const counts: Counts = {}
    const Counting = createRenderer(countingAdapter(counts))
    const form = jsonSchemaToTree(flatSchema)

    function Parent(): React.ReactNode {
      const [, setN] = useState(0)
      return (
        <>
          <button type="button" onClick={() => setN((n) => n + 1)}>
            bump
          </button>
          <Counting form={form} />
        </>
      )
    }

    const screen = await render(<Parent />)
    reset(counts)
    await screen.getByRole('button', { name: 'bump' }).click()
    // Give a stray re-render a chance to land before asserting silence.
    await new Promise((r) => setTimeout(r, 20))

    expect(total(counts)).toBe(0)
  })
})

// The validation fan-out contract (ADR 023): producing a new issue set must
// re-render ONLY the fields whose issues changed — never their siblings. This is
// the perf claim the maintainer flagged ("we can never re-render nodes if it was
// preventable"). We drive a real live-validation pass and read the same counting
// adapter: a sibling with no issue (and no issue change) must stay at zero.
const validationSchema: JSONSchema = {
  type: 'object',
  required: ['username'],
  properties: {
    // gains an issue the moment you type fewer than 3 chars
    username: { type: 'string', title: 'Username', minLength: 3 },
    // unconstrained → never has an issue, so its snapshot never changes
    note: { type: 'string', title: 'Note' },
  },
}
const validationTree = jsonSchemaToTree(validationSchema)

function ValidationCountingHarness({
  Counting,
}: {
  Counting: ReturnType<typeof createRenderer>
}) {
  const validator = useMemo(() => createAjvValidator(validationSchema), [])
  const { form, revalidate, validation } = useFormTree(validationTree, {
    validator,
  })
  // This suite is about issue-store fan-out (ADR 023), not the touched display
  // policy (ADR 027) — report immediately so a new issue renders on change.
  return (
    <form noValidate onChange={revalidate}>
      <ValidationProvider {...validation} showErrorsWhen="always">
        <Counting form={form} />
      </ValidationProvider>
    </form>
  )
}

describe('validation render-count contract (ADR 023)', () => {
  it('a field gaining an issue re-renders only that field, not its siblings', async () => {
    const counts: Counts = {}
    const Counting = createRenderer(countingAdapter(counts))
    const screen = await render(
      <ValidationCountingHarness Counting={Counting} />
    )

    reset(counts)
    // type an invalid value into username (minLength 3); `note` stays valid
    await screen.getByRole('textbox', { name: 'Username' }).fill('a')
    await expect
      .poll(() => document.querySelectorAll('.jsf-field-errors').length)
      .toBe(1)

    // the sibling never had/has an issue → its snapshot is referentially stable,
    // so it must not have re-rendered at all (no Context fan-out)
    expect(counts['field.root:note'] ?? 0).toBe(0)
    expect(counts['field.control:note'] ?? 0).toBe(0)
    // the changed field did re-render (to surface its error + aria wiring)
    expect(counts['field.root:username'] ?? 0).toBeGreaterThan(0)
  })
})

// The touched-gating fan-out contract (ADR 027): the same "no preventable
// re-render" rule applied to the *display* dimension. Both fields carry an issue
// (both hidden under 'touched'); blurring ONE must reveal only that field's error
// and re-render only that field — the untouched sibling, whose display decision
// did not flip, must stay at zero. This proves the touched store (a boolean
// per-path snapshot) does not fan out any more than the issue store did.
const touchedGateSchema: JSONSchema = {
  type: 'object',
  required: ['username', 'zip'],
  properties: {
    username: { type: 'string', title: 'Username', minLength: 3 },
    zip: { type: 'string', title: 'Zip', pattern: '^[0-9]{5}$' },
  },
}
const touchedGateTree = jsonSchemaToTree(touchedGateSchema)

function dispatchInput(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
}

function TouchedCountingHarness({
  Counting,
}: {
  Counting: ReturnType<typeof createRenderer>
}) {
  const validator = useMemo(() => createAjvValidator(touchedGateSchema), [])
  const { form, revalidate, handleBlur, validation } = useFormTree(
    touchedGateTree,
    { validator }
  )
  return (
    <form noValidate onInput={revalidate} onBlur={handleBlur}>
      <ValidationProvider {...validation} showErrorsWhen="touched">
        <Counting form={form} />
      </ValidationProvider>
    </form>
  )
}

describe('touched-gating render-count contract (ADR 027)', () => {
  it('blurring a field reveals only its own error, not an untouched sibling with an issue', async () => {
    const counts: Counts = {}
    const Counting = createRenderer(countingAdapter(counts))
    await render(<TouchedCountingHarness Counting={Counting} />)

    // One keystroke in username runs the whole-form validator, so BOTH username
    // (minLength) and the empty required zip gain issues — both hidden (untouched).
    const username = document.getElementById(
      fieldControlId('username')
    ) as HTMLInputElement
    username.focus()
    dispatchInput(username, 'a')
    await new Promise((r) => setTimeout(r, 30))
    expect(document.querySelectorAll('.jsf-field-errors').length).toBe(0)

    reset(counts)
    // Blur username → it becomes touched and reveals its error.
    username.blur()
    await expect
      .poll(() => document.getElementById(fieldErrorId('username')))
      .not.toBeNull()

    // zip also has an issue but was never touched → its display decision is
    // unchanged (still hidden), so it must not have re-rendered at all.
    expect(counts['field.root:zip'] ?? 0).toBe(0)
    expect(counts['field.control:zip'] ?? 0).toBe(0)
    // the blurred field re-rendered to surface its error + aria wiring.
    expect(counts['field.root:username'] ?? 0).toBeGreaterThan(0)
  })
})
