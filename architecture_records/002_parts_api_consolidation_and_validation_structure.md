# ADR 002: Parts API Consolidation and Validation Structure

**Date:** 2025-11-16  
**Status:** Accepted  
**Deciders:** Core team

## Context

After implementing basic field types (string, number, boolean, enum/select), we identified significant API sprawl and duplication in the node structure. The same information was accessible through multiple paths, creating confusion about which property to use and making the API harder to learn and maintain.

### Problems Identified

1. **Duplication**: Same data accessible through multiple properties
   - `node.label` vs `node.parts.label.text`
   - `node.description` vs `node.parts.description?.text`
   - `node.displayLabel` vs computed label in parts
   - `node.key` vs `node.parts.container.key`
   - `node.required` scattered across node and attrs

2. **Inconsistent attribute handling**:
   - `input.id` and `input.name` were separate from `input.attrs`
   - `label.for` was separate from other HTML attributes
   - Required spreading both individual properties AND attrs object

3. **Validation inconsistency**:
   - `node.required` was on the node
   - Other validation (min, max, minLength, pattern) only in attrs
   - No single source of truth for validation rules

4. **Framework-coupling concerns**:
   - Initially attempted to use `React.InputHTMLAttributes<HTMLInputElement>`
   - Core package should be framework-agnostic

## Decision

### 1. Single Source of Truth: Parts API

**Removed duplicated properties entirely:**
- ❌ Remove `node.label` → use `node.parts.label.text`
- ❌ Remove `node.description` → use `node.parts.description?.text`
- ❌ Remove `node.displayLabel` → logic baked into `node.parts.label.text`
- ❌ Remove `node.key` → use `node.parts.container.key`

**Rationale:** Having one clear way to access data reduces cognitive load and prevents bugs from accessing stale or inconsistent data.

### 2. Consolidate All HTML Attributes in `attrs` Objects

**Before:**
```typescript
input: {
  id: string
  name: string
  attrs: { type, required, min, ... }
}
label: {
  text: string
  for: string
  showRequired: boolean
}
```

**After:**
```typescript
input: {
  attrs: { id, name, type, required, min, ... }
}
label: {
  text: string
  attrs: { for: string }
  showRequired: boolean  // metadata, not an HTML attr
}
```

**Rationale:** 
- All HTML attributes can be spread directly: `<input {...node.parts.input.attrs} />`
- Clear separation between HTML attributes and metadata (like `showRequired`)
- Consistent pattern across all parts

### 3. Unified Validation Object

**Moved all validation rules to `node.validation`:**

```typescript
// FieldNode
validation: {
  required: boolean
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  pattern?: string
}

// GroupNode
validation: {
  required: boolean
}
```

**Rationale:**
- Single source of truth for all validation rules
- Easy to query validation state: `if (node.validation.required) ...`
- Validation rules separate from rendering attributes
- Prepares for future validation layer integration (AJV, Zod, etc.)

### 4. Framework-Agnostic TypeScript Types

**Decision:** Use explicit typed properties instead of framework-specific types.

**Rejected approach:**
```typescript
// ❌ Couples core to React
attrs: React.InputHTMLAttributes<HTMLInputElement>
```

**Accepted approach:**
```typescript
// ✅ Framework-agnostic, explicit types
attrs: {
  id: string
  name: string
  type?: string
  required?: boolean
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
}
```

**Rationale:**
- Core package must remain framework-agnostic
- Explicit types are self-documenting
- Can be used with React, Vue, Svelte, or vanilla JS
- TypeScript's DOM types (HTMLInputElement) are element properties, not attributes

## Implementation Details

### Field Type Support

We implemented support for multiple field types during this refactor:

1. **Boolean fields** → `type="checkbox"`
   - Widget: `'input'`
   - Attrs: `{ type: 'checkbox', ... }`

2. **Enum fields** → `<select>` with options
   - Widget: `'select'`
   - Parts: `select` part with `attrs` and `options` array
   - Support for both `enum` and `oneOf` with `const` + `title` pattern

### Parts Structure

```typescript
// FieldNode.parts
{
  container: { key: string }
  label: {
    text: string              // includes fallback logic
    attrs: { for: string }
    showRequired: boolean     // UI hint, not an HTML attr
  }
  description?: { text: string }
  
  // Exclusive: only one of input or select is present based on widget type
  input?: {                   // For input widgets only
    attrs: {                  // All HTML attributes
      id: string
      name: string
      type?: string
      required?: boolean
      // ... validation attrs
    }
  }
  select?: {                  // For select widgets only
    attrs: {
      id: string
      name: string
      required?: boolean
    }
    options: Array<{ value: string | number; label: string }>
  }
}
```

## Consequences

### Positive

1. **Single source of truth**: No confusion about which property to use
2. **Simpler rendering**: Just spread `attrs` objects directly
3. **Better TypeScript**: Explicit types with better autocomplete
4. **Framework-agnostic**: Can use with any UI framework
5. **Validation clarity**: All validation rules in one place
6. **Future-proof**: Easy to extend with new field types and attributes
7. **Testing**: Clearer test expectations with consistent structure
8. **Exclusive widget parts**: Each node only contains the parts it needs (input XOR select), reducing memory and making widget type immediately clear from structure

### Negative

1. **Breaking change**: All existing code must update to new API
2. **More verbose paths**: `node.parts.label.text` vs `node.label`
3. **Migration effort**: Need to update all examples and documentation

### Neutral

1. **Learning curve**: Developers must learn the parts API pattern
2. **Bundle size**: Slightly larger type definitions (negligible)

## Migration Guide

### For Field Access

```typescript
// Before
node.label                 // ❌
node.description           // ❌
node.required              // ❌
node.attrs.type            // ❌
node.key                   // ❌

// After
node.parts.label.text      // ✅
node.parts.description?.text  // ✅
node.validation.required   // ✅
node.parts.input.attrs.type   // ✅
node.parts.container.key   // ✅
```

### For Rendering

```typescript
// Before
<label htmlFor={node.path}>
  {node.label}
</label>
<input id={node.path} name={node.path} {...node.attrs} />

// After
<label {...node.parts.label.attrs}>
  {node.parts.label.text}
</label>
<input {...node.parts.input.attrs} />

// Or with destructuring
const { label, input } = node.parts
<label {...label.attrs}>{label.text}</label>
<input {...input.attrs} />
```

### For Select/Enum Fields

```typescript
// After
const { label, select } = node.parts
if (select) {
  return (
    <>
      <label {...label.attrs}>{label.text}</label>
      <select {...select.attrs}>
        <option value="">-- Select --</option>
        {select.options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </>
  )
}
```

## Testing

- All 54 core tests updated and passing
- Tests now validate the consolidated structure
- Type checking enforces correct usage

## Related Decisions

- **ADR 001**: Core layer tree structure (established parts API pattern)
- **Future**: Validation layer integration will extend `node.validation`
- **Future**: UISchema support may extend parts with custom hints

## Notes

### Decisions Made Against

1. **Using React types in core** - Would couple core package to React
2. **Using TypeScript's `Pick<HTMLInputElement, ...>`** - Element properties ≠ HTML attributes
3. **Keeping backward compatibility** - Clean break better than maintaining dual APIs
4. **Separate attrs and id/name** - Inconsistent pattern, harder to spread

### Field Types Implemented

- ✅ String fields (text, email)
- ✅ Number fields (number, integer)
- ✅ Boolean fields (checkbox)
- ✅ Enum fields (select with options)
- 🔲 Array fields (repeating items) - planned
- 🔲 Date fields - planned
- 🔲 Textarea widget - planned

### Key Insights

1. **Consistency is worth breaking changes early**: Better to refactor now before v1.0.0
2. **Framework-agnostic is achievable**: TypeScript provides enough typing without framework dependencies
3. **The parts API pattern scales**: Adding new field types fits naturally into the structure
4. **Validation as first-class concept**: Separating validation from attrs was the right call

