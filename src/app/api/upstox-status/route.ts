// API route to check Upstox connectivity status across both:
// 1. Daily Trading Token (orders + live portfolio + data, expires 3:30 AM IST)
// 2. 1-Year Analytics Token (continuous read-only quotes, indices, charts & cron)
// GET /api/upstox-status

import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import {
  getUpstoxTradingToken,
  getUpstoxAnalyticsToken,
  getPendingTokenRequest,
  getLatestWebhookDebugEvent,
  invalidateUpstoxTokens,
} from '@/lib/upstoxTokenStore';
import { verifyUpstoxTokenLive } from '@/lib/upstoxTrade';
import { getServiceClient } from '@/lib/supabase';

function resolveWebhookUrl(request: Request): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    return `${appUrl.replace(/\/+$/, '')}/api/broker/webhook`;
  }
  return `${new URL(request.url).origin}/api/broker/webhook`;
}

export async function GET(request: Request) {
  const webhookUrl = resolveWebhookUrl(request);

  try {
    const [tradingToken, analyticsToken, pendingRequest, lastWebhookEvent] = await Promise.all([
      getUpstoxTradingToken(),
      getUpstoxAnalyticsToken(),
      getPendingTokenRequest(),
      getLatestWebhookDebugEvent(),
    ]);

    let tradingValid = Boolean(tradingToken);
    let tradingApiReachable = false;

    if (tradingToken) {
      const check = await verifyUpstoxTokenLive(tradingToken.accessToken, 'trading');
      if (!check.valid && !check.networkError) {
        await invalidateUpstoxTokens({ token: tradingToken.accessToken });
        tradingValid = false;
      } else if (check.tokenKind !== 'trading') {
        tradingValid = false;
      } else {
        tradingApiReachable = !check.networkError;
      }
    }

    let analyticsValid = Boolean(analyticsToken);
    if (analyticsToken && !tradingValid) {
      const check = await verifyUpstoxTokenLive(analyticsToken.accessToken, 'analytics');
      if (!check.valid && !check.networkError) {
        await invalidateUpstoxTokens({ token: analyticsToken.accessToken });
        analyticsValid = false;
      }
    }

    // Check most recent expired trading row only to display helpful expiry message when disconnected
    let expiredHint: { expiresAt: string; userId: string; updatedAt: string } | null = null;
    if (!tradingValid) {
      try {
        const db = getServiceClient();
        const { data: lastRow } = await db
          .from('broker_tokens')
          .select('expires_at, user_id, updated_at')
          .eq('provider', 'upstox')
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();
        if (lastRow?.expires_at) {
          expiredHint = {
            expiresAt: lastRow.expires_at,
            userId: lastRow.user_id,
            updatedAt: lastRow.updated_at,
          };
        }
      } catch {}
    }

    const anyConnected = tradingValid || analyticsValid;
    const activeToken = tradingValid ? tradingToken : analyticsValid ? analyticsToken : null;

    let status = 'not_configured';
    let message = 'No Upstox account linked. Connect via Broker API to enable live data and trading.';

    if (tradingValid) {
      status = tradingApiReachable ? 'live' : 'token_valid_api_unreachable';
      message = analyticsValid
        ? 'Upstox Live Trading & 1-Year Analytics tokens are both active.'
        : 'Upstox Live Trading is active (expires 3:30 AM IST).';
    } else if (analyticsValid) {
      status = 'analytics_only';
      message =
        '1-Year Analytics token is active for live quotes & charts. Tap Approve on WhatsApp/Upstox App when ready for live trading.';
    } else if (expiredHint) {
      status = 'token_expired';
      const expStr = new Date(expiredHint.expiresAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      message = `Daily trading token expired on ${expStr}. Request 1-tap approval or re-authenticate.`;
    }

    return NextResponse.json({
      connected: anyConnected,
      tradingConnected: tradingValid,
      analyticsConnected: analyticsValid,
      mode: tradingValid ? 'live_trading' : analyticsValid ? 'analytics_only' : 'disconnected',
      status,
      message,
      tokenPresent: Boolean(anyConnected || expiredHint),
      tokenValid: anyConnected,
      expiresAt: tradingValid
        ? tradingToken?.expiresAt
        : analyticsValid
          ? analyticsToken?.expiresAt
          : expiredHint?.expiresAt || null,
      updatedAt: activeToken?.updatedAt || expiredHint?.updatedAt || null,
      userId: activeToken?.userId || expiredHint?.userId || null,
      trading: {
        connected: tradingValid,
        userId: tradingToken?.userId || expiredHint?.userId || null,
        expiresAt: tradingToken?.expiresAt || expiredHint?.expiresAt || null,
        updatedAt: tradingToken?.updatedAt || null,
      },
      analytics: {
        connected: analyticsValid,
        userId: analyticsToken?.userId || null,
        expiresAt: analyticsToken?.expiresAt || null,
        updatedAt: analyticsToken?.updatedAt || null,
      },
      pendingRequest,
      lastWebhookEvent,
      webhookUrl,
    });
  } catch (err: any) {
    return NextResponse.json({
      connected: false,
      tradingConnected: false,
      analyticsConnected: false,
      status: 'error',
      message: `Error checking Upstox status: ${err.message}`,
      tokenPresent: false,
      tokenValid: false,
      expiresAt: null,
      updatedAt: null,
      webhookUrl,
    });
  }
}
