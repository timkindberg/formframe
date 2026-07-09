// Test-only helpers (excluded from the build — see tsconfig `exclude`).
//
// A field's render archetype is a *runtime* decision (`present()` picks the widget
// from facts + resolvers), so a statically-typed `getField(path)` can't know a leaf
// is a textarea. These helpers bridge that at the point of assertion: narrow the
// unified `parts.control` union to a specific `kind`, throwing a clear message
// otherwise, and return it *properly typed* so `.attrs`/`.options` need no cast.

import type { FieldControl, FieldNode } from '@jsonschema-form/core'

type ControlOfKind<K extends FieldControl['kind']> = Extract<
  FieldControl,
  { kind: K }
>

function controlOfKind<K extends FieldControl['kind']>(
  node: FieldNode | undefined,
  kind: K
): ControlOfKind<K> {
  const control = node?.parts.control
  if (!control || control.kind !== kind) {
    throw new Error(
      `expected a "${kind}" control, got "${control?.kind ?? 'none'}"`
    )
  }
  return control as ControlOfKind<K>
}

/** Assert the field renders as an `<input>` and return its typed control. */
export const inputCtl = (node: FieldNode | undefined) =>
  controlOfKind(node, 'input')

/** Assert the field renders as a `<select>` and return its typed control. */
export const selectCtl = (node: FieldNode | undefined) =>
  controlOfKind(node, 'select')

/** Assert the field renders as a `<textarea>` and return its typed control. */
export const textareaCtl = (node: FieldNode | undefined) =>
  controlOfKind(node, 'textarea')

/** Assert the field renders as a radio/checkbox group and return its typed control. */
export const choicegroupCtl = (node: FieldNode | undefined) =>
  controlOfKind(node, 'choicegroup')
