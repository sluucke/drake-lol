import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { Modal } from '../../../src/app/ui/Modal.jsx';
import { SFX } from '../../../src/ui/sfx.js';

function renderModal(props = {}) {
  const onClose = vi.fn();
  const utils = renderWithProviders(
    <Modal open title="Credits" onClose={onClose} {...props}>
      <button type="button">first</button>
      <button type="button">last</button>
    </Modal>,
  );
  return { ...utils, onClose };
}

describe('Modal', () => {
  it('renders nothing when closed', () => {
    const { portalTarget } = renderModal({ open: false });
    expect(within(portalTarget).queryByRole('dialog')).toBeNull();
  });

  it('renders a labelled dialog inside the portal target', () => {
    const { portalTarget } = renderModal();
    const dialog = within(portalTarget).getByRole('dialog', { name: 'Credits' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('closes on backdrop mousedown but not on dialog mousedown', () => {
    const { portalTarget, onClose } = renderModal();
    fireEvent.mouseDown(within(portalTarget).getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(portalTarget.querySelector('.drk-modal__backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('close button plays the close sound', () => {
    const { onClose, sfx } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(sfx.play).toHaveBeenCalledWith(SFX.close);
  });

  it('focuses the first focusable element and wraps Tab', () => {
    renderModal();
    const close = screen.getByRole('button', { name: 'Close' });
    const last = screen.getByRole('button', { name: 'last' });
    expect(document.activeElement).toBe(close);
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
