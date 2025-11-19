# Testing Guide for @jsonschema-form/react

This package uses **Vitest Browser Mode** to test React components in a real browser environment using Playwright.

## Quick Start

```bash
# Run all tests (headless browser)
npm test

# Run tests in watch mode (faster for development)
npm run test:watch

# Run tests with UI (interactive)
npm run test:ui

# Run specific test file
npm test -- DefaultFieldTemplate.test.tsx

# Run tests matching a pattern
npm test -- --grep "should render"
```

## Test Setup

- **Framework**: Vitest v2.x with browser mode
- **Browser**: Chromium (via Playwright)
- **Renderer**: vitest-browser-react
- **Assertions**: DOM assertions from @testing-library/jest-dom

## Test Files

- `useSchemaForm.test.tsx` - Tests for the main hook
- `DefaultFieldTemplate.test.tsx` - Tests for field rendering
- `DefaultGroupTemplate.test.tsx` - Tests for group/fieldset rendering
- `DefaultRootTemplate.test.tsx` - Tests for form wrapper

## Configuration

See `vitest.config.ts` for the browser mode configuration.

## Performance Tips

1. **Run specific tests during development:**
   ```bash
   npm test -- DefaultFieldTemplate.test.tsx --run
   ```

2. **Use watch mode for faster feedback:**
   ```bash
   npm run test:watch
   ```

3. **Browser tests are slower than Node tests** - this is expected as they run in a real browser environment with full DOM APIs

## Troubleshooting

### Tests are slow
- Browser tests are inherently slower than Node tests
- First run installs browser binaries (one-time cost)
- Consider running specific test files during development

### Playwright browser not installed
```bash
npx playwright install chromium
```

### Port conflicts
Vitest uses port 63315 by default. You can change this in `vitest.config.ts` if needed.

