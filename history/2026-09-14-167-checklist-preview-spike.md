# #167 as-is spike — ChecklistForm preview modal

Throwaway VNDLY branch: `spike/formframe-167-checklist-preview` on worktree [vndly4](file:///Users/tim.kindberg/projects/vndly4), off `spike/formframe-160-schedule-meeting`. Not merged. Not pushed.

Question the spike had to answer: is FormFrame flexible enough to sit in VNDLY's existing unknown-shape architecture with a small adapter? Yes. Compiler `data_schema` / `ui_schema` / `ui_rules` stay as the page produces them. The host folds `compileTerseRuleSyntax` + `applicableActions` into field mode. No Core rule engine.

## Method

Characterization tests against `VndlyFormWithConditionals2` first (compiler-shaped UUID keys, `remove`+`setValue`, `require`, `formContext.*`). Then the same assertions against `VndlyUnknownShapeForm`. Then the ChecklistForm preview island swapped.

- **Platform defaults:** [hookFormDefaults.tsx](file:///Users/tim.kindberg/projects/vndly4/assets/js/formframe/hookFormDefaults.tsx) — `HookFormFieldModeContext.isHidden`; `field.root` returns null (unknown-shape skip). Known-shape `useFormFrame` still compiles with `jsonSchemaToTree` at module scope.
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
