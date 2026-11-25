'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getBrokerConfig, saveBrokerConfig, BrokerConfig } from '@/lib/brokerApi';
import { useAuth } from '@/context/AuthContext';

interface UpstoxServerStatus {
  connected: boolean;
  tradingConnected?: boolean;
  analyticsConnected?: boolean;
  mode?: 'live_trading' | 'analytics_only' | 'disconnected';
  status?: string;
  userId?: string | null;
  expiresAt?: string | null;
  reason?: string;
  trading?: {
    connected: boolean;
    userId?: string | null;
    expiresAt?: string | null;
  };
  analytics?: {
    connected: boolean;
    userId?: string | null;
    expiresAt?: string | null;
  };
  pendingRequest?: {
    status: 'pending' | 'approved' | 'rejected' | 'expired';
    authorizationExpiry?: string;
    requestedAt?: string;
  } | null;
  webhookUrl?: string;
}

export default function BrokerPage() {
  const { session } = useAuth();
  const [config, setConfig] = useState<BrokerConfig>({
    provider: 'mock',
    apiKey: '',
    apiSecret: '',
    connected: false,
  });

  const [accessTokenInput, setAccessTokenInput] = useState('');
  const [analyticsTokenInput, setAnalyticsTokenInput] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'connected' | 'error' | 'checking'>('checking');
  const [errorMessage, setErrorMessage] = useState('');
  const [analyticsSaveMsg, setAnalyticsSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savingAnalytics, setSavingAnalytics] = useState(false);

  const [redirectUri, setRedirectUri] = useState('http://localhost:3000/broker');
  const [webhookUrl, setWebhookUrl] = useState('https://marketpulse-ai-26.vercel.app/api/broker/webhook');
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const [requestingApproval, setRequestingApproval] = useState(false);
  const [pollingApproval, setPollingApproval] = useState(false);
  const [approvalNotice, setApprovalNotice] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [serverToken, setServerToken] = useState<UpstoxServerStatus | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPollingApproval(false);
  }, []);

  const checkServerToken = useCallback(async () => {
    try {
      const res = await fetch('/api/upstox-status', { cache: 'no-store' });
      const data: UpstoxServerStatus = await res.json();
      setServerToken(data);
      if (data.webhookUrl) {
        setWebhookUrl(data.webhookUrl);
      }

      const tradingActive = Boolean(data.tradingConnected ?? data.trading?.connected ?? data.connected);
      const anyActive = Boolean(data.connected);

      if (anyActive) {
        setSaveStatus('connected');
        const current = getBrokerConfig();
        const updated: BrokerConfig = {
          ...current,
          provider: 'upstox',
          connected: true,
          // Never leave an expired trading JWT in localStorage once server confirms trading expired
          accessToken: tradingActive ? current.accessToken : undefined,
        };
        saveBrokerConfig(updated);
        setConfig(updated);
      } else {
        setSaveStatus('idle');
        setConfig((prev) => {
          const updated: BrokerConfig = { ...prev, connected: false, accessToken: undefined };
          saveBrokerConfig(updated);
          return updated;
        });
      }

      return data;
    } catch {
      setServerToken({ connected: false, reason: 'Failed to check server status' });
      return null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // ─── Check server-side token status & OAuth callbacks on mount ───
  useEffect(() => {
    const envClientId = process.env.NEXT_PUBLIC_UPSTOX_CLIENT_ID;
    const currentConfig = getBrokerConfig();

    if (typeof window !== 'undefined') {
      setRedirectUri(`${window.location.origin}/broker`);
      setWebhookUrl(`${window.location.origin}/api/broker/webhook`);

      const urlParams = new URLSearchParams(window.location.search);
      const upstoxCode = urlParams.get('code');
      const requestToken = urlParams.get('request_token');

      // ─── Upstox OAuth callback (?code=) ───
      if (upstoxCode) {
        window.history.replaceState({}, document.title, window.location.pathname);
        setSaveStatus('saving');

        const upstoxConfig: BrokerConfig = {
          provider: 'upstox',
          apiKey: envClientId || currentConfig.apiKey,
          apiSecret: '••••••••••',
          connected: false,
        };
        saveBrokerConfig(upstoxConfig);
        setConfig(upstoxConfig);

        fetch('/api/broker/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'upstox',
            apiKey: envClientId || currentConfig.apiKey,
            apiSecret: '',
            code: upstoxCode,
            redirectUri: `${window.location.origin}/broker`,
          }),
        })
          .then((res) => res.json())
          .then((res) => {
            if (res.error) {
              const detailMsg = res.details?.error_description || res.details?.message || '';
              setErrorMessage(res.error + (detailMsg ? `: ${detailMsg}` : ''));
              setSaveStatus('error');
            } else {
              const updated: BrokerConfig = {
                ...upstoxConfig,
                connected: true,
                accessToken: res.accessToken,
              };
              saveBrokerConfig(updated);
              setConfig(updated);
              setSaveStatus('connected');
              checkServerToken();
            }
          })
          .catch((err) => {
            setErrorMessage(err.message || 'Network error');
            setSaveStatus('error');
          });
        return;
      }

      // ─── Zerodha callback (?request_token=) ───
      if (requestToken && currentConfig.provider === 'zerodha' && currentConfig.apiKey && currentConfig.apiSecret) {
        window.history.replaceState({}, document.title, window.location.pathname);
        setSaveStatus('saving');

        fetch('/api/broker/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'zerodha',
            apiKey: currentConfig.apiKey,
            apiSecret: currentConfig.apiSecret,
            requestToken,
          }),
        })
          .then((res) => res.json())
          .then((res) => {
            if (res.error) {
              setErrorMessage(res.error);
              setSaveStatus('error');
            } else {
              const updated: BrokerConfig = { ...currentConfig, connected: true, accessToken: res.accessToken };
              saveBrokerConfig(updated);
              setConfig(updated);
              setSaveStatus('connected');
            }
          })
          .catch((err) => {
            setErrorMessage(err.message || 'Network error');
            setSaveStatus('error');
          });
        return;
      }
    }

    if (envClientId && !currentConfig.connected) {
      currentConfig.apiKey = envClientId;
      currentConfig.apiSecret = '••••••••••';
      currentConfig.provider = 'upstox';
    }
    setConfig(currentConfig.connected ? currentConfig : { ...currentConfig });

    checkServerToken();
  }, [checkServerToken]);

  const handleProviderChange = (provider: 'zerodha' | 'upstox' | 'mock') => {
    const envClientId = process.env.NEXT_PUBLIC_UPSTOX_CLIENT_ID;
    setConfig((prev) => ({
      ...prev,
      provider,
      apiKey: provider === 'upstox' && envClientId ? envClientId : prev.apiKey,
      apiSecret: provider === 'upstox' && envClientId ? '••••••••••' : prev.apiSecret,
      connected: provider === 'mock',
    }));
    setSaveStatus('idle');
    setErrorMessage('');
  };

  const handleSaveToken = async () => {
    if (!accessTokenInput || accessTokenInput.length < 10) {
      setErrorMessage('Please paste a valid access token from Upstox Developer Dashboard');
      setSaveStatus('error');
      return;
    }

    setSaveStatus('saving');
    setErrorMessage('');

    try {
      const res = await fetch('/api/broker/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: accessTokenInput, source: 'manual', tokenType: 'trading' }),
      });
      const data = await res.json();

      if (data.error) {
        setErrorMessage(data.error);
        setSaveStatus('error');
      } else {
        const updated: BrokerConfig = {
          provider: 'upstox',
          apiKey: process.env.NEXT_PUBLIC_UPSTOX_CLIENT_ID || config.apiKey,
          apiSecret: '••••••••••',
          connected: true,
          accessToken: data.tokenType === 'trading' ? accessTokenInput : undefined,
        };
        saveBrokerConfig(updated);
        setConfig(updated);
        setSaveStatus('connected');
        setAccessTokenInput('');
        checkServerToken();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error');
      setSaveStatus('error');
    }
  };

  const handleSaveAnalyticsToken = async () => {
    if (!analyticsTokenInput || analyticsTokenInput.trim().length < 10) {
      setAnalyticsSaveMsg({ type: 'error', text: 'Paste a valid 1-year Analytics token from Upstox My Apps → Analytics.' });
      return;
    }

    setSavingAnalytics(true);
    setAnalyticsSaveMsg(null);
    try {
      const res = await fetch('/api/broker/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: analyticsTokenInput.trim(),
          source: 'analytics_manual',
          tokenType: 'analytics',
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAnalyticsSaveMsg({ type: 'error', text: data.error || 'Failed to save Analytics token' });
      } else {
        setAnalyticsTokenInput('');
        setAnalyticsSaveMsg({ type: 'success', text: data.message || '1-year Analytics token saved!' });
        checkServerToken();
      }
    } catch (err: any) {
      setAnalyticsSaveMsg({ type: 'error', text: err.message || 'Network error saving Analytics token' });
    } finally {
      setSavingAnalytics(false);
    }
  };

  const handleDisconnect = async (scope: 'trading' | 'analytics' | 'all' = 'all') => {
    try {
      await fetch(`/api/broker/token?scope=${scope}`, { method: 'DELETE' });
    } catch {}

    if (scope === 'all') {
      saveBrokerConfig({ provider: 'mock', apiKey: '', apiSecret: '', connected: false });
      setConfig({ provider: 'mock', apiKey: '', apiSecret: '', connected: false });
      setAccessTokenInput('');
      setAnalyticsTokenInput('');
      setSaveStatus('idle');
      setErrorMessage('');
    } else if (scope === 'trading') {
      const current = getBrokerConfig();
      saveBrokerConfig({ ...current, accessToken: undefined });
      setConfig((prev) => ({ ...prev, accessToken: undefined }));
    }
    checkServerToken();
  };

  const handleRequestApproval = async () => {
    if (!session?.access_token) {
      setApprovalNotice({ type: 'error', text: 'Please sign in first to request Upstox phone approval.' });
      return;
    }

    setRequestingApproval(true);
    setApprovalNotice(null);
    stopPolling();

    try {
      const res = await fetch('/api/broker/request-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setApprovalNotice({
          type: 'error',
          text: `${data.error || 'Could not trigger approval request.'}${data.hint ? ` ${data.hint}` : ''}`,
        });
        return;
      }

      setApprovalNotice({
        type: 'info',
        text: '📱 WhatsApp & Upstox App notification sent! Tap Approve on your phone — checking automatically...',
      });
      setPollingApproval(true);

      let attempts = 0;
      pollTimerRef.current = setInterval(async () => {
        attempts += 1;
        const fresh = await checkServerToken();
        if (fresh?.tradingConnected || fresh?.trading?.connected) {
          stopPolling();
          setApprovalNotice({
            type: 'success',
            text: '✓ Approved! Daily Live Trading session is now active until 3:30 AM IST.',
          });
        } else if (fresh?.pendingRequest?.status === 'rejected') {
          stopPolling();
          setApprovalNotice({
            type: 'error',
            text: 'Request was rejected on your phone. Click Request Approval again when ready.',
          });
        } else if (attempts >= 40) {
          stopPolling();
          setApprovalNotice({
            type: 'info',
            text: 'Still waiting for phone approval. Tap Approve on WhatsApp/Upstox App and click Refresh Status.',
          });
        }
      }, 3000);
    } catch (err: any) {
      setApprovalNotice({ type: 'error', text: err.message || 'Network error triggering approval request' });
    } finally {
      setRequestingApproval(false);
    }
  };

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } catch {}
  };

  const handleAuthorize = () => {
    setErrorMessage('');
    const newConfig: BrokerConfig = { ...config, connected: false, accessToken: accessTokenInput || config.accessToken };
    saveBrokerConfig(newConfig);
    setConfig(newConfig);

    if (config.provider === 'zerodha') {
      window.location.href = `https://kite.trade/connect/login?api_key=${config.apiKey}&v=3`;
    } else if (config.provider === 'upstox') {
      const clientId = process.env.NEXT_PUBLIC_UPSTOX_CLIENT_ID || config.apiKey;
      window.location.href = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    }
  };

  const hasEnvCredentials = !!process.env.NEXT_PUBLIC_UPSTOX_CLIENT_ID;
  const serverChecked = serverToken !== null;
  const tradingConnected = Boolean(serverToken?.tradingConnected ?? serverToken?.trading?.connected);
  const analyticsConnected = Boolean(serverToken?.analyticsConnected ?? serverToken?.analytics?.connected);
  const isConnected = serverChecked ? serverToken.connected : false;
  const isTokenExpired = serverChecked && !tradingConnected && (serverToken.status === 'token_expired' || serverToken.reason?.includes('expired'));
  const isChecking = !serverChecked && saveStatus === 'checking';

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          🔌 Broker API Integration
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Connect Upstox with 1-tap phone approval (no daily OTP typing) + a 1-year Analytics token for uninterrupted market data.
        </p>
      </div>

      {/* ─── Dual Upstox Status Strip ─── */}
      {serverChecked && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Daily Trading Session */}
          <div
            className="p-4 rounded-2xl flex flex-col justify-between gap-3"
            style={{
              background: tradingConnected
                ? 'linear-gradient(135deg, rgba(0,214,143,0.08), rgba(59,130,246,0.06))'
                : 'linear-gradient(135deg, rgba(245,158,11,0.07), rgba(239,68,68,0.04))',
              border: `1px solid ${tradingConnected ? 'rgba(0,214,143,0.25)' : 'rgba(245,158,11,0.25)'}`,
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Daily Live Trading (Orders + Portfolio)
                </p>
                <p className="text-sm font-bold text-white mt-1">
                  {tradingConnected ? '🟢 Active Until 3:30 AM IST' : isTokenExpired ? '🟡 Expired (Needs 1-Tap Approve)' : '⚪ Not Connected'}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {tradingConnected && serverToken?.trading?.expiresAt
                    ? `${serverToken.trading.userId || 'Upstox'} · Exp: ${new Date(serverToken.trading.expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
                    : 'SEBI requires daily renewal after 3:30 AM IST'}
                </p>
              </div>
              {tradingConnected && (
                <button
                  type="button"
                  onClick={() => handleDisconnect('trading')}
                  className="px-2.5 py-1 text-[10px] font-bold rounded-lg border cursor-pointer hover:bg-red-500/10 shrink-0"
                  style={{ borderColor: 'rgba(255,77,106,0.3)', color: '#ff4d6a' }}
                >
                  Disconnect
                </button>
              )}
            </div>

            {!tradingConnected && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleRequestApproval}
                  disabled={requestingApproval || pollingApproval}
                  className="px-3 py-1.5 text-[11px] font-bold rounded-lg text-white cursor-pointer transition-all hover:brightness-110 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                >
                  {requestingApproval ? 'Sending...' : pollingApproval ? '⏳ Waiting for Phone Tap...' : '📱 1-Tap WhatsApp / App Approve'}
                </button>
                <button
                  type="button"
                  onClick={handleAuthorize}
                  className="px-3 py-1.5 text-[11px] font-bold rounded-lg border cursor-pointer text-slate-300 hover:text-white"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  OAuth Login
                </button>
              </div>
            )}
          </div>

          {/* 1-Year Analytics Token */}
          <div
            className="p-4 rounded-2xl flex flex-col justify-between gap-3"
            style={{
              background: analyticsConnected
                ? 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.06))'
                : 'var(--bg-card)',
              border: `1px solid ${analyticsConnected ? 'rgba(139,92,246,0.3)' : 'var(--border-color)'}`,
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  1-Year Analytics Token (Read-Only Data)
                </p>
                <p className="text-sm font-bold text-white mt-1">
                  {analyticsConnected ? '🟣 Active for 1 Year (No Daily OTP)' : '⚪ Not Configured'}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {analyticsConnected && serverToken?.analytics?.expiresAt
                    ? `Expires: ${new Date(serverToken.analytics.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · NIFTY/SENSEX, Quotes & Cron`
                    : 'Keeps NIFTY/SENSEX, stock prices & crons live all year'}
                </p>
              </div>
              {analyticsConnected && (
                <button
                  type="button"
                  onClick={() => handleDisconnect('analytics')}
                  className="px-2.5 py-1 text-[10px] font-bold rounded-lg border cursor-pointer hover:bg-red-500/10 shrink-0"
                  style={{ borderColor: 'rgba(255,77,106,0.3)', color: '#ff4d6a' }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {approvalNotice && (
        <div
          className="mb-6 p-4 rounded-xl flex items-center justify-between gap-3 text-xs"
          style={{
            background:
              approvalNotice.type === 'success'
                ? 'rgba(0,214,143,0.1)'
                : approvalNotice.type === 'error'
                  ? 'rgba(255,77,106,0.1)'
                  : 'rgba(59,130,246,0.1)',
            border: `1px solid ${
              approvalNotice.type === 'success'
                ? 'rgba(0,214,143,0.3)'
                : approvalNotice.type === 'error'
                  ? 'rgba(255,77,106,0.3)'
                  : 'rgba(59,130,246,0.3)'
            }`,
            color: '#f1f5f9',
          }}
        >
          <span>{approvalNotice.text}</span>
          <button
            type="button"
            onClick={() => checkServerToken()}
            className="px-3 py-1 rounded-lg text-[11px] font-bold cursor-pointer shrink-0"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#93c5fd' }}
          >
            Refresh Status
          </button>
        </div>
      )}

      {/* ─── Provider Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[
          { id: 'mock' as const, title: 'Simulation Mode', desc: 'Mock options and volume data.', logo: '🧪', activeColor: 'var(--accent-blue)' },
          { id: 'zerodha' as const, title: 'Zerodha Kite', desc: 'Kite Connect API for derivatives.', logo: '🪁', activeColor: 'var(--accent-yellow)' },
          {
            id: 'upstox' as const,
            title: 'Upstox Developer',
            desc: 'Upstox API for live market data.',
            logo: '📈',
            activeColor: 'var(--accent-purple)',
            badge: hasEnvCredentials ? 'PRE-CONFIGURED' : undefined,
          },
        ].map((prov) => (
          <button
            key={prov.id}
            type="button"
            onClick={() => handleProviderChange(prov.id)}
            className={`p-4 rounded-xl text-left border cursor-pointer transition-all flex flex-col justify-between h-40 ${
              config.provider === prov.id ? 'scale-[1.02] shadow-lg' : 'opacity-70 hover:opacity-100'
            }`}
            style={{ background: 'var(--bg-card)', borderColor: config.provider === prov.id ? prov.activeColor : 'var(--border-color)' }}
          >
            <div className="flex items-start justify-between">
              <span className="text-3xl">{prov.logo}</span>
              {'badge' in prov && prov.badge && (
                <span
                  className="text-[8px] px-2 py-0.5 rounded-full font-black tracking-wider"
                  style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}
                >
                  {prov.badge}
                </span>
              )}
            </div>
            <div>
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{prov.title}</h3>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{prov.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* ─── Upstox Connection Panel ─── */}
      {config.provider === 'upstox' && (
        <div className="rounded-xl p-6 border space-y-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            ⚙️ Upstox Connection Options
          </h2>

          {/* Option A: 1-Tap WhatsApp / App Approval (No Daily OTP Typing) */}
          <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>📱</span>
                  <span>1-Tap WhatsApp / App Approval (No OTP Required)</span>
                </h3>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Triggers a push &amp; WhatsApp notification on your phone. Tap Approve once and Upstox sends the fresh daily trading token directly to MarketPulse.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRequestApproval}
                disabled={requestingApproval || pollingApproval}
                className="px-4 py-2 text-xs font-bold rounded-lg text-white cursor-pointer transition-all hover:brightness-110 shrink-0 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                {requestingApproval ? 'Sending...' : pollingApproval ? '⏳ Waiting for Tap...' : 'Send Approval Prompt'}
              </button>
            </div>

            <div className="p-3 rounded-lg text-[11px]" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-subtle)' }}>
              <p className="font-semibold text-slate-300 mb-1">One-Time Setup in Upstox My Apps → marketpulse-prod:</p>
              <p style={{ color: 'var(--text-muted)' }}>
                Set <strong>Notifier Webhook URL</strong> to the URL below (and optionally schedule <code>POST /api/broker/request-token</code> at 8:45 AM IST on cron-job.org):
              </p>
              <div className="flex items-center gap-2 mt-2">
                <code className="flex-1 bg-slate-950 px-2.5 py-1.5 rounded text-emerald-300 text-[10px] overflow-x-auto">
                  {webhookUrl}
                </code>
                <button
                  type="button"
                  onClick={handleCopyWebhook}
                  className="px-2.5 py-1.5 rounded text-[10px] font-bold cursor-pointer bg-slate-800 text-white hover:bg-slate-700 shrink-0"
                >
                  {copiedWebhook ? 'Copied ✓' : 'Copy URL'}
                </button>
              </div>
            </div>
          </div>

          {/* Option B: 1-Year Analytics Token (Read-Only Data All Year) */}
          <div className="p-4 rounded-xl" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>🗓️</span>
                <span>1-Year Analytics Token (Quotes, Indices, Charts &amp; Cron)</span>
              </h3>
              {analyticsConnected && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(16,185,129,0.14)', color: '#00d68f' }}>
                  Active ✓
                </span>
              )}
            </div>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              In <a href="https://account.upstox.com/developer/apps" target="_blank" rel="noopener noreferrer" className="underline text-purple-400">Upstox My Apps</a> → open the <strong>Analytics</strong> tab → click <strong>Generate</strong> → paste the 1-year token below. Never expires daily!
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={analyticsTokenInput}
                onChange={(e) => setAnalyticsTokenInput(e.target.value)}
                placeholder="Paste 1-year Analytics token..."
                className="flex-1 text-sm p-2.5 rounded-lg border bg-slate-900 border-slate-700 text-white focus:outline-none focus:border-purple-500"
              />
              <button
                type="button"
                onClick={handleSaveAnalyticsToken}
                disabled={savingAnalytics}
                className="px-5 py-2.5 text-xs font-bold rounded-lg text-white cursor-pointer transition-all hover:brightness-110 shrink-0 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
              >
                {savingAnalytics ? 'Verifying...' : 'Save 1-Year Token'}
              </button>
            </div>
            {analyticsSaveMsg && (
              <p className={`text-xs mt-2 font-semibold ${analyticsSaveMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {analyticsSaveMsg.text}
              </p>
            )}
          </div>

          {/* Method C: Quick Token Paste (Trading Token) */}
          <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">⚡</span>
              <h3 className="text-sm font-bold text-white">Manual Paste — Daily Trading Token</h3>
            </div>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              From <a href="https://account.upstox.com/developer/apps" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: '#a78bfa' }}>Upstox My Apps → Algo Trading</a> → click <strong>&quot;Generate&quot;</strong> next to Access Token.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={accessTokenInput}
                onChange={(e) => setAccessTokenInput(e.target.value)}
                placeholder="Paste generated access_token here..."
                className="flex-1 text-sm p-2.5 rounded-lg border bg-slate-900 border-slate-700 text-white focus:outline-none focus:border-purple-500"
              />
              <button
                onClick={handleSaveToken}
                disabled={saveStatus === 'saving'}
                className="px-5 py-2.5 text-xs font-bold rounded-lg text-white cursor-pointer transition-all hover:brightness-110 shrink-0 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
              >
                {saveStatus === 'saving' ? '⏳ Verifying...' : '🔗 Connect'}
              </button>
            </div>
          </div>

          {/* Method D: OAuth Flow */}
          <div className="p-4 rounded-xl" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🔐</span>
              <h3 className="text-sm font-bold text-white">Standard OAuth Login Flow</h3>
            </div>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              Redirects to Upstox login page and stores both your daily token and extended read token (when issued).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                  Client ID
                </label>
                <input
                  type="text"
                  readOnly={hasEnvCredentials}
                  value={config.apiKey}
                  onChange={(e) => setConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                  className={`w-full text-xs p-2 rounded-lg border bg-slate-900 border-slate-700 text-white ${hasEnvCredentials ? 'opacity-60' : ''}`}
                />
                {hasEnvCredentials && <p className="text-[9px] mt-0.5" style={{ color: 'var(--accent-green)' }}>✓ From environment</p>}
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                  Secret
                </label>
                <input
                  type="password"
                  readOnly={hasEnvCredentials}
                  value={config.apiSecret}
                  className={`w-full text-xs p-2 rounded-lg border bg-slate-900 border-slate-700 text-white ${hasEnvCredentials ? 'opacity-60' : ''}`}
                  onChange={(e) => setConfig((prev) => ({ ...prev, apiSecret: e.target.value }))}
                />
                {hasEnvCredentials && <p className="text-[9px] mt-0.5" style={{ color: 'var(--accent-green)' }}>✓ Server-side only</p>}
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Redirect: <code className="bg-slate-950 px-1 py-0.5 rounded text-blue-400 text-[9px]">{redirectUri}</code>
              </p>
              {!tradingConnected && config.apiKey.length > 5 && (
                <button
                  onClick={handleAuthorize}
                  className="px-4 py-2 text-xs font-bold rounded-lg text-white cursor-pointer transition-all hover:brightness-110 flex items-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
                >
                  🔐 Authorize with Upstox
                </button>
              )}
            </div>
          </div>

          {/* Status Bar */}
          <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <div>
              {isChecking ? (
                <span className="text-xs px-2.5 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  Checking...
                </span>
              ) : tradingConnected ? (
                <span className="text-xs px-2.5 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-bold">
                  🟢 LIVE TRADING + DATA ACTIVE
                </span>
              ) : analyticsConnected ? (
                <span className="text-xs px-2.5 py-1 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 font-bold">
                  🟣 1-YEAR ANALYTICS DATA ACTIVE (READ-ONLY)
                </span>
              ) : isTokenExpired ? (
                <span className="text-xs px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                  ⚠️ TOKEN EXPIRED
                </span>
              ) : (
                <span className="text-xs px-2.5 py-1 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-bold">
                  ⚪ DISCONNECTED
                </span>
              )}
            </div>
            {isConnected && (
              <button
                onClick={() => handleDisconnect('all')}
                className="px-3 py-1.5 text-[10px] font-bold rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
              >
                Disconnect All
              </button>
            )}
          </div>

          {saveStatus === 'error' && (
            <p className="text-xs text-red-400 text-center font-semibold">
              ✗ {errorMessage || 'Connection failed. Check your credentials.'}
            </p>
          )}
        </div>
      )}

      {/* ─── Zerodha Panel ─── */}
      {config.provider === 'zerodha' && (
        <div className="rounded-xl p-6 border space-y-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>⚙️ Zerodha Kite Credentials</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>API Key</label>
              <input
                type="text"
                required
                value={config.apiKey}
                onChange={(e) => setConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder="Enter Kite API Key"
                className="w-full text-sm p-2.5 rounded-lg border bg-slate-900 border-slate-700 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>API Secret</label>
              <input
                type="password"
                required
                value={config.apiSecret}
                onChange={(e) => setConfig((prev) => ({ ...prev, apiSecret: e.target.value }))}
                className="w-full text-sm p-2.5 rounded-lg border bg-slate-900 border-slate-700 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3">
            {config.apiKey.length > 5 && (
              <button
                onClick={handleAuthorize}
                className="px-4 py-2.5 text-xs font-bold rounded-lg bg-orange-600 text-white hover:bg-orange-500 transition-colors cursor-pointer"
              >
                🔐 Authorize with Kite
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── Mock Mode Panel ─── */}
      {config.provider === 'mock' && (
        <div className="rounded-xl p-6 border text-center space-y-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <span className="text-5xl">🧪</span>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Options Simulation Mode</h2>
          <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Mathematical simulations for option chains, PCR, and delivery data based on historical volatility.
          </p>
          <div className="pt-2">
            <span className="text-xs px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-bold">
              🟢 ACTIVE
            </span>
          </div>
          {hasEnvCredentials && (
            <div className="pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
                Upstox API credentials are pre-configured. Switch to live data?
              </p>
              <button
                onClick={() => handleProviderChange('upstox')}
                className="px-5 py-2.5 text-xs font-bold rounded-xl text-white cursor-pointer transition-all hover:brightness-110 inline-flex items-center gap-2"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
              >
                📈 Switch to Upstox
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
