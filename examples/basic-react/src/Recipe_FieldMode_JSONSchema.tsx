// RECIPE: unknown-shape rule_schema → field mode → field UI + AJV.
//
// Files to copy — this one plus:
//
//   fieldMode.recipe.ts            createFieldMode + withFieldMode
//   ajvValidator.recipe.ts         createAjvValidator({ fieldMode })
//   rhfFieldControls.recipe.tsx    RHF control bindings
//   fieldPresentation.recipe.tsx   ValidationSummary
//
// The shape of it:
//
//   const fieldMode = createFieldMode(rules)
//   createAjvValidator(schema, { fieldMode })   ← same function as field UI
//   const { isHidden, isRequired, isReadOnly, setValues } = fieldMode(values)
//
// One required producer: AJV via `{ fieldMode }`, not `register({ required })`.
// Skip hidden fields in `field.root` (unknown-shape default walk). Known-shape
// place-yourself layouts filter in `layout` instead. `setValues` is host-applied
// (hide-and-clear). Live rules need a reactive form-state adapter — native
// FormData predicates go stale (ADR 011 / 056).
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from 'react-hook-form'
import type { FieldValues } from 'react-hook-form'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import type { FieldControl } from '@formframe/core'
import { toStandardSchema } from '@formframe/core'
import { jsonSchemaToRuntimeTree } from '@formframe/input-jsonschema'
import type { JSONSchema } from '@formframe/input-jsonschema'
import {
  errorA11yProps,
  FieldA11yContext,
  InjectFieldErrors,
  nativeDefaults,
  useFormTree,
  type ReactPartialDefaults,
} from '@formframe/renderer-react'
import { createAjvValidator } from './ajvValidator.recipe'
import {
  createFieldMode,
  isBlank,
  type FieldModeSnapshot,
} from './fieldMode.recipe'
import { ValidationSummary } from './fieldPresentation.recipe'
import {
  rhfErrorsToList,
  useFieldValidationErrors,
} from './rhfFieldControls.recipe'
import {
  blankToUndefined,
  unselectedToUndefined,
} from './fieldPresentation.recipe'

const DRIVER = 'driver'
const NOTES = 'extraNotes'
const EMAIL = 'followUpEmail'
const COMMENT = 'internalComment'
const TITLE = 'title'

const schema = {
  type: 'object',
  required: [TITLE],
  properties: {
    [DRIVER]: {
      type: 'string',
      title: 'Need extra details?',
      enum: ['yes', 'no'],
    },
    [NOTES]: { type: 'string', title: 'Extra notes' },
    [EMAIL]: { type: 'string', title: 'Follow-up email' },
    [COMMENT]: { type: 'string', title: 'Internal comment' },
    [TITLE]: { type: 'string', title: 'Title' },
  },
} as const satisfies JSONSchema

const rules = [
  {
    conditions: { or: [{ [DRIVER]: { not: { eq: 'yes' } } }] },
    event: [
      { type: 'remove' as const, params: { field: NOTES } },
      { type: 'setValue' as const, params: { field: NOTES, value: null } },
    ],
  },
  {
    conditions: { [DRIVER]: { eq: 'yes' } },
    event: [
      { type: 'require' as const, params: { field: EMAIL } },
      { type: 'require' as const, params: { field: NOTES } },
      { type: 'setReadOnly' as const, params: { field: COMMENT } },
    ],
  },
]

const tree = jsonSchemaToRuntimeTree(schema)
const fieldMode = createFieldMode(rules)
const validator = createAjvValidator(schema, { fieldMode })
const resolver = standardSchemaResolver(
  toStandardSchema(validator) as StandardSchemaV1<FieldValues>
)

const FieldModeCtx = createContext<FieldModeSnapshot>({
  isHidden: () => false,
  isRequired: () => false,
  isReadOnly: () => false,
  hidden: new Set(),
  required: new Set(),
  readOnly: new Set(),
  setValues: {},
})

const blankOption = { setValueAs: blankToUndefined }
const unselectedOption = { setValueAs: unselectedToUndefined }

function RecipeFieldRoot(
  props: Parameters<NonNullable<typeof nativeDefaults.field.root>>[0]
) {
  const mode = useContext(FieldModeCtx)
  const errors = useFieldValidationErrors(props.node.path)
  if (mode.isHidden(props.node.path)) return null
  const required =
    mode.isRequired(props.node.path) || Boolean(props.node.facts.required)
  const readOnly = mode.isReadOnly(props.node.path)
  const Root = nativeDefaults.field.root
  return (
    <InjectFieldErrors errors={errors}>
      <div
        className="jsf-field"
        data-path={props.node.path}
        data-required={required ? 'true' : 'false'}
        data-readonly={readOnly ? 'true' : 'false'}
      >
        {required ? (
          <span data-testid={`required-badge-${props.node.path}`}>
            required
          </span>
        ) : null}
        {readOnly ? (
          <span data-testid={`readonly-badge-${props.node.path}`}>
            readonly
          </span>
        ) : null}
        <Root node={props.node} overrides={props.overrides} />
      </div>
    </InjectFieldErrors>
  )
}

function RecipeFieldControl(control: FieldControl) {
  const { register } = useFormContext()
  const { isReadOnly } = useContext(FieldModeCtx)
  const errorA11y = errorA11yProps(useContext(FieldA11yContext))
  const path =
    control.kind === 'choicegroup'
      ? control.options[0]?.attrs.name
      : control.attrs.name
  const readOnly = path ? isReadOnly(path) : false
  switch (control.kind) {
    case 'input':
      return (
        <input
          {...control.attrs}
          {...register(path, blankOption)}
          {...errorA11y}
          readOnly={readOnly}
        />
      )
    case 'textarea':
      return (
        <textarea
          {...control.attrs}
          {...register(path, blankOption)}
          {...errorA11y}
          readOnly={readOnly}
        />
      )
    case 'select': {
      const { attrs, options } = control
      return (
        <select
          {...attrs}
          {...register(path, attrs.multiple ? undefined : blankOption)}
          {...errorA11y}
          disabled={readOnly}
        >
          {!attrs.multiple && <option value="">-- select --</option>}
          {options.map((o) => (
            <option key={String(o.value)} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    }
    case 'choicegroup':
      return (
        <div
          className="jsf-choicegroup"
          role={control.role}
          aria-labelledby={control.labelledBy}
          {...errorA11y}
        >
          {control.options.map((o) => (
            <label key={o.attrs.id} className="jsf-choice">
              <input
                {...o.attrs}
                {...register(path, unselectedOption)}
                disabled={readOnly}
              />
              <span className="jsf-choice-text">{o.label}</span>
            </label>
          ))}
        </div>
      )
  }
}

// Module-stable: a fresh `defaults` identity rebuilds SchemaFields and remounts
// every field (`useFormTree`). Same reason `rhfFieldDefaults` is a const.
const recipeDefaults: ReactPartialDefaults = {
  field: { root: RecipeFieldRoot, control: RecipeFieldControl },
}

function snapshotMembership(mode: FieldModeSnapshot): string {
  return [
    [...mode.hidden].sort().join(),
    [...mode.required].sort().join(),
    [...mode.readOnly].sort().join(),
    JSON.stringify(mode.setValues),
  ].join('|')
}

export default function App() {
  const methods = useForm({
    resolver,
    defaultValues: {
      [DRIVER]: 'no',
      [NOTES]: '',
      [EMAIL]: '',
      [COMMENT]: 'seeded comment',
      [TITLE]: '',
    },
  })
  useWatch({
    control: methods.control,
    name: [...fieldMode.paths],
  })
  const nextMode = fieldMode(methods.getValues())
  const membershipKey = snapshotMembership(nextMode)
  // Membership, not object identity: a new snapshot every render would
  // re-render every field.root that reads FieldModeCtx.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- membershipKey
  const mode = useMemo(() => nextMode, [membershipKey])
  const hiddenKey = [...mode.hidden].sort().join()
  const setValuesKey = JSON.stringify(mode.setValues)

  useEffect(() => {
    const snapshot = fieldMode(methods.getValues())
    for (const [path, value] of Object.entries(snapshot.setValues)) {
      const current = methods.getValues(path)
      if (current === value) continue
      if (isBlank(current) && value == null) continue
      methods.setValue(path, value as never, { shouldDirty: true })
    }
    for (const path of snapshot.hidden) methods.clearErrors(path)
  }, [hiddenKey, setValuesKey, methods])

  const { SchemaFields } = useFormTree(tree, { defaults: recipeDefaults })
  const { errors } = methods.formState
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(
    null
  )

  return (
    <div>
      <h1>Unknown-shape field mode (recipe)</h1>
      <p>
        JSON rules compile with <code>createFieldMode</code>. The same function
        drives field UI (hide / required marker / read-only) and AJV via{' '}
        <code>createAjvValidator(schema, {'{ fieldMode }'})</code>. Extra notes
        hides and clears when the answer is no; it and follow-up email are
        required when yes. Internal comment is read-only when yes. Copy-paste —
        not a FormFrame engine (ADR 056).
      </p>

      <FieldModeCtx.Provider value={mode}>
        <FormProvider {...methods}>
          <form
            noValidate
            onSubmit={methods.handleSubmit((data) => {
              setSubmitted({ ...data, ...mode.setValues })
            })}
          >
            <ValidationSummary errors={rhfErrorsToList(errors)} form={tree} />
            <SchemaFields />
            <button type="submit" style={{ marginTop: 12 }}>
              Submit
            </button>
          </form>
        </FormProvider>
      </FieldModeCtx.Provider>

      {submitted && (
        <>
          <p style={{ color: 'green' }}>Submitted:</p>
          <pre data-testid="submitted">
            {JSON.stringify(submitted, null, 2)}
          </pre>
        </>
      )}
    </div>
  )
}

// ─── MAINTAINER NOTES (not part of the recipe) ───────────────────
// Safe to delete when copying this file.
// • Issue #74; precursor spike #164. ADR 056.
// • Known-shape skip is `layout` filter, not field.root → null.
// • Host with JRES: replace createFieldMode's matcher; keep withFieldMode.
// • Architecture (compile once, project data — do not rewrite the schema):
//
//     module scope:
//       schema ─► tree                    (IR, immutable)
//       rules  ─► fieldMode(values)       (pure fold → snapshot)
//       schema ─► ajv.compile once ─► withFieldMode(fieldMode) ─► RHF resolver
//
//     per keystroke / submit:
//       RHF values ─┬─► fieldMode(values) ─► context ─► hide / required / readOnly
//                   ├─► setValues effect ─► setValue / clearErrors
//                   └─► resolver(data) ─► clone+omit hidden ─► same AJV fn
//                                           ─► drop hidden errors, inject required
//
//     JSON Schema + compiled AJV stay put. VNDLY/RJSF instead pushed
//     schema.required / deleted properties on each data change.
// ──────────────────────────────────────────────────────────────────────────────
