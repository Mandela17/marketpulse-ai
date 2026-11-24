// API Route: Direct Upstox Order Execution (Place, Modify, Cancel, Exit All Positions)
// Supports Live V3 HFT endpoints AND Risk-Free Sandbox V2 endpoints.
// Enforces authenticated approved Supabase session + strict input validation.

import { NextResponse } from 'next/server';
import {
  verifyAuthorizedTrader,
  resolveUpstoxToken,
  validatePlaceOrderInput,
  upstoxJsonRequest,
  type TradingMode,
} from '@/lib/upstoxTrade';

export const dynamic = 'force-dynamic';

function parseMode(raw: any): TradingMode {
  return raw === 'sandbox' ? 'sandbox' : 'live';
}

// POST: Place BUY or SELL Order (V3 Live or V2 Sandbox)
export async function POST(request: Request) {
  const auth = await verifyAuthorizedTrader(request);
  if (!auth.trader) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const mode = parseMode(body?.mode);
  const token = await resolveUpstoxToken(request, mode);
  if (!token) {
    return NextResponse.json(
      {
        error:
          mode === 'sandbox'
            ? 'Sandbox access token missing. Enter your Upstox Sandbox App token in the Sandbox settings panel.'
            : 'Upstox Live token not connected or expired. Connect via Broker API.',
      },
      { status: 400 }
    );
  }

  const validation = validatePlaceOrderInput(body);
  if (!validation.valid || !validation.input) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const input = validation.input;
  const endpoint =
    mode === 'sandbox'
      ? 'https://sandbox.upstox.com/v2/order/place'
      : 'https://api-hft.upstox.com/v3/order/place';

  const upstoxPayload: Record<string, any> = {
    quantity: input.quantity,
    product: input.product,
    validity: input.validity,
    price: input.price,
    tag: input.tag,
    instrument_token: input.resolvedToken,
    order_type: input.orderType,
    transaction_type: input.transactionType,
    disclosed_quantity: input.disclosedQuantity || 0,
    trigger_price: input.triggerPrice || 0,
    is_amo: Boolean(input.isAmo),
  };

  if (mode === 'live') {
    upstoxPayload.slice = Boolean(input.slice);
  }

  console.log(
    `[Upstox Order] ${mode.toUpperCase()} ${input.transactionType} ${input.quantity}x ${input.symbol} (${input.resolvedToken}) @ ${input.orderType} by ${auth.trader.email}`
  );

  const res = await upstoxJsonRequest(endpoint, token, {
    method: 'POST',
    body: JSON.stringify(upstoxPayload),
    mode,
  });

  if (!res.ok) {
    return NextResponse.json(
      {
        success: false,
        mode,
        code: res.error?.code,
        error: res.error?.message || 'Order rejected by Upstox',
        hint: res.error?.hint,
        details: res.data,
      },
      { status: res.status >= 400 ? res.status : 400 }
    );
  }

  const orderIds: string[] = Array.isArray(res.data?.data?.order_ids)
    ? res.data.data.order_ids
    : res.data?.data?.order_id
      ? [String(res.data.data.order_id)]
      : [];

  return NextResponse.json({
    success: true,
    mode,
    orderId: orderIds[0] || null,
    orderIds,
    latencyMs: res.data?.metadata?.latency ?? null,
    message: `${mode === 'sandbox' ? '[SANDBOX] ' : ''}${input.transactionType} order placed for ${input.quantity} ${input.symbol}`,
  });
}

// PUT: Modify Open / Pending Order
export async function PUT(request: Request) {
  const auth = await verifyAuthorizedTrader(request);
  if (!auth.trader) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const mode = parseMode(body?.mode);
  const token = await resolveUpstoxToken(request, mode);
  if (!token) {
    return NextResponse.json({ error: `Upstox ${mode} token unavailable.` }, { status: 400 });
  }

  const orderId = String(body.orderId || '').trim();
  const quantity = Math.floor(Number(body.quantity));
  const orderType = String(body.orderType || 'LIMIT').toUpperCase();
  const validity = String(body.validity || 'DAY').toUpperCase();
  const price = Number(body.price || 0);
  const triggerPrice = Number(body.triggerPrice || 0);

  if (!orderId || !Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: 'Valid orderId and quantity (>0) required.' }, { status: 400 });
  }

  const endpoint =
    mode === 'sandbox'
      ? 'https://sandbox.upstox.com/v2/order/modify'
      : 'https://api-hft.upstox.com/v3/order/modify';

  const res = await upstoxJsonRequest(endpoint, token, {
    method: 'PUT',
    body: JSON.stringify({
      order_id: orderId,
      quantity,
      validity,
      price: orderType === 'LIMIT' || orderType === 'SL' ? Number(price.toFixed(2)) : 0,
      order_type: orderType,
      trigger_price: orderType === 'SL' || orderType === 'SL-M' ? Number(triggerPrice.toFixed(2)) : 0,
      disclosed_quantity: Math.max(0, Math.floor(Number(body.disclosedQuantity || 0))),
    }),
    mode,
  });

  if (!res.ok) {
    return NextResponse.json(
      {
        success: false,
        code: res.error?.code,
        error: res.error?.message || 'Modify order failed',
        hint: res.error?.hint,
      },
      { status: res.status >= 400 ? res.status : 400 }
    );
  }

  return NextResponse.json({
    success: true,
    orderId: res.data?.data?.order_id || orderId,
    message: `Order ${orderId} modified successfully`,
  });
}

// DELETE: Cancel Open Order OR Exit All Open Positions (?action=exit_all)
export async function DELETE(request: Request) {
  const auth = await verifyAuthorizedTrader(request);
  if (!auth.trader) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
  }

  const { searchParams } = new URL(request.url);
  const mode = parseMode(searchParams.get('mode'));
  const action = searchParams.get('action') || 'cancel';
  const orderId = (searchParams.get('orderId') || '').trim();
  const segment = (searchParams.get('segment') || '').trim();

  const token = await resolveUpstoxToken(request, mode);
  if (!token) {
    return NextResponse.json({ error: `Upstox ${mode} token unavailable.` }, { status: 400 });
  }

  if (action === 'exit_all') {
    if (mode === 'sandbox') {
      return NextResponse.json(
        { error: 'Exit All Positions is only available in Live mode.' },
        { status: 400 }
      );
    }
    const qs = segment ? `?segment=${encodeURIComponent(segment)}` : '';
    const res = await upstoxJsonRequest(
      `https://api.upstox.com/v2/order/positions/exit${qs}`,
      token,
      { method: 'POST', mode: 'live' }
    );

    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          code: res.error?.code,
          error: res.error?.message || 'Exit positions failed',
          hint: res.error?.hint,
        },
        { status: res.status >= 400 ? res.status : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      orderIds: res.data?.data?.order_ids || [],
      message: 'Square-off orders submitted for open positions.',
    });
  }

  if (!orderId) {
    return NextResponse.json({ error: 'orderId query parameter required.' }, { status: 400 });
  }

  const base =
    mode === 'sandbox'
      ? 'https://sandbox.upstox.com/v2/order/cancel'
      : 'https://api-hft.upstox.com/v3/order/cancel';

  const res = await upstoxJsonRequest(`${base}?order_id=${encodeURIComponent(orderId)}`, token, {
    method: 'DELETE',
    mode,
  });

  if (!res.ok) {
    return NextResponse.json(
      {
        success: false,
        code: res.error?.code,
        error: res.error?.message || 'Cancel order failed',
        hint: res.error?.hint,
      },
      { status: res.status >= 400 ? res.status : 400 }
    );
  }

  return NextResponse.json({
    success: true,
    orderId: res.data?.data?.order_id || orderId,
    message: `Order ${orderId} cancelled successfully`,
  });
}

