// Broker API integration (Zerodha Kite / Upstox API)
// Provides options data (PCR, Open Interest, Call/Put chain) and Delivery analytics

export interface OptionStrikeData {
  strike: number;
  callOI: number;
  putOI: number;
  callVolume: number;
  putVolume: number;
  callIv: number;
  putIv: number;
}

export interface UpstoxQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  source: 'upstox';
}

export interface DerivativesData {
  symbol: string;
  spotPrice: number;
  pcr: number;
  pcrSignal: 'Bullish' | 'Bearish' | 'Neutral';
  totalCallOI: number;
  totalPutOI: number;
  strikes: OptionStrikeData[];
  deliveryHistory: {
    date: string;
    deliveryPercent: number; // 0-100
    tradedVolume: number;
  }[];
}

export interface BrokerConfig {
  provider: 'zerodha' | 'upstox' | 'mock';
  apiKey: string;
  apiSecret: string;
  accessToken?: string;
  connected: boolean;
}

const STORAGE_KEY = 'marketpulse_broker_config';

export function getBrokerConfig(): BrokerConfig {
  if (typeof window === 'undefined') {
    return { provider: 'mock', apiKey: '', apiSecret: '', connected: false };
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // fallback
    }
  }
  return { provider: 'mock', apiKey: '', apiSecret: '', connected: false };
}

export function saveBrokerConfig(config: BrokerConfig): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }
}

// Generate realistic option chain and delivery percentages for a stock
export function generateMockDerivativesData(symbol: string, spotPrice: number): DerivativesData {
  // Determine strike spacing
  let spacing = 10;
  if (spotPrice > 15000) spacing = 100;
  else if (spotPrice > 5000) spacing = 50;
  else if (spotPrice > 1000) spacing = 20;
  else if (spotPrice > 500) spacing = 10;
  else spacing = 5;

  const atmStrike = Math.round(spotPrice / spacing) * spacing;
  const strikes: OptionStrikeData[] = [];
  
  let totalCallOI = 0;
  let totalPutOI = 0;

  // Generate 5 strikes OTM/ITM on either side
  for (let i = -5; i <= 5; i++) {
    const strike = atmStrike + i * spacing;
    
    // Call OI peaks at higher strikes (resistance), declines at lower strikes
    // Put OI peaks at lower strikes (support), declines at higher strikes
    // Add some random noise
    const baseOI = 50000 + Math.round(Math.random() * 20000);
    const callMultiplier = i > 0 ? (6 - i) * 1.5 : (6 + i) * 0.4;
    const putMultiplier = i < 0 ? (6 + i) * 1.5 : (6 - i) * 0.4;

    const callOI = Math.max(2000, Math.round(baseOI * callMultiplier));
    const putOI = Math.max(2000, Math.round(baseOI * putMultiplier));
    
    const callVolume = Math.round(callOI * (0.8 + Math.random() * 0.4));
    const putVolume = Math.round(putOI * (0.8 + Math.random() * 0.4));

    const callIv = parseFloat((12.5 + Math.random() * 5 + i * 0.2).toFixed(2));
    const putIv = parseFloat((13.0 + Math.random() * 5 - i * 0.2).toFixed(2));

    strikes.push({
      strike,
      callOI,
      putOI,
      callVolume,
      putVolume,
      callIv,
      putIv
    });

    totalCallOI += callOI;
    totalPutOI += putOI;
  }

  const pcr = parseFloat((totalPutOI / totalCallOI).toFixed(2));
  const pcrSignal = pcr > 1.05 ? 'Bullish' : pcr < 0.85 ? 'Bearish' : 'Neutral';

  // Generate 10 days of delivery history
  const deliveryHistory = [];
  const today = new Date();
  
  for (let i = 9; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    // Skip weekends for delivery data
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    // Delivery percent typically oscillates between 30% and 65% in Indian stock market
    const baseDelivery = 40 + (symbol.charCodeAt(0) % 15);
    const noise = Math.sin(i) * 5 + (Math.random() * 8 - 4);
    const deliveryPercent = parseFloat(Math.min(95, Math.max(10, baseDelivery + noise)).toFixed(1));
    const tradedVolume = 100000 + Math.round(Math.random() * 500000);

    deliveryHistory.push({
      date: date.toISOString().split('T')[0],
      deliveryPercent,
      tradedVolume
    });
  }

  return {
    symbol,
    spotPrice,
    pcr,
    pcrSignal,
    totalCallOI,
    totalPutOI,
    strikes,
    deliveryHistory
  };
}

// Main integration fetch function (handles mock/real credentials)
export async function getDerivativesData(symbol: string, spotPrice: number): Promise<DerivativesData> {
  const config = getBrokerConfig();
  
  if (config.provider === 'mock' || !config.connected) {
    // Return high-fidelity simulated option chain
    return generateMockDerivativesData(symbol, spotPrice);
  }

  // Scaffolding for real Zerodha/Upstox integration
  // Under a real environment, this makes a secure backend call to proxy the request using credentials
  try {
    const response = await fetch(`/api/broker/derivatives?symbol=${symbol}&provider=${config.provider}`, {
      headers: {
        'Authorization': `Bearer ${config.accessToken || ''}`,
        'X-API-Key': config.apiKey
      }
    });

    if (response.ok) {
      const data = await response.json();
      return data;
    }
  } catch (err) {
    console.warn('[Broker API] Error querying real broker data, falling back to simulation:', err);
  }

  return generateMockDerivativesData(symbol, spotPrice);
}

// ─── Upstox Live Quote ────────────────────────────────────────────────────────
// Fetch a live stock/index quote from Upstox when broker is connected.
// Returns null if not connected or on any error.
export async function getUpstoxQuote(symbol: string): Promise<UpstoxQuote | null> {
  const config = getBrokerConfig();
  if (config.provider !== 'upstox' || !config.connected || !config.accessToken) {
    return null;
  }

  try {
    const res = await fetch(`/api/broker/quote?symbol=${encodeURIComponent(symbol)}`, {
      headers: {
        'X-Upstox-Token': config.accessToken,
      },
    });

    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('[Upstox Quote] Failed:', err);
  }
  return null;
}

// ─── Broker Status Utility ───────────────────────────────────────────────────
// Quick helper to check broker connection status from any component
export function getBrokerStatus(): {
  isConnected: boolean;
  provider: 'zerodha' | 'upstox' | 'mock';
  isUpstox: boolean;
  isZerodha: boolean;
  isMock: boolean;
} {
  const config = getBrokerConfig();
  return {
    isConnected: config.connected,
    provider: config.provider,
    isUpstox: config.provider === 'upstox' && config.connected,
    isZerodha: config.provider === 'zerodha' && config.connected,
    isMock: config.provider === 'mock' || !config.connected,
  };
}
