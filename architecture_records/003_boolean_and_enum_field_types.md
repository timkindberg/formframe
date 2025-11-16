# ADR 003: Boolean and Enum Field Type Support

**Date:** 2025-11-16  
**Status:** Accepted  
**Deciders:** Core team

## Context

The initial implementation supported basic field types (string, number, integer). To build a complete form library, we needed to add support for:
1. Boolean fields (checkboxes for yes/no, true/false values)
2. Enum fields (dropdowns/select elements for constrained value sets)

These are fundamental field types that appear in nearly every form application.

## Decision

### Boolean Field Support

**JSON Schema:**
```json
{
  "type": "boolean",
  "title": "Subscribe to newsletter",
  "description": "Receive updates via email"
}
```

**Implementation:**
- **Widget**: `'input'` (same as other input types)
- **Input Attrs**: `{ type: 'checkbox', ... }`
- **Validation**: Works with `required` attribute (checkbox must be checked)

**Key decisions:**
1. Use native HTML checkbox (`type="checkbox"`)
2. Reuse existing `input` widget type rather than creating `'checkbox'` widget
3. Checkbox-specific rendering handled in UI layer (input before label for better UX)

### Enum Field Support

**JSON Schema (simple enum):**
```json
{
  "type": "string",
  "enum": ["small", "medium", "large"]
}
```

**JSON Schema (oneOf with custom labels):**
```json
{
  "oneOf": [
    { "const": "sm", "title": "Small (S)" },
    { "const": "md", "title": "Medium (M)" },
    { "const": "lg", "title": "Large (L)" }
  ]
}
```

**Implementation:**
- **Widget**: `'select'` (distinct from `'input'`)
- **Parts**: New `select` part with `attrs` and `options`
- **Options**: Array of `{ value, label }` objects
- **enum**: Simple values where value = label
- **oneOf + const + title**: Standard JSON Schema pattern for custom labels

**Key decisions:**

1. **Separate widget type**: Enum fields get `widget: 'select'` instead of `'input'`
   - Rationale: Select elements have fundamentally different rendering from inputs

2. **Support standard oneOf + const + title pattern**:
   ```typescript
   // Simple enum: value = label
   enum: ['small', 'medium', 'large']
   → [{ value: 'small', label: 'small' }, ...]
   
   // oneOf with custom labels
   oneOf: [{ const: 'sm', title: 'Small' }, ...]
   → [{ value: 'sm', label: 'Small' }, ...]
   ```
   - Rationale: Uses standard JSON Schema, not proprietary extensions
   - `title` fallback to `const` if not provided
   - More flexible than enumNames (can add descriptions, metadata later)

3. **Empty enum = input widget**:
   ```typescript
   const hasEnum = Array.isArray(schema.enum) && schema.enum.length > 0
   const hasOneOf = Array.isArray(schema.oneOf) && schema.oneOf.length > 0
   const hasSelect = hasEnum || hasOneOf
   const widget = hasSelect ? 'select' : 'input'
   ```
   - Rationale: Invalid schema should gracefully degrade

4. **Exclusive widget parts**: Only the relevant part is included
   - Select widgets have `parts.select`, NOT `parts.input`
   - Input widgets have `parts.input`, NOT `parts.select`
   - Rationale: Cleaner API, no unused data, makes widget type immediately clear from parts structure

5. **Reject enumNames extension**: Use standard `oneOf` + `const` + `title` instead
   - Rationale: Non-standard extension, better to use official JSON Schema patterns
   - oneOf is more powerful (can add type constraints, descriptions, etc.)
   - Better for schema validation tools and editors

## Structure

### Boolean Field Node

```typescript
{
  widget: 'input',
  validation: { required: true },
  parts: {
    label: {
      text: 'Accept Terms',
      attrs: { for: 'terms' },
      showRequired: true
    },
    input: {
      attrs: {
        id: 'terms',
        name: 'terms',
        type: 'checkbox',
        required: true
      }
    }
  }
}
```

### Enum Field Node

```typescript
{
  widget: 'select',
  validation: { required: false },
  parts: {
    label: { ... },
    select: {
      attrs: {
        id: 'size',
        name: 'size',
        required: false
      },
      options: [
        { value: 'sm', label: 'Small' },
        { value: 'md', label: 'Medium' },
        { value: 'lg', label: 'Large' }
      ]
    }
  }
}
```

## Rendering Patterns

### Boolean Fields (Checkboxes)

```typescript
// Checkbox-specific layout: input before label
if (node.parts.input.attrs.type === 'checkbox') {
  return (
    <div>
      <input {...node.parts.input.attrs} />
      <label {...node.parts.label.attrs}>
        {node.parts.label.text}
      </label>
    </div>
  )
}
```

**Rationale:** Checkboxes conventionally appear before their labels for better clickability.

### Enum Fields (Select)

```typescript
if (node.widget === 'select' && node.parts.select) {
  return (
    <div>
      <label {...node.parts.label.attrs}>
        {node.parts.label.text}
      </label>
      <select {...node.parts.select.attrs}>
        <option value="">-- Select --</option>
        {node.parts.select.options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
```

## Test Coverage

### Boolean Fields (6 tests)
- ✅ Basic parsing with title and description
- ✅ Required boolean fields
- ✅ Mixed field types (string, number, boolean together)
- ✅ Parts API structure
- ✅ Nested boolean fields in objects
- ✅ Checkbox type generation

### Enum Fields (12 tests)
- ✅ String enum values
- ✅ Number enum values  
- ✅ Custom labels via oneOf + const + title
- ✅ oneOf without title (falls back to const value)
- ✅ Required enum fields
- ✅ Mixed field types with enums
- ✅ Nested oneOf fields
- ✅ Parts API with select structure
- ✅ Empty enum graceful degradation
- ✅ Select options array generation
- ✅ Select widgets do not have input part
- ✅ Input widgets do not have select part

**Total: 57 tests passing** (45 original + 12 new)

## Examples Created

1. **App_05_Boolean.tsx** - Comprehensive boolean field showcase
   - Newsletter subscriptions
   - Required terms acceptance
   - Nested preference groups
   - Checkbox-specific styling

2. **Updated existing examples** - All 4 apps updated with boolean and enum fields

## Consequences

### Positive

1. **Feature parity**: Now supports most common form field types
2. **Consistent API**: New types fit naturally into existing structure
3. **Extensible**: Pattern established for adding more field types
4. **Type-safe**: Full TypeScript support for options array

### Negative

1. **Complexity**: More conditional logic in rendering (widget-based branching)
2. **Two parts for select**: Both `input` and `select` parts present (minor overhead)

### Neutral

1. **enumNames extension**: Non-standard but widely adopted
2. **Widget as discriminator**: Need to check `widget` type in render logic

## Future Considerations

### Radio Buttons for Enums

**Considered:** Using radio buttons instead of select for small enum sets
```json
{
  "type": "string",
  "enum": ["yes", "no"],
  "ui:widget": "radio"  // Future UISchema support
}
```

**Decision:** Deferred to UISchema layer (ADR 001)
- Rationale: Default to select, allow override via UISchema

### Multi-Select for Array + Enum

```json
{
  "type": "array",
  "items": {
    "type": "string",
    "enum": ["red", "green", "blue"]
  }
}
```

**Decision:** Deferred to array field support
- Tracked in issue: `jsonschema-form-1js`

### Const Fields

```json
{
  "const": "fixed-value"
}
```

**Decision:** Not yet implemented
- Simple to add when needed (hidden input or readonly display)

## Related Standards

- **JSON Schema Draft-07**: Both `enum` and `oneOf` + `const` are standard
- **JSON Schema 2020-12**: Recommends `oneOf` + `const` + `title` for labeled options
- **React JSON Schema Form (rjsf)**: Supports both `enumNames` (legacy) and `oneOf`
- **AJV**: Full support for `oneOf` validation

## Why oneOf + const + title over enumNames?

### enumNames (Rejected)
```json
{
  "type": "string",
  "enum": ["sm", "md", "lg"],
  "enumNames": ["Small", "Medium", "Large"]  ❌ non-standard
}
```

**Problems:**
- Not part of JSON Schema spec
- Two parallel arrays (easy to get out of sync)
- No way to add per-option metadata
- Breaks schema validation tools
- No type checking on enum values vs names

### oneOf + const + title (Accepted)
```json
{
  "oneOf": [
    { "const": "sm", "title": "Small" },      ✅ standard
    { "const": "md", "title": "Medium" },
    { "const": "lg", "title": "Large" }
  ]
}
```

**Benefits:**
- Standard JSON Schema (works with all validators)
- Self-documenting (value + label together)
- Can add `description`, `deprecated`, etc. per option
- Type-safe (each const is validated)
- Works with schema editors and documentation generators

## Notes

### Why Not Radio Buttons by Default?

Radio buttons for small enums would be more user-friendly for 2-4 options, but:
1. No clear threshold for when to switch (3 items? 5 items?)
2. Different styling/layout requirements
3. Better handled as UISchema override
4. Maintains simplicity in core

### FormData Caveat

**Unchecked checkboxes** don't appear in FormData. This is standard HTML behavior, but worth noting for form state management:

```typescript
const formData = new FormData(form)
// If checkbox is unchecked, it simply won't be in formData
// State management layer should handle this
```

## Decisions Revisited

### Original Decision: Support enumNames
Initially implemented support for `enumNames` extension as it's common in form libraries.

### Revised Decision: Use oneOf + const + title
After implementation, decided to use standard JSON Schema `oneOf` pattern instead:
- More standards-compliant
- Better for validation and tooling
- More extensible for future features
- Self-documenting schemas

**Migration:**
```json
// Before (enumNames - rejected)
{ "enum": ["a", "b"], "enumNames": ["A", "B"] }

// After (oneOf - accepted)
{ "oneOf": [
  { "const": "a", "title": "A" },
  { "const": "b", "title": "B" }
]}
```

