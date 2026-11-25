// API Route: Live Upstox Account Portfolio, Funds, Positions, Orders, Trades & Static IP Status
// Auth-gated via Supabase JWT; read endpoints exempt from Upstox Static IP restrictions.

import { NextResponse } from 'next/server';
import {
  verifyAuthorizedTrader,
  resolveUpstoxTokenWithMeta,
  upstoxJsonRequest,
} from '@/lib/upstoxTrade';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAuthorizedTrader(request);
  if (!auth.trader) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
  }

  const { token, tokenKind } = await resolveUpstoxTokenWithMeta(request, 'live', {
    allowAnalytics: true,
  });
  if (!token) {
    return NextResponse.json(
      {
        connected: false,
        tokenKind: null,
        error: 'Upstox broker token not connected or expired. Connect or approve on Broker API page.',
      },
      { status: 400 }
    );
  }

  try {
    const [profileRes, fundsRes, holdingsRes, positionsRes, ordersRes, tradesRes, ipRes] =
      await Promise.all([
        upstoxJsonRequest('https://api.upstox.com/v2/user/profile', token),
        upstoxJsonRequest('https://api.upstox.com/v2/user/get-funds-and-margin?segment=SEC', token),
        upstoxJsonRequest('https://api.upstox.com/v2/portfolio/long-term-holdings', token),
        upstoxJsonRequest('https://api.upstox.com/v2/portfolio/short-term-positions', token),
        upstoxJsonRequest('https://api.upstox.com/v2/order/retrieve-all', token),
        upstoxJsonRequest('https://api.upstox.com/v2/order/trades/get-trades-for-day', token),
        upstoxJsonRequest('https://api.upstox.com/v2/user/ip', token),
      ]);

    // If token was rejected by Upstox on core endpoints
    if (
      profileRes.status === 401 ||
      holdingsRes.status === 401 ||
      positionsRes.status === 401 ||
      ordersRes.status === 401
    ) {
      return NextResponse.json(
        {
          connected: false,
          tokenKind,
          error: 'Upstox session expired or revoked. Re-authenticate via Broker API.',
        },
        { status: 401 }
      );
    }

    // Analytics tokens without account permissions / static IP may get 403 on personal endpoints
    const accountForbidden =
      tokenKind === 'analytics' &&
      profileRes.status === 403 &&
      holdingsRes.status === 403 &&
      ordersRes.status === 403;
    if (accountForbidden) {
      return NextResponse.json(
        {
          connected: false,
          analyticsActive: true,
          tokenKind,
          error:
            '1-year Analytics token is active for market quotes, but Upstox requires daily 1-tap approval (Trading token) or Static IP access to load Demat Holdings & place orders.',
        },
        { status: 403 }
      );
    }

    const rawHoldings = Array.isArray(holdingsRes.data?.data) ? holdingsRes.data.data : [];
    const holdings = rawHoldings.map((h: any) => {
      const qty = Number(h.quantity || 0) + Number(h.t1_quantity || 0);
      const avgPrice = Number(h.average_price || 0);
      const lastPrice = Number(h.last_price || h.close_price || avgPrice);
      const invested = avgPrice * qty;
      const currentValue = lastPrice * qty;
      const pnl = h.pnl !== undefined ? Number(h.pnl) : currentValue - invested;
      const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;

      return {
        symbol: String(h.trading_symbol || h.tradingsymbol || ''),
        companyName: String(h.company_name || h.trading_symbol || ''),
        isin: String(h.isin || ''),
        instrumentToken: String(h.instrument_token || ''),
        exchange: String(h.exchange || 'NSE'),
        product: String(h.product || 'D'),
        quantity: Number(h.quantity || 0),
        t1Quantity: Number(h.t1_quantity || 0),
        totalQuantity: qty,
        averagePrice: Number(avgPrice.toFixed(2)),
        lastPrice: Number(lastPrice.toFixed(2)),
        closePrice: Number((h.close_price || lastPrice).toFixed(2)),
        investedValue: Number(invested.toFixed(2)),
        currentValue: Number(currentValue.toFixed(2)),
        pnl: Number(pnl.toFixed(2)),
        pnlPercent: Number(pnlPercent.toFixed(2)),
        dayChange: Number(h.day_change || 0),
        dayChangePercent: Number(h.day_change_percentage || 0),
      };
    });

    const rawPositions = Array.isArray(positionsRes.data?.data) ? positionsRes.data.data : [];
    const positions = rawPositions.map((p: any) => ({
      symbol: String(p.trading_symbol || p.tradingsymbol || ''),
      instrumentToken: String(p.instrument_token || ''),
      exchange: String(p.exchange || 'NSE'),
      product: String(p.product || 'I'),
      quantity: Number(p.quantity || 0),
      overnightQuantity: Number(p.overnight_quantity || 0),
      buyPrice: Number(p.buy_price || 0),
      sellPrice: Number(p.sell_price || 0),
      averagePrice: Number(p.average_price || 0),
      lastPrice: Number(p.last_price || 0),
      unrealised: Number(p.unrealised || 0),
      realised: Number(p.realised || 0),
      pnl: Number(p.pnl ?? Number(p.unrealised || 0) + Number(p.realised || 0)),
      buyValue: Number(p.buy_value || 0),
      sellValue: Number(p.sell_value || 0),
    }));

    const rawOrders = Array.isArray(ordersRes.data?.data) ? ordersRes.data.data : [];
    const orders = rawOrders.map((o: any) => ({
      orderId: String(o.order_id || ''),
      exchangeOrderId: String(o.exchange_order_id || ''),
      symbol: String(o.trading_symbol || o.tradingsymbol || ''),
      instrumentToken: String(o.instrument_token || ''),
      exchange: String(o.exchange || 'NSE'),
      transactionType: String(o.transaction_type || 'BUY'),
      orderType: String(o.order_type || 'MARKET'),
      product: String(o.product || 'D'),
      validity: String(o.validity || 'DAY'),
      quantity: Number(o.quantity || 0),
      filledQuantity: Number(o.filled_quantity || 0),
      pendingQuantity: Number(o.pending_quantity || 0),
      price: Number(o.price || 0),
      triggerPrice: Number(o.trigger_price || 0),
      averagePrice: Number(o.average_price || 0),
      status: String(o.status || 'unknown'),
      statusMessage: o.status_message ? String(o.status_message) : null,
      orderTimestamp: String(o.order_timestamp || ''),
      isAmo: Boolean(o.is_amo),
      tag: o.tag ? String(o.tag) : null,
    }));

    const rawTrades = Array.isArray(tradesRes.data?.data) ? tradesRes.data.data : [];
    const trades = rawTrades.map((t: any) => ({
      tradeId: String(t.trade_id || ''),
      orderId: String(t.order_id || ''),
      symbol: String(t.trading_symbol || t.tradingsymbol || ''),
      exchange: String(t.exchange || 'NSE'),
      transactionType: String(t.transaction_type || 'BUY'),
      product: String(t.product || 'D'),
      quantity: Number(t.quantity || 0),
      averagePrice: Number(t.average_price || 0),
      exchangeTimestamp: String(t.exchange_timestamp || ''),
    }));

    // Parse Equity Funds / Margin (handles 5:30 AM – 12:00 AM IST maintenance 423 gracefully)
    const equityFunds = fundsRes.ok ? fundsRes.data?.data?.equity : null;
    const funds = equityFunds
      ? {
          available: true,
          availableMargin: Number(equityFunds.available_margin || 0),
          usedMargin: Number(equityFunds.used_margin || 0),
          payinAmount: Number(equityFunds.payin_amount || 0),
          notionalCash: Number(equityFunds.notional_cash || 0),
          spanMargin: Number(equityFunds.span_margin || 0),
          exposureMargin: Number(equityFunds.exposure_margin || 0),
        }
      : {
          available: false,
          availableMargin: 0,
          usedMargin: 0,
          notice: fundsRes.error?.hint || fundsRes.error?.message || 'Funds temporarily unavailable',
        };

    // Parse Static IP registration status
    const ipData = ipRes.data?.data || {};
    const primaryIp = ipData.primary_ip || null;
    const secondaryIp = ipData.secondary_ip || null;

    // Aggregate summary metrics
    const totalInvested = holdings.reduce((s: number, h: any) => s + h.investedValue, 0);
    const totalCurrentValue = holdings.reduce((s: number, h: any) => s + h.currentValue, 0);
    const totalHoldingsPnl = holdings.reduce((s: number, h: any) => s + h.pnl, 0);
    const totalHoldingsDayPnl = holdings.reduce(
      (s: number, h: any) => s + h.dayChange * h.totalQuantity,
      0
    );
    const positionsUnrealised = positions.reduce((s: number, p: any) => s + p.unrealised, 0);
    const positionsRealised = positions.reduce((s: number, p: any) => s + p.realised, 0);

    const profileData = profileRes.data?.data;

    return NextResponse.json({
      connected: true,
      tokenKind,
      profile: profileData
        ? {
            userId: profileData.user_id,
            userName: profileData.user_name,
            email: profileData.email,
            exchanges: profileData.exchanges || [],
            products: profileData.products || [],
            orderTypes: profileData.order_types || [],
            poa: Boolean(profileData.poa),
          }
        : null,
      staticIp: {
        configured: Boolean(primaryIp || secondaryIp),
        primaryIp,
        secondaryIp,
      },
      funds,
      holdings,
      positions,
      orders,
      trades,
      summary: {
        totalInvested: Number(totalInvested.toFixed(2)),
        totalCurrentValue: Number(totalCurrentValue.toFixed(2)),
        totalHoldingsPnl: Number(totalHoldingsPnl.toFixed(2)),
        totalHoldingsPnlPercent:
          totalInvested > 0 ? Number(((totalHoldingsPnl / totalInvested) * 100).toFixed(2)) : 0,
        totalHoldingsDayPnl: Number(totalHoldingsDayPnl.toFixed(2)),
        positionsUnrealised: Number(positionsUnrealised.toFixed(2)),
        positionsRealised: Number(positionsRealised.toFixed(2)),
        openPositionsCount: positions.filter((p: any) => p.quantity !== 0).length,
        openOrdersCount: orders.filter((o: any) =>
          ['open', 'pending', 'trigger pending', 'after market order req received', 'validation pending'].includes(
            o.status.toLowerCase()
          )
        ).length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Upstox Portfolio API] Error:', err);
    return NextResponse.json(
      { connected: false, error: err?.message || 'Failed to fetch Upstox account portfolio' },
      { status: 500 }
    );
  }
}

