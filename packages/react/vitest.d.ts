/// <reference types="vitest" />

import type { Locator } from '@vitest/browser/context'

declare global {
  namespace Vi {
    interface Assertion<T = any> {
      toBeInTheDocument(): Promise<void>
      toBeVisible(): Promise<void>
      toHaveAttribute(attr: string, value?: unknown): Promise<void>
      toHaveProperty(property: string, value?: unknown): Promise<void>
      toHaveTextContent(text: string | RegExp): Promise<void>
    }
  }
}

declare module 'vitest' {
  interface ExpectStatic {
    element<T extends Element | Locator>(element: T): Vi.Assertion
  }
}

