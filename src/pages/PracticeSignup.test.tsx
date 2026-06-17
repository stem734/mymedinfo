import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PracticeSignup from './PracticeSignup';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock('../supabase', () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

describe('PracticeSignup', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('submits public registration through the Edge Function', async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValue({ data: { success: true, status: 'submitted' }, error: null });

    render(
      <MemoryRouter>
        <PracticeSignup />
      </MemoryRouter>,
    );

    await user.type(screen.getByPlaceholderText('e.g. Riverside Medical Centre'), 'Riverside Medical Centre');
    await user.type(screen.getByPlaceholderText('e.g. C84001'), 'c84001');
    await user.type(screen.getByPlaceholderText('e.g. Dr Sarah Jones'), 'Dr Sarah Jones');
    await user.type(screen.getByPlaceholderText('e.g. sarah.jones@nhs.net'), 'Sarah.Jones@NHS.NET');
    await user.click(screen.getByRole('button', { name: 'Register Practice' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('submit-practice-signup', {
        body: {
          name: 'Riverside Medical Centre',
          odsCode: 'C84001',
          contactEmail: 'sarah.jones@nhs.net',
          contactName: 'Dr Sarah Jones',
        },
      });
    });
    expect(await screen.findByText('Registration Submitted')).toBeInTheDocument();
  });
});
