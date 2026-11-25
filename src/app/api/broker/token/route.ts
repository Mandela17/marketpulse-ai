// API Route: Manage Upstox access tokens server-side (Daily Trading + 1-Year Analytics)
// Supports storing either a daily trading token (expires 3:30 AM IST) or a 1-year Analytics token.

import { NextResponse } from 'next/server';
import {
  saveUpstoxToken,
  getUpstoxTradingToken,
  getUpstoxAnalyticsToken,
  invalidateUpstoxTokens,
  parseUpstoxExpiry,
  type UpstoxTokenKind,
} from '@/lib/upstoxTokenStore';
import { verifyUpstoxTokenLive } from '@/lib/upstoxTrade';

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

    let tradingConnected = Boolean(trading);
    if (trading) {
      const check = await verifyUpstoxTokenLive(trading.accessToken, 'trading');
      if (!check.valid && !check.networkError && check.tokenKind === 'trading') {
        await invalidateUpstoxTokens({ token: trading.accessToken });
        tradingConnected = false;
        if (!analytics) {
          return NextResponse.json({
            connected: false,
            tradingConnected: false,
            analyticsConnected: false,
            reason: check.message || 'Trading token expired or revoked by Upstox',
          });
        }
      }
    }

    const effectiveActive = tradingConnected && trading ? trading : analytics;
    if (!effectiveActive) {
      return NextResponse.json({
        connected: false,
        tradingConnected: false,
        analyticsConnected: false,
        reason: 'No active token',
      });
    }

    return NextResponse.json({
      connected: true,
      verified: true,
      tradingConnected,
      analyticsConnected: Boolean(analytics),
      userId: effectiveActive.userId,
      expiresAt: effectiveActive.expiresAt,
      updatedAt: effectiveActive.updatedAt,
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

    const preferredKind: UpstoxTokenKind = tokenType === 'analytics' ? 'analytics' : 'trading';
    const check = await verifyUpstoxTokenLive(accessToken, preferredKind);

    if (!check.valid) {
      return NextResponse.json(
        {
          error: check.message || 'Invalid or expired access token',
          code: check.errorCode,
          upstoxMessage: check.upstoxMessage,
        },
        { status: check.httpStatus || 401 }
      );
    }

    const expiryIso = parseUpstoxExpiry(undefined, check.sanitizedToken, check.tokenKind);
    const saved = await saveUpstoxToken(check.sanitizedToken, check.userId, expiryIso, check.tokenKind);

    if (!saved) {
      return NextResponse.json({ error: 'Failed to store token in database' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      tokenType: check.tokenKind,
      autoDetectedAnalytics: Boolean(check.autoDetectedAnalytics),
      userId: check.userId,
      expiresAt: expiryIso,
      source: source || 'manual',
      message:
        check.tokenKind === 'analytics'
          ? check.autoDetectedAnalytics
            ? 'Detected 1-year / read-only Analytics token and saved under Analytics (quotes, NIFTY/SENSEX & charts stay connected continuously).'
            : '1-year Analytics token stored. Market quotes, NIFTY/SENSEX & charts stay connected continuously.'
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
