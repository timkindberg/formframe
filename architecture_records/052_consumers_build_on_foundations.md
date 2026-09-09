# ADR 052: Consumers Build Capabilities; FormFrame Grows Generic Surfaces

**Date:** 2026-08-17
**Status:** Accepted
**Deciders:** Tim Kindberg
**Builds on:** ADR 007 (serialize when you must, code when you can), ADR 008 (second implementation forces the seam), ADR 024 (recipes, not a catalog of host adapters)

## Context

The #160 as-is spike produced failures that look like missing FormFrame features: RJSF `enumNames`, fetched select options, i18n titles, PhoneWidget, `preloadFromApi`. The tempting move is to compile each construct. That re-grows RJSF’s kitchen sink and trains the next agent to “just add `enumNames`.”

The product intent is the opposite: FormFrame ships low-level foundations; consumers invent capabilities on top.

## Decision

**FormFrame does not ship consumer constructs.** No `enumNames`, `l10nTitle`, `preloadFromApi`, JSFSelect, PhoneWidget, or `ui:layout` compiler. Consumers add those themselves with **host recipes**: **platform defaults**, **form intercept**, **source transforms**, payload mapping.

**FormFrame grows a generic surface only when a host recipe is too hacky** — an **IOC seam**. Early in adoption the bar is low: if a *common* need does not look canonically correct, that is too hacky. The bar rises later for lesser customizations. The consumer still owns the capability; the library still does not learn the construct.

A **library gap** is only when the promised foundations are missing or broken (the consumer cannot build on top). An ignored RJSF keyword is not a library gap.

## Consequences

- Known-shape i18n is `title: msg(...)` + `jsonSchemaToTree`, or a message key translated in **platform defaults** — not a FormFrame `l10nTitle`.
- Labeled enums the consumer owns become `oneOf`+`const`+`title`, or a **source transform** from `enumNames`. FormFrame never compiles `enumNames`.
- Fetched options are a host `select` control (e.g. SmartSelect in **platform defaults**). Pin the widget; do not compile `preloadFromApi`.
- Custom `field.root` (Chakra `FormControl`) must compose the same a11y/error pieces the shipped root uses — exporting those pieces is an IOC seam, not a Chakra adapter. Shipped as `useFieldRootSlots` plus the three primitives the native root is built from: `useInjectedFieldErrors`, `enrichControlErrorA11y`, `FieldErrorsList` (#163).
- **A custom `field.root` owns its own a11y.** `useFieldRootSlots` resolves `parts.*` overlays and stops there — it deliberately does not wire `aria-invalid` / `aria-describedby` / the error list, because the host control that motivates a custom root (Chakra `FormControl`, an RHF wrapper) already emits those and would fight ours. Baking them in would make the seam a Chakra adapter by another name. A root that wants FormFrame's a11y composes the three primitives, which is exactly what `nativeDefaults.field.root` does.

**Relates to:** ADR 007, 008, 024, 029 §5, 049, 051. Glossary: `CONTEXT.md` (failure disposition, library gap, IOC seam, host recipe, platform defaults, form intercept, source transform).
