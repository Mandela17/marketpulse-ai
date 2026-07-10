// API route to check Upstox connectivity status
// GET /api/upstox-status

import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { getServiceClient } from '@/lib/supabase';

export async function GET() {
  try {
    const db = getServiceClient();

    const { data, error } = await db
      .from('broker_tokens')
      .select('*')
      .eq('provider', 'upstox')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return NextResponse.json({
        connected: false,
        status: 'not_configured',
        message: 'No Upstox account linked. Connect via Settings → Broker to get live data.',
        tokenPresent: false,
        tokenValid: false,
        expiresAt: null,
        updatedAt: null,
      });
    }

    const expiresAt = new Date(data.expires_at);
    const isExpired = expiresAt <= new Date();
    const isValid = data.is_valid && !isExpired;

    if (!isValid) {
      return NextResponse.json({
        connected: false,
        status: 'token_expired',
        message: `Upstox token expired on ${expiresAt.toLocaleDateString('en-IN', { 
          day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' 
        })}. Re-authenticate to resume live data.`,
        tokenPresent: true,
        tokenValid: false,
        expiresAt: data.expires_at,
        updatedAt: data.updated_at,
        userId: data.user_id,
      });
    }

    // Token exists and is valid — test connectivity with a lightweight API call
    let apiReachable = false;
    try {
      const testRes = await fetch('https://api.upstox.com/v2/user/profile', {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${data.access_token}`,
        },
      });
      apiReachable = testRes.ok;
      if (!apiReachable && testRes.status === 401) {
        // Token was rejected — mark invalid
        await db.from('broker_tokens').update({ is_valid: false }).eq('id', data.id);
        return NextResponse.json({
          connected: false,
          status: 'token_rejected',
          message: 'Upstox rejected the stored token (401 Unauthorized). Please re-authenticate.',
          tokenPresent: true,
          tokenValid: false,
          expiresAt: data.expires_at,
          updatedAt: data.updated_at,
        });
      }
    } catch {
      // Network issue — token exists but API unreachable
    }

    return NextResponse.json({
      connected: true,
      status: apiReachable ? 'live' : 'token_valid_api_unreachable',
      message: apiReachable
        ? 'Upstox is connected and live. All stock & shareholding data is real-time.'
        : 'Token is valid but Upstox API is temporarily unreachable. Data may fall back.',
      tokenPresent: true,
      tokenValid: true,
      expiresAt: data.expires_at,
      updatedAt: data.updated_at,
      userId: data.user_id,
    });
  } catch (err: any) {
    return NextResponse.json({
      connected: false,
      status: 'error',
      message: `Error checking Upstox status: ${err.message}`,
      tokenPresent: false,
      tokenValid: false,
      expiresAt: null,
      updatedAt: null,
    });
  }
}
