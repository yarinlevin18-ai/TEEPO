/**
 * Vitest global setup — runs once before any test.
 *
 *  - jest-dom matchers (`toBeInTheDocument`, etc.)
 *  - localStorage shim that survives test isolation
 *  - silence noisy known warnings unrelated to test correctness
 */

import '@testing-library/jest-dom/vitest'
import { afterEach, beforeAll, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  // Reset localStorage between tests so theme/auth state don't bleed across.
  try { localStorage.clear() } catch {}
})

beforeAll(() => {
  // jsdom doesn't implement matchMedia; some libs (framer-motion) probe it.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  // ResizeObserver — used by Radix-style primitives we import indirectly.
  if (!('ResizeObserver' in window)) {
    ;(window as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})
