import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import PracticeUserManagement from './PracticeUserManagement';

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  Edit2: () => <div data-testid="edit-icon" />,
  Plus: () => <div data-testid="plus-icon" />,
  RefreshCw: () => <div data-testid="refresh-icon" />,
  ShieldCheck: () => <div data-testid="shield-check-icon" />,
  ShieldMinus: () => <div data-testid="shield-minus-icon" />,
  Trash2: () => <div data-testid="trash-icon" />,
  KeyRound: () => <div data-testid="key-icon" />,
}));

// Mock Supabase
vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-uid' } }, error: null }),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
    },
  },
}));

describe('PracticeUserManagement Memoization', () => {
  it('renders correctly with given practices', async () => {
    const practices = [
      { id: 'p1', name: 'Test Practice 1', is_active: true },
      { id: 'p2', name: 'Test Practice 2', is_active: false },
    ];

    render(<PracticeUserManagement practices={practices} />);

    // Check if the component renders the header with count
    expect(screen.getByText(/Users \(/)).toBeInTheDocument();
  });
});
