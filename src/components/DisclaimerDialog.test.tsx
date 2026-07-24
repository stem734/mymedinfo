import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DisclaimerDialog from './DisclaimerDialog';

describe('DisclaimerDialog', () => {
  it('renders title, message, and checkbox label correctly with correct accessibility attributes', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <DisclaimerDialog
        title="Consent Required"
        message="Please agree to the terms."
        checkboxLabel="I accept the terms and conditions"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    // Verify title and message are in the document
    expect(screen.getByRole('heading', { name: 'Consent Required' })).toBeInTheDocument();
    expect(screen.getByText('Please agree to the terms.')).toBeInTheDocument();

    // Verify checkbox is associated with the label and is unselected initially
    const checkbox = screen.getByRole('checkbox', { name: 'I accept the terms and conditions' });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();

    // Verify "Confirm" button is disabled by default
    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    expect(confirmButton).toBeDisabled();
  });

  it('enables the confirm button when checkbox is checked, and calls callbacks correctly', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <DisclaimerDialog
        title="Consent Required"
        message="Please agree to the terms."
        checkboxLabel="I accept the terms and conditions"
        confirmLabel="Agree and Proceed"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'I accept the terms and conditions' });
    const confirmButton = screen.getByRole('button', { name: 'Agree and Proceed' });
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });

    // Click cancel button
    await user.click(cancelButton);
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Toggle the checkbox
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(confirmButton).toBeEnabled();

    // Click confirm button
    await user.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Toggle checkbox back off
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(confirmButton).toBeDisabled();
  });
});
