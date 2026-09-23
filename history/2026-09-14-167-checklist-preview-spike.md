# #167 as-is spike — ChecklistForm preview modal

Throwaway VNDLY branch: `spike/formframe-167-checklist-preview` on worktree [vndly4](file:///Users/tim.kindberg/projects/vndly4), off `spike/formframe-160-schedule-meeting`. Not merged. Not pushed. The branch was deleted after this log was written, so the vndly4 file links below are dead. [Code patterns](#code-patterns) is the surviving copy of everything worth rebuilding.

Question the spike had to answer: is FormFrame flexible enough to sit in VNDLY's existing unknown-shape architecture with a small adapter? Yes. Compiler `data_schema` / `ui_schema` / `ui_rules` stay as the page produces them. The host folds `compileTerseRuleSyntax` + `applicableActions` into field mode. No Core rule engine.

## Method

Characterization tests against `VndlyFormWithConditionals2` first (compiler-shaped UUID keys, `remove`+`setValue`, `require`, `formContext.*`). Then the same assertions against `VndlyUnknownShapeForm`. Then the ChecklistForm preview island swapped.

- **Platform defaults:** [hookFormDefaults.tsx](file:///Users/tim.kindberg/projects/vndly4/assets/js/formframe/hookFormDefaults.tsx) — `field.root` returns null when hidden. Two field-root paths: known-shape pages use `HookFormFieldModeContext` predicates, unknown-shape uses the store. Known-shape `useFormFrame` still compiles with `jsonSchemaToTree` at module scope.
- **Matcher:** [fieldMode.ts](file:///Users/tim.kindberg/projects/vndly4/assets/js/formframe/fieldMode.ts) — snapshot types + `withFieldMode` copied from the gallery recipe. Matcher is VNDLY `applicableActions`, not `createFieldMode`.
- **Island:** [VndlyUnknownShapeForm.tsx](file:///Users/tim.kindberg/projects/vndly4/assets/js/formframe/VndlyUnknownShapeForm.tsx) — `jsonSchemaToRuntimeTree` when the fetched schema arrives, nested RHF `FormProvider`, no inner `<form>`. Host applies `setValues` (hide-and-clear, no restore). Field mode is [fieldModeContext.tsx](file:///Users/tim.kindberg/projects/vndly4/assets/js/formframe/fieldModeContext.tsx) (`.select` on boolean membership, `useSyncExternalStore`). Known-shape `useFormFrame` still uses `HookFormFieldModeContext` function predicates.
- **Page:** [ChecklistForm.tsx](file:///Users/tim.kindberg/projects/vndly4/assets/js/worker_provisioning/ChecklistForm.tsx) preview modal still fetches `POST /api/v2/generic_form/preview/` and passes `schema.rjsf`. No `formContext` on the page (same as RJSF).

## Tests

- `VndlyUnknownShapeForm.spec.tsx`: 4/4
- `ChecklistForm.preview.spec.tsx`: 1/1 (modal + mocked compiler triple)
- `WorkerProvisioningChecklistForm.spec.jsx`: 20/20 (unrelated builder tests)
- `VndlyUnknownShapeForm.perf.spec.tsx`: 2/2 (render comparison vs RJSF)

## Render comparison vs `VndlyFormWithConditionals2`

Harness: [VndlyUnknownShapeForm.perf.spec.tsx](file:///Users/tim.kindberg/projects/vndly4/assets/js/formframe/VndlyUnknownShapeForm.perf.spec.tsx). Same compiler fixture as the characterization tests, plus a scaled copy with 30 inert text fields. Counts field chrome the way FormFrame already does (`field.root` vs RJSF `FieldTemplate`) and wraps each island in `React.Profiler`. jsdom CPU, not paint.

Re-run from vndly4:

```bash
npx jest assets/js/formframe/VndlyUnknownShapeForm.perf.spec.tsx --verbose --no-coverage
```

Two runs, field-chrome counts identical. `actualMs` / `wallMs` moved a little. Title typing is the fair engine comparison (text input both sides). Color is not: RJSF uses Chakra react-select, FormFrame a native `<select>`.

| phase | engine | commits | actualMs | field chrome | siblings |
| --- | --- | ---: | ---: | ---: | ---: |
| preview mount | FormFrame | 2 | ~22–32 | 5 | 4 |
| preview mount | RJSF | 2 | ~81–87 | 6 | 4 |
| preview title × 10 | FormFrame | **0** | **0** | **0** | **0** |
| preview title × 10 | RJSF | 11 | ~98–100 | 33 | 22 |
| preview color → red | FormFrame | 2 | ~7 | **2** | **2** |
| preview color → red | RJSF | 5 | ~17 | 4 | 3 |
| scaled+30 title × 10 | FormFrame | **0** | **0** | **0** | **0** |
| scaled+30 title × 10 | RJSF | 10 | ~232–288 | 330 | 320 |
| scaled+30 color → red | FormFrame | 2 | ~29–31 | **2** | **2** |
| scaled+30 color → red | RJSF | 5 | ~53–56 | 34 | 33 |

Typing is the gap. FormFrame inputs are RHF `register` (uncontrolled). `useWatch` only lists rule condition paths. Title keystroke does not re-render the island. RJSF puts `formData` in React state, `cloneDeep`s, re-runs `useRulesRunner`, and re-renders every visible `FieldTemplate`.

Driver changes used to scale with field count (35 chrome on scaled+30). [#181](https://github.com/timkindberg/formframe/issues/181) is Extra notes + Follow-up email only (2), inert extras stay 0. `.select` is boolean membership; the store is `useSyncExternalStore` because objectHookToContext's use-context-selector path does not bail out on an unchanged boolean when the container value is a new object (React 19).

Mount is noisy and small. FormFrame still walks hidden nodes (`field.root` returns null). RJSF deletes them from the schema, then pays StrictMode extra `FieldTemplate` calls.

## Failure list (ADR 052)

| Item | Tag | Timing | Notes |
|------|-----|--------|-------|
| Enum widget is a native `<select>`, not VNDLY react-select | host recipe | defer | Pin in tests. Platform `select` could later be HookFormJSFSelect. **#162 stays closed.** |
| `ui_schema` unread (`ui:order`, `ui:widget`, `optionsFromApi`) | host recipe | defer | [#182](https://github.com/timkindberg/formframe/issues/182): map intent to host widgets (`HookFormJSFSelect`), do not mount RJSF Fields. |
| Draft-07 `type: [T, 'null']` compiled as string | library gap | now | Widget unwrap is in `compile.ts`. Instance `null` as a fact is [#180](https://github.com/timkindberg/formframe/issues/180). |
| Boolean control was Chakra `Input` | host recipe | now | `hookFormDefaults` uses `HookFormCheckbox` when `attrs.type === 'checkbox'`. Compiler `default: false` is RHF `defaultValues`. |
| Labels run through `useMsg(title)` | host recipe | defer | Compiler titles are English display names; missing i18n keys fall back to the string. Fine for preview. |
| `on` / async / cycles / extraActions (`placeholder`, `setTitle`, `allowNull`) | don't migrate | defer | Out of the #74 recipe. Compiler preview rules in this fixture are `conditions`+`event` only. |
| AJV / `withFieldMode` unused | don't migrate | defer | Preview `onSubmit` is a no-op. Copy is in `fieldMode.ts` for a submit-bearing screen. |
| Nested FormProvider + UUID field names | (works) | now | Isolated from the outer checklist builder form. |
| `jsonSchemaToRuntimeTree` on UUID property keys | (works) | now | No library gap. Rebuilt local CJS dist so `useFieldRootSlots` (#163) was actually in the alias. Linking, not a FormFrame hole. |

The first live preview (Cruise checklist create) looked like seven text inputs because of the nullable-type gap, not because FormFrame cannot render checkboxes. Native FormFrame already maps `boolean` → `<input type=checkbox>`. Mixed `['string', 'number']` unions still fall back to text.

## Follow-ups

- [#180](https://github.com/timkindberg/formframe/issues/180) `facts.nullable` (Core)
- [#181](https://github.com/timkindberg/formframe/issues/181) per-path field-mode selectors (spike refactor done; ticket still open)
- [#182](https://github.com/timkindberg/formframe/issues/182) host `ui_schema` as intent, not RJSF Fields
- Runner-up screen with a real submit payload: AdditionalDetails (Formik) (#179)
- #162 remains closed.

## Code patterns

Condensed from spike commit `2960345f8bc`. VNDLY-specific imports are named, not pasted. Enough to rebuild each piece without the branch.

### 1. Field-mode store (`fieldModeContext.tsx`, #181)

The promoted, tested version is [`examples/basic-react/src/fieldModeStore.recipe.tsx`](../examples/basic-react/src/fieldModeStore.recipe.tsx): `FieldModeProvider` (form-library agnostic) plus `RhfFieldModeRuntime`. Copy that, not this sketch.

Anti-patterns this replaces, each measured on the scaled fixture:

- One context holding `{ isHidden, isRequired, isReadOnly }` functions. A new function every snapshot wakes every consumer.
- `useWatch` on the component that mounts `SchemaFields`. Every driver change re-renders the whole tree.
- VNDLY `objectHookToContext` / react-tracked `.select`. On use-context-selector 2 + React 19 it notifies every listener when the container object is new, even if the selected boolean didn't change. This was still 35 field roots.

What worked (2 field roots):

```tsx
type FieldModeBits = { hidden: ReadonlySet<string>; required: ReadonlySet<string>; readOnly: ReadonlySet<string> }

// Plain store: mutable bits + listener set. No library.
function createFieldModeStore() {
  const listeners = new Set<() => void>()
  return {
    bits: EMPTY_BITS,
    subscribe: (l) => (listeners.add(l), () => listeners.delete(l)),
    notify: () => listeners.forEach((l) => l()),
  }
}
const StoreContext = createContext<Store | null>(null)
const FrozenTree = memo(({ children }) => children) // provider re-render must not walk the tree

export function useFieldModeSelect<T>(selector: (bits: FieldModeBits) => T): T {
  const store = use(StoreContext)
  const get = () => selector(store ? store.bits : EMPTY_BITS)
  return useSyncExternalStore(store ? store.subscribe : noopSubscribe, get, get) // bails on === boolean
}
export const useFieldMode = Object.assign(useFieldModeSelect, { select: useFieldModeSelect })

export function FieldModeRuntime({ fieldMode, schemaRequired, children }) {
  const { control, getValues, setValue, clearErrors } = useFormContext()
  // Watch only rule condition paths. Empty paths get a placeholder so an empty `name` can't widen to the whole form.
  useWatch({ control, name: fieldMode.paths.length ? [...fieldMode.paths] : ['__formframe_no_watch__'] })

  const snap = fieldMode(getValues())
  const required = new Set([...schemaRequired, ...snap.required])
  const store = useRef(createFieldModeStore()).current
  store.bits = { hidden: snap.hidden, required, readOnly: snap.readOnly } // write during render

  const hiddenKey = sorted(snap.hidden).join()
  const membershipKey = `${hiddenKey}|${sorted(required).join()}|${sorted(snap.readOnly).join()}`
  const setValuesKey = JSON.stringify(snap.setValues)

  // Notify only when membership changes. Skip mount, where subscribers already read fresh bits.
  useLayoutEffect(() => { if (mounted.current) store.notify(); else mounted.current = true }, [membershipKey])

  // Hide-and-clear. Host applies rule setValue writes; no restore on unhide.
  useEffect(() => {
    const cur = fieldMode(getValues())
    for (const [path, value] of Object.entries(cur.setValues)) {
      const existing = getValues(path)
      // Skip blank -> null so hiding an untouched field doesn't dirty the form.
      if (existing !== value && !(isBlank(existing) && value == null)) setValue(path, value, { shouldDirty: true })
    }
    for (const path of cur.hidden) clearErrors(path)
  }, [hiddenKey, setValuesKey])

  return <StoreContext.Provider value={store}><FrozenTree>{children}</FrozenTree></StoreContext.Provider>
}
```

The caller must pass a stable element: `const fields = useMemo(() => <SchemaFields />, [SchemaFields])`, then `<FieldModeRuntime …>{fields}</FieldModeRuntime>`. Don't build a `useFrozenSchemaFields` that creates a memo component during render; eslint `react-hooks/static-components` rejects it.

### 2. Field root split (`hookFormDefaults.tsx`)

```tsx
function HookFormFieldRoot(props) {
  const legacy = use(HookFormFieldModeContext) // known-shape pages: function predicates
  return legacy.isHidden || legacy.isRequired || legacy.isReadOnly
    ? <FieldRootChrome {...props} hidden={!!legacy.isHidden?.(path)} required={legacy.isRequired?.(path) ?? !!facts.required} readOnly={!!legacy.isReadOnly?.(path)} />
    : <TrackedFieldRoot {...props} />
}
function TrackedFieldRoot(props) { // unknown-shape: one boolean subscription per bit
  const hidden = useFieldMode.select((s) => s.hidden.has(path))
  const required = useFieldMode.select((s) => s.required.has(path)) || !!facts.required
  const readOnly = useFieldMode.select((s) => s.readOnly.has(path))
  return <FieldRootChrome {...props} hidden={hidden} required={required} readOnly={readOnly} />
}
function FieldRootChrome({ node, overrides, hidden, required, readOnly, ...props }) {
  if (hidden) return null // FormFrame still walks hidden nodes; RJSF deletes them from the schema
  const { label, description, control } = useFieldRootSlots(props)
  const hostControl = overrides?.control ? control : controlForFormat(node) ?? control // #160 format map
  // Booleans default to false, matching the compiler's `default: false` + `ui:emptyValue: false`.
  const defaultValue = facts.primitive === 'boolean' ? (origin.schema.default ?? false) : origin.schema.default
  return <HookFormControl name={node.path} rules={required ? { required: true } : undefined}
    shouldUnregister={false} isReadOnly={readOnly} defaultValue={defaultValue}>
    {label}{hostControl}{description}<HookFormError />
  </HookFormControl>
}
// field.control: kind 'input' with attrs.type === 'checkbox' -> HookFormCheckbox (not Chakra Input).
```

### 3. VNDLY rule matcher (`fieldMode.ts`)

The snapshot types and `withFieldMode` are copied from `examples/basic-react/src/fieldMode.recipe.ts`. The matcher wraps VNDLY's engine. Don't use the gallery `createFieldMode`.

```ts
import applicableActions from 'json-rules-engine-simplified/lib/applicableActions' // CJS default, needs @ts-ignore
import { compileTerseRuleSyntax } from '~/components/jsonschema/VndlyJsonSchemaFormBase/utils/terseRulesCompiler'

export function createVndlyFieldMode(rules = [], { formContext = {}, firstRender = false } = {}) {
  const compiled = compileTerseRuleSyntax(rules)
  const conditional = compiled.filter((r) => r.conditions)
  const alwaysEvents = compiled.filter((r) => r.always).flatMap((r) => toArray(r.event))
  // Walk and/or/not; every non-composite key is a fact path. formContext.* arrives as a prop, so don't watch it.
  const paths = collectConditionPaths(compiled).filter((p) => !p.startsWith('formContext'))

  const fieldMode = (values) => {
    // Same facts shape VndlyFormWithConditionals2 builds.
    const facts = { ...values, formContext: { ...formContext, firstRender } }
    const folded = { hidden: new Set(), required: new Set(), readOnly: new Set(), setValues: {} }
    for (const e of [...applicableActions(conditional, facts), ...alwaysEvents]) {
      switch (e.type) {
        case 'remove': toArray(e.params.field).forEach((f) => folded.hidden.add(f)); break
        case 'require': toArray(e.params.field).forEach((f) => folded.required.add(f)); break
        case 'set': case 'setValue': // params is one write or an array of writes; last write wins
          toArray(e.params).forEach((w) => (folded.setValues[w.field] = w.value)); break
        case 'setReadOnly': case 'readonly': case 'disable':
          toArray(e.params.field).forEach((f) => folded.readOnly.add(f)); break
        default: break // placeholder / setTitle / allowNull / extraActions: catalog, don't fold
      }
    }
    folded.required = new Set([...folded.required].filter((p) => !folded.hidden.has(p))) // hidden beats required
    return snapshot(folded)
  }
  fieldMode.paths = paths
  return fieldMode
}
```

Rule syntax: compiler output with UUID keys must be verbose `{ conditions, event }`. The terse string syntax doesn't parse UUID tokens.

### 4. Island (`VndlyUnknownShapeForm.tsx`)

```tsx
function VndlyUnknownShapeForm({ schema, uiSchema /* unread, #182 */, rules = [], formContext = {} }) {
  const firstRender = useFirstRender()
  const tree = useMemo(() => jsonSchemaToRuntimeTree(schema), [schema]) // runtime door; fetched schema has no `as const`
  const { SchemaFields } = useFormFrame(tree)
  // Top-level `default`s only (compiler output is flat), seeded into RHF at useForm time.
  const defaultValues = useMemo(() => Object.fromEntries(
    Object.entries(schema.properties ?? {}).filter(([, p]) => p?.default !== undefined).map(([k, p]) => [k, p.default])), [schema])
  const methods = useHookForm({ shouldUnregister: false, defaultValues })
  const schemaRequired = useMemo(() => new Set(schema.required ?? []), [schema])
  const fieldMode = useMemo(() => createVndlyFieldMode(rules, { formContext, firstRender }), [rules, formContext, firstRender])
  const fields = useMemo(() => <SchemaFields />, [SchemaFields])
  // Nested FormProvider keeps UUID field names out of the outer builder form. No inner <form> (ADR 013 / noRootForm).
  return <FormProvider {...methods}><FieldModeRuntime fieldMode={fieldMode} schemaRequired={schemaRequired}>{fields}</FieldModeRuntime></FormProvider>
}
```

Test fixture shape: five UUID-keyed string properties (Title required; Color enum; Extra notes; Follow-up email; Work order notes), `ui:order`, and three rules:

- Color ≠ red → `remove` + `setValue null` on Extra notes.
- Color = red → `require` Follow-up email.
- `formContext.work_order.module` ≠ 1 → `remove` + `setValue null` on Work order notes.

Tests mock `POST /api/v2/generic_form/preview/` with `{ name, namespace, display_name, rjsf: { data_schema, ui_schema, ui_rules } }`.

### 5. Linking unpublished FormFrame into VNDLY

This only matters until `@formframe/*` is on the registry. With published packages and a `react` peerDep, drop all of it. Build FormFrame first (`npm run build`). A stale dist silently lacks new exports; that bit us with `useFieldRootSlots` (#163).

Every tool resolves separately, so the same three packages go in six places:

| Tool | Where | Target |
| --- | --- | --- |
| webpack (legacy bundle) | `resolve.alias` | `packages/*/dist/index.cjs` |
| Next 16 dev | `next.config.js` `webpack: config => alias` | `packages/*/dist/index.js` (ESM) |
| Jest | `moduleNameMapper` `^@formframe/core$` | `<rootDir>/../personal/jsonschema-form/packages/*/dist/index.cjs` |
| tsc / editor | `tsconfig.json` + `jsconfig.json` `paths` | `packages/*/dist/index.d.ts` |
| eslint | `import-x` resolver alias map | `dist/index.cjs` |
| eslint | `import-x/no-extraneous-dependencies: off` for `assets/js/formframe/**` + `assets/js/interviews/formframe/**` | — |

- Next 16 defaults to Turbopack, which can't resolve sibling-repo packages. Absolute aliases become `./Users/...`, and `../` paths and outbound symlinks are rejected. `npm run dev` needs `next --webpack`. The `.formframe-alias/` symlink directory was a failed attempt at that.
- React must be deduped in webpack, Next, and Jest: `react`, `react-dom`, `react/jsx-runtime`, `react/jsx-dev-runtime` → VNDLY `node_modules`. Otherwise FormFrame's own `node_modules/react` gives two Reacts and hooks throw.
- Types: FormFrame's `.d.ts` resolves `ReactNode` through its own `@types/react`, so `hookFormDefaults` needs `as ReactPartialDefaults`. This is a linking artifact, not a library gap.
- VNDLY husky runs eslint on commit. `switch` needs `break` rather than a mix of `return` and a comment-only `default` (`no-fallthrough`), and `no-continue` is on.

### 6. Perf harness (`VndlyUnknownShapeForm.perf.spec.tsx`)

Jest + jsdom. Two clocks per island:

- A mutable counter bag bumped by wrapped chrome: FormFrame `field.root`, `field.control`, `group.root`; RJSF `FieldTemplate`, `ObjectFieldTemplate`.
- `React.Profiler` `onRender` summing mounts, updates, and `actualDuration`, plus `performance.now()` wall time.

The file needs `/* eslint-disable no-param-reassign, react-hooks/immutability */`, because mutating the counters is the point.

```tsx
function makeCountingDefaults(bag) {
  const { root: FieldRoot, control: FieldControl } = hookFormDefaults.field
  return { ...hookFormDefaults,
    field: { ...hookFormDefaults.field,
      root: (p) => { bump(bag, `field.root:${nick(p.node.path)}`); return <FieldRoot {...p} /> },
      control: (d) => { bump(bag, `field.control:${nick(nameOf(d))}`); return <FieldControl {...d} /> } },
    group: { ...hookFormDefaults.group, root: (p) => { bump(bag, `group.root:${nick(p.node.path)}`); return <GroupRoot {...p} /> } } }
}
// RJSF side: <VndlyFormWithConditionals2 noRootForm isChakra omitExtraData noHtml5Validate onSubmit={noop}
//   schema uiSchema rules FieldTemplate={counting(ChakraFieldTemplate)} ObjectFieldTemplate={counting(ChakraObjectFieldTemplate)} />
// nick(): map UUID -> title/color/notes/email/wo, `extra_NN` -> extra, root -> group.
// scaledPreview(n): add n inert `extra_NN` string properties and append them to ui:order.
```

Phases per engine and fixture (preview, scaled+30): mount → reset → `fireEvent.change` Title ten times, one character each → reset → set Color to red and wait for Extra notes.

Assertions:

- FormFrame Title typing: siblings 0, title 0.
- RJSF Title typing: siblings > 0.
- FormFrame Color → red: title 0, siblings < 8.

`afterAll` prints the table above. The counting `field.root` wrapper calls the same three `useFieldMode.select`s. Otherwise only the inner `TrackedFieldRoot` re-renders on a membership change, and the wrapper never bumps.
