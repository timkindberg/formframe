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
type NodeType = 'group' | 'field'
```

**Field Node** (leaf): Represents a single form input
- Contains: path, widget type, required flag, HTML attrs, label, description, schema reference
- Example: An email input, a number field, a text area

**Group Node** (branch): Represents a nested object or the root form
- Contains: path, label, description, required flag, children
- Can contain fields or other groups
- Has query methods: `getField(path)`, `getAllFields()`, `toJSON()`
- Example: An "address" object with street/city fields, or the root form (path: '')
- Rationale: Objects in JSON Schema can have their own metadata (label, description, required status), so they deserve their own node type

**Root is just a GroupNode** with `path: ''`. There is no special "RootNode" type. This unification:
- Simplifies the API (fewer types to learn)
- Makes groups composable (any group can be treated as a mini-form)
- Enables consistent querying at any level

### Tree Traversal Patterns

Users can work with the tree in multiple ways:

```typescript
// Pattern 1: Direct children access
form.children.forEach(node => {
  if (node.nodeType === 'group') {
    // Render a fieldset
    node.children.forEach(field => {
      // Render inputs
    })
  }
})

// Pattern 2: Query by relative path
form.getField('name') // => Field at root level
form.getField('address.street') // => Nested field

// Pattern 3: Query from any group (RELATIVE paths)
const addressGroup = form.children.find(n => n.path === 'address')
addressGroup.getField('street') // => Finds 'address.street'
addressGroup.getField('city') // => Finds 'address.city'

// Pattern 4: Flatten to all fields
form.getAllFields() // => Array of all leaf fields
addressGroup.getAllFields() // => Only descendants of this group
```

**Key: Queries are relative to the calling group.** This enables composability - groups can be passed around without needing to know their parent path.

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

**Why not:** Nobody would actually use this in practice. It felt like unnecessary indirection. We'll jump straight to framework layers (React, etc.). Someone should be able to build a vanilla layer if needed though.

### ❌ Stateful Core
We considered having Core manage form values:
```typescript
core.setValue('name', 'Tim')
core.getValue('name')
```

**Why not:** Different form libraries want to manage state differently. Core staying stateless gives maximum flexibility and doesn't compete with existing form state solutions. We may have state, but not sure yet.

### ❌ Baked-in Validation
We considered tightly coupling validation to Core or framework layers.

**Why not:** Validation libraries (AJV, etc.) are framework-agnostic. They should be side-loaded plugins that work at any layer, not forced into our architecture. AJV is a large lib and there might be lighter alternatives.

### ❌ Boolean Schemas (the schema itself is `true`/`false`)
JSON Schema allows schemas to be boolean values: `true` (accept anything) or `false` (reject everything).

**Why not:** Edge case with unclear UI implications. What would we render?
- `true` → Maybe a free-form JSON editor?
- `false` → Nothing? Disabled form?

We throw an error for these currently. Can revisit if there's a real use case.

**Note:** We DO support `type: 'boolean'` for checkbox fields. That's different from the schema itself being a boolean.

## Type System Decisions

### JSON Schema Types
We use **`json-schema-typed`** (draft-07):
- Battle-tested: 120M+ downloads
- Supports modern JSON Schema drafts
- No security vulnerabilities
- Stable (type definitions don't need constant updates)
- Can swap later if needed (it's just types)

**Alternative considered:** `@types/json-schema` (more conservative, only draft-07)
**Risk**: We are coupling to an external type lib, but its types for a stable spec so risk is low.

### Export Strategy
Core re-exports the JSONSchema type:
```typescript
export type { JSONSchema } from 'json-schema-typed/draft-07'
```

This allows consumers to import from our package without knowing our internal dependencies.

### Type Challenges

**Problem:** `json-schema-typed` defines `JSONSchema` as potentially `boolean` (for `true`/`false` schemas in draft-07). This causes TypeScript errors when accessing properties like `type`, `properties`, etc.

**Solution:** Created a helper type `JSONSchemaObject`:
```typescript
type JSONSchemaObject = Exclude<JSONSchema, boolean>
```

Used in function signatures where we know we have an object schema, not a boolean. We throw an error for boolean schemas (edge case we don't support yet).

### Naming Decisions

**Field labels:** We use `label` instead of `title` in our node types, even though JSON Schema uses `title`. 

**Rationale:** 
- "Label" is clearer for form field labels
- Avoids confusion with document/page titles
- Maps directly to `<label>` elements
- We still extract from `schema.title`, just rename in our API

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

## Open Questions

These are things we're still figuring out:

1. **Widget configuration:** How do users customize widget mapping? Global registry? Per-form config?

2. **UISchema:** RJSF has `uiSchema` for UI hints. Do we want this? Where does it fit?

3. **Array handling:** How do we represent array fields? Special node type? Repeatable groups?

4. **Enum/Select:** Do these get a special widget type or are they just `input` with attrs?

5. **Form library integration:** What's the exact handoff between Core structure and React Hook Form (or others)?

## Implementation Status

### ✅ Completed: Core Layer MVP

**What we built:**
- ✅ `parseSchema()` function (178 lines)
- ✅ Basic field types (string, number with constraints)
- ✅ Nested objects as GroupNodes
- ✅ Tree traversal methods (getField, getAllFields with relative paths)
- ✅ HTML attribute generation (type, min, max, pattern, required, etc.)
- ✅ 25 comprehensive unit tests (all passing)
- ✅ Vitest setup for testing
- ✅ Working example app demonstrating tree walking and rendering

**Key Features:**
- Field nodes with widget type and computed HTML attrs
- Group nodes for nested objects with composable queries
- Root is GroupNode with empty path (unified API)
- Relative path queries for composability
- JSON serialization without circular references

### Next Steps

**Immediate priorities:**
- More field types (boolean, enum/select, textarea, date)
- Array support (repeating fields)
- UISchema support for customization hints

**Future exploration:**
- React layer API design (hooks-based, TanStack-style)
- React Hook Form integration
- UI library layer patterns (Tailwind, Shadcn, etc.)
- Validation library integration (AJV, Zod, Valibot)
- Schema resolution ($ref, allOf, anyOf, oneOf)

---

**Last Updated:** 2025-11-15  
**Contributors:** Tim Kindberg

