// Parity smoke for the three form-library recipes (#116 epic):
//   12  — React Hook Form over JSON Schema + AJV
//   12B — React Hook Form over Zod
//   18  — TanStack Form over JSON Schema + AJV
//
// Drives all three through ONE identical interaction script and asserts the
// observable behavior is identical — the unified display policy (reveal a
// field's error only once dirtied + blurred, reveal everything at submit,
// revalidate changed fields live after submit) plus identical submitted
// output (including AJV/Zod numeric coercion).
//
// This is the interim, script-shaped cousin of #125's real parity harness
// (#118 specced that as a `describe.each` Vitest-browser suite, blocked on
// the native recipe #122). When #125 lands, this script is superseded.
//
// Usage:
//   npm run dev -w examples/basic-react   # in one terminal
//   node scripts/recipe-parity-smoke.mjs [baseURL]   # default http://localhost:5173
//
// If Playwright can't find a browser, point CHROMIUM_PATH at a Chromium
// binary. `--no-sandbox` is passed for containerized/root environments.

import { chromium } from 'playwright'

const BASE_URL = process.argv[2] ?? 'http://localhost:5173'

const RECIPES = [
  { tab: /^12\./, heading: 'React Hook Form as the form-state layer' },
  { tab: /^12B\./, heading: 'React Hook Form over Zod' },
  { tab: /^18\./, heading: 'TanStack Form as the form-state layer' },
]

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

  // 1. Pure focus+blur (no typing) reveals nothing — the DIRTY half of the gate.
  await page.locator('#firstName').click()
  await page.locator('#email').click()
  await page.waitForTimeout(300)
  check(
    name,
    'pure blur reveals nothing',
    (await errorsFor(page, 'firstName').count()) === 0
  )

  // 2. Dirtied + blurred reveals that field's error (and only that field's).
  await page.locator('#firstName').fill('A')
  await page.locator('#email').click()
  const revealed = await waitFor(
    async () => (await errorsFor(page, 'firstName').count()) === 1
  )
  check(name, 'dirty+blur reveals the field error', Boolean(revealed))
  check(
    name,
    'exactly one error visible pre-submit',
    (await visibleErrorLists(page).count()) === 1
  )
  check(
    name,
    'aria-invalid + aria-describedby track the displayed error',
    (await page.locator('#firstName').getAttribute('aria-invalid')) ===
      'true' &&
      (await page.locator('#firstName').getAttribute('aria-describedby')) ===
        'firstName-errors'
  )

  // 3. Fixing the field clears its error live, without another blur.
  await page.locator('#firstName').fill('Alice')
  const cleared = await waitFor(
    async () => (await errorsFor(page, 'firstName').count()) === 0
  )
  check(name, 'pre-submit fix clears live (no blur needed)', Boolean(cleared))

  // 4. Submit with everything else untouched reveals never-touched fields.
  //    The exact set revealed is recorded and cross-compared between recipes
  //    at the end — thanks to the shared "empty means absent" normalization,
  //    all three should fail the same fields the same way.
  await page.getByRole('button', { name: 'Submit' }).click()
  const emailRevealed = await waitFor(
    async () => (await errorsFor(page, 'email').count()) === 1
  )
  check(name, 'submit reveals untouched-field errors', Boolean(emailRevealed))
  const revealedIds = (
    await visibleErrorLists(page).evaluateAll((els) => els.map((e) => e.id))
  ).sort()
  console.log(`[${name}] revealed at submit: ${revealedIds.join(', ')}`)

  // 5. Post-submit: filling each field revalidates live; a fresh mismatch
  //    appears on change alone (no blur), attached to confirmPassword.
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

  // 6. Fixing the mismatch clears live; submit succeeds with coerced output.
  await page.locator('#confirmPassword').fill('supersecret')
  const mismatchCleared = await waitFor(
    async () => (await visibleErrorLists(page).count()) === 0
  )
  check(name, 'post-submit fix clears live', Boolean(mismatchCleared))

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

// --- main -------------------------------------------------------------------

try {
  const probe = await fetch(BASE_URL)
  if (!probe.ok) throw new Error(String(probe.status))
} catch {
  console.error(
    `Cannot reach ${BASE_URL} — start the dev server first:\n` +
      '  npm run dev -w examples/basic-react'
  )
  process.exit(2)
}

const browser = await launch()
const results = {}
for (const [i, recipe] of RECIPES.entries()) {
  const name = ['12', '12B', '18'][i]
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

// Cross-recipe: identical submitted output AND identical error sets revealed
// at the empty-form submit (sorted-key deep equal / sorted id lists).
const recs = ['12', '12B', '18']
const [a, b, c] = recs.map((r) =>
  results[r] === undefined ? undefined : sortedStringify(results[r].submitted)
)
check('parity', '12 ≡ 12B submitted output', a !== undefined && a === b)
check('parity', '12 ≡ 18 submitted output', a !== undefined && a === c)
const [ra, rb, rc] = recs.map((r) => results[r]?.revealedIds.join(','))
check(
  'parity',
  '12 ≡ 12B errors revealed at submit',
  ra !== undefined && ra === rb
)
check(
  'parity',
  '12 ≡ 18 errors revealed at submit',
  ra !== undefined && ra === rc
)

console.log(
  failures.length === 0
    ? '\nAll parity checks passed.'
    : `\n${failures.length} FAILURE(S):\n${failures.join('\n')}`
)
process.exit(failures.length === 0 ? 0 : 1)
