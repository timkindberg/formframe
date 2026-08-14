// RECIPE (native form-state): control bindings that inject gated errors into
// FormFrame's `<Default of={node} errors={…} />` seam.
//
// Layer 2 of the native recipe stack — the peer of `rhfFieldControls.recipe.tsx`
// / `tanstackFieldControls.recipe.tsx`:
//
//   fieldPresentation.recipe.tsx     shared blank/match helpers + ValidationSummary
//   nativeValidation.recipe.tsx      recipe-owned stores + provider
//   nativeFieldControls.recipe.tsx   ← you are here.
//   Recipe_NativeForm_*              per schema front-end
//
// Native forms are uncontrolled (FormData on submit) — FormFrame's default
// controls already emit the right `name`/`id` attrs. These handlers only
// inject pre-gated errors so the library renders them; they do not replace
// the control markup. Typed against FormFrame's neutral `ControlProps<K>`
// seam, so ONE copy serves every schema front-end.
//
// Display timing lives in `NativeValidationProvider` (default `'submit'`),
// not here — these controls inject whatever the provider says is displayable.
import type { ReactNode } from 'react'
import { Default, type ControlProps } from '@formframe/renderer-react'
import { useFieldValidationErrors } from './nativeValidation.recipe'

export function InputControl({ path, node }: ControlProps<'input'>): ReactNode {
  const errors = useFieldValidationErrors(path)
  return <Default of={node} errors={errors} />
}

export function SelectControl({
  path,
  node,
}: ControlProps<'select'>): ReactNode {
  const errors = useFieldValidationErrors(path)
  return <Default of={node} errors={errors} />
}

export function ChoiceGroupControl({
  path,
  node,
}: ControlProps<'choicegroup'>): ReactNode {
  const errors = useFieldValidationErrors(path)
  return <Default of={node} errors={errors} />
}
