import { afterEach, vi } from 'vitest';

if (typeof globalThis.CanvasRenderingContext2D === 'undefined') {
  class MockCanvasRenderingContext2D {}
  Object.assign(MockCanvasRenderingContext2D.prototype, {
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    transform: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  });
  // jsdom does not provide the canvas context constructor that PIXI probes for.
  globalThis.CanvasRenderingContext2D = MockCanvasRenderingContext2D as typeof CanvasRenderingContext2D;
}

if (typeof HTMLCanvasElement !== 'undefined') {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: vi.fn(() =>
      Object.assign(new globalThis.CanvasRenderingContext2D(), {
        canvas: document.createElement('canvas'),
      })
    ),
    configurable: true,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});
