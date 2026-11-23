// Real stock data fetcher using Yahoo Finance
// Fetches live prices for NSE/BSE listed stocks

import { toYahooTicker } from './symbolMap';
import { quoteCache, QUOTE_TTL, cachedFetch } from './cache';

export interface StockPrice {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  currency: string;
}

export interface IndexData {
  value: number;
  change: number;
  changePercent: number;
}

// Fetch stock price from Yahoo Finance using the v8 chart endpoint
async function yahooFetch(yahooTicker: string): Promise<any> {
  const encodedTicker = encodeURIComponent(yahooTicker);
  // Try multiple endpoints since Yahoo changes them
  const endpoints = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodedTicker}?interval=1d&range=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodedTicker}?interval=1d&range=1d`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        next: { revalidate: 300 },
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      continue;
    }
  }
  return null;
}

// Fetch quote data from Yahoo Finance v6 quote endpoint (has change/changePercent)
async function yahooQuoteFetch(yahooTicker: string): Promise<any> {
  const encodedTicker = encodeURIComponent(yahooTicker);
  const urls = [
    `https://query1.finance.yahoo.com/v6/finance/quote?symbols=${encodedTicker}`,
    `https://query2.finance.yahoo.com/v6/finance/quote?symbols=${encodedTicker}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        next: { revalidate: 300 },
      });
      if (res.ok) {
        const json = await res.json();
        const q = json?.quoteResponse?.result?.[0];
        if (q) return q;
      }
    } catch { continue; }
  }
  return null;
}

// Fetch 5-day chart to compute real previous-trading-day close (works on weekends)
async function yahooChart5d(yahooTicker: string): Promise<{ prevClose: number; lastClose: number; change: number; changePercent: number } | null> {
  const encodedTicker = encodeURIComponent(yahooTicker);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedTicker}?interval=1d&range=5d`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const closes = result.indicators?.quote?.[0]?.close as number[] | undefined;
    const meta = result.meta;
    const lastClose = meta?.regularMarketPrice || 0;
    if (!closes || closes.length < 2 || lastClose <= 0) return null;
    // Last valid close before the final day = previous trading day's close
    const validCloses = closes.filter((c: number | null) => c != null && c > 0);
    if (validCloses.length < 2) return null;
    const prevClose = validCloses[validCloses.length - 2];
    const change = lastClose - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
    return { prevClose, lastClose, change, changePercent };
  } catch { return null; }
}

// Fetch stock price from Yahoo Finance (with caching)
export async function fetchStockPrice(symbol: string): Promise<StockPrice | null> {
  const cacheKey = `quote:${symbol}`;
  const cached = quoteCache.get<StockPrice>(cacheKey);
  if (cached) return cached;

  const nseSym = toYahooTicker(symbol);

  try {
    // Try v6 quote endpoint first — it has reliable change/changePercent fields
    const quote = await yahooQuoteFetch(nseSym);
    if (quote && quote.regularMarketPrice > 0) {
      const price = quote.regularMarketPrice;
      const prevClose = quote.regularMarketPreviousClose || quote.previousClose || price;
      const change = quote.regularMarketChange ?? (price - prevClose);
      let changePercent = quote.regularMarketChangePercent ?? 0;
      if (changePercent === 0 && change !== 0 && prevClose > 0) {
        changePercent = (change / prevClose) * 100;
      }

      const result: StockPrice = {
        symbol,
        name: quote.shortName || quote.longName || symbol,
        price,
        change,
        changePercent,
        previousClose: prevClose,
        dayHigh: quote.regularMarketDayHigh || price,
        dayLow: quote.regularMarketDayLow || price,
        volume: quote.regularMarketVolume || 0,
        currency: quote.currency || 'INR',
      };
      quoteCache.set(cacheKey, result, QUOTE_TTL);
      return result;
    }

    // Fallback to v8 chart endpoint
    const data = await yahooFetch(nseSym);
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const price = meta.regularMarketPrice || 0;
    const prevClose = meta.chartPreviousClose || meta.previousClose || price;
    const change = price - prevClose;
    let changePercent = prevClose > 0 && change !== 0 ? (change / prevClose) * 100 : 0;

    const result: StockPrice = {
      symbol: symbol,
      name: meta.shortName || meta.longName || symbol,
      price,
      change,
      changePercent,
      previousClose: prevClose,
      dayHigh: meta.regularMarketDayHigh || price,
      dayLow: meta.regularMarketDayLow || price,
      volume: meta.regularMarketVolume || 0,
      currency: meta.currency || 'INR',
    };

    // Cache successful result
    quoteCache.set(cacheKey, result, QUOTE_TTL);
    return result;
  } catch (error) {
    console.warn(`Failed to fetch price for ${symbol}:`, error);
    return null;
  }
}

// Alternative: Use Google Finance as fallback for index data
async function fetchIndexFromGoogle(indexName: 'NIFTY_50' | 'SENSEX'): Promise<IndexData | null> {
  try {
    const query = indexName === 'NIFTY_50' ? 'NIFTY_50' : 'SENSEX';
    const url = `https://www.google.com/finance/quote/${query}:INDEXNSE`;
    const altUrl = indexName === 'SENSEX' ? 'https://www.google.com/finance/quote/SENSEX:INDEXBOM' : url;
    
    const targetUrl = indexName === 'SENSEX' ? altUrl : url;
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!res.ok) return null;
    const html = await res.text();
    
    // Extract price from Google Finance HTML
    const priceMatch = html.match(/data-last-price="([\d.]+)"/);
    const changeMatch = html.match(/data-last-change="(-?[\d.]+)"/);
    const pctMatch = html.match(/data-last-change-percent="(-?[\d.]+)"/);
    
    if (priceMatch) {
      const value = parseFloat(priceMatch[1]);
      const change = changeMatch ? parseFloat(changeMatch[1]) : 0;
      let changePercent = pctMatch ? parseFloat(pctMatch[1]) : 0;
      if (changePercent === 0 && change !== 0 && value > 0) {
        const prevClose = value - change;
        changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
      }
      return {
        value,
        change,
        changePercent,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Fetch NIFTY 50 index data
export async function fetchNifty50(): Promise<IndexData> {
  // Try Yahoo Finance first
  try {
    const data = await fetchStockPrice('^NSEI');
    if (data && data.price > 0) {
      let changePercent = data.changePercent;
      let change = data.change;
      // If percent is still 0 (weekend/holiday), use 5-day chart to compute real change
      if (changePercent === 0 && Math.abs(change) < 0.01) {
        const chart5d = await yahooChart5d(toYahooTicker('^NSEI'));
        if (chart5d) {
          change = chart5d.change;
          changePercent = chart5d.changePercent;
          return { value: data.price, change, changePercent };
        }
      }
      if (changePercent === 0 && change !== 0) {
        const prevClose = data.previousClose > 0 ? data.previousClose : data.price - change;
        changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
      }
      return { value: data.price, change, changePercent };
    }
  } catch {}

  // Fallback to Google Finance
  try {
    const gf = await fetchIndexFromGoogle('NIFTY_50');
    if (gf && gf.value > 0) return gf;
  } catch {}

  return { value: 0, change: 0, changePercent: 0 };
}

// Fetch SENSEX index data
export async function fetchSensex(): Promise<IndexData> {
  try {
    const data = await fetchStockPrice('^BSESN');
    if (data && data.price > 0) {
      let changePercent = data.changePercent;
      let change = data.change;
      // If percent is still 0 (weekend/holiday), use 5-day chart to compute real change
      if (changePercent === 0 && Math.abs(change) < 0.01) {
        const chart5d = await yahooChart5d(toYahooTicker('^BSESN'));
        if (chart5d) {
          change = chart5d.change;
          changePercent = chart5d.changePercent;
          return { value: data.price, change, changePercent };
        }
      }
      if (changePercent === 0 && change !== 0) {
        const prevClose = data.previousClose > 0 ? data.previousClose : data.price - change;
        changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
      }
      return { value: data.price, change, changePercent };
    }
  } catch {}

  try {
    const gf = await fetchIndexFromGoogle('SENSEX');
    if (gf && gf.value > 0) return gf;
  } catch {}

  return { value: 0, change: 0, changePercent: 0 };
}

// Fetch multiple stock prices in parallel
export async function fetchMultipleStocks(symbols: string[]): Promise<Record<string, StockPrice>> {
  const results: Record<string, StockPrice> = {};
  
  const batchSize = 5;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const promises = batch.map(async (sym) => {
      const data = await fetchStockPrice(sym);
      if (data) results[sym] = data;
    });
    await Promise.all(promises);
    
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return results;
}

// Note: Real technical indicators (RSI, MACD, EMA, Bollinger Bands) are now
// computed in src/lib/technicalAnalysis.ts from actual Yahoo Finance OHLCV data.
// The old fake hash-based computeStockTechnicals() has been removed.
