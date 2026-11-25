import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  saveUpstoxToken,
  saveUpstoxAnalyticsToken,
  parseUpstoxExpiry,
  updatePendingTokenRequestStatus,
} from '@/lib/upstoxTokenStore';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { apiKey, apiSecret, requestToken, provider, code, redirectUri } = await request.json();

    // ─── UPSTOX OAuth2 Token Exchange ───────────────────────────
    if (provider === 'upstox') {
      // Prefer server-side env vars (secret never leaves the server)
      const clientId = process.env.NEXT_PUBLIC_UPSTOX_CLIENT_ID || apiKey;
      const clientSecret = process.env.UPSTOX_CLIENT_SECRET || apiSecret;
      const callbackUri = redirectUri || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/broker`;

      if (!clientId || !clientSecret || !code) {
        return NextResponse.json({ error: 'Missing Upstox OAuth parameters (clientId, clientSecret, code)' }, { status: 400 });
      }

      const response = await fetch('https://api.upstox.com/v2/login/authorization/token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code: code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: callbackUri,
          grant_type: 'authorization_code',
        }),
      });

      const data = await response.json();

      if (!response.ok || data.status === 'error') {
        console.error('[Upstox Token Exchange Error]:', {
          status: response.status,
          statusText: response.statusText,
          data
        });
        return NextResponse.json({
          error: data.message || 'Failed token exchange with Upstox',
          details: data,
        }, { status: response.status });
      }

      const userId = data.user_id || 'default';
      const tradingExpiry = parseUpstoxExpiry(data.expires_at, data.access_token, 'trading');

      // Persist daily trading token + optional 1-year extended token to Supabase
      await saveUpstoxToken(data.access_token, userId, tradingExpiry, 'trading').catch((err) =>
        console.error('[TokenStore] Failed to persist trading token:', err)
      );

      if (data.extended_token && typeof data.extended_token === 'string') {
        await saveUpstoxAnalyticsToken(data.extended_token, userId).catch((err) =>
          console.error('[TokenStore] Failed to persist extended analytics token:', err)
        );
      }

      await updatePendingTokenRequestStatus('approved');

      return NextResponse.json({
        accessToken: data.access_token,
        extendedTokenSaved: Boolean(data.extended_token),
        userId: data.user_id,
        expiresAt: tradingExpiry,
      });
    }

    // ─── ZERODHA Kite Token Exchange ────────────────────────────
    if (!apiKey || !apiSecret || !requestToken) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Zerodha Kite session token checksum requirement:
    // SHA256 of api_key + request_token + api_secret
    const hash = crypto.createHash('sha256');
    hash.update(apiKey + requestToken + apiSecret);
    const checksum = hash.digest('hex');

    const response = await fetch('https://api.kite.trade/session/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Kite-Version': '3',
      },
      body: new URLSearchParams({
        api_key: apiKey,
        request_token: requestToken,
        checksum: checksum,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.status === 'error') {
      return NextResponse.json({ 
        error: data.message || 'Failed token exchange with Zerodha',
        details: data 
      }, { status: response.status });
    }

    // Return the access token and user info
    return NextResponse.json({
      accessToken: data.data.access_token,
      userName: data.data.user_name,
      userId: data.data.user_id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
