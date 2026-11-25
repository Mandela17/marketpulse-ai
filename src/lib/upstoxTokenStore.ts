// Server-side Upstox Token Store
// Persists daily Trading tokens (3:30 AM IST expiry), 1-year Analytics read tokens,
// and pending v3 Access Token Request state in Supabase `broker_tokens`.

import { getServiceClient } from './supabase';

export type UpstoxTokenKind = 'trading' | 'analytics';

export interface StoredToken {
  accessToken: string;
  userId: string;
  expiresAt: string; // ISO timestamp
  updatedAt: string;
  isValid: boolean;
  tokenKind: UpstoxTokenKind;
}

export interface PendingTokenRequest {
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  authorizationExpiry: string;
  requestedAt: string;
  requestedBy?: string;
}

const TABLE = 'broker_tokens';
export const TRADING_PROVIDER = 'upstox';
export const ANALYTICS_PROVIDER = 'upstox_analytics';
export const PENDING_REQUEST_PROVIDER = 'upstox_pending_request';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Clean accidental Bearer prefix, surrounding quotes, and line-breaks from pasted tokens. */
export function sanitizeUpstoxToken(rawToken: string | null | undefined): string {
  if (!rawToken || typeof rawToken !== 'string') return '';
  let s = rawToken.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/^Bearer\s+/i, '').trim();
  // Upstox tokens never contain whitespace; strip wrapped newlines/spaces from copy-paste
  return s.replace(/[\r\n\t\s]+/g, '');
}

/** Normalize epoch seconds vs epoch milliseconds into epoch milliseconds. */
function toEpochMs(raw: any): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num > 1e12 ? num : num * 1000;
}

/** Decode base64url JWT payload without verifying signature (for reading `exp`/`iat` metadata). */
export function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const clean = sanitizeUpstoxToken(token);
    const parts = clean.split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Extract ISO expiry string from JWT `exp` claim if present. */
export function getJwtExpiryIso(token: string): string | null {
  const payload = decodeJwtPayload(token);
  const expMs = toEpochMs(payload?.exp);
  if (!expMs) return null;
  return new Date(expMs).toISOString();
}

/** Extract JWT `iat` in ms if present. */
export function getJwtIssuedAtMs(token: string): number {
  const payload = decodeJwtPayload(token);
  return toEpochMs(payload?.iat);
}

/** Best-effort user identifier from JWT claims (`sub` / `user_id`), if embedded. */
export function getJwtUserId(token: string): string | null {
  const payload = decodeJwtPayload(token);
  const raw = payload?.user_id || payload?.sub || payload?.email;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/** True when `token` carries a JWT `exp` claim that has already passed (with optional skew). */
export function isJwtExpired(token: string | null | undefined, skewSeconds = 30): boolean {
  const clean = sanitizeUpstoxToken(token);
  if (!clean) return true;
  const payload = decodeJwtPayload(clean);
  const expMs = toEpochMs(payload?.exp);
  if (!expMs) return false;
  return expMs <= Date.now() + skewSeconds * 1000;
}

/** True when JWT expires more than 48 hours from now (typical for 1-year Analytics / extended tokens). */
export function isLongLivedToken(token: string): boolean {
  const payload = decodeJwtPayload(token);
  const expMs = toEpochMs(payload?.exp);
  if (!expMs) return false;
  return expMs - Date.now() > 48 * 60 * 60 * 1000;
}

/** Compute next 3:30 AM IST (= 22:00 UTC) cutoff strictly in the future. */
export function getNext330AmIstIso(fromDate = new Date()): string {
  const candidate = new Date(
    Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate(), 22, 0, 0, 0)
  );
  if (candidate.getTime() <= fromDate.getTime()) {
    candidate.setTime(candidate.getTime() + DAY_MS);
  }
  return candidate.toISOString();
}

/** Normalize Upstox `expires_at` / JWT `exp` values (ms, sec, or ISO) into an ISO string. */
export function parseUpstoxExpiry(
  rawExpiresAt: any,
  token: string,
  kind: UpstoxTokenKind = 'trading'
): string {
  if (rawExpiresAt !== undefined && rawExpiresAt !== null && rawExpiresAt !== '') {
    const asNum = Number(rawExpiresAt);
    if (Number.isFinite(asNum) && asNum > 0) {
      // Epoch seconds vs epoch milliseconds
      const ms = asNum > 1e12 ? asNum : asNum * 1000;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    if (typeof rawExpiresAt === 'string') {
      const d = new Date(rawExpiresAt);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }

  const jwtExp = token ? getJwtExpiryIso(token) : null;
  if (jwtExp) return jwtExp;

  if (kind === 'analytics') {
    return new Date(Date.now() + 365 * DAY_MS).toISOString();
  }
  return getNext330AmIstIso();
}

/** Save or update an Upstox trading or analytics token in Supabase. */
export async function saveUpstoxToken(
  accessToken: string,
  userId: string,
  expiresAt?: string | number | null,
  kind: UpstoxTokenKind = 'trading'
): Promise<boolean> {
  try {
    const db = getServiceClient();
    const now = new Date().toISOString();
    const provider = kind === 'analytics' ? ANALYTICS_PROVIDER : TRADING_PROVIDER;
    const expiry = parseUpstoxExpiry(expiresAt, accessToken, kind);

    // Deactivate older user_id rows for the same provider so single latest row wins cleanly
    await db
      .from(TABLE)
      .update({ is_valid: false })
      .eq('provider', provider)
      .neq('user_id', userId);

    const { error } = await db
      .from(TABLE)
      .upsert(
        {
          provider,
          user_id: userId,
          access_token: accessToken,
          expires_at: expiry,
          updated_at: now,
          is_valid: true,
        },
        { onConflict: 'provider,user_id' }
      );

    if (error) {
      console.error(`[TokenStore] Save error (${provider}):`, error.message);
      return false;
    }

    console.log(`[TokenStore] Saved ${provider} token for user ${userId}, expires ${expiry}`);
    return true;
  } catch (err: any) {
    console.error('[TokenStore] Exception:', err.message);
    return false;
  }
}

export async function saveUpstoxAnalyticsToken(
  accessToken: string,
  userId: string,
  expiresAt?: string | number | null
): Promise<boolean> {
  return saveUpstoxToken(accessToken, userId, expiresAt, 'analytics');
}

async function getTokenForKind(kind: UpstoxTokenKind): Promise<StoredToken | null> {
  try {
    const db = getServiceClient();
    const provider = kind === 'analytics' ? ANALYTICS_PROVIDER : TRADING_PROVIDER;

    const { data, error } = await db
      .from(TABLE)
      .select('*')
      .eq('provider', provider)
      .eq('is_valid', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;

    const expiresAt = new Date(data.expires_at);
    const expiredByDb = !Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date();
    const expiredByJwt = isJwtExpired(data.access_token);

    if (expiredByDb || expiredByJwt) {
      await db.from(TABLE).update({ is_valid: false }).eq('id', data.id);
      console.log(`[TokenStore] ${provider} token expired, marked invalid`);
      return null;
    }

    return {
      accessToken: data.access_token,
      userId: data.user_id,
      expiresAt: data.expires_at,
      updatedAt: data.updated_at,
      isValid: true,
      tokenKind: kind,
    };
  } catch {
    return null;
  }
}

/** Retrieve the active daily Trading token ONLY (never falls back to read-only Analytics token). */
export async function getUpstoxTradingToken(): Promise<StoredToken | null> {
  return getTokenForKind('trading');
}

/** Retrieve the active 1-year Analytics / extended read-only token ONLY. */
export async function getUpstoxAnalyticsToken(): Promise<StoredToken | null> {
  return getTokenForKind('analytics');
}

/**
 * Retrieve an active Upstox token for read operations (quotes, charts, cron, option chain).
 * Prefers the daily Trading token if valid; otherwise falls back seamlessly to the 1-year Analytics token.
 */
export async function getUpstoxToken(): Promise<StoredToken | null> {
  const trading = await getUpstoxTradingToken();
  if (trading) return trading;
  return getUpstoxAnalyticsToken();
}

/**
 * Resolve the best valid token for read-only endpoints, ignoring expired `X-Upstox-Token` client headers
 * so stale browser localStorage never overrides a fresh server Trading or 1-year Analytics token.
 */
export async function resolveReadUpstoxToken(clientToken?: string | null): Promise<string> {
  const trimmed = clientToken?.trim() || '';
  if (trimmed && trimmed !== 'sandbox' && trimmed !== 'mock' && trimmed.length > 10 && !isJwtExpired(trimmed)) {
    return trimmed;
  }
  const stored = await getUpstoxToken();
  return stored?.accessToken || '';
}

/**
 * Invalidate stored Upstox tokens.
 * Defaults to `'trading'` so an expired daily trading token never wipes a valid 1-year Analytics token.
 * Passing `{ token }` invalidates only the exact matching token string.
 */
export async function invalidateUpstoxTokens(
  target: 'trading' | 'analytics' | 'all' | { token: string } = 'trading'
): Promise<void> {
  try {
    const db = getServiceClient();
    if (typeof target === 'object' && target.token) {
      await db.from(TABLE).update({ is_valid: false }).eq('access_token', target.token);
      return;
    }
    if (target === 'all') {
      await db
        .from(TABLE)
        .update({ is_valid: false })
        .in('provider', [TRADING_PROVIDER, ANALYTICS_PROVIDER]);
      return;
    }
    const provider = target === 'analytics' ? ANALYTICS_PROVIDER : TRADING_PROVIDER;
    await db.from(TABLE).update({ is_valid: false }).eq('provider', provider);
  } catch {}
}

/** Persist latest Access Token Request metadata for polling status on `/broker` and `/trade`. */
export async function savePendingTokenRequest(req: PendingTokenRequest): Promise<void> {
  try {
    const db = getServiceClient();
    const now = new Date().toISOString();
    await db
      .from(TABLE)
      .upsert(
        {
          provider: PENDING_REQUEST_PROVIDER,
          user_id: 'default',
          access_token: JSON.stringify(req),
          expires_at: req.authorizationExpiry,
          updated_at: now,
          is_valid: req.status === 'pending',
        },
        { onConflict: 'provider,user_id' }
      );
  } catch (err: any) {
    console.warn('[TokenStore] Failed to save pending token request:', err?.message);
  }
}

export async function getPendingTokenRequest(): Promise<PendingTokenRequest | null> {
  try {
    const db = getServiceClient();
    const { data, error } = await db
      .from(TABLE)
      .select('*')
      .eq('provider', PENDING_REQUEST_PROVIDER)
      .eq('user_id', 'default')
      .limit(1)
      .single();

    if (error || !data?.access_token) return null;
    const parsed = JSON.parse(data.access_token) as PendingTokenRequest;
    if (
      parsed.status === 'pending' &&
      parsed.authorizationExpiry &&
      new Date(parsed.authorizationExpiry) <= new Date()
    ) {
      return { ...parsed, status: 'expired' };
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function updatePendingTokenRequestStatus(
  status: 'approved' | 'rejected' | 'expired'
): Promise<void> {
  try {
    const existing = await getPendingTokenRequest();
    if (!existing) return;
    await savePendingTokenRequest({ ...existing, status });
  } catch {}
}

/** Make an authenticated read Upstox API call using the stored token (trading or analytics). */
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
        Accept: 'application/json',
        Authorization: `Bearer ${token.accessToken}`,
        ...(options?.headers || {}),
      },
    });

    if (res.status === 401) {
      await invalidateUpstoxTokens({ token: token.accessToken });
      console.error('[TokenStore] Upstox returned 401, token invalidated');
      return null;
    }

    return await res.json();
  } catch (err: any) {
    console.error('[TokenStore] Fetch error:', err.message);
    return null;
  }
}
