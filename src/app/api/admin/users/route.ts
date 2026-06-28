// Admin API: Manage user access (approve/revoke/role change)
// Only super_admin and admin can access this endpoint

import { NextResponse } from 'next/server';
import { isUserApproved, approveUser, revokeUser, changeUserRole, getAllUsers } from '@/lib/userRoles';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET: List all users (admin only)
export async function GET(request: Request) {
  try {
    // Get requesting user from auth header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const db = getServiceClient();
    const { data: { user } } = await db.auth.getUser(token);

    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check if requesting user is admin
    const { approved, role } = await isUserApproved(user.id, user.email || '');
    if (!approved || (role !== 'super_admin' && role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied. Admin only.' }, { status: 403 });
    }

    const users = await getAllUsers();
    return NextResponse.json({ users, requestingRole: role });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Approve, revoke, or change role
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const db = getServiceClient();
    const { data: { user } } = await db.auth.getUser(token);

    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check admin privileges
    const { approved, role: adminRole } = await isUserApproved(user.id, user.email || '');
    if (!approved || (adminRole !== 'super_admin' && adminRole !== 'admin')) {
      return NextResponse.json({ error: 'Access denied. Admin only.' }, { status: 403 });
    }

    const body = await request.json();
    const { action, userId, newRole } = body;

    if (!action || !userId) {
      return NextResponse.json({ error: 'action and userId required' }, { status: 400 });
    }

    // Only super_admin can change roles or manage other admins
    if (action === 'changeRole' && adminRole !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admin can change roles' }, { status: 403 });
    }

    let success = false;

    switch (action) {
      case 'approve':
        success = await approveUser(userId, user.email || user.id);
        break;
      case 'revoke':
        success = await revokeUser(userId, user.email || user.id);
        break;
      case 'changeRole':
        if (!newRole || !['user', 'admin', 'super_admin'].includes(newRole)) {
          return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
        }
        success = await changeUserRole(userId, newRole);
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ success, action, userId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
