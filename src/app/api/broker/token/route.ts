// API Route: Manage Upstox access tokens server-side (Daily Trading + 1-Year Analytics)
// Supports storing either a daily trading token (expires 3:30 AM IST) or a 1-year Analytics token.

import { NextResponse } from 'next/server';
import {
  saveUpstoxToken,
  getUpstoxTradingToken,
  getUpstoxAnalyticsToken,
  invalidateUpstoxTokens,
  isLongLivedToken,
  parseUpstoxExpiry,
  type UpstoxTokenKind,
} from '@/lib/upstoxTokenStore';

export const dynamic = 'force-dynamic';

// GET: Check server-side trading and analytics token status
export async function GET() {
  try {
    const [trading, analytics] = await Promise.all([
      getUpstoxTradingToken(),
      getUpstoxAnalyticsToken(),
    ]);

    const active = trading || analytics;
    if (!active) {
      return NextResponse.json({
        connected: false,
        tradingConnected: false,
        analyticsConnected: false,
        reason: 'No stored token',
      });
    }

    // Verify active trading token if present (analytics token validated via market-quote fallback)
    if (trading) {
      try {
        const testRes = await fetch('https://api.upstox.com/v2/user/get-funds-and-margin', {
          headers: { Accept: 'application/json', Authorization: `Bearer ${trading.accessToken}` },
        });
        if (testRes.status === 401) {
          await invalidateUpstoxTokens({ token: trading.accessToken });
          if (!analytics) {
            return NextResponse.json({
              connected: false,
              tradingConnected: false,
              analyticsConnected: false,
              reason: 'Trading token expired or revoked by Upstox',
            });
          }
        }
      } catch {
        // Network error — keep existing DB validity state
      }
    }

    return NextResponse.json({
      connected: true,
      verified: true,
      tradingConnected: Boolean(trading),
      analyticsConnected: Boolean(analytics),
      userId: active.userId,
      expiresAt: active.expiresAt,
      updatedAt: active.updatedAt,
    });
  } catch (err: any) {
    return NextResponse.json({ connected: false, error: err.message }, { status: 500 });
  }
}

// POST: Store an Upstox token (daily trading OR 1-year analytics)
export async function POST(request: Request) {
  try {
    const { accessToken, source, tokenType } = await request.json();

    if (!accessToken || typeof accessToken !== 'string' || accessToken.trim().length < 10) {
      return NextResponse.json({ error: 'Valid access token required' }, { status: 400 });
    }

    const cleanToken = accessToken.trim();
    const detectedLongLived = isLongLivedToken(cleanToken);
    const effectiveType: UpstoxTokenKind =
      tokenType === 'analytics' || detectedLongLived ? 'analytics' : 'trading';

    let userId = 'admin';
    try {
      const profileRes = await fetch('https://api.upstox.com/v2/user/profile', {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${cleanToken}`,
        },
      });

      if (profileRes.status === 401) {
        return NextResponse.json({ error: 'Invalid or expired access token' }, { status: 401 });
      }

      if (profileRes.ok) {
        const profile = await profileRes.json();
        userId = profile.data?.user_id || profile.data?.email || 'admin';
      } else if (profileRes.status === 403 && effectiveType === 'analytics') {
        // Analytics tokens without static IP may get 403 on user/profile while market-quote works
        const quoteCheck = await fetch(
          `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent('NSE_INDEX|Nifty 50')}`,
          { headers: { Accept: 'application/json', Authorization: `Bearer ${cleanToken}` } }
        );
        if (quoteCheck.status === 401) {
          return NextResponse.json({ error: 'Invalid or expired Analytics token' }, { status: 401 });
        }
      }
    } catch {
      // Transient Upstox network error — allow save
    }

    const expiryIso = parseUpstoxExpiry(undefined, cleanToken, effectiveType);
    const saved = await saveUpstoxToken(cleanToken, userId, expiryIso, effectiveType);

    if (!saved) {
      return NextResponse.json({ error: 'Failed to store token in database' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      tokenType: effectiveType,
      autoDetectedAnalytics: tokenType !== 'analytics' && detectedLongLived,
      userId,
      expiresAt: expiryIso,
      source: source || 'manual',
      message:
        effectiveType === 'analytics'
          ? '1-year Analytics token stored. Market quotes, NIFTY/SENSEX & charts stay connected continuously.'
          : 'Trading token stored (valid until 3:30 AM IST).',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Disconnect trading, analytics, or all tokens (?scope=trading|analytics|all)
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const scopeParam = searchParams.get('scope');
    const scope =
      scopeParam === 'trading' || scopeParam === 'analytics' || scopeParam === 'all'
        ? scopeParam
        : 'all';

    await invalidateUpstoxTokens(scope);
    return NextResponse.json({
      success: true,
      scope,
      message:
        scope === 'trading'
          ? 'Upstox daily trading session disconnected (1-year Analytics preserved if set).'
          : scope === 'analytics'
            ? 'Upstox 1-year Analytics token disconnected.'
            : 'All Upstox tokens invalidated.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
