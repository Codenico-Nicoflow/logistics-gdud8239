import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './ui';
import { he } from '../i18n/he';

/**
 * Where the soldier signs.
 *
 * This is the evidence the whole 1008 exists to produce, so the surface is
 * deliberately large and plain: a wide ruled box with a baseline, the way the
 * paper form draws it. Pointer events rather than separate mouse and touch
 * handlers, so a finger on a phone and a mouse on the armory computer take the
 * same path through the code.
 */
export function SignaturePad({
  onChange,
  disabled = false,
}: {
  /** The drawing as a PNG data URL, or null once it is cleared. */
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  // The stroke's own record of whether anything was drawn. `hasInk` is state, so a quick stroke can lift
  // before React has re-rendered and the handlers would still see false: the signature was drawn but never reported.
  const inked = useRef(false);
  const lastWidth = useRef(0);
  // Held in a ref so the effect below never re-runs just because a parent passed a new
  // function: re-running it re-sizes the canvas, which erases the signature mid-draw.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /**
   * The canvas is sized to its own box times the device pixel ratio, so a
   * signature drawn on a phone is not a blurry upscale of a 300px bitmap.
   */
  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    lastWidth.current = rect.width;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#14181c';
  }, []);

  useEffect(() => {
    fit();
    // Rotating a phone mid-signature resizes the canvas, which clears it; the
    // soldier is told by the empty box and signs again, rather than the form
    // keeping a half-drawn stroke.
    // Only a real change of width. A phone's address bar or keyboard also fires resize, and wiping a
    // finished signature for that would look like the pad "does nothing".
    const onResize = (): void => {
      const width = canvasRef.current?.getBoundingClientRect().width ?? 0;
      if (Math.abs(width - lastWidth.current) < 1) return;
      fit();
      inked.current = false;
      setHasInk(false);
      onChangeRef.current(null);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fit]);

  function pointIn(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>): void {
    if (disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    // Captured so a stroke that leaves the box still ends cleanly.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Some pointers cannot be captured; drawing still works while the pointer stays inside the box.
    }
    drawing.current = true;
    const { x, y } = pointIn(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>): void {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pointIn(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    inked.current = true;
    if (!hasInk) setHasInk(true);
  }

  function end(): void {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas || !inked.current) return;
    onChange(canvas.toDataURL('image/png'));
  }

  function clear(): void {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    inked.current = false;
    setHasInk(false);
    onChange(null);
  }

  return (
    <div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          // Without this a drag on a phone scrolls the page instead of drawing.
          style={{ touchAction: 'none' }}
          className={`block h-40 w-full rounded-ctl border-2 bg-white ${
            hasInk ? 'border-field' : 'border-dashed border-rule-strong'
          } ${disabled ? 'opacity-50' : 'cursor-crosshair'}`}
        />
        {/* The baseline, as on the paper form. Drawn behind the ink rather than
            on the canvas, so clearing the signature does not erase it. */}
        <span className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-rule-strong" />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-meta text-graphite">
            {he.form1008.signHere}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-meta text-graphite">{he.form1008.signHint}</span>
        <Button variant="quiet" size="sm" onClick={clear} disabled={!hasInk}>
          {he.form1008.clearSignature}
        </Button>
      </div>
    </div>
  );
}
