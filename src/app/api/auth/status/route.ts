// API: Check user approval status
// Called by AuthContext on login to verify if user is approved

import { NextResponse } from 'next/server';
import { isUserApproved, createUserRole } from '@/lib/userRoles';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
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

    // Ensure user role exists
    await createUserRole(user.id, user.email || '');

    // Check status
    const result = await isUserApproved(user.id, user.email || '');

    return NextResponse.json({
      userId: user.id,
      email: user.email,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
