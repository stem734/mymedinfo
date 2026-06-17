import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PracticeLogin from './PracticeLogin';

const { getSessionMock, onAuthStateChangeMock, unsubscribeMock, fromMock, navigateMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  unsubscribeMock: vi.fn(),
  fromMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
    from: fromMock,
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const mockPlatformConfigQuery = () => {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  fromMock.mockReturnValue({ select });
};

describe('PracticeLogin', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    onAuthStateChangeMock.mockReset();
    unsubscribeMock.mockReset();
    fromMock.mockReset();
    navigateMock.mockReset();

    mockPlatformConfigQuery();
    onAuthStateChangeMock.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: unsubscribeMock,
        },
      },
    });
  });

  it('redirects an existing practice session to the dashboard', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'practice-user-1',
            email: 'practice@example.nhs.uk',
          },
        },
      },
    });

    render(
      <MemoryRouter>
        <PracticeLogin />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/practice/dashboard', { replace: true });
    });
  });
});
