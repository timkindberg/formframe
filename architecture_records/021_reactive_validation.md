# ADR 021: Reactive (Validate-on-Change) Validation via the Validator Seam

**Date:** 2026-06-25
**Status:** Accepted
**Deciders:** Tim Kindberg

## Context

ADR 019 carved a side-loaded, **submit-time** `Validator` seam and wired it into
`useFormTree`. ADR 011 asked whether native `<form>`+FormData form-state is
enough, or whether a **reactive form-state adapter** (React Hook Form, TanStack
Form, …) is needed — noting that live error display was the main reason you'd
want reactivity.

This slice probes that question for the **validation case only**: can we validate
on every change while keeping inputs **uncontrolled** and the consumer owning the
`<form>` (ADR 013)?

## Decision

**Expose an opt-in `revalidate` handler from `useFormTree` that the consumer
wires to their form's event handler.** On each event:

1. Read `new FormData(event.currentTarget)` via Core's existing submit assembler
   (same nested-object shape as submit).
2. Run the side-loaded `Validator` (full pass).
3. Update the same `errors` state that `ValidationProvider` already consumes.

**Event choice is the consumer's:**

- `onInput={revalidate}` — per-keystroke feedback (native `input` bubbles from
  fields to the form).
- `onChange={revalidate}` — validates on blur for text fields (native `change`
  fires when the control loses focus, not on every keypress).

Submit-time validation is unchanged. Without live handlers wired, behaviour
stays submit-only (ADR 019).

```tsx
const tree = jsonSchemaToTree(schema)
const { SchemaFields, submit, revalidate, errors } = useFormTree(tree, {
  validator: createAjvValidator(schema),
})
return (
  <form
    noValidate
    onSubmit={submit(onValid)}
    onInput={revalidate}
    onChange={revalidate}
  >
    <ValidationProvider issues={errors}>
      <SchemaFields />
    </ValidationProvider>
    <button type="submit">Submit</button>
  </form>
)
```

### Finding: native form-state suffices for live validation

Live validation does **not** require a reactive form-state adapter. Reading
FormData on `input`/`change` and updating a separate `errors` array is enough
while inputs stay uncontrolled: the memoized field renderer bails, so typed
values, focus, and DOM identity survive revalidation cycles. This answers ADR
011's reactivity question for validation: a form-state adapter is still
justified for **richer reactivity** (conditional fields, derived values,
cross-field UI), not for live validation alone.

### Native-attr constrain vs validator report

Two complementary layers operate on the same form:

| Layer | Mechanism | When |
|-------|-----------|------|
| **Constrain** | Native HTML attrs the front-end emits (`maxLength`, `min`/`max`, `step`, `pattern`, `required`) | Browser prevents or limits input as the user types |
| **Report** | Side-loaded `Validator` on FormData | Surfaces semantic failures the native layer cannot express (e.g. `minLength` without a native twin, cross-field rules, object-level `required`) |

Both can apply to different fields in one form. The validator remains the source
of truth for **reported** issues; native attrs are the source of truth for
**browser-enforced** constraints where they exist.

### Explicitly deferred

- **Async validation** — `Validator` stays synchronous (ADR 019); async is a
  future seam evolution when a second adapter forces it.
- **Field/group-scoped triggers** — revalidate runs the full validator on every
  wired event; per-field scoping is a future optimization.
- **Debounce** — consumer can wrap `revalidate` if needed; no built-in debounce
  yet.

## Consequences

- **Opt-in live validation** without changing existing call sites or controlled-input
  semantics.
- **Same seam, same path convention** — issues still key on `node.path`; no IR or
  Core boundary change (FormData assembly reuses `form.submit`'s logic).
- **Conformance untouched** — no new markup contract; error rendering was already
  in place (ADR 019 React slice).
- **ADR 011 updated in practice** — native form-state + side-loaded validation covers
  both submit-time and live validation; reactive form-state adapters remain optional
  for other reactivity needs.
- **Performance: only changed fields re-render (ADR 023).** Issues are held in a
  per-path subscription store read via `useSyncExternalStore` — **not** a single
  Context — so a validation pass re-renders only the fields whose issues actually
  changed, never the whole form. This is pinned by a render-count test ("a field
  gaining an issue re-renders only that field, not its siblings"). The remaining
  per-event cost is the **validator runtime** (a full-form pass); **debounce** and
  **field/group-scoped triggers** are the intended mitigations and remain deferred
  (future beads).

## Alternatives Considered

- **Controlled inputs + React state for values** — rejected: discards the native
  form-state default, remount/focus risks, and duplicates FormData assembly.
- **Auto-enable validate-on-change when a validator is set** — rejected: changes
  existing behaviour; the consumer owns the `<form>` and should opt in explicitly.
- **New Core export for FormData assembly** — deferred: reusing `form.submit` with
  a synthetic event avoids touching the parser (parallel-work boundary).
- **Built-in debounce in the hook** — deferred: YAGNI; easy for consumers to wrap.

---

**Relates to:** ADR 011 (form-state shallow slot — native adapter reactivity
question), ADR 013 (consumer owns `<form>`), ADR 019 (Validator seam),
ADR 012 (native HTML attrs as constrain layer), ADR 023 (the per-path
subscription store that makes this re-render only changed fields).
