import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import DisclaimerDialog from './DisclaimerDialog';

describe('DisclaimerDialog accessibility and interaction', () => {
  it('renders correctly and links label to the checkbox input', async () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(
      <DisclaimerDialog
        title="Terms of Use"
        message="Please read and accept the safety notice before proceeding."
        checkboxLabel="I accept these terms"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />,
    );

    // Verify dialog title and message
    expect(screen.getByRole('dialog', { name: 'Terms of Use' })).toBeInTheDocument();
    expect(screen.getByText('Please read and accept the safety notice before proceeding.')).toBeInTheDocument();

    // Verify checkbox is associated with label and starts unchecked
    const checkbox = screen.getByRole('checkbox', { name: 'I accept these terms' });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();

    // Confirm button should be disabled initially
    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    expect(confirmButton).toBeDisabled();

    // Click checkbox to accept
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    // Confirm button should now be enabled
    expect(confirmButton).toBeEnabled();

    // Click confirm and verify callback
    await userEvent.click(confirmButton);
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('triggers onCancel when cancel button is clicked', async () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(
      <DisclaimerDialog
        title="Safety Confirmation"
        message="Confirm safety settings."
        checkboxLabel="I agree"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />,
    );

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });
});
