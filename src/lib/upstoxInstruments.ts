// Upstox Instrument Key Mapping
// Maps NSE trading symbols to Upstox instrument keys (segment|ISIN format)
// This avoids an extra API call to the search endpoint for commonly tracked stocks.
// For stocks not in this map, the derivatives route falls back to the search API.

export const SYMBOL_TO_INSTRUMENT_KEY: Record<string, string> = {
  // Energy & Oil
  'RELIANCE':    'NSE_EQ|INE002A01018',
  'ONGC':        'NSE_EQ|INE213A01029',
  'IOC':         'NSE_EQ|INE242A01010',
  'BPCL':        'NSE_EQ|INE029A01011',
  'GAIL':        'NSE_EQ|INE129A01019',

  // Power & Utilities
  'NTPC':        'NSE_EQ|INE733E01010',
  'POWERGRID':   'NSE_EQ|INE752E01010',
  'TATAPOWER':   'NSE_EQ|INE245A01021',
  'ADANIGREEN':  'NSE_EQ|INE364U01010',
  'JSWENERGY':   'NSE_EQ|INE121E01018',

  // Automobile
  'MARUTI':      'NSE_EQ|INE585B01010',
  'TATAMOTORS':  'NSE_EQ|INE155A01022',
  'M&M':         'NSE_EQ|INE101A01026',
  'BAJAJ-AUTO':  'NSE_EQ|INE917I01010',
  'HEROMOTOCO':  'NSE_EQ|INE158A01026',

  // Gold & Precious Metals
  'TITAN':       'NSE_EQ|INE280A01028',
  'MUTHOOTFIN':  'NSE_EQ|INE414G01012',
  'MANAPPURAM':  'NSE_EQ|INE522D01027',
  'KALYANFIN':   'NSE_EQ|INE00CC01010',
  'SENCO':       'NSE_EQ|INE0MFM01013',

  // EV
  'OLECTRA':     'NSE_EQ|INE260D01016',
  'EXIDEIND':    'NSE_EQ|INE302A01020',
  'KPITTECH':    'NSE_EQ|INE04I401011',

  // Banking & Finance
  'HDFCBANK':    'NSE_EQ|INE040A01034',
  'ICICIBANK':   'NSE_EQ|INE090A01021',
  'SBIN':        'NSE_EQ|INE062A01020',
  'KOTAKBANK':   'NSE_EQ|INE237A01028',
  'AXISBANK':    'NSE_EQ|INE238A01034',

  // IT & Technology
  'TCS':         'NSE_EQ|INE467B01029',
  'INFY':        'NSE_EQ|INE009A01021',
  'WIPRO':       'NSE_EQ|INE075A01022',
  'HCLTECH':     'NSE_EQ|INE860A01027',
  'TECHM':       'NSE_EQ|INE669C01036',

  // Pharma & Healthcare
  'SUNPHARMA':   'NSE_EQ|INE044A01036',
  'DRREDDY':     'NSE_EQ|INE089A01023',
  'CIPLA':       'NSE_EQ|INE059A01026',
  'APOLLOHOSP':  'NSE_EQ|INE437A01024',
  'BIOCON':      'NSE_EQ|INE376G01013',

  // Indices (for option chain)
  'NIFTY':       'NSE_INDEX|Nifty 50',
  'BANKNIFTY':   'NSE_INDEX|Nifty Bank',
  'FINNIFTY':    'NSE_INDEX|Nifty Fin Service',
};

// Get the Upstox instrument key for a symbol, returns null if not mapped
export function getInstrumentKey(symbol: string): string | null {
  return SYMBOL_TO_INSTRUMENT_KEY[symbol.toUpperCase()] || null;
}
