/**
 * Parity proof (#125): full capability matrix across native + RHF + TanStack.
 *
 * Combo policy (#118 option B):
 *   - Full 13-row matrix × 3 recipes on JSON Schema (canonical)
 *   - Source-sensitive rows × 3 recipes on Zod
 *
 * Assertion surface: shared DOM contract + onSubmit spy + pending beacon —
 * never framework internals.
 */
import { useCallback, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { fieldControlId, fieldErrorId } from '../renderer'
import {
  createUsernameChecker,
  PASSWORDS_MUST_MATCH,
  USERNAME_CHECK_FAILED,
  USERNAME_TAKEN,
  type UsernameChecker,
} from './fixtures'
import {
  NativeParityRecipe,
  RhfParityRecipe,
  TanStackParityRecipe,
  type ParityRecipeProps,
  type ParitySource,
} from './recipes'

type RecipeName = 'native' | 'rhf' | 'tanstack'

const RECIPES: {
  name: RecipeName
  Recipe: (props: ParityRecipeProps) => ReactNode
}[] = [
  { name: 'native', Recipe: NativeParityRecipe },
  { name: 'rhf', Recipe: RhfParityRecipe },
  { name: 'tanstack', Recipe: TanStackParityRecipe },
]

function errorList(path: string): HTMLElement | null {
  return document.getElementById(fieldErrorId(path))
}

function control(path: string): HTMLInputElement | null {
  return document.getElementById(
    fieldControlId(path)
  ) as HTMLInputElement | null
}

function visibleErrorCount(): number {
  return document.querySelectorAll('ul.jsf-field-errors').length
}

function pendingBeacon(): HTMLElement | null {
  return document.querySelector('[data-testid="parity-pending"]')
}

type Screen = Awaited<ReturnType<typeof render>>

/** Fill via FormFrame control id + userEvent (works controlled & uncontrolled). */
async function fillPath(_screen: Screen, path: string, value: string) {
  const el = control(path)
  expect(el, `missing #${path}`).not.toBeNull()
  await userEvent.clear(el!)
  await userEvent.fill(el!, value)
}

async function fillValid(
  screen: Screen,
  opts?: { username?: string; age?: string }
) {
  await fillPath(screen, 'username', opts?.username ?? 'alice')
  await fillPath(screen, 'email', 'alice@example.com')
  await fillPath(screen, 'age', opts?.age ?? '25')
  await fillPath(screen, 'password', 'password1')
  await fillPath(screen, 'confirmPassword', 'password1')
  await fillPath(screen, 'address.line1', '123 Main St')
  await fillPath(screen, 'address.zip', '12345')
  await fillPath(screen, 'contacts.0.name', 'Bob')
  await fillPath(screen, 'contacts.0.email', 'bob@example.com')
}

async function clickSubmit(screen: Screen) {
  await screen.getByRole('button', { name: 'Submit' }).click()
}

function Harness({
  Recipe,
  source,
  checker,
  onSubmit,
}: {
  Recipe: (props: ParityRecipeProps) => ReactNode
  source: ParitySource
  checker: UsernameChecker
  onSubmit: (data: Record<string, unknown>) => void
}) {
  const checkUsername = useCallback(
    (name: string) => checker.checkUsername(name),
    [checker]
  )
  return (
    <Recipe source={source} checkUsername={checkUsername} onSubmit={onSubmit} />
  )
}

describe.each(RECIPES)('parity · $name', ({ Recipe }) => {
  let checker: UsernameChecker
  let submitted: Record<string, unknown> | null
  const onSubmit = vi.fn((data: Record<string, unknown>) => {
    submitted = data
  })

  beforeEach(() => {
    checker = createUsernameChecker()
    submitted = null
    onSubmit.mockClear()
  })

  afterEach(() => {
    checker.reset()
  })

  async function mount(source: ParitySource = 'jsonschema') {
    return render(
      <Harness
        Recipe={Recipe}
        source={source}
        checker={checker}
        onSubmit={onSubmit}
      />
    )
  }

  it('1 · submit-time validation gates onValid / successful submit', async () => {
    const screen = await mount()
    await clickSubmit(screen)
    await expect.poll(() => visibleErrorCount()).toBeGreaterThan(0)
    expect(onSubmit).not.toHaveBeenCalled()

    checker.setOutcome('available')
    await fillValid(screen)
    await clickSubmit(screen)
    await expect.poll(() => onSubmit.mock.calls.length).toBe(1)
    expect(submitted).not.toBeNull()
  })

  it('2 · live/reactive revalidation after first reveal', async () => {
    const screen = await mount()
    await fillPath(screen, 'email', 'not-an-email')
    await clickSubmit(screen)
    await expect.poll(() => errorList('email')).not.toBeNull()

    await fillPath(screen, 'email', 'alice@example.com')
    await expect.poll(() => errorList('email')).toBeNull()
  })

  it('3 · shared default display timing (quiet pre-submit)', async () => {
    const screen = await mount()
    await fillPath(screen, 'email', 'bad')
    control('email')?.blur()
    await new Promise((r) => setTimeout(r, 150))
    expect(visibleErrorCount()).toBe(0)

    await clickSubmit(screen)
    await expect.poll(() => visibleErrorCount()).toBeGreaterThan(0)
  })

  it('4 · per-field error placement + a11y (no role=alert)', async () => {
    const screen = await mount()
    await fillPath(screen, 'email', 'bad')
    await clickSubmit(screen)
    await expect.poll(() => errorList('email')).not.toBeNull()

    const el = control('email')
    expect(el?.getAttribute('aria-invalid')).toBe('true')
    expect(el?.getAttribute('aria-describedby')).toBe(fieldErrorId('email'))
    expect(errorList('email')?.id).toBe(fieldErrorId('email'))
    expect(errorList('email')?.getAttribute('role')).not.toBe('alert')
    expect(
      document.querySelector('ul.jsf-field-errors[role="alert"]')
    ).toBeNull()
  })

  it('5 · validation summary (DOM order) linkable via fieldControlId', async () => {
    const screen = await mount()
    await clickSubmit(screen)
    await expect
      .poll(() => document.querySelector('[data-testid="parity-summary"]'))
      .not.toBeNull()

    const summary = document.querySelector('[data-testid="parity-summary"]')!
    const links = [...summary.querySelectorAll('a')]
    expect(links.length).toBeGreaterThan(0)
    const hrefs = links.map((a) => a.getAttribute('href'))
    expect(hrefs).toContain(`#${fieldControlId('username')}`)
    expect(hrefs).toContain(`#${fieldControlId('email')}`)
    const u = hrefs.indexOf(`#${fieldControlId('username')}`)
    const e = hrefs.indexOf(`#${fieldControlId('email')}`)
    expect(u).toBeGreaterThanOrEqual(0)
    expect(e).toBeGreaterThan(u)
  })

  it('6 · cross-field rule attaches to confirmPassword', async () => {
    const screen = await mount()
    await fillValid(screen)
    await fillPath(screen, 'confirmPassword', 'mismatch!')
    await clickSubmit(screen)
    await expect.poll(() => errorList('confirmPassword')).not.toBeNull()
    expect(errorList('confirmPassword')?.textContent).toContain(
      PASSWORDS_MUST_MATCH
    )
  })

  it('7 · async validator (username availability)', async () => {
    checker.setOutcome('taken')
    const screen = await mount()
    await fillValid(screen, { username: 'takenuser' })
    await clickSubmit(screen)
    await expect.poll(() => errorList('username')).not.toBeNull()
    expect(errorList('username')?.textContent).toContain(USERNAME_TAKEN)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('8 · pending signals while async validates', async () => {
    checker.setDelay(200)
    checker.setOutcome('available')
    const screen = await mount()
    await fillValid(screen)
    await clickSubmit(screen)
    await expect
      .poll(() => pendingBeacon()?.getAttribute('data-pending'))
      .toBe('true')
    await expect
      .poll(() => pendingBeacon()?.getAttribute('data-pending'))
      .toBe('false')
  })

  it('9 · stale-result protection (out-of-order async)', async () => {
    // Slow "taken" then fast "available". Changing the value mid-flight must
    // not leave a stale "taken" error on the new value. RHF may coalesce the
    // second run (calls.length can stay 1) and still discard via its
    // isFieldValueUpdated gate — assert the observable DOM, not call count.
    checker.enqueue(
      { delay: 250, outcome: 'taken' },
      { delay: 20, outcome: 'available' }
    )
    const screen = await mount()
    await fillValid(screen, { username: 'first' })
    await clickSubmit(screen)
    await expect
      .poll(() => pendingBeacon()?.getAttribute('data-pending'))
      .toBe('true')
    await fillPath(screen, 'username', 'second')
    await fillPath(screen, 'email', 'alice@example.com')
    await expect.poll(() => errorList('username'), { timeout: 3000 }).toBeNull()
  })

  it('10 · run-failure vs invalid (throw → distinct username error)', async () => {
    checker.setOutcome('throw')
    const screen = await mount()
    await fillValid(screen, { username: 'boom' })
    await clickSubmit(screen)
    await expect.poll(() => errorList('username')).not.toBeNull()
    expect(errorList('username')?.textContent).toContain(USERNAME_CHECK_FAILED)
    expect(errorList('username')?.textContent).not.toContain(USERNAME_TAKEN)
  })

  it('11 · coerced/transformed output on submit (age number)', async () => {
    checker.setOutcome('available')
    const screen = await mount()
    await fillValid(screen, { age: '30' })
    await clickSubmit(screen)
    await expect.poll(() => onSubmit.mock.calls.length).toBe(1)
    expect(typeof submitted?.age).toBe('number')
    expect(submitted?.age).toBe(30)
  })

  it('12 · nested + array error paths (address.line1, contacts.0.email)', async () => {
    const screen = await mount()
    await fillPath(screen, 'username', 'alice')
    await fillPath(screen, 'email', 'alice@example.com')
    await fillPath(screen, 'age', '25')
    await fillPath(screen, 'password', 'password1')
    await fillPath(screen, 'confirmPassword', 'password1')
    await fillPath(screen, 'contacts.0.name', 'Bob')
    await fillPath(screen, 'contacts.0.email', 'not-email')
    await clickSubmit(screen)
    await expect.poll(() => errorList('address.line1')).not.toBeNull()
    await expect.poll(() => errorList('contacts.0.email')).not.toBeNull()
  })

  it('13 · Standard Schema interop (resolver / built-in SS path)', async () => {
    checker.setOutcome('available')
    const screen = await mount('jsonschema')
    await fillValid(screen)
    await clickSubmit(screen)
    await expect.poll(() => onSubmit.mock.calls.length).toBe(1)
  })

  describe('Zod source-sensitive', () => {
    it('cross-field on confirmPassword (Zod)', async () => {
      const screen = await mount('zod')
      await fillValid(screen)
      await fillPath(screen, 'confirmPassword', 'nope-nope')
      await clickSubmit(screen)
      await expect.poll(() => errorList('confirmPassword')).not.toBeNull()
      expect(errorList('confirmPassword')?.textContent).toContain(
        PASSWORDS_MUST_MATCH
      )
    })

    it('async username (Zod)', async () => {
      checker.setOutcome('taken')
      const screen = await mount('zod')
      await fillValid(screen, { username: 'takenuser' })
      await clickSubmit(screen)
      await expect.poll(() => errorList('username')).not.toBeNull()
      expect(errorList('username')?.textContent).toContain(USERNAME_TAKEN)
    })

    it('coerced age number on submit (Zod)', async () => {
      checker.setOutcome('available')
      const screen = await mount('zod')
      await fillValid(screen, { age: '42' })
      await clickSubmit(screen)
      await expect.poll(() => onSubmit.mock.calls.length).toBe(1)
      expect(submitted?.age).toBe(42)
    })

    it('nested + array paths (Zod)', async () => {
      const screen = await mount('zod')
      await fillPath(screen, 'username', 'alice')
      await fillPath(screen, 'email', 'alice@example.com')
      await fillPath(screen, 'password', 'password1')
      await fillPath(screen, 'confirmPassword', 'password1')
      await fillPath(screen, 'contacts.0.name', 'Bob')
      await fillPath(screen, 'contacts.0.email', 'bad')
      await clickSubmit(screen)
      await expect.poll(() => errorList('address.line1')).not.toBeNull()
      await expect.poll(() => errorList('contacts.0.email')).not.toBeNull()
    })

    it('Standard Schema interop (Zod is SS)', async () => {
      checker.setOutcome('available')
      const screen = await mount('zod')
      await fillValid(screen)
      await clickSubmit(screen)
      await expect.poll(() => onSubmit.mock.calls.length).toBe(1)
    })
  })
})
