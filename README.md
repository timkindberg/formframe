# JSON Schema Form Library - Mission Statement

## Project Vision

### The Problem
[React JSON Schema Form (RJSF)](https://github.com/rjsf-team/react-jsonschema-form) is widely used but suffers from architectural issues and tight coupling. The library is difficult to maintain, extend, and customize. Organizations become locked into its decisions around React, validation libraries, UI frameworks, and form management.

### The Goal
Build a modular, tiny, well-architected alternative from scratch that:
- Separates concerns into distinct, composable layers
- Minimizes bundle size through extreme modularity
- Enables any combination of frameworks, validation, forms, and UI libraries
- Provides a clean, intuitive API at every layer
- Impecable TypeScript types throughout

### The Philosophy
This project prioritizes **intentional exploration over speed**. We build through:
- Pseudo-coding that evolves into small MVPs
- Starting with minimal JSON Schema support, expanding gradually
- Making deliberate, taste-driven API decisions at every step
- Pairing with developers who drive architectural choices

## Layered Architecture

The library is structured in five distinct layers, each completely decoupled from the others:

### 1. Core Layer (Headless Foundation)
**Zero dependencies. No framework coupling.**

The Core provides the fundamental logic for interpreting JSON Schema and managing form state:
- Schema traversal and parsing
- Widget/component type registry and mapping rules
- Form state management (values, touched, dirty state)
- Field metadata computation
- Schema resolution (`$ref`, `allOf`, `anyOf`, `oneOf`, conditionals)
- Default value computation
- Dependency tracking
- Abstract event system (onChange, onBlur, etc.)
- Data path utilities for nested access

The Core knows *what* needs to be rendered and *when*, but has no knowledge of React, HTML, or CSS.

### 2. Validation Layer
**Pluggable validation.**

Support for multiple JSON Schema validation libraries:
- AJV (primary target)
- Other validators as plugins
- Custom validation hooks

The validation layer integrates with Core but remains swappable.

### 3. Framework Layer
**JavaScript framework adapters.**

Transforms Core's headless logic into framework-specific implementations:
- **React** (primary target)
- Vue (future)
- Solid (future)
- Svelte (future)

This layer handles framework-specific concerns like component lifecycle, reactivity systems, and rendering.

### 4. Form Library Layer
**Pluggable form management.**

Each framework has multiple form libraries. This layer provides adapters:
- **React Hook Form** (primary target)
- TanStack Form
- Formik
- Framework-specific form libraries for Vue, Solid, etc.

Enables developers to use their preferred form state management solution.

### 5. UI Library Layer
**Styling and components.**

The final layer provides actual rendered components with styling:
- Tailwind CSS
- Shadcn/ui
- Chakra UI
- Material UI
- Radix UI
- Custom component libraries

This is where inputs, labels, buttons, and layout components are defined.

## Development Approach

### Pairing Philosophy
**You are pairing with the developer, not driving.** The developer makes all major API decisions. Your role is to:
- Implement their vision
- Ask clarifying questions
- Suggest alternatives when asked
- Never vomit code without discussion

### Incremental Development
1. **Phase 1: Minimal MVP**
   - Basic string and number inputs
   - Simple validation
   - Prove the architectural concepts work

2. **Phase 2: Medium Scope**
   - Common field types (boolean, enum, dates)
   - Arrays and objects
   - More complex validation rules

3. **Phase 3: Feature Expansion**
   - Advanced schema features
   - Complex UI patterns
   - Performance optimization

### Methodology
- Start with pseudo-code and architectural discussions
- Build small, working MVPs that handle tiny JSON Schema chunks
- Gradually expand supported features
- Test architectural decisions before committing
- Explore RJSF features as needed, but don't be bound by their APIs

## Key Principles

1. **Extreme Modularity**
   - Each layer is a separate package
   - Consumers import only what they need
   - Clear boundaries between concerns

2. **Minimal Bundle Size**
   - Tree-shakeable exports
   - No unnecessary dependencies
   - Every byte counts

3. **Zero Framework Coupling at Core**
   - Core is pure TypeScript/JavaScript
   - No React, Vue, or any framework in Core
   - No DOM manipulation in Core

4. **Pluggable Everything**
   - Validation library: your choice
   - Framework: your choice
   - Form library: your choice
   - UI library: your choice

5. **Monorepo Architecture**
   - Separate packages for each layer
   - Shared tooling and build configuration
   - Easy to develop and test integrations

## Getting Started

This project is in early exploration phase. We're building the foundation thoughtfully, one decision at a time.

### Architecture Records

Detailed design decisions and API explorations are documented in:
- [001: Core Layer, Tree Structure, and State Decisions](./architecture_records/001_core_layer_tree_structure_and_state_decisions.md)

### For AI Assistants
This document represents the complete vision and constraints for the project. When working on this codebase:
- Always refer back to these principles
- Read the architecture records in `./architecture_records/` to understand design decisions
- Never compromise on the layered architecture
- Pair with the developer on API design
- Start small, build incrementally
- Ask before making architectural decisions

### For Contributors
We welcome contributors who share the vision of a modular, well-architected form library. Before contributing:
- Read and understand this mission statement
- Start with small, focused contributions
- Discuss architectural changes before implementing
- Maintain the separation of concerns between layers

---

**Status:** Initial planning and architecture phase

**Primary Author:** Tim Kindberg

**Inspiration:** Lessons learned from React JSON Schema Form and the broader ecosystem

