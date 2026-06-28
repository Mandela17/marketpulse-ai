// Server-side Upstox Token Store
// Persists OAuth access tokens in Supabase for use by cron jobs and server-side API calls.
// Tokens are stored with expiry tracking and auto-validation.

import { getServiceClient } from './supabase';

export interface StoredToken {
  accessToken: string;
  userId: string;
  expiresAt: string;  // ISO timestamp
  updatedAt: string;
  isValid: boolean;
}

const TABLE = 'broker_tokens';

/**
 * Save or update the Upstox access token in Supabase.
 * Uses upsert keyed on provider + user_id.
 */
export async function saveUpstoxToken(
  accessToken: string,
  userId: string,
  expiresAt?: string
): Promise<boolean> {
  try {
    const db = getServiceClient();
    const now = new Date().toISOString();
    // Upstox tokens expire at end of trading day (~3:30 PM IST next day)
    const expiry = expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error } = await db
      .from(TABLE)
      .upsert({
        provider: 'upstox',
        user_id: userId,
        access_token: accessToken,
        expires_at: expiry,
        updated_at: now,
        is_valid: true,
      }, { onConflict: 'provider,user_id' });

    if (error) {
      console.error('[TokenStore] Save error:', error.message);
      return false;
    }

    console.log(`[TokenStore] Saved Upstox token for user ${userId}, expires ${expiry}`);
    return true;
  } catch (err: any) {
    console.error('[TokenStore] Exception:', err.message);
    return false;
  }
}

/**
 * Retrieve the most recent valid Upstox token from Supabase.
 * Returns null if no valid token exists or if it has expired.
 */
export async function getUpstoxToken(): Promise<StoredToken | null> {
  try {
    const db = getServiceClient();

    const { data, error } = await db
      .from(TABLE)
      .select('*')
      .eq('provider', 'upstox')
      .eq('is_valid', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;

    // Check if token has expired
    const expiresAt = new Date(data.expires_at);
    if (expiresAt <= new Date()) {
      // Mark as invalid
      await db.from(TABLE).update({ is_valid: false }).eq('id', data.id);
      console.log('[TokenStore] Token expired, marked invalid');
      return null;
    }

    return {
      accessToken: data.access_token,
      userId: data.user_id,
      expiresAt: data.expires_at,
      updatedAt: data.updated_at,
      isValid: true,
    };
  } catch {
    return null;
  }
}

/**
 * Invalidate all tokens for a provider (useful on logout or token refresh failure).
 */
export async function invalidateUpstoxTokens(): Promise<void> {
  try {
    const db = getServiceClient();
    await db.from(TABLE).update({ is_valid: false }).eq('provider', 'upstox');
  } catch {}
}

/**
 * Make an authenticated Upstox API call using the stored token.
 * Returns null if no valid token is available.
 */
export async function upstoxFetch(endpoint: string, options?: RequestInit): Promise<any | null> {
  const token = await getUpstoxToken();
  if (!token) {
    console.warn('[TokenStore] No valid Upstox token available for server-side call');
    return null;
  }

  try {
    const res = await fetch(`https://api.upstox.com/v2${endpoint}`, {
      ...options,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token.accessToken}`,
        ...(options?.headers || {}),
      },
    });

    if (res.status === 401) {
      // Token rejected by Upstox — mark invalid
      await invalidateUpstoxTokens();
      console.error('[TokenStore] Upstox returned 401, token invalidated');
      return null;
    }

    return await res.json();
  } catch (err: any) {
    console.error('[TokenStore] Fetch error:', err.message);
    return null;
  }
}
