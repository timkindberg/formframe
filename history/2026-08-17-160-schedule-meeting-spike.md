# #160 as-is spike — ScheduleMeetingModal

Throwaway VNDLY branch: `spike/formframe-160-schedule-meeting` on worktree [vndly4](file:///Users/tim.kindberg/projects/vndly4). Not merged. Not pushed.

FormFrame consumed as local CJS dist via webpack/jest aliases (unpublished). Dual React aliases are a **linking** artifact; published peerDeps should not need them.

## What rendered

`jsonSchemaToRuntimeTree` + `useFormTree({ defaults: chakraDefaults })` + `SchemaFields` children for layout. `$rules` / `ui:layout` became JSX. Existing interview-event tests get as far as POST; 3/9 interview-event tests pass (cancel + cannot-cancel + read-only cannot-edit). Payload mismatches are time encoding. Job-application tests fail on timezone because they drive react-select, not a native `<select>`.

Spike inlined platform defaults + form intercept in one file — next known-shape work should split them.

## Grilled dispositions (ADR 052)

See [#160 comment](https://github.com/timkindberg/formframe/issues/160#issuecomment-5319595141). Follow-ups: #163 (export `field.root` pieces). Closed #161 / #162 as not FormFrame features.
