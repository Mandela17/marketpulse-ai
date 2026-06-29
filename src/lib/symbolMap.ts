// Yahoo Finance symbol mapping for Indian stocks
// Handles tickers that don't follow the simple "{SYMBOL}.NS" pattern

/**
 * Maps NSE symbols to their correct Yahoo Finance ticker.
 * Only includes symbols that DON'T follow the default `{SYMBOL}.NS` convention.
 */
const YAHOO_TICKER_OVERRIDES: Record<string, string> = {
  // Symbols with special characters
  'M&M':          'M%26M.NS',           // URL-encoded ampersand
  'BAJAJ-AUTO':   'BAJAJ-AUTO.NS',      // Hyphen is fine for Yahoo
  'L&T':          'LT.NS',              // L&T → LT on Yahoo
  'M&MFIN':       'M%26MFIN.NS',

  // Tata Motors — DVR shares sometimes confuse Yahoo
  'TATAMOTORS':   'TATAMOTORS.NS',      // This IS correct, but Yahoo sometimes has issues

  // BSE-specific or renamed tickers
  'NIFTY':        '^NSEI',              // Index
  'BANKNIFTY':    '^NSEBANK',           // Index
  'SENSEX':       '^BSESN',            // Index
  'INDIAVIX':     '^INDIAVIX',         // VIX

  // Common alternate names
  'ADANIGREEN':   'ADANIGREEN.NS',
  'JSWENERGY':    'JSWENERGY.NS',
  'TATAPOWER':    'TATAPOWER.NS',
};

/**
 * Convert an NSE symbol to its correct Yahoo Finance ticker.
 * Uses override map for special cases, otherwise appends `.NS`.
 */
export function toYahooTicker(symbol: string): string {
  // Already has a suffix or is an index symbol
  if (symbol.includes('.') || symbol.startsWith('^')) {
    return symbol;
  }

  const upper = symbol.toUpperCase();

  // Check overrides first
  if (YAHOO_TICKER_OVERRIDES[upper]) {
    return YAHOO_TICKER_OVERRIDES[upper];
  }

  // Default: append .NS for NSE
  return `${upper}.NS`;
}

/**
 * Convert a Yahoo Finance ticker back to an NSE display symbol.
 */
export function fromYahooTicker(yahooTicker: string): string {
  // Remove .NS or .BO suffix
  let symbol = yahooTicker.replace(/\.(NS|BO)$/i, '');

  // Decode URL-encoded characters
  symbol = decodeURIComponent(symbol);

  return symbol;
}

/**
 * Clean symbol for use in URLs (handles & and other special chars).
 */
export function encodeSymbolForUrl(symbol: string): string {
  return encodeURIComponent(symbol);
}

/**
 * Decode a URL-encoded symbol back to display form.
 */
export function decodeSymbolFromUrl(encoded: string): string {
  return decodeURIComponent(encoded);
}
