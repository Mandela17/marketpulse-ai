// API Route: Upstox v3 Notifier Webhook Receiver
// Receives fresh `access_token` (and optional `extended_token`) automatically after user taps
// Approve on WhatsApp / Upstox mobile notification, then stores it in Supabase.

import { NextResponse } from 'next/server';
import {
  saveUpstoxToken,
  saveUpstoxAnalyticsToken,
  parseUpstoxExpiry,
  sanitizeUpstoxToken,
  updatePendingTokenRequestStatus,
} from '@/lib/upstoxTokenStore';
import { verifyUpstoxTokenLive } from '@/lib/upstoxTrade';

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

  const accessToken = sanitizeUpstoxToken(payload?.access_token);
  const extendedToken = sanitizeUpstoxToken(payload?.extended_token);

  if (!accessToken || accessToken.length < 10) {
    return NextResponse.json({ received: true, ignored: true, reason: 'No access_token in payload' });
  }

  // Verify the token live with Upstox (with Snipy proxy fallback) before persisting
  const check = await verifyUpstoxTokenLive(accessToken, 'trading');
  if (!check.valid && !check.networkError) {
    console.warn('[Upstox Webhook] Rejected unverified access_token:', check.errorCode, check.message);
    return NextResponse.json({ error: check.message || 'Token verification failed' }, { status: 401 });
  }

  const verifiedUserId =
    check.userId && check.userId !== 'admin'
      ? check.userId
      : String(payload?.user_id || 'upstox_user');

  const tokenKind = check.tokenKind;
  const tradingExpiry = parseUpstoxExpiry(payload?.expires_at, check.sanitizedToken, tokenKind);
  const savedTrading = await saveUpstoxToken(check.sanitizedToken, verifiedUserId, tradingExpiry, tokenKind);

  if (extendedToken && extendedToken.length > 10) {
    await saveUpstoxAnalyticsToken(extendedToken, verifiedUserId);
  }

  if (savedTrading && tokenKind === 'trading') {
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

