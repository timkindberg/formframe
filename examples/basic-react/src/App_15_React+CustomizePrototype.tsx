import { createContext, useContext, useMemo, useState } from 'react'
import { jsonSchemaToTree } from '@jsonschema-form/input-jsonschema'
import type {
  JSONSchema,
  FieldPath,
  InferData,
} from '@jsonschema-form/input-jsonschema'
import type { FieldControl } from '@jsonschema-form/core'
import {
  SchemaFields,
  useFormTree,
  ValidationProvider,
  useFieldIssues,
  useFieldErrorDisplay,
} from '@jsonschema-form/react'
import type { RenderNode } from '@jsonschema-form/react'
import { createAjvValidator } from '@jsonschema-form/validation-ajv'

// ═══════════════════════════════════════════════════════════════════════════
// PROTOTYPE — throwaway spike (bd jsonschema-form-gjq / epic 8l8). DELETE ME.
//
// Sixth pass — the shape ADR 039 records:
//   • path/kind — `FieldPath<S>` + a kind split (compile-error guardrails).
//   • value     — `InferData<SchemaAt<S,P>>` (e.g. 'plan' → union).
//   • control   — routed through `WidgetAt<S,P,Overrides={}>` → the shared
//                 `WidgetControlKind` table (Stage B). Default-rule fidelity
//                 today; a typed per-path `Overrides` map slots in later with
//                 NO rewrite. (This fixes the old spike's enum→'select' bug:
//                 an enum of ≤5 is a `radio` → `choicegroup`, not a select.)
//   • parts     — derived per path (presence), and EVERY part takes an optional
//                 typed `render` prop handing its narrowed data.
//   • Default   — the whole-node re-entry is a TOP-LEVEL prop (mirrors the
//                 engine's `{ Default, Children }`), NOT a part. `Root`/
//                 `Container` is reserved for a future `parts.container` wrapper.
// ═══════════════════════════════════════════════════════════════════════════

function defineSchema<const T extends JSONSchema>(s: T): T {
  return s
}

const schema = defineSchema({
  type: 'object',
  properties: {
    name: {
      type: 'string',
      title: 'Full name',
      description: 'As it appears on your ID.',
      minLength: 3,
    },
    plan: {
      type: 'string',
      title: 'Plan',
      enum: ['free', 'pro', 'enterprise'],
    },
    address: {
      type: 'object',
      title: 'Address',
      properties: {
        street: { type: 'string', title: 'Street' },
        city: { type: 'string', title: 'City' },
      },
      required: ['street'],
    },
  },
  required: ['name'],
})

type S = typeof schema

// ── Path → value / presence (the narrowing substrate) ─────────────────────────

type PropsOf<T> = T extends { readonly properties: infer P } ? P : never
type SchemaAt<T, P extends string> = P extends `${infer H}.${infer R}`
  ? H extends keyof PropsOf<T>
    ? SchemaAt<PropsOf<T>[H], R>
    : never
  : P extends keyof PropsOf<T>
    ? PropsOf<T>[P]
    : never

type IsGroupSchema<T> = T extends { readonly properties: unknown }
  ? true
  : false
type AllPaths<Sc> = FieldPath<Sc> & string
type FieldPaths<Sc> = {
  [P in AllPaths<Sc>]: IsGroupSchema<SchemaAt<Sc, P>> extends true ? never : P
}[AllPaths<Sc>]
type GroupPaths<Sc> = {
  [P in AllPaths<Sc>]: IsGroupSchema<SchemaAt<Sc, P>> extends true ? P : never
}[AllPaths<Sc>]

type ValueAt<Sc, P extends string> = InferData<SchemaAt<Sc, P>>

// ── control: WidgetAt<S,P,Overrides> → the shared widget→kind table ───────────
// Stage B (widget → control.kind) is ONE finite structural table — in the real
// impl a `WIDGET_CONTROL_KIND` const in Core that both `deriveControl` and this
// type read (zero drift). Here it's the type half.
interface WidgetControlKind {
  input: 'input'
  select: 'select'
  multiselect: 'select'
  textarea: 'textarea'
  radio: 'choicegroup'
  checkboxes: 'choicegroup'
}
type WidgetName = keyof WidgetControlKind
type WidgetToControlKind<W extends WidgetName> = WidgetControlKind[W]

// Stage A (facts → widget): a subset of present.ts's `defaultPresentation`.
// A choice field splits on the OPTION_COUNT_THRESHOLD (5): ≤5 → radio, else
// select — and both sides of the split map to DIFFERENT kinds, so we count.
type AtMost5<T extends readonly unknown[]> = T extends readonly [
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  ...unknown[],
]
  ? false
  : true
type EnumOf<T> = T extends { readonly enum: infer E extends readonly unknown[] }
  ? E
  : never
type DefaultWidgetAt<Sc, P extends string> = SchemaAt<Sc, P> extends {
  readonly enum: readonly unknown[]
}
  ? AtMost5<EnumOf<SchemaAt<Sc, P>>> extends true
    ? 'radio'
    : 'select'
  : 'input'

// The forward-compat SEAM: today `Overrides = {}` (pure default rule = ADR 039
// choice a). A future typed resolver supplies a path→widget map here and the
// control type re-narrows with no change to anything below.
type WidgetAt<
  Sc,
  P extends string,
  // `Record<never, …>` = no overrides (keyof never) → pure default rule today.
  Overrides extends Record<string, WidgetName> = Record<never, WidgetName>,
> = P extends keyof Overrides ? Overrides[P] : DefaultWidgetAt<Sc, P>

type ControlKindAt<Sc, P extends string> = WidgetToControlKind<
  WidgetAt<Sc, P>
>
type ControlAt<Sc, P extends string> = Extract<
  FieldControl,
  { kind: ControlKindAt<Sc, P> }
>

// Type-level proofs (evidence for ADR 039 §4) — remove when the real types land.
// Default rule: 'plan' is an enum of 3 (≤5) → radio → choicegroup (the fix).
const _planKind: 'choicegroup' =
  null as unknown as ControlKindAt<S, 'plan'>
void _planKind
// Seam: a typed per-path override re-narrows with no downstream change.
const _overrideKind: 'textarea' = null as unknown as WidgetToControlKind<
  WidgetAt<S, 'name', { name: 'textarea' }>
>
void _overrideKind

type HasDescription<Sc, P extends string> = SchemaAt<Sc, P> extends {
  readonly description: string
}
  ? true
  : false

// ── The `customize` shim: selector rules → one renderNode ────────────────────

type RNNode = Parameters<RenderNode>[0]
type RNHelpers = Parameters<RenderNode>[1]
type FieldENode = Extract<RNNode, { isField: true }>
type GroupENode = Extract<RNNode, { isGroup: true }>

// Every part is one uniform shape: `<parts.X/>` (default) or
// `<parts.X render={data => …}/>` where `data` is the part's NARROWED payload.
type PartSlot<D> = (props: {
  render?: (data: D) => React.ReactNode
}) => React.ReactNode
type Slot = () => React.ReactNode

type LabelData = {
  text: string
  attrs: { id: string; for?: string }
  showRequired: boolean
}
type TextData = { text: string }
type IssuesData = ReturnType<typeof useFieldIssues>

// The parts bag DERIVED per path: presence from the schema, control kind too.
type FieldPartsFor<Sc, P extends FieldPaths<Sc>> = {
  Label: PartSlot<LabelData>
  Control: PartSlot<ControlAt<Sc, P>>
  Errors: PartSlot<IssuesData>
} & (HasDescription<Sc, P> extends true ? { Description: PartSlot<TextData> } : object)

type GroupPartsFor<Sc, P extends GroupPaths<Sc>> = {
  Label: PartSlot<TextData>
} & (HasDescription<Sc, P> extends true ? { Description: PartSlot<TextData> } : object)

// Force TS to DISPLAY the resolved object in hovers instead of the alias with
// its giant schema generic arg (`FieldPartsFor<{…whole schema…}, 'name'>`).
type Prettify<T> = { [K in keyof T]: T[K] } & {}

// Handler props mirror the engine helpers: `Default` (whole node) and `children`
// (inner fields, containers) at top level; `parts` is only the composable slots.
type FieldProps<P extends FieldPaths<S>> = {
  path: P
  node: FieldENode
  /** Typed to the schema facts at P; type-only until form-state is reactive. */
  value: ValueAt<S, P>
  /** Re-enter the engine for the whole node (exclusive with the parts). */
  Default: Slot
  parts: Prettify<FieldPartsFor<S, P>>
}
type GroupProps<P extends GroupPaths<S>> = {
  path: P
  node: GroupENode
  Default: Slot
  parts: Prettify<GroupPartsFor<S, P>>
  children: React.ReactNode
}

const HandleCtx = createContext<({ node: RNNode } & RNHelpers) | null>(null)

// Whole-node re-entry — the top-level `Default` prop.
const DefaultSlot: Slot = () => {
  const c = useContext(HandleCtx)
  return c ? <c.Default of={c.node} /> : null
}

function LabelSlot(props: {
  render?: (data: {
    text: string
    attrs?: { id: string; for?: string }
    showRequired?: boolean
  }) => React.ReactNode
}): React.ReactNode {
  const c = useContext(HandleCtx)
  if (!c || !('label' in c.node.parts) || !c.node.parts.label) return null
  const label = c.node.parts.label
  return props.render ? props.render(label) : <c.Default of={label} />
}
function DescriptionSlot(props: {
  render?: (data: { text: string }) => React.ReactNode
}): React.ReactNode {
  const c = useContext(HandleCtx)
  if (!c || !('description' in c.node.parts) || !c.node.parts.description)
    return null
  const description = c.node.parts.description
  return props.render ? props.render(description) : <c.Default of={description} />
}
function ControlSlot(props: {
  render?: (control: FieldControl) => React.ReactNode
}): React.ReactNode {
  const c = useContext(HandleCtx)
  if (!c || !c.node.isField) return null
  const control = c.node.parts.control
  return props.render ? props.render(control) : <c.Default of={control} />
}
// Errors are RUNTIME validation state (not a schema part), so this slot reads
// the store via hooks — possible only because parts are real components.
function ErrorsSlot(props: {
  render?: (issues: IssuesData) => React.ReactNode
}): React.ReactNode {
  const c = useContext(HandleCtx)
  const path = c && c.node.isField ? c.node.path : ''
  const issues = useFieldIssues(path)
  const show = useFieldErrorDisplay(path)
  if (!show || issues.length === 0) return null
  if (props.render) return props.render(issues)
  return (
    <ul style={{ color: '#c00', margin: '4px 0 0', paddingLeft: 16 }}>
      {issues.map((issue, i) => (
        <li key={i}>{issue.message}</li>
      ))}
    </ul>
  )
}

// ONE shared runtime bag (stable identity, no remount). Types specialize it per
// path at the handler boundary; runtime is always this object.
const partsBag = {
  Label: LabelSlot,
  Description: DescriptionSlot,
  Control: ControlSlot,
  Errors: ErrorsSlot,
}

type RuntimeProps = {
  path: string
  node: RNNode
  value: unknown
  Default: Slot
  parts: typeof partsBag
  children?: React.ReactNode
}

interface Rule {
  specificity: number
  match: (node: RNNode) => boolean
  Component: (props: RuntimeProps) => React.ReactNode
}

interface Registrar {
  field<P extends FieldPaths<S>>(
    path: P,
    Component: (props: FieldProps<P>) => React.ReactNode
  ): void
  group<P extends GroupPaths<S>>(
    path: P,
    Component: (props: GroupProps<P>) => React.ReactNode
  ): void
  allGroups(
    Component: (props: GroupProps<GroupPaths<S>>) => React.ReactNode
  ): void
}

function makeCustomize(build: (r: Registrar) => void): RenderNode {
  const rules: Rule[] = []
  const add = (
    specificity: number,
    match: Rule['match'],
    Component: unknown
  ): void => {
    rules.push({
      specificity,
      match,
      Component: Component as Rule['Component'],
    })
  }
  const r: Registrar = {
    field: (path, C) => add(100, (n) => n.isField && n.path === path, C),
    group: (path, C) => add(100, (n) => n.isGroup && n.path === path, C),
    allGroups: (C) => add(10, (n) => n.isGroup && !n.isRoot, C),
  }
  build(r)
  rules.sort((a, b) => b.specificity - a.specificity)

  // eslint-disable-next-line react/display-name -- a RenderNode, not a component
  return (node, helpers) => {
    const rule = rules.find((rl) => rl.match(node))
    if (!rule) return <helpers.Default of={node} />
    const Handler = rule.Component
    const isContainer = node.isGroup || node.isArray
    const inner = isContainer ? <helpers.Children of={node} /> : undefined
    return (
      <HandleCtx.Provider value={{ node, ...helpers }}>
        <Handler
          path={node.path}
          node={node}
          value={undefined}
          Default={DefaultSlot}
          parts={partsBag}
        >
          {inner}
        </Handler>
      </HandleCtx.Provider>
    )
  }
}

// ── Handler components (hoisted → stable identity → safe hooks + memo) ────────

// `name` HAS a description in the schema, so `parts.Description` exists here.
function RowName({ parts }: FieldProps<'name'>) {
  const [hint, setHint] = useState(false)
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <parts.Control />
      <div>
        <parts.Label />{' '}
        <button
          type="button"
          onClick={() => setHint((v) => !v)}
          style={{ fontSize: 11 }}
        >
          {hint ? 'hide' : 'why?'}
        </button>
        <parts.Description />
        {hint && (
          <small style={{ color: '#666' }}>
            <code>useState</code> inside a customize handler — legal because the
            handler is a mounted component.
          </small>
        )}
        <parts.Errors />
      </div>
    </div>
  )
}

// Group label via the TYPED render-prop: `l` is `{ text }` — render it as a
// <legend> instead of the default caption.
function CardGroup({ parts, children }: GroupProps<'address'>) {
  return (
    <fieldset
      style={{ border: '2px dashed teal', borderRadius: 8, padding: 12 }}
    >
      <parts.Label render={(l) => <legend>{l.text} (custom)</legend>} />
      {children}
    </fieldset>
  )
}

// FULL control hijack via the TYPED render-prop: `c` is narrowed to the input
// member (ControlAt<'address.street'>), so `c.attrs` is `HtmlInputAttrs` with no
// guard. Spread keeps FormData wiring; we add attrs and omit one on purpose.
function StreetInput({ parts }: FieldProps<'address.street'>) {
  // presence narrowing: street has no description in the schema.
  // @ts-expect-error 'address.street' has no description part
  void parts.Description
  return (
    <div>
      <parts.Label />
      <parts.Control
        render={(c) => {
          const { type: nativeType, ...attrs } = c.attrs
          void nativeType // dropped deliberately — our widget owns the type
          return (
            <input
              {...attrs}
              placeholder="123 Main St"
              autoComplete="street-address"
              style={{
                display: 'block',
                border: '2px solid darkorange',
                borderRadius: 6,
                padding: 6,
              }}
            />
          )
        }}
      />
      <parts.Errors />
    </div>
  )
}

// Uses the top-level `Default` prop (whole node) + adds a note beside it.
function CityNote({ Default }: FieldProps<'address.city'>) {
  return (
    <div>
      <Default />
      <small style={{ color: '#888' }}>Used for tax estimation.</small>
    </div>
  )
}

// ── The rules, hoisted (stable identity → memo bail + stable handler types) ───

const customizeRules = (r: Registrar): void => {
  r.field('name', RowName)
  r.group('address', CardGroup)
  r.field('address.street', StreetInput)
  r.field('address.city', CityNote)

  // INLINE handler → props inferred as FieldProps<'plan'> (no annotation).
  r.field('plan', ({ value, Default }) => {
    // Hover `value`: 'free' | 'pro' | 'enterprise' — from the schema enum.
    void value
    return <Default />
  })

  // ── Guardrails: each is a COMPILE ERROR. ───────────────────────────────────
  // @ts-expect-error 'nope' is not a field path
  r.field('nope', () => null)
  // @ts-expect-error 'address' is a GROUP, not a field
  r.field('address', () => null)
  // @ts-expect-error 'address.city' is a FIELD, not a group
  r.group('address.city', () => null)
}

// LIVE validation (feature 2): `useFormTree` runs the side-loaded validator on
// each `revalidate` (onInput), updating per-path issues that `parts.Errors`
// reads. Type ≥3 chars in Full name and the seeded "too short" clears live —
// inputs stay uncontrolled (FormData), no onChange.
function LiveCustomizedForm() {
  const tree = useMemo(() => jsonSchemaToTree(schema), [])
  const validator = useMemo(() => createAjvValidator(schema), [])
  const {
    SchemaFields: Fields,
    submit,
    revalidate,
    errors,
  } = useFormTree(tree, { validator })
  const renderNode = useMemo(() => makeCustomize(customizeRules), [])
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  return (
    <form noValidate onSubmit={submit((d) => setData(d))} onInput={revalidate}>
      <ValidationProvider issues={errors} showErrorsWhen="always">
        <Fields renderNode={renderNode} />
      </ValidationProvider>
      <button type="submit" style={{ marginTop: 12 }}>
        Submit
      </button>
      {data && (
        <pre style={{ background: '#f5f5f5', padding: 8, marginTop: 8 }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </form>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ borderBottom: '1px solid #ddd' }}>{title}</h2>
      {children}
    </div>
  )
}

export default function App() {
  const form = useMemo(() => jsonSchemaToTree(schema), [])

  return (
    <div>
      <h1>customize — path-narrowed props &amp; parts (PROTOTYPE)</h1>
      <p>
        In-editor: <code>{`r.field('…')`}</code>/<code>{`r.group('…')`}</code>{' '}
        narrow to real paths; <code>value</code> and <code>control</code> narrow
        to the schema facts; <code>parts</code> is derived per path (
        <code>parts.Description</code> exists on <code>name</code> but not{' '}
        <code>street</code>); every part takes a typed <code>render</code> prop;
        and <code>Default</code> re-enters the whole node. Type into the orange
        Street box and Submit.
      </p>

      <Section title="1. Default form (no customization)">
        <SchemaFields form={form} />
      </Section>

      <Section title="2. customize — narrowed props/parts, typed render-props, Default prop, live errors">
        <LiveCustomizedForm />
      </Section>
    </div>
  )
}
