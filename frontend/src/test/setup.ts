// Vitest setup: jest-dom matchers plus the browser APIs jsdom lacks that
// Recharts and @react-three/fiber touch at import time. The Three.js canvas is
// never mounted in tests (no WebGL in jsdom); components that embed it are
// tested through their pure helpers instead.
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const g = globalThis as unknown as Record<string, unknown>;
if (!g.ResizeObserver) g.ResizeObserver = ResizeObserverStub;
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

// Node 25 ships its own `localStorage` global, which is an empty object unless
// Node is started with --localstorage-file, and it shadows jsdom's working one.
// Hand tests jsdom's real Storage instead.
if (typeof localStorage.setItem !== "function") {
  const dom = (window as unknown as { jsdom?: { window: Window } }).jsdom;
  if (dom) {
    for (const target of [globalThis, window]) Object.defineProperty(target, "localStorage", { configurable: true, get: () => dom.window.localStorage });
  }
}

// jsdom has no PointerEvent; the expedition map's pointer handlers need
// `button`, `clientX` and `clientY`, so give it a MouseEvent-backed polyfill.
if (!("PointerEvent" in window)) {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  (window as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent = PointerEventPolyfill;
}
