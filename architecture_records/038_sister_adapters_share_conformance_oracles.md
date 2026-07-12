# ADR 038: Sister Adapters Share Conformance Oracles

**Date:** 2026-07-12
**Status:** Accepted (bd `jsonschema-form-8jl`)
**Deciders:** Tim Kindberg
**Extends:** ADR 008 (a second implementation earns the seam), ADR 020
(shared validation contract), ADR 033 (schema-agnostic input packages)

## Context

Packages that fill the same capability slot are **sister adapters**. Their
source APIs and implementation details differ, but the behavior they expose at
the shared boundary must not drift.

The repository already has this shape in two families:

- `@jsonschema-form/validation-ajv` and
  `@jsonschema-form/validation-zod` run
  `@jsonschema-form/validation-contract`;
- `@jsonschema-form/input-jsonschema` and `@jsonschema-form/input-zod` run
  `@jsonschema-form/input-conformance`.

ADR 020 records the validation extraction. ADRs 033 and 034 establish the
neutral input boundary, but do not establish how equivalent source schemas are
kept behaviorally identical. Without a repository-wide rule, common behavior
can be copied into local suites, covered by only one adapter, or accidentally
defined by whichever concrete adapter came first.

## Decision

**Once a second maintained adapter proves a capability family, all overlapping
behavior is asserted by one shared conformance oracle.**

### 1. The oracle owns shared semantics, not source syntax

The oracle describes the neutral contract every sister must satisfy. Each
adapter supplies equivalent fixtures in its own language or implementation and
runs the same scenarios and assertions.

For input front-ends, `input-conformance` owns schema-language-neutral expected
trees, including neutral facts and derived control values. Each input package
supplies an exhaustive
`Record<ScenarioId, SourceSchema>`, so adding a shared scenario makes every
front-end provide an equivalent source fixture at typecheck time.

Equivalent meaning does not require equivalent syntax. JSON Schema requiredness
and Zod optional wrappers, for example, are different source constructs that
must produce the same neutral fact.

### 2. The dependency points toward neutral test infrastructure

A shared test package may depend on the neutral runtime contract and test
framework, but it must not import a concrete adapter. Each adapter's colocated
test imports the oracle and passes only its fixture builder or target.

The oracle remains test infrastructure. It does not move into dependency-free
Core, and concrete sisters never import one another for tests.

### 3. Adapter-local tests cover genuine differences

Behavior shared by the family belongs in the oracle. Local suites retain
source-language, vendor, and implementation-specific behavior: JSON Schema
combinator and rejection policy, Zod wrapper and degradation semantics, AJV
coercion options, or Zod-specific error mapping.

Local duplicate tests are removed only after the shared oracle asserts the same
invariant. A shared suite is exhaustive over the agreed family contract; it
does not force genuine differences into lockstep.

### 4. Assertion helpers are exported only after two consumers need them

Internal oracle assertions do not become public test APIs for convenience.
Export a neutral assertion helper only when at least two concrete consumers use
that helper directly. Until then it remains private to the runner. Accordingly,
`input-conformance` keeps its node assertion private today.

## Current Implementations

- **Validation:** `@jsonschema-form/validation-contract` runs one validator
  contract against AJV, Zod, and the contract fake (ADR 020).
- **Input:** `@jsonschema-form/input-conformance` runs one exhaustive neutral
  tree oracle against JSON Schema and Zod. Numeric choice sets are a shared
  scenario rather than duplicated adapter-local assertions.
- **Rendering:** `packages/react/src/conformance.test.tsx` applies the same
  principle at the rendering boundary by centralizing paired scenarios and
  comparing React output with the vanilla oracle. It does not need a separate
  package while that single suite is the only consumer.

## Consequences

- A new sister adapter demonstrates compatibility by running the existing
  family oracle, not by copying another adapter's tests.
- Adding shared behavior produces compile-time fixture work and runtime
  assertions for every maintained sister.
- Test dependency direction stays one-way and no concrete adapter becomes the
  specification for another.
- Adapter-local suites become smaller and more meaningful because they describe
  real differences.
- No conformance package is designed speculatively; ADR 008 still requires a
  second real implementation first.

## Alternatives Considered

- **Duplicate the common suite in every adapter** — rejected: copied assertions
  drift and additions are not exhaustive across sisters.
- **Use the first concrete adapter as the oracle** — rejected: couples sisters
  and lets implementation details define the neutral contract.
- **Put all conformance tests in Core** — rejected: Core remains
  dependency-free runtime vocabulary, not Vitest-based test infrastructure.
- **Force every adapter behavior into the shared suite** — rejected: vendor and
  source-language differences are intentional and belong locally.

---

**Relates to:** ADR 008 (earned seams), ADR 013 (renderer adapters), ADR 020
(validation contract package), ADR 033 (input packages), ADR 034 (Zod input),
`@jsonschema-form/input-conformance`,
`@jsonschema-form/validation-contract`.
