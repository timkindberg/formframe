# ADR 004: Root Handler in Walk API and React Default Components

**Date:** 2025-11-17  
**Status:** Superseded by ADR 005 (root handler removed, handler inheritance improved)  
**Deciders:** Core team

> **Note:** The root handler portion of this ADR was superseded by ADR 005. The root handler caused recursion complexity and was removed. The React default components portion remains valid.

## Context

While building example applications using the walk API, we identified an awkward pattern: the root node (the form itself) was being treated the same as nested groups (fieldsets), requiring manual form wrapper handling outside the walk API.

### Problems Identified

1. **Inconsistent root handling**: The root node (`path: ''`) is semantically different from nested groups
   - Root needs a `<form>` wrapper, submit button, form-level handlers
   - Groups need `<fieldset>` wrappers with legends
   - The `DefaultGroupTemplate` component had special `if (node.isRoot)` logic

2. **Manual form wrapper boilerplate**:
   ```tsx
   // User had to manually wrap
   <form onSubmit={handleSubmit}>
     {form.walk({ field: ..., group: ... })}
     <button type="submit">Submit</button>
   </form>
   ```

3. **Lack of React component foundation**: Examples were manually implementing rendering logic with 68+ lines of code that should be extracted into reusable components

4. **No clear path to higher-level APIs**: To build the planned IoC/composition API (from scratch files), we needed a solid foundation of default components

## Decision

### 1. Add `root` Handler to Core Walk API

**Added root handler to `WalkHandlers<R>` type:**
```typescript
export interface WalkHandlers<R> {
  root?: (node: GroupNode) => R
  field?: (node: FieldNode) => R
  group?: (node: GroupNode) => R
}
```

**Updated `walkNode()` to intercept root:**
- When `node.isRoot && root handler exists`, call root handler and return immediately
- Root handler receives the root `GroupNode` and can call `node.walk(handlers)` to render children
- Must pass handlers without root to avoid infinite recursion
- Falls back to normal traversal if no root handler provided

**Rationale:** 
- Root is semantically distinct from nested groups
- Root handler controls the form wrapper, submit behavior, form-level concerns
- Groups are purely for nested objects (fieldsets)
- Clean separation of concerns

### 2. Create React Default Components

**Created three foundational components in `@jsonschema-form/react`:**

**`DefaultRootTemplate`:**
- Renders `<form>` wrapper
- Accepts `onSubmit` handler
- Includes submit button
- Calls `node.walk()` to render children

**`DefaultFieldTemplate`:**
- Extracted from manual rendering logic in examples
- Uses `node.parts` API for framework-agnostic data
- Handles text inputs, number inputs, checkboxes, selects
- Shows label, required indicator, description
- 50 lines vs 30+ lines of inline rendering

**`DefaultGroupTemplate`:**
- Renders `<fieldset>` with `<legend>` for nested objects
- Removed special root case (now handled by root handler)
- Clean, single-purpose component
- 40 lines vs complex conditional logic

**Integration setup:**
- Created `packages/react/tsconfig.json` with JSX support
- Added React package to monorepo references in root `tsconfig.json`
- Added dependency in example app `package.json`
- Exported all components from `@jsonschema-form/react`

### 3. Updated Example App Pattern

**Before (App_04 - 68+ lines of walk logic):**
```tsx
<form onSubmit={handleSubmit}>
  {form.walk({
    field: (node) => {
      const { container, label, description, input, select } = node.parts
      return (
        <div key={container.key} style={{ marginBottom: '1rem' }}>
          <label htmlFor={label.attrs.for}>
            {label.text}
            {label.showRequired && <span> *</span>}
          </label>
          {/* ... 20+ more lines ... */}
        </div>
      )
    },
    group: (node) => {
      if (node.isRoot) {
        return <div key="root">{node.walk()}</div>
      }
      {/* ... 30+ more lines ... */}
    }
  })}
  <button type="submit">Submit</button>
</form>
```

**After (App_05 - 4 lines):**
```tsx
form.walk({
  root: (node) => <DefaultRootTemplate node={node} onSubmit={handleSubmit} />,
  field: (node) => <DefaultFieldTemplate node={node} />,
  group: (node) => <DefaultGroupTemplate node={node} />,
})
```

### 4. Test Coverage

Added comprehensive tests for root handler behavior:
- Root handler is called when provided and `node.isRoot`
- Normal traversal works without root handler (backward compatible)
- Root handler can call `node.walk(handlers)` to render children
- Properly handles nested groups and fields

## Consequences

### Positive

1. **Cleaner API**: Root handling is explicit and purpose-built
   - No more special-case `if (node.isRoot)` checks in components
   - Clear separation: root = form, group = fieldset
   
2. **Better DX**: Form wrapper is now part of the walk API
   - No manual form tag boilerplate
   - Submit button included by default
   - Can customize at root level

3. **Reusable foundation**: Default components are building blocks
   - Extract 68+ lines of rendering logic into 3 components
   - Users can import and use directly
   - Can override individual components
   - Foundation for higher-level APIs

4. **Backward compatible**: Root handler is optional
   - Existing code without root handler still works
   - Graceful fallback to normal traversal

5. **Sets up IoC pattern**: Foundation for planned composition API
   - `<form.children.name />` style usage
   - `render` prop overrides
   - Progressive disclosure of complexity

### Negative

1. **Additional API surface**: One more handler type to learn
   - Mitigated by clear documentation and examples
   - Makes sense semantically (root is different)

2. **Recursion footgun**: Root handler must not pass itself to `node.walk()`
   - Documented in tests
   - Could add helper utility to prevent this
   - Runtime error is clear if it happens

### Neutral

1. **Component styling**: Default components use inline styles
   - Intentionally simple for examples
   - Users expected to create their own styled versions
   - UI package layers (Tailwind, etc.) will provide styled alternatives

## Implementation Notes

### Core Package Changes
- `packages/core/src/types.ts`: Added `root` to `WalkHandlers`
- `packages/core/src/parser/utils.ts`: Updated `walkNode()` with root interception
- `packages/core/test/parser.test.ts`: Added 3 tests for root handler

### React Package Changes
- Created `packages/react/src/DefaultRootTemplate.tsx`
- Created `packages/react/src/DefaultFieldTemplate.tsx`
- Created `packages/react/src/DefaultGroupTemplate.tsx`
- Updated `packages/react/src/index.ts` with exports
- Created `packages/react/tsconfig.json`

### Example Changes
- Created `examples/basic-react/src/App_05_React+DefaultComponents.tsx`
- Updated `examples/basic-react/src/App.tsx` navigation
- Updated `examples/basic-react/package.json` with React package dependency

### Monorepo Changes
- Updated root `tsconfig.json` with React package reference
- Updated `package-lock.json` after npm install

## Future Considerations

1. **Higher-level composition API**: Later realized as `useFormTree()` (ADR 035)
   - Return `Form` component with `.children` accessor
   - Support `render` prop overrides per field
   - Enable `<Form.children.name />` style JSX

2. **Component customization**: Allow users to provide custom defaults
   - Registry pattern for custom components per field type
   - Theme/styling system
   - Component slot overrides

3. **Form state integration**: Connect to React Hook Form, TanStack Form
   - DefaultRootTemplate can accept `register` functions
   - Hook into form state for values/errors
   - Validation display

4. **UI package layers**: Styled component libraries
   - `@jsonschema-form/ui-tailwind`
   - `@jsonschema-form/ui-shadcn`
   - Styled versions of Default* components

5. **Root handler utilities**: Helper to prevent recursion
   - `createChildHandlers(handlers)` - strips root handler
   - Or auto-detection in `walkNode()`

## Alternatives Considered

### Alternative 1: Keep Root as Group with Special Case
**Rejected because:**
- Mixing concerns (form wrapper vs fieldset)
- Special-case checks in every group component
- Unclear who's responsible for form-level concerns

### Alternative 2: React-only Root Component (No Core Changes)
**Rejected because:**
- Core walk API would still require manual form wrapper
- Inconsistent - some concerns in walk, some outside
- Missed opportunity to make Core API more expressive

### Alternative 3: Separate FormNode Type
**Rejected because:**
- Added complexity for minimal benefit
- Root is still a group of fields semantically
- Would require updating all type guards and traversal code

## References

- Initial exploration: `tmp/scratch.react-jsx-ioc-elements.tsx`
- Example progression: `App_01` → `App_04` → `App_05`
- Related ADR: 002 (Parts API) - Default components use parts API

---

**Last Updated:** 2025-11-17  
**Contributors:** Tim Kindberg

