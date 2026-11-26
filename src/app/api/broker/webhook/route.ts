// API Route: Upstox v3 Notifier Webhook Receiver
// Receives fresh `access_token` (and optional `extended_token`) automatically after user taps
// Approve on WhatsApp / Upstox mobile notification, then stores it in Supabase.

import { NextResponse } from 'next/server';
import {
  saveUpstoxToken,
  saveUpstoxAnalyticsToken,
  parseUpstoxExpiry,
  sanitizeUpstoxToken,
  saveWebhookDebugEvent,
  updatePendingTokenRequestStatus,
} from '@/lib/upstoxTokenStore';
import { verifyUpstoxTokenLive } from '@/lib/upstoxTrade';

export const dynamic = 'force-dynamic';

/** Parse incoming JSON, form-urlencoded, or stringified nested payload safely. */
async function parseWebhookBody(request: Request): Promise<{ body: any; contentType: string; rawLength: number }> {
  const contentType = request.headers.get('content-type') || '';
  const rawText = await request.text();
  if (!rawText || !rawText.trim()) {
    return { body: null, contentType, rawLength: 0 };
  }

  try {
    return { body: JSON.parse(rawText), contentType, rawLength: rawText.length };
  } catch {
    if (contentType.includes('application/x-www-form-urlencoded') || rawText.includes('=')) {
      try {
        const params = new URLSearchParams(rawText);
        const obj: Record<string, any> = {};
        for (const [k, v] of params.entries()) {
          if ((k === 'data' || k === 'payload') && v.trim().startsWith('{')) {
            try {
              obj[k] = JSON.parse(v);
              continue;
            } catch {}
          }
          obj[k] = v;
        }
        if (Object.keys(obj).length > 0) {
          return { body: obj, contentType, rawLength: rawText.length };
        }
      } catch {}
    }
    return { body: null, contentType, rawLength: rawText.length };
  }
}

function unwrapPayload(body: any): any {
  if (!body || typeof body !== 'object') return null;
  if (body.data && typeof body.data === 'object') return body.data;
  if (body.payload && typeof body.payload === 'object') return body.payload;
  return body;
}

// GET: Quick reachability test for Upstox webhook verification
export async function GET() {
  return NextResponse.json({
    ok: true,
    status: 'success',
    service: 'MarketPulse Upstox Notifier Webhook',
    ready: true,
  });
}

// POST: Receive Upstox token approval payload
export async function POST(request: Request) {
  const receivedAt = new Date().toISOString();
  const { body, contentType, rawLength } = await parseWebhookBody(request);

  if (!body) {
    await saveWebhookDebugEvent({
      receivedAt,
      contentType,
      outcome: 'invalid_payload',
      error: `Could not parse request body (len=${rawLength})`,
    });
    return NextResponse.json({ error: 'Invalid payload format' }, { status: 400 });
  }

  const payload = unwrapPayload(body);
  const bodyKeys = payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 20) : [];
  const msgType = String(payload?.message_type || body?.message_type || '').toLowerCase();
  const rawStatus = String(payload?.status || body?.status || '').toLowerCase();
  const incomingClientId = String(payload?.client_id || body?.client_id || '').trim();
  const accessToken = sanitizeUpstoxToken(
    payload?.access_token ?? payload?.accessToken ?? payload?.token
  );
  const extendedToken = sanitizeUpstoxToken(
    payload?.extended_token ?? payload?.extendedToken
  );

  // Record arrival immediately so diagnostics are never lost if downstream steps fail
  await saveWebhookDebugEvent({
    receivedAt,
    contentType,
    bodyKeys,
    clientId: incomingClientId ? `...${incomingClientId.slice(-6)}` : undefined,
    userId: payload?.user_id ? String(payload.user_id) : undefined,
    messageType: msgType || undefined,
    rawStatus: rawStatus || undefined,
    hasAccessToken: Boolean(accessToken),
    tokenLength: accessToken.length,
    outcome: 'received',
  });

  const expectedClientId = process.env.NEXT_PUBLIC_UPSTOX_CLIENT_ID?.trim();
  if (
    expectedClientId &&
    incomingClientId &&
    incomingClientId.toLowerCase() !== expectedClientId.toLowerCase()
  ) {
    const errMsg = `client_id mismatch (got ...${incomingClientId.slice(-6)}, expected ...${expectedClientId.slice(-6)})`;
    console.warn('[Upstox Webhook]', errMsg);
    await saveWebhookDebugEvent({
      receivedAt,
      contentType,
      bodyKeys,
      clientId: `...${incomingClientId.slice(-6)}`,
      messageType: msgType || undefined,
      rawStatus: rawStatus || undefined,
      hasAccessToken: Boolean(accessToken),
      tokenLength: accessToken.length,
      outcome: 'client_id_mismatch',
      error: errMsg,
    });
    return NextResponse.json({ error: errMsg }, { status: 403 });
  }

  // Handle user rejection notifications cleanly
  if (rawStatus === 'rejected' || msgType.includes('reject')) {
    await Promise.all([
      updatePendingTokenRequestStatus('rejected', {
        lastWebhookAt: receivedAt,
        lastWebhookOutcome: 'rejected_by_user',
      }),
      saveWebhookDebugEvent({
        receivedAt,
        contentType,
        bodyKeys,
        userId: payload?.user_id ? String(payload.user_id) : undefined,
        messageType: msgType || undefined,
        rawStatus: rawStatus || undefined,
        outcome: 'rejected',
      }),
    ]);
    return NextResponse.json({ status: 'success', received: true, approvalStatus: 'rejected' });
  }

  if (!accessToken || accessToken.length < 10) {
    await saveWebhookDebugEvent({
      receivedAt,
      contentType,
      bodyKeys,
      messageType: msgType || undefined,
      rawStatus: rawStatus || undefined,
      hasAccessToken: false,
      tokenLength: accessToken.length,
      outcome: 'ignored_no_token',
    });
    return NextResponse.json({ status: 'success', received: true, ignored: true, reason: 'No access_token in payload' });
  }

  // Fast verification with brief propagation retry in case Upstox calls webhook concurrently with minting
  let check = await verifyUpstoxTokenLive(accessToken, 'trading');
  if (!check.valid && !check.networkError && !check.expiredByJwt) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    check = await verifyUpstoxTokenLive(accessToken, 'trading');
  }

  if (!check.valid && !check.networkError) {
    console.warn('[Upstox Webhook] Rejected unverified access_token:', check.errorCode, check.message);
    await saveWebhookDebugEvent({
      receivedAt,
      contentType,
      bodyKeys,
      clientId: incomingClientId ? `...${incomingClientId.slice(-6)}` : undefined,
      userId: payload?.user_id ? String(payload.user_id) : undefined,
      messageType: msgType || undefined,
      hasAccessToken: true,
      tokenLength: accessToken.length,
      outcome: 'verification_failed',
      error: check.message || 'Token verification failed',
    });
    return NextResponse.json({ error: check.message || 'Token verification failed' }, { status: 401 });
  }

  const verifiedUserId =
    check.userId && check.userId !== 'admin'
      ? check.userId
      : String(payload?.user_id || 'upstox_user');

  const tokenKind = check.tokenKind;
  const tradingExpiry = parseUpstoxExpiry(payload?.expires_at, check.sanitizedToken, tokenKind);
  const savedTrading = await saveUpstoxToken(check.sanitizedToken, verifiedUserId, tradingExpiry, tokenKind);

  const postSaveTasks: Promise<any>[] = [
    saveWebhookDebugEvent({
      receivedAt,
      contentType,
      bodyKeys,
      clientId: incomingClientId ? `...${incomingClientId.slice(-6)}` : undefined,
      userId: verifiedUserId,
      messageType: msgType || undefined,
      hasAccessToken: true,
      tokenLength: accessToken.length,
      outcome: savedTrading ? `saved_${tokenKind}` : 'db_save_failed',
    }),
  ];

  if (extendedToken && extendedToken.length > 10) {
    postSaveTasks.push(saveUpstoxAnalyticsToken(extendedToken, verifiedUserId));
  }

  if (savedTrading && tokenKind === 'trading') {
    postSaveTasks.push(
      updatePendingTokenRequestStatus('approved', {
        lastWebhookAt: receivedAt,
        lastWebhookOutcome: 'saved_trading',
      })
    );
  }

  await Promise.all(postSaveTasks);

  return NextResponse.json({
    status: 'success',
    received: true,
    saved: savedTrading,
    tokenKind,
    userId: verifiedUserId,
    expiresAt: tradingExpiry,
    extendedTokenSaved: Boolean(extendedToken && extendedToken.length > 10),
  });
}

