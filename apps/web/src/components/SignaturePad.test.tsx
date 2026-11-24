// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { SignaturePad } from './SignaturePad';

const PNG = 'data:image/png;base64,AAAA';

beforeEach(() => {
  // jsdom has no canvas: a context that accepts every call is enough to exercise the pointer handling.
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(PNG);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 300, height: 160, left: 0, top: 0, right: 300, bottom: 160, x: 0, y: 0, toJSON: () => ({}) });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const canvas = (c: HTMLElement): HTMLCanvasElement => c.querySelector('canvas') as HTMLCanvasElement;

describe('SignaturePad', () => {
  it('reports the signature even when the stroke lifts before React re-renders, and when capture is unsupported', () => {
    const onChange = vi.fn();
    const { container } = render(<SignaturePad onChange={onChange} />);
    // jsdom has no setPointerCapture, like a pointer that cannot be captured: it must not stop the stroke.
    fireEvent.pointerDown(canvas(container), { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(canvas(container), { clientX: 60, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(canvas(container), { pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(PNG);
  });

  it('keeps the signature when the window fires resize without the width changing', () => {
    const onChange = vi.fn();
    const { container } = render(<SignaturePad onChange={onChange} />);
    fireEvent.pointerDown(canvas(container), { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(canvas(container), { clientX: 60, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(canvas(container), { pointerId: 1 });
    onChange.mockClear();
    window.dispatchEvent(new Event('resize'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
