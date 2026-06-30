// Ad-hoc benchmark for ADR 025's per-validate clone in the AJV adapter.
// Run:  node bench/clonePerf.mjs   (from packages/validation-ajv)
//
// Questions it answers:
//  1. How big is the clone cost relative to the AJV validate it protects?
//  2. structuredClone vs JSON round-trip vs a tiny hand-rolled clone.
//  3. Does it matter at form sizes (tiny/typical/large/deep)?
import Ajv from 'ajv'

const ITER = 200_000

function bench(label, fn, iter = ITER) {
  fn() // warm
  fn()
  const t0 = performance.now()
  for (let i = 0; i < iter; i++) fn()
  const ms = performance.now() - t0
  const nsPerOp = (ms * 1e6) / iter
  console.log(`  ${label.padEnd(34)} ${nsPerOp.toFixed(0).padStart(8)} ns/op`)
  return nsPerOp
}

// --- clone strategies --------------------------------------------------------
const jsonClone = (d) => JSON.parse(JSON.stringify(d))
function cheapClone(d) {
  if (Array.isArray(d)) return d.map(cheapClone)
  if (d && typeof d === 'object') {
    const out = {}
    for (const k in d) out[k] = cheapClone(d[k])
    return out
  }
  return d
}

// --- schema/data generators (FormData-style string values => coercion fires) -
function flatSchema(n) {
  const properties = {}
  for (let i = 0; i < n; i++) {
    const t = i % 3
    properties[`f${i}`] =
      t === 0
        ? { type: 'string', minLength: 1 }
        : t === 1
          ? { type: 'number', minimum: 0 }
          : { type: 'boolean' }
  }
  return { type: 'object', properties }
}
function flatData(n) {
  const d = {}
  for (let i = 0; i < n; i++) {
    const t = i % 3
    d[`f${i}`] = t === 0 ? 'hello' : t === 1 ? '42' : 'true' // strings: coercion fires
  }
  return d
}
function deepSchema(items, fields) {
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
function deepData(items, fields) {
  const rows = []
  for (let r = 0; r < items; r++) {
    const row = {}
    for (let i = 0; i < fields; i++) row[`g${i}`] = String(i)
    rows.push(row)
  }
  return { rows }
}

const cases = [
  { name: 'tiny (3 fields)', schema: flatSchema(3), data: flatData(3) },
  { name: 'typical (30 fields)', schema: flatSchema(30), data: flatData(30) },
  { name: 'large (300 fields)', schema: flatSchema(300), data: flatData(300) },
  {
    name: 'deep (50 rows x 5)',
    schema: deepSchema(50, 5),
    data: deepData(50, 5),
  },
]

for (const c of cases) {
  const ajv = new Ajv({ allErrors: true, strict: false, coerceTypes: true })
  const validate = ajv.compile(c.schema)
  console.log(`\n${c.name}`)

  bench('structuredClone only', () => structuredClone(c.data))
  bench('JSON clone only', () => jsonClone(c.data))
  bench('cheapClone only', () => cheapClone(c.data))

  // Pure validate cost: pre-coerce ONCE, then validate the same already-typed
  // object repeatedly — no coercion fires, no mutation, no clone. Lower bound.
  const preCoerced = structuredClone(c.data)
  validate(preCoerced)
  bench('validate only (no coercion)', () => validate(preCoerced))

  // Production reality: fresh string data each call => clone + coercion + check.
  bench('structuredClone + validate', () => validate(structuredClone(c.data)))
  bench('JSON clone + validate', () => validate(jsonClone(c.data)))
  bench('cheapClone + validate', () => validate(cheapClone(c.data)))
}
console.log('\n(ns/op; lower is faster)')
