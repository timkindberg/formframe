# ADR 005: Handler Inheritance via Parameters

**Date:** 2025-11-17  
**Status:** Accepted  
**Deciders:** Core team

## Context

After implementing the root handler in ADR 004, we encountered complexity around handler passing and recursion. The walk API had several issues:

### Problems Identified

1. **Manual handler passing was error-prone:**
   ```tsx
   // Templates had to manually pass handlers
   const handlers = {
     group: (node) => (
       <DefaultGroupTemplate node={node}>
         {node.walk(handlers)}  // Had to explicitly pass handlers!
       </DefaultGroupTemplate>
     )
   }
   ```

2. **Root handler caused infinite recursion:**
   - When root handler called `node.walk(handlers)` including itself
   - Required complex logic to strip root handler before walking children
   - Split handlers into `childHandlers` and `handlers` objects

3. **Handler inheritance was internal only:**
   - `walkNode` had `inheritedHandlers` parameter for internal use
   - But `node.walk()` public API didn't expose this
   - So handlers couldn't be automatically inherited across public walk calls

4. **Templates knew about walking logic:**
   - Templates received `handlers` prop and called `node.walk(handlers)`
   - Mixed concerns: presentation + traversal logic
   - Not truly presentational components

### Example of the Problem

```tsx
// Before - messy and complex
const childHandlers = {
  field: (node) => <DefaultFieldTemplate node={node} />,
  group: (node) => (
    <DefaultGroupTemplate node={node}>
      {node.walk(childHandlers)}  // Have to pass childHandlers
    </DefaultGroupTemplate>
  ),
}

const handlers = {
  root: (node) => (
    <DefaultRootTemplate node={node} onSubmit={onSubmit}>
      {node.walk(childHandlers)}  // Can't use handlers (would recurse)
    </DefaultRootTemplate>
  ),
  ...childHandlers,  // Duplicate handlers
}
```

## Decision

### 1. Pass Handlers to Handler Functions

**Update the WalkHandlers interface to pass handlers as a second parameter:**

```typescript
export interface WalkHandlers<R> {
  field?: (node: FieldNode, handlers: WalkHandlers<R>) => R
  group?: (node: GroupNode, handlers: WalkHandlers<R>) => R
}
```

**Update walkNode to pass effectiveHandlers to each handler:**

```typescript
for (const child of node.children) {
  if (child.nodeType === 'field' && effectiveHandlers.field) {
    const result = effectiveHandlers.field(child, effectiveHandlers)
    results.push(result)
  } else if (child.nodeType === 'group' && effectiveHandlers.group) {
    const result = effectiveHandlers.group(child, effectiveHandlers)
    results.push(result)
  }
}
```

### 2. Remove Root Handler from Core

The root handler was adding complexity without sufficient benefit. Instead:
- React layer wraps the walked children in `DefaultRootTemplate`
- Root is just the form wrapper - doesn't need special walk handling
- Simpler mental model: walk returns children, wrap them in root component

### 3. Templates Are Pure Presentational Components

**Before:**
```tsx
// Template had to know about walking
export function DefaultGroupTemplate({ node, handlers }) {
  return (
    <fieldset>
      {node.walk(handlers)}  // Walking logic in template
    </fieldset>
  )
}
```

**After:**
```tsx
// Template just presents
export function DefaultGroupTemplate({ node, children }) {
  return (
    <fieldset>
      {children}  // Just receives rendered children
    </fieldset>
  )
}
```

### 4. Handlers Do All the Walking

**Handlers receive handlers as parameter and use them:**

```tsx
const handlers: WalkHandlers<JSX.Element> = {
  field: (node) => <DefaultFieldTemplate node={node} />,
  group: (node, handlers) => (  // handlers auto-provided!
    <DefaultGroupTemplate node={node}>
      {node.walk(handlers)}  // Just pass them through
    </DefaultGroupTemplate>
  ),
}

const children = form.walk(handlers)

// Wrap in root template
return (
  <DefaultRootTemplate onSubmit={onSubmit}>
    {children}
  </DefaultRootTemplate>
)
```

## Consequences

### Positive

1. **Automatic handler inheritance:**
   - Handlers receive `handlers` parameter automatically from core
   - No need to manually track or pass handlers
   - Can't forget to pass them (compile error if missing)

2. **No recursion issues:**
   - Root handler removed from core
   - Group handlers just pass through the handlers they receive
   - Clear, linear flow

3. **Clean separation of concerns:**
   - Templates are pure presentational components
   - Handlers contain walking logic
   - Clear boundary between data/traversal and presentation

4. **Type-safe:**
   - TypeScript enforces handler signatures
   - Can't call `node.walk()` without passing handlers
   - Compiler helps prevent mistakes

5. **Simpler mental model:**
   - "Handlers walk and receive handlers to continue walking"
   - Templates receive already-walked children
   - Easy to understand and explain

### Negative

1. **Breaking change:**
   - All existing walk handlers need updating to accept second parameter
   - Examples need updating
   - Users need to update their code

2. **Slightly more verbose:**
   - Handler functions now have two parameters instead of one
   - But this makes the inheritance explicit and clear

3. **Handler parameter unused in field handlers:**
   - Field handlers receive `handlers` but don't use it (leaf nodes)
   - Could use different interface for field vs group
   - Decided consistency is more valuable than perfect minimalism

### Neutral

1. **Component naming:**
   - Renamed `Default*` to `*Template` for consistency
   - Makes it clear these are templates for rendering
   - Not strictly related to handler inheritance but done at same time

## Implementation Notes

### Core Package Changes
- `packages/core/src/types.ts`: Updated `WalkHandlers` interface
- `packages/core/src/parser/utils.ts`: Updated `walkNode` to pass handlers
- `packages/core/test/parser.test.ts`: Removed root handler tests (56 passing)

### React Package Changes
- `packages/react/src/useSchemaForm.tsx`: Simplified using new handler signature
- `packages/react/src/DefaultFieldTemplate.tsx`: Renamed from DefaultField
- `packages/react/src/DefaultGroupTemplate.tsx`: Renamed, receives children prop
- `packages/react/src/DefaultRootTemplate.tsx`: Renamed, receives children prop

### Example Changes
- `App_05_React+DefaultComponents.tsx`: Updated to not use root handler
- `App_06_React+UseSchemaForm.tsx`: Simplified form creation

## Alternatives Considered

### Alternative 1: Keep Root Handler, Fix Recursion Differently
**Rejected because:**
- Root handler adds complexity without sufficient benefit
- Recursion prevention requires splitting handlers into multiple objects
- React layer can easily wrap result in root template

### Alternative 2: Make walk() Accept Optional Handlers
```typescript
walk<R>(handlers?: WalkHandlers<R>): R[]
```
If no handlers provided, use "current" handlers somehow.

**Rejected because:**
- Requires tracking "current" handlers in mutable state
- Not clear where this state would live
- Makes walk() stateful and harder to reason about

### Alternative 3: Bind Handlers to Child Nodes
Inside walkNode, temporarily override each child's walk method to capture handlers.

**Rejected because:**
- Modifies node objects (side effects)
- Complex implementation
- Hard to debug
- Violates functional programming principles

### Alternative 4: Different Signatures for Field vs Group
```typescript
interface WalkHandlers<R> {
  field?: (node: FieldNode) => R  // No handlers param (leaf)
  group?: (node: GroupNode, handlers: WalkHandlers<R>) => R
}
```

**Rejected because:**
- Inconsistent API is harder to learn
- Doesn't save much (field handlers just ignore parameter)
- Consistency more valuable than marginal optimization

## Future Considerations

1. **Higher-order handler utilities:**
   - Could provide helpers like `withLogger(handlers)` that wrap handlers
   - Handlers parameter makes composition easier
   - Open door for middleware-style patterns

2. **Lazy evaluation:**
   - Could defer walking until handlers call `node.walk(handlers)`
   - Enables conditional rendering of branches
   - Performance optimization for large forms

3. **Custom walking strategies:**
   - Users could intercept and modify handlers before passing down
   - Enable advanced use cases like form section isolation
   - Handlers parameter makes this possible

4. **Handler context:**
   - Could extend to pass additional context alongside handlers
   - E.g., `(node, handlers, context)` for form-level state
   - Handlers parameter establishes the pattern

## Migration Guide

**For existing code using walk:**

```typescript
// Before
form.walk({
  field: (node) => <Field node={node} />,
  group: (node) => <Group>{node.walk()}</Group>,  // ERROR: no handlers!
})

// After
form.walk({
  field: (node, handlers) => <Field node={node} />,
  group: (node, handlers) => <Group>{node.walk(handlers)}</Group>,
})
```

**For templates that were calling walk:**

```typescript
// Before - template did walking
function MyGroupTemplate({ node }) {
  return <fieldset>{node.walk(/* handlers? */)}</fieldset>
}

// After - template receives children
function MyGroupTemplate({ node, children }) {
  return <fieldset>{children}</fieldset>
}

// Handler does walking
const handlers = {
  group: (node, handlers) => (
    <MyGroupTemplate node={node}>
      {node.walk(handlers)}
    </MyGroupTemplate>
  )
}
```

## References

- Previous ADR: 004 (Root Handler) - this ADR supersedes the root handler decision
- Core walk implementation: `packages/core/src/parser/utils.ts`
- React integration: `packages/react/src/useSchemaForm.tsx`

---

**Last Updated:** 2025-11-17  
**Contributors:** Tim Kindberg

