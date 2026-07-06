'use client';

import React, { useState, useEffect } from 'react';
import { getBrokerConfig, saveBrokerConfig, BrokerConfig } from '@/lib/brokerApi';

export default function BrokerPage() {
  const [config, setConfig] = useState<BrokerConfig>({
    provider: 'mock',
    apiKey: '',
    apiSecret: '',
    connected: false,
  });

  const [accessTokenInput, setAccessTokenInput] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'connected' | 'error' | 'checking'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [redirectUri, setRedirectUri] = useState('http://localhost:3000/broker');
  const [serverToken, setServerToken] = useState<{
    connected: boolean;
    userId?: string;
    expiresAt?: string;
    reason?: string;
  } | null>(null);

  // ─── Check server-side token status on mount ───
  useEffect(() => {
    const envClientId = process.env.NEXT_PUBLIC_UPSTOX_CLIENT_ID;
    const currentConfig = getBrokerConfig();

    if (typeof window !== 'undefined') {
      setRedirectUri(`${window.location.origin}/broker`);

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
          })
        })
        .then(res => res.json())
        .then(res => {
          if (res.error) {
            const detailMsg = res.details?.error_description || res.details?.message || '';
            setErrorMessage(res.error + (detailMsg ? `: ${detailMsg}` : ''));
            setSaveStatus('error');
          } else {
            // Store token server-side too
            fetch('/api/broker/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accessToken: res.accessToken, source: 'oauth' }),
            }).catch(() => {});

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
        .catch(err => {
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
          })
        })
        .then(res => res.json())
        .then(res => {
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
        .catch(err => {
          setErrorMessage(err.message || 'Network error');
          setSaveStatus('error');
        });
        return;
      }
    }

    // Auto-setup Upstox from env vars
    if (envClientId && !currentConfig.connected) {
      currentConfig.apiKey = envClientId;
      currentConfig.apiSecret = '••••••••••';
      currentConfig.provider = 'upstox';
    }
    setConfig(currentConfig.connected ? currentConfig : { ...currentConfig });
    if (currentConfig.connected) setSaveStatus('connected');

    // Check server-side token
    checkServerToken();
  }, []);

  const checkServerToken = async () => {
    try {
      const res = await fetch('/api/broker/token');
      const data = await res.json();
      setServerToken(data);
      if (data.connected) {
        setSaveStatus('connected');
        setConfig(prev => ({ ...prev, provider: 'upstox', connected: true }));
      }
    } catch {
      setServerToken({ connected: false, reason: 'Failed to check' });
    }
  };

  const handleProviderChange = (provider: 'zerodha' | 'upstox' | 'mock') => {
    const envClientId = process.env.NEXT_PUBLIC_UPSTOX_CLIENT_ID;
    setConfig(prev => ({
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
        body: JSON.stringify({ accessToken: accessTokenInput, source: 'manual' }),
      });
      const data = await res.json();

      if (data.error) {
        setErrorMessage(data.error);
        setSaveStatus('error');
      } else {
        // Also save to local config
        const updated: BrokerConfig = {
          provider: 'upstox',
          apiKey: process.env.NEXT_PUBLIC_UPSTOX_CLIENT_ID || config.apiKey,
          apiSecret: '••••••••••',
          connected: true,
          accessToken: accessTokenInput,
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

  const handleDisconnect = async () => {
    try {
      await fetch('/api/broker/token', { method: 'DELETE' });
    } catch {}

    saveBrokerConfig({ provider: 'mock', apiKey: '', apiSecret: '', connected: false });
    setConfig({ provider: 'mock', apiKey: '', apiSecret: '', connected: false });
    setAccessTokenInput('');
    setSaveStatus('idle');
    setErrorMessage('');
    setServerToken({ connected: false });
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
  const isConnected = serverToken?.connected || config.connected || saveStatus === 'connected';

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          🔌 Broker API Integration
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Connect your Upstox account to pull real-time market data, PCR, option chains, and delivery data.
        </p>
      </div>

      {/* ─── Server Connection Status ─── */}
      {isConnected && (
        <div className="mb-6 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{
            background: 'linear-gradient(135deg, rgba(0,214,143,0.08), rgba(59,130,246,0.08))',
            border: '1px solid rgba(0,214,143,0.2)',
          }}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
              style={{ background: 'rgba(0,214,143,0.12)' }}>✅</div>
            <div>
              <p className="text-sm font-bold text-white">Upstox Connected — Live Data Active</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {serverToken?.userId ? `User: ${serverToken.userId}` : 'Real-time market data flowing'}
                {serverToken?.expiresAt && ` · Expires: ${new Date(serverToken.expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`}
              </p>
            </div>
          </div>
          <button onClick={handleDisconnect}
            className="px-4 py-2 text-xs font-bold rounded-lg border cursor-pointer transition-colors hover:bg-red-500/10 shrink-0"
            style={{ borderColor: 'rgba(255,77,106,0.3)', color: '#ff4d6a' }}>
            Disconnect
          </button>
        </div>
      )}

      {/* ─── Provider Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[
          { id: 'mock' as const, title: 'Simulation Mode', desc: 'Mock options and volume data.', logo: '🧪', activeColor: 'var(--accent-blue)' },
          { id: 'zerodha' as const, title: 'Zerodha Kite', desc: 'Kite Connect API for derivatives.', logo: '🪁', activeColor: 'var(--accent-yellow)' },
          { id: 'upstox' as const, title: 'Upstox Developer', desc: 'Upstox API for live market data.', logo: '📈', activeColor: 'var(--accent-purple)',
            badge: hasEnvCredentials ? 'PRE-CONFIGURED' : undefined },
        ].map(prov => (
          <button key={prov.id} type="button" onClick={() => handleProviderChange(prov.id)}
            className={`p-4 rounded-xl text-left border cursor-pointer transition-all flex flex-col justify-between h-40 ${
              config.provider === prov.id ? 'scale-[1.02] shadow-lg' : 'opacity-70 hover:opacity-100'
            }`}
            style={{ background: 'var(--bg-card)', borderColor: config.provider === prov.id ? prov.activeColor : 'var(--border-color)' }}>
            <div className="flex items-start justify-between">
              <span className="text-3xl">{prov.logo}</span>
              {'badge' in prov && prov.badge && (
                <span className="text-[8px] px-2 py-0.5 rounded-full font-black tracking-wider"
                  style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>
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
            ⚙️ Upstox Connection
          </h2>

          {/* Method 1: Quick Token Paste */}
          <div className="p-4 rounded-xl" style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">⚡</span>
              <h3 className="text-sm font-bold text-white">Quick Connect — Paste Access Token</h3>
            </div>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              Go to <a href="https://account.upstox.com/developer/apps" target="_blank" rel="noopener noreferrer"
                className="underline" style={{ color: '#a78bfa' }}>Upstox Developer Dashboard</a> → your app → click <strong>&quot;Generate&quot;</strong> next to Access Token → paste it below.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={accessTokenInput}
                onChange={e => setAccessTokenInput(e.target.value)}
                placeholder="Paste generated access_token here..."
                className="flex-1 text-sm p-2.5 rounded-lg border bg-slate-900 border-slate-700 text-white focus:outline-none focus:border-purple-500"
              />
              <button onClick={handleSaveToken}
                disabled={saveStatus === 'saving'}
                className="px-5 py-2.5 text-xs font-bold rounded-lg text-white cursor-pointer transition-all hover:brightness-110 shrink-0 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', boxShadow: '0 4px 12px rgba(139,92,246,0.25)' }}>
                {saveStatus === 'saving' ? '⏳ Verifying...' : '🔗 Connect'}
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: 'var(--border-color)' }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>or</span>
            <div className="flex-1 h-px" style={{ background: 'var(--border-color)' }} />
          </div>

          {/* Method 2: OAuth Flow */}
          <div className="p-4 rounded-xl" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🔐</span>
              <h3 className="text-sm font-bold text-white">OAuth Login Flow</h3>
            </div>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              Redirects to Upstox login page. After authentication, token is stored automatically.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                  Client ID
                </label>
                <input type="text" readOnly={hasEnvCredentials}
                  value={config.apiKey}
                  onChange={e => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  className={`w-full text-xs p-2 rounded-lg border bg-slate-900 border-slate-700 text-white ${hasEnvCredentials ? 'opacity-60' : ''}`}
                />
                {hasEnvCredentials && <p className="text-[9px] mt-0.5" style={{ color: 'var(--accent-green)' }}>✓ From environment</p>}
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                  Secret
                </label>
                <input type="password" readOnly={hasEnvCredentials}
                  value={config.apiSecret}
                  className={`w-full text-xs p-2 rounded-lg border bg-slate-900 border-slate-700 text-white ${hasEnvCredentials ? 'opacity-60' : ''}`}
                  onChange={e => setConfig(prev => ({ ...prev, apiSecret: e.target.value }))}
                />
                {hasEnvCredentials && <p className="text-[9px] mt-0.5" style={{ color: 'var(--accent-green)' }}>✓ Server-side only</p>}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Redirect: <code className="bg-slate-950 px-1 py-0.5 rounded text-blue-400 text-[9px]">{redirectUri}</code>
              </p>
              {!isConnected && config.apiKey.length > 5 && (
                <button onClick={handleAuthorize}
                  className="px-4 py-2 text-xs font-bold rounded-lg text-white cursor-pointer transition-all hover:brightness-110 flex items-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                  🔐 Authorize with Upstox
                </button>
              )}
            </div>
          </div>

          {/* Status Bar */}
          <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <div>
              {isConnected ? (
                <span className="text-xs px-2.5 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-bold">
                  🟢 CONNECTED
                </span>
              ) : (
                <span className="text-xs px-2.5 py-1 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-bold">
                  ⚪ DISCONNECTED
                </span>
              )}
            </div>
            {isConnected && (
              <button onClick={handleDisconnect}
                className="px-3 py-1.5 text-[10px] font-bold rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors">
                Disconnect
              </button>
            )}
          </div>

          {saveStatus === 'connected' && (
            <p className="text-xs text-green-400 text-center font-semibold animate-pulse">
              ✓ Connected! Real-time Upstox data is now active across all pages.
            </p>
          )}
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
              <input type="text" required value={config.apiKey}
                onChange={e => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="Enter Kite API Key"
                className="w-full text-sm p-2.5 rounded-lg border bg-slate-900 border-slate-700 text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>API Secret</label>
              <input type="password" required value={config.apiSecret}
                onChange={e => setConfig(prev => ({ ...prev, apiSecret: e.target.value }))}
                className="w-full text-sm p-2.5 rounded-lg border bg-slate-900 border-slate-700 text-white focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3">
            {config.apiKey.length > 5 && (
              <button onClick={handleAuthorize}
                className="px-4 py-2.5 text-xs font-bold rounded-lg bg-orange-600 text-white hover:bg-orange-500 transition-colors cursor-pointer">
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
              <button onClick={() => handleProviderChange('upstox')}
                className="px-5 py-2.5 text-xs font-bold rounded-xl text-white cursor-pointer transition-all hover:brightness-110 inline-flex items-center gap-2"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}>
                📈 Switch to Upstox
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
