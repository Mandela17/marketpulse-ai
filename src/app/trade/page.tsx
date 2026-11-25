'use client';

import { Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Wallet,
  Briefcase,
  Activity,
  FileCheck2,
  Edit3,
  Trash2,
  ExternalLink,
  Zap,
  Lock,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ChevronDown,
  Clock,
  CircleDot,
  BarChart3,
  DollarSign,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getBrokerConfig } from '@/lib/brokerApi';
import { searchStocks } from '@/lib/sectorData';
import { isMarketOpenNow } from '@/lib/marketHolidays';

/* ───────────────────────────────────────────────────
   TYPE DEFINITIONS
   ─────────────────────────────────────────────────── */

type TradingMode = 'live' | 'sandbox';
type AccountTab = 'holdings' | 'positions' | 'orders' | 'trades' | 'sandboxLog';
type TxSide = 'BUY' | 'SELL';
type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
type ProductType = 'D' | 'I' | 'MTF';
type ValidityType = 'DAY' | 'IOC';

interface HoldingItem {
  symbol: string;
  companyName: string;
  isin: string;
  instrumentToken: string;
  exchange: string;
  product: string;
  quantity: number;
  t1Quantity: number;
  totalQuantity: number;
  averagePrice: number;
  lastPrice: number;
  investedValue: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  dayChange: number;
  dayChangePercent: number;
}

interface PositionItem {
  symbol: string;
  instrumentToken: string;
  exchange: string;
  product: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  averagePrice: number;
  lastPrice: number;
  unrealised: number;
  realised: number;
  pnl: number;
}

interface OrderItem {
  orderId: string;
  symbol: string;
  instrumentToken: string;
  exchange: string;
  transactionType: string;
  orderType: string;
  product: string;
  validity: string;
  quantity: number;
  filledQuantity: number;
  pendingQuantity: number;
  price: number;
  triggerPrice: number;
  averagePrice: number;
  status: string;
  statusMessage: string | null;
  orderTimestamp: string;
  isAmo: boolean;
}

interface TradeItem {
  tradeId: string;
  orderId: string;
  symbol: string;
  transactionType: string;
  product: string;
  quantity: number;
  averagePrice: number;
  exchangeTimestamp: string;
}

interface ChargesBreakdown {
  orderValue: number;
  charges: {
    total: number;
    brokerage: number;
    gst: number;
    stt: number;
    stampDuty: number;
    transactionCharge: number;
    sebiTurnover: number;
  };
}

interface SandboxLogEntry {
  orderId: string;
  symbol: string;
  transactionType: TxSide;
  orderType: OrderType;
  product: ProductType;
  quantity: number;
  price: number;
  status: string;
  timestamp: string;
}

/* ───────────────────────────────────────────────────
   CONSTANTS & HELPERS
   ─────────────────────────────────────────────────── */

const SANDBOX_TOKEN_KEY = 'marketpulse_upstox_sandbox_token';
const SANDBOX_LOG_KEY = 'marketpulse_upstox_sandbox_orders';

function fmtInr(n: number, decimals = 2): string {
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function isOrderEditable(status: string): boolean {
  const s = status.toLowerCase();
  return (
    s.includes('open') ||
    s.includes('pending') ||
    s.includes('after market order')
  );
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === 'complete' || s === 'executed') return 'status-badge-success';
  if (s.includes('reject') || s.includes('cancel')) return 'status-badge-error';
  return 'status-badge-warning';
}

/* ───────────────────────────────────────────────────
   MAIN COMPONENT
   ─────────────────────────────────────────────────── */

function LiveTradeContent() {
  const { session } = useAuth();
  const searchParams = useSearchParams();

  // Mode & Token State
  const [mode, setMode] = useState<TradingMode>('live');
  const [sandboxToken, setSandboxToken] = useState<string>('');
  const [sandboxTokenInput, setSandboxTokenInput] = useState<string>('');
  const [sandboxOrders, setSandboxOrders] = useState<SandboxLogEntry[]>([]);

  // Live Account Portfolio State
  const [connected, setConnected] = useState<boolean>(false);
  const [loadingAccount, setLoadingAccount] = useState<boolean>(true);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [staticIp, setStaticIp] = useState<{ configured: boolean; primaryIp: string | null; secondaryIp: string | null } | null>(null);
  const [funds, setFunds] = useState<any>(null);
  const [holdings, setHoldings] = useState<HoldingItem[]>([]);
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [trades, setTrades] = useState<TradeItem[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<AccountTab>('holdings');
  const [tableSearch, setTableSearch] = useState('');

  // Order Ticket State
  const [symbolInput, setSymbolInput] = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string; sector: string }[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [quote, setQuote] = useState<{
    price: number;
    change: number;
    changePercent: number;
    open: number;
    high: number;
    low: number;
  } | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);

  const [side, setSide] = useState<TxSide>('BUY');
  const [product, setProduct] = useState<ProductType>('D');
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [validity, setValidity] = useState<ValidityType>('DAY');
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [isAmo, setIsAmo] = useState(false);
  const [sliceOrder, setSliceOrder] = useState(true);

  // Pre-trade Brokerage Charges
  const [charges, setCharges] = useState<ChargesBreakdown | null>(null);
  const [loadingCharges, setLoadingCharges] = useState(false);

  // Confirmation & Execution Modals
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    hint?: string;
  } | null>(null);

  // Modify Order Modal State
  const [editingOrder, setEditingOrder] = useState<OrderItem | null>(null);
  const [modQty, setModQty] = useState('');
  const [modPrice, setModPrice] = useState('');
  const [modTrigger, setModTrigger] = useState('');
  const [modType, setModType] = useState<OrderType>('LIMIT');
  const [submittingModify, setSubmittingModify] = useState(false);

  // Exit All Confirm
  const [showExitAllConfirm, setShowExitAllConfirm] = useState(false);
  const [exitingAll, setExitingAll] = useState(false);

  const authHeaders = useCallback((): Record<string, string> => {
    const brokerConfig = getBrokerConfig();
    const h: Record<string, string> = {};
    if (session?.access_token) {
      h['Authorization'] = `Bearer ${session.access_token}`;
    }
    if (brokerConfig.provider === 'upstox' && brokerConfig.accessToken) {
      h['X-Upstox-Token'] = brokerConfig.accessToken;
    }
    if (sandboxToken) {
      h['X-Upstox-Sandbox-Token'] = sandboxToken;
    }
    return h;
  }, [session?.access_token, sandboxToken]);

  // Load Sandbox token & history from localStorage cleanly on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedTok = localStorage.getItem(SANDBOX_TOKEN_KEY) || '';
    if (savedTok) {
      setSandboxToken(savedTok);
      setSandboxTokenInput(savedTok);
    }
    const savedLog = localStorage.getItem(SANDBOX_LOG_KEY);
    if (savedLog) {
      try {
        setSandboxOrders(JSON.parse(savedLog));
      } catch {}
    }
    // Suggest AMO automatically outside market hours
    if (!isMarketOpenNow()) {
      setIsAmo(true);
    }
  }, []);

  // Fetch live quote for selected symbol
  const fetchSymbolQuote = useCallback(async (sym: string) => {
    if (!sym) return;
    setLoadingQuote(true);
    try {
      const brokerConfig = getBrokerConfig();
      const headers: Record<string, string> = {};
      if (brokerConfig.provider === 'upstox' && brokerConfig.accessToken) {
        headers['X-Upstox-Token'] = brokerConfig.accessToken;
      }
      const res = await fetch(`/api/stock?symbol=${encodeURIComponent(sym)}`, { headers });
      const data = await res.json();
      const q = data?.quote;
      if (q && q.price > 0) {
        setQuote({
          price: q.price,
          change: q.change || 0,
          changePercent: q.changePercent || 0,
          open: q.previousClose || q.price,
          high: q.dayHigh || q.price,
          low: q.dayLow || q.price,
        });
        setLimitPrice(String(q.price));
      } else {
        setQuote(null);
      }
    } catch {
      setQuote(null);
    } finally {
      setLoadingQuote(false);
    }
  }, []);

  // Fetch Upstox Account Portfolio
  const fetchAccount = useCallback(async () => {
    if (!session?.access_token) return;
    setLoadingAccount(true);
    setAccountError(null);
    try {
      const res = await fetch('/api/upstox/portfolio', { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.connected) {
        setConnected(false);
        setAccountError(data.error || 'Upstox not connected');
      } else {
        setConnected(true);
        setProfile(data.profile);
        setStaticIp(data.staticIp);
        setFunds(data.funds);
        setHoldings(data.holdings || []);
        setPositions(data.positions || []);
        setOrders(data.orders || []);
        setTrades(data.trades || []);
        setSummary(data.summary);
      }
    } catch (err: any) {
      setAccountError(err?.message || 'Failed to sync Upstox portfolio');
    } finally {
      setLoadingAccount(false);
    }
  }, [session?.access_token, authHeaders]);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  // Handle URL prefill (?symbol=RELIANCE&side=BUY)
  useEffect(() => {
    const urlSym = searchParams.get('symbol')?.toUpperCase().trim();
    const urlSide = searchParams.get('side')?.toUpperCase();
    if (urlSym) {
      setSelectedSymbol(urlSym);
      setSymbolInput(urlSym);
      fetchSymbolQuote(urlSym);
    }
    if (urlSide === 'BUY' || urlSide === 'SELL') {
      setSide(urlSide);
    }
  }, [searchParams, fetchSymbolQuote]);

  // Autocomplete dropdown filtering
  useEffect(() => {
    const q = symbolInput.trim();
    if (!q || (selectedSymbol && q.toUpperCase() === selectedSymbol)) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    const res = searchStocks(q);
    setSearchResults(res);
    setShowDropdown(res.length > 0);
  }, [symbolInput, selectedSymbol]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Debounced pre-trade Upstox brokerage & taxes estimate
  const effectivePrice = useMemo(() => {
    if (orderType === 'LIMIT' || orderType === 'SL') {
      const lp = parseFloat(limitPrice);
      if (lp > 0) return lp;
    }
    return quote?.price || 0;
  }, [orderType, limitPrice, quote?.price]);

  useEffect(() => {
    const qtyNum = Math.floor(Number(quantity));
    if (!selectedSymbol || qtyNum <= 0 || effectivePrice <= 0 || !session?.access_token || !connected) {
      setCharges(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingCharges(true);
      try {
        const params = new URLSearchParams({
          symbol: selectedSymbol,
          quantity: String(qtyNum),
          price: String(effectivePrice),
          product,
          transactionType: side,
        });
        const res = await fetch(`/api/upstox/charges?${params.toString()}`, {
          headers: authHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setCharges(data);
        } else {
          setCharges(null);
        }
      } catch {
        setCharges(null);
      } finally {
        setLoadingCharges(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [selectedSymbol, quantity, effectivePrice, product, side, session?.access_token, connected, authHeaders]);

  const selectStockForOrder = (sym: string, name?: string, defaultSide?: TxSide, defaultQty?: number) => {
    const upper = sym.toUpperCase();
    setSelectedSymbol(upper);
    setSelectedName(name || upper);
    setSymbolInput(upper);
    setShowDropdown(false);
    if (defaultSide) setSide(defaultSide);
    if (defaultQty && defaultQty > 0) setQuantity(String(defaultQty));
    fetchSymbolQuote(upper);
  };

  const handlePlaceOrder = async () => {
    if (!selectedSymbol) return;
    setPlacingOrder(true);
    setOrderFeedback(null);

    try {
      const res = await fetch('/api/upstox/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          mode,
          symbol: selectedSymbol,
          quantity: Math.floor(Number(quantity)),
          product,
          validity,
          orderType,
          transactionType: side,
          price: orderType === 'LIMIT' || orderType === 'SL' ? parseFloat(limitPrice) || 0 : 0,
          triggerPrice: orderType === 'SL' || orderType === 'SL-M' ? parseFloat(triggerPrice) || 0 : 0,
          isAmo,
          slice: sliceOrder,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setOrderFeedback({
          type: 'error',
          message: data.error || 'Order submission failed',
          hint: data.hint,
        });
      } else {
        setOrderFeedback({
          type: 'success',
          message: `${data.message}${data.orderId ? ` (Order ID: ${data.orderId})` : ''}`,
        });

        if (mode === 'sandbox') {
          const entry: SandboxLogEntry = {
            orderId: data.orderId || `SB-${Date.now()}`,
            symbol: selectedSymbol,
            transactionType: side,
            orderType,
            product,
            quantity: Math.floor(Number(quantity)),
            price: effectivePrice,
            status: 'sandbox simulated',
            timestamp: new Date().toLocaleTimeString('en-IN'),
          };
          setSandboxOrders((prev) => {
            const next = [entry, ...prev].slice(0, 50);
            try {
              localStorage.setItem(SANDBOX_LOG_KEY, JSON.stringify(next));
            } catch {}
            return next;
          });
          setActiveTab('sandboxLog');
        } else {
          fetchAccount();
          setActiveTab('orders');
        }
      }
    } catch (err: any) {
      setOrderFeedback({
        type: 'error',
        message: err?.message || 'Network error placing order',
      });
    } finally {
      setPlacingOrder(false);
      setShowConfirmModal(false);
    }
  };

  const handleModifyOrder = async () => {
    if (!editingOrder) return;
    setSubmittingModify(true);
    try {
      const res = await fetch('/api/upstox/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          mode,
          orderId: editingOrder.orderId,
          quantity: Math.floor(Number(modQty)),
          orderType: modType,
          validity: editingOrder.validity || 'DAY',
          price: parseFloat(modPrice) || 0,
          triggerPrice: parseFloat(modTrigger) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setOrderFeedback({ type: 'error', message: data.error || 'Modify failed', hint: data.hint });
      } else {
        setOrderFeedback({ type: 'success', message: data.message });
        setEditingOrder(null);
        fetchAccount();
      }
    } catch (err: any) {
      setOrderFeedback({ type: 'error', message: err?.message || 'Failed to modify order' });
    } finally {
      setSubmittingModify(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!confirm(`Cancel open order ${orderId}?`)) return;
    try {
      const res = await fetch(`/api/upstox/order?mode=${mode}&orderId=${encodeURIComponent(orderId)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setOrderFeedback({ type: 'error', message: data.error || 'Cancel failed', hint: data.hint });
      } else {
        setOrderFeedback({ type: 'success', message: data.message });
        fetchAccount();
      }
    } catch (err: any) {
      setOrderFeedback({ type: 'error', message: err?.message || 'Cancel request failed' });
    }
  };

  const handleExitAllPositions = async () => {
    setExitingAll(true);
    try {
      const res = await fetch('/api/upstox/order?mode=live&action=exit_all', {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setOrderFeedback({ type: 'error', message: data.error || 'Square-off failed', hint: data.hint });
      } else {
        setOrderFeedback({ type: 'success', message: data.message });
        fetchAccount();
      }
    } catch (err: any) {
      setOrderFeedback({ type: 'error', message: err?.message || 'Square-off failed' });
    } finally {
      setExitingAll(false);
      setShowExitAllConfirm(false);
    }
  };

  const saveSandboxTok = () => {
    const clean = sandboxTokenInput.trim();
    setSandboxToken(clean);
    if (typeof window !== 'undefined') {
      localStorage.setItem(SANDBOX_TOKEN_KEY, clean);
    }
  };

  const qtyNum = Math.max(0, Math.floor(Number(quantity) || 0));
  const estOrderValue = effectivePrice * qtyNum;
  const maxAffordableQty =
    funds?.available && funds.availableMargin > 0 && effectivePrice > 0
      ? Math.floor(funds.availableMargin / effectivePrice)
      : 0;

  const filteredHoldings = holdings.filter(
    (h) => !tableSearch || h.symbol.toLowerCase().includes(tableSearch.toLowerCase()) || h.companyName.toLowerCase().includes(tableSearch.toLowerCase())
  );
  const filteredPositions = positions.filter(
    (p) => !tableSearch || p.symbol.toLowerCase().includes(tableSearch.toLowerCase())
  );
  const filteredOrders = orders.filter(
    (o) => !tableSearch || o.symbol.toLowerCase().includes(tableSearch.toLowerCase()) || o.status.toLowerCase().includes(tableSearch.toLowerCase())
  );
  const filteredTrades = trades.filter(
    (t) => !tableSearch || t.symbol.toLowerCase().includes(tableSearch.toLowerCase())
  );

  const marketOpen = isMarketOpenNow();

  /* ═══════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════ */

  return (
    <>
      {/* Inline styles for trade-page-specific effects */}
      <style>{`
        .trade-kpi-card {
          position: relative;
          overflow: hidden;
          border-radius: 16px;
          padding: 20px;
          background: linear-gradient(145deg, rgba(15,23,42,0.9), rgba(15,23,42,0.6));
          border: 1px solid rgba(255,255,255,0.06);
          backdrop-filter: blur(12px);
          transition: all 0.2s ease;
        }
        .trade-kpi-card:hover {
          border-color: rgba(255,255,255,0.12);
          transform: translateY(-1px);
        }
        .trade-kpi-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          border-radius: 16px 16px 0 0;
        }
        .kpi-accent-blue::before { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
        .kpi-accent-purple::before { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }
        .kpi-accent-green::before { background: linear-gradient(90deg, #00d68f, #34d399); }
        .kpi-accent-amber::before { background: linear-gradient(90deg, #f59e0b, #fbbf24); }

        .trade-tab-btn {
          padding: 10px 18px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
          border: 1px solid transparent;
          position: relative;
        }
        .trade-tab-btn.active {
          background: rgba(59,130,246,0.15);
          color: #60a5fa;
          border-color: rgba(59,130,246,0.3);
        }
        .trade-tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 20%;
          right: 20%;
          height: 2px;
          background: #60a5fa;
          border-radius: 2px;
        }
        .trade-tab-btn:not(.active) {
          background: rgba(255,255,255,0.02);
          color: var(--text-muted);
        }
        .trade-tab-btn:not(.active):hover {
          background: rgba(255,255,255,0.05);
          color: var(--text-secondary);
        }

        .trade-table th {
          padding: 14px 16px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          border-bottom: 1px solid var(--border-color);
        }
        .trade-table td {
          padding: 14px 16px;
          font-size: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.03);
        }
        .trade-table tbody tr {
          transition: background 0.15s ease;
        }
        .trade-table tbody tr:hover {
          background: rgba(59,130,246,0.04);
        }
        .trade-table tbody tr:nth-child(even) {
          background: rgba(255,255,255,0.01);
        }
        .trade-table tbody tr:nth-child(even):hover {
          background: rgba(59,130,246,0.04);
        }

        .order-ticket {
          border-radius: 20px;
          padding: 24px;
          background: linear-gradient(165deg, rgba(15,23,42,0.95), rgba(15,23,42,0.8));
          backdrop-filter: blur(16px);
          box-shadow: 0 20px 60px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.1) inset;
        }

        .buy-sell-toggle {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
          padding: 4px;
          border-radius: 14px;
          background: rgba(0,0,0,0.3);
        }
        .buy-sell-toggle button {
          padding: 12px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.1em;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .trade-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 13px;
          font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
          font-weight: 700;
          color: white;
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.08);
          outline: none;
          transition: border-color 0.2s;
        }
        .trade-input:focus {
          border-color: rgba(59,130,246,0.5);
        }
        .trade-input:disabled {
          opacity: 0.4;
        }
        .trade-input::placeholder {
          color: rgba(148,163,184,0.5);
        }

        .option-chip {
          padding: 8px 12px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
          border: 1px solid transparent;
        }

        .status-badge-success {
          background: rgba(0,214,143,0.12);
          color: #00d68f;
          border: 1px solid rgba(0,214,143,0.25);
        }
        .status-badge-error {
          background: rgba(255,77,106,0.12);
          color: #ff4d6a;
          border: 1px solid rgba(255,77,106,0.25);
        }
        .status-badge-warning {
          background: rgba(251,191,36,0.12);
          color: #fbbf24;
          border: 1px solid rgba(251,191,36,0.25);
        }

        .pnl-positive { color: #00d68f; }
        .pnl-negative { color: #ff4d6a; }

        .trade-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 50;
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .trade-modal {
          width: 100%;
          max-width: 440px;
          border-radius: 20px;
          padding: 28px;
          background: linear-gradient(165deg, #0f172a, #1e293b);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 25px 80px rgba(0,0,0,0.6);
          animation: modalIn 0.2s ease-out;
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .empty-state-icon {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
          background: rgba(59,130,246,0.08);
          border: 1px solid rgba(59,130,246,0.15);
        }

        .qty-chip {
          flex: 1;
          padding: 5px;
          border-radius: 8px;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
          background: rgba(255,255,255,0.04);
          color: var(--text-muted);
          transition: all 0.15s;
          border: 1px solid rgba(255,255,255,0.04);
        }
        .qty-chip:hover {
          background: rgba(59,130,246,0.1);
          color: #60a5fa;
          border-color: rgba(59,130,246,0.2);
        }
      `}</style>

      <div className="w-full max-w-7xl mx-auto pb-12 animate-fade-in">

        {/* ═══════════════════════════════════════════
            HEADER
           ═══════════════════════════════════════════ */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Trading Terminal
              </h1>
              <div
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                style={{
                  background: mode === 'live'
                    ? 'linear-gradient(135deg, rgba(255,77,106,0.15), rgba(255,77,106,0.08))'
                    : 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.08))',
                  color: mode === 'live' ? '#ff4d6a' : '#fbbf24',
                  border: `1px solid ${mode === 'live' ? 'rgba(255,77,106,0.3)' : 'rgba(245,158,11,0.3)'}`,
                }}
              >
                <CircleDot size={8} className={mode === 'live' ? 'animate-pulse' : ''} />
                {mode === 'live' ? 'Live Exchange' : 'Sandbox Mode'}
              </div>
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold"
                style={{
                  background: marketOpen ? 'rgba(0,214,143,0.08)' : 'rgba(148,163,184,0.08)',
                  color: marketOpen ? '#00d68f' : '#94a3b8',
                  border: `1px solid ${marketOpen ? 'rgba(0,214,143,0.2)' : 'rgba(148,163,184,0.15)'}`,
                }}
              >
                <Clock size={9} />
                {marketOpen ? 'Market Open' : 'Market Closed'}
              </div>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Execute orders via Upstox V3 HFT API · Holdings, Positions & Order Book
            </p>
          </div>

          {/* Mode Switcher + Sync */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div
              className="flex items-center rounded-xl p-1"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <button
                type="button"
                onClick={() => setMode('live')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all"
                style={{
                  background: mode === 'live' ? 'rgba(255,77,106,0.18)' : 'transparent',
                  color: mode === 'live' ? '#ff4d6a' : 'var(--text-muted)',
                }}
              >
                <Zap size={12} />
                Live
              </button>
              <button
                type="button"
                onClick={() => setMode('sandbox')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all"
                style={{
                  background: mode === 'sandbox' ? 'rgba(245,158,11,0.18)' : 'transparent',
                  color: mode === 'sandbox' ? '#fbbf24' : 'var(--text-muted)',
                }}
              >
                <ShieldCheck size={12} />
                Sandbox
              </button>
            </div>

            <button
              type="button"
              onClick={fetchAccount}
              disabled={loadingAccount}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all hover:brightness-125 disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(59,130,246,0.1))',
                color: '#60a5fa',
                border: '1px solid rgba(59,130,246,0.3)',
              }}
            >
              <RefreshCw size={13} className={loadingAccount ? 'animate-spin' : ''} />
              Sync
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            CONNECTION / COMPLIANCE BANNERS
           ═══════════════════════════════════════════ */}
        {!connected && !loadingAccount && (
          <div
            className="mb-5 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            style={{
              background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.03))',
              border: '1px solid rgba(245,158,11,0.25)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl" style={{ background: 'rgba(245,158,11,0.12)' }}>
                <AlertTriangle size={18} style={{ color: '#fbbf24' }} />
              </div>
              <div>
                <p className="font-bold text-white text-sm">Upstox Not Connected</p>
                <p style={{ color: 'var(--text-secondary)' }}>{accountError || 'Connect your Upstox account to start trading'}</p>
              </div>
            </div>
            <Link
              href="/broker"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white shrink-0 text-center text-sm transition-all hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
            >
              Connect Upstox
              <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {mode === 'live' && connected && staticIp && !staticIp.configured && (
          <div
            className="mb-5 px-5 py-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            style={{
              background: 'linear-gradient(135deg, rgba(245,158,11,0.06), rgba(245,158,11,0.02))',
              border: '1px solid rgba(245,158,11,0.2)',
            }}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl shrink-0 mt-0.5" style={{ background: 'rgba(245,158,11,0.1)' }}>
                <ShieldAlert size={16} style={{ color: '#fbbf24' }} />
              </div>
              <div>
                <p className="font-bold text-amber-300 text-sm">Static IP Not Configured</p>
                <p className="mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Portfolio & order book work normally, but SEBI rules require a registered server IP for live orders.
                  Register your IP at{' '}
                  <a href="https://account.upstox.com/developer/apps" target="_blank" rel="noopener noreferrer" className="underline text-blue-400">
                    Upstox Developer Apps
                  </a>{' '}
                  or switch to Sandbox for risk-free testing.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMode('sandbox')}
              className="px-4 py-2 rounded-xl font-bold shrink-0 cursor-pointer transition-all hover:brightness-110"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}
            >
              Switch to Sandbox
            </button>
          </div>
        )}

        {mode === 'live' && connected && staticIp?.configured && (
          <div
            className="mb-5 px-5 py-3 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
            style={{
              background: 'linear-gradient(135deg, rgba(0,214,143,0.06), rgba(0,214,143,0.02))',
              border: '1px solid rgba(0,214,143,0.2)',
            }}
          >
            <div className="flex items-center gap-2.5 text-emerald-300">
              <ShieldCheck size={16} />
              <span className="font-semibold">
                <strong>{profile?.userName || profile?.userId || 'Upstox Live'}</strong>
                {' '}connected · Static IP Active ({staticIp.primaryIp || staticIp.secondaryIp})
              </span>
            </div>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              POA/DDPI: {profile?.poa ? 'Enabled' : 'Standard (TPIN/EDIS for CNC Sell)'}
            </span>
          </div>
        )}

        {/* Sandbox Token Config */}
        {mode === 'sandbox' && (
          <div
            className="mb-5 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
            style={{
              background: 'linear-gradient(135deg, rgba(245,158,11,0.06), rgba(245,158,11,0.02))',
              border: '1px solid rgba(245,158,11,0.2)',
            }}
          >
            <div className="flex-1">
              <p className="font-bold text-amber-300 text-sm">Sandbox Access Token</p>
              <p className="mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Orders route to <code className="text-amber-200/80 bg-amber-500/10 px-1.5 py-0.5 rounded">sandbox.upstox.com</code> — no real money or Static IP needed.
              </p>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <input
                type="password"
                value={sandboxTokenInput}
                onChange={(e) => setSandboxTokenInput(e.target.value)}
                placeholder="Paste sandbox token..."
                className="trade-input md:w-64"
              />
              <button
                type="button"
                onClick={saveSandboxTok}
                className="px-4 py-2.5 rounded-xl font-bold cursor-pointer shrink-0 transition-all hover:brightness-110"
                style={{ background: '#fbbf24', color: '#000' }}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Order Feedback Toast */}
        {orderFeedback && (
          <div
            className="mb-5 p-4 rounded-2xl flex items-start justify-between gap-3 text-xs animate-fade-in-up"
            style={{
              background: orderFeedback.type === 'success'
                ? 'linear-gradient(135deg, rgba(0,214,143,0.1), rgba(0,214,143,0.04))'
                : 'linear-gradient(135deg, rgba(255,77,106,0.1), rgba(255,77,106,0.04))',
              border: `1px solid ${orderFeedback.type === 'success' ? 'rgba(0,214,143,0.3)' : 'rgba(255,77,106,0.3)'}`,
            }}
          >
            <div className="flex items-start gap-3">
              {orderFeedback.type === 'success' ? (
                <CheckCircle2 size={18} style={{ color: '#00d68f', flexShrink: 0, marginTop: 1 }} />
              ) : (
                <XCircle size={18} style={{ color: '#ff4d6a', flexShrink: 0, marginTop: 1 }} />
              )}
              <div>
                <p className="font-bold text-white text-sm">{orderFeedback.message}</p>
                {orderFeedback.hint && <p className="mt-1 text-slate-300">{orderFeedback.hint}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOrderFeedback(null)}
              className="text-slate-400 hover:text-white cursor-pointer p-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            ACCOUNT SUMMARY KPIs
           ═══════════════════════════════════════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Available Cash */}
          <div className="trade-kpi-card kpi-accent-blue">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Available Margin
              </span>
              <div className="p-1.5 rounded-lg" style={{ background: 'rgba(59,130,246,0.12)' }}>
                <Wallet size={14} style={{ color: '#60a5fa' }} />
              </div>
            </div>
            {funds?.available ? (
              <>
                <p className="text-xl font-black text-white tabular-nums">₹{fmtInr(funds.availableMargin)}</p>
                <p className="text-[10px] mt-1 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  Used: ₹{fmtInr(funds.usedMargin)}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-amber-400 mt-1">Settlement Window</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {funds?.notice || '5:30 AM – 12:00 AM IST'}
                </p>
              </>
            )}
          </div>

          {/* Demat Holdings */}
          <div className="trade-kpi-card kpi-accent-purple">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Holdings Value
              </span>
              <div className="p-1.5 rounded-lg" style={{ background: 'rgba(139,92,246,0.12)' }}>
                <Briefcase size={14} style={{ color: '#a78bfa' }} />
              </div>
            </div>
            <p className="text-xl font-black text-white tabular-nums">
              ₹{fmtInr(summary?.totalCurrentValue || 0)}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              {(summary?.totalHoldingsPnl || 0) >= 0 ? (
                <TrendingUp size={11} className="pnl-positive" />
              ) : (
                <TrendingDown size={11} className="pnl-negative" />
              )}
              <span
                className="text-[11px] font-bold tabular-nums"
                style={{ color: (summary?.totalHoldingsPnl || 0) >= 0 ? '#00d68f' : '#ff4d6a' }}
              >
                {(summary?.totalHoldingsPnl || 0) >= 0 ? '+' : ''}₹{fmtInr(summary?.totalHoldingsPnl || 0)} ({summary?.totalHoldingsPnlPercent || 0}%)
              </span>
            </div>
          </div>

          {/* Day Positions P&L */}
          <div className="trade-kpi-card kpi-accent-green">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Day P&L
              </span>
              <div className="p-1.5 rounded-lg" style={{ background: 'rgba(0,214,143,0.12)' }}>
                <Activity size={14} style={{ color: '#00d68f' }} />
              </div>
            </div>
            {(() => {
              const totalPosPnl = (summary?.positionsUnrealised || 0) + (summary?.positionsRealised || 0);
              return (
                <>
                  <p
                    className="text-xl font-black tabular-nums"
                    style={{ color: totalPosPnl >= 0 ? '#00d68f' : '#ff4d6a' }}
                  >
                    {totalPosPnl >= 0 ? '+' : ''}₹{fmtInr(totalPosPnl)}
                  </p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    {summary?.openPositionsCount || 0} open position{(summary?.openPositionsCount || 0) !== 1 ? 's' : ''}
                  </p>
                </>
              );
            })()}
          </div>

          {/* Today's Orders */}
          <div className="trade-kpi-card kpi-accent-amber">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Orders & Trades
              </span>
              <div className="p-1.5 rounded-lg" style={{ background: 'rgba(245,158,11,0.12)' }}>
                <FileCheck2 size={14} style={{ color: '#fbbf24' }} />
              </div>
            </div>
            <p className="text-xl font-black text-white tabular-nums">{orders.length}</p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {summary?.openOrdersCount || 0} pending · {trades.length} executed
            </p>
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            MAIN 2-COL WORKSPACE
           ═══════════════════════════════════════════ */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">

          {/* ─── LEFT: Portfolio Tables ─── */}
          <div className="xl:col-span-8 space-y-4">
            {/* Tabs + Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {(
                  [
                    { id: 'holdings', label: 'Holdings', count: holdings.length, icon: Briefcase },
                    { id: 'positions', label: 'Positions', count: positions.length, icon: Activity },
                    { id: 'orders', label: 'Orders', count: orders.length, icon: FileCheck2 },
                    { id: 'trades', label: 'Trades', count: trades.length, icon: BarChart3 },
                    ...(mode === 'sandbox' ? [{ id: 'sandboxLog' as const, label: 'Sandbox', count: sandboxOrders.length, icon: ShieldCheck }] : []),
                  ] as { id: AccountTab; label: string; count: number; icon: typeof Briefcase }[]
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`trade-tab-btn ${activeTab === t.id ? 'active' : ''}`}
                  >
                    {t.label}
                    <span
                      className="ml-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                      style={{
                        background: activeTab === t.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)',
                        color: activeTab === t.id ? '#93c5fd' : 'var(--text-muted)',
                      }}
                    >
                      {t.count}
                    </span>
                  </button>
                ))}
              </div>

              <div
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:w-56"
                style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <Search size={14} style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Filter symbol..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="bg-transparent outline-none w-full text-white text-xs"
                />
              </div>
            </div>

            {/* Table Container */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(165deg, rgba(15,23,42,0.9), rgba(15,23,42,0.6))',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              }}
            >
              {/* TAB: HOLDINGS */}
              {activeTab === 'holdings' && (
                filteredHoldings.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left trade-table">
                      <thead>
                        <tr>
                          <th className="pl-5">Stock</th>
                          <th className="text-right">Qty</th>
                          <th className="text-right">Avg Buy</th>
                          <th className="text-right">LTP</th>
                          <th className="text-right">P&L</th>
                          <th className="text-right pr-5">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHoldings.map((h) => (
                          <tr key={h.isin + h.symbol}>
                            <td className="pl-5">
                              <Link href={`/stock/${h.symbol}`} className="font-bold text-blue-400 hover:text-blue-300 transition-colors">
                                {h.symbol}
                              </Link>
                              <p className="text-[10px] truncate max-w-[180px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                {h.companyName}
                              </p>
                            </td>
                            <td className="text-right font-mono font-bold text-white">
                              {h.totalQuantity}
                              {h.t1Quantity > 0 && (
                                <span className="text-[9px] text-amber-400 block mt-0.5">{h.t1Quantity} T1</span>
                              )}
                            </td>
                            <td className="text-right font-mono text-slate-300">₹{fmtInr(h.averagePrice)}</td>
                            <td className="text-right">
                              <span className="font-mono font-bold text-white">₹{fmtInr(h.lastPrice)}</span>
                              <span
                                className="block text-[10px] font-semibold mt-0.5"
                                style={{ color: h.dayChangePercent >= 0 ? '#00d68f' : '#ff4d6a' }}
                              >
                                {h.dayChangePercent >= 0 ? '↑' : '↓'} {Math.abs(h.dayChangePercent).toFixed(2)}%
                              </span>
                            </td>
                            <td className="text-right">
                              <span className="font-mono font-bold" style={{ color: h.pnl >= 0 ? '#00d68f' : '#ff4d6a' }}>
                                {h.pnl >= 0 ? '+' : ''}₹{fmtInr(h.pnl)}
                              </span>
                              <span className="block text-[10px] font-semibold mt-0.5" style={{ color: h.pnl >= 0 ? '#00d68f' : '#ff4d6a' }}>
                                {h.pnlPercent >= 0 ? '+' : ''}{h.pnlPercent.toFixed(2)}%
                              </span>
                            </td>
                            <td className="text-right pr-5">
                              <div className="inline-flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => selectStockForOrder(h.symbol, h.companyName, 'BUY', 1)}
                                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition-all hover:brightness-125"
                                  style={{ background: 'rgba(0,214,143,0.12)', color: '#00d68f', border: '1px solid rgba(0,214,143,0.2)' }}
                                >
                                  Buy
                                </button>
                                <button
                                  type="button"
                                  onClick={() => selectStockForOrder(h.symbol, h.companyName, 'SELL', h.quantity || h.totalQuantity)}
                                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition-all hover:brightness-125"
                                  style={{ background: 'rgba(255,77,106,0.12)', color: '#ff4d6a', border: '1px solid rgba(255,77,106,0.2)' }}
                                >
                                  Sell
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-14 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    <div className="empty-state-icon">
                      <Briefcase size={22} style={{ color: '#60a5fa' }} />
                    </div>
                    <p className="font-bold text-white text-sm">No Holdings Found</p>
                    <p className="mt-2 max-w-xs mx-auto leading-relaxed">Your Demat holdings will appear here once settled in your account.</p>
                  </div>
                )
              )}

              {/* TAB: POSITIONS */}
              {activeTab === 'positions' && (
                <div>
                  {positions.some((p) => p.quantity !== 0) && mode === 'live' && (
                    <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {positions.filter((p) => p.quantity !== 0).length} open position(s)
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowExitAllConfirm(true)}
                        className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all hover:brightness-110"
                        style={{ background: 'rgba(255,77,106,0.12)', color: '#ff4d6a', border: '1px solid rgba(255,77,106,0.25)' }}
                      >
                        Square Off All
                      </button>
                    </div>
                  )}
                  {filteredPositions.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left trade-table">
                        <thead>
                          <tr>
                            <th className="pl-5">Instrument</th>
                            <th className="text-center">Product</th>
                            <th className="text-right">Net Qty</th>
                            <th className="text-right">Avg Price</th>
                            <th className="text-right">LTP</th>
                            <th className="text-right">P&L</th>
                            <th className="text-right pr-5">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPositions.map((p, idx) => (
                            <tr key={`${p.instrumentToken}-${p.product}-${idx}`}>
                              <td className="pl-5 font-bold text-white">{p.symbol}</td>
                              <td className="text-center">
                                <span
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold"
                                  style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}
                                >
                                  {p.product === 'I' ? 'MIS' : p.product === 'D' ? 'CNC' : p.product}
                                </span>
                              </td>
                              <td className="text-right font-mono font-bold text-white">{p.quantity}</td>
                              <td className="text-right font-mono text-slate-300">₹{fmtInr(p.averagePrice || p.buyPrice)}</td>
                              <td className="text-right font-mono text-white">₹{fmtInr(p.lastPrice)}</td>
                              <td className="text-right font-mono font-bold" style={{ color: p.pnl >= 0 ? '#00d68f' : '#ff4d6a' }}>
                                {p.pnl >= 0 ? '+' : ''}₹{fmtInr(p.pnl)}
                              </td>
                              <td className="text-right pr-5">
                                {p.quantity !== 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      selectStockForOrder(p.symbol, p.symbol, p.quantity > 0 ? 'SELL' : 'BUY', Math.abs(p.quantity))
                                    }
                                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition-all hover:brightness-125"
                                    style={{ background: 'rgba(255,77,106,0.12)', color: '#ff4d6a', border: '1px solid rgba(255,77,106,0.2)' }}
                                  >
                                    Exit
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-14 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                      <div className="empty-state-icon">
                        <Activity size={22} style={{ color: '#60a5fa' }} />
                      </div>
                      <p className="font-bold text-white text-sm">No Open Positions</p>
                      <p className="mt-2 max-w-xs mx-auto leading-relaxed">Intraday and F&O positions appear here automatically.</p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: ORDERS */}
              {activeTab === 'orders' && (
                filteredOrders.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left trade-table">
                      <thead>
                        <tr>
                          <th className="pl-5">Symbol / Side</th>
                          <th className="text-right">Qty</th>
                          <th className="text-right">Price</th>
                          <th className="text-center">Status</th>
                          <th className="text-right pr-5">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.map((o) => {
                          const badgeCls = statusBadgeClass(o.status);
                          const canEdit = isOrderEditable(o.status);
                          return (
                            <tr key={o.orderId}>
                              <td className="pl-5">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="text-[9px] font-black px-2 py-0.5 rounded-md"
                                    style={{
                                      background: o.transactionType === 'BUY' ? 'rgba(0,214,143,0.12)' : 'rgba(255,77,106,0.12)',
                                      color: o.transactionType === 'BUY' ? '#00d68f' : '#ff4d6a',
                                      border: `1px solid ${o.transactionType === 'BUY' ? 'rgba(0,214,143,0.2)' : 'rgba(255,77,106,0.2)'}`,
                                    }}
                                  >
                                    {o.transactionType}
                                  </span>
                                  <span className="font-bold text-white">{o.symbol}</span>
                                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                    {o.orderType} · {o.product} {o.isAmo ? '· AMO' : ''}
                                  </span>
                                </div>
                                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                  {o.orderTimestamp} · <span className="font-mono">#{o.orderId}</span>
                                </p>
                                {o.statusMessage && (
                                  <p className="text-[10px] mt-0.5 text-amber-300">{o.statusMessage}</p>
                                )}
                              </td>
                              <td className="text-right font-mono text-white">
                                {o.filledQuantity}/{o.quantity}
                              </td>
                              <td className="text-right font-mono text-slate-200">
                                ₹{fmtInr(o.averagePrice > 0 ? o.averagePrice : o.price)}
                              </td>
                              <td className="text-center">
                                <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase inline-block ${badgeCls}`}>
                                  {o.status}
                                </span>
                              </td>
                              <td className="text-right pr-5 whitespace-nowrap">
                                {canEdit ? (
                                  <div className="inline-flex gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingOrder(o);
                                        setModQty(String(o.quantity));
                                        setModPrice(String(o.price || ''));
                                        setModTrigger(String(o.triggerPrice || ''));
                                        setModType((o.orderType as OrderType) || 'LIMIT');
                                      }}
                                      className="p-2 rounded-lg cursor-pointer transition-all hover:brightness-125"
                                      style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}
                                      title="Modify"
                                    >
                                      <Edit3 size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleCancelOrder(o.orderId)}
                                      className="p-2 rounded-lg cursor-pointer transition-all hover:brightness-125"
                                      style={{ background: 'rgba(255,77,106,0.1)', color: '#ff4d6a', border: '1px solid rgba(255,77,106,0.2)' }}
                                      title="Cancel"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-14 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    <div className="empty-state-icon">
                      <FileCheck2 size={22} style={{ color: '#60a5fa' }} />
                    </div>
                    <p className="font-bold text-white text-sm">No Orders Today</p>
                    <p className="mt-2 max-w-xs mx-auto leading-relaxed">Use the order ticket to place your first trade.</p>
                  </div>
                )
              )}

              {/* TAB: TRADES */}
              {activeTab === 'trades' && (
                filteredTrades.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left trade-table">
                      <thead>
                        <tr>
                          <th className="pl-5">Symbol</th>
                          <th className="text-center">Side</th>
                          <th className="text-right">Qty</th>
                          <th className="text-right">Fill Price</th>
                          <th className="text-right pr-5">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTrades.map((t) => (
                          <tr key={t.tradeId}>
                            <td className="pl-5 font-bold text-white">{t.symbol}</td>
                            <td className="text-center">
                              <span
                                className="text-[10px] font-black px-2 py-0.5 rounded-md"
                                style={{
                                  background: t.transactionType === 'BUY' ? 'rgba(0,214,143,0.12)' : 'rgba(255,77,106,0.12)',
                                  color: t.transactionType === 'BUY' ? '#00d68f' : '#ff4d6a',
                                }}
                              >
                                {t.transactionType}
                              </span>
                            </td>
                            <td className="text-right font-mono text-white">{t.quantity}</td>
                            <td className="text-right font-mono text-white">₹{fmtInr(t.averagePrice)}</td>
                            <td className="text-right pr-5 text-[10px]" style={{ color: 'var(--text-muted)' }}>{t.exchangeTimestamp}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-14 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    <div className="empty-state-icon">
                      <BarChart3 size={22} style={{ color: '#60a5fa' }} />
                    </div>
                    <p className="font-bold text-white text-sm">No Executed Trades</p>
                    <p className="mt-2">Executed fills appear here automatically.</p>
                  </div>
                )
              )}

              {/* TAB: SANDBOX LOG */}
              {activeTab === 'sandboxLog' && (
                sandboxOrders.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left trade-table">
                      <thead>
                        <tr>
                          <th className="pl-5">Order ID</th>
                          <th>Stock / Side</th>
                          <th className="text-right">Qty</th>
                          <th className="text-right">Ref Price</th>
                          <th className="text-right pr-5">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sandboxOrders.map((o) => (
                          <tr key={o.orderId}>
                            <td className="pl-5 font-mono text-[11px] text-amber-300">{o.orderId}</td>
                            <td>
                              <span className="font-bold text-white">{o.symbol}</span>{' '}
                              <span className="font-bold" style={{ color: o.transactionType === 'BUY' ? '#00d68f' : '#ff4d6a' }}>
                                {o.transactionType}
                              </span>{' '}
                              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>({o.orderType} · {o.timestamp})</span>
                            </td>
                            <td className="text-right font-mono text-white">{o.quantity}</td>
                            <td className="text-right font-mono text-slate-300">₹{fmtInr(o.price)}</td>
                            <td className="text-right pr-5">
                              <button
                                type="button"
                                onClick={() => handleCancelOrder(o.orderId)}
                                className="px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition-all hover:brightness-125"
                                style={{ background: 'rgba(255,77,106,0.1)', color: '#ff4d6a', border: '1px solid rgba(255,77,106,0.2)' }}
                              >
                                Cancel
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-14 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    <div className="empty-state-icon">
                      <ShieldCheck size={22} style={{ color: '#60a5fa' }} />
                    </div>
                    <p className="font-bold text-white text-sm">No Sandbox Orders</p>
                    <p className="mt-2">Test orders will be logged here.</p>
                  </div>
                )
              )}
            </div>
          </div>

          {/* ─── RIGHT: Order Ticket ─── */}
          <div className="xl:col-span-4 xl:sticky xl:top-6">
            <div
              className="order-ticket"
              style={{
                border: `1px solid ${side === 'BUY' ? 'rgba(0,214,143,0.2)' : 'rgba(255,77,106,0.2)'}`,
              }}
            >
              {/* BUY / SELL Toggle */}
              <div className="buy-sell-toggle">
                <button
                  type="button"
                  onClick={() => setSide('BUY')}
                  style={{
                    background: side === 'BUY' ? 'linear-gradient(135deg, #00d68f, #00b87a)' : 'transparent',
                    color: side === 'BUY' ? '#000' : 'var(--text-muted)',
                    boxShadow: side === 'BUY' ? '0 4px 20px rgba(0,214,143,0.3)' : 'none',
                  }}
                >
                  <TrendingUp size={14} />
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setSide('SELL')}
                  style={{
                    background: side === 'SELL' ? 'linear-gradient(135deg, #ff4d6a, #e63956)' : 'transparent',
                    color: side === 'SELL' ? '#fff' : 'var(--text-muted)',
                    boxShadow: side === 'SELL' ? '0 4px 20px rgba(255,77,106,0.3)' : 'none',
                  }}
                >
                  <TrendingDown size={14} />
                  SELL
                </button>
              </div>

              {/* Symbol Search */}
              <div className="relative mt-5" ref={dropdownRef}>
                <label className="text-[10px] uppercase font-bold tracking-wider block mb-2" style={{ color: 'var(--text-muted)' }}>
                  Stock Symbol
                </label>
                <div
                  className="flex items-center gap-2 px-3.5 py-3 rounded-xl text-sm"
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <Search size={14} style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search (e.g. RELIANCE, INFY)..."
                    value={symbolInput}
                    onChange={(e) => {
                      setSymbolInput(e.target.value);
                      if (selectedSymbol) setSelectedSymbol('');
                    }}
                    className="bg-transparent outline-none w-full text-white text-sm font-semibold"
                  />
                  {symbolInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setSymbolInput('');
                        setSelectedSymbol('');
                        setQuote(null);
                      }}
                      className="text-xs text-slate-400 hover:text-white cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {showDropdown && searchResults.length > 0 && (
                  <div
                    className="absolute top-full left-0 right-0 mt-1.5 rounded-xl overflow-hidden z-50 max-h-56 overflow-y-auto"
                    style={{
                      background: 'linear-gradient(165deg, #0f172a, #1e293b)',
                      border: '1px solid rgba(59,130,246,0.3)',
                      boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                    }}
                  >
                    {searchResults.map((s) => (
                      <button
                        type="button"
                        key={s.symbol}
                        onClick={() => selectStockForOrder(s.symbol, s.name)}
                        className="w-full text-left px-4 py-3 hover:bg-blue-500/8 flex items-center justify-between text-xs cursor-pointer border-b transition-colors"
                        style={{ borderColor: 'rgba(255,255,255,0.03)' }}
                      >
                        <div>
                          <span className="font-bold text-blue-400">{s.symbol}</span>
                          <span className="ml-2 text-slate-300 truncate">{s.name}</span>
                        </div>
                        <span className="text-[9px] uppercase text-slate-500 shrink-0 ml-2">{s.sector}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Live Quote Strip */}
              {selectedSymbol && (
                <div
                  className="rounded-xl p-3.5 flex items-center justify-between mt-4"
                  style={{
                    background: 'rgba(0,0,0,0.25)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-white">{selectedSymbol}</span>
                      <Link href={`/stock/${selectedSymbol}`} className="text-[10px] text-blue-400 hover:underline inline-flex items-center gap-0.5">
                        Chart <ExternalLink size={9} />
                      </Link>
                    </div>
                    <p className="text-[10px] truncate max-w-[160px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {selectedName}
                    </p>
                  </div>
                  <div className="text-right font-mono">
                    {loadingQuote ? (
                      <span className="text-xs text-slate-400 animate-pulse">Loading...</span>
                    ) : quote ? (
                      <>
                        <p className="text-lg font-black text-white">₹{fmtInr(quote.price)}</p>
                        <p
                          className="text-[10px] font-bold flex items-center justify-end gap-1"
                          style={{ color: quote.changePercent >= 0 ? '#00d68f' : '#ff4d6a' }}
                        >
                          {quote.changePercent >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%
                        </p>
                      </>
                    ) : (
                      <span className="text-xs text-rose-400">Quote N/A</span>
                    )}
                  </div>
                </div>
              )}

              {/* Product Type */}
              <div className="mt-4">
                <label className="text-[10px] uppercase font-bold tracking-wider block mb-2" style={{ color: 'var(--text-muted)' }}>
                  Product
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'D', label: 'Delivery', sub: 'CNC' },
                      { id: 'I', label: 'Intraday', sub: 'MIS' },
                      { id: 'MTF', label: 'MTF', sub: 'Margin' },
                    ] as { id: ProductType; label: string; sub: string }[]
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProduct(p.id)}
                      className="option-chip"
                      style={{
                        background: product === p.id ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.2)',
                        color: product === p.id ? '#93c5fd' : 'var(--text-muted)',
                        borderColor: product === p.id ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.05)',
                      }}
                    >
                      <span className="block">{p.label}</span>
                      <span className="text-[9px] opacity-60">{p.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Order Type */}
              <div className="mt-4">
                <label className="text-[10px] uppercase font-bold tracking-wider block mb-2" style={{ color: 'var(--text-muted)' }}>
                  Order Type
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['MARKET', 'LIMIT', 'SL', 'SL-M'] as OrderType[]).map((ot) => (
                    <button
                      key={ot}
                      type="button"
                      onClick={() => setOrderType(ot)}
                      className="option-chip"
                      style={{
                        background: orderType === ot ? 'rgba(139,92,246,0.15)' : 'rgba(0,0,0,0.2)',
                        color: orderType === ot ? '#c4b5fd' : 'var(--text-muted)',
                        borderColor: orderType === ot ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.05)',
                      }}
                    >
                      {ot}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity + Price */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>Qty</label>
                    {maxAffordableQty > 0 && side === 'BUY' && (
                      <button
                        type="button"
                        onClick={() => setQuantity(String(maxAffordableQty))}
                        className="text-[9px] text-blue-400 hover:underline cursor-pointer font-semibold"
                      >
                        Max {maxAffordableQty}
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="trade-input"
                  />
                  <div className="flex gap-1 mt-2">
                    {[1, 5, 10, 25].map((add) => (
                      <button
                        key={add}
                        type="button"
                        onClick={() => setQuantity(String((Math.floor(Number(quantity)) || 0) + add))}
                        className="qty-chip"
                      >
                        +{add}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold block mb-2" style={{ color: 'var(--text-muted)' }}>
                    {orderType === 'LIMIT' || orderType === 'SL' ? 'Limit Price' : 'Market Price'}
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    disabled={orderType === 'MARKET' || orderType === 'SL-M'}
                    value={orderType === 'MARKET' || orderType === 'SL-M' ? (quote?.price ?? '') : limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    placeholder="₹ 0.00"
                    className="trade-input"
                  />
                </div>
              </div>

              {/* Trigger Price */}
              {(orderType === 'SL' || orderType === 'SL-M') && (
                <div className="mt-3">
                  <label className="text-[10px] uppercase font-bold block mb-2" style={{ color: 'var(--text-muted)' }}>
                    Trigger Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={triggerPrice}
                    onChange={(e) => setTriggerPrice(e.target.value)}
                    placeholder="Stop-loss trigger..."
                    className="trade-input"
                  />
                </div>
              )}

              {/* Validity & AMO */}
              <div className="flex items-center justify-between gap-2 text-xs mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>Validity</span>
                  {(['DAY', 'IOC'] as ValidityType[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setValidity(v)}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all"
                      style={{
                        background: validity === v ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                        color: validity === v ? '#60a5fa' : 'var(--text-muted)',
                        border: `1px solid ${validity === v ? 'rgba(59,130,246,0.3)' : 'transparent'}`,
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-300">
                  <input
                    type="checkbox"
                    checked={isAmo}
                    onChange={(e) => setIsAmo(e.target.checked)}
                    className="accent-blue-500"
                  />
                  AMO
                </label>
              </div>

              {mode === 'live' && (
                <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-400 mt-2">
                  <input
                    type="checkbox"
                    checked={sliceOrder}
                    onChange={(e) => setSliceOrder(e.target.checked)}
                    className="accent-blue-500"
                  />
                  Auto-slice above freeze qty
                </label>
              )}

              {/* Pre-trade Summary */}
              <div
                className="rounded-xl p-4 space-y-2 text-xs mt-4"
                style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Est. Order Value</span>
                  <span className="font-mono font-bold text-white">₹{fmtInr(estOrderValue)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>
                    Charges {loadingCharges && <span className="animate-pulse">•••</span>}
                  </span>
                  <span className="font-mono text-slate-300">
                    {charges ? `₹${fmtInr(charges.charges.total)}` : '—'}
                  </span>
                </div>
                {charges && (
                  <div className="text-[10px] flex justify-between pt-2 border-t border-slate-800/50" style={{ color: 'var(--text-muted)' }}>
                    <span>Brok ₹{charges.charges.brokerage.toFixed(0)} · STT ₹{charges.charges.stt.toFixed(1)}</span>
                    <span>GST ₹{charges.charges.gst.toFixed(1)} · Stamp ₹{charges.charges.stampDuty.toFixed(1)}</span>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="button"
                disabled={
                  !selectedSymbol ||
                  qtyNum <= 0 ||
                  (mode === 'live' && !connected) ||
                  (mode === 'sandbox' && !sandboxToken)
                }
                onClick={() => setShowConfirmModal(true)}
                className="w-full py-3.5 rounded-xl text-sm font-black tracking-wide cursor-pointer transition-all hover:brightness-110 hover:shadow-lg disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
                style={{
                  background: side === 'BUY'
                    ? 'linear-gradient(135deg, #00d68f, #00b87a)'
                    : 'linear-gradient(135deg, #ff4d6a, #e63956)',
                  color: side === 'BUY' ? '#000' : '#fff',
                  boxShadow: side === 'BUY'
                    ? '0 4px 20px rgba(0,214,143,0.25)'
                    : '0 4px 20px rgba(255,77,106,0.25)',
                }}
              >
                <Zap size={15} />
                Review {side} {selectedSymbol || 'Order'} {mode === 'sandbox' ? '(Sandbox)' : ''}
              </button>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            ORDER CONFIRMATION MODAL
           ═══════════════════════════════════════════ */}
        {showConfirmModal && (
          <div className="trade-modal-overlay">
            <div className="trade-modal space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="p-2 rounded-xl"
                    style={{ background: mode === 'live' ? 'rgba(255,77,106,0.12)' : 'rgba(245,158,11,0.12)' }}
                  >
                    <Lock size={16} style={{ color: mode === 'live' ? '#ff4d6a' : '#fbbf24' }} />
                  </div>
                  <h3 className="text-base font-extrabold text-white">
                    {mode === 'live' ? 'Confirm Live Order' : 'Confirm Sandbox Order'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer transition-all"
                >
                  ✕
                </button>
              </div>

              {mode === 'live' && (
                <div
                  className="p-3.5 rounded-xl text-[11px] leading-relaxed"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,77,106,0.08), rgba(255,77,106,0.03))',
                    border: '1px solid rgba(255,77,106,0.25)',
                    color: '#fda4af',
                  }}
                >
                  <strong>⚠ Real Money:</strong> This sends a live execution instruction to NSE/BSE via your Upstox account.
                </div>
              )}

              <div className="rounded-xl p-4 space-y-2.5 text-xs" style={{ background: 'rgba(0,0,0,0.25)' }}>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Action</span>
                  <span className="font-black" style={{ color: side === 'BUY' ? '#00d68f' : '#ff4d6a' }}>
                    {side} {qtyNum} × {selectedSymbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Order & Product</span>
                  <span className="font-bold text-white">
                    {orderType} · {product === 'D' ? 'Delivery' : product === 'I' ? 'Intraday' : 'MTF'} · {validity}
                    {isAmo ? ' (AMO)' : ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Price</span>
                  <span className="font-mono font-bold text-white">
                    {orderType === 'MARKET' || orderType === 'SL-M'
                      ? `Market (~₹${fmtInr(effectivePrice)})`
                      : `₹${fmtInr(parseFloat(limitPrice) || 0)}`}
                  </span>
                </div>
                {(orderType === 'SL' || orderType === 'SL-M') && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-muted)' }}>Trigger Price</span>
                    <span className="font-mono font-bold text-amber-300">₹{fmtInr(parseFloat(triggerPrice) || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2.5 border-t border-slate-800/50">
                  <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>Total (incl. fees)</span>
                  <span className="font-mono font-black text-white text-sm">
                    ₹{fmtInr(estOrderValue + (charges?.charges.total || 0))}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-3 rounded-xl text-xs font-bold cursor-pointer transition-all text-slate-300 hover:bg-white/5"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePlaceOrder}
                  disabled={placingOrder}
                  className="flex-1 py-3 rounded-xl text-xs font-black cursor-pointer disabled:opacity-50 transition-all hover:brightness-110"
                  style={{
                    background: side === 'BUY'
                      ? 'linear-gradient(135deg, #00d68f, #00b87a)'
                      : 'linear-gradient(135deg, #ff4d6a, #e63956)',
                    color: side === 'BUY' ? '#000' : '#fff',
                  }}
                >
                  {placingOrder ? 'Submitting...' : `Confirm ${side}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            MODIFY ORDER MODAL
           ═══════════════════════════════════════════ */}
        {editingOrder && (
          <div className="trade-modal-overlay">
            <div className="trade-modal space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white">
                  Modify · {editingOrder.symbol}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                Order #{editingOrder.orderId}
              </p>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-[10px] uppercase font-bold mb-1.5 text-slate-400">Order Type</label>
                  <select
                    value={modType}
                    onChange={(e) => setModType(e.target.value as OrderType)}
                    className="trade-input"
                  >
                    <option value="LIMIT">LIMIT</option>
                    <option value="MARKET">MARKET</option>
                    <option value="SL">SL</option>
                    <option value="SL-M">SL-M</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold mb-1.5 text-slate-400">Quantity</label>
                  <input
                    type="number"
                    value={modQty}
                    onChange={(e) => setModQty(e.target.value)}
                    className="trade-input"
                  />
                </div>
                {(modType === 'LIMIT' || modType === 'SL') && (
                  <div>
                    <label className="block text-[10px] uppercase font-bold mb-1.5 text-slate-400">Price (₹)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={modPrice}
                      onChange={(e) => setModPrice(e.target.value)}
                      className="trade-input"
                    />
                  </div>
                )}
                {(modType === 'SL' || modType === 'SL-M') && (
                  <div>
                    <label className="block text-[10px] uppercase font-bold mb-1.5 text-slate-400">Trigger Price (₹)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={modTrigger}
                      onChange={(e) => setModTrigger(e.target.value)}
                      className="trade-input"
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold cursor-pointer text-slate-300 transition-all hover:bg-white/5"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleModifyOrder}
                  disabled={submittingModify}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 transition-all hover:brightness-110"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff' }}
                >
                  {submittingModify ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            EXIT ALL POSITIONS MODAL
           ═══════════════════════════════════════════ */}
        {showExitAllConfirm && (
          <div className="trade-modal-overlay">
            <div className="trade-modal space-y-5" style={{ borderColor: 'rgba(255,77,106,0.3)' }}>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl" style={{ background: 'rgba(255,77,106,0.12)' }}>
                  <AlertTriangle size={18} style={{ color: '#ff4d6a' }} />
                </div>
                <h3 className="text-base font-extrabold text-rose-400">Square Off All Positions?</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                This submits market exit orders for all open positions via Upstox. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowExitAllConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold cursor-pointer text-slate-300 transition-all hover:bg-white/5"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExitAllPositions}
                  disabled={exitingAll}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 transition-all hover:brightness-110"
                  style={{ background: 'linear-gradient(135deg, #ff4d6a, #e63956)', color: '#fff' }}
                >
                  {exitingAll ? 'Exiting...' : 'Confirm Exit All'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function LiveTradePage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-sm text-slate-400 animate-pulse">
          Loading Trading Terminal...
        </div>
      }
    >
      <LiveTradeContent />
    </Suspense>
  );
}
