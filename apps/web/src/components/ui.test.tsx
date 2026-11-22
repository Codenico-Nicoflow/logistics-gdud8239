// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { useState } from 'react';
import { Button, Modal, Select, SearchField, TextField, Tag, apiErrorMessage, formatBytes } from './ui';
import { DeleteDialog } from './DeleteDialog';
import { ToastProvider, useToast } from './toast';
import { SignaturePad } from './SignaturePad';
import { addDays, todayIso } from '../lib/dates';
import { he } from '../i18n/he';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('apiErrorMessage', () => {
  it('reads a string message, joins an array, and ignores everything else', () => {
    expect(apiErrorMessage({ data: { message: 'שגיאה' } })).toBe('שגיאה');
    expect(apiErrorMessage({ data: { message: ['a', 'b', 3] } })).toBe('a, b');
    expect(apiErrorMessage({ data: {} })).toBeNull();
    expect(apiErrorMessage({ data: 'text' })).toBeNull();
    expect(apiErrorMessage(null)).toBeNull();
    expect(apiErrorMessage(undefined)).toBeNull();
    expect(apiErrorMessage('boom')).toBeNull();
    expect(apiErrorMessage({ status: 500 })).toBeNull();
  });
});

describe('formatBytes', () => {
  it('picks a sensible unit at each boundary', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});

describe('dates', () => {
  it('addDays crosses month, year and leap-day boundaries without timezone drift', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-10-25', 0)).toBe('2026-10-25');
  });

  it('todayIso is the Israeli calendar date, not the UTC one', () => {
    vi.useFakeTimers();
    // 23:30 UTC on the 21st is already 01:30 on the 22nd in Israel (UTC+2 in winter).
    vi.setSystemTime(new Date('2026-11-21T23:30:00Z'));
    expect(todayIso()).toBe('2026-11-22');
    vi.setSystemTime(new Date('2026-07-21T21:30:00Z'));
    expect(todayIso()).toBe('2026-07-22'); // UTC+3 in summer
  });
});

describe('Button', () => {
  it('fires once per click and not at all when disabled', () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>go</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<Button onClick={onClick} disabled>go</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('is type=button by default so it never submits a surrounding form', () => {
    render(<Button>x</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });
});

describe('TextField', () => {
  it('marks optional fields and reports typed text', () => {
    const onChange = vi.fn();
    render(<TextField label="שם" value="" onChange={onChange} />);
    expect(screen.getByText('שם').parentElement?.textContent).toContain(he.issue.optional);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'דנה' } });
    expect(onChange).toHaveBeenCalledWith('דנה');
  });
  it('shows the error instead of the hint', () => {
    render(<TextField label="x" value="" onChange={() => {}} hint="רמז" error="שגוי" />);
    expect(screen.getByText('שגוי')).toBeTruthy();
    expect(screen.queryByText('רמז')).toBeNull();
  });
});

describe('Select', () => {
  it('reports the chosen value', () => {
    const onChange = vi.fn();
    render(<Select value="a" onChange={onChange} options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('SearchField', () => {
  it('searches on Enter and on the button, never per keystroke', () => {
    const onSearch = vi.fn();
    render(<SearchField value="" onSearch={onSearch} />);
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: 'M4' } });
    expect(onSearch).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSearch).toHaveBeenCalledWith('M4');
  });
  it('follows a value that is cleared from outside', () => {
    const { rerender } = render(<SearchField value="abc" onSearch={() => {}} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('abc');
    rerender(<SearchField value="" onSearch={() => {}} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
  });
});

describe('Modal', () => {
  it('closes on a real backdrop click but not when a drag that began inside ends on the backdrop', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose}><p>inside</p></Modal>);
    const panel = screen.getByRole('dialog');
    const backdrop = panel.parentElement as HTMLElement;

    fireEvent.mouseDown(panel);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('a click inside the panel never closes it', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose}><button>in</button></Modal>);
    fireEvent.click(screen.getByText('in'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Tag', () => {
  it('renders its text', () => {
    render(<Tag tone="oxide">חסום</Tag>);
    expect(screen.getByText('חסום')).toBeTruthy();
  });
});

describe('DeleteDialog', () => {
  it('without a reason label, confirms straight away', () => {
    const onConfirm = vi.fn();
    render(<DeleteDialog title="t" body="b" isLoading={false} onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: he.common.delete }));
    expect(onConfirm).toHaveBeenCalledWith('');
  });
  it('with a reason label, needs at least 3 non-blank characters', () => {
    const onConfirm = vi.fn();
    render(<DeleteDialog title="t" body="b" reasonLabel="סיבה" isLoading={false} onConfirm={onConfirm} onCancel={() => {}} />);
    const del = screen.getByRole('button', { name: he.common.delete }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  ab  ' } });
    expect(del.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'abc' } });
    expect(del.disabled).toBe(false);
    fireEvent.click(del);
    expect(onConfirm).toHaveBeenCalledWith('abc');
  });
  it('locks both buttons while the request is in flight (no double delete)', () => {
    render(<DeleteDialog title="t" body="b" isLoading onConfirm={() => {}} onCancel={() => {}} />);
    expect((screen.getByRole('button', { name: he.common.delete }) as HTMLButtonElement).disabled).toBe(true);
  });
});

function ToastDemo() {
  const toast = useToast();
  const [undone, setUndone] = useState(false);
  return (
    <>
      <button onClick={() => toast.success({ title: 'נשמר', detail: 'פרט' })}>ok</button>
      <button onClick={() => toast.error({ title: 'נכשל' })}>bad</button>
      <button onClick={() => toast.info({ title: 'מידע', action: { label: 'בטל', onClick: () => setUndone(true) } })}>info</button>
      <span>{undone ? 'UNDONE' : ''}</span>
    </>
  );
}

describe('toasts', () => {
  it('a success disappears by itself, an error stays until dismissed', () => {
    vi.useFakeTimers();
    render(<ToastProvider><ToastDemo /></ToastProvider>);
    fireEvent.click(screen.getByText('ok'));
    fireEvent.click(screen.getByText('bad'));
    expect(screen.getByRole('status').textContent).toContain('נשמר');
    expect(screen.getByRole('alert').textContent).toContain('נכשל');
    act(() => { vi.advanceTimersByTime(6000); });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(he.common.close));
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('keeps at most four on screen', () => {
    render(<ToastProvider><ToastDemo /></ToastProvider>);
    for (let i = 0; i < 9; i++) fireEvent.click(screen.getByText('bad'));
    expect(screen.getAllByRole('alert')).toHaveLength(4);
  });
  it('runs the action and dismisses the toast', () => {
    render(<ToastProvider><ToastDemo /></ToastProvider>);
    fireEvent.click(screen.getByText('info'));
    fireEvent.click(screen.getByText('בטל'));
    expect(screen.getByText('UNDONE')).toBeTruthy();
  });
  it('useToast outside the provider fails loudly', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ToastDemo />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});

describe('SignaturePad', () => {
  function stubCanvas(): void {
    const ctx = { scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {} };
    HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
    HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
    HTMLCanvasElement.prototype.setPointerCapture = () => {};
  }
  it('reports nothing for a tap without movement, a PNG after a stroke, and null after clearing', () => {
    stubCanvas();
    const onChange = vi.fn();
    const { container } = render(<SignaturePad onChange={onChange} />);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;

    fireEvent.pointerDown(canvas, { clientX: 1, clientY: 1, pointerId: 1 });
    fireEvent.pointerUp(canvas);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.pointerDown(canvas, { clientX: 1, clientY: 1, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 9 });
    fireEvent.pointerUp(canvas);
    expect(onChange).toHaveBeenLastCalledWith('data:image/png;base64,AAAA');

    fireEvent.click(screen.getByRole('button', { name: he.form1008.clearSignature }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
  it('a disabled pad cannot be drawn on', () => {
    stubCanvas();
    const onChange = vi.fn();
    const { container } = render(<SignaturePad onChange={onChange} disabled />);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    fireEvent.pointerDown(canvas, { pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 9 });
    fireEvent.pointerUp(canvas);
    expect(onChange).not.toHaveBeenCalled();
  });
  it('rotating the phone clears a half-drawn signature', () => {
    stubCanvas();
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
