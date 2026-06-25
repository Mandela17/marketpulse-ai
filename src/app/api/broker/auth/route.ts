import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { apiKey, apiSecret, requestToken, provider, code, redirectUri } = await request.json();

    // ─── UPSTOX OAuth2 Token Exchange ───────────────────────────
    if (provider === 'upstox') {
      if (!apiKey || !apiSecret || !code || !redirectUri) {
        return NextResponse.json({ error: 'Missing Upstox OAuth parameters (apiKey, apiSecret, code, redirectUri)' }, { status: 400 });
      }

      const response = await fetch('https://api.upstox.com/v2/login/authorization/token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code: code,
          client_id: apiKey,
          client_secret: apiSecret,
          redirect_uri: redirectUri,
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

      return NextResponse.json({
        accessToken: data.access_token,
        userId: data.user_id,
        expiresAt: data.expires_at,
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
