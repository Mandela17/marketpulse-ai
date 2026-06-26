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
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'connected' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [redirectUri, setRedirectUri] = useState('http://localhost:3000/broker');

  useEffect(() => {
    const currentConfig = getBrokerConfig();
    // Auto-fill Upstox Client ID from env var if available
    const envClientId = process.env.NEXT_PUBLIC_UPSTOX_CLIENT_ID;
    if (envClientId && (currentConfig.provider === 'upstox' || currentConfig.provider === 'mock')) {
      currentConfig.apiKey = envClientId;
      currentConfig.apiSecret = '••••••••••'; // Secret is server-side only
      currentConfig.provider = currentConfig.provider === 'mock' && envClientId ? 'upstox' : currentConfig.provider;
    }
    setConfig(currentConfig);
    if (typeof window !== 'undefined') {
      setRedirectUri(`${window.location.origin}/broker`);
      
      const urlParams = new URLSearchParams(window.location.search);
      const requestToken = urlParams.get('request_token');
      const upstoxCode = urlParams.get('code');
      
      // ─── Zerodha Kite callback (?request_token=) ───
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
            requestToken
          })
        })
        .then(res => res.json())
        .then(res => {
          if (res.error) {
            console.error('Kite token exchange failed:', res.error);
            setErrorMessage(res.error);
            setSaveStatus('error');
          } else {
            const updated: BrokerConfig = {
              ...currentConfig,
              connected: true,
              accessToken: res.accessToken
            };
            saveBrokerConfig(updated);
            setConfig(updated);
            setSaveStatus('connected');
          }
        })
        .catch(err => {
          console.error('Token handshake network error:', err);
          setErrorMessage(err.message || 'Network error during Kite token exchange');
          setSaveStatus('error');
        });
      }

      // ─── Upstox callback (?code=) ───
      if (upstoxCode && currentConfig.provider === 'upstox') {
        window.history.replaceState({}, document.title, window.location.pathname);
        setSaveStatus('saving');

        fetch('/api/broker/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'upstox',
            apiKey: currentConfig.apiKey,
            apiSecret: currentConfig.apiSecret,
            code: upstoxCode,
            redirectUri: `${window.location.origin}/broker`,
          })
        })
        .then(res => res.json())
        .then(res => {
          if (res.error) {
            console.error('Upstox token exchange failed:', res.error, res.details);
            const detailMsg = res.details?.error_description || 
                              res.details?.message || 
                              res.details?.errors?.[0]?.message || 
                              '';
            setErrorMessage(res.error + (detailMsg ? `: ${detailMsg}` : ''));
            setSaveStatus('error');
          } else {
            const updated: BrokerConfig = {
              ...currentConfig,
              connected: true,
              accessToken: res.accessToken
            };
            saveBrokerConfig(updated);
            setConfig(updated);
            setSaveStatus('connected');
          }
        })
        .catch(err => {
          console.error('Upstox token handshake network error:', err);
          setErrorMessage(err.message || 'Network error during Upstox token exchange');
          setSaveStatus('error');
        });
      }
    }
  }, []);

  const handleProviderChange = (provider: 'zerodha' | 'upstox' | 'mock') => {
    setConfig(prev => ({
      ...prev,
      provider,
      connected: provider === 'mock', // mock mode is auto-connected
    }));
    setSaveStatus('idle');
    setErrorMessage('');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('saving');
    setErrorMessage('');

    setTimeout(() => {
      try {
        const isMock = config.provider === 'mock';
        const isConnected = isMock; // real brokers require OAuth token exchange

        const newConfig: BrokerConfig = {
          ...config,
          connected: isConnected,
          accessToken: accessTokenInput || config.accessToken,
        };

        saveBrokerConfig(newConfig);
        setConfig(newConfig);
        setSaveStatus(isMock ? 'connected' : 'idle');
      } catch (err) {
        setSaveStatus('error');
        setErrorMessage('Failed to save configuration');
      }
    }, 500);
  };

  const handleDisconnect = () => {
    const disconnectedConfig: BrokerConfig = {
      provider: 'mock',
      apiKey: '',
      apiSecret: '',
      connected: false,
    };
    saveBrokerConfig(disconnectedConfig);
    setConfig(disconnectedConfig);
    setAccessTokenInput('');
    setSaveStatus('idle');
    setErrorMessage('');
  };

  const handleAuthorize = () => {
    setErrorMessage('');
    // 1. Save config first so it's present in localStorage when redirected back
    const isMock = config.provider === 'mock';
    const isConnected = isMock;

    const newConfig: BrokerConfig = {
      ...config,
      connected: isConnected,
      accessToken: accessTokenInput || config.accessToken,
    };

    saveBrokerConfig(newConfig);
    setConfig(newConfig);

    // 2. Redirect to auth URL
    if (config.provider === 'zerodha') {
      window.location.href = `https://kite.trade/connect/login?api_key=${config.apiKey}&v=3`;
    } else if (config.provider === 'upstox') {
      const authUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${config.apiKey}&redirect_uri=${encodeURIComponent(redirectUri)}`;
      window.location.href = authUrl;
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          🔌 Broker API Integration
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Connect your Zerodha Kite or Upstox account to pull real PCR (Put-Call Ratio), Open Interest (OI) option chains, and delivery data.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[
          {
            id: 'mock' as const,
            title: 'Simulation Mode',
            desc: 'Real-time mock options and volume data generator.',
            logo: '🧪',
            activeColor: 'var(--accent-blue)',
          },
          {
            id: 'zerodha' as const,
            title: 'Zerodha Kite',
            desc: 'Kite Connect API for Option Chain and market depth.',
            logo: '🪁',
            activeColor: 'var(--accent-yellow)',
          },
          {
            id: 'upstox' as const,
            title: 'Upstox Developer',
            desc: 'Upstox API for derivatives and PCR data stream.',
            logo: '📈',
            activeColor: 'var(--accent-purple)',
          },
        ].map(prov => (
          <button
            key={prov.id}
            type="button"
            onClick={() => handleProviderChange(prov.id)}
            className={`p-4 rounded-xl text-left border cursor-pointer transition-all flex flex-col justify-between h-40 ${
              config.provider === prov.id
                ? 'scale-[1.02] shadow-lg'
                : 'opacity-70 hover:opacity-100'
            }`}
            style={{
              background: 'var(--bg-card)',
              borderColor: config.provider === prov.id ? prov.activeColor : 'var(--border-color)',
            }}
          >
            <span className="text-3xl">{prov.logo}</span>
            <div>
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                {prov.title}
              </h3>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                {prov.desc}
              </p>
            </div>
          </button>
        ))}
      </div>

      {config.provider !== 'mock' ? (
        <form onSubmit={handleSave} className="rounded-xl p-6 border space-y-4"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <h2 className="text-base font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            ⚙️ Connection Credentials ({config.provider === 'zerodha' ? 'Zerodha' : 'Upstox'})
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                API Key (Client ID)
              </label>
              <input
                type="text"
                required
                value={config.apiKey}
                onChange={e => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="Enter client API Key"
                className="w-full text-sm p-2.5 rounded-lg border bg-slate-900 border-slate-700 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                API Secret Key
              </label>
              <input
                type="password"
                required
                value={config.apiSecret}
                onChange={e => setConfig(prev => ({ ...prev, apiSecret: e.target.value }))}
                placeholder="••••••••••••••••"
                className="w-full text-sm p-2.5 rounded-lg border bg-slate-900 border-slate-700 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Temporary Access Token (Optional)
            </label>
            <input
              type="text"
              value={accessTokenInput}
              onChange={e => setAccessTokenInput(e.target.value)}
              placeholder="Paste generated access_token if bypass auth flow is needed"
              className="w-full text-sm p-2.5 rounded-lg border bg-slate-900 border-slate-700 text-white focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
              Redirect Uri for authentication: <code className="bg-slate-950 px-1 py-0.5 rounded text-blue-400">{redirectUri}</code>
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <div>
              {config.connected ? (
                <span className="text-xs px-2.5 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-bold">
                  🟢 CONNECTED
                </span>
              ) : (
                <span className="text-xs px-2.5 py-1 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-bold">
                  ⚪ DISCONNECTED
                </span>
              )}
            </div>
            
            <div className="flex gap-3">
              {config.connected && (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="px-4 py-2 text-xs font-bold rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
                >
                  Disconnect Account
                </button>
              )}
              {!config.connected && config.apiKey.length > 5 && config.provider === 'zerodha' && (
                <button
                  type="button"
                  onClick={handleAuthorize}
                  className="px-4 py-2.5 text-xs font-bold rounded-lg bg-orange-600 text-white hover:bg-orange-500 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  🔐 Authorize with Kite
                </button>
              )}
              {!config.connected && config.apiKey.length > 5 && config.provider === 'upstox' && (
                <button
                  type="button"
                  onClick={handleAuthorize}
                  className="px-4 py-2.5 text-xs font-bold rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  🔐 Authorize with Upstox
                </button>
              )}
              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-500 cursor-pointer transition-colors flex items-center gap-2"
              >
                {saveStatus === 'saving' ? 'Saving...' : 'Save Keys'}
              </button>
            </div>
          </div>

          {saveStatus === 'connected' && (
            <p className="text-xs text-green-400 text-center font-semibold pt-2 animate-pulse">
              ✓ Connection verified! Options Option Chain, PCR, and Delivery analytics active.
            </p>
          )}
          {saveStatus === 'error' && (
            <p className="text-xs text-red-400 text-center font-semibold pt-2">
              ✗ Authentication failed: {errorMessage || 'Please verify your API Key and API Secret.'}
            </p>
          )}
        </form>
      ) : (
        <div className="rounded-xl p-6 border text-center space-y-4"
             style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <span className="text-5xl">🧪</span>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Running in Options Simulation Mode
          </h2>
          <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
            MarketPulse is generating highly accurate mathematical simulations for derivatives option chains, Put-Call Ratios (PCR), and daily delivery percentages based on historical volatility.
          </p>
          <div className="pt-2">
            <span className="text-xs px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-bold">
              🟢 ACTIVE & ONLINE
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
