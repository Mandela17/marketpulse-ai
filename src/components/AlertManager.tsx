'use client';

import { useState, useEffect } from 'react';
import {
  getAlerts,
  addAlert,
  removeAlert,
  clearTriggeredAlerts,
  requestNotificationPermission,
  getNotificationPermission,
  type PriceAlert,
} from '@/lib/priceAlerts';

interface AlertManagerProps {
  symbol: string;
  currentPrice?: number;
  currentPrediction?: { direction: 'up' | 'down'; confidence: number } | null;
}

export default function AlertManager({ symbol, currentPrice, currentPrediction }: AlertManagerProps) {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState({
    type: 'confidence_threshold' as PriceAlert['type'],
    direction: 'up' as 'up' | 'down',
    minConfidence: 70,
    targetPrice: currentPrice || 0,
    operator: 'above' as 'above' | 'below',
  });
  const [saved, setSaved] = useState(false);

  // Load alerts for this symbol
  useEffect(() => {
    const all = getAlerts();
    setAlerts(all.filter(a => a.symbol === symbol));
    setPermission(getNotificationPermission());
  }, [symbol]);

  const handleEnableNotifications = async () => {
    const perm = await requestNotificationPermission();
    setPermission(perm);
  };

  const handleAddAlert = () => {
    const condition: PriceAlert['condition'] = {};
    if (form.type === 'prediction_change') condition.direction = form.direction;
    if (form.type === 'confidence_threshold') condition.minConfidence = form.minConfidence;
    if (form.type === 'price_target') {
      condition.targetPrice = form.targetPrice;
      condition.operator = form.operator;
    }

    addAlert({ symbol, type: form.type, condition });
    const updated = getAlerts().filter(a => a.symbol === symbol);
    setAlerts(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleRemove = (id: string) => {
    removeAlert(id);
    setAlerts(getAlerts().filter(a => a.symbol === symbol));
  };

  const handleClearTriggered = () => {
    clearTriggeredAlerts();
    setAlerts(getAlerts().filter(a => a.symbol === symbol));
  };

  const activeAlerts = alerts.filter(a => !a.triggered);
  const triggeredAlerts = alerts.filter(a => a.triggered);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white hover:bg-opacity-[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">🔔</span>
          <div className="text-left">
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Price Alerts
            </h3>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {activeAlerts.length > 0 ? `${activeAlerts.length} active alert${activeAlerts.length > 1 ? 's' : ''}` : 'Set prediction & price alerts'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeAlerts.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(59,130,246,0.2)', color: '#60a5fa' }}>
              {activeAlerts.length}
            </span>
          )}
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4" style={{ borderTop: '1px solid var(--border-color)' }}>
          {/* Notification Permission Banner */}
          {permission !== 'granted' && (
            <div className="flex items-center justify-between p-3 rounded-lg mt-4"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <p className="text-[11px] font-medium" style={{ color: '#fbbf24' }}>
                🔕 Enable browser notifications to receive alerts
              </p>
              <button
                onClick={handleEnableNotifications}
                className="text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                style={{ background: 'rgba(245,158,11,0.2)', color: '#fbbf24' }}>
                Enable
              </button>
            </div>
          )}

          {/* Add Alert Form */}
          <div className="mt-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Add New Alert
            </p>

            {/* Alert Type */}
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { value: 'confidence_threshold', label: '📊 Confidence', desc: 'When confidence hits X%' },
                { value: 'prediction_change', label: '🔄 Direction', desc: 'When AI signal changes' },
                { value: 'price_target', label: '💰 Price', desc: 'When price hits target' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setForm(f => ({ ...f, type: opt.value as PriceAlert['type'] }))}
                  className="p-2 rounded-lg text-left transition-all cursor-pointer"
                  style={{
                    background: form.type === opt.value ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${form.type === opt.value ? 'rgba(59,130,246,0.4)' : 'var(--border-color)'}`,
                  }}>
                  <p className="text-[10px] font-bold" style={{ color: form.type === opt.value ? '#60a5fa' : 'var(--text-secondary)' }}>
                    {opt.label}
                  </p>
                  <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{opt.desc}</p>
                </button>
              ))}
            </div>

            {/* Conditional inputs */}
            {form.type === 'confidence_threshold' && (
              <div className="flex items-center gap-3">
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Alert when confidence ≥</p>
                <input
                  type="number" min={50} max={99} value={form.minConfidence}
                  onChange={e => setForm(f => ({ ...f, minConfidence: +e.target.value }))}
                  className="w-16 px-2 py-1 rounded text-sm font-bold text-center"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>%</p>
              </div>
            )}

            {form.type === 'prediction_change' && (
              <div className="flex items-center gap-3">
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Alert when AI predicts</p>
                <div className="flex gap-2">
                  {(['up', 'down'] as const).map(d => (
                    <button key={d} onClick={() => setForm(f => ({ ...f, direction: d }))}
                      className="px-3 py-1 rounded text-xs font-bold cursor-pointer transition-all"
                      style={{
                        background: form.direction === d
                          ? d === 'up' ? 'rgba(0,214,143,0.2)' : 'rgba(255,77,106,0.2)'
                          : 'rgba(255,255,255,0.04)',
                        color: form.direction === d
                          ? d === 'up' ? 'var(--accent-green)' : 'var(--accent-red)'
                          : 'var(--text-muted)',
                        border: `1px solid ${form.direction === d ? (d === 'up' ? 'rgba(0,214,143,0.4)' : 'rgba(255,77,106,0.4)') : 'var(--border-color)'}`,
                      }}>
                      {d === 'up' ? '📈 Bullish' : '📉 Bearish'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {form.type === 'price_target' && (
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Alert when price is</p>
                <select
                  value={form.operator}
                  onChange={e => setForm(f => ({ ...f, operator: e.target.value as 'above' | 'below' }))}
                  className="px-2 py-1 rounded text-xs font-bold cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                  <option value="above">above ▲</option>
                  <option value="below">below ▼</option>
                </select>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>₹</span>
                <input
                  type="number" min={1} value={form.targetPrice}
                  onChange={e => setForm(f => ({ ...f, targetPrice: +e.target.value }))}
                  className="w-24 px-2 py-1 rounded text-sm font-bold"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
                {currentPrice && (
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Current: ₹{currentPrice.toLocaleString('en-IN')}
                  </span>
                )}
              </div>
            )}

            {/* Add Button */}
            <button
              onClick={handleAddAlert}
              disabled={permission !== 'granted'}
              className="w-full py-2 rounded-lg text-xs font-bold transition-all cursor-pointer"
              style={{
                background: permission === 'granted'
                  ? 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))'
                  : 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(59,130,246,0.3)',
                color: permission === 'granted' ? '#60a5fa' : 'var(--text-muted)',
                opacity: permission !== 'granted' ? 0.5 : 1,
              }}>
              {saved ? '✅ Alert Added!' : `+ Add Alert for ${symbol}`}
            </button>
          </div>

          {/* Active Alerts List */}
          {activeAlerts.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Active ({activeAlerts.length})
              </p>
              {activeAlerts.map(alert => (
                <div key={alert.id} className="flex items-center justify-between p-2.5 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
                  <div>
                    <p className="text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>
                      {alert.type === 'confidence_threshold' && `Confidence ≥ ${alert.condition.minConfidence}%`}
                      {alert.type === 'prediction_change' && `AI predicts ${alert.condition.direction?.toUpperCase()}`}
                      {alert.type === 'price_target' && `Price ${alert.condition.operator} ₹${alert.condition.targetPrice?.toLocaleString('en-IN')}`}
                    </p>
                    <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                      Set {new Date(alert.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <button onClick={() => handleRemove(alert.id)}
                    className="text-xs px-2 py-1 rounded cursor-pointer transition-colors hover:bg-red-500 hover:bg-opacity-20"
                    style={{ color: 'var(--text-muted)' }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Triggered alerts */}
          {triggeredAlerts.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Triggered ({triggeredAlerts.length})
                </p>
                <button onClick={handleClearTriggered}
                  className="text-[10px] cursor-pointer hover:underline" style={{ color: 'var(--accent-red)' }}>
                  Clear all
                </button>
              </div>
              {triggeredAlerts.slice(0, 3).map(alert => (
                <div key={alert.id} className="flex items-center gap-2 p-2 rounded-lg opacity-50"
                  style={{ background: 'rgba(0,214,143,0.05)', border: '1px solid rgba(0,214,143,0.2)' }}>
                  <span className="text-xs">✅</span>
                  <p className="text-[10px]" style={{ color: 'var(--accent-green)' }}>
                    Fired {alert.triggeredAt ? new Date(alert.triggeredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
