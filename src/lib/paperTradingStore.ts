// Paper Trading Store — Virtual order placement & P&L tracking
// All data stored in localStorage (no backend needed)

// ─── Types ───────────────────────────────────────────────────────────

export interface PaperOrder {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'SL';
  qty: number;
  price: number;           // execution/fill price
  limitPrice?: number;     // for LIMIT/SL orders
  stopLoss?: number;
  target?: number;
  status: 'FILLED' | 'CANCELLED';
  filledAt: string;        // ISO timestamp
  createdAt: string;
  source: 'manual' | 'strategy';
  strategyName?: string;
  notes?: string;
}

export interface ClosedTrade {
  id: string;
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  entryDate: string;
  exitDate: string;
  pnl: number;
  pnlPercent: number;
  holdingDays: number;
  source: 'manual' | 'strategy';
  strategyName?: string;
}

export interface PaperPosition {
  symbol: string;
  qty: number;
  avgPrice: number;
  totalInvested: number;
  orders: PaperOrder[];   // BUY orders that make up this position
}

export interface PaperTradingState {
  startingCapital: number;
  currentCash: number;
  orders: PaperOrder[];
  closedTrades: ClosedTrade[];
  createdAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────

const STORAGE_KEY = 'marketpulse_paper_trading';
const DEFAULT_CAPITAL = 1000000; // ₹10,00,000

// ─── Helpers ─────────────────────────────────────────────────────────

function generateId(): string {
  return `PT-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

// ─── State Management ────────────────────────────────────────────────

export function loadPaperState(): PaperTradingState {
  if (typeof window === 'undefined') {
    return createFreshState();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as PaperTradingState;
    }
  } catch (e) {
    console.error('[PaperTrading] Failed to load state:', e);
  }
  return createFreshState();
}

// Load from Supabase (async) — use on initial page load
export async function loadPaperStateFromDB(): Promise<PaperTradingState> {
  try {
    const res = await fetch('/api/paper-trading');
    const data = await res.json();
    if (data?.state) {
      if (typeof window !== 'undefined') {
        // Cache state in localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.state));
        // Restore auto-trade config and log
        if (data.autoConfig) {
          localStorage.setItem(AUTO_TRADE_KEY, JSON.stringify(data.autoConfig));
        }
        if (data.autoLog) {
          localStorage.setItem(AUTO_TRADE_LOG_KEY, JSON.stringify(data.autoLog));
        }
      }
      return data.state as PaperTradingState;
    }
  } catch (e) {
    console.error('[PaperTrading] Failed to load from DB:', e);
  }
  // Fallback to localStorage
  return loadPaperState();
}

function savePaperState(state: PaperTradingState): void {
  // Save to localStorage (instant)
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('[PaperTrading] Failed to save to localStorage:', e);
    }
  }

  // Save to Supabase (async, non-blocking)
  syncToSupabase(state);
}

// Debounced Supabase sync — avoids hammering DB on rapid trades
let _syncTimeout: ReturnType<typeof setTimeout> | null = null;

function syncToSupabase(state: PaperTradingState): void {
  if (typeof window === 'undefined') return;

  if (_syncTimeout) clearTimeout(_syncTimeout);
  _syncTimeout = setTimeout(async () => {
    try {
      const autoConfig = getAutoTradeConfig();
      const autoLog = getAutoTradeLog();
      await fetch('/api/paper-trading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, autoConfig, autoLog }),
      });
    } catch (e) {
      console.error('[PaperTrading] Supabase sync failed:', e);
    }
  }, 1000); // 1 second debounce
}

export function createFreshState(): PaperTradingState {
  return {
    startingCapital: DEFAULT_CAPITAL,
    currentCash: DEFAULT_CAPITAL,
    orders: [],
    closedTrades: [],
    createdAt: new Date().toISOString(),
  };
}

export function resetPaperAccount(): PaperTradingState {
  const fresh = createFreshState();
  savePaperState(fresh);
  // Also clear the auto-trade log so user can run again after reset
  if (typeof window !== 'undefined') {
    localStorage.removeItem(AUTO_TRADE_LOG_KEY);
  }
  return fresh;
}

// ─── Get Open Positions ──────────────────────────────────────────────
// Aggregates all filled BUY orders minus closed trades to find net positions

export function getOpenPositions(state: PaperTradingState): PaperPosition[] {
  const posMap = new Map<string, { qty: number; totalCost: number; orders: PaperOrder[] }>();

  // Add BUY orders
  for (const order of state.orders) {
    if (order.status !== 'FILLED') continue;

    const existing = posMap.get(order.symbol) || { qty: 0, totalCost: 0, orders: [] };

    if (order.side === 'BUY') {
      existing.qty += order.qty;
      existing.totalCost += order.price * order.qty;
      existing.orders.push(order);
    } else {
      // SELL reduces position
      existing.qty -= order.qty;
      existing.totalCost -= (existing.totalCost / (existing.qty + order.qty)) * order.qty;
    }

    posMap.set(order.symbol, existing);
  }

  const positions: PaperPosition[] = [];
  for (const [symbol, data] of posMap) {
    if (data.qty > 0) {
      positions.push({
        symbol,
        qty: data.qty,
        avgPrice: data.totalCost / data.qty,
        totalInvested: data.totalCost,
        orders: data.orders,
      });
    }
  }

  return positions;
}

// ─── Place Order ─────────────────────────────────────────────────────

export interface PlaceOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'SL';
  qty: number;
  price: number;           // current market price (used for MARKET orders)
  limitPrice?: number;
  stopLoss?: number;
  target?: number;
  source?: 'manual' | 'strategy';
  strategyName?: string;
  notes?: string;
}

export interface PlaceOrderResult {
  success: boolean;
  error?: string;
  order?: PaperOrder;
  state?: PaperTradingState;
}

export function placePaperOrder(params: PlaceOrderParams): PlaceOrderResult {
  const state = loadPaperState();

  // Determine fill price
  const fillPrice = params.orderType === 'MARKET'
    ? params.price
    : (params.limitPrice || params.price);

  const orderValue = fillPrice * params.qty;

  // ─── Validation ───
  if (params.qty <= 0) {
    return { success: false, error: 'Quantity must be greater than 0' };
  }

  if (fillPrice <= 0) {
    return { success: false, error: 'Price must be greater than 0' };
  }

  if (params.side === 'BUY') {
    // Check if we have enough cash
    if (orderValue > state.currentCash) {
      return {
        success: false,
        error: `Insufficient funds. Need ₹${orderValue.toLocaleString('en-IN')} but only ₹${state.currentCash.toLocaleString('en-IN')} available.`,
      };
    }

    // 2% risk warning (non-blocking)
    const riskPercent = (orderValue / (state.currentCash + getInvestedValue(state))) * 100;
    const notes = params.notes || '';
    const riskNote = riskPercent > 2 ? ` [⚠ ${riskPercent.toFixed(1)}% of capital]` : '';

    const order: PaperOrder = {
      id: generateId(),
      symbol: params.symbol.toUpperCase(),
      side: 'BUY',
      orderType: params.orderType,
      qty: params.qty,
      price: fillPrice,
      limitPrice: params.limitPrice,
      stopLoss: params.stopLoss,
      target: params.target,
      status: 'FILLED',
      filledAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      source: params.source || 'manual',
      strategyName: params.strategyName,
      notes: notes + riskNote,
    };

    state.orders.push(order);
    state.currentCash -= orderValue;
    savePaperState(state);

    return { success: true, order, state };

  } else {
    // SELL — close or reduce a position
    const positions = getOpenPositions(state);
    const position = positions.find(p => p.symbol === params.symbol.toUpperCase());

    if (!position) {
      return { success: false, error: `No open position in ${params.symbol}` };
    }

    if (params.qty > position.qty) {
      return { success: false, error: `Can only sell up to ${position.qty} shares (you have ${position.qty})` };
    }

    const order: PaperOrder = {
      id: generateId(),
      symbol: params.symbol.toUpperCase(),
      side: 'SELL',
      orderType: params.orderType,
      qty: params.qty,
      price: fillPrice,
      limitPrice: params.limitPrice,
      status: 'FILLED',
      filledAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      source: params.source || 'manual',
      strategyName: params.strategyName,
      notes: params.notes,
    };

    state.orders.push(order);
    state.currentCash += orderValue;

    // Record closed trade
    const pnl = (fillPrice - position.avgPrice) * params.qty;
    const pnlPercent = ((fillPrice - position.avgPrice) / position.avgPrice) * 100;
    const entryDate = position.orders[0]?.filledAt || new Date().toISOString();
    const holdingDays = Math.max(1, Math.round(
      (new Date().getTime() - new Date(entryDate).getTime()) / (1000 * 60 * 60 * 24)
    ));

    state.closedTrades.push({
      id: generateId(),
      symbol: params.symbol.toUpperCase(),
      entryPrice: position.avgPrice,
      exitPrice: fillPrice,
      qty: params.qty,
      entryDate,
      exitDate: new Date().toISOString(),
      pnl,
      pnlPercent,
      holdingDays,
      source: params.source || 'manual',
      strategyName: params.strategyName,
    });

    savePaperState(state);
    return { success: true, order, state };
  }
}

// ─── Analytics ───────────────────────────────────────────────────────

function getInvestedValue(state: PaperTradingState): number {
  const positions = getOpenPositions(state);
  return positions.reduce((sum, p) => sum + p.totalInvested, 0);
}

export function getPaperStats(state: PaperTradingState) {
  const totalTrades = state.closedTrades.length;
  const winners = state.closedTrades.filter(t => t.pnl > 0).length;
  const losers = state.closedTrades.filter(t => t.pnl < 0).length;
  const totalRealizedPnl = state.closedTrades.reduce((s, t) => s + t.pnl, 0);
  const winRate = totalTrades > 0 ? (winners / totalTrades) * 100 : 0;

  const avgWin = winners > 0
    ? state.closedTrades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0) / winners
    : 0;
  const avgLoss = losers > 0
    ? Math.abs(state.closedTrades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0) / losers)
    : 0;
  const riskReward = avgLoss > 0 ? avgWin / avgLoss : 0;

  const investedValue = getInvestedValue(state);
  const portfolioValue = state.currentCash + investedValue;
  const totalPnlPercent = ((portfolioValue - state.startingCapital) / state.startingCapital) * 100;

  return {
    portfolioValue,
    investedValue,
    cashAvailable: state.currentCash,
    totalRealizedPnl,
    totalPnlPercent,
    totalTrades,
    winners,
    losers,
    winRate,
    avgWin,
    avgLoss,
    riskReward,
    openPositionCount: getOpenPositions(state).length,
  };
}

// ─── Auto Paper Trading ──────────────────────────────────────────────
// Automatically places paper orders from AI predictions daily

const AUTO_TRADE_KEY = 'marketpulse_auto_paper_trade';
const AUTO_TRADE_LOG_KEY = 'marketpulse_auto_trade_log';

export interface AutoTradeConfig {
  enabled: boolean;
  maxPositions: number;       // max simultaneous positions (default 10)
  riskPerTrade: number;       // % of capital per trade (default 2)
  slPercent: number;          // stop-loss % below entry (default 3)
  targetPercent: number;      // target % above entry (default 6)
  onlyAGrade: boolean;        // only A-grade signals (default false = A+B)
  autoCloseOnTarget: boolean; // auto-close when price hits target (default true)
  autoCloseOnSL: boolean;     // auto-close when price hits stop-loss (default true)
}

export interface AutoTradeLogEntry {
  date: string;       // YYYY-MM-DD
  placed: number;
  skipped: number;
  closed: number;
  symbols: string[];
  closedSymbols: string[];
}

export function getAutoTradeConfig(): AutoTradeConfig {
  if (typeof window === 'undefined') return defaultAutoConfig();
  try {
    const raw = localStorage.getItem(AUTO_TRADE_KEY);
    if (raw) return { ...defaultAutoConfig(), ...JSON.parse(raw) };
  } catch {}
  return defaultAutoConfig();
}

export function saveAutoTradeConfig(config: AutoTradeConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTO_TRADE_KEY, JSON.stringify(config));
  // Trigger Supabase sync with current state
  syncToSupabase(loadPaperState());
}

function defaultAutoConfig(): AutoTradeConfig {
  return {
    enabled: false,
    maxPositions: 10,
    riskPerTrade: 2,
    slPercent: 3,
    targetPercent: 6,
    onlyAGrade: false,
    autoCloseOnTarget: true,
    autoCloseOnSL: true,
  };
}

export function getAutoTradeLog(): AutoTradeLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(AUTO_TRADE_LOG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveAutoTradeLog(log: AutoTradeLogEntry[]): void {
  if (typeof window === 'undefined') return;
  // Keep last 30 days only
  const trimmed = log.slice(-30);
  localStorage.setItem(AUTO_TRADE_LOG_KEY, JSON.stringify(trimmed));
  // Trigger Supabase sync
  syncToSupabase(loadPaperState());
}

function todayDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function hasAutoTradedToday(): boolean {
  const log = getAutoTradeLog();
  return log.some(e => e.date === todayDate());
}

export function clearTodayAutoTrade(): void {
  const log = getAutoTradeLog();
  const filtered = log.filter(e => e.date !== todayDate());
  if (typeof window !== 'undefined') {
    localStorage.setItem(AUTO_TRADE_LOG_KEY, JSON.stringify(filtered));
  }
}

// ─── Auto-close positions that hit SL or Target ──────────────────────

export async function autoClosePositions(): Promise<{ closed: string[] }> {
  const config = getAutoTradeConfig();
  if (!config.autoCloseOnSL && !config.autoCloseOnTarget) return { closed: [] };

  const state = loadPaperState();
  const positions = getOpenPositions(state);
  const closed: string[] = [];

  for (const pos of positions) {
    // Get live price
    try {
      const res = await fetch(`/api/stock?symbol=${pos.symbol}`);
      const data = await res.json();
      const currentPrice = data?.quote?.price || data?.price;
      if (!currentPrice) continue;

      // Check if any BUY order has SL/target set
      const buyOrder = pos.orders.find(o => o.stopLoss || o.target);
      const sl = buyOrder?.stopLoss || pos.avgPrice * (1 - config.slPercent / 100);
      const tgt = buyOrder?.target || pos.avgPrice * (1 + config.targetPercent / 100);

      let shouldClose = false;
      let reason = '';

      if (config.autoCloseOnSL && currentPrice <= sl) {
        shouldClose = true;
        reason = `SL hit (₹${sl.toFixed(2)})`;
      } else if (config.autoCloseOnTarget && currentPrice >= tgt) {
        shouldClose = true;
        reason = `Target hit (₹${tgt.toFixed(2)})`;
      }

      if (shouldClose) {
        placePaperOrder({
          symbol: pos.symbol,
          side: 'SELL',
          orderType: 'MARKET',
          qty: pos.qty,
          price: currentPrice,
          source: 'strategy',
          strategyName: `Auto-close: ${reason}`,
        });
        closed.push(pos.symbol);
      }
    } catch {}
  }

  return { closed };
}

// ─── Place orders from AI predictions ────────────────────────────────

export interface AutoTradeResult {
  placed: number;
  skipped: number;
  closed: number;
  details: { symbol: string; action: string; price: number; qty: number }[];
  closedDetails: string[];
  alreadyRanToday: boolean;
}

export async function runAutoPaperTrade(predictions: any[]): Promise<AutoTradeResult> {
  const config = getAutoTradeConfig();
  const result: AutoTradeResult = { placed: 0, skipped: 0, closed: 0, details: [], closedDetails: [], alreadyRanToday: false };

  // Check if already ran today
  if (hasAutoTradedToday()) {
    result.alreadyRanToday = true;
    return result;
  }

  // Step 1: Auto-close positions hitting SL/Target
  const { closed } = await autoClosePositions();
  result.closed = closed.length;
  result.closedDetails = closed;

  // Step 2: Filter tradeable predictions
  const getGrade = (p: any) => p.features_json?.tradeGrade || p.featuresJson?.tradeGrade || 'C';
  const getTradeable = (p: any) => p.features_json?.tradeable || p.featuresJson?.tradeable || false;
  const getConfluence = (p: any) => p.features_json?.confluenceScore ?? p.featuresJson?.confluenceScore ?? 0;

  const tradeableSignals = predictions
    .filter(p => getTradeable(p))
    .filter(p => {
      const grade = getGrade(p);
      return config.onlyAGrade ? grade === 'A' : (grade === 'A' || grade === 'B');
    })
    .sort((a, b) => getConfluence(b) - getConfluence(a));

  if (tradeableSignals.length === 0) {
    logAutoTrade(result);
    return result;
  }

  // Step 3: Check current position count
  const state = loadPaperState();
  const currentPositions = getOpenPositions(state);
  const existingSymbols = new Set(currentPositions.map(p => p.symbol));
  const availableSlots = Math.max(0, config.maxPositions - currentPositions.length);

  // Step 4: Place orders
  let slotsUsed = 0;
  for (const pred of tradeableSignals) {
    if (slotsUsed >= availableSlots) break;

    const sym = pred.symbol;
    const direction = pred.predictedDirection || pred.predicted_direction;

    // Skip if already holding this stock
    if (existingSymbols.has(sym)) {
      result.skipped++;
      continue;
    }

    // Only BUY for bullish signals (no short selling in paper trading)
    if (direction !== 'up') {
      result.skipped++;
      continue;
    }

    // Get live price
    try {
      const res = await fetch(`/api/stock?symbol=${sym}`);
      const data = await res.json();
      const price = data?.quote?.price || data?.price;
      if (!price || price <= 0) {
        result.skipped++;
        continue;
      }

      // Position sizing: risk% of portfolio per trade, capped at portfolio/maxPositions
      const latestState = loadPaperState();
      const stats = getPaperStats(latestState);
      const riskAmount = (stats.portfolioValue * config.riskPerTrade) / 100;
      const slPrice = price * (1 - config.slPercent / 100);
      const riskPerShare = price - slPrice;
      const qtyByRisk = Math.max(1, Math.floor(riskAmount / riskPerShare));

      // Cap position size so we can hold maxPositions simultaneously
      const maxPositionValue = stats.portfolioValue / config.maxPositions;
      const qtyByCap = Math.max(1, Math.floor(maxPositionValue / price));
      const qty = Math.min(qtyByRisk, qtyByCap);

      // Check if we can afford it
      const orderValue = price * qty;
      if (orderValue > latestState.currentCash) {
        result.skipped++;
        continue;
      }

      const targetPrice = price * (1 + config.targetPercent / 100);
      const confidence = pred.probability || 50;
      const grade = getGrade(pred);

      const orderResult = placePaperOrder({
        symbol: sym,
        side: 'BUY',
        orderType: 'MARKET',
        qty,
        price,
        stopLoss: Math.round(slPrice * 100) / 100,
        target: Math.round(targetPrice * 100) / 100,
        source: 'strategy',
        strategyName: `AI Prediction (${grade}-grade, ${confidence}% conf)`,
        notes: `Auto-trade: ${grade}-grade, ${confidence}% confidence, ${getConfluence(pred)}/6 confluence`,
      });

      if (orderResult.success) {
        result.placed++;
        result.details.push({ symbol: sym, action: 'BUY', price, qty });
        slotsUsed++;
        existingSymbols.add(sym);
      } else {
        result.skipped++;
      }

      // Small delay to avoid rate limiting on price fetch
      await new Promise(r => setTimeout(r, 200));
    } catch {
      result.skipped++;
    }
  }

  logAutoTrade(result);
  return result;
}

function logAutoTrade(result: AutoTradeResult): void {
  const log = getAutoTradeLog();
  log.push({
    date: todayDate(),
    placed: result.placed,
    skipped: result.skipped,
    closed: result.closed,
    symbols: result.details.map(d => d.symbol),
    closedSymbols: result.closedDetails,
  });
  saveAutoTradeLog(log);
}
