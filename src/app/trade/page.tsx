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
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getBrokerConfig } from '@/lib/brokerApi';
import { searchStocks } from '@/lib/sectorData';
import { isMarketOpenNow } from '@/lib/marketHolidays';

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

function statusBadgeStyle(status: string): { bg: string; color: string } {
  const s = status.toLowerCase();
  if (s === 'complete' || s === 'executed') {
    return { bg: 'rgba(0,214,143,0.15)', color: '#00d68f' };
  }
  if (s.includes('reject') || s.includes('cancel')) {
    return { bg: 'rgba(255,77,106,0.15)', color: '#ff4d6a' };
  }
  return { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' };
}

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

  // Fetch Upstox Account Portfolio (Holdings, Positions, Orders, Trades, Funds, Static IP)
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

  return (
    <div className="w-full max-w-7xl mx-auto pb-12 animate-fade-in">
      {/* ─── Header & Mode Switcher ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">⚡ Live Trade &amp; Upstox Portfolio</h1>
            <span
              className="text-[10px] font-bold px-2.5 py-0.5 rounded-full"
              style={{
                background: mode === 'live' ? 'rgba(255,77,106,0.16)' : 'rgba(245,158,11,0.16)',
                color: mode === 'live' ? '#ff4d6a' : '#fbbf24',
                border: `1px solid ${mode === 'live' ? 'rgba(255,77,106,0.35)' : 'rgba(245,158,11,0.35)'}`,
              }}
            >
              {mode === 'live' ? '🔴 LIVE EXCHANGE ORDERS' : '🛡️ SANDBOX TEST MODE'}
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Direct Buy/Sell execution via Upstox V3 HFT API alongside live Demat Holdings, Positions &amp; Order Book
          </p>
        </div>

        {/* Mode Switcher + Sync Controls */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div
            className="flex items-center rounded-xl p-1"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
          >
            <button
              type="button"
              onClick={() => setMode('live')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all"
              style={{
                background: mode === 'live' ? 'rgba(255,77,106,0.2)' : 'transparent',
                color: mode === 'live' ? '#ff4d6a' : 'var(--text-muted)',
              }}
            >
              Live Account
            </button>
            <button
              type="button"
              onClick={() => setMode('sandbox')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all"
              style={{
                background: mode === 'sandbox' ? 'rgba(245,158,11,0.2)' : 'transparent',
                color: mode === 'sandbox' ? '#fbbf24' : 'var(--text-muted)',
              }}
            >
              Sandbox Test
            </button>
          </div>

          <button
            type="button"
            onClick={fetchAccount}
            disabled={loadingAccount}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all hover:brightness-125 disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(59,130,246,0.12))',
              color: '#60a5fa',
              border: '1px solid rgba(59,130,246,0.4)',
            }}
          >
            <RefreshCw size={13} className={loadingAccount ? 'animate-spin' : ''} />
            <span>Sync Upstox</span>
          </button>
        </div>
      </div>

      {/* ─── Connection & Compliance Banners ─── */}
      {!connected && !loadingAccount && (
        <div
          className="mb-5 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={16} style={{ color: '#fbbf24', flexShrink: 0 }} />
            <div>
              <p className="font-bold text-white">Upstox Live Account Not Connected</p>
              <p style={{ color: 'var(--text-secondary)' }}>{accountError}</p>
            </div>
          </div>
          <Link
            href="/broker"
            className="px-4 py-2 rounded-lg font-bold text-white shrink-0 text-center"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
          >
            Connect Upstox →
          </Link>
        </div>
      )}

      {mode === 'live' && connected && staticIp && !staticIp.configured && (
        <div
          className="mb-5 px-4 py-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert size={16} style={{ color: '#fbbf24', flexShrink: 0, marginTop: 2 }} />
            <div>
              <p className="font-bold text-amber-300">Static IP Not Registered on Upstox (`GET /v2/user/ip` is empty)</p>
              <p className="mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Portfolio, Holdings, Positions &amp; Order Book work normally, but SEBI/Upstox rules reject live order placement unless your server IP is registered under{' '}
                <a href="https://account.upstox.com/developer/apps" target="_blank" rel="noopener noreferrer" className="underline text-blue-400">
                  Upstox Developer Apps
                </a>
                . Switch to <strong>Sandbox Test</strong> mode anytime for risk-free order testing.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMode('sandbox')}
            className="px-3 py-1.5 rounded-lg font-bold shrink-0 cursor-pointer"
            style={{ background: 'rgba(245,158,11,0.18)', color: '#fbbf24' }}
          >
            Switch to Sandbox
          </button>
        </div>
      )}

      {mode === 'live' && connected && staticIp?.configured && (
        <div
          className="mb-5 px-4 py-2 rounded-xl flex items-center justify-between text-xs"
          style={{ background: 'rgba(0,214,143,0.08)', border: '1px solid rgba(0,214,143,0.25)' }}
        >
          <div className="flex items-center gap-2 text-emerald-300">
            <ShieldCheck size={15} />
            <span>
              <strong>{profile?.userName || profile?.userId || 'Upstox Live'}</strong> connected · Static IP Active (
              {staticIp.primaryIp || staticIp.secondaryIp})
            </span>
          </div>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            POA/DDPI: {profile?.poa ? 'Enabled' : 'Standard (TPIN/EDIS for CNC Sell)'}
          </span>
        </div>
      )}

      {/* Sandbox Token Config Box */}
      {mode === 'sandbox' && (
        <div
          className="mb-5 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
          style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          <div className="flex-1">
            <p className="font-bold text-amber-300">Upstox Sandbox Token (Risk-Free Order Testing)</p>
            <p className="mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Orders sent to <code className="text-amber-200">sandbox.upstox.com</code> — zero real money or Static IP needed. Create a Sandbox App in Upstox My Apps to generate a sandbox token.
            </p>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <input
              type="password"
              value={sandboxTokenInput}
              onChange={(e) => setSandboxTokenInput(e.target.value)}
              placeholder="Paste Sandbox access token..."
              className="px-3 py-2 rounded-lg text-xs bg-slate-900 border border-slate-700 text-white w-full md:w-64 outline-none"
            />
            <button
              type="button"
              onClick={saveSandboxTok}
              className="px-3.5 py-2 rounded-lg font-bold cursor-pointer shrink-0"
              style={{ background: '#fbbf24', color: '#000' }}
            >
              Save Token
            </button>
          </div>
        </div>
      )}

      {/* Order Execution Feedback Toast */}
      {orderFeedback && (
        <div
          className="mb-5 p-4 rounded-xl flex items-start justify-between gap-3 text-xs animate-fade-in-up"
          style={{
            background: orderFeedback.type === 'success' ? 'rgba(0,214,143,0.12)' : 'rgba(255,77,106,0.12)',
            border: `1px solid ${orderFeedback.type === 'success' ? 'rgba(0,214,143,0.35)' : 'rgba(255,77,106,0.35)'}`,
          }}
        >
          <div className="flex items-start gap-2.5">
            {orderFeedback.type === 'success' ? (
              <CheckCircle2 size={16} style={{ color: '#00d68f', flexShrink: 0, marginTop: 1 }} />
            ) : (
              <XCircle size={16} style={{ color: '#ff4d6a', flexShrink: 0, marginTop: 1 }} />
            )}
            <div>
              <p className="font-bold text-white">{orderFeedback.message}</p>
              {orderFeedback.hint && <p className="mt-1 text-slate-300">{orderFeedback.hint}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOrderFeedback(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── Account Summary KPIs ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="glass-card-static rounded-xl p-4">
          <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
            <span>Available Cash / Margin</span>
            <Wallet size={13} style={{ color: '#60a5fa' }} />
          </div>
          {funds?.available ? (
            <>
              <p className="text-xl font-black text-white mt-1.5 tabular-nums">₹{fmtInr(funds.availableMargin)}</p>
              <p className="text-[10px] mt-0.5 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                Used Margin: ₹{fmtInr(funds.usedMargin)}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-amber-400 mt-2">Settlement Window</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {funds?.notice || 'Available 5:30 AM – 12:00 AM IST'}
              </p>
            </>
          )}
        </div>

        <div className="glass-card-static rounded-xl p-4">
          <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
            <span>Demat Holdings</span>
            <Briefcase size={13} style={{ color: '#a78bfa' }} />
          </div>
          <p className="text-xl font-black text-white mt-1.5 tabular-nums">
            ₹{fmtInr(summary?.totalCurrentValue || 0)}
          </p>
          <p
            className="text-[11px] font-bold mt-0.5 tabular-nums"
            style={{ color: (summary?.totalHoldingsPnl || 0) >= 0 ? '#00d68f' : '#ff4d6a' }}
          >
            {(summary?.totalHoldingsPnl || 0) >= 0 ? '+' : ''}₹{fmtInr(summary?.totalHoldingsPnl || 0)} (
            {summary?.totalHoldingsPnlPercent || 0}%)
          </p>
        </div>

        <div className="glass-card-static rounded-xl p-4">
          <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
            <span>Day Positions P&amp;L</span>
            <Activity size={13} style={{ color: '#00d68f' }} />
          </div>
          {(() => {
            const totalPosPnl = (summary?.positionsUnrealised || 0) + (summary?.positionsRealised || 0);
            return (
              <>
                <p
                  className="text-xl font-black mt-1.5 tabular-nums"
                  style={{ color: totalPosPnl >= 0 ? '#00d68f' : '#ff4d6a' }}
                >
                  {totalPosPnl >= 0 ? '+' : ''}₹{fmtInr(totalPosPnl)}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Open Positions: {summary?.openPositionsCount || 0}
                </p>
              </>
            );
          })()}
        </div>

        <div className="glass-card-static rounded-xl p-4">
          <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
            <span>Today&apos;s Orders &amp; Trades</span>
            <FileCheck2 size={13} style={{ color: '#fbbf24' }} />
          </div>
          <p className="text-xl font-black text-white mt-1.5 tabular-nums">{orders.length} Orders</p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Open: {summary?.openOrdersCount || 0} · Executed Trades: {trades.length}
          </p>
        </div>
      </div>

      {/* ─── Main 2-Column Workspace: Account Tables (Left) + Order Ticket (Right) ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Holdings / Positions / Orders / Trades */}
        <div className="xl:col-span-8 space-y-4">
          {/* Tabs + Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {(
                [
                  { id: 'holdings', label: `Holdings (${holdings.length})` },
                  { id: 'positions', label: `Positions (${positions.length})` },
                  { id: 'orders', label: `Orders (${orders.length})` },
                  { id: 'trades', label: `Trades (${trades.length})` },
                  ...(mode === 'sandbox' ? [{ id: 'sandboxLog', label: `Sandbox Log (${sandboxOrders.length})` }] : []),
                ] as { id: AccountTab; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 cursor-pointer transition-all"
                  style={{
                    background: activeTab === t.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)',
                    color: activeTab === t.id ? '#60a5fa' : 'var(--text-muted)',
                    border: `1px solid ${activeTab === t.id ? 'rgba(59,130,246,0.35)' : 'var(--border-subtle)'}`,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:w-52"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
            >
              <Search size={13} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Filter symbol..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="bg-transparent outline-none w-full text-white"
              />
            </div>
          </div>

          {/* Account Tables Container */}
          <div
            className="rounded-2xl overflow-hidden shadow-xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
          >
            {/* TAB 1: DEMAT HOLDINGS */}
            {activeTab === 'holdings' && (
              filteredHoldings.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                        <th className="px-4 py-3 font-semibold uppercase text-[10px]">Stock</th>
                        <th className="px-3 py-3 text-right font-semibold uppercase text-[10px]">Qty</th>
                        <th className="px-3 py-3 text-right font-semibold uppercase text-[10px]">Avg Buy</th>
                        <th className="px-3 py-3 text-right font-semibold uppercase text-[10px]">LTP</th>
                        <th className="px-3 py-3 text-right font-semibold uppercase text-[10px]">Overall P&amp;L</th>
                        <th className="px-4 py-3 text-right font-semibold uppercase text-[10px]">Trade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHoldings.map((h) => (
                        <tr key={h.isin + h.symbol} className="border-b hover:bg-white/[0.02]" style={{ borderColor: 'var(--border-subtle)' }}>
                          <td className="px-4 py-3">
                            <Link href={`/stock/${h.symbol}`} className="font-bold text-blue-400 hover:underline">
                              {h.symbol}
                            </Link>
                            <p className="text-[10px] truncate max-w-[160px]" style={{ color: 'var(--text-muted)' }}>
                              {h.companyName}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-bold text-white">
                            {h.totalQuantity}
                            {h.t1Quantity > 0 && <span className="text-[9px] text-amber-400 block">({h.t1Quantity} T1)</span>}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-slate-300">₹{fmtInr(h.averagePrice)}</td>
                          <td className="px-3 py-3 text-right font-mono">
                            <span className="font-bold text-white">₹{fmtInr(h.lastPrice)}</span>
                            <span className="block text-[10px]" style={{ color: h.dayChangePercent >= 0 ? '#00d68f' : '#ff4d6a' }}>
                              {h.dayChangePercent >= 0 ? '+' : ''}{h.dayChangePercent.toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-mono">
                            <span className="font-bold" style={{ color: h.pnl >= 0 ? '#00d68f' : '#ff4d6a' }}>
                              {h.pnl >= 0 ? '+' : ''}₹{fmtInr(h.pnl)}
                            </span>
                            <span className="block text-[10px]" style={{ color: h.pnl >= 0 ? '#00d68f' : '#ff4d6a' }}>
                              {h.pnlPercent >= 0 ? '+' : ''}{h.pnlPercent.toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => selectStockForOrder(h.symbol, h.companyName, 'BUY', 1)}
                                className="px-2 py-1 rounded text-[10px] font-bold cursor-pointer"
                                style={{ background: 'rgba(0,214,143,0.14)', color: '#00d68f' }}
                              >
                                +Buy
                              </button>
                              <button
                                type="button"
                                onClick={() => selectStockForOrder(h.symbol, h.companyName, 'SELL', h.quantity || h.totalQuantity)}
                                className="px-2 py-1 rounded text-[10px] font-bold cursor-pointer"
                                style={{ background: 'rgba(255,77,106,0.14)', color: '#ff4d6a' }}
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
                <div className="p-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                  <p className="text-2xl mb-2">📦</p>
                  <p className="font-semibold text-white">No Long-Term Demat Holdings Found</p>
                  <p className="mt-1">Your Upstox Demat holdings will sync automatically here once settled in your account.</p>
                </div>
              )
            )}

            {/* TAB 2: OPEN / DAY POSITIONS */}
            {activeTab === 'positions' && (
              <div>
                {positions.some((p) => p.quantity !== 0) && mode === 'live' && (
                  <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {positions.filter((p) => p.quantity !== 0).length} open position(s)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowExitAllConfirm(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                      style={{ background: 'rgba(255,77,106,0.15)', color: '#ff4d6a', border: '1px solid rgba(255,77,106,0.3)' }}
                    >
                      Square Off All Positions
                    </button>
                  </div>
                )}
                {filteredPositions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                          <th className="px-4 py-3 font-semibold uppercase text-[10px]">Instrument</th>
                          <th className="px-3 py-3 text-center font-semibold uppercase text-[10px]">Product</th>
                          <th className="px-3 py-3 text-right font-semibold uppercase text-[10px]">Net Qty</th>
                          <th className="px-3 py-3 text-right font-semibold uppercase text-[10px]">Avg Price</th>
                          <th className="px-3 py-3 text-right font-semibold uppercase text-[10px]">LTP</th>
                          <th className="px-3 py-3 text-right font-semibold uppercase text-[10px]">P&amp;L</th>
                          <th className="px-4 py-3 text-right font-semibold uppercase text-[10px]">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPositions.map((p, idx) => (
                          <tr key={`${p.instrumentToken}-${p.product}-${idx}`} className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                            <td className="px-4 py-3 font-bold text-white">{p.symbol}</td>
                            <td className="px-3 py-3 text-center">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                                {p.product === 'I' ? 'MIS' : p.product === 'D' ? 'CNC' : p.product}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right font-mono font-bold text-white">{p.quantity}</td>
                            <td className="px-3 py-3 text-right font-mono text-slate-300">₹{fmtInr(p.averagePrice || p.buyPrice)}</td>
                            <td className="px-3 py-3 text-right font-mono text-white">₹{fmtInr(p.lastPrice)}</td>
                            <td className="px-3 py-3 text-right font-mono font-bold" style={{ color: p.pnl >= 0 ? '#00d68f' : '#ff4d6a' }}>
                              {p.pnl >= 0 ? '+' : ''}₹{fmtInr(p.pnl)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {p.quantity !== 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    selectStockForOrder(
                                      p.symbol,
                                      p.symbol,
                                      p.quantity > 0 ? 'SELL' : 'BUY',
                                      Math.abs(p.quantity)
                                    )
                                  }
                                  className="px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer"
                                  style={{ background: 'rgba(255,77,106,0.14)', color: '#ff4d6a' }}
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
                  <div className="p-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    <p className="text-2xl mb-2">⚡</p>
                    <p className="font-semibold text-white">No Open or Day Positions</p>
                    <p className="mt-1">Intraday and current-day F&amp;O/Equity positions appear here automatically.</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: ORDER BOOK */}
            {activeTab === 'orders' && (
              filteredOrders.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                        <th className="px-4 py-3 font-semibold uppercase text-[10px]">Symbol / Side</th>
                        <th className="px-3 py-3 text-right font-semibold uppercase text-[10px]">Qty</th>
                        <th className="px-3 py-3 text-right font-semibold uppercase text-[10px]">Price</th>
                        <th className="px-3 py-3 text-center font-semibold uppercase text-[10px]">Status</th>
                        <th className="px-4 py-3 text-right font-semibold uppercase text-[10px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((o) => {
                        const badge = statusBadgeStyle(o.status);
                        const canEdit = isOrderEditable(o.status);
                        return (
                          <tr key={o.orderId} className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="text-[9px] font-black px-1.5 py-0.5 rounded"
                                  style={{
                                    background: o.transactionType === 'BUY' ? 'rgba(0,214,143,0.16)' : 'rgba(255,77,106,0.16)',
                                    color: o.transactionType === 'BUY' ? '#00d68f' : '#ff4d6a',
                                  }}
                                >
                                  {o.transactionType}
                                </span>
                                <span className="font-bold text-white">{o.symbol}</span>
                                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                  {o.orderType} · {o.product} {o.isAmo ? '· AMO' : ''}
                                </span>
                              </div>
                              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                {o.orderTimestamp} · #{o.orderId}
                              </p>
                              {o.statusMessage && (
                                <p className="text-[10px] mt-0.5 text-amber-300">{o.statusMessage}</p>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-white">
                              {o.filledQuantity}/{o.quantity}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-slate-200">
                              ₹{fmtInr(o.averagePrice > 0 ? o.averagePrice : o.price)}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span
                                className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase"
                                style={{ background: badge.bg, color: badge.color }}
                              >
                                {o.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
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
                                    className="p-1.5 rounded bg-slate-800 text-blue-400 hover:brightness-125 cursor-pointer"
                                    title="Modify order"
                                  >
                                    <Edit3 size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCancelOrder(o.orderId)}
                                    className="p-1.5 rounded bg-rose-500/15 text-rose-400 hover:brightness-125 cursor-pointer"
                                    title="Cancel order"
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
                <div className="p-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                  <p className="text-2xl mb-2">📋</p>
                  <p className="font-semibold text-white">No Orders Placed Today</p>
                  <p className="mt-1">Use the Buy / Sell ticket on the right to place an order via Upstox API.</p>
                </div>
              )
            )}

            {/* TAB 4: EXECUTED TRADES */}
            {activeTab === 'trades' && (
              filteredTrades.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                        <th className="px-4 py-3 font-semibold uppercase text-[10px]">Symbol</th>
                        <th className="px-3 py-3 text-center font-semibold uppercase text-[10px]">Side</th>
                        <th className="px-3 py-3 text-right font-semibold uppercase text-[10px]">Qty</th>
                        <th className="px-3 py-3 text-right font-semibold uppercase text-[10px]">Fill Price</th>
                        <th className="px-4 py-3 text-right font-semibold uppercase text-[10px]">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrades.map((t) => (
                        <tr key={t.tradeId} className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                          <td className="px-4 py-3 font-bold text-white">{t.symbol}</td>
                          <td className="px-3 py-3 text-center font-bold" style={{ color: t.transactionType === 'BUY' ? '#00d68f' : '#ff4d6a' }}>
                            {t.transactionType}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-white">{t.quantity}</td>
                          <td className="px-3 py-3 text-right font-mono text-white">₹{fmtInr(t.averagePrice)}</td>
                          <td className="px-4 py-3 text-right text-[10px]" style={{ color: 'var(--text-muted)' }}>{t.exchangeTimestamp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                  <p className="text-2xl mb-2">✅</p>
                  <p className="font-semibold text-white">No Executed Trades Today</p>
                </div>
              )
            )}

            {/* TAB 5: SANDBOX ORDER LOG */}
            {activeTab === 'sandboxLog' && (
              sandboxOrders.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                        <th className="px-4 py-3 font-semibold uppercase text-[10px]">Order ID</th>
                        <th className="px-3 py-3 font-semibold uppercase text-[10px]">Stock / Side</th>
                        <th className="px-3 py-3 text-right font-semibold uppercase text-[10px]">Qty</th>
                        <th className="px-3 py-3 text-right font-semibold uppercase text-[10px]">Ref Price</th>
                        <th className="px-4 py-3 text-right font-semibold uppercase text-[10px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sandboxOrders.map((o) => (
                        <tr key={o.orderId} className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                          <td className="px-4 py-3 font-mono text-[11px] text-amber-300">{o.orderId}</td>
                          <td className="px-3 py-3">
                            <span className="font-bold text-white">{o.symbol}</span>{' '}
                            <span className="font-bold" style={{ color: o.transactionType === 'BUY' ? '#00d68f' : '#ff4d6a' }}>
                              {o.transactionType}
                            </span>{' '}
                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>({o.orderType} · {o.timestamp})</span>
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-white">{o.quantity}</td>
                          <td className="px-3 py-3 text-right font-mono text-slate-300">₹{fmtInr(o.price)}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleCancelOrder(o.orderId)}
                              className="px-2 py-1 rounded bg-rose-500/15 text-rose-400 text-[10px] font-bold cursor-pointer"
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
                <div className="p-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                  No Sandbox test orders logged yet.
                </div>
              )
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: STICKY BUY / SELL ORDER TICKET */}
        <div className="xl:col-span-4 xl:sticky xl:top-6">
          <div
            className="rounded-2xl p-5 shadow-2xl space-y-4"
            style={{
              background: 'var(--bg-card)',
              border: `1px solid ${side === 'BUY' ? 'rgba(0,214,143,0.3)' : 'rgba(255,77,106,0.3)'}`,
            }}
          >
            {/* Ticket Header + BUY/SELL Switch */}
            <div className="grid grid-cols-2 rounded-xl overflow-hidden p-1" style={{ background: 'var(--bg-primary)' }}>
              <button
                type="button"
                onClick={() => setSide('BUY')}
                className="py-2 rounded-lg text-xs font-black tracking-wide cursor-pointer transition-all"
                style={{
                  background: side === 'BUY' ? '#00d68f' : 'transparent',
                  color: side === 'BUY' ? '#000' : 'var(--text-muted)',
                }}
              >
                BUY
              </button>
              <button
                type="button"
                onClick={() => setSide('SELL')}
                className="py-2 rounded-lg text-xs font-black tracking-wide cursor-pointer transition-all"
                style={{
                  background: side === 'SELL' ? '#ff4d6a' : 'transparent',
                  color: side === 'SELL' ? '#fff' : 'var(--text-muted)',
                }}
              >
                SELL
              </button>
            </div>

            {/* Symbol Search */}
            <div className="relative" ref={dropdownRef}>
              <label className="text-[10px] uppercase font-bold tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                Select NSE Stock
              </label>
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}
              >
                <Search size={14} style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search symbol (e.g. RELIANCE, TMCV, INFY)..."
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
                  className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-50 shadow-2xl max-h-56 overflow-y-auto"
                  style={{ background: '#0f172a', border: '1px solid rgba(59,130,246,0.35)' }}
                >
                  {searchResults.map((s) => (
                    <button
                      type="button"
                      key={s.symbol}
                      onClick={() => selectStockForOrder(s.symbol, s.name)}
                      className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center justify-between text-xs cursor-pointer border-b border-slate-800/70"
                    >
                      <div>
                        <span className="font-bold text-blue-400">{s.symbol}</span>
                        <span className="ml-2 text-slate-300 truncate">{s.name}</span>
                      </div>
                      <span className="text-[9px] uppercase text-slate-500">{s.sector}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Live Quote Strip */}
            {selectedSymbol && (
              <div
                className="rounded-xl p-3 flex items-center justify-between"
                style={{ background: 'var(--bg-primary)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-white">{selectedSymbol}</span>
                    <Link href={`/stock/${selectedSymbol}`} className="text-[10px] text-blue-400 hover:underline inline-flex items-center gap-0.5">
                      Chart <ExternalLink size={9} />
                    </Link>
                  </div>
                  <p className="text-[10px] truncate max-w-[160px]" style={{ color: 'var(--text-muted)' }}>
                    {selectedName}
                  </p>
                </div>
                <div className="text-right font-mono">
                  {loadingQuote ? (
                    <span className="text-xs text-slate-400 animate-pulse">Fetching LTP...</span>
                  ) : quote ? (
                    <>
                      <p className="text-base font-black text-white">₹{fmtInr(quote.price)}</p>
                      <p
                        className="text-[10px] font-bold"
                        style={{ color: quote.changePercent >= 0 ? '#00d68f' : '#ff4d6a' }}
                      >
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
            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Product
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'D', label: 'Delivery (CNC)' },
                    { id: 'I', label: 'Intraday (MIS)' },
                    { id: 'MTF', label: 'MTF' },
                  ] as { id: ProductType; label: string }[]
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProduct(p.id)}
                    className="py-1.5 px-2 rounded-lg text-[11px] font-bold cursor-pointer transition-all"
                    style={{
                      background: product === p.id ? 'rgba(59,130,246,0.2)' : 'var(--bg-primary)',
                      color: product === p.id ? '#60a5fa' : 'var(--text-muted)',
                      border: `1px solid ${product === p.id ? 'rgba(59,130,246,0.4)' : 'var(--border-subtle)'}`,
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Order Type */}
            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Order Type
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['MARKET', 'LIMIT', 'SL', 'SL-M'] as OrderType[]).map((ot) => (
                  <button
                    key={ot}
                    type="button"
                    onClick={() => setOrderType(ot)}
                    className="py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all"
                    style={{
                      background: orderType === ot ? 'rgba(139,92,246,0.22)' : 'var(--bg-primary)',
                      color: orderType === ot ? '#c4b5fd' : 'var(--text-muted)',
                      border: `1px solid ${orderType === ot ? 'rgba(139,92,246,0.4)' : 'var(--border-subtle)'}`,
                    }}
                  >
                    {ot}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity + Price Inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>Qty</label>
                  {maxAffordableQty > 0 && side === 'BUY' && (
                    <button
                      type="button"
                      onClick={() => setQuantity(String(maxAffordableQty))}
                      className="text-[9px] text-blue-400 hover:underline cursor-pointer"
                    >
                      Max: {maxAffordableQty}
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm font-mono font-bold text-white bg-slate-900 border border-slate-700 outline-none"
                />
                <div className="flex gap-1 mt-1.5">
                  {[1, 5, 10, 25].map((add) => (
                    <button
                      key={add}
                      type="button"
                      onClick={() => setQuantity(String((Math.floor(Number(quantity)) || 0) + add))}
                      className="flex-1 py-0.5 rounded text-[9px] font-bold cursor-pointer"
                      style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}
                    >
                      +{add}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>
                  {orderType === 'LIMIT' || orderType === 'SL' ? 'Limit Price (₹)' : 'Market Price (Est)'}
                </label>
                <input
                  type="number"
                  step="0.05"
                  disabled={orderType === 'MARKET' || orderType === 'SL-M'}
                  value={orderType === 'MARKET' || orderType === 'SL-M' ? (quote?.price ?? '') : limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-xl text-sm font-mono font-bold text-white bg-slate-900 border border-slate-700 outline-none disabled:opacity-50"
                />
              </div>
            </div>

            {/* Trigger Price (for SL / SL-M) */}
            {(orderType === 'SL' || orderType === 'SL-M') && (
              <div>
                <label className="text-[10px] uppercase font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>
                  Stop-Loss Trigger Price (₹)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={triggerPrice}
                  onChange={(e) => setTriggerPrice(e.target.value)}
                  placeholder="Enter trigger price..."
                  className="w-full px-3 py-2 rounded-xl text-sm font-mono font-bold text-white bg-slate-900 border border-slate-700 outline-none"
                />
              </div>
            )}

            {/* Validity & AMO Options */}
            <div className="flex items-center justify-between gap-2 text-xs pt-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>Validity:</span>
                {(['DAY', 'IOC'] as ValidityType[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setValidity(v)}
                    className="px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer"
                    style={{
                      background: validity === v ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                      color: validity === v ? '#60a5fa' : 'var(--text-muted)',
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
                <span>AMO (After-Market)</span>
              </label>
            </div>

            {mode === 'live' && (
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-400">
                <input
                  type="checkbox"
                  checked={sliceOrder}
                  onChange={(e) => setSliceOrder(e.target.checked)}
                  className="accent-blue-500"
                />
                <span>Auto-slice above exchange freeze qty (Upstox V3)</span>
              </label>
            )}

            {/* Pre-trade Margin & Brokerage Preview */}
            <div
              className="rounded-xl p-3 space-y-1.5 text-xs"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}
            >
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Est. Order Value</span>
                <span className="font-mono font-bold text-white">₹{fmtInr(estOrderValue)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>
                  Brokerage &amp; Taxes {loadingCharges ? '(calc...)' : ''}
                </span>
                <span className="font-mono text-slate-300">
                  {charges ? `₹${fmtInr(charges.charges.total)}` : '—'}
                </span>
              </div>
              {charges && (
                <div className="text-[10px] flex justify-between pt-1 border-t border-slate-800/80" style={{ color: 'var(--text-muted)' }}>
                  <span>Brok ₹{charges.charges.brokerage.toFixed(0)} · STT ₹{charges.charges.stt.toFixed(1)}</span>
                  <span>GST ₹{charges.charges.gst.toFixed(1)} · Stamp ₹{charges.charges.stampDuty.toFixed(1)}</span>
                </div>
              )}
            </div>

            {/* Submit Trigger Button (opens Review Confirmation Modal) */}
            <button
              type="button"
              disabled={
                !selectedSymbol ||
                qtyNum <= 0 ||
                (mode === 'live' && !connected) ||
                (mode === 'sandbox' && !sandboxToken)
              }
              onClick={() => setShowConfirmModal(true)}
              className="w-full py-3 rounded-xl text-sm font-black tracking-wide cursor-pointer transition-all hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-2"
              style={{
                background: side === 'BUY' ? '#00d68f' : '#ff4d6a',
                color: side === 'BUY' ? '#000' : '#fff',
              }}
            >
              <Zap size={15} />
              <span>
                Review {side} {selectedSymbol || 'Order'} {mode === 'sandbox' ? '(Sandbox)' : ''}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── TWO-STEP ORDER CONFIRMATION MODAL ─── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 animate-fade-in-up"
            style={{ background: '#0f172a', border: '1px solid var(--border-color)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock size={16} style={{ color: mode === 'live' ? '#ff4d6a' : '#fbbf24' }} />
                <h3 className="text-base font-extrabold text-white">
                  Confirm {mode === 'live' ? 'LIVE Exchange Order' : 'Sandbox Test Order'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {mode === 'live' && (
              <div
                className="p-3 rounded-lg text-[11px]"
                style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)', color: '#fda4af' }}
              >
                <strong>Real Money Warning:</strong> Submitting this order sends a live execution instruction directly to NSE/BSE via your Upstox Demat account.
              </div>
            )}

            <div className="rounded-xl p-4 space-y-2 text-xs" style={{ background: 'var(--bg-primary)' }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Action</span>
                <span className="font-black" style={{ color: side === 'BUY' ? '#00d68f' : '#ff4d6a' }}>
                  {side} {qtyNum} × {selectedSymbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Order &amp; Product</span>
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
              <div className="flex justify-between pt-2 border-t border-slate-800">
                <span style={{ color: 'var(--text-muted)' }}>Est. Value + Fees</span>
                <span className="font-mono font-black text-white">
                  ₹{fmtInr(estOrderValue + (charges?.charges.total || 0))}
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold cursor-pointer border border-slate-700 text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={placingOrder}
                className="flex-1 py-2.5 rounded-xl text-xs font-black cursor-pointer disabled:opacity-50"
                style={{
                  background: side === 'BUY' ? '#00d68f' : '#ff4d6a',
                  color: side === 'BUY' ? '#000' : '#fff',
                }}
              >
                {placingOrder ? 'Submitting...' : `Confirm ${side}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODIFY ORDER MODAL ─── */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-4"
            style={{ background: '#0f172a', border: '1px solid var(--border-color)' }}
          >
            <h3 className="text-sm font-extrabold text-white">
              Modify Order · {editingOrder.symbol} (#{editingOrder.orderId})
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold mb-1 text-slate-400">Order Type</label>
                <select
                  value={modType}
                  onChange={(e) => setModType(e.target.value as OrderType)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                >
                  <option value="LIMIT">LIMIT</option>
                  <option value="MARKET">MARKET</option>
                  <option value="SL">SL</option>
                  <option value="SL-M">SL-M</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold mb-1 text-slate-400">Quantity</label>
                <input
                  type="number"
                  value={modQty}
                  onChange={(e) => setModQty(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                />
              </div>
              {(modType === 'LIMIT' || modType === 'SL') && (
                <div>
                  <label className="block text-[10px] uppercase font-bold mb-1 text-slate-400">Price (₹)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={modPrice}
                    onChange={(e) => setModPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                  />
                </div>
              )}
              {(modType === 'SL' || modType === 'SL-M') && (
                <div>
                  <label className="block text-[10px] uppercase font-bold mb-1 text-slate-400">Trigger Price (₹)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={modTrigger}
                    onChange={(e) => setModTrigger(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                  />
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="flex-1 py-2 rounded-xl text-xs font-bold border border-slate-700 text-slate-300 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleModifyOrder}
                disabled={submittingModify}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white cursor-pointer disabled:opacity-50"
              >
                {submittingModify ? 'Updating...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── EXIT ALL POSITIONS CONFIRM MODAL ─── */}
      {showExitAllConfirm && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-4"
            style={{ background: '#0f172a', border: '1px solid rgba(255,77,106,0.4)' }}
          >
            <h3 className="text-base font-extrabold text-rose-400">Square Off All Open Positions?</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              This will submit market exit orders via Upstox (`POST /v2/order/positions/exit`) for all currently open positions in your account.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowExitAllConfirm(false)}
                className="flex-1 py-2 rounded-xl text-xs font-bold border border-slate-700 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExitAllPositions}
                disabled={exitingAll}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white cursor-pointer disabled:opacity-50"
              >
                {exitingAll ? 'Exiting...' : 'Confirm Exit All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LiveTradePage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-sm text-slate-400">
          Loading Live Trade Terminal...
        </div>
      }
    >
      <LiveTradeContent />
    </Suspense>
  );
}
