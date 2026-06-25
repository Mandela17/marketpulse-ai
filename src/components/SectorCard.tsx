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

  return (
    <Link href={`/sector/${sector.id}`}>
      <div
        className="card-hover"
        style={{
          borderRadius: '12px',
          padding: '16px',
          cursor: 'pointer',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          animationDelay: `${index * 0.05}s`,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>{sector.icon}</span>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {sector.name}
              </h3>
            </div>
          </div>
          <MiniSparkline data={history} color={color} />
        </div>

        {/* Score Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px', fontWeight: 700, color }}>{sector.sentiment}</span>
            <span style={{
              fontSize: '12px',
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: '9999px',
              background: sector.trend === 'up' ? 'var(--accent-green-dim)' :
                sector.trend === 'down' ? 'var(--accent-red-dim)' : 'var(--accent-yellow-dim)',
              color: sector.trend === 'up' ? 'var(--accent-green)' :
                sector.trend === 'down' ? 'var(--accent-red)' : 'var(--accent-yellow)',
            }}>
              {trendArrow.repeat(sector.trendStrength)}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{
              fontSize: '12px',
              fontWeight: 500,
              color: sector.change24h >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
            }}>
              {sector.change24h >= 0 ? '+' : ''}{sector.change24h.toFixed(1)}%
            </span>
            <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>24h change</p>
          </div>
        </div>

        {/* Key Driver */}
        <p style={{
          fontSize: '12px',
          lineHeight: 1.5,
          marginBottom: '12px',
          color: 'var(--text-secondary)',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {sector.keyDriver.length > 90 ? sector.keyDriver.substring(0, 90) + '...' : sector.keyDriver}
        </p>

        {/* Stock chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {sector.stocks.slice(0, 4).map((stock) => (
            <span key={stock} style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'var(--bg-primary)',
              color: 'var(--text-muted)',
            }}>
              {stock}
            </span>
          ))}
          {sector.stocks.length > 4 && (
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'var(--bg-primary)',
              color: 'var(--text-muted)',
            }}>
              +{sector.stocks.length - 4}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
