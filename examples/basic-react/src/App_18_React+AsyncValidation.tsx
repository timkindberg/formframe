// Async validation end-to-end (ADR 041–046).
//
// The validator returns a Promise (here a Zod schema with an async refinement,
// adapted by createZodAsyncValidator over safeParseAsync). useFormTree's single
// `validator` slot accepts sync OR async and branches on the result's shape — so
// nothing else in the form changes. What async buys you, and what this demo
// shows:
//
//   • Pending signals — useIsValidating() while a verdict is in flight,
//     useIsSubmitting() across an awaited onValid. Both are fan-out-free reads
//     off the form store (ADR 044), so only the little status components below
//     re-render, never the inputs.
//   • Stale-result protection — the newest-started run owns the verdict
//     (ADR 042). Type fast: earlier slow checks can't clobber a newer one, and
//     errors already on screen are RETAINED (never blanked) until the pending
//     run resolves.
//   • Run failure vs invalid — a validator that throws/rejects is a *run
//     failure*, not an "invalid" verdict: errors are kept and the raw reason is
//     surfaced via useValidationFailure(). Type "boom" to trigger it.
//   • Cost control is consumer-owned — the library runs the WHOLE validator on
//     each trigger (it doesn't dirty-diff), and any async rule makes the whole
//     schema async so every parse flips useIsValidating(). So an idle blur would
//     otherwise re-fire the remote check. This demo tames that two ways, both in
//     app code (ADR 021): a value-cache on the remote check, and a
//     skip-when-unchanged guard on the blur trigger.
import { useMemo, useRef, useState, type FocusEvent } from 'react'
import { z } from 'zod'
import { zodToTree } from '@formframe/input-zod'
import { createZodAsyncValidator } from '@formframe/validation-zod'
import {
  useFormTree,
  FormStoreProvider,
  SchemaFields,
  ValidationSummary,
  useIsValidating,
  useIsSubmitting,
  useValidationFailure,
} from '@formframe/renderer-react'

// Simulated remote uniqueness check. Structure (zodToTree) is compiled from the
// plain object; the async rule rides on a separate refined schema handed to the
// validator — structure and validation stay decoupled (the FormFrame model).
const TAKEN = new Set(['admin', 'taken', 'root'])

// Value-cache: memoize the check by username so re-validating an UNCHANGED
// username (e.g. because another field blurred and we re-ran the whole schema)
// resolves from cache instead of re-hitting the "network" — no repeat 600ms
// "Checking…". Rejections are evicted so a transient failure ("boom") can retry.
const availabilityCache = new Map<string, Promise<boolean>>()
function isUsernameAvailable(username: string): Promise<boolean> {
  const key = username.toLowerCase()
  let inflight = availabilityCache.get(key)
  if (!inflight) {
    inflight = (async () => {
      await new Promise((r) => setTimeout(r, 600)) // network latency
      if (key === 'boom') {
        // A thrown validator = a validation-RUN failure (ADR 042), distinct from
        // an invalid verdict. Surfaces via useValidationFailure(), errors kept.
        throw new Error('username service unavailable (simulated)')
      }
      return !TAKEN.has(key)
    })()
    inflight.catch(() => availabilityCache.delete(key))
    availabilityCache.set(key, inflight)
  }
  return inflight
}

const baseSchema = z.object({
  username: z.string().min(3, 'At least 3 characters').meta({
    title: 'Username',
    description: 'Try "admin", "taken", or "root" (taken) — or "boom".',
  }),
  email: z.string().email('Enter a valid email').meta({ title: 'Email' }),
})

// The validator schema layers the async remote rule onto the *username field*
// (not the whole object) so the check runs as soon as the username itself is
// valid — independent of the email field. Why it matters: Core's submit omits
// empty inputs, so a blank field reaches Zod as `undefined` → an `invalid_type`
// issue, and an invalid_type on ANY field ABORTS object-level `.refine`s (they
// don't run at all). A field-level refine is scoped to its own field, so it runs
// regardless of the email's state. The tree is still compiled from the plain
// base object below, so it stays a synchronously-structured form.
const validatorSchema = baseSchema.extend({
  username: baseSchema.shape.username.refine(
    (value) => isUsernameAvailable(value),
    'That username is already taken'
  ),
})

const tree = zodToTree(baseSchema)

/** A tiny live "checking…" indicator — re-renders only itself. */
function Pending() {
  const validating = useIsValidating()
  if (!validating) return null
  return (
    <p aria-live="polite" style={{ color: '#666' }}>
      ⏳ Checking availability…
    </p>
  )
}

/** The run-failure banner (validator threw/rejected), separate from field errors. */
function FailureBanner() {
  const failure = useValidationFailure()
  if (!failure) return null
  const message = failure instanceof Error ? failure.message : String(failure)
  return (
    <p role="alert" style={{ color: 'crimson' }}>
      ⚠ Couldn&apos;t validate: {message} — please retry.
    </p>
  )
}

/** Submit button that disables + relabels while validating or saving. */
function SubmitButton() {
  const submitting = useIsSubmitting()
  const validating = useIsValidating()
  return (
    <button type="submit" disabled={submitting || validating}>
      {submitting ? 'Reserving…' : 'Reserve username'}
    </button>
  )
}

function App() {
  const validator = useMemo(() => createZodAsyncValidator(validatorSchema), [])
  const { form, submit, revalidate, handleBlur, store } = useFormTree(tree, {
    validator,
  })
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null)

  // Skip-when-unchanged: mark touched on every blur (that's about focus), but
  // only kick off a (whole-form) revalidation when a value actually changed
  // since the last run — so tabbing through fields you didn't edit is free.
  const lastValidated = useRef<string>('')
  const handleFieldBlur = (event: FocusEvent<HTMLFormElement>) => {
    handleBlur(event)
    const snapshot = JSON.stringify([
      ...new FormData(event.currentTarget).entries(),
    ])
    if (snapshot === lastValidated.current) return
    lastValidated.current = snapshot
    revalidate(event)
  }

  return (
    <div>
      <h1>Async Validation (ADR 041–046)</h1>
      <p>
        The <code>validator</code> is a <code>createZodAsyncValidator</code>{' '}
        over a Zod schema with an async, remote uniqueness rule.{' '}
        <code>useFormTree</code>&apos;s single slot takes sync <em>or</em> async
        and branches on the result shape — the rest of the form is unchanged.
      </p>
      <p>
        <strong>Try it:</strong> blur the username with <code>admin</code>{' '}
        (taken → field error after a ~600ms check), type fast to see stale
        results never clobber the newest, or use <code>boom</code> to trigger a
        validator failure (a run failure, not an invalid verdict — errors are
        kept and the banner shows the reason). Submitting a valid form runs an
        awaited save; <code>isSubmitting</code> spans it. Tabbing through fields
        you didn&apos;t edit is free — the remote check is value-cached and blur
        only re-validates when something actually changed.
      </p>

      <FormStoreProvider store={store} showErrorsWhen="touched">
        <form
          noValidate
          onSubmit={submit(async (data) => {
            // An async onValid: isSubmitting stays true across the await.
            await new Promise((r) => setTimeout(r, 800))
            setSaved(data)
          })}
          // Validate on blur (focusout bubbles): one remote check per field
          // visit, and only when something changed (see handleFieldBlur).
          // Per-keystroke checks are consumer-owned — wire revalidate to
          // onChange with your own debounce.
          onBlur={handleFieldBlur}
        >
          <ValidationSummary />
          <SchemaFields form={form} />
          <Pending />
          <FailureBanner />
          <SubmitButton />
        </form>
      </FormStoreProvider>

      {saved && (
        <>
          <p style={{ color: 'green' }}>Reserved:</p>
          <pre>{JSON.stringify(saved, null, 2)}</pre>
        </>
      )}
    </div>
  )
}

export default App
