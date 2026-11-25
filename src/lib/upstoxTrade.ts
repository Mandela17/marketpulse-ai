// Shared Upstox Live & Sandbox Trading Helpers + Supabase Auth Guard
// Supports: Order Placement (V3 Live / V2 Sandbox), Modify, Cancel, Position Exit,
// Pre-trade Charges, Holdings, Positions, Funds/Margin, Order Book, Trades & Static IP check.

import tls from 'node:tls';
import https from 'node:https';
import { getServiceClient } from './supabase';
import { isUserApproved, type UserRole } from './userRoles';
import { getInstrumentKey } from './upstoxInstruments';
import {
  getUpstoxTradingToken,
  getUpstoxAnalyticsToken,
  invalidateUpstoxTokens,
  isJwtExpired,
  isLongLivedToken,
  getJwtIssuedAtMs,
  getJwtExpiryIso,
  getJwtUserId,
  sanitizeUpstoxToken,
  type UpstoxTokenKind,
} from './upstoxTokenStore';

export type TradingMode = 'live' | 'sandbox';
export type UpstoxTransactionType = 'BUY' | 'SELL';
export type UpstoxOrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
export type UpstoxProductType = 'D' | 'I' | 'MTF';
export type UpstoxValidity = 'DAY' | 'IOC';

export interface AuthorizedTrader {
  userId: string;
  email: string;
  role: UserRole;
}

export interface PlaceOrderInput {
  symbol: string;
  instrumentToken?: string;
  quantity: number;
  product: UpstoxProductType;
  validity: UpstoxValidity;
  orderType: UpstoxOrderType;
  transactionType: UpstoxTransactionType;
  price: number;
  triggerPrice?: number;
  disclosedQuantity?: number;
  isAmo?: boolean;
  slice?: boolean;
  tag?: string;
}

export interface ModifyOrderInput {
  orderId: string;
  quantity: number;
  orderType: UpstoxOrderType;
  validity: UpstoxValidity;
  price: number;
  triggerPrice?: number;
  disclosedQuantity?: number;
}

/** Verify caller holds an approved Supabase session before accessing broker funds or orders. */
export async function verifyAuthorizedTrader(
  request: Request
): Promise<{ trader: AuthorizedTrader | null; error?: string; status?: number }> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { trader: null, error: 'Authentication required. Please sign in again.', status: 401 };
  }

  const supabaseJwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!supabaseJwt) {
    return { trader: null, error: 'Invalid session token.', status: 401 };
  }

  try {
    const db = getServiceClient();
    const {
      data: { user },
      error,
    } = await db.auth.getUser(supabaseJwt);

    if (error || !user) {
      return { trader: null, error: 'Session expired. Please sign in again.', status: 401 };
    }

    const approval = await isUserApproved(user.id, user.email || '');
    if (!approval.approved) {
      return {
        trader: null,
        error: 'Your account is not approved for Upstox trading actions.',
        status: 403,
      };
    }

    return {
      trader: {
        userId: user.id,
        email: user.email || '',
        role: approval.role,
      },
    };
  } catch (err: any) {
    return { trader: null, error: err?.message || 'Auth verification failed', status: 500 };
  }
}

/**
 * Resolve Upstox bearer token for live or sandbox trading mode.
 * Returns both the token and whether it is a daily `trading` token or 1-year `analytics` token.
 * Ignores expired client JWTs so stale localStorage tokens never shadow fresh server tokens.
 */
export async function resolveUpstoxTokenWithMeta(
  request: Request,
  mode: TradingMode,
  options: { allowAnalytics?: boolean } = {}
): Promise<{ token: string | null; tokenKind: UpstoxTokenKind | 'sandbox' | null }> {
  if (mode === 'sandbox') {
    const sbTok = request.headers.get('X-Upstox-Sandbox-Token')?.trim();
    return {
      token: sbTok && sbTok.length > 10 ? sbTok : null,
      tokenKind: sbTok && sbTok.length > 10 ? 'sandbox' : null,
    };
  }

  const rawClient = request.headers.get('X-Upstox-Token')?.trim() || '';
  const clientValid =
    rawClient &&
    rawClient !== 'sandbox' &&
    rawClient !== 'mock' &&
    rawClient.length > 10 &&
    !isJwtExpired(rawClient)
      ? rawClient
      : '';

  const storedTrading = await getUpstoxTradingToken();

  // Prefer the newest valid daily trading token (either fresh client token or webhook/OAuth Supabase token)
  if (clientValid && !isLongLivedToken(clientValid)) {
    if (storedTrading) {
      const clientIat = getJwtIssuedAtMs(clientValid);
      const serverMs = Math.max(
        getJwtIssuedAtMs(storedTrading.accessToken),
        Date.parse(storedTrading.updatedAt) || 0
      );
      if (serverMs > clientIat + 5000) {
        return { token: storedTrading.accessToken, tokenKind: 'trading' };
      }
    }
    return { token: clientValid, tokenKind: 'trading' };
  }

  if (storedTrading) {
    return { token: storedTrading.accessToken, tokenKind: 'trading' };
  }

  if (options.allowAnalytics) {
    if (clientValid) {
      return { token: clientValid, tokenKind: 'analytics' };
    }
    const storedAnalytics = await getUpstoxAnalyticsToken();
    if (storedAnalytics) {
      return { token: storedAnalytics.accessToken, tokenKind: 'analytics' };
    }
  }

  return { token: null, tokenKind: null };
}

/** Resolve Upstox bearer token string for live or sandbox trading mode. */
export async function resolveUpstoxToken(
  request: Request,
  mode: TradingMode,
  options: { allowAnalytics?: boolean } = {}
): Promise<string | null> {
  const { token } = await resolveUpstoxTokenWithMeta(request, mode, options);
  return token;
}

export function resolveUpstoxInstrumentToken(symbol: string, explicitToken?: string): string | null {
  if (explicitToken && explicitToken.includes('|')) {
    return explicitToken.trim();
  }
  const clean = symbol.toUpperCase().trim();
  return getInstrumentKey(clean);
}

/** Extract user-friendly error message and actionable remediation hint from Upstox API errors. */
export function normalizeUpstoxError(status: number, body: any): {
  code: string;
  message: string;
  hint?: string;
} {
  const errObj = body?.errors?.[0];
  const code = String(errObj?.errorCode || errObj?.error_code || `HTTP_${status}`);
  const rawMsg =
    errObj?.message || body?.message || body?.error || `Upstox request failed (${status})`;

  let hint: string | undefined;
  const lower = `${code} ${rawMsg}`.toLowerCase();

  if (status === 401) {
    hint = 'Your Upstox access token has expired or been revoked. Reconnect in Broker Settings.';
  } else if (lower.includes('ip') || lower.includes('whitelist') || lower.includes('static')) {
    hint =
      'Upstox requires live order requests to originate from a pre-registered Static IP (upstox.com Developer Apps). Test with Sandbox mode or register your server/local static IP.';
  } else if (code === 'UDAPI100072' || lower.includes('5:30 am')) {
    hint = 'Upstox Funds & Margin service resets overnight and is available 5:30 AM – 12:00 AM IST daily.';
  } else if (lower.includes('market') && lower.includes('closed')) {
    hint = 'NSE/BSE regular market is closed. Enable After Market Order (AMO) or switch to Sandbox mode.';
  } else if (lower.includes('margin') || lower.includes('insufficient')) {
    hint = 'Check Available Cash Margin or reduce order quantity.';
  }

  return { code, message: rawMsg, hint };
}

export function hasStaticProxyConfigured(): boolean {
  return Boolean(process.env.ZERO_IP_API_KEY?.trim() && process.env.ZERO_IP_IPV6?.trim());
}

function shouldUseStaticProxy(url: string, mode: TradingMode): boolean {
  if (mode !== 'live') return false;
  if (!hasStaticProxyConfigured()) return false;
  return url.includes('api-hft.upstox.com') || url.includes('/v2/order/');
}

/** Tunnel a single HTTPS JSON request through Snipy Zero IP static IPv6 proxy. */
async function proxiedHttpsJson(
  urlStr: string,
  method: string,
  headers: Record<string, string>,
  bodyStr: string | undefined,
  signal: AbortSignal
): Promise<{ ok: boolean; status: number; json: any }> {
  const proxyHost = process.env.ZERO_IP_PROXY_HOST || 'zeroip.snipy.in';
  const proxyPort = Number(process.env.ZERO_IP_PROXY_PORT || 8443);
  const proxyKey = process.env.ZERO_IP_API_KEY!.trim();
  const proxyIpv6 = process.env.ZERO_IP_IPV6!.trim();

  const url = new URL(urlStr);
  const targetPort = Number(url.port || 443);
  const targetAuthority = `${url.hostname}:${targetPort}`;

  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      return reject(err);
    }

    let settled = false;
    let proxySock: tls.TLSSocket | null = null;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      fn();
    };
    const onAbort = () => {
      proxySock?.destroy();
      const err = new Error('Upstox API request timed out');
      err.name = 'AbortError';
      finish(() => reject(err));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    proxySock = tls.connect({ host: proxyHost, port: proxyPort, servername: proxyHost }, () => {
      const connectLines = [
        `CONNECT ${targetAuthority} HTTP/1.1`,
        `Host: ${targetAuthority}`,
        `Proxy-Authorization: Bearer ${proxyKey}`,
        `X-Snipy-Proxy-IPv6: ${proxyIpv6}`,
        '',
        '',
      ].join('\r\n');
      proxySock!.write(connectLines);
    });

    let buf = '';
    const onConnectData = (chunk: Buffer) => {
      buf += chunk.toString('latin1');
      const endIdx = buf.indexOf('\r\n\r\n');
      if (endIdx === -1) return;
      proxySock!.off('data', onConnectData);

      const statusLine = buf.slice(0, endIdx).split('\r\n')[0] || '';
      if (!statusLine.includes(' 200 ')) {
        proxySock!.destroy();
        return finish(() => reject(new Error(`Zero IP proxy error: ${statusLine}`)));
      }

      const outHeaders: Record<string, string | number> = {
        ...headers,
        Host: url.hostname,
      };
      if (bodyStr !== undefined) {
        outHeaders['Content-Length'] = Buffer.byteLength(bodyStr, 'utf8');
      }

      const req = https.request(
        {
          hostname: url.hostname,
          port: targetPort,
          path: url.pathname + url.search,
          method,
          headers: outHeaders,
          createConnection: () =>
            tls.connect({
              socket: proxySock!,
              servername: url.hostname,
            }),
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            let parsed: any = null;
            try {
              parsed = raw ? JSON.parse(raw) : null;
            } catch {
              parsed = null;
            }
            const status = res.statusCode || 502;
            finish(() => resolve({ ok: status >= 200 && status < 300, status, json: parsed }));
          });
        }
      );

      req.on('error', (err) => finish(() => reject(err)));
      if (bodyStr !== undefined) {
        req.write(bodyStr);
      }
      req.end();
    };

    proxySock.on('data', onConnectData);
    proxySock.on('error', (err: any) => finish(() => reject(err)));
  });
}

export async function upstoxJsonRequest(
  url: string,
  token: string,
  options: Omit<RequestInit, 'mode'> & {
    mode?: TradingMode;
    invalidateOn401?: boolean;
    forceStaticProxy?: boolean;
  } = {}
): Promise<{ ok: boolean; status: number; data: any; error?: ReturnType<typeof normalizeUpstoxError> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const { mode = 'live', invalidateOn401 = true, forceStaticProxy = false, ...fetchOpts } = options;

  const extraHeaders: Record<string, string> = {};
  if (mode === 'live' && process.env.UPSTOX_ALGO_NAME) {
    extraHeaders['X-Algo-Name'] = process.env.UPSTOX_ALGO_NAME;
  }

  const reqHeaders: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...extraHeaders,
    ...((fetchOpts.headers as Record<string, string>) || {}),
  };
  if (fetchOpts.body !== undefined) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  try {
    let status = 502;
    let ok = false;
    let json: any = null;

    const useProxy =
      (forceStaticProxy && hasStaticProxyConfigured()) || shouldUseStaticProxy(url, mode);

    if (useProxy) {
      const bodyStr = typeof fetchOpts.body === 'string' ? fetchOpts.body : undefined;
      const proxied = await proxiedHttpsJson(
        url,
        String(fetchOpts.method || 'GET').toUpperCase(),
        reqHeaders,
        bodyStr,
        controller.signal
      );
      status = proxied.status;
      ok = proxied.ok;
      json = proxied.json;
    } else {
      const res = await fetch(url, {
        ...fetchOpts,
        headers: reqHeaders,
        signal: controller.signal,
      });
      status = res.status;
      ok = res.ok;
      json = await res.json().catch(() => null);
    }

    if (status === 401 && mode === 'live' && invalidateOn401) {
      await invalidateUpstoxTokens({ token });
    }

    if (!ok) {
      return {
        ok: false,
        status,
        data: json,
        error: normalizeUpstoxError(status, json),
      };
    }

    return { ok: true, status, data: json };
  } catch (err: any) {
    return {
      ok: false,
      status: 502,
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: err?.name === 'AbortError' ? 'Upstox API request timed out' : err?.message || 'Network failure',
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export interface VerifyUpstoxTokenResult {
  valid: boolean;
  networkError?: boolean;
  expiredByJwt?: boolean;
  tokenKind: UpstoxTokenKind;
  autoDetectedAnalytics?: boolean;
  sanitizedToken: string;
  userId: string;
  httpStatus: number;
  errorCode?: string;
  upstoxMessage?: string;
  message?: string;
}

const NIFTY_QUOTE_URL = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent('NSE_INDEX|Nifty 50')}`;
const USER_PROFILE_URL = 'https://api.upstox.com/v2/user/profile';

/**
 * Live-verify a candidate Upstox token against Upstox APIs without falsely invalidating stored tokens.
 * - Analytics tokens (or long-lived JWTs) validate via market-quote first so static-IP/user-scope 401/403 never causes false failures.
 * - Trading tokens validate via user/profile (with Snipy static proxy fallback if configured), and fall back to market-quote
 *   so an accidentally pasted Analytics token is auto-detected instead of rejected as invalid/expired.
 */
export async function verifyUpstoxTokenLive(
  rawToken: string,
  preferredKind: UpstoxTokenKind = 'trading'
): Promise<VerifyUpstoxTokenResult> {
  const cleanToken = sanitizeUpstoxToken(rawToken);
  if (!cleanToken || cleanToken.length < 10) {
    return {
      valid: false,
      tokenKind: preferredKind,
      sanitizedToken: cleanToken,
      userId: 'admin',
      httpStatus: 400,
      message: 'Valid access token required',
    };
  }

  const detectedLongLived = isLongLivedToken(cleanToken);
  const jwtUser = getJwtUserId(cleanToken);

  if (isJwtExpired(cleanToken, 0)) {
    const expIso = getJwtExpiryIso(cleanToken);
    const expIst = expIso
      ? new Date(expIso).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
    return {
      valid: false,
      expiredByJwt: true,
      tokenKind: detectedLongLived ? 'analytics' : preferredKind,
      sanitizedToken: cleanToken,
      userId: jwtUser || 'admin',
      httpStatus: 401,
      errorCode: 'JWT_EXPIRED',
      message: expIst
        ? `Token expired at ${expIst} IST. Generate a fresh token in Upstox My Apps or use 1-Tap Phone Approval.`
        : 'This Upstox token has expired. Generate a fresh token in Upstox My Apps.',
    };
  }

  const expectedKind: UpstoxTokenKind =
    preferredKind === 'analytics' || detectedLongLived ? 'analytics' : 'trading';

  // Analytics / long-lived path: validate against market-quote first (user/profile returns 401/403 without Static IP)
  if (expectedKind === 'analytics') {
    const quoteRes = await upstoxJsonRequest(NIFTY_QUOTE_URL, cleanToken, { invalidateOn401: false });
    if (quoteRes.ok) {
      let resolvedUser = jwtUser || 'upstox_analytics';
      const profileOpt = await upstoxJsonRequest(USER_PROFILE_URL, cleanToken, {
        invalidateOn401: false,
      });
      if (profileOpt.ok) {
        resolvedUser = profileOpt.data?.data?.user_id || profileOpt.data?.data?.email || resolvedUser;
      }
      return {
        valid: true,
        tokenKind: 'analytics',
        autoDetectedAnalytics: preferredKind !== 'analytics' && detectedLongLived,
        sanitizedToken: cleanToken,
        userId: resolvedUser,
        httpStatus: 200,
      };
    }

    if (quoteRes.status === 429 || quoteRes.status >= 500) {
      return {
        valid: true,
        networkError: true,
        tokenKind: 'analytics',
        autoDetectedAnalytics: preferredKind !== 'analytics' && detectedLongLived,
        sanitizedToken: cleanToken,
        userId: jwtUser || 'upstox_analytics',
        httpStatus: 200,
      };
    }

    const code = quoteRes.error?.code || `HTTP_${quoteRes.status}`;
    const msg = quoteRes.error?.message || 'Unauthorized';
    return {
      valid: false,
      tokenKind: 'analytics',
      sanitizedToken: cleanToken,
      userId: jwtUser || 'upstox_analytics',
      httpStatus: quoteRes.status === 401 || quoteRes.status === 403 ? 401 : quoteRes.status,
      errorCode: code,
      upstoxMessage: msg,
      message: `Upstox rejected Analytics token (${code}: ${msg}). Make sure it is the latest token from My Apps -> Analytics (generating a new token revokes the old one).`,
    };
  }

  // Trading path: test user/profile directly, then Snipy Static IP proxy if configured
  let profileRes = await upstoxJsonRequest(USER_PROFILE_URL, cleanToken, { invalidateOn401: false });
  if (!profileRes.ok && (profileRes.status === 401 || profileRes.status === 403) && hasStaticProxyConfigured()) {
    const proxiedProfile = await upstoxJsonRequest(USER_PROFILE_URL, cleanToken, {
      invalidateOn401: false,
      forceStaticProxy: true,
    });
    if (proxiedProfile.ok) {
      profileRes = proxiedProfile;
    }
  }

  if (profileRes.ok) {
    const resolvedUser =
      profileRes.data?.data?.user_id || profileRes.data?.data?.email || jwtUser || 'admin';
    return {
      valid: true,
      tokenKind: 'trading',
      sanitizedToken: cleanToken,
      userId: resolvedUser,
      httpStatus: 200,
    };
  }

  if (profileRes.status === 429 || profileRes.status >= 500) {
    return {
      valid: true,
      networkError: true,
      tokenKind: 'trading',
      sanitizedToken: cleanToken,
      userId: jwtUser || 'admin',
      httpStatus: 200,
    };
  }

  // Fallback check on market-quote: catches valid Analytics / read-only tokens pasted into the Trading input
  if (profileRes.status === 401 || profileRes.status === 403) {
    const quoteFallback = await upstoxJsonRequest(NIFTY_QUOTE_URL, cleanToken, {
      invalidateOn401: false,
    });
    if (quoteFallback.ok) {
      return {
        valid: true,
        tokenKind: 'analytics',
        autoDetectedAnalytics: true,
        sanitizedToken: cleanToken,
        userId: jwtUser || 'upstox_analytics',
        httpStatus: 200,
      };
    }
  }

  const code = profileRes.error?.code || `HTTP_${profileRes.status}`;
  const msg = profileRes.error?.message || 'Unauthorized';
  return {
    valid: false,
    tokenKind: 'trading',
    sanitizedToken: cleanToken,
    userId: jwtUser || 'admin',
    httpStatus: profileRes.status === 401 || profileRes.status === 403 ? 401 : profileRes.status,
    errorCode: code,
    upstoxMessage: msg,
    message: `Upstox rejected token (${code}: ${msg}). Note: saving Static IP or generating a newer token in Upstox My Apps automatically revokes earlier tokens.`,
  };
}

export function validatePlaceOrderInput(body: any): {
  valid: boolean;
  input?: PlaceOrderInput & { resolvedToken: string };
  error?: string;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request payload.' };
  }

  const symbol = String(body.symbol || '').toUpperCase().trim();
  const explicitToken = body.instrumentToken ? String(body.instrumentToken).trim() : undefined;
  const resolvedToken = resolveUpstoxInstrumentToken(symbol, explicitToken);

  if (!resolvedToken) {
    return {
      valid: false,
      error: `Could not resolve NSE/BSE instrument token for "${symbol}". Select a stock from search.`,
    };
  }

  const quantity = Math.floor(Number(body.quantity));
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000) {
    return { valid: false, error: 'Quantity must be a positive whole number.' };
  }

  const transactionType = String(body.transactionType || '').toUpperCase() as UpstoxTransactionType;
  if (transactionType !== 'BUY' && transactionType !== 'SELL') {
    return { valid: false, error: 'Transaction type must be BUY or SELL.' };
  }

  const orderType = String(body.orderType || 'MARKET').toUpperCase() as UpstoxOrderType;
  if (!['MARKET', 'LIMIT', 'SL', 'SL-M'].includes(orderType)) {
    return { valid: false, error: 'Order type must be MARKET, LIMIT, SL, or SL-M.' };
  }

  const product = String(body.product || 'D').toUpperCase() as UpstoxProductType;
  if (!['D', 'I', 'MTF'].includes(product)) {
    return { valid: false, error: 'Product must be D (Delivery), I (Intraday), or MTF.' };
  }

  const validity = String(body.validity || 'DAY').toUpperCase() as UpstoxValidity;
  if (validity !== 'DAY' && validity !== 'IOC') {
    return { valid: false, error: 'Validity must be DAY or IOC.' };
  }

  let price = Number(body.price || 0);
  if (orderType === 'LIMIT' || orderType === 'SL') {
    if (!Number.isFinite(price) || price <= 0) {
      return { valid: false, error: `${orderType} orders require a positive limit price.` };
    }
    price = Number(price.toFixed(2));
  } else {
    price = 0;
  }

  let triggerPrice = Number(body.triggerPrice || 0);
  if (orderType === 'SL' || orderType === 'SL-M') {
    if (!Number.isFinite(triggerPrice) || triggerPrice <= 0) {
      return { valid: false, error: `${orderType} orders require a positive trigger price.` };
    }
    triggerPrice = Number(triggerPrice.toFixed(2));
  } else {
    triggerPrice = 0;
  }

  const disclosedQuantity = Math.max(0, Math.floor(Number(body.disclosedQuantity || 0)));
  if (disclosedQuantity > quantity) {
    return { valid: false, error: 'Disclosed quantity cannot exceed total quantity.' };
  }

  return {
    valid: true,
    input: {
      symbol: symbol || resolvedToken,
      instrumentToken: explicitToken,
      resolvedToken,
      quantity,
      product,
      validity,
      orderType,
      transactionType,
      price,
      triggerPrice,
      disclosedQuantity,
      isAmo: Boolean(body.isAmo),
      slice: body.slice !== false,
      tag: body.tag ? String(body.tag).slice(0, 20) : 'marketpulse',
    },
  };
}
