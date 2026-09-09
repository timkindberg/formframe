# #160 as-is spike — ScheduleMeetingModal

Throwaway VNDLY branch: `spike/formframe-160-schedule-meeting` on worktree [vndly4](file:///Users/tim.kindberg/projects/vndly4). Not merged. Not pushed.

FormFrame consumed as local CJS dist via webpack/jest aliases (unpublished). Dual React aliases are a **linking** artifact; published peerDeps should not need them.

## Two-tier (ADR 052)

- **Platform defaults:** [hookFormDefaults.tsx](file:///Users/tim.kindberg/projects/vndly4/assets/js/formframe/hookFormDefaults.tsx) — `HookFormControl` + `useFieldRootSlots` (overlay only; Chakra/HookForm own a11y). Required is `node.facts.required`. JSON Schema `format` (`node.facts.format`) picks host widgets so product pages do not intercept them:
  - `date` → `HookFormDatePicker`
  - `time` → `HookFormTimePicker`
  - `date-time` → `HookFormDateTimePicker`
  - `tel` → `HookFormInput type="tel"`
  - `timezone` → `HookFormTimezoneSelect` (open format; Core leaves native type as `text`)
  - small `oneOf`/`enum` → `choicegroup` → `HookFormSegmentedControl`
  - `group.root` → Chakra `Stack` (so default `<SchemaFields />` is stacked; `layout` still replaces the root template)
- **Product sugar:** `useFormFrame(schema, widgets?)` in [hookFormDefaults.tsx](file:///Users/tim.kindberg/projects/vndly4/assets/js/formframe/hookFormDefaults.tsx) — `jsonSchemaToRuntimeTree` + `hookFormDefaults` + `overrideWidgets`. Not `useHookForm` (RHF). No `FormProvider`. Barrel: [index.ts](file:///Users/tim.kindberg/projects/vndly4/assets/js/formframe/index.ts).
- **Form layer:** [scheduleMeetingForm.tsx](file:///Users/tim.kindberg/projects/vndly4/assets/js/interviews/formframe/scheduleMeetingForm.tsx) — schema (`format` on date/time/tel/timezone), `layout` + Stack/SimpleGrid, `$rules` as JSX, `FormProvider` bridge. Payload mapping: `format: time` emits `HH:mm`; this API still wants JSON Schema datetime, so `sanitize` combines with `date`.

Place-yourself `<Default of={field} />` does **not** run `SchemaFields intercept`. Format-driven widgets come from platform `field.root`, so layout Defaults need no `parts.control`.

`useFieldRootSlots` does **not** bake FormFrame error a11y. Native `DefaultFieldRoot` still does.

## Tests (this pass)

`ScheduleMeetingInterviewEventModal.spec.tsx` + `ScheduleMeetingJobApplicationModal.spec.tsx`: **13/13 passed**.

## Grilled dispositions (ADR 052)

See [#160 comment](https://github.com/timkindberg/formframe/issues/160#issuecomment-5319595141). Follow-ups: #163 (export `field.root` pieces). Closed #161 / #162 as not FormFrame features. `format: timezone` is a host format, not a Core HTML type.
