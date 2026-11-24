// Shared Upstox Live & Sandbox Trading Helpers + Supabase Auth Guard
// Supports: Order Placement (V3 Live / V2 Sandbox), Modify, Cancel, Position Exit,
// Pre-trade Charges, Holdings, Positions, Funds/Margin, Order Book, Trades & Static IP check.

import { getServiceClient } from './supabase';
import { isUserApproved, type UserRole } from './userRoles';
import { getInstrumentKey } from './upstoxInstruments';
import { getUpstoxToken, invalidateUpstoxTokens } from './upstoxTokenStore';

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

/** Resolve Upstox bearer token for live or sandbox trading mode. */
export async function resolveUpstoxToken(
  request: Request,
  mode: TradingMode
): Promise<string | null> {
  if (mode === 'sandbox') {
    const sbTok = request.headers.get('X-Upstox-Sandbox-Token')?.trim();
    return sbTok && sbTok.length > 10 ? sbTok : null;
  }

  const clientTok = request.headers.get('X-Upstox-Token')?.trim();
  if (clientTok && clientTok !== 'sandbox' && clientTok !== 'mock' && clientTok.length > 10) {
    return clientTok;
  }

  const stored = await getUpstoxToken();
  return stored?.accessToken || null;
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

export async function upstoxJsonRequest(
  url: string,
  token: string,
  options: Omit<RequestInit, 'mode'> & { mode?: TradingMode } = {}
): Promise<{ ok: boolean; status: number; data: any; error?: ReturnType<typeof normalizeUpstoxError> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const { mode = 'live', ...fetchOpts } = options;

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
    const res = await fetch(url, {
      ...fetchOpts,
      headers: reqHeaders,
      signal: controller.signal,
    });

    const json = await res.json().catch(() => null);

    if (res.status === 401 && mode === 'live') {
      await invalidateUpstoxTokens();
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data: json,
        error: normalizeUpstoxError(res.status, json),
      };
    }

    return { ok: true, status: res.status, data: json };
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
