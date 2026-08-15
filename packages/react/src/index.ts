/**
 * @formframe/renderer-react
 *
 * React adapter for Core form trees from any schema front-end.
 */

// Source-agnostic React hook
export { useFormTree } from './useFormTree'
export type { BoundSchemaFieldsProps, UseFormTreeOptions } from './useFormTree'

// Continuation renderer (ADR 010/013/051) — typed, front-end-agnostic (operates
// on the Core tree). Schema compilation lives in separate input packages.
//
// `SchemaFields` is batteries-included; `createRenderer` is the public floor
// (bind a partial defaults object; gaps fall back to `diagnosticDefaults`
// markers); `nativeDefaults` + `mergeDefaults` are the kind-wide table
// `useFormTree({ defaults })` binds. Per-node customization is `intercept`.
//
// The library RENDERS validation errors via the inject seam
// (`<Default of={field} errors={ValidationError[]} />`) — it does not
// produce/schedule/store them (ADR 050).
export {
  SchemaFields,
  createRenderer,
  nativeDefaults,
  diagnosticDefaults,
  mergeDefaults,
  Default,
  Children,
  fieldControlId,
  fieldErrorId,
  errorA11yProps,
  InjectFieldErrors,
  FieldA11yContext,
} from './renderer'
export type {
  Intercept,
  InterceptFn,
  InterceptMap,
  InterceptBag,
  InterceptHandler,
  InterceptWhereRule,
  InterceptParts,
} from './intercept'
export { resolveIntercept, interceptStabilityDeps } from './intercept'
export type {
  SchemaFieldsProps,
  RenderHelpers,
  ReactDefaults,
  ReactPartialDefaults,
  DefaultParts,
  ENode,
  EField,
  EGroup,
  EArray,
  EArrayItem,
  ErrorA11yProps,
  FieldA11yState,
} from './renderer'

// The intercept-rules layer (ADR 047/048) — a form-scope selector registry
// lowering to an ordinary `Intercept` (no engine seam); handlers are mounted
// components receiving arrangeable parts. Source-agnostic runtime. Kind-wide
// look belongs on defaults (ADR 051), not on registrar blankets.
export { interceptRules } from './interceptRules'
export type {
  RuleRegistrar,
  RulesBuild,
  PartComponent,
  PartsBag,
  LabelData,
  TextData,
  FieldHandler,
  GroupHandler,
  ArrayHandler,
  NodeHandler,
  FieldHandlerProps,
  GroupHandlerProps,
  ArrayHandlerProps,
  NodeHandlerProps,
} from './interceptRules'

// The typed binding (ADR 048) — reads the `FormShape` a front-end brands onto the
// tree and re-types the registrar off it. `useInterceptRules(tree, rules)` is the
// typed + memoized front door; `FieldProps`/`GroupProps`/`ArrayProps`/`ControlProps`
// annotate hoisted handlers (keyed on `type Shape = FormShapeOf<typeof schema>`
// from the front-end).
export { useInterceptRules } from './useInterceptRules'
export type {
  FieldProps,
  GroupProps,
  ArrayProps,
  ControlProps,
  TypedRuleRegistrar,
} from './useInterceptRules'
