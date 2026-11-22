// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { Modal } from './ui';

afterEach(cleanup);

describe('Modal and the Escape key', () => {
  it('Escape closes the dialog', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose}><p>x</p></Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('other keys do nothing', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose}><p>x</p></Modal>);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('with two open, Escape closes only the top one, then the next', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    function Stack() {
      const [showInner, setShowInner] = useState(true);
      return (
        <Modal onClose={outer}>
          <p>outer</p>
          {showInner && (
            <Modal onClose={() => { inner(); setShowInner(false); }}>
              <p>inner</p>
            </Modal>
          )}
        </Modal>
      );
    }
    render(<Stack />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it('stops listening once the dialog is gone', () => {
    const onClose = vi.fn();
    const { unmount } = render(<Modal onClose={onClose}><p>x</p></Modal>);
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
