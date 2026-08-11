# Capability matrix — living proof (#125)

The executable matrix is [`recipe-parity.test.tsx`](./recipe-parity.test.tsx):
`describe.each([native, rhf, tanstack])` × JSON Schema (full 13 rows) + Zod
(source-sensitive rows). This table is the human index; the suite is the source
of truth.

| # | Capability | JSON Schema × 3 | Zod × 3 |
| --- | --- | --- | --- |
| 1 | Submit-time validation gates `onValid` | ✓ | — |
| 2 | Live/reactive revalidation after first reveal | ✓ | — |
| 3 | Shared default display timing (quiet pre-submit) | ✓ | — |
| 4 | Per-field error placement + a11y (no `role="alert"`) | ✓ | — |
| 5 | Validation summary (DOM order) via `fieldControlId` | ✓ | — |
| 6 | Cross-field rule on `confirmPassword` | ✓ | ✓ |
| 7 | Async username availability | ✓ | ✓ |
| 8 | Pending signals (`data-pending`) | ✓ | — |
| 9 | Stale-result protection | ✓ | — |
| 10 | Run-failure vs invalid (throw → distinct message) | ✓ | — |
| 11 | Coerced/transformed submit output (`age` number) | ✓ | ✓ |
| 12 | Nested + array error paths | ✓ | ✓ |
| 13 | Standard Schema interop | ✓ | ✓ |

## Locked decisions (do not reopen)

1. **Timing** = each library’s default (quiet until first submit, then live).
2. **Cross-field** attaches to concrete `confirmPassword` (no pathless).
3. **Array paths** = FormFrame dots (`contacts.0.email`); TanStack brackets normalized in the recipe.
4. **Assertion surface** = DOM + `onSubmit` spy + pending beacon — never framework internals.
5. **Async throw** → username field error `Username check failed.` (fixture-composed surface).

## Fixtures

Account-signup medium schema (#118): [`fixtures/`](./fixtures/) — JSON Schema + Zod + controllable `checkUsername`.
