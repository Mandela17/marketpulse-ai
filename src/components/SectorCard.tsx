'use client';

import Link from 'next/link';
import { SectorData, getSentimentColor } from '@/lib/types';
import { DEMO_SENTIMENT_HISTORY } from '@/lib/mockData';

interface SectorCardProps {
  sector: SectorData;
  index: number;
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 80;
  const height = 28;
  const padding = 2;

  const points = data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <polygon
        points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`}
        fill={`url(#grad-${color.replace('#', '')})`}
      />
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SectorCard({ sector, index }: SectorCardProps) {
  const color = getSentimentColor(sector.sentiment);
  const history = DEMO_SENTIMENT_HISTORY[sector.id] || [50, 50, 50, 50, 50, 50, 50];

  const trendArrow = sector.trend === 'up' ? '↑' : sector.trend === 'down' ? '↓' : '→';
  const trendRepeat = ''.padStart(sector.trendStrength, trendArrow.charAt(0));

  return (
    <Link href={`/sector/${sector.id}`}>
      <div
        className="card-hover rounded-xl p-4 cursor-pointer"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          animationDelay: `${index * 0.05}s`,
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{sector.icon}</span>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {sector.name}
              </h3>
            </div>
          </div>
          <MiniSparkline data={history} color={color} />
        </div>

        {/* Score Row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold" style={{ color }}>{sector.sentiment}</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{
                background: sector.trend === 'up' ? 'var(--accent-green-dim)' :
                  sector.trend === 'down' ? 'var(--accent-red-dim)' : 'var(--accent-yellow-dim)',
                color: sector.trend === 'up' ? 'var(--accent-green)' :
                  sector.trend === 'down' ? 'var(--accent-red)' : 'var(--accent-yellow)',
              }}>
              {trendArrow.repeat(sector.trendStrength)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium"
              style={{
                color: sector.change24h >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
              }}>
              {sector.change24h >= 0 ? '+' : ''}{sector.change24h.toFixed(1)}%
            </span>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>24h change</p>
          </div>
        </div>

        {/* Key Driver */}
        <p className="text-xs leading-relaxed mb-3 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
          {sector.keyDriver.length > 90 ? sector.keyDriver.substring(0, 90) + '...' : sector.keyDriver}
        </p>

        {/* Stock chips */}
        <div className="flex flex-wrap gap-1">
          {sector.stocks.slice(0, 4).map((stock) => (
            <span key={stock} className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
              {stock}
            </span>
          ))}
          {sector.stocks.length > 4 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
              +{sector.stocks.length - 4}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
