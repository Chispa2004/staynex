'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
import { getAuthHeaders } from '@/lib/auth-headers';
import { ROLE_LABELS, ROLES } from '@/lib/permissions';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';
import { PremiumEmptyState } from './PremiumEmptyState';

const statuses = ['active', 'invited', 'disabled'];

const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

const statusTone = (status) => {
  if (status === 'active') return 'emerald';
  if (status === 'invited') return 'amber';
  if (status === 'disabled') return 'red';
  return 'slate';
};

const RoleBadge = ({ role }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const tone = role === 'owner' || role === 'admin' ? 'emerald' : role === 'manager' ? 'sky' : 'slate';

  return <span className={ui.badge(isLight, tone)}>{ROLE_LABELS[role] || role}</span>;
};

const StatusBadge = ({ status }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return <span className={ui.badge(isLight, statusTone(status))}>{status}</span>;
};

export const UserManagementClient = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [users, setUsers] = useState([]);
  const [hotel, setHotel] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('receptionist');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const activeUsers = useMemo(() => users.filter((user) => user.status === 'active').length, [users]);
  const invitedUsers = useMemo(() => users.filter((user) => user.status === 'invited').length, [users]);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/settings/users', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load users');
      }

      if (!shouldAcceptTenantPayload(body, 'user-management')) {
        return;
      }

      setUsers(body.users || []);
      setHotel(body.hotel || null);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const inviteUser = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/settings/users', {
        method: 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, role })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not invite user');
      }

      setUsers((current) => [...current, body.user]);
      setEmail('');
      setRole('receptionist');
      setSuccess('User invitation created locally.');
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setSaving(false);
    }
  };

  const updateUser = async (id, updates) => {
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/settings/users', {
        method: 'PATCH',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id, ...updates })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not update user');
      }

      setUsers((current) => current.map((user) => (
        user.id === id ? body.user : user
      )));
      setSuccess('User assignment updated.');
    } catch (caughtError) {
      setError(caughtError.message);
    }
  };

  const disableUser = async (id) => {
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/settings/users', {
        method: 'DELETE',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not disable user');
      }

      setUsers((current) => current.map((user) => (
        user.id === id ? body.user : user
      )));
      setSuccess('User disabled.');
    } catch (caughtError) {
      setError(caughtError.message);
    }
  };

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Hotel', hotel?.name || 'Current hotel'],
          ['Active users', activeUsers],
          ['Invited users', invitedUsers]
        ].map(([label, value]) => (
          <div key={label} className={cn('rounded-xl border p-4', ui.surface(isLight))}>
            <p className={ui.text.eyebrow(isLight)}>{label}</p>
            <p className={cn('mt-2 text-2xl', ui.text.title(isLight))}>{value}</p>
          </div>
        ))}
      </div>

      <form onSubmit={inviteUser} className={cn('rounded-xl border p-5', ui.surface(isLight))}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <label className={ui.text.eyebrow(isLight)} htmlFor="invite-email">Email</label>
            <input
              id="invite-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="reception@example.com"
              className={`${ui.input(isLight)} mt-2 w-full`}
              type="email"
            />
          </div>
          <div className="lg:w-56">
            <label className={ui.text.eyebrow(isLight)} htmlFor="invite-role">Role</label>
            <select
              id="invite-role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className={`${ui.input(isLight)} mt-2 w-full`}
            >
              {ROLES.map((item) => (
                <option key={item} value={item}>{ROLE_LABELS[item]}</option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={saving} className={ui.button(isLight, 'primary')}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {saving ? 'Saving...' : 'Add user'}
          </button>
          <button type="button" onClick={loadUsers} className={ui.button(isLight, 'secondary')}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </form>

      {error ? (
        <div className={cn('rounded-xl border px-4 py-3 text-sm', isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100')}>
          {error}
        </div>
      ) : null}
      {success ? (
        <div className={cn('rounded-xl border px-4 py-3 text-sm', isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100')}>
          {success}
        </div>
      ) : null}

      <div className={cn('overflow-hidden rounded-xl border', ui.surface(isLight))}>
        <div className={isLight ? 'border-b border-slate-200 px-5 py-4' : 'border-b border-white/10 px-5 py-4'}>
          <p className={cn('text-sm', ui.text.title(isLight))}>Hotel users</p>
          <p className={ui.text.muted(isLight)}>Local invitations are stored now. Email delivery can be added later.</p>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((item) => (
              <div key={item} className={`${ui.skeleton(isLight)} h-14 w-full`} />
            ))}
          </div>
        ) : users.length === 0 ? (
          <PremiumEmptyState
            icon={ShieldCheck}
            title="No hotel users yet"
            description="Add the first user assignment to control who can access this hotel."
            className="m-4"
          />
        ) : (
          <div className={isLight ? 'divide-y divide-slate-200' : 'divide-y divide-white/10'}>
            {users.map((user) => (
              <article key={user.id} className={isLight ? 'grid gap-4 p-4 transition hover:bg-slate-50 lg:grid-cols-[1.2fr_0.75fr_0.75fr_1fr]' : 'grid gap-4 p-4 transition hover:bg-white/[0.035] lg:grid-cols-[1.2fr_0.75fr_0.75fr_1fr]'}>
                <div>
                  <p className={cn('text-sm font-semibold', isLight ? 'text-slate-950' : 'text-white')}>
                    {user.email || user.user_id || 'Unlinked user'}
                  </p>
                  <p className={ui.text.muted(isLight)}>Created {formatDate(user.created_at)}</p>
                </div>

                <div className="space-y-2">
                  <RoleBadge role={user.role} />
                  <select
                    value={user.role}
                    onChange={(event) => updateUser(user.id, { role: event.target.value })}
                    className={`${ui.input(isLight)} w-full py-2 text-xs`}
                  >
                    {ROLES.map((item) => (
                      <option key={item} value={item}>{ROLE_LABELS[item]}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <StatusBadge status={user.status} />
                  {user.status === 'invited' ? (
                    <p className={ui.text.muted(isLight)}>Awaiting acceptance</p>
                  ) : null}
                  <select
                    value={user.status}
                    onChange={(event) => updateUser(user.id, { status: event.target.value })}
                    className={`${ui.input(isLight)} w-full py-2 text-xs`}
                  >
                    {statuses.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                  <button
                    type="button"
                    onClick={() => updateUser(user.id, { is_default: !user.is_default })}
                    className={ui.button(isLight, 'secondary')}
                  >
                    {user.is_default ? 'Default' : 'Set default'}
                  </button>
                  {user.status === 'invited' ? (
                    <button
                      type="button"
                      disabled
                      title="Email resend will be connected later"
                      className={ui.button(isLight, 'secondary')}
                    >
                      Resend
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => disableUser(user.id)}
                    className={ui.button(isLight, 'danger')}
                  >
                    Disable
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
