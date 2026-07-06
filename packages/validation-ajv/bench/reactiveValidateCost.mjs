// h05 gate benchmark — is whole-document validation actually the reactive
// bottleneck? Run:  node bench/reactiveValidateCost.mjs   (from packages/validation-ajv)
// Verdict recorded in ADR 028 (field-scoping deferred; measured cost is trivial).
//
// Context (ADR 021 + 023): reactive validation re-runs the WHOLE-document
// Validator on every keystroke/blur. ADR 023 already made *re-renders*
// O(changed-fields), so the open question for h05 is purely the VALIDATOR cost:
// does running AJV over the entire form per event scale badly enough at
// realistic sizes to justify field-scoped/subtree validation (a big change that
// breaks cross-field rules)? This measures the real adapter hot path —
// cheapClone + coerce + validate (the mutating default, ADR 025) — and frames it
// against a 16.7 ms frame budget (60 fps) so the number decides the direction.
import Ajv from 'ajv'
import addFormats from 'ajv-formats'

const ITER = 50_000
const FRAME_MS = 1000 / 60 // 16.67 ms budget for one animation frame

function benchNs(fn, iter = ITER) {
  fn() // warm
  fn()
  const t0 = performance.now()
  for (let i = 0; i < iter; i++) fn()
  const ms = performance.now() - t0
  return (ms * 1e6) / iter // ns/op
}

// Faithful copy of the adapter's cheap JSON clone (ADR 025).
function cheapClone(d) {
  if (Array.isArray(d)) return d.map(cheapClone)
  if (d && typeof d === 'object') {
    const out = {}
    for (const k in d) out[k] = cheapClone(d[k])
    return out
  }
  return d
}

// FormData-style schemas/data: values arrive as strings, so coerceTypes fires and
// a realistic mix of keywords (minLength/minimum/pattern/format) does real work.
function flatSchema(n) {
  const properties = {}
  const required = []
  for (let i = 0; i < n; i++) {
    const t = i % 4
    if (t === 0) properties[`f${i}`] = { type: 'string', minLength: 2 }
    else if (t === 1) properties[`f${i}`] = { type: 'number', minimum: 0 }
    else if (t === 2)
      properties[`f${i}`] = { type: 'string', pattern: '^[a-z0-9]+$' }
    else properties[`f${i}`] = { type: 'string', format: 'email' }
    if (i % 5 === 0) required.push(`f${i}`)
  }
  return { type: 'object', properties, required }
}
function flatData(n) {
  const d = {}
  for (let i = 0; i < n; i++) {
    const t = i % 4
    if (t === 0) d[`f${i}`] = 'hello'
    else if (t === 1) d[`f${i}`] = '42'
    else if (t === 2) d[`f${i}`] = 'abc123'
    else d[`f${i}`] = 'user@example.com'
  }
  return d
}
// Nested array case (the "big form" shape RJSF struggled with): rows x fields.
function rowsSchema(rows, fields) {
  const properties = {}
  for (let i = 0; i < fields; i++)
    properties[`g${i}`] = { type: 'number', minimum: 0 }
  return {
    type: 'object',
    properties: {
      rows: { type: 'array', items: { type: 'object', properties } },
    },
  }
}
function rowsData(rows, fields) {
  const out = []
  for (let r = 0; r < rows; r++) {
    const row = {}
    for (let i = 0; i < fields; i++) row[`g${i}`] = String(i)
    out.push(row)
  }
  return { rows: out }
}

const cases = [
  {
    name: 'tiny (10 fields)',
    schema: flatSchema(10),
    data: flatData(10),
    leaves: 10,
  },
  {
    name: 'small (30 fields)',
    schema: flatSchema(30),
    data: flatData(30),
    leaves: 30,
  },
  {
    name: 'medium (100 fields)',
    schema: flatSchema(100),
    data: flatData(100),
    leaves: 100,
  },
  {
    name: 'large (300 fields)',
    schema: flatSchema(300),
    data: flatData(300),
    leaves: 300,
  },
  {
    name: 'huge (1000 fields)',
    schema: flatSchema(1000),
    data: flatData(1000),
    leaves: 1000,
  },
  {
    name: 'grid (100 rows x 8)',
    schema: rowsSchema(100, 8),
    data: rowsData(100, 8),
    leaves: 800,
  },
]

console.log(
  `\nreactive per-event validator cost (adapter hot path: cheapClone + coerce + validate)\n` +
    `frame budget = ${FRAME_MS.toFixed(2)} ms (60 fps)\n`
)
const head =
  '  ' +
  'case'.padEnd(22) +
  'validate-only'.padStart(16) +
  'clone+validate'.padStart(18) +
  '% of frame'.padStart(13) +
  'per-leaf'.padStart(12)
console.log(head)
console.log('  ' + '-'.repeat(head.length - 2))

for (const c of cases) {
  const ajv = new Ajv({ allErrors: true, strict: false, coerceTypes: true })
  addFormats(ajv)
  const validate = ajv.compile(c.schema)

  // Lower bound: validate an already-coerced object (no clone, no coercion work).
  const preCoerced = cheapClone(c.data)
  validate(preCoerced)
  const validateOnlyNs = benchNs(() => validate(preCoerced))

  // Adapter reality: fresh string data each call => clone + coercion + check.
  const realNs = benchNs(() => validate(cheapClone(c.data)))

  const realMs = realNs / 1e6
  const pctFrame = (realMs / FRAME_MS) * 100
  const perLeafNs = realNs / c.leaves

  console.log(
    '  ' +
      c.name.padEnd(22) +
      `${(validateOnlyNs / 1000).toFixed(1)} us`.padStart(16) +
      `${(realNs / 1000).toFixed(1)} us`.padStart(18) +
      `${pctFrame.toFixed(2)}%`.padStart(13) +
      `${perLeafNs.toFixed(0)} ns`.padStart(12)
  )
}

console.log(
  `\nRead: "clone+validate" is the real per-keystroke validator cost. If it stays a\n` +
    `small fraction of one 16.7 ms frame even at hundreds/thousands of fields, then\n` +
    `whole-document validation is NOT the bottleneck (ADR 023 already handled the\n` +
    `re-render cost) and field-scoping is not justified. (us = microseconds.)\n`
)
