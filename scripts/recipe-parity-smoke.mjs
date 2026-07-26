// Parity smoke for the four form-library × front-end recipes (#116 epic):
//   12  — React Hook Form over JSON Schema + AJV
//   12B — React Hook Form over Zod
//   18  — TanStack Form over JSON Schema + AJV
//   18B — TanStack Form over Zod
//
// Drives all four through ONE identical interaction script and asserts the
// observable behavior is identical. Each recipe uses its own library's DEFAULT
// validation timing — RHF's default mode, TanStack's `revalidateLogic()` with
// no arguments — which agree observably: quiet until the first submit attempt,
// then errors reveal and clear live. (TanStack's `revalidateLogic` exists
// specifically to emulate RHF's behavior, so this is by design, not luck.)
// That agreement is what makes one shared script meaningful; the assertions
// below describe that shared timing plus identical error sets and identical
// submitted output (including AJV/Zod numeric coercion).
//
// This is the interim, script-shaped cousin of #125's real parity harness
// (#118 specced that as a `describe.each` Vitest-browser suite, blocked on
// the native recipe #122). When #125 lands, this script is superseded.
//
// Usage:
//   npm run smoke:recipes                        # starts/stops the dev server
//   npm run smoke:recipes -- http://host:5173    # reuse a server already up
//
// If Playwright can't find a browser, point CHROMIUM_PATH at a Chromium
// binary. `--no-sandbox` is passed for containerized/root environments.

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const DEFAULT_URL = 'http://localhost:5173'
const BASE_URL = process.argv[2] ?? DEFAULT_URL

const RECIPES = [
  { tab: /^12\./, heading: 'React Hook Form as the form-state layer' },
  { tab: /^12B\./, heading: 'React Hook Form over Zod' },
  { tab: /^18\./, heading: 'TanStack Form as the form-state layer' },
  { tab: /^18B\./, heading: 'TanStack Form over Zod' },
]

const RECIPE_NAMES = ['12', '12B', '18', '18B']

const failures = []
function check(recipe, label, ok, detail = '') {
  const line = `[${recipe}] ${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`
  console.log(line)
  if (!ok) failures.push(line)
}

/** Poll `fn` until truthy or timeout; returns last value. */
async function waitFor(fn, ms = 4000, step = 100) {
  const deadline = Date.now() + ms
  let last
  for (;;) {
    last = await fn()
    if (last || Date.now() > deadline) return last
    await new Promise((r) => setTimeout(r, step))
  }
}

/** Stable stringify (sorted keys) so cross-recipe deep-equal ignores order. */
function sortedStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(sortedStringify).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${sortedStringify(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const errorsFor = (page, path) => page.locator(`[id="${path}-errors"]`)
const visibleErrorLists = (page) => page.locator('ul.jsf-field-errors')

async function runRecipe(page, { tab, heading }, name) {
  await page.goto(BASE_URL)
  await page.getByRole('button', { name: tab }).click()
  await page.waitForSelector(`text=${heading}`)

  // 1. Pre-submit the form stays QUIET, however you interact with it: focus
  //    and blur an empty field, then type something invalid and blur again.
  //    (Both libraries' default modes defer all validation to first submit.)
  await page.locator('#firstName').click()
  await page.locator('#email').click()
  await page.waitForTimeout(300)
  check(
    name,
    'blur alone stays quiet pre-submit',
    (await visibleErrorLists(page).count()) === 0
  )

  await page.locator('#firstName').fill('A') // too short — still no error yet
  await page.locator('#email').click()
  await page.waitForTimeout(300)
  check(
    name,
    'invalid value + blur stays quiet pre-submit',
    (await visibleErrorLists(page).count()) === 0
  )

  // 2. First submit is what reveals everything. The exact set revealed is
  //    recorded and cross-compared between recipes at the end — thanks to the
  //    shared "empty means absent" normalization, all four should fail the
  //    same fields the same way.
  await page.getByRole('button', { name: 'Submit' }).click()
  const revealed = await waitFor(
    async () => (await errorsFor(page, 'firstName').count()) === 1
  )
  check(name, 'submit reveals errors', Boolean(revealed))
  check(
    name,
    'aria-invalid + aria-describedby track the displayed error',
    (await page.locator('#firstName').getAttribute('aria-invalid')) ===
      'true' &&
      (await page.locator('#firstName').getAttribute('aria-describedby')) ===
        'firstName-errors'
  )
  const revealedIds = (
    await visibleErrorLists(page).evaluateAll((els) => els.map((e) => e.id))
  ).sort()
  console.log(`[${name}] revealed at submit: ${revealedIds.join(', ')}`)

  // 3. After that first submit, fixing a field clears its error live — no
  //    second submit, no blur needed.
  await page.locator('#firstName').fill('Alice')
  const cleared = await waitFor(
    async () => (await errorsFor(page, 'firstName').count()) === 0
  )
  check(name, 'post-submit fix clears live', Boolean(cleared))

  // 4. Fill the rest; a fresh cross-field violation appears on change alone
  //    (no blur, no second submit), attached to confirmPassword.
  await page.locator('#email').fill('alice@example.com')
  await page.locator('#age').fill('25')
  await page.selectOption('#plan', 'pro')
  await page.getByRole('radio', { name: 'email' }).check()
  await page.locator('#address\\.street').fill('123 Main St')
  await page.locator('#address\\.city').fill('Springfield')
  await page.locator('#password').fill('supersecret')
  await page.locator('#confirmPassword').fill('nope')
  const mismatch = await waitFor(async () => {
    const lists = await visibleErrorLists(page).count()
    if (lists !== 1) return false
    const text = await errorsFor(page, 'confirmPassword').textContent()
    return text?.includes('Passwords must match.') ?? false
  })
  check(
    name,
    'post-submit cross-field error appears live on confirmPassword',
    Boolean(mismatch)
  )

  // 5. Fixing the mismatch clears live; submit succeeds with coerced output.
  await page.locator('#confirmPassword').fill('supersecret')
  const mismatchCleared = await waitFor(
    async () => (await visibleErrorLists(page).count()) === 0
  )
  check(name, 'cross-field fix clears live', Boolean(mismatchCleared))

  await page.getByRole('button', { name: 'Submit' }).click()
  await page.waitForSelector('text=Submitted valid data:', { timeout: 5000 })
  const submitted = JSON.parse(await page.locator('pre').innerText())
  check(
    name,
    'submitted age is a coerced number',
    submitted.age === 25,
    `age = ${JSON.stringify(submitted.age)}`
  )
  return { submitted, revealedIds }
}

async function launch() {
  try {
    return await chromium.launch({ args: ['--no-sandbox'] })
  } catch (e) {
    const p = process.env.CHROMIUM_PATH
    if (!p) throw e
    return await chromium.launch({ executablePath: p, args: ['--no-sandbox'] })
  }
}

async function reachable(url) {
  try {
    const probe = await fetch(url)
    return probe.ok
  } catch {
    return false
  }
}

/** Start the examples dev server and resolve once it serves; returns a stop
 * function. Only used when nothing is already listening on BASE_URL, so a
 * server you started yourself is always reused (and left running). */
async function startDevServer() {
  const child = spawn('npm', ['run', 'dev', '-w', 'examples/basic-react'], {
    stdio: 'ignore',
    detached: true,
  })
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (await reachable(DEFAULT_URL)) {
      return () => {
        try {
          process.kill(-child.pid)
        } catch {
          /* already gone */
        }
      }
    }
    if (child.exitCode !== null) break
    await new Promise((r) => setTimeout(r, 300))
  }
  try {
    process.kill(-child.pid)
  } catch {
    /* already gone */
  }
  throw new Error('dev server did not become reachable within 60s')
}

// --- main -------------------------------------------------------------------

let stopServer
if (!(await reachable(BASE_URL))) {
  if (BASE_URL !== DEFAULT_URL) {
    console.error(`Cannot reach ${BASE_URL} (explicitly requested).`)
    process.exit(2)
  }
  console.log('Starting dev server…')
  stopServer = await startDevServer()
}

const browser = await launch()
const results = {}
for (const [i, recipe] of RECIPES.entries()) {
  const name = RECIPE_NAMES[i]
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  try {
    results[name] = await runRecipe(page, recipe, name)
  } catch (e) {
    check(name, 'flow completed', false, String(e).split('\n')[0])
  }
  check(name, 'no uncaught page errors', pageErrors.length === 0)
  await page.close()
}
await browser.close()
stopServer?.()

// Cross-recipe: identical submitted output AND identical error sets revealed
// at the empty-form submit (sorted-key deep equal / sorted id lists).
const [base, ...rest] = RECIPE_NAMES
const submittedOf = (r) =>
  results[r] === undefined ? undefined : sortedStringify(results[r].submitted)
const revealedOf = (r) => results[r]?.revealedIds.join(',')

for (const r of rest) {
  check(
    'parity',
    `${base} ≡ ${r} submitted output`,
    submittedOf(base) !== undefined && submittedOf(base) === submittedOf(r)
  )
  check(
    'parity',
    `${base} ≡ ${r} errors revealed at submit`,
    revealedOf(base) !== undefined && revealedOf(base) === revealedOf(r)
  )
}

console.log(
  failures.length === 0
    ? '\nAll parity checks passed.'
    : `\n${failures.length} FAILURE(S):\n${failures.join('\n')}`
)
process.exit(failures.length === 0 ? 0 : 1)
