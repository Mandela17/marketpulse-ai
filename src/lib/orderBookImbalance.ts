// Order Book Imbalance (OBI) — Upstox L2 Market Depth Analysis
// Computes bid-ask imbalance, micro-price, and depth pressure from Upstox V2 Market Depth API.
// Gracefully returns null when token is expired or API is unavailable.

import { getUpstoxToken } from './upstoxTokenStore';
import { getInstrumentKey } from './upstoxInstruments';

export interface OBIResult {
  bidAskImbalance: number;      // -1 (heavy selling) to +1 (heavy buying)
  microPrice: number;           // Volume-weighted midpoint
  depthPressureScore: number;   // Bid depth / Ask depth ratio (>1 = buying pressure)
  totalBidQty: number;
  totalAskQty: number;
  spreadPct: number;            // Bid-ask spread as % of mid price
  timestamp: string;
}

interface DepthEntry {
  quantity: number;
  price: number;
  num_of_orders: number;
}

// ─── Fetch Order Book from Upstox ───────────────────────────────────

export async function fetchOrderBookImbalance(symbol: string): Promise<OBIResult | null> {
  try {
    const storedToken = await getUpstoxToken();
    if (!storedToken) {
      console.warn('[OBI] No Upstox access token available — skipping OBI');
      return null;
    }
    const token = storedToken.accessToken;

    const instrumentKey = getInstrumentKey(symbol);
    if (!instrumentKey) {
      console.warn(`[OBI] No instrument key for ${symbol}`);
      return null;
    }

    const url = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(instrumentKey)}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        console.warn('[OBI] Upstox token expired — skipping OBI');
      } else {
        console.warn(`[OBI] Upstox API returned ${res.status}`);
      }
      return null;
    }

    const data = await res.json();

    // Navigate to depth data
    const quoteData = data?.data?.[instrumentKey] || Object.values(data?.data || {})[0] as any;
    if (!quoteData?.depth) {
      console.warn('[OBI] No depth data in Upstox response');
      return null;
    }

    const buyDepth: DepthEntry[] = quoteData.depth.buy || [];
    const sellDepth: DepthEntry[] = quoteData.depth.sell || [];

    if (buyDepth.length === 0 || sellDepth.length === 0) return null;

    // ─── Compute OBI Metrics ──────────────────────────────────────

    let totalBidQty = 0;
    let totalAskQty = 0;
    let bidWeightedSum = 0;
    let askWeightedSum = 0;

    for (const entry of buyDepth) {
      totalBidQty += entry.quantity;
      bidWeightedSum += entry.quantity * entry.price;
    }

    for (const entry of sellDepth) {
      totalAskQty += entry.quantity;
      askWeightedSum += entry.quantity * entry.price;
    }

    // Bid-Ask Imbalance: (bid_qty - ask_qty) / (bid_qty + ask_qty)
    const totalQty = totalBidQty + totalAskQty;
    const bidAskImbalance = totalQty > 0
      ? (totalBidQty - totalAskQty) / totalQty
      : 0;

    // Micro-price: Volume-weighted midpoint biased by depth
    const bidVWAP = totalBidQty > 0 ? bidWeightedSum / totalBidQty : buyDepth[0]?.price || 0;
    const askVWAP = totalAskQty > 0 ? askWeightedSum / totalAskQty : sellDepth[0]?.price || 0;
    const microPrice = totalQty > 0
      ? (bidVWAP * totalAskQty + askVWAP * totalBidQty) / totalQty
      : (bidVWAP + askVWAP) / 2;

    // Depth Pressure Score: ratio of bid depth to ask depth
    const depthPressureScore = totalAskQty > 0
      ? totalBidQty / totalAskQty
      : totalBidQty > 0 ? 2.0 : 1.0;

    // Spread
    const bestBid = buyDepth[0]?.price || 0;
    const bestAsk = sellDepth[0]?.price || 0;
    const midPrice = (bestBid + bestAsk) / 2;
    const spreadPct = midPrice > 0 ? ((bestAsk - bestBid) / midPrice) * 100 : 0;

    return {
      bidAskImbalance: parseFloat(bidAskImbalance.toFixed(4)),
      microPrice: parseFloat(microPrice.toFixed(2)),
      depthPressureScore: parseFloat(depthPressureScore.toFixed(3)),
      totalBidQty,
      totalAskQty,
      spreadPct: parseFloat(spreadPct.toFixed(4)),
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[OBI] Failed to fetch order book:', err);
    return null;
  }
}
