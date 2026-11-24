// Shared constituent universe & response types for Nifty Heatmap

export interface HeatmapConstituent {
  symbol: string;
  name: string;
  sector: string;
  weight: number;
}

export interface HeatmapStockItem extends HeatmapConstituent {
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  indexImpact: number; // weight * changePercent contribution proxy
  rsi: number | null;
  prediction: {
    direction: 'bullish' | 'bearish' | 'neutral';
    probability: number;
    confidenceLevel: string;
  } | null;
  dataSource: 'upstox' | 'yahoo' | 'db';
}

export interface HeatmapStats {
  total: number;
  advancers: number;
  decliners: number;
  unchanged: number;
  avgChange: number;
  weightedIndexChange: number;
  bullishCount: number;
  bearishCount: number;
  topGainers: HeatmapStockItem[];
  topLosers: HeatmapStockItem[];
  topPositiveImpact: HeatmapStockItem[];
  topNegativeImpact: HeatmapStockItem[];
}

export interface HeatmapResponse {
  stocks: HeatmapStockItem[];
  stats: HeatmapStats;
  source: 'upstox' | 'yahoo' | 'mixed';
  timestamp: string;
  fetchMs: number;
}

export const NIFTY_HEATMAP_CONSTITUENTS: HeatmapConstituent[] = [
  // Banking & Finance
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Banking', weight: 13.1 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Banking', weight: 7.8 },
  { symbol: 'SBIN', name: 'SBI', sector: 'Banking', weight: 3.2 },
  { symbol: 'KOTAKBANK', name: 'Kotak Bank', sector: 'Banking', weight: 2.7 },
  { symbol: 'AXISBANK', name: 'Axis Bank', sector: 'Banking', weight: 2.5 },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', sector: 'Finance', weight: 2.1 },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv', sector: 'Finance', weight: 0.8 },
  { symbol: 'INDUSINDBK', name: 'IndusInd Bank', sector: 'Banking', weight: 0.7 },

  // IT
  { symbol: 'INFY', name: 'Infosys', sector: 'IT', weight: 5.8 },
  { symbol: 'TCS', name: 'TCS', sector: 'IT', weight: 4.2 },
  { symbol: 'HCLTECH', name: 'HCL Tech', sector: 'IT', weight: 1.8 },
  { symbol: 'WIPRO', name: 'Wipro', sector: 'IT', weight: 0.9 },
  { symbol: 'TECHM', name: 'Tech Mahindra', sector: 'IT', weight: 0.8 },

  // Energy & Power
  { symbol: 'RELIANCE', name: 'Reliance', sector: 'Energy', weight: 9.5 },
  { symbol: 'NTPC', name: 'NTPC', sector: 'Power', weight: 1.5 },
  { symbol: 'POWERGRID', name: 'Power Grid', sector: 'Power', weight: 1.2 },
  { symbol: 'ONGC', name: 'ONGC', sector: 'Energy', weight: 1.1 },
  { symbol: 'ADANIENT', name: 'Adani Ent.', sector: 'Energy', weight: 1.0 },
  { symbol: 'BPCL', name: 'BPCL', sector: 'Energy', weight: 0.6 },

  // Auto
  { symbol: 'M&M', name: 'M&M', sector: 'Auto', weight: 2.3 },
  { symbol: 'MARUTI', name: 'Maruti', sector: 'Auto', weight: 1.6 },
  { symbol: 'TMCV', name: 'Tata Motors CV', sector: 'Auto', weight: 1.4 },
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto', sector: 'Auto', weight: 1.0 },
  { symbol: 'EICHERMOT', name: 'Eicher Motors', sector: 'Auto', weight: 0.8 },
  { symbol: 'HEROMOTOCO', name: 'Hero Moto', sector: 'Auto', weight: 0.7 },

  // Pharma & Health
  { symbol: 'SUNPHARMA', name: 'Sun Pharma', sector: 'Pharma', weight: 1.8 },
  { symbol: 'DRREDDY', name: 'Dr. Reddy', sector: 'Pharma', weight: 0.9 },
  { symbol: 'CIPLA', name: 'Cipla', sector: 'Pharma', weight: 0.8 },
  { symbol: 'APOLLOHOSP', name: 'Apollo Hospital', sector: 'Pharma', weight: 0.7 },
  { symbol: 'DIVISLAB', name: "Divi's Labs", sector: 'Pharma', weight: 0.7 },

  // FMCG
  { symbol: 'ITC', name: 'ITC', sector: 'FMCG', weight: 4.1 },
  { symbol: 'HINDUNILVR', name: 'HUL', sector: 'FMCG', weight: 2.5 },
  { symbol: 'NESTLEIND', name: 'Nestle', sector: 'FMCG', weight: 0.7 },
  { symbol: 'TATACONSUM', name: 'Tata Consumer', sector: 'FMCG', weight: 0.6 },

  // Metals & Mining
  { symbol: 'TATASTEEL', name: 'Tata Steel', sector: 'Metals', weight: 1.0 },
  { symbol: 'JSWSTEEL', name: 'JSW Steel', sector: 'Metals', weight: 0.9 },
  { symbol: 'COALINDIA', name: 'Coal India', sector: 'Metals', weight: 0.8 },
  { symbol: 'HINDALCO', name: 'Hindalco', sector: 'Metals', weight: 0.7 },

  // Telecom & Aviation
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom', weight: 3.5 },
  { symbol: 'INDIGO', name: 'IndiGo', sector: 'Aviation', weight: 1.5 },

  // Infra, Cement, Consumer & Others
  { symbol: 'LT', name: 'L&T', sector: 'Infra', weight: 3.5 },
  { symbol: 'ADANIPORTS', name: 'Adani Ports', sector: 'Infra', weight: 1.2 },
  { symbol: 'TITAN', name: 'Titan', sector: 'Consumer', weight: 1.4 },
  { symbol: 'ASIANPAINT', name: 'Asian Paints', sector: 'Consumer', weight: 1.1 },
  { symbol: 'ULTRACEMCO', name: 'UltraTech', sector: 'Cement', weight: 1.0 },
  { symbol: 'GRASIM', name: 'Grasim', sector: 'Cement', weight: 0.7 },
  { symbol: 'SHREECEM', name: 'Shree Cement', sector: 'Cement', weight: 0.5 },
  { symbol: 'TRENT', name: 'Trent', sector: 'Retail', weight: 0.8 },
  { symbol: 'BEL', name: 'BEL', sector: 'Defense', weight: 0.7 },
  { symbol: 'SBILIFE', name: 'SBI Life', sector: 'Insurance', weight: 0.7 },
  { symbol: 'HDFCLIFE', name: 'HDFC Life', sector: 'Insurance', weight: 0.6 },
];

