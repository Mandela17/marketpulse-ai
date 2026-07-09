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

function savePaperState(state: PaperTradingState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('[PaperTrading] Failed to save state:', e);
  }
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
