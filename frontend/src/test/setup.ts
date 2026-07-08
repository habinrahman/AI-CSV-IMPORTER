/**
 * Shared test environment shims for jsdom.
 *
 * - jest-dom matchers on Vitest's `expect`.
 * - Manual DOM cleanup (globals are off, so RTL cannot auto-register it).
 * - `matchMedia` reporting `prefers-reduced-motion: reduce` so framer-motion
 *   (AnimatedNumber) and next-themes render final values synchronously.
 * - A `ResizeObserver` stub for Radix primitives and TanStack Virtual.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList,
});

class ResizeObserverStub implements ResizeObserver {
  observe(): void {
    // jsdom has no layout — sizes are asserted via explicit rect mocks.
  }
  unobserve(): void {
    // no-op
  }
  disconnect(): void {
    // no-op
  }
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub;
}
