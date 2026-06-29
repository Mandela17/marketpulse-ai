// API Route: Manage Upstox access token server-side
// Allows admins to store/retrieve/validate access tokens without client-side OAuth
// Tokens can be generated from the Upstox Developer Dashboard → "Generate" button

import { NextResponse } from 'next/server';
import { saveUpstoxToken, getUpstoxToken, invalidateUpstoxTokens } from '@/lib/upstoxTokenStore';

export const dynamic = 'force-dynamic';

// GET: Check if a valid server-side token exists
export async function GET(request: Request) {
  try {
    const token = await getUpstoxToken();

    if (token) {
      // Verify the token is still valid by making a lightweight Upstox API call
      let verified = false;
      try {
        const testRes = await fetch('https://api.upstox.com/v2/user/get-funds-and-margin', {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${token.accessToken}`,
          },
        });
        verified = testRes.ok || testRes.status === 403; // 403 = valid token but insufficient permissions (still valid)
        if (testRes.status === 401) {
          await invalidateUpstoxTokens();
          return NextResponse.json({
            connected: false,
            reason: 'Token expired or revoked by Upstox',
          });
        }
      } catch {
        // Network error — assume token might still be valid
        verified = true;
      }

      return NextResponse.json({
        connected: true,
        verified,
        userId: token.userId,
        expiresAt: token.expiresAt,
        updatedAt: token.updatedAt,
      });
    }

    return NextResponse.json({ connected: false, reason: 'No stored token' });
  } catch (err: any) {
    return NextResponse.json({ connected: false, error: err.message }, { status: 500 });
  }
}

// POST: Store an access token (generated from Upstox Developer Dashboard)
export async function POST(request: Request) {
  try {
    const { accessToken, source } = await request.json();

    if (!accessToken || typeof accessToken !== 'string' || accessToken.length < 10) {
      return NextResponse.json({ error: 'Valid access token required' }, { status: 400 });
    }

    // Validate token with Upstox API before storing
    let userId = 'admin';
    try {
      const profileRes = await fetch('https://api.upstox.com/v2/user/profile', {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (profileRes.status === 401) {
        return NextResponse.json({ error: 'Invalid or expired access token' }, { status: 401 });
      }

      if (profileRes.ok) {
        const profile = await profileRes.json();
        userId = profile.data?.user_id || profile.data?.email || 'admin';
      }
    } catch {
      // Can't verify — store anyway
    }

    // Upstox tokens expire at end of trading day (~3:30 PM IST next day)
    // Set expiry to tomorrow 6 AM IST to be safe
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 30, 0, 0); // 6 AM IST = 00:30 UTC

    const saved = await saveUpstoxToken(accessToken, userId, tomorrow.toISOString());

    if (!saved) {
      return NextResponse.json({ error: 'Failed to store token in database' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      userId,
      expiresAt: tomorrow.toISOString(),
      source: source || 'manual',
      message: 'Token stored. All server-side market data will now use Upstox.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Disconnect — invalidate all stored tokens
export async function DELETE() {
  try {
    await invalidateUpstoxTokens();
    return NextResponse.json({ success: true, message: 'All Upstox tokens invalidated' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
