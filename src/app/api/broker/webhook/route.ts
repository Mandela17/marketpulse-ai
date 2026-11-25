// API Route: Upstox v3 Notifier Webhook Receiver
// Receives fresh `access_token` (and optional `extended_token`) automatically after user taps
// Approve on WhatsApp / Upstox mobile notification, then stores it in Supabase.

import { NextResponse } from 'next/server';
import {
  saveUpstoxToken,
  saveUpstoxAnalyticsToken,
  parseUpstoxExpiry,
  updatePendingTokenRequestStatus,
} from '@/lib/upstoxTokenStore';

export const dynamic = 'force-dynamic';

// GET: Quick reachability test for Upstox webhook verification
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'MarketPulse Upstox Notifier Webhook',
    ready: true,
  });
}

// POST: Receive Upstox token approval payload
export async function POST(request: Request) {
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // Upstox payloads may place fields at top-level or inside `body.data`
  const payload = body?.data && typeof body.data === 'object' ? body.data : body;

  const expectedClientId = process.env.NEXT_PUBLIC_UPSTOX_CLIENT_ID?.trim();
  if (expectedClientId && payload?.client_id && String(payload.client_id).trim() !== expectedClientId) {
    console.warn('[Upstox Webhook] Rejected client_id mismatch');
    return NextResponse.json({ error: 'client_id mismatch' }, { status: 403 });
  }

  const msgType = String(payload?.message_type || body?.message_type || '').toLowerCase();
  const rawStatus = String(payload?.status || body?.status || '').toLowerCase();

  // Handle user rejection notifications cleanly
  if (rawStatus === 'rejected' || msgType.includes('reject')) {
    await updatePendingTokenRequestStatus('rejected');
    return NextResponse.json({ received: true, status: 'rejected' });
  }

  const accessToken = typeof payload?.access_token === 'string' ? payload.access_token.trim() : '';
  const extendedToken =
    typeof payload?.extended_token === 'string' ? payload.extended_token.trim() : '';

  if (!accessToken || accessToken.length < 10) {
    return NextResponse.json({ received: true, ignored: true, reason: 'No access_token in payload' });
  }

  // Verify the token live with Upstox before persisting (prevents unauthenticated spoofed writes)
  let verifiedUserId = String(payload?.user_id || 'upstox_user');
  try {
    const profileRes = await fetch('https://api.upstox.com/v2/user/profile', {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(6000),
    });

    if (profileRes.status === 401) {
      console.warn('[Upstox Webhook] Rejected unverified access_token (Upstox returned 401)');
      return NextResponse.json({ error: 'Token verification failed' }, { status: 401 });
    }

    if (profileRes.ok) {
      const profileJson = await profileRes.json();
      if (profileJson?.data?.user_id) {
        verifiedUserId = String(profileJson.data.user_id);
      }
    }
  } catch (err: any) {
    console.warn('[Upstox Webhook] Profile verification error (continuing):', err?.message);
  }

  const tradingExpiry = parseUpstoxExpiry(payload?.expires_at, accessToken, 'trading');
  const savedTrading = await saveUpstoxToken(accessToken, verifiedUserId, tradingExpiry, 'trading');

  if (extendedToken && extendedToken.length > 10) {
    await saveUpstoxAnalyticsToken(extendedToken, verifiedUserId);
  }

  if (savedTrading) {
    await updatePendingTokenRequestStatus('approved');
  }

  return NextResponse.json({
    received: true,
    saved: savedTrading,
    userId: verifiedUserId,
    expiresAt: tradingExpiry,
    extendedTokenSaved: Boolean(extendedToken && extendedToken.length > 10),
  });
}

