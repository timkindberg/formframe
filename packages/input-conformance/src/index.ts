/**
 * @jsonschema-form/input-conformance
 *
 * The shared input-conformance oracle: the fixed set of expected NEUTRAL trees
 * that every @jsonschema-form/input-* front-end must produce for equivalent
 * schemas (ADR 038). Test-only, and deliberately ignorant of every input-*
 * package — each front-end imports THIS and runs its own compiler against it, so
 * the dependency points one way and the front-ends never reference each other.
 */

export const VERSION = '0.0.0'

export { conformanceScenarios } from './scenarios'
export type {
  ScenarioId,
  ConformanceScenario,
  NodeSpec,
  FieldSpec,
  GroupSpec,
  ArraySpec,
} from './scenarios'
export { runInputConformance } from './runner'
