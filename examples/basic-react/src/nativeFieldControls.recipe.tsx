// RECIPE (native form-state): defaults bindings that inject gated errors into
// FormFrame's field root under `InjectedFieldErrorsContext`.
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
// controls already emit the right `name`/`id` attrs. These defaults only
// inject pre-gated errors so the library renders them; they do not replace
// the control markup.
//
// Display timing lives in `NativeValidationProvider` (default `'submit'`),
// not here — these defaults inject whatever the provider says is displayable.
import type { ReactNode } from 'react'
import {
  InjectFieldErrors,
  nativeDefaults,
  type ReactPartialDefaults,
} from '@formframe/renderer-react'
import { useFieldValidationErrors } from './nativeValidation.recipe'

function NativeRecipeFieldRoot({
  node,
  overrides,
}: Parameters<NonNullable<typeof nativeDefaults.field.root>>[0]): ReactNode {
  const errors = useFieldValidationErrors(node.path)
  const Root = nativeDefaults.field.root
  return (
    <InjectFieldErrors errors={errors}>
      <Root node={node} overrides={overrides} />
    </InjectFieldErrors>
  )
}

/** Kind-wide native recipe defaults — pass to `useFormTree({ defaults })`. */
export const nativeFieldDefaults: ReactPartialDefaults = {
  field: {
    root: NativeRecipeFieldRoot,
  },
}
