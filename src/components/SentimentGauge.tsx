'use client';

import { getSentimentColor, getSentimentLabel } from '@/lib/types';

interface SentimentGaugeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  animated?: boolean;
}

export default function SentimentGauge({ score, size = 'md', showLabel = true, animated = true }: SentimentGaugeProps) {
  const color = getSentimentColor(score);
  const label = getSentimentLabel(score);

  const dimensions = {
    sm: { outer: 64, inner: 50, stroke: 5, fontSize: 14, labelSize: 8 },
    md: { outer: 100, inner: 80, stroke: 7, fontSize: 22, labelSize: 10 },
    lg: { outer: 140, inner: 112, stroke: 10, fontSize: 32, labelSize: 12 },
  };

  const d = dimensions[size];
  const radius = (d.outer - d.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: d.outer, height: d.outer }}>
        <svg width={d.outer} height={d.outer} viewBox={`0 0 ${d.outer} ${d.outer}`}>
          {/* Background circle */}
          <circle
            cx={d.outer / 2}
            cy={d.outer / 2}
            r={radius}
            fill="none"
            stroke="var(--border-color)"
            strokeWidth={d.stroke}
            opacity={0.4}
          />
          {/* Progress circle */}
          <circle
            cx={d.outer / 2}
            cy={d.outer / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={d.stroke}
            strokeDasharray={`${progress} ${circumference - progress}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${d.outer / 2} ${d.outer / 2})`}
            style={{
              filter: `drop-shadow(0 0 6px ${color}40)`,
              transition: animated ? 'stroke-dasharray 1s ease-out' : 'none',
            }}
          />
        </svg>
        {/* Score text */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ color }}
        >
          <span className="font-bold" style={{ fontSize: d.fontSize }}>{score}</span>
        </div>
      </div>
      {showLabel && (
        <span
          className="font-semibold"
          style={{ fontSize: d.labelSize, color, letterSpacing: '0.5px' }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
