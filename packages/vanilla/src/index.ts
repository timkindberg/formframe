/**
 * @formframe/renderer-vanilla
 *
 * Framework-agnostic (no UI framework) HTML renderer. The second-implementation
 * probe (ADR 008) that pressure-tests the Core boundary, and the conformance
 * oracle (bead 0mw) that produces canonical HTML for cross-framework diffing.
 */

// `renderToString` is batteries-included; `createRenderer` is the public floor
// (bind a partial renderer set; gaps fall back to `diagnosticAdapter` markers);
// spread `defaultAdapter` to override entries by reference (ADR 013).
export {
  renderToString,
  createRenderer,
  defaultAdapter,
  diagnosticAdapter,
} from './renderToString'
export type {
  RenderNode,
  RenderToStringOptions,
  VanillaAdapter,
  VanillaPartialAdapter,
  VNode,
  VField,
  VGroup,
  VArray,
  VArrayItem,
} from './renderToString'

export {
  renderToDom,
  createDomRenderer,
  defaultDomAdapter,
  diagnosticDomAdapter,
  serializeDomToOracleHtml,
} from './domRenderer'
export type {
  DomRenderNode,
  RenderToDomOptions,
  DomAdapter,
  DomPartialAdapter,
  DomVNode,
  DomField,
  DomGroup,
  DomArray,
  DomArrayItem,
} from './domRenderer'
