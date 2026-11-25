// API Route: Pre-trade Upstox Brokerage & Regulatory Charges Calculator
// Calls GET https://api.upstox.com/v2/charges/brokerage

import { NextResponse } from 'next/server';
import {
  verifyAuthorizedTrader,
  resolveUpstoxToken,
  resolveUpstoxInstrumentToken,
  upstoxJsonRequest,
} from '@/lib/upstoxTrade';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAuthorizedTrader(request);
  if (!auth.trader) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
  }

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || '';
  const explicitToken = searchParams.get('instrumentToken') || undefined;
  const quantity = Math.floor(Number(searchParams.get('quantity') || 0));
  const price = Number(searchParams.get('price') || 0);
  const product = (searchParams.get('product') || 'D').toUpperCase();
  const transactionType = (searchParams.get('transactionType') || 'BUY').toUpperCase();

  const instrumentToken = resolveUpstoxInstrumentToken(symbol, explicitToken);
  if (!instrumentToken || quantity <= 0 || price <= 0) {
    return NextResponse.json(
      { error: 'Valid symbol/instrumentToken, quantity (>0), and price (>0) are required.' },
      { status: 400 }
    );
  }

  const token = await resolveUpstoxToken(request, 'live', { allowAnalytics: true });
  if (!token) {
    return NextResponse.json({ error: 'Upstox token unavailable for brokerage calculation.' }, { status: 400 });
  }

  const params = new URLSearchParams({
    instrument_token: instrumentToken,
    quantity: String(quantity),
    product: ['D', 'I', 'MTF'].includes(product) ? product : 'D',
    transaction_type: transactionType === 'SELL' ? 'SELL' : 'BUY',
    price: price.toFixed(2),
  });

  const res = await upstoxJsonRequest(
    `https://api.upstox.com/v2/charges/brokerage?${params.toString()}`,
    token
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: res.error?.message || 'Failed to estimate brokerage', code: res.error?.code },
      { status: res.status >= 400 ? res.status : 502 }
    );
  }

  const charges = res.data?.data?.charges;
  return NextResponse.json({
    orderValue: Number((quantity * price).toFixed(2)),
    charges: {
      total: Number(charges?.total || 0),
      brokerage: Number(charges?.brokerage || 0),
      gst: Number(charges?.taxes?.gst || 0),
      stt: Number(charges?.taxes?.stt || 0),
      stampDuty: Number(charges?.taxes?.stamp_duty || 0),
      transactionCharge: Number((charges?.other_charges?.transaction ?? charges?.otherTaxes?.transaction) || 0),
      sebiTurnover: Number((charges?.other_charges?.sebi_turnover ?? charges?.otherTaxes?.sebi_turnover) || 0),
    },
  });
}

