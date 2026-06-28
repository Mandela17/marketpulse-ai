// User Role & Access Management
// Manages user approval status and roles (super_admin, admin, user)

import { getServiceClient } from './supabase';

export type UserRole = 'super_admin' | 'admin' | 'user';
export type UserStatus = 'pending' | 'approved' | 'revoked';

export interface UserRoleRecord {
  id: number;
  userId: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Super Admin Email ──────────────────────────────────────────────
const SUPER_ADMIN_EMAIL = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL || 'mendela4cazz@gmail.com';

// ─── Get user role record ────────────────────────────────────────────
export async function getUserRole(userId: string): Promise<UserRoleRecord | null> {
  try {
    const db = getServiceClient();
    const { data, error } = await db
      .from('user_roles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      userId: data.user_id,
      email: data.email,
      role: data.role,
      status: data.status,
      approvedBy: data.approved_by,
      approvedAt: data.approved_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch {
    return null;
  }
}

// ─── Check if user is approved ───────────────────────────────────────
export async function isUserApproved(userId: string, email?: string): Promise<{
  approved: boolean;
  status: UserStatus;
  role: UserRole;
}> {
  // Super admin is always approved
  if (email && email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
    // Auto-create super admin role if not exists
    await ensureSuperAdmin(userId, email);
    return { approved: true, status: 'approved', role: 'super_admin' };
  }

  const roleRecord = await getUserRole(userId);

  if (!roleRecord) {
    // New user — create pending record
    if (email) {
      await createUserRole(userId, email);
    }
    return { approved: false, status: 'pending', role: 'user' };
  }

  return {
    approved: roleRecord.status === 'approved',
    status: roleRecord.status,
    role: roleRecord.role,
  };
}

// ─── Create user role (on signup) ────────────────────────────────────
export async function createUserRole(userId: string, email: string): Promise<void> {
  try {
    const db = getServiceClient();

    // Check if already exists
    const { data: existing } = await db
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (existing && existing.length > 0) return;

    const isSuperAdmin = email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

    await db.from('user_roles').insert({
      user_id: userId,
      email: email.toLowerCase(),
      role: isSuperAdmin ? 'super_admin' : 'user',
      status: isSuperAdmin ? 'approved' : 'pending',
      approved_by: isSuperAdmin ? 'system' : null,
      approved_at: isSuperAdmin ? new Date().toISOString() : null,
    });

    console.log(`[UserRoles] Created role for ${email} — ${isSuperAdmin ? 'super_admin (auto-approved)' : 'user (pending)'}`);
  } catch (err) {
    console.error('[UserRoles] createUserRole error:', err);
  }
}

// ─── Ensure super admin exists ───────────────────────────────────────
async function ensureSuperAdmin(userId: string, email: string): Promise<void> {
  try {
    const db = getServiceClient();
    const { data } = await db
      .from('user_roles')
      .select('id, role, status')
      .eq('user_id', userId)
      .single();

    if (!data) {
      // Create super admin record
      await db.from('user_roles').insert({
        user_id: userId,
        email: email.toLowerCase(),
        role: 'super_admin',
        status: 'approved',
        approved_by: 'system',
        approved_at: new Date().toISOString(),
      });
    } else if (data.role !== 'super_admin' || data.status !== 'approved') {
      // Upgrade to super admin
      await db.from('user_roles').update({
        role: 'super_admin',
        status: 'approved',
        approved_by: 'system',
        approved_at: new Date().toISOString(),
      }).eq('id', data.id);
    }
  } catch {}
}

// ─── Admin: Approve a user ───────────────────────────────────────────
export async function approveUser(userId: string, approvedBy: string): Promise<boolean> {
  try {
    const db = getServiceClient();
    const { error } = await db.from('user_roles').update({
      status: 'approved',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);

    return !error;
  } catch { return false; }
}

// ─── Admin: Revoke a user ────────────────────────────────────────────
export async function revokeUser(userId: string, revokedBy: string): Promise<boolean> {
  try {
    const db = getServiceClient();
    const { error } = await db.from('user_roles').update({
      status: 'revoked',
      approved_by: revokedBy,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);

    return !error;
  } catch { return false; }
}

// ─── Admin: Change user role ─────────────────────────────────────────
export async function changeUserRole(userId: string, newRole: UserRole): Promise<boolean> {
  try {
    const db = getServiceClient();
    const { error } = await db.from('user_roles').update({
      role: newRole,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);

    return !error;
  } catch { return false; }
}

// ─── Admin: Get all users ────────────────────────────────────────────
export async function getAllUsers(): Promise<UserRoleRecord[]> {
  try {
    const db = getServiceClient();
    const { data, error } = await db
      .from('user_roles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      email: row.email,
      role: row.role,
      status: row.status,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch { return []; }
}
