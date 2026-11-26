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
  Clock,
  Info,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getActiveClientUpstoxToken } from '@/lib/brokerApi';
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
const POPULAR_STOCKS = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'SBIN', 'ICICIBANK'];

const PRODUCT_HINTS: Record<ProductType, string> = {
  D: 'Delivery (CNC): Hold shares long-term in your Demat account.',
  I: 'Intraday (MIS): Auto-squared off before 3:15 PM IST same day.',
  MTF: 'Margin Trading (MTF): Carry forward with broker leverage.',
};

const ORDER_TYPE_HINTS: Record<OrderType, string> = {
  MARKET: 'Executes immediately at the best available market price.',
  LIMIT: 'Executes only at your specified limit price or better.',
  SL: 'Stop-Loss Limit: Triggers at Trigger Price, executes up to Limit Price.',
  'SL-M': 'Stop-Loss Market: Triggers at Trigger Price and fills at Market.',
};

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

function statusBadgeStyle(status: string): { bg: string; color: string; border: string } {
  const s = status.toLowerCase();
  if (s === 'complete' || s === 'executed') {
    return {
      bg: 'rgba(0,214,143,0.14)',
      color: '#00d68f',
      border: 'rgba(0,214,143,0.28)',
    };
  }
  if (s.includes('reject') || s.includes('cancel')) {
    return {
      bg: 'rgba(255,77,106,0.14)',
      color: '#ff4d6a',
      border: 'rgba(255,77,106,0.28)',
    };
  }
  return {
    bg: 'rgba(251,191,36,0.14)',
    color: '#fbbf24',
    border: 'rgba(251,191,36,0.28)',
  };
}

function productLabel(code: string): string {
  if (code === 'I') return 'MIS';
  if (code === 'D') return 'CNC';
  return code;
}

function LiveTradeContent() {
  const { session } = useAuth();
  const searchParams = useSearchParams();

  // Mode & Token State
  const [mode, setMode] = useState<TradingMode>('live');
  const [sandboxToken, setSandboxToken] = useState<string>('');
  const [sandboxTokenInput, setSandboxTokenInput] = useState<string>('');
  const [sandboxOrders, setSandboxOrders] = useState<SandboxLogEntry[]>([]);
  const [sandboxSavedNotice, setSandboxSavedNotice] = useState(false);

  // Live Account Portfolio State
  const [connected, setConnected] = useState<boolean>(false);
  const [tradingConnected, setTradingConnected] = useState<boolean>(false);
  const [analyticsConnected, setAnalyticsConnected] = useState<boolean>(false);
  const [loadingAccount, setLoadingAccount] = useState<boolean>(true);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [requestingApproval, setRequestingApproval] = useState<boolean>(false);
  const [pollingApproval, setPollingApproval] = useState<boolean>(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
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

  const marketOpen = isMarketOpenNow();

  const authHeaders = useCallback((): Record<string, string> => {
    const activeClientTok = getActiveClientUpstoxToken();
    const h: Record<string, string> = {};
    if (session?.access_token) {
      h['Authorization'] = `Bearer ${session.access_token}`;
    }
    if (activeClientTok) {
      h['X-Upstox-Token'] = activeClientTok;
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
    if (!isMarketOpenNow()) {
      setIsAmo(true);
    }
  }, []);

  // Fetch live quote for selected symbol
  const fetchSymbolQuote = useCallback(async (sym: string) => {
    if (!sym) return;
    setLoadingQuote(true);
    try {
      const activeClientTok = getActiveClientUpstoxToken();
      const headers: Record<string, string> = {};
      if (activeClientTok) {
        headers['X-Upstox-Token'] = activeClientTok;
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

  // Fetch Upstox Account Portfolio + Status (Holdings, Positions, Orders, Trades, Funds, Static IP)
  const fetchAccount = useCallback(async () => {
    if (!session?.access_token) return;
    setLoadingAccount(true);
    setAccountError(null);
    try {
      const [res, statusRes] = await Promise.all([
        fetch('/api/upstox/portfolio', { headers: authHeaders(), cache: 'no-store' }),
        fetch('/api/upstox-status', { cache: 'no-store' }).catch(() => null),
      ]);

      const statusData = statusRes ? await statusRes.json().catch(() => null) : null;
      if (statusData) {
        setTradingConnected(Boolean(statusData.tradingConnected ?? statusData.trading?.connected));
        setAnalyticsConnected(Boolean(statusData.analyticsConnected ?? statusData.analytics?.connected));
      }

      const data = await res.json();
      if (!res.ok || !data.connected) {
        setConnected(false);
        setAccountError(data.error || 'Upstox not connected');
      } else {
        setConnected(true);
        if (data.tokenKind === 'trading') setTradingConnected(true);
        if (data.analyticsActive) setAnalyticsConnected(true);
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

  const stopApprovalPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPollingApproval(false);
  }, []);

  useEffect(() => {
    return () => stopApprovalPoll();
  }, [stopApprovalPoll]);

  const handleRequestPhoneApproval = async () => {
    if (!session?.access_token) return;
    setRequestingApproval(true);
    setOrderFeedback(null);
    stopApprovalPoll();

    try {
      const res = await fetch('/api/broker/request-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setOrderFeedback({
          type: 'error',
          message: data.error || 'Could not send phone approval request',
          hint: data.hint,
        });
        return;
      }

      const reqTimeMs = Date.parse(data?.pendingRequest?.requestedAt || '') || Date.now();
      setOrderFeedback({
        type: data.notifierMismatch ? 'error' : 'success',
        message: data.notifierMismatch
          ? 'Prompt sent, but Upstox Notifier Webhook URL is missing or mismatched!'
          : 'WhatsApp & Upstox App notification sent — tap Approve on your phone.',
        hint: data.warning || 'Checking automatically every 3 seconds...',
      });
      setPollingApproval(true);

      let attempts = 0;
      pollTimerRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const stRes = await fetch('/api/upstox-status', { cache: 'no-store' });
          const st = await stRes.json();
          if (st?.tradingConnected || st?.trading?.connected) {
            stopApprovalPoll();
            setTradingConnected(true);
            setOrderFeedback({
              type: 'success',
              message: 'Approved! Daily Live Trading session is now active until 3:30 AM IST.',
            });
            fetchAccount();
          } else if (st?.pendingRequest?.status === 'rejected') {
            stopApprovalPoll();
            setOrderFeedback({ type: 'error', message: 'Approval request was rejected on phone.' });
          } else if (
            st?.lastWebhookEvent?.error &&
            Date.parse(st.lastWebhookEvent.receivedAt) >= reqTimeMs - 2000
          ) {
            stopApprovalPoll();
            setOrderFeedback({
              type: 'error',
              message: `Webhook delivery error (${st.lastWebhookEvent.outcome})`,
              hint: st.lastWebhookEvent.error,
            });
          } else if (attempts >= 100) {
            stopApprovalPoll();
            setOrderFeedback({
              type: 'error',
              message: 'Timed out waiting for Upstox webhook callback.',
              hint: 'Check Upstox Mobile App → Notifications or verify Notifier Webhook Endpoint in Broker Settings.',
            });
          }
        } catch {}
      }, 3000);
    } catch (err: any) {
      setOrderFeedback({ type: 'error', message: err?.message || 'Failed to trigger phone approval' });
    } finally {
      setRequestingApproval(false);
    }
  };

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
        if (mode === 'sandbox') {
          setSandboxOrders((prev) => {
            const next = prev.map((o) => (o.orderId === orderId ? { ...o, status: 'cancelled' } : o));
            try {
              localStorage.setItem(SANDBOX_LOG_KEY, JSON.stringify(next));
            } catch {}
            return next;
          });
        } else {
          fetchAccount();
        }
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
    setSandboxSavedNotice(true);
    setTimeout(() => setSandboxSavedNotice(false), 2500);
  };

  const clearSandboxLog = () => {
    setSandboxOrders([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SANDBOX_LOG_KEY);
    }
  };

  const qtyNum = Math.max(0, Math.floor(Number(quantity) || 0));
  const estOrderValue = effectivePrice * qtyNum;
  const totalFees = charges?.charges.total || 0;
  const netOrderTotal = side === 'BUY' ? estOrderValue + totalFees : Math.max(0, estOrderValue - totalFees);
  const maxAffordableQty =
    funds?.available && funds.availableMargin > 0 && effectivePrice > 0
      ? Math.floor(funds.availableMargin / effectivePrice)
      : 0;

  // Check if selected symbol is currently held in Demat for helpful SELL hint
  const matchingHolding = useMemo(
    () => holdings.find((h) => h.symbol.toUpperCase() === selectedSymbol.toUpperCase()),
    [holdings, selectedSymbol]
  );

  // Quick stock chips: prioritize user's holdings first, then popular NSE stocks
  const quickPickSymbols = useMemo(() => {
    const heldSyms = holdings.slice(0, 4).map((h) => h.symbol.toUpperCase());
    const merged = [...heldSyms];
    for (const s of POPULAR_STOCKS) {
      if (!merged.includes(s) && merged.length < 6) merged.push(s);
    }
    return merged;
  }, [holdings]);

  const filteredHoldings = holdings.filter(
    (h) =>
      !tableSearch ||
      h.symbol.toLowerCase().includes(tableSearch.toLowerCase()) ||
      h.companyName.toLowerCase().includes(tableSearch.toLowerCase())
  );
  const filteredPositions = positions.filter(
    (p) => !tableSearch || p.symbol.toLowerCase().includes(tableSearch.toLowerCase())
  );
  const filteredOrders = orders.filter(
    (o) =>
      !tableSearch ||
      o.symbol.toLowerCase().includes(tableSearch.toLowerCase()) ||
      o.status.toLowerCase().includes(tableSearch.toLowerCase())
  );
  const filteredTrades = trades.filter(
    (t) => !tableSearch || t.symbol.toLowerCase().includes(tableSearch.toLowerCase())
  );

  const totalPosPnl = (summary?.positionsUnrealised || 0) + (summary?.positionsRealised || 0);
  const marginExceeded =
    mode === 'live' &&
    side === 'BUY' &&
    funds?.available &&
    netOrderTotal > funds.availableMargin &&
    estOrderValue > 0;

  const canPlaceLiveOrder = connected && tradingConnected;

  const isSubmitDisabled =
    !selectedSymbol ||
    qtyNum <= 0 ||
    ((orderType === 'LIMIT' || orderType === 'SL') && !(parseFloat(limitPrice) > 0)) ||
    ((orderType === 'SL' || orderType === 'SL-M') && !(parseFloat(triggerPrice) > 0)) ||
    (mode === 'live' && !canPlaceLiveOrder) ||
    (mode === 'sandbox' && !sandboxToken);

  const disabledReason = useMemo(() => {
    if (mode === 'live' && !canPlaceLiveOrder) {
      return analyticsConnected
        ? '1-Year Analytics active (read-only) — tap 1-Tap Phone Approve above or switch to Sandbox to place orders'
        : 'Tap 1-Tap Phone Approve, connect on Broker API, or switch to Sandbox mode';
    }
    if (mode === 'sandbox' && !sandboxToken) return 'Paste & save your Sandbox token above to place test orders';
    if (!selectedSymbol) return 'Select an NSE stock above to review and place an order';
    if (qtyNum <= 0) return 'Enter quantity of at least 1 share';
    if ((orderType === 'LIMIT' || orderType === 'SL') && !(parseFloat(limitPrice) > 0)) {
      return 'Enter a valid Limit Price';
    }
    if ((orderType === 'SL' || orderType === 'SL-M') && !(parseFloat(triggerPrice) > 0)) {
      return 'Enter a valid Stop-Loss Trigger Price';
    }
    return null;
  }, [mode, canPlaceLiveOrder, analyticsConnected, sandboxToken, selectedSymbol, qtyNum, orderType, limitPrice, triggerPrice]);

  return (
    <div className="animate-fade-in" style={{ width: '100%', maxWidth: '100%', paddingBottom: '48px' }}>
      {/* ─── Header Row (Left Title + Right Mode/Sync Controls) ─── */}
      <div className="trade-header-bar mb-6">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              ⚡ Live Trade &amp; Upstox Portfolio
            </h1>
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full"
              style={{
                background: mode === 'live' ? 'rgba(255,77,106,0.14)' : 'rgba(245,158,11,0.14)',
                color: mode === 'live' ? '#ff4d6a' : '#fbbf24',
                border: `1px solid ${mode === 'live' ? 'rgba(255,77,106,0.32)' : 'rgba(245,158,11,0.32)'}`,
              }}
            >
              {mode === 'live' ? '🔴 Live Orders' : '🛡️ Sandbox Test'}
            </span>
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-3 py-1 rounded-full"
              style={{
                background: marketOpen ? 'rgba(0,214,143,0.12)' : 'rgba(148,163,184,0.1)',
                color: marketOpen ? '#00d68f' : 'var(--text-secondary)',
                border: `1px solid ${marketOpen ? 'rgba(0,214,143,0.25)' : 'var(--border-color)'}`,
              }}
            >
              <Clock size={10} />
              {marketOpen ? 'Market Open' : 'Market Closed · AMO'}
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Place real or sandbox NSE/BSE equity orders via Upstox and manage live Demat Holdings, Positions &amp; Order Book
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
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5"
              style={{
                background: mode === 'live' ? 'rgba(255,77,106,0.18)' : 'transparent',
                color: mode === 'live' ? '#ff4d6a' : 'var(--text-muted)',
              }}
            >
              <Zap size={12} />
              <span>Live Account</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('sandbox')}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5"
              style={{
                background: mode === 'sandbox' ? 'rgba(245,158,11,0.18)' : 'transparent',
                color: mode === 'sandbox' ? '#fbbf24' : 'var(--text-muted)',
              }}
            >
              <ShieldCheck size={12} />
              <span>Sandbox Test</span>
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
              border: '1px solid rgba(59,130,246,0.35)',
            }}
          >
            <RefreshCw size={13} className={loadingAccount ? 'animate-spin' : ''} />
            <span>Sync Upstox</span>
          </button>
        </div>
      </div>

      {/* ─── Connection & Compliance Banners ─── */}
      {mode === 'live' && (!connected || !tradingConnected) && !loadingAccount && (
        <div
          className="glass-card-static p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          style={{
            marginBottom: '20px',
            background: analyticsConnected
              ? 'linear-gradient(135deg, rgba(139,92,246,0.09), rgba(59,130,246,0.04))'
              : 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.03))',
            border: `1px solid ${analyticsConnected ? 'rgba(139,92,246,0.3)' : 'rgba(245,158,11,0.28)'}`,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-xl shrink-0"
              style={{ background: analyticsConnected ? 'rgba(139,92,246,0.14)' : 'rgba(245,158,11,0.14)' }}
            >
              <AlertTriangle size={18} style={{ color: analyticsConnected ? '#c4b5fd' : '#fbbf24' }} />
            </div>
            <div>
              <p className="font-bold text-white text-sm">
                {analyticsConnected
                  ? '1-Year Analytics Active (Read-Only) · Daily Trading Approval Needed'
                  : 'Upstox Live Trading Not Connected'}
              </p>
              <p className="mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {accountError ||
                  (analyticsConnected
                    ? 'Market quotes & charts are live. Tap Approve on WhatsApp/Upstox App once today to place BUY/SELL orders.'
                    : 'Approve via WhatsApp/Upstox App in 1 tap, connect on Broker API, or test orders risk-free in Sandbox mode.')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRequestPhoneApproval}
              disabled={requestingApproval || pollingApproval}
              className="px-3.5 py-2 rounded-xl font-bold text-white cursor-pointer transition-all hover:brightness-110 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              {requestingApproval
                ? 'Sending...'
                : pollingApproval
                  ? '⏳ Waiting for Phone Tap...'
                  : '📱 1-Tap Phone Approve'}
            </button>
            <button
              type="button"
              onClick={() => setMode('sandbox')}
              className="px-3.5 py-2 rounded-xl font-bold cursor-pointer transition-all hover:brightness-110"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}
            >
              Try Sandbox
            </button>
            <Link
              href="/broker"
              className="px-4 py-2 rounded-xl font-bold text-white text-center transition-all hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
            >
              Broker Settings →
            </Link>
          </div>
        </div>
      )}

      {mode === 'live' && connected && staticIp && !staticIp.configured && (
        <div
          className="glass-card-static p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          style={{
            marginBottom: '20px',
            background: 'linear-gradient(135deg, rgba(245,158,11,0.07), rgba(245,158,11,0.02))',
            border: '1px solid rgba(245,158,11,0.25)',
          }}
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl shrink-0" style={{ background: 'rgba(245,158,11,0.12)' }}>
              <ShieldAlert size={16} style={{ color: '#fbbf24' }} />
            </div>
            <div>
              <p className="font-bold text-amber-300 text-sm">Static IP Required for Live Orders</p>
              <p className="mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Your Holdings, Margin &amp; Order Book sync normally, but Upstox requires a whitelisted Static IP under{' '}
                <a
                  href="https://account.upstox.com/developer/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-blue-400 hover:text-blue-300"
                >
                  Upstox Developer Apps → Algo Trading
                </a>{' '}
                to submit live buy/sell orders. Use <strong>Sandbox Test</strong> mode anytime to test orders risk-free.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMode('sandbox')}
            className="px-4 py-2 rounded-xl font-bold shrink-0 cursor-pointer transition-all hover:brightness-110"
            style={{ background: 'rgba(245,158,11,0.16)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}
          >
            Switch to Sandbox
          </button>
        </div>
      )}

      {mode === 'live' && connected && staticIp?.configured && (
        <div
          className="rounded-xl px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
          style={{
            marginBottom: '20px',
            background: 'linear-gradient(135deg, rgba(0,214,143,0.08), rgba(59,130,246,0.05))',
            border: '1px solid rgba(0,214,143,0.25)',
          }}
        >
          <div className="flex items-center gap-2 text-emerald-300">
            <ShieldCheck size={15} className="shrink-0" />
            <span>
              <strong>{profile?.userName || profile?.userId || 'Upstox Live'}</strong> connected · Static IP Ready (
              <code className="text-emerald-200">{staticIp.primaryIp || staticIp.secondaryIp}</code>)
            </span>
          </div>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            POA / DDPI: {profile?.poa ? 'Enabled (Instant CNC Sell)' : 'Standard (TPIN / EDIS needed on CNC Sell)'}
          </span>
        </div>
      )}

      {/* Sandbox Token Config Box */}
      {mode === 'sandbox' && (
        <div
          className="glass-card-static p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
          style={{
            marginBottom: '20px',
            background: 'linear-gradient(135deg, rgba(245,158,11,0.07), rgba(245,158,11,0.02))',
            border: '1px solid rgba(245,158,11,0.25)',
          }}
        >
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-amber-300 text-sm">Sandbox Practice Mode (No Real Money)</p>
              {sandboxToken ? (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(0,214,143,0.14)', color: '#00d68f' }}
                >
                  Token Active ✓
                </span>
              ) : (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(245,158,11,0.16)', color: '#fbbf24' }}
                >
                  Paste Token to Test
                </span>
              )}
            </div>
            <p className="mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Orders go to <code className="text-amber-200 px-1 py-0.5 rounded bg-slate-900">sandbox.upstox.com</code> — zero real money or Static IP needed.
              Generate a token from Upstox Developer Console → <strong>Sandbox</strong> tab.
            </p>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <input
              type="password"
              value={sandboxTokenInput}
              onChange={(e) => setSandboxTokenInput(e.target.value)}
              placeholder="Paste Sandbox access token..."
              className="trade-token-input px-3 py-2 rounded-xl text-xs bg-slate-900 border border-slate-700 text-white outline-none"
            />
            <button
              type="button"
              onClick={saveSandboxTok}
              className="px-4 py-2 rounded-xl font-bold cursor-pointer shrink-0 transition-all hover:brightness-110"
              style={{ background: '#fbbf24', color: '#000' }}
            >
              {sandboxSavedNotice ? 'Saved ✓' : 'Save Token'}
            </button>
          </div>
        </div>
      )}

      {/* Order Execution Feedback Toast */}
      {orderFeedback && (
        <div
          className="p-4 rounded-2xl flex items-start justify-between gap-3 text-xs animate-fade-in-up"
          style={{
            marginBottom: '20px',
            background: orderFeedback.type === 'success' ? 'rgba(0,214,143,0.12)' : 'rgba(255,77,106,0.12)',
            border: `1px solid ${orderFeedback.type === 'success' ? 'rgba(0,214,143,0.35)' : 'rgba(255,77,106,0.35)'}`,
          }}
        >
          <div className="flex items-start gap-2.5">
            {orderFeedback.type === 'success' ? (
              <CheckCircle2 size={17} style={{ color: '#00d68f', flexShrink: 0, marginTop: 1 }} />
            ) : (
              <XCircle size={17} style={{ color: '#ff4d6a', flexShrink: 0, marginTop: 1 }} />
            )}
            <div>
              <p className="font-bold text-white text-sm">{orderFeedback.message}</p>
              {orderFeedback.hint && <p className="mt-1 text-slate-300 leading-relaxed">{orderFeedback.hint}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOrderFeedback(null)}
            className="text-slate-400 hover:text-white cursor-pointer px-1.5 py-0.5 rounded"
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── Account Summary KPIs (Matches Portfolio & Dashboard Cards) ─── */}
      <div className="trade-kpi-grid mb-6">
        <div className="glass-card-static rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Available Margin
            </span>
            <Wallet size={15} style={{ color: '#60a5fa' }} />
          </div>
          <div className="mt-2">
            {funds?.available ? (
              <>
                <p className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  ₹{fmtInr(funds.availableMargin)}
                </p>
                <p className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Used Margin: ₹{fmtInr(funds.usedMargin)}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-amber-400 mt-1">
                  {connected ? 'Settlement Window' : '—'}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {connected ? (funds?.notice || 'Available 5:30 AM – 12:00 AM IST') : 'Connect Upstox to view cash'}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="glass-card-static rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Demat Holdings
            </span>
            <Briefcase size={15} style={{ color: '#a78bfa' }} />
          </div>
          <div className="mt-2">
            <p className="text-xl sm:text-2xl font-black text-white tracking-tight">
              ₹{fmtInr(summary?.totalCurrentValue || 0)}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span
                className="text-[11px] font-bold"
                style={{ color: (summary?.totalHoldingsPnl || 0) >= 0 ? '#00d68f' : '#ff4d6a' }}
              >
                {(summary?.totalHoldingsPnl || 0) >= 0 ? '+' : ''}₹{fmtInr(summary?.totalHoldingsPnl || 0)} (
                {summary?.totalHoldingsPnlPercent || 0}%)
              </span>
            </div>
          </div>
        </div>

        <div className="glass-card-static rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Day Positions P&amp;L
            </span>
            <Activity size={15} style={{ color: totalPosPnl >= 0 ? '#00d68f' : '#ff4d6a' }} />
          </div>
          <div className="mt-2">
            <p
              className="text-xl sm:text-2xl font-black tracking-tight"
              style={{ color: totalPosPnl >= 0 ? '#00d68f' : '#ff4d6a' }}
            >
              {totalPosPnl >= 0 ? '+' : ''}₹{fmtInr(totalPosPnl)}
            </p>
            <p className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Open Positions: {summary?.openPositionsCount || 0}
            </p>
          </div>
        </div>

        <div className="glass-card-static rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Orders &amp; Trades
            </span>
            <FileCheck2 size={15} style={{ color: '#fbbf24' }} />
          </div>
          <div className="mt-2">
            <p className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {orders.length} {orders.length === 1 ? 'Order' : 'Orders'}
            </p>
            <p className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Open: {summary?.openOrdersCount || 0} · Executed: {trades.length}
            </p>
          </div>
        </div>
      </div>

      {/* ─── Main 2-Column Workspace: Portfolio Book (Left) + Order Ticket (Right) ─── */}
      <div className="trade-workspace-grid">
        {/* LEFT COLUMN: Holdings / Positions / Orders / Trades */}
        <div className="min-w-0 space-y-4">
          <div
            className="glass-card-static rounded-2xl overflow-hidden shadow-xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
          >
            {/* Card Header: Tabs + Search */}
            <div
              className="p-4 trade-card-header"
              style={{ borderBottom: '1px solid var(--border-color)' }}
            >
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {(
                  [
                    { id: 'holdings', label: 'Holdings', count: holdings.length },
                    { id: 'positions', label: 'Positions', count: positions.length },
                    { id: 'orders', label: 'Orders', count: orders.length },
                    { id: 'trades', label: 'Trades', count: trades.length },
                    ...(mode === 'sandbox'
                      ? [{ id: 'sandboxLog' as const, label: 'Sandbox Log', count: sandboxOrders.length }]
                      : []),
                  ] as { id: AccountTab; label: string; count: number }[]
                ).map((t) => {
                  const active = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveTab(t.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 cursor-pointer transition-all flex items-center gap-1.5"
                      style={{
                        background: active ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)',
                        color: active ? '#60a5fa' : 'var(--text-muted)',
                        border: `1px solid ${active ? 'rgba(59,130,246,0.35)' : 'var(--border-subtle)'}`,
                      }}
                    >
                      <span>{t.label}</span>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded font-semibold"
                        style={{
                          background: active ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)',
                          color: active ? '#93c5fd' : 'var(--text-secondary)',
                        }}
                      >
                        {t.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                className="trade-search-box flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}
              >
                <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Filter symbol..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="bg-transparent outline-none w-full text-white text-xs"
                />
                {tableSearch && (
                  <button
                    type="button"
                    onClick={() => setTableSearch('')}
                    className="text-slate-400 hover:text-white cursor-pointer text-[11px]"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Holdings Quick Totals Strip */}
            {activeTab === 'holdings' && holdings.length > 0 && summary && (
              <div
                className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-[11px]"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <div className="flex flex-wrap items-center gap-4">
                  <span style={{ color: 'var(--text-muted)' }}>
                    Invested: <strong className="text-white">₹{fmtInr(summary.totalInvested || 0)}</strong>
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Current: <strong className="text-white">₹{fmtInr(summary.totalCurrentValue || 0)}</strong>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <span style={{ color: 'var(--text-muted)' }}>
                    Day P&amp;L:{' '}
                    <strong style={{ color: (summary.totalHoldingsDayPnl || 0) >= 0 ? '#00d68f' : '#ff4d6a' }}>
                      {(summary.totalHoldingsDayPnl || 0) >= 0 ? '+' : ''}₹{fmtInr(summary.totalHoldingsDayPnl || 0)}
                    </strong>
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Click <strong>+Buy</strong> or <strong>Sell</strong> on any row to pre-fill the order ticket
                  </span>
                </div>
              </div>
            )}

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
                        <th className="px-4 py-3 text-right font-semibold uppercase text-[10px]">Quick Trade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHoldings.map((h) => (
                        <tr
                          key={h.isin + h.symbol}
                          className="border-b"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <td className="px-4 py-3">
                            <Link href={`/stock/${h.symbol}`} className="font-bold text-blue-400 hover:underline">
                              {h.symbol}
                            </Link>
                            <p className="text-[10px] truncate max-w-[170px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              {h.companyName}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-white">
                            {h.totalQuantity}
                            {h.t1Quantity > 0 && (
                              <span
                                className="text-[9px] text-amber-400 block"
                                title="T1 shares are pending settlement in Demat"
                              >
                                ({h.t1Quantity} T1)
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-300">₹{fmtInr(h.averagePrice)}</td>
                          <td className="px-3 py-3 text-right">
                            <span className="font-bold text-white">₹{fmtInr(h.lastPrice)}</span>
                            <span
                              className="block text-[10px] font-semibold"
                              style={{ color: h.dayChangePercent >= 0 ? '#00d68f' : '#ff4d6a' }}
                            >
                              {h.dayChangePercent >= 0 ? '+' : ''}{h.dayChangePercent.toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="font-bold" style={{ color: h.pnl >= 0 ? '#00d68f' : '#ff4d6a' }}>
                              {h.pnl >= 0 ? '+' : ''}₹{fmtInr(h.pnl)}
                            </span>
                            <span
                              className="block text-[10px]"
                              style={{ color: h.pnl >= 0 ? '#00d68f' : '#ff4d6a' }}
                            >
                              {h.pnlPercent >= 0 ? '+' : ''}{h.pnlPercent.toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => selectStockForOrder(h.symbol, h.companyName, 'BUY', 1)}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all hover:brightness-125"
                                style={{
                                  background: 'rgba(0,214,143,0.14)',
                                  color: '#00d68f',
                                  border: '1px solid rgba(0,214,143,0.25)',
                                }}
                              >
                                +Buy
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  selectStockForOrder(h.symbol, h.companyName, 'SELL', h.quantity || h.totalQuantity)
                                }
                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all hover:brightness-125"
                                style={{
                                  background: 'rgba(255,77,106,0.14)',
                                  color: '#ff4d6a',
                                  border: '1px solid rgba(255,77,106,0.25)',
                                }}
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
                  <p className="text-3xl mb-2">💼</p>
                  <p className="font-bold text-white text-sm">
                    {tableSearch ? `No holdings matching "${tableSearch}"` : 'No Long-Term Demat Holdings Found'}
                  </p>
                  <p className="mt-1 max-w-sm mx-auto leading-relaxed">
                    {connected
                      ? 'Settled CNC holdings in your Upstox Demat account appear here automatically.'
                      : 'Connect your Upstox account on Broker API or test placing an order in Sandbox mode.'}
                  </p>
                </div>
              )
            )}

            {/* TAB 2: OPEN / DAY POSITIONS */}
            {activeTab === 'positions' && (
              <div>
                {positions.some((p) => p.quantity !== 0) && mode === 'live' && (
                  <div
                    className="px-4 py-3 border-b flex items-center justify-between gap-3"
                    style={{ borderColor: 'var(--border-color)', background: 'rgba(255,255,255,0.02)' }}
                  >
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {positions.filter((p) => p.quantity !== 0).length} active open position(s)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowExitAllConfirm(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all hover:brightness-110"
                      style={{
                        background: 'rgba(255,77,106,0.14)',
                        color: '#ff4d6a',
                        border: '1px solid rgba(255,77,106,0.3)',
                      }}
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
                                {productLabel(p.product)}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right font-bold text-white">{p.quantity}</td>
                            <td className="px-3 py-3 text-right text-slate-300">₹{fmtInr(p.averagePrice || p.buyPrice)}</td>
                            <td className="px-3 py-3 text-right text-white">₹{fmtInr(p.lastPrice)}</td>
                            <td className="px-3 py-3 text-right font-bold" style={{ color: p.pnl >= 0 ? '#00d68f' : '#ff4d6a' }}>
                              {p.pnl >= 0 ? '+' : ''}₹{fmtInr(p.pnl)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {p.quantity !== 0 ? (
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
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer"
                                  style={{
                                    background: 'rgba(255,77,106,0.14)',
                                    color: '#ff4d6a',
                                    border: '1px solid rgba(255,77,106,0.25)',
                                  }}
                                >
                                  Exit
                                </button>
                              ) : (
                                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Closed</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    <p className="text-3xl mb-2">⚡</p>
                    <p className="font-bold text-white text-sm">No Open or Day Positions</p>
                    <p className="mt-1 max-w-sm mx-auto leading-relaxed">
                      Intraday (MIS) and same-day positions placed via Upstox appear here in real time.
                    </p>
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
                              <div className="flex items-center gap-1.5 flex-wrap">
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
                                  {o.orderType} · {productLabel(o.product)} {o.isAmo ? '· AMO' : ''}
                                </span>
                              </div>
                              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                {o.orderTimestamp} · #{o.orderId}
                              </p>
                              {o.statusMessage && (
                                <p className="text-[10px] mt-0.5 text-amber-300">{o.statusMessage}</p>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right font-bold text-white">
                              {o.filledQuantity}/{o.quantity}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-200">
                              ₹{fmtInr(o.averagePrice > 0 ? o.averagePrice : o.price)}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span
                                className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase inline-block"
                                style={{
                                  background: badge.bg,
                                  color: badge.color,
                                  border: `1px solid ${badge.border}`,
                                }}
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
                                    className="p-1.5 rounded-lg bg-slate-800 text-blue-400 hover:brightness-125 cursor-pointer"
                                    title="Modify order"
                                  >
                                    <Edit3 size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCancelOrder(o.orderId)}
                                    className="p-1.5 rounded-lg bg-rose-500/15 text-rose-400 hover:brightness-125 cursor-pointer"
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
                  <p className="text-3xl mb-2">📋</p>
                  <p className="font-bold text-white text-sm">No Orders Placed Today</p>
                  <p className="mt-1 max-w-sm mx-auto leading-relaxed">
                    Use the Buy / Sell Order Ticket on the right to place an order or test in Sandbox mode.
                  </p>
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
                          <td className="px-3 py-3 text-center">
                            <span
                              className="text-[10px] font-black px-2 py-0.5 rounded"
                              style={{
                                background: t.transactionType === 'BUY' ? 'rgba(0,214,143,0.14)' : 'rgba(255,77,106,0.14)',
                                color: t.transactionType === 'BUY' ? '#00d68f' : '#ff4d6a',
                              }}
                            >
                              {t.transactionType}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-white">{t.quantity}</td>
                          <td className="px-3 py-3 text-right font-bold text-white">₹{fmtInr(t.averagePrice)}</td>
                          <td className="px-4 py-3 text-right text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {t.exchangeTimestamp}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                  <p className="text-3xl mb-2">✅</p>
                  <p className="font-bold text-white text-sm">No Executed Trades Today</p>
                  <p className="mt-1">Completed order fills for today appear here automatically.</p>
                </div>
              )
            )}

            {/* TAB 5: SANDBOX ORDER LOG */}
            {activeTab === 'sandboxLog' && (
              <div>
                {sandboxOrders.length > 0 && (
                  <div
                    className="px-4 py-2.5 border-b flex items-center justify-between text-xs"
                    style={{ borderColor: 'var(--border-color)', background: 'rgba(255,255,255,0.02)' }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {sandboxOrders.length} simulated sandbox order(s)
                    </span>
                    <button
                      type="button"
                      onClick={clearSandboxLog}
                      className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                    >
                      Clear Local Log
                    </button>
                  </div>
                )}
                {sandboxOrders.length > 0 ? (
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
                              <span
                                className="font-bold"
                                style={{ color: o.transactionType === 'BUY' ? '#00d68f' : '#ff4d6a' }}
                              >
                                {o.transactionType}
                              </span>{' '}
                              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                ({o.orderType} · {productLabel(o.product)} · {o.timestamp})
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right font-bold text-white">{o.quantity}</td>
                            <td className="px-3 py-3 text-right text-slate-300">₹{fmtInr(o.price)}</td>
                            <td className="px-4 py-3 text-right">
                              {o.status === 'cancelled' ? (
                                <span className="text-[10px] text-rose-400 font-bold uppercase">Cancelled</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleCancelOrder(o.orderId)}
                                  className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-400 text-[10px] font-bold cursor-pointer"
                                >
                                  Cancel
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
                    <p className="text-3xl mb-2">🛡️</p>
                    <p className="font-bold text-white text-sm">No Sandbox Orders Yet</p>
                    <p className="mt-1">Place a test order using the ticket on the right to see Upstox Sandbox responses here.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: STICKY BUY / SELL ORDER TICKET */}
        <div className="trade-ticket-sticky min-w-0">
          <div
            className="glass-card-static rounded-2xl p-5 shadow-2xl space-y-4"
            style={{
              background: 'var(--bg-card)',
              border: `1px solid ${side === 'BUY' ? 'rgba(0,214,143,0.32)' : 'rgba(255,77,106,0.32)'}`,
            }}
          >
            {/* Ticket Title */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Zap size={13} style={{ color: side === 'BUY' ? '#00d68f' : '#ff4d6a' }} />
                Order Ticket
              </span>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: mode === 'live' ? 'rgba(255,77,106,0.14)' : 'rgba(245,158,11,0.14)',
                  color: mode === 'live' ? '#ff4d6a' : '#fbbf24',
                }}
              >
                {mode === 'live' ? 'LIVE NSE/BSE' : 'SANDBOX'}
              </span>
            </div>

            {/* BUY / SELL Segmented Switch */}
            <div className="grid grid-cols-2 rounded-xl overflow-hidden p-1 gap-1" style={{ background: 'var(--bg-primary)' }}>
              <button
                type="button"
                onClick={() => setSide('BUY')}
                className="py-2 rounded-lg text-xs font-black tracking-wide cursor-pointer transition-all flex items-center justify-center gap-1.5"
                style={{
                  background: side === 'BUY' ? 'linear-gradient(135deg, #00d68f, #10b981)' : 'transparent',
                  color: side === 'BUY' ? '#000' : 'var(--text-muted)',
                }}
              >
                <TrendingUp size={13} />
                <span>BUY</span>
              </button>
              <button
                type="button"
                onClick={() => setSide('SELL')}
                className="py-2 rounded-lg text-xs font-black tracking-wide cursor-pointer transition-all flex items-center justify-center gap-1.5"
                style={{
                  background: side === 'SELL' ? 'linear-gradient(135deg, #ff4d6a, #f43f5e)' : 'transparent',
                  color: side === 'SELL' ? '#fff' : 'var(--text-muted)',
                }}
              >
                <TrendingDown size={13} />
                <span>SELL</span>
              </button>
            </div>

            {/* Symbol Search + Quick Picks */}
            <div className="relative" ref={dropdownRef}>
              <label className="text-[10px] uppercase font-bold tracking-wider block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Select NSE Stock
              </label>
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}
              >
                <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
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
                      setSelectedName('');
                      setQuote(null);
                    }}
                    className="text-xs text-slate-400 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* 1-Click Quick Stock Pills */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {quickPickSymbols.map((sym) => {
                  const isSelected = selectedSymbol === sym;
                  return (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => selectStockForOrder(sym)}
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition-all hover:brightness-125"
                      style={{
                        background: isSelected ? 'rgba(59,130,246,0.22)' : 'rgba(255,255,255,0.04)',
                        color: isSelected ? '#60a5fa' : 'var(--text-secondary)',
                        border: `1px solid ${isSelected ? 'rgba(59,130,246,0.4)' : 'var(--border-subtle)'}`,
                      }}
                    >
                      {sym}
                    </button>
                  );
                })}
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
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-800 flex items-center justify-between text-xs cursor-pointer border-b border-slate-800/70"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-blue-400">{s.symbol}</span>
                        <span className="ml-2 text-slate-300 truncate">{s.name}</span>
                      </div>
                      <span className="text-[9px] uppercase text-slate-500 shrink-0 ml-2">{s.sector}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Live Quote Card */}
            {selectedSymbol && (
              <div
                className="rounded-xl p-3 space-y-2"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-white">{selectedSymbol}</span>
                      <Link
                        href={`/stock/${selectedSymbol}`}
                        className="text-[10px] text-blue-400 hover:underline inline-flex items-center gap-0.5"
                      >
                        Chart <ExternalLink size={9} />
                      </Link>
                    </div>
                    <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                      {selectedName}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {loadingQuote ? (
                      <span className="text-xs text-slate-400 animate-pulse">Fetching LTP...</span>
                    ) : quote ? (
                      <>
                        <p className="text-base font-black text-white">₹{fmtInr(quote.price)}</p>
                        <p
                          className="text-[10px] font-bold"
                          style={{ color: quote.changePercent >= 0 ? '#00d68f' : '#ff4d6a' }}
                        >
                          {quote.change >= 0 ? '+' : ''}₹{fmtInr(quote.change)} ({quote.changePercent >= 0 ? '+' : ''}
                          {quote.changePercent.toFixed(2)}%)
                        </p>
                      </>
                    ) : (
                      <span className="text-xs text-rose-400">Quote unavailable</span>
                    )}
                  </div>
                </div>

                {quote && (
                  <div
                    className="flex items-center justify-between text-[10px] pt-2"
                    style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
                  >
                    <span>Prev: ₹{fmtInr(quote.open)}</span>
                    <span>Low: ₹{fmtInr(quote.low)}</span>
                    <span>High: ₹{fmtInr(quote.high)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Product Type */}
            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Product Type
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
              <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <Info size={10} className="shrink-0" />
                <span>{PRODUCT_HINTS[product]}</span>
              </p>
            </div>

            {/* Order Type */}
            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Order Execution Type
              </label>
              <div className="trade-ordertype-grid">
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
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                {ORDER_TYPE_HINTS[orderType]}
              </p>
            </div>

            {/* Quantity + Price Inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>
                    Quantity
                  </label>
                  {side === 'BUY' && maxAffordableQty > 0 && (
                    <button
                      type="button"
                      onClick={() => setQuantity(String(maxAffordableQty))}
                      className="text-[10px] text-blue-400 hover:underline cursor-pointer font-semibold"
                    >
                      Max: {maxAffordableQty}
                    </button>
                  )}
                  {side === 'SELL' && matchingHolding && matchingHolding.totalQuantity > 0 && (
                    <button
                      type="button"
                      onClick={() => setQuantity(String(matchingHolding.quantity || matchingHolding.totalQuantity))}
                      className="text-[10px] text-amber-400 hover:underline cursor-pointer font-semibold"
                    >
                      Held: {matchingHolding.totalQuantity}
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm font-bold text-white bg-slate-900 border border-slate-700 outline-none"
                />
                <div className="flex gap-1 mt-1.5">
                  {[1, 5, 10, 25].map((add) => (
                    <button
                      key={add}
                      type="button"
                      onClick={() => setQuantity(String((Math.floor(Number(quantity)) || 0) + add))}
                      className="flex-1 py-1 rounded text-[10px] font-bold cursor-pointer hover:brightness-125"
                      style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
                    >
                      +{add}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>
                    {orderType === 'LIMIT' || orderType === 'SL' ? 'Limit Price (₹)' : 'Market Price (Est)'}
                  </label>
                  {(orderType === 'LIMIT' || orderType === 'SL') && quote?.price ? (
                    <button
                      type="button"
                      onClick={() => setLimitPrice(String(quote.price))}
                      className="text-[10px] text-blue-400 hover:underline cursor-pointer font-semibold"
                    >
                      Use LTP
                    </button>
                  ) : null}
                </div>
                <input
                  type="number"
                  step="0.05"
                  disabled={orderType === 'MARKET' || orderType === 'SL-M'}
                  value={orderType === 'MARKET' || orderType === 'SL-M' ? (quote?.price ?? '') : limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-xl text-sm font-bold text-white bg-slate-900 border border-slate-700 outline-none disabled:opacity-50"
                />
                <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  {orderType === 'MARKET' || orderType === 'SL-M' ? 'Auto-matched at LTP' : 'Tick size ₹0.05'}
                </p>
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
                  className="w-full px-3 py-2 rounded-xl text-sm font-bold text-white bg-slate-900 border border-slate-700 outline-none"
                />
              </div>
            )}

            {/* Validity & AMO Options */}
            <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>
                    Validity:
                  </span>
                  {(['DAY', 'IOC'] as ValidityType[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setValidity(v)}
                      title={v === 'DAY' ? 'Good for today session' : 'Immediate or Cancel'}
                      className="px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer"
                      style={{
                        background: validity === v ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                        color: validity === v ? '#60a5fa' : 'var(--text-muted)',
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </div>

                <label
                  className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-300"
                  title="After Market Order queues your order for next 9:15 AM market open"
                >
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
                  <span>Auto-split orders above exchange freeze limit</span>
                </label>
              )}
            </div>

            {/* Pre-trade Margin & Brokerage Preview */}
            <div
              className="rounded-xl p-3 space-y-1.5 text-xs"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}
            >
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Est. Order Value</span>
                <span className="font-bold text-white">₹{fmtInr(estOrderValue)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>
                  Brokerage &amp; Taxes {loadingCharges ? '(calculating...)' : ''}
                </span>
                <span className="text-slate-300">{charges ? `₹${fmtInr(charges.charges.total)}` : '—'}</span>
              </div>
              {charges && (
                <div
                  className="text-[10px] flex justify-between pt-1 border-t"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                >
                  <span>
                    Brok ₹{charges.charges.brokerage.toFixed(0)} · STT ₹{charges.charges.stt.toFixed(1)}
                  </span>
                  <span>
                    GST ₹{charges.charges.gst.toFixed(1)} · Stamp ₹{charges.charges.stampDuty.toFixed(1)}
                  </span>
                </div>
              )}
              {estOrderValue > 0 && (
                <div
                  className="flex justify-between pt-1.5 border-t font-bold"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {side === 'BUY' ? 'Total Required' : 'Est. Net Proceeds'}
                  </span>
                  <span className="text-white">₹{fmtInr(netOrderTotal)}</span>
                </div>
              )}
              {marginExceeded && (
                <p className="text-[10px] text-amber-400 font-semibold pt-1">
                  ⚠ Exceeds available margin (₹{fmtInr(funds.availableMargin)}) by ₹
                  {fmtInr(netOrderTotal - funds.availableMargin)}
                </p>
              )}
            </div>

            {/* Submit Trigger Button */}
            <div>
              <button
                type="button"
                disabled={isSubmitDisabled}
                onClick={() => setShowConfirmModal(true)}
                className="w-full py-3 rounded-xl text-sm font-black tracking-wide cursor-pointer transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{
                  background: side === 'BUY' ? 'linear-gradient(135deg, #00d68f, #10b981)' : 'linear-gradient(135deg, #ff4d6a, #f43f5e)',
                  color: side === 'BUY' ? '#000' : '#fff',
                }}
              >
                <Zap size={15} />
                <span>
                  Review {side} {selectedSymbol || 'Order'} {mode === 'sandbox' ? '(Sandbox)' : ''}
                </span>
              </button>
              {disabledReason && (
                <p className="text-[10px] text-center mt-2" style={{ color: 'var(--text-muted)' }}>
                  {disabledReason}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── TWO-STEP ORDER CONFIRMATION MODAL ─── */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowConfirmModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 animate-fade-in-up"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock size={16} style={{ color: mode === 'live' ? '#ff4d6a' : '#fbbf24' }} />
                <h3 className="text-base font-extrabold text-white">
                  Confirm {mode === 'live' ? 'Live Exchange Order' : 'Sandbox Test Order'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer px-1.5 py-0.5 rounded"
              >
                ✕
              </button>
            </div>

            {mode === 'live' && (
              <div
                className="p-3 rounded-xl text-[11px] leading-relaxed"
                style={{
                  background: 'rgba(255,77,106,0.1)',
                  border: '1px solid rgba(255,77,106,0.3)',
                  color: '#fda4af',
                }}
              >
                <strong>Real Money Warning:</strong> Confirming submits an actual NSE/BSE instruction via your Upstox Demat account.
              </div>
            )}

            <div className="rounded-xl p-4 space-y-2.5 text-xs" style={{ background: 'var(--bg-primary)' }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Action</span>
                <span className="font-black" style={{ color: side === 'BUY' ? '#00d68f' : '#ff4d6a' }}>
                  {side} {qtyNum} × {selectedSymbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Order &amp; Product</span>
                <span className="font-bold text-white">
                  {orderType} · {product === 'D' ? 'Delivery (CNC)' : product === 'I' ? 'Intraday (MIS)' : 'MTF'} · {validity}
                  {isAmo ? ' (AMO)' : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Price</span>
                <span className="font-bold text-white">
                  {orderType === 'MARKET' || orderType === 'SL-M'
                    ? `Market (~₹${fmtInr(effectivePrice)})`
                    : `₹${fmtInr(parseFloat(limitPrice) || 0)}`}
                </span>
              </div>
              {(orderType === 'SL' || orderType === 'SL-M') && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Trigger Price</span>
                  <span className="font-bold text-amber-300">₹{fmtInr(parseFloat(triggerPrice) || 0)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  {side === 'BUY' ? 'Est. Total (incl. fees)' : 'Est. Net Proceeds'}
                </span>
                <span className="font-black text-white">₹{fmtInr(netOrderTotal)}</span>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold cursor-pointer border border-slate-700 text-slate-300 hover:bg-slate-800"
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
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setEditingOrder(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-4 animate-fade-in-up"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-white">
                Modify Order · {editingOrder.symbol} (#{editingOrder.orderId})
              </h3>
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
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
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowExitAllConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-4 animate-fade-in-up"
            style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(255,77,106,0.4)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-extrabold text-rose-400">Square Off All Open Positions?</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              This will submit market exit orders via Upstox for all open positions in your account. This action cannot be undone.
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
          Loading Live Trade &amp; Portfolio...
        </div>
      }
    >
      <LiveTradeContent />
    </Suspense>
  );
}
