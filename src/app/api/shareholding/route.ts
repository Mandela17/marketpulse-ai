// API route to fetch shareholding pattern from Upstox Fundamentals API
// GET /api/shareholding?symbol=RELIANCE
// Falls back to curated local data when Upstox token is unavailable

import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { getInstrumentKey } from '@/lib/upstoxInstruments';
import { getUpstoxToken } from '@/lib/upstoxTokenStore';
import { getShareholdingData, type ShareholdingQuarter, type StockShareholding } from '@/lib/shareholdingData';

// Simple in-memory cache (shareholding is quarterly, so long TTL is fine)
const shCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours — data is quarterly

interface UpstoxCategory {
  category: string;
  history: { period: string; value: number }[];
}

function mapUpstoxCategory(cat: string): string {
  const map: Record<string, string> = {
    'promoters': 'promoter',
    'promoter': 'promoter',
    'fii': 'fii',
    'foreign_institutional_investors': 'fii',
    'dii': 'dii',
    'other_dii': 'dii',
    'domestic_institutional_investors': 'dii',
    'mutual_fund': 'mutualFund',
    'mutual_funds': 'mutualFund',
    'public': 'retail',
    'retail': 'retail',
    'others': 'others',
    'government': 'others',
  };
  return map[cat.toLowerCase()] || 'others';
}

function transformUpstoxData(symbol: string, data: UpstoxCategory[]): StockShareholding | null {
  if (!data || !Array.isArray(data) || data.length === 0) return null;

  // Get all unique periods sorted (most recent first)
  const allPeriods = new Set<string>();
  for (const cat of data) {
    for (const h of cat.history || []) {
      allPeriods.add(h.period);
    }
  }
  const periods = Array.from(allPeriods).sort((a, b) => {
    // Parse "Mar 2026" → Date for sorting
    const da = new Date(a);
    const db = new Date(b);
    return db.getTime() - da.getTime();
  }).slice(0, 8); // Last 8 quarters max

  // Build quarter records
  const history: ShareholdingQuarter[] = periods.map(period => {
    const q: ShareholdingQuarter = {
      quarter: period,
      promoter: 0,
      fii: 0,
      dii: 0,
      mutualFund: 0,
      retail: 0,
      others: 0,
    };

    for (const cat of data) {
      const mapped = mapUpstoxCategory(cat.category);
      const historyEntry = cat.history?.find(h => h.period === period);
      if (historyEntry && mapped !== 'quarter') {
        // Some Upstox categories map to the same field (e.g. other_dii → dii)
        // So we accumulate
        const rec = q as unknown as Record<string, number>;
        rec[mapped] = (rec[mapped] || 0) + historyEntry.value;
      }
    }

    return q;
  });

  return {
    symbol: symbol.toUpperCase(),
    companyName: symbol,
    history,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol parameter required' }, { status: 400 });
  }

  const cleanSymbol = symbol.toUpperCase().trim();

  // Check cache first
  const cached = shCache.get(cleanSymbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ 
      data: cached.data, 
      source: cached.data?._source || 'cached',
    });
  }

  // Try Upstox API first
  try {
    let upstoxToken = '';
    const storedToken = await getUpstoxToken();
    if (storedToken) {
      upstoxToken = storedToken.accessToken;
    }

    if (upstoxToken && upstoxToken !== 'sandbox' && upstoxToken !== 'mock') {
      const instrumentKey = getInstrumentKey(cleanSymbol);
      if (instrumentKey) {
        // Extract ISIN from instrument key (format: "NSE_EQ|INE002A01018")
        const isin = instrumentKey.split('|')[1];
        if (isin) {
          const url = `https://api.upstox.com/v2/fundamentals/${isin}/share-holdings`;
          console.log(`[Shareholding] Fetching from Upstox: ${url}`);

          const res = await fetch(url, {
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${upstoxToken}`,
            },
          });

          if (res.ok) {
            const json = await res.json();
            if (json.status === 'success' && json.data) {
              const transformed = transformUpstoxData(cleanSymbol, json.data);
              if (transformed && transformed.history.length > 0) {
                const result = { ...transformed, _source: 'upstox' };
                shCache.set(cleanSymbol, { data: result, ts: Date.now() });
                console.log(`[Shareholding] ✅ Upstox data for ${cleanSymbol}: ${transformed.history.length} quarters`);
                return NextResponse.json({ data: result, source: 'upstox' });
              }
            }
          } else {
            console.warn(`[Shareholding] Upstox returned ${res.status} for ${cleanSymbol}`);
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[Shareholding] Upstox error for ${cleanSymbol}:`, err);
  }

  // Fallback to curated local data
  const localData = getShareholdingData(cleanSymbol);
  if (localData) {
    const result = { ...localData, _source: 'local' };
    shCache.set(cleanSymbol, { data: result, ts: Date.now() });
    return NextResponse.json({ data: result, source: 'local' });
  }

  return NextResponse.json({ 
    data: null, 
    source: 'none',
    message: `No shareholding data for ${cleanSymbol}`,
  });
}
