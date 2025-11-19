# Vitest Browser Mode Test Syntax Reference

Based on vitest 2.1.9 with `@vitest/browser` and `vitest-browser-react`.

## The Complete Pattern

```typescript
// 1. Import the matchers at the top of your test file
import '@vitest/browser/matchers'
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'

// 2. In your test function (must be async)
it('should render', async () => {
  const screen = render(<Component />)
  
  // ✅ Option A: Get element, then assert
  const element = await screen.getByText('Hello')
  await expect.element(element).toBeInTheDocument()
  
  // ✅ Option B: Inline (double await)
  await expect.element(await screen.getByText('Hello')).toBeInTheDocument()
  
  // ✅ For interactions
  const button = await screen.getByRole('button')
  await button.click()
})
```

## Key Points

1. **Always `import '@vitest/browser/matchers'`** at the top of test files
2. **Await locators**: `await screen.getByText(...)` 
3. **Use `expect.element()`** not plain `expect()`
4. **Matchers return promises**: The whole chain needs await

## Common Patterns

```typescript
// Assertions
await expect.element(await screen.getByText('text')).toBeInTheDocument()
await expect.element(element).toHaveAttribute('type', 'text')
await expect.element(element).toHaveProperty('tagName', 'DIV')

// Interactions  
await element.click()
await element.fill('text')

// Multiple assertions on same element
const input = await screen.getByRole('textbox')
await expect.element(input).toBeInTheDocument()
await expect.element(input).toHaveAttribute('type', 'text')
```

