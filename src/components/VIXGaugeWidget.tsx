'use client';

import { useEffect, useState } from 'react';

export default function VIXGaugeWidget() {
  const [vix, setVix] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/market?_t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d?.indiaVix) setVix(d.indiaVix.value);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="glass-card-static rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">😱 Fear Gauge</h3>
        <div className="flex items-center justify-center py-6">
          <div className="w-5 h-5 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }} />
        </div>
      </div>
    );
  }

  const v = vix ?? 14;
  // VIX zones: <12 Complacency, 12-15 Low, 15-20 Normal, 20-25 Elevated, 25-30 High, >30 Extreme Fear
  let zone: string, zoneColor: string, emoji: string, description: string;
  if (v < 12) {
    zone = 'COMPLACENCY'; zoneColor = '#00d68f'; emoji = '😴'; description = 'Market extremely calm — possible reversal risk';
  } else if (v < 15) {
    zone = 'LOW VOL'; zoneColor = '#34d399'; emoji = '😊'; description = 'Low volatility — steady bullish sentiment';
  } else if (v < 20) {
    zone = 'NORMAL'; zoneColor = '#fbbf24'; emoji = '😐'; description = 'Moderate volatility — balanced conditions';
  } else if (v < 25) {
    zone = 'ELEVATED'; zoneColor = '#f97316'; emoji = '😰'; description = 'Rising fear — increased hedging activity';
  } else if (v < 30) {
    zone = 'HIGH FEAR'; zoneColor = '#ef4444'; emoji = '😱'; description = 'Significant fear — sharp moves likely';
  } else {
    zone = 'EXTREME'; zoneColor = '#dc2626'; emoji = '🔥'; description = 'Extreme fear / panic — potential capitulation';
  }

  // Gauge angle: VIX 0-40 maps to -120° to +120°
  const angle = Math.min(Math.max((v / 40) * 240 - 120, -120), 120);

  // Gauge arc segments
  const segments = [
    { color: '#00d68f', label: '<12' },
    { color: '#34d399', label: '12-15' },
    { color: '#fbbf24', label: '15-20' },
    { color: '#f97316', label: '20-25' },
    { color: '#ef4444', label: '25-30' },
    { color: '#dc2626', label: '30+' },
  ];

  return (
    <div className="glass-card-static rounded-2xl p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          😱 India VIX
        </h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
          style={{ background: `${zoneColor}20`, color: zoneColor }}>
          {zone}
        </span>
      </div>

      {/* Gauge */}
      <div className="relative flex flex-col items-center" style={{ height: 120 }}>
        <svg width="200" height="110" viewBox="0 0 200 110">
          {/* Background arc segments */}
          {segments.map((seg, i) => {
            const startAngle = -120 + (i * 40);
            const endAngle = startAngle + 40;
            const startRad = (startAngle * Math.PI) / 180;
            const endRad = (endAngle * Math.PI) / 180;
            const cx = 100, cy = 100, r = 80;
            const x1 = cx + r * Math.cos(startRad);
            const y1 = cy + r * Math.sin(startRad);
            const x2 = cx + r * Math.cos(endRad);
            const y2 = cy + r * Math.sin(endRad);

            return (
              <path key={i}
                d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
                fill="none" stroke={seg.color} strokeWidth="8" strokeLinecap="round"
                opacity={0.3}
              />
            );
          })}

          {/* Active arc (from start to current VIX) */}
          {(() => {
            const startRad = (-120 * Math.PI) / 180;
            const endRad = (angle * Math.PI) / 180;
            const cx = 100, cy = 100, r = 80;
            const x1 = cx + r * Math.cos(startRad);
            const y1 = cy + r * Math.sin(startRad);
            const x2 = cx + r * Math.cos(endRad);
            const y2 = cy + r * Math.sin(endRad);
            const largeArc = angle - (-120) > 180 ? 1 : 0;

            return (
              <path
                d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
                fill="none" stroke={zoneColor} strokeWidth="8" strokeLinecap="round"
              />
            );
          })()}

          {/* Needle */}
          {(() => {
            const rad = (angle * Math.PI) / 180;
            const cx = 100, cy = 100;
            const nx = cx + 60 * Math.cos(rad);
            const ny = cy + 60 * Math.sin(rad);
            return (
              <>
                <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx={cx} cy={cy} r="5" fill={zoneColor} stroke="var(--bg-card)" strokeWidth="2" />
              </>
            );
          })()}
        </svg>

        {/* Value */}
        <div className="absolute bottom-0 text-center">
          <p className="text-2xl font-black" style={{ color: zoneColor }}>{v.toFixed(2)}</p>
        </div>
      </div>

      {/* Description */}
      <div className="mt-2 p-2 rounded-lg text-center" style={{ background: `${zoneColor}08` }}>
        <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
          {emoji} {description}
        </p>
      </div>
    </div>
  );
}
