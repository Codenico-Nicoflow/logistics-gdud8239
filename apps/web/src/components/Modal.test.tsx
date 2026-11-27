// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Modal } from './ui';

afterEach(cleanup);

describe('Modal', () => {
  it('sits directly under the page body, even when opened from inside another dialog', () => {
    render(
      <Modal onClose={() => {}}>
        <div data-testid="outer">
          <Modal onClose={() => {}}>
            <div data-testid="inner">picker</div>
          </Modal>
        </div>
      </Modal>,
    );
    const inner = screen.getByTestId('inner');
    const outer = screen.getByTestId('outer');
    // Not inside the outer dialog's DOM, so its `fixed` frame is the screen and it is not scrolled with it.
    expect(outer.contains(inner)).toBe(false);
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs).toHaveLength(2);
    for (const d of dialogs) expect(d.parentElement?.parentElement).toBe(document.body);
  });
});
