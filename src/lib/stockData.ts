// Real stock data fetcher using Yahoo Finance
// Fetches live prices for NSE/BSE listed stocks

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

// Fetch stock price from Yahoo Finance using the v6 quote endpoint
async function yahooFetch(symbol: string): Promise<any> {
  // Try multiple endpoints since Yahoo changes them
  const endpoints = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
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

// Fetch stock price from Yahoo Finance
export async function fetchStockPrice(symbol: string): Promise<StockPrice | null> {
  const nseSym = symbol.includes('.') || symbol.startsWith('^') ? symbol : `${symbol}.NS`;

  try {
    const data = await yahooFetch(nseSym);
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const price = meta.regularMarketPrice || 0;
    const prevClose = meta.chartPreviousClose || meta.previousClose || price;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
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
  } catch (error) {
    console.warn(`Failed to fetch price for ${symbol}:`, error);
    return null;
  }
}

// Alternative: Use Google Finance as fallback for index data
async function fetchIndexFromGoogle(indexName: 'NIFTY_50' | 'SENSEX'): Promise<IndexData | null> {
  try {
    const query = indexName === 'NIFTY_50' ? 'NIFTY+50' : 'SENSEX';
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
      return {
        value: parseFloat(priceMatch[1]),
        change: changeMatch ? parseFloat(changeMatch[1]) : 0,
        changePercent: pctMatch ? parseFloat(pctMatch[1]) : 0,
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
      return { value: data.price, change: data.change, changePercent: data.changePercent };
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
      return { value: data.price, change: data.change, changePercent: data.changePercent };
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
