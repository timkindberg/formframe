/**
 * @formframe/renderer-vanilla
 *
 * Framework-agnostic (no UI framework) HTML renderer. The second-implementation
 * probe (ADR 008) that pressure-tests the Core boundary, and the conformance
 * oracle (bead 0mw) that produces canonical HTML for cross-framework diffing.
 */

// `renderToString` is batteries-included; `createRenderer` is the public floor
// (bind a partial defaults object; gaps fall back to `diagnosticDefaults`
// markers); `nativeDefaults` + `mergeDefaults` override entries by reference
// (ADR 013 / ADR 051). Per-node customization is `intercept`.
export {
  renderToString,
  createRenderer,
  nativeDefaults,
  diagnosticDefaults,
  mergeDefaults,
} from './renderToString'
export type {
  Intercept,
  RenderToStringOptions,
  VanillaDefaults,
  VanillaPartialDefaults,
  VNode,
  VField,
  VGroup,
  VArray,
  VArrayItem,
} from './renderToString'

export {
  renderToDom,
  createDomRenderer,
  nativeDomDefaults,
  diagnosticDomDefaults,
  mergeDomDefaults,
  serializeDomToOracleHtml,
} from './domRenderer'
export type {
  DomIntercept,
  RenderToDomOptions,
  DomDefaults,
  DomPartialDefaults,
  DomVNode,
  DomField,
  DomGroup,
  DomArray,
  DomArrayItem,
} from './domRenderer'
