import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Modal from './Modal';

describe('Modal accessibility', () => {
  it('exposes a dialog role labelled by its visible title', () => {
    render(
      <Modal isOpen onClose={() => {}} title="Edit practice user">
        <p>Body content</p>
      </Modal>,
    );

    // Queried by accessible name, which proves aria-labelledby is wired to the title.
    const dialog = screen.getByRole('dialog', { name: 'Edit practice user' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const heading = screen.getByRole('heading', { name: 'Edit practice user' });
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(heading.id).toBeTruthy();
  });

  it('falls back to the close-button label when there is no title', () => {
    render(
      <Modal isOpen onClose={() => {}} closeButtonLabel="Close preview">
        <p>Body content</p>
      </Modal>,
    );

    expect(screen.getByRole('dialog', { name: 'Close preview' })).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(
      <Modal isOpen={false} onClose={() => {}} title="Hidden">
        <p>Body content</p>
      </Modal>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
