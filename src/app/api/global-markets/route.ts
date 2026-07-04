// API Route: Global market indices — server-side proxy for Yahoo Finance
// Avoids CORS issues from client-side fetching

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // Cache 5 minutes

const GLOBAL_INDICES = [
  { name: 'S&P 500', symbol: '^GSPC', flag: '🇺🇸' },
  { name: 'NASDAQ', symbol: '^IXIC', flag: '🇺🇸' },
  { name: 'Dow Jones', symbol: '^DJI', flag: '🇺🇸' },
  { name: 'FTSE 100', symbol: '^FTSE', flag: '🇬🇧' },
  { name: 'Nikkei 225', symbol: '^N225', flag: '🇯🇵' },
  { name: 'Hang Seng', symbol: '^HSI', flag: '🇭🇰' },
  { name: 'Shanghai', symbol: '000001.SS', flag: '🇨🇳' },
  { name: 'DAX', symbol: '^GDAXI', flag: '🇩🇪' },
];

export async function GET() {
  try {
    const results: any[] = [];

    // Fetch each index from Yahoo Finance server-side (no CORS)
    const promises = GLOBAL_INDICES.map(async (idx) => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(idx.symbol)}?range=1d&interval=1d`,
          {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(8000),
          }
        );

        if (!res.ok) return;

        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (meta) {
          const price = meta.regularMarketPrice || 0;
          const prevClose = meta.chartPreviousClose || meta.previousClose || price;
          const change = price - prevClose;
          const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
          results.push({
            name: idx.name,
            symbol: idx.symbol,
            flag: idx.flag,
            price,
            change,
            changePercent: changePct,
          });
        }
      } catch {}
    });

    await Promise.all(promises);

    // Sort by the original order
    const ordered = GLOBAL_INDICES.map(idx =>
      results.find(r => r.symbol === idx.symbol)
    ).filter(Boolean);

    return NextResponse.json({ indices: ordered });
  } catch (err: any) {
    return NextResponse.json({ indices: [], error: err.message }, { status: 500 });
  }
}
