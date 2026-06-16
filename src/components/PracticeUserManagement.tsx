import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Edit2, Mail, Plus, RefreshCw, Trash2, KeyRound } from 'lucide-react';
import { supabase } from '../supabase';
import ConfirmDialog from './ConfirmDialog';
import Modal from './Modal';
import type { AppUserSummary, PracticeSummary } from '../practicePortal';
import { getFunctionErrorMessage } from '../supabaseFunctionError';

type PracticeUserManagementProps = {
  practices: PracticeSummary[];
};

type UserRow = {
  uid: string;
  email: string;
  name: string;
  is_active: boolean;
  global_role?: 'owner' | 'admin' | null;
  memberships: Array<{
    id: string;
    practice_id: string;
    user_uid: string;
    role: 'admin' | 'editor';
    is_default: boolean;
    practice: Pick<PracticeSummary, 'id' | 'name' | 'is_active'> | Array<Pick<PracticeSummary, 'id' | 'name' | 'is_active'>> | null;
  }>;
};

type PracticeUsersPayload = {
  users?: UserRow[];
};

type UserFormState = {
  uid?: string;
  name: string;
  email: string;
  isActive: boolean;
  practiceIds: string[];
  defaultPracticeId: string;
};

const emptyForm = (): UserFormState => ({
  name: '',
  email: '',
  isActive: true,
  practiceIds: [],
  defaultPracticeId: '',
});

const normalisePractice = (
  value: UserRow['memberships'][number]['practice'],
): Pick<PracticeSummary, 'id' | 'name' | 'is_active'> | null => {
  const practice = Array.isArray(value) ? value[0] : value;
  return practice ?? null;
};


const PracticeUserManagement: React.FC<PracticeUserManagementProps> = ({ practices }) => {
  const [users, setUsers] = useState<AppUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUserSummary | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm());
  const [error, setError] = useState('');
  const [actionLink, setActionLink] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    isDangerous: boolean;
    onConfirm: () => void;
  } | null>(null);
  const editModalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    if (practices.length > 0) {
      void loadUsers();
    }
  }, [practices.length]);

  useEffect(() => {
    if (!editingUser) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const modalNode = editModalRef.current;
    const focusableSelector = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const focusFirstElement = () => {
      const focusable = modalNode?.querySelectorAll<HTMLElement>(focusableSelector);
      focusable?.[0]?.focus();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        resetForm();
        return;
      }

      if (event.key !== 'Tab' || !modalNode) {
        return;
      }

      const focusable = Array.from(modalNode.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hasAttribute('disabled') && element.tabIndex !== -1,
      );

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const frame = window.requestAnimationFrame(focusFirstElement);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [editingUser]);

  const activePractices = useMemo(
    () => [...practices].sort((left, right) => left.name.localeCompare(right.name)),
    [practices],
  );

  const loadUsers = async () => {
    setLoading(true);
    setError('');

    try {
      const { data, error: userError } = await supabase.functions.invoke('list-practice-users');

      if (userError) {
        throw userError;
      }

      const payload = (data || {}) as PracticeUsersPayload;
      const mappedUsers = (payload.users || []).map((row) => ({
        uid: row.uid,
        email: row.email,
        name: row.name,
        is_active: row.is_active,
        global_role: row.global_role || null,
        memberships: (row.memberships || [])
          .flatMap((membership) => {
            const practice = normalisePractice(membership.practice);
            if (!practice) {
              return [];
            }

            return [{
              ...membership,
              practice,
            }];
          })
          .sort((left, right) => Number(right.is_default) - Number(left.is_default) || left.practice.name.localeCompare(right.practice.name)),
      }));

      setUsers(mappedUsers);
    } catch (err) {
      console.error('Error loading users:', err);
      setError(await getFunctionErrorMessage(err, 'Unable to load users.'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm(emptyForm());
    setShowAddForm(false);
    setEditingUser(null);
    setError('');
  };

  const openAddForm = () => {
    setForm({
      ...emptyForm(),
      practiceIds: activePractices[0] ? [activePractices[0].id] : [],
      defaultPracticeId: activePractices[0]?.id || '',
    });
    setShowAddForm(true);
    setEditingUser(null);
    setError('');
  };

  const openEditForm = (appUser: AppUserSummary) => {
    setEditingUser(appUser);
    setShowAddForm(false);
    setError('');
    setForm({
      uid: appUser.uid,
      name: appUser.name,
      email: appUser.email,
      isActive: appUser.is_active,
      practiceIds: appUser.memberships.map((membership) => membership.practice_id),
      defaultPracticeId:
        appUser.memberships.find((membership) => membership.is_default)?.practice_id ||
        appUser.memberships[0]?.practice_id ||
        '',
    });
  };

  const togglePracticeId = (practiceId: string) => {
    setForm((current) => {
      const exists = current.practiceIds.includes(practiceId);
      const practiceIds = exists
        ? current.practiceIds.filter((value) => value !== practiceId)
        : [...current.practiceIds, practiceId];

      return {
        ...current,
        practiceIds,
        defaultPracticeId:
          practiceIds.includes(current.defaultPracticeId)
            ? current.defaultPracticeId
            : practiceIds[0] || '',
      };
    });
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setActionLink('');
    setActionMessage('');

    if (!form.email.trim()) {
      setError('User email is required');
      return;
    }

    if (form.practiceIds.length === 0) {
      setError('Select at least one practice');
      return;
    }

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('upsert-practice-user', {
        body: {
          email: form.email.trim(),
          name: form.name.trim(),
          practiceIds: form.practiceIds,
          defaultPracticeId: form.defaultPracticeId,
        },
      });

      if (invokeError) {
        throw invokeError;
      }

      if (data?.resetLink) {
        setActionLink(data.resetLink);
        setActionMessage(`User created and linked to practice access. Copy the setup link below and send it to ${form.email.trim()}.`);
      } else {
        setActionMessage(`Existing user updated with access to ${form.practiceIds.length} practice${form.practiceIds.length === 1 ? '' : 's'}.`);
      }

      resetForm();
      await loadUsers();
    } catch (err) {
      console.error('Error creating user:', err);
      setError(await getFunctionErrorMessage(err, 'Unable to save user.'));
    }
  };

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!form.uid) return;
    if (!form.email.trim()) {
      setError('User email is required');
      return;
    }

    if (form.practiceIds.length === 0) {
      setError('Select at least one practice');
      return;
    }

    try {
      const { error: invokeError } = await supabase.functions.invoke('update-practice-user', {
        body: {
          uid: form.uid,
          email: form.email.trim(),
          name: form.name.trim(),
          isActive: form.isActive,
          practiceIds: form.practiceIds,
          defaultPracticeId: form.defaultPracticeId,
        },
      });

      if (invokeError) {
        throw invokeError;
      }

      setActionMessage(`User ${form.email.trim()} updated successfully.`);
      setActionLink('');
      resetForm();
      await loadUsers();
    } catch (err) {
      console.error('Error updating user:', err);
      setError(await getFunctionErrorMessage(err, 'Unable to update user.'));
    }
  };

  const sendPasswordReset = async (appUser: AppUserSummary) => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('send-practice-password-reset', {
        body: { uid: appUser.uid },
      });

      if (invokeError) {
        throw invokeError;
      }

      setActionMessage(`Password reset link prepared for ${appUser.email}. Copy and send it manually if needed.`);
      setActionLink(data?.resetLink || '');
    } catch (err) {
      console.error('Error sending password reset:', err);
      setError(await getFunctionErrorMessage(err, 'Unable to send password reset.'));
    }
  };

  const deleteUser = (appUser: AppUserSummary) => {
    setConfirmDialog({
      title: 'Delete User',
      message: `Delete ${appUser.email}? This removes all practice memberships and deletes the underlying auth account, including any global administrator access.`,
      confirmLabel: 'Delete User',
      isDangerous: true,
      onConfirm: () => {
        void (async () => {
          try {
            const { error: invokeError } = await supabase.functions.invoke('delete-practice-user', {
              body: { uid: appUser.uid },
            });

            if (invokeError) {
              throw invokeError;
            }

            setActionMessage(`User ${appUser.email} deleted.`);
            setActionLink('');
            await loadUsers();
          } catch (err) {
            console.error('Error deleting user:', err);
            setError(await getFunctionErrorMessage(err, 'Unable to delete user.'));
          } finally {
            setConfirmDialog(null);
          }
        })();
      },
    });
  };

  const userForm = (
    <form onSubmit={editingUser ? handleUpdate : handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div className="dashboard-form-grid">
        <div className="dashboard-field">
          <label htmlFor="user-name">Name</label>
          <input
            id="user-name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
        </div>
        <div className="dashboard-field">
          <label htmlFor="user-email">Email *</label>
          <input
            id="user-email"
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            required
          />
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
          style={{ width: '18px', height: '18px' }}
        />
        User account active
      </label>

      {editingUser?.global_role && (
        <div className="dashboard-banner dashboard-banner--info">
          This user also has global administrator access as <strong>{editingUser.global_role}</strong>. Any practice changes here will keep that global role in place.
        </div>
      )}

      <div className="dashboard-panel" style={{ background: '#f8fafb' }}>
        <h3 className="dashboard-panel-title" style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Assigned Practices</h3>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {activePractices.map((practice) => (
            <label key={practice.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 600, fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={form.practiceIds.includes(practice.id)}
                onChange={() => togglePracticeId(practice.id)}
                style={{ width: '18px', height: '18px' }}
              />
              <span>{practice.name}{practice.is_active ? '' : ' (Inactive)'}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="dashboard-field" style={{ maxWidth: '420px' }}>
        <label htmlFor="user-default-practice">Default Practice</label>
        <select
          id="user-default-practice"
          value={form.defaultPracticeId}
          onChange={(event) => setForm((current) => ({ ...current, defaultPracticeId: event.target.value }))}
          disabled={form.practiceIds.length === 0}
        >
          {form.practiceIds.map((practiceId) => {
            const practice = activePractices.find((item) => item.id === practiceId);
            if (!practice) return null;

            return (
              <option key={practice.id} value={practice.id}>
                {practice.name}
              </option>
            );
          })}
        </select>
      </div>

      <div className="dashboard-inline-actions" style={{ alignSelf: 'flex-start' }}>
        <button type="submit" className="action-button admin-action-button--primary">
          {editingUser ? 'Save Changes' : 'Create User'}
        </button>
      </div>
    </form>
  );

  return (
    <>
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          isDangerous={confirmDialog.isDangerous}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {(actionMessage || actionLink) && (
        <div className="dashboard-panel dashboard-section">
          <div className="dashboard-panel-header">
            <div>
              <h2 className="dashboard-panel-title">User Action</h2>
              {actionMessage && <p className="dashboard-panel-subtitle">{actionMessage}</p>}
            </div>
            {actionLink && (
              <button onClick={() => navigator.clipboard.writeText(actionLink)} className="admin-action-btn admin-action-btn--edit">
                <Mail size={14} /> Copy Link
              </button>
            )}
          </div>
          {actionLink && (
            <div className="admin-code-block" style={{ marginTop: 12 }}>{actionLink}</div>
          )}
        </div>
      )}

      {showAddForm && (
        <div className="dashboard-panel dashboard-section" style={{ borderLeft: '4px solid #005eb8' }}>
          <div className="dashboard-panel-header">
            <h2 className="dashboard-panel-title">Add User To Practices</h2>
            <button onClick={resetForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4c6272' }}>
              Cancel
            </button>
          </div>

          {error && (
            <div className="dashboard-banner dashboard-banner--error" style={{ marginBottom: '1rem' }}>
              {error}
            </div>
          )}
          {userForm}
        </div>
      )}

      {editingUser && (
        <Modal
          isOpen
          onClose={resetForm}
          size="xl"
          title="Edit User Practice Access"
          bodyClassName="practice-user-management__modal-body"
        >
          <div ref={editModalRef}>
            {error && (
              <div className="dashboard-banner dashboard-banner--error" style={{ marginBottom: '1rem' }}>
                {error}
              </div>
            )}

            {userForm}
          </div>
        </Modal>
      )}

      <div className="dashboard-panel dashboard-section practice-user-management">
        <div className="dashboard-panel-header practice-user-management__header">
          <div>
            <h2 className="dashboard-panel-title">Users ({users.length})</h2>
            <p className="dashboard-panel-subtitle">Manage practice access here. Global administrator access is shown clearly and should be managed from the Administrators tab.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => void loadUsers()} className="admin-action-btn admin-action-btn--icon" title="Refresh">
              <RefreshCw size={15} />
            </button>
            {!showAddForm && !editingUser && (
              <button onClick={openAddForm} className="admin-action-btn admin-action-btn--edit">
                <Plus size={14} /> Add User
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <p style={{ color: '#4c6272' }}>Loading users...</p>
        ) : users.length === 0 ? (
          <p style={{ color: '#4c6272' }}>No users found yet.</p>
        ) : (
          <div className="admin-data-table-wrap">
            <table className="admin-data-table" style={{ minWidth: 760, tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Status</th>
                  <th scope="col">Global Role</th>
                  <th scope="col">Practice Access</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((appUser) => (
                  <tr key={appUser.uid}>
                    <td>
                      <div className="admin-table-identity">
                        <strong>{appUser.name || appUser.email}</strong>
                        {appUser.name && <span className="admin-table-identity__email">{appUser.email}</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`admin-status-dot ${appUser.is_active ? 'admin-status-dot--active' : 'admin-status-dot--inactive'}`}>
                        <span className="admin-status-dot__circle" aria-hidden="true" />
                        {appUser.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      {appUser.global_role ? (
                        <span className={`admin-role-badge admin-role-badge--${appUser.global_role}`}>
                          {appUser.global_role === 'owner' ? 'Owner' : 'Admin'}
                        </span>
                      ) : (
                        <span className="admin-table-muted">—</span>
                      )}
                    </td>
                    <td>
                      {appUser.memberships.length > 0 ? (
                        <div className="admin-service-pills">
                          {appUser.memberships.map((membership) => (
                            <span
                              key={membership.id}
                              className={`admin-service-pill ${membership.practice.is_active ? 'admin-service-pill--on' : 'admin-service-pill--off'}`}
                              title={membership.is_default ? 'Default practice' : undefined}
                            >
                              {membership.practice.name}{membership.is_default ? ' ★' : ''}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="admin-table-muted">No access assigned</span>
                      )}
                    </td>
                    <td>
                      <div className="admin-table-actions">
                        <button onClick={() => openEditForm(appUser)} className="admin-action-btn admin-action-btn--edit">
                          <Edit2 size={14} /> Edit
                        </button>
                        <button onClick={() => void sendPasswordReset(appUser)} className="admin-action-btn admin-action-btn--icon" title="Reset password">
                          <KeyRound size={15} />
                        </button>
                        {!appUser.global_role && (
                          <button onClick={() => deleteUser(appUser)} className="admin-action-btn admin-action-btn--icon" title="Delete user">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};

export default PracticeUserManagement;
