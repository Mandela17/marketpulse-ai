'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

interface UserRecord {
  userId: string;
  email: string;
  role: string;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export default function AdminPage() {
  const { user, session, isAdmin, userRole } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'revoked'>('all');

  useEffect(() => {
    if (!isAdmin) {
      router.push('/');
      return;
    }
    fetchUsers();
  }, [isAdmin]);

  const fetchUsers = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {}
    setLoading(false);
  };

  const handleAction = async (userId: string, action: 'approve' | 'revoke') => {
    if (!session?.access_token) return;
    setActionLoading(`${userId}-${action}`);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action, userId }),
      });

      if (res.ok) {
        await fetchUsers();
      }
    } catch {}
    setActionLoading(null);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!session?.access_token || userRole !== 'super_admin') return;
    setActionLoading(`${userId}-role`);

    try {
      await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'changeRole', userId, newRole }),
      });
      await fetchUsers();
    } catch {}
    setActionLoading(null);
  };

  if (!isAdmin) return null;

  const filtered = users.filter(u => filter === 'all' || u.status === filter);
  const pendingCount = users.filter(u => u.status === 'pending').length;
  const approvedCount = users.filter(u => u.status === 'approved').length;
  const revokedCount = users.filter(u => u.status === 'revoked').length;

  const statusColors: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', label: '⏳ PENDING' },
    approved: { bg: 'rgba(0,214,143,0.12)', color: '#00d68f', label: '✅ APPROVED' },
    revoked: { bg: 'rgba(255,77,106,0.12)', color: '#ff4d6a', label: '🚫 REVOKED' },
  };

  const roleColors: Record<string, { bg: string; color: string }> = {
    super_admin: { bg: 'rgba(168,85,247,0.15)', color: '#a855f7' },
    admin: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
    user: { bg: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' },
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">🛡️ Admin Panel</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Manage user access and roles • Logged in as <span className="font-bold" style={{ color: '#a855f7' }}>{userRole}</span>
          </p>
        </div>
        <button onClick={fetchUsers}
          className="text-xs px-4 py-2 rounded-xl font-bold cursor-pointer transition-all hover:brightness-110"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
          ↻ Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="glass-card-static rounded-xl p-3.5 cursor-pointer" onClick={() => setFilter('all')}>
          <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Total Users</p>
          <p className="text-2xl font-black text-white">{users.length}</p>
        </div>
        <div className="glass-card-static rounded-xl p-3.5 cursor-pointer" onClick={() => setFilter('pending')}>
          <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Pending</p>
          <p className="text-2xl font-black" style={{ color: '#fbbf24' }}>{pendingCount}</p>
        </div>
        <div className="glass-card-static rounded-xl p-3.5 cursor-pointer" onClick={() => setFilter('approved')}>
          <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Approved</p>
          <p className="text-2xl font-black" style={{ color: '#00d68f' }}>{approvedCount}</p>
        </div>
        <div className="glass-card-static rounded-xl p-3.5 cursor-pointer" onClick={() => setFilter('revoked')}>
          <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Revoked</p>
          <p className="text-2xl font-black" style={{ color: '#ff4d6a' }}>{revokedCount}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1.5 mb-4">
        {(['all', 'pending', 'approved', 'revoked'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="text-[10px] px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer capitalize"
            style={{
              background: filter === f ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)',
              color: filter === f ? '#60a5fa' : 'var(--text-muted)',
              border: `1px solid ${filter === f ? 'rgba(59,130,246,0.3)' : 'var(--border-subtle)'}`,
            }}>
            {f} ({f === 'all' ? users.length : f === 'pending' ? pendingCount : f === 'approved' ? approvedCount : revokedCount})
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3"
            style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }} />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading users...</p>
        </div>
      )}

      {/* Users Table */}
      {!loading && filtered.length > 0 && (
        <div className="rounded-xl overflow-hidden shadow-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Email</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider font-semibold hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>Role</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Status</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider font-semibold hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>Joined</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const sc = statusColors[u.status] || statusColors.pending;
                const rc = roleColors[u.role] || roleColors.user;
                const isSelf = u.userId === user?.id;
                const isSuperAdmin = u.role === 'super_admin';

                return (
                  <tr key={u.userId}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-bold text-white">{u.email}</p>
                        {isSelf && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>YOU</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      {userRole === 'super_admin' && !isSelf && !isSuperAdmin ? (
                        <select
                          value={u.role}
                          onChange={e => handleRoleChange(u.userId, e.target.value)}
                          disabled={actionLoading === `${u.userId}-role`}
                          className="text-[10px] px-2 py-1 rounded-lg font-bold bg-transparent outline-none cursor-pointer"
                          style={{ ...rc, border: '1px solid rgba(255,255,255,0.1)' }}>
                          <option value="user" style={{ background: '#1a1a2e' }}>User</option>
                          <option value="admin" style={{ background: '#1a1a2e' }}>Admin</option>
                        </select>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold capitalize"
                          style={{ background: rc.bg, color: rc.color }}>
                          {u.role.replace('_', ' ')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                        style={{ background: sc.bg, color: sc.color }}>
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {new Date(u.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isSelf || isSuperAdmin ? (
                        <span className="text-[10px]" style={{ color: 'var(--text-disabled)' }}>—</span>
                      ) : (
                        <div className="flex gap-1.5 justify-end">
                          {u.status !== 'approved' && (
                            <button
                              onClick={() => handleAction(u.userId, 'approve')}
                              disabled={actionLoading === `${u.userId}-approve`}
                              className="text-[10px] px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-all hover:brightness-125"
                              style={{ background: 'rgba(0,214,143,0.12)', color: '#00d68f' }}>
                              {actionLoading === `${u.userId}-approve` ? '...' : '✓ Approve'}
                            </button>
                          )}
                          {u.status !== 'revoked' && (
                            <button
                              onClick={() => handleAction(u.userId, 'revoke')}
                              disabled={actionLoading === `${u.userId}-revoke`}
                              className="text-[10px] px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-all hover:brightness-125"
                              style={{ background: 'rgba(255,77,106,0.12)', color: '#ff4d6a' }}>
                              {actionLoading === `${u.userId}-revoke` ? '...' : '✕ Revoke'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <p className="text-3xl mb-2">👥</p>
          <p className="text-sm font-bold text-white">No users in this category</p>
        </div>
      )}
    </div>
  );
}
