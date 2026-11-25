// API Route: Trigger Upstox v3 Access Token Request (1-Tap WhatsApp / Upstox App Approval)
// Eliminates daily OTP/PIN entry — user approves notification on phone, webhook saves fresh token.

import { NextResponse } from 'next/server';
import { verifyAuthorizedTrader } from '@/lib/upstoxTrade';
import {
  savePendingTokenRequest,
  getPendingTokenRequest,
  parseUpstoxExpiry,
} from '@/lib/upstoxTokenStore';

export const dynamic = 'force-dynamic';

function getWebhookUrl(request: Request): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    return `${appUrl.replace(/\/+$/, '')}/api/broker/webhook`;
  }
  const url = new URL(request.url);
  return `${url.origin}/api/broker/webhook`;
}

function isCronAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  const auth = request.headers.get('Authorization') || '';
  return auth === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  const pendingRequest = await getPendingTokenRequest();
  return NextResponse.json({
    pendingRequest,
    webhookUrl: getWebhookUrl(request),
  });
}

export async function POST(request: Request) {
  // Allow either approved signed-in user OR cron-job.org morning trigger via CRON_SECRET
  let requestedBy = 'cron';
  if (!isCronAuthorized(request)) {
    const auth = await verifyAuthorizedTrader(request);
    if (!auth.trader) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: auth.status || 401 }
      );
    }
    requestedBy = auth.trader.email;
  }

  const clientId = process.env.NEXT_PUBLIC_UPSTOX_CLIENT_ID?.trim();
  const clientSecret = process.env.UPSTOX_CLIENT_SECRET?.trim();
  const webhookUrl = getWebhookUrl(request);

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error: 'NEXT_PUBLIC_UPSTOX_CLIENT_ID or UPSTOX_CLIENT_SECRET is not configured on the server.',
      },
      { status: 500 }
    );
  }

  try {
    const upstoxRes = await fetch(
      `https://api.upstox.com/v3/login/auth/token/request/${encodeURIComponent(clientId)}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ client_secret: clientSecret }),
        signal: AbortSignal.timeout(10000),
      }
    );

    const data = await upstoxRes.json().catch(() => ({}));

    if (!upstoxRes.ok || data?.status === 'error') {
      const errObj = data?.errors?.[0];
      const msg =
        errObj?.message ||
        data?.message ||
        `Upstox rejected token request (HTTP ${upstoxRes.status})`;
      const lower = msg.toLowerCase();
      const hint =
        lower.includes('notifier') || lower.includes('webhook') || upstoxRes.status === 400
          ? `Make sure Notifier Webhook URL in Upstox Developer Console → My Apps is set to: ${webhookUrl}`
          : undefined;

      return NextResponse.json(
        {
          success: false,
          error: msg,
          hint,
          webhookUrl,
          details: data,
        },
        { status: upstoxRes.status >= 400 ? upstoxRes.status : 400 }
      );
    }

    const authorizationExpiry = parseUpstoxExpiry(
      data?.data?.authorization_expiry,
      '',
      'trading'
    );

    const pendingRecord = {
      status: 'pending' as const,
      authorizationExpiry,
      requestedAt: new Date().toISOString(),
      requestedBy,
    };
    await savePendingTokenRequest(pendingRecord);

    return NextResponse.json({
      success: true,
      message: 'Approval request sent to your WhatsApp & Upstox App. Tap Approve once to connect.',
      authorizationExpiry,
      webhookUrl,
      pendingRequest: pendingRecord,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Failed to contact Upstox Access Token Request API',
        webhookUrl,
      },
      { status: 502 }
    );
  }
}

