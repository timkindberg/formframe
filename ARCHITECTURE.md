# Architecture & Design Decisions

This document captures the evolving design decisions, API explorations, and architectural patterns for the JSON Schema Form library.

## Core Design Principles

### Layered Abstraction Philosophy
We follow the **Chakra UI model** of providing different layers of abstraction:
- Each layer has a clean, usable API
- Developers work at the highest layer they can
- Every layer is built with the same APIs we expose
- You can drop down to lower layers when you need more control

### State Management Philosophy
**Core is stateless.** It only interprets schema into structure. State management is handled by:
- Form libraries (React Hook Form, TanStack Form, etc.) at their layer
- Framework layers (React, Vue, etc.) with their reactivity systems

This allows maximum flexibility - users aren't locked into our state management opinions.

### Validation Philosophy
**Validation is side-loaded**, not baked into any particular layer. Validation libraries (AJV, etc.) are:
- Framework-agnostic
- Plugged in at the framework layer or form library layer
- Independent of Core's schema interpretation

## Core Layer API Design

### The Tree Structure

Core's primary job is to parse a JSON Schema and produce a **navigable tree structure**. This tree represents the "shape" of the form.

#### Node Types

```typescript
type NodeType = 'root' | 'group' | 'field'
```

**Field Node** (leaf): Represents a single form input
- Contains: path, widget type, required flag, HTML attrs, schema reference
- Example: An email input, a number field, a text area

**Group Node** (branch): Represents a nested object
- Contains: path, title, description, required flag, children
- Can contain Fields or other Groups
- Example: An "address" object with street/city fields
- Rationale: Objects in JSON Schema can have their own metadata (title, description, required status), so they deserve their own node type

**Root Node**: Top-level container
- Contains: children, query methods
- Provides both tree traversal and flat access patterns

### Tree Traversal Patterns

Users can work with the tree in two ways:

```typescript
// Pattern 1: Tree walking (preserves hierarchy)
form.root.children.forEach(node => {
  if (node.nodeType === 'group') {
    // Render a fieldset
    node.children.forEach(field => {
      // Render inputs
    })
  }
})

// Pattern 2: Flat access (convenience)
form.getAllFields() // => Array of all leaf fields
form.getField('address.street') // => Direct path access
```

### Widget Determination

Core keeps widget types **minimal and unopinionated**:
- Default widget: `'input'`
- Core provides sensible defaults but allows configuration
- Computed `attrs` object contains HTML attributes (type, min, max, etc.)
- Framework and UI layers can override/extend this

**Rationale:** We don't know what UI components users will want. Keep it flexible.

## What We Decided Against

### ❌ High-Level "Kitchen Sink" Components
```typescript
// We DON'T provide this
<JsonSchemaForm schema={schema} onSubmit={handleSubmit} />
```

**Why not:** This is too opinionated. Teams might build this themselves, but it's not our library's job. We provide the building blocks.

### ❌ Vanilla/HTML String Layer
We initially explored a pure HTML string renderer as the first rendering layer:
```typescript
renderToHTML(form, values) // => '<form>...'
```

**Why not:** Nobody would actually use this in practice. It felt like unnecessary indirection. We'll jump straight to framework layers (React, etc.) with an HTMX layer as a future possibility if needed.

### ❌ Stateful Core
We considered having Core manage form values:
```typescript
core.setValue('name', 'Tim')
core.getValue('name')
```

**Why not:** Different form libraries want to manage state differently. Core staying stateless gives maximum flexibility and doesn't compete with existing form state solutions.

### ❌ Baked-in Validation
We considered tightly coupling validation to Core or framework layers.

**Why not:** Validation libraries (AJV, etc.) are framework-agnostic. They should be side-loaded plugins that work at any layer, not forced into our architecture.

## Type System Decisions

### JSON Schema Types
We use **`json-schema-typed`** (draft-07):
- Battle-tested: 120M+ downloads
- Supports modern JSON Schema drafts
- No security vulnerabilities
- Stable (type definitions don't need constant updates)
- Can swap later if needed (it's just types)

**Alternative considered:** `@types/json-schema` (more conservative, only draft-07)

### Export Strategy
Core re-exports the JSONSchema type:
```typescript
export type { JSONSchema } from 'json-schema-typed/draft-07'
```

This allows consumers to import from our package without knowing our internal dependencies.

## Development Approach

### Exploration Over Speed
We're proceeding carefully:
1. Pseudo-code and discussion before implementation
2. Small, incremental changes
3. Type-driven development where it helps thinking
4. No "code vomiting" - every API decision is intentional

### Minimal Viable Features
Start with the absolute minimum:
- Basic field types: string, number
- Simple validation
- Nested objects
- Prove the architecture works

Expand gradually:
- More field types
- Arrays
- Enums/selects
- Complex validation
- Schema resolution ($ref, allOf, etc.)

---

**Last Updated:** 2025-11-16  
**Contributors:** Tim Kindberg

