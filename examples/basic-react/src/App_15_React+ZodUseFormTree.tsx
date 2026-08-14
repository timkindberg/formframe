// Zod end-to-end: compile → validate → bind → submit with recipe-owned
// validation.
//
// 1. Define a Zod schema (structure + validation in one place).
// 2. Compile explicitly with zodToTree(schema).
// 3. Adapt validation explicitly with fromStandardSchema(schema).
// 4. Bind with useFormTree(tree) — presentation + FormData submit.
// 5. Run the validator with `useNativeValidator` (nativeValidation.recipe.tsx)
//    and submit through ITS submit callback.
// 6. Inject each field's errors via `<Default of={field} errors={…} />`
//    (ADR 050) through `NativeValidationProvider` + `useFieldValidationErrors`
//    — one small wrapper component does this for every field.
// 7. One continuation customization; everything else stays default.
import { useState } from 'react'
import { z } from 'zod'
import { fromStandardSchema } from '@formframe/core'
import { zodToTree } from '@formframe/input-zod'
import { useFormTree, Default, type EField } from '@formframe/renderer-react'
import {
  NativeValidationProvider,
  useFieldValidationErrors,
  useNativeValidator,
} from './nativeValidation.recipe'

const schema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .meta({ title: 'Name', description: 'Your display name.' }),
  email: z.string().email('Enter a valid email').meta({ title: 'Email' }),
})

const tree = zodToTree(schema)
const validator = fromStandardSchema(schema)

/** Injects this field's recipe-gated errors into the default field render —
 * the raw-`renderNode` twin of `nativeFieldControls.recipe.tsx`'s
 * control-kind bindings, mounted here so `useFieldValidationErrors` runs in
 * its own component (rules of hooks; a bare callback can't call hooks). */
function FieldWithErrors({ node }: { node: EField }) {
  const errors = useFieldValidationErrors(node.path)
  return <Default of={node} errors={errors} />
}

function EmailFieldWithNote({ node }: { node: EField }) {
  const errors = useFieldValidationErrors(node.path)
  return (
    <Default
      of={node}
      errors={errors}
      parts={{
        label: (label) => (
          <span>
            <Default of={label} />
            <small
              style={{ marginLeft: 6, color: '#666', fontWeight: 'normal' }}
            >
              Account notifications only.
            </small>
          </span>
        ),
      }}
    />
  )
}

function App() {
  const { form, SchemaFields } = useFormTree(tree)
  const { validation, submit, revalidate, handleBlur } = useNativeValidator(
    form,
    validator
  )
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null)

  return (
    <div>
      <h1>Zod Form — compile, then bind (recipe-owned validation)</h1>
      <p>
        <code>zodToTree(schema)</code> compiles structure;{' '}
        <code>fromStandardSchema(schema)</code> adapts validation;{' '}
        <code>useFormTree(tree)</code> binds React behavior;{' '}
        <code>useNativeValidator(form, validator)</code> owns submit-time gating
        and touched/submitted state — spread its{' '}
        <code>{'{...validation}'}</code> into{' '}
        <code>NativeValidationProvider</code>.
      </p>
      <p>
        The email field below shows one continuation move: augment the label
        while keeping the default control and injecting its errors the same way
        every other field does.
      </p>

      <form
        noValidate
        onSubmit={submit((data) => setSaved(data))}
        onBlur={(event) => {
          handleBlur(event)
          revalidate(event)
        }}
      >
        <NativeValidationProvider {...validation}>
          <SchemaFields
            intercept={(node) =>
              node.isField && node.path === 'email' ? (
                <EmailFieldWithNote node={node} />
              ) : node.isField ? (
                <FieldWithErrors node={node} />
              ) : (
                <Default of={node} />
              )
            }
          />
        </NativeValidationProvider>
        <button type="submit">Save profile</button>
      </form>

      {saved && (
        <>
          <p style={{ color: 'green' }}>Saved valid data:</p>
          <pre>{JSON.stringify(saved, null, 2)}</pre>
        </>
      )}
    </div>
  )
}

export default App
