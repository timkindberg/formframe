/**
 * @jsonschema-form/vanilla
 *
 * Framework-agnostic (no UI framework) HTML renderer. The second-implementation
 * probe (ADR 008) that pressure-tests the Core boundary, and the conformance
 * oracle (bead 0mw) that produces canonical HTML for cross-framework diffing.
 */

export { renderToString } from './renderToString'
export type {
  RenderNode,
  RenderToStringOptions,
  VNode,
  VField,
  VInputField,
  VSelectField,
  VGroup,
  VArray,
  VArrayItem,
} from './renderToString'
