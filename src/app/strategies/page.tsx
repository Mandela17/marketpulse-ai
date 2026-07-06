'use client';

import { useState } from 'react';
import Link from 'next/link';

// ─── Strategy Definitions ───────────────────────────────────────────
interface StrategyDef {
  id: number;
  name: string;
  type: 'Trend' | 'Reversal' | 'Breakout' | 'Value';
  icon: string;
  holdingPeriod: string;
  winRate: string;
  riskReward: string;
  description: string;
  rules: string[];
  keyIndicators: string[];
  gradient: string;
  accentColor: string;
}

const STRATEGIES: StrategyDef[] = [
  {
    id: 1,
    name: 'EMA Crossover Momentum',
    type: 'Trend',
    icon: '📈',
    holdingPeriod: '5–15 days',
    winRate: '58–62%',
    riskReward: '1:2.5',
    description: 'Ride the trend when the 20-day EMA crosses above the 50-day EMA on above-average volume. One of the most time-tested momentum strategies.',
    rules: [
      'EMA 20 must be above EMA 50 (Golden Cross)',
      'Price must be trading above EMA 20',
      'Volume ratio > 1.2x 20-day average',
      'RSI must be below 75 (not overbought)',
    ],
    keyIndicators: ['EMA 20', 'EMA 50', 'Volume', 'RSI'],
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
    accentColor: '#10b981',
  },
  {
    id: 2,
    name: 'RSI Reversal Hunter',
    type: 'Reversal',
    icon: '🔄',
    holdingPeriod: '3–7 days',
    winRate: '55–60%',
    riskReward: '1:2',
    description: 'Buy extreme fear. When RSI drops below 30 and price touches the lower Bollinger Band, a snap-back reversal is statistically likely.',
    rules: [
      'RSI must be below 35 (oversold territory)',
      'Price at or below Lower Bollinger Band',
      'Target: Bollinger Middle Band (mean reversion)',
      'Stop-loss: 3% below entry',
    ],
    keyIndicators: ['RSI 14', 'Bollinger Bands', 'Volume'],
    gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
    accentColor: '#f59e0b',
  },
  {
    id: 3,
    name: 'Confluence Pullback',
    type: 'Trend',
    icon: '🎯',
    holdingPeriod: '5–10 days',
    winRate: '60–65%',
    riskReward: '1:3',
    description: 'The highest probability setup: an existing uptrend (price above EMA50) with a healthy RSI pullback to the 40-55 zone near EMA20 support.',
    rules: [
      'Price must be above EMA 50 (uptrend intact)',
      'RSI between 38–58 (pullback, not crash)',
      'Price near EMA 20 (within 1.5%)',
      'Low volume pullback preferred (< 0.8x avg)',
    ],
    keyIndicators: ['EMA 20', 'EMA 50', 'RSI', 'Volume'],
    gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)',
    accentColor: '#3b82f6',
  },
  {
    id: 4,
    name: 'Bollinger Squeeze Breakout',
    type: 'Breakout',
    icon: '💥',
    holdingPeriod: '3–10 days',
    winRate: '56–60%',
    riskReward: '1:2.5',
    description: 'Low volatility always precedes high volatility. When Bollinger Bandwidth compresses below 6% and price breaks the upper band on volume, a powerful directional move begins.',
    rules: [
      'Bollinger Width < 6% (tight squeeze)',
      'Price breaking above Upper Bollinger Band',
      'Volume > 1.3x average (breakout confirmation)',
      'Target: 2x the band expansion distance',
    ],
    keyIndicators: ['Bollinger Width', 'Upper Band', 'Volume'],
    gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    accentColor: '#8b5cf6',
  },
  {
    id: 5,
    name: 'Volume Climax Reversal',
    type: 'Reversal',
    icon: '🌊',
    holdingPeriod: '3–7 days',
    winRate: '54–58%',
    riskReward: '1:2.5',
    description: 'Panic selling exhaustion. When volume spikes above 3x average while the stock is already oversold and forms a hammer candle, smart money is absorbing supply.',
    rules: [
      'Volume > 2.5x 20-day average (capitulation)',
      'RSI below 40 (weakness zone)',
      'Hammer candlestick (long lower wick)',
      'Entry at close, target 2.5x ATR above',
    ],
    keyIndicators: ['Volume', 'RSI', 'Candlestick Pattern'],
    gradient: 'linear-gradient(135deg, #ec4899, #db2777)',
    accentColor: '#ec4899',
  },
  {
    id: 6,
    name: 'MACD Zero-Line Crossover',
    type: 'Trend',
    icon: '⚡',
    holdingPeriod: '5–15 days',
    winRate: '57–61%',
    riskReward: '1:2',
    description: 'MACD crossing above zero confirms the trend has shifted from bearish to bullish. Combined with a positive histogram, this signals fresh institutional buying.',
    rules: [
      'MACD line crossing above zero line',
      'Histogram turning from negative to positive',
      'Price above EMA 20 for trend confirmation',
      'Volume above average preferred',
    ],
    keyIndicators: ['MACD', 'Signal Line', 'Histogram', 'EMA 20'],
    gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)',
    accentColor: '#06b6d4',
  },
  {
    id: 7,
    name: '52-Week High Breakout',
    type: 'Breakout',
    icon: '🚀',
    holdingPeriod: '10–30 days',
    winRate: '55–59%',
    riskReward: '1:3',
    description: 'Stocks making new 52-week highs tend to continue higher. A breakout near the yearly high on strong volume with RSI in the 55–75 momentum zone signals more upside.',
    rules: [
      'Price within 5% of 52-week high',
      'RSI between 50–80 (momentum, not exhaustion)',
      'Volume > 1.2x average',
      'Target: 8% above 52W high',
    ],
    keyIndicators: ['52W High', 'RSI', 'Volume'],
    gradient: 'linear-gradient(135deg, #f43f5e, #e11d48)',
    accentColor: '#f43f5e',
  },
  {
    id: 8,
    name: 'Moving Average Ribbon',
    type: 'Trend',
    icon: '🎀',
    holdingPeriod: '10–20 days',
    winRate: '60–64%',
    riskReward: '1:2.5',
    description: 'The perfect trend: EMA10 > EMA20 > EMA50 with all rising and well-separated. This ribbon alignment only occurs in the strongest trends.',
    rules: [
      'EMA 10 > EMA 20 > EMA 50 (perfect ribbon)',
      'Price must be above all EMAs',
      'RSI between 45–78 (trending zone)',
      'Stop-loss at EMA 20 level',
    ],
    keyIndicators: ['EMA 10', 'EMA 20', 'EMA 50', 'RSI'],
    gradient: 'linear-gradient(135deg, #a78bfa, #8b5cf6)',
    accentColor: '#a78bfa',
  },
  {
    id: 9,
    name: 'Oversold Quality Value',
    type: 'Value',
    icon: '💎',
    holdingPeriod: '10–30 days',
    winRate: '62–67%',
    riskReward: '1:2',
    description: 'Buy quality on sale. Fetches REAL fundamentals from Yahoo Finance (ROE, D/E, Profit Margins). When fundamentally strong companies get temporarily oversold below RSI 38, they are statistically likely to recover.',
    rules: [
      'RSI below 38 (technically oversold)',
      'ROE > 14% — real data via Yahoo Finance',
      'Debt-to-Equity < 1.0 — real data via Yahoo Finance',
      'Dropped > 2% in last 5 trading days',
    ],
    keyIndicators: ['RSI', 'ROE (Yahoo)', 'D/E (Yahoo)', 'Profit Margin'],
    gradient: 'linear-gradient(135deg, #14b8a6, #0d9488)',
    accentColor: '#14b8a6',
  },
  {
    id: 10,
    name: 'Institutional Accumulation',
    type: 'Trend',
    icon: '🏦',
    holdingPeriod: '5–15 days',
    winRate: '56–60%',
    riskReward: '1:2.5',
    description: 'Follow the smart money. When volume surges above 1.8x average sustained over multiple days with price trending up, institutions are quietly building positions.',
    rules: [
      'Volume > 1.8x 20-day average (today)',
      '2+ of last 5 days above-average volume (sustained)',
      'Price trending up (2+ gaining days out of 5)',
      'Price above EMA 20',
    ],
    keyIndicators: ['Volume', 'Multi-Day Flow', 'EMA 20', 'Price Action'],
    gradient: 'linear-gradient(135deg, #6366f1, #4f46e5)',
    accentColor: '#6366f1',
  },
];

// ─── Types ──────────────────────────────────────────────────────────
interface StrategyMatch {
  symbol: string;
  price: number;
  entry: number;
  target: number;
  stopLoss: number;
  signalStrength: number;
  signals: string[];
  fundamentals?: {
    roe: number;
    debtToEquity: number;
    peRatio: number;
    profitMargin: number;
    revenueGrowth: number;
    currentRatio: number;
    source: 'yahoo';
  };
}

interface ScreenResult {
  strategyId: number;
  matches: StrategyMatch[];
  totalScanned: number;
  matchCount: number;
  scanTime: string;
  cached?: boolean;
}

type FilterType = 'All' | 'Trend' | 'Reversal' | 'Breakout' | 'Value';

// ─── Main Page Component ────────────────────────────────────────────
export default function StrategiesPage() {
  const [activeFilter, setActiveFilter] = useState<FilterType>('All');
  const [runningStrategy, setRunningStrategy] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, ScreenResult>>({});
  const [expandedCard, setExpandedCard] = useState<number | null>(null);

  const filteredStrategies = STRATEGIES.filter(
    (s) => activeFilter === 'All' || s.type === activeFilter
  );

  async function runScreen(strategyId: number) {
    setRunningStrategy(strategyId);
    setExpandedCard(strategyId);

    try {
      const res = await fetch(`/api/strategies/screen?strategy=${strategyId}`);
      const data: ScreenResult = await res.json();
      setResults((prev) => ({ ...prev, [strategyId]: data }));
    } catch (err) {
      console.error('Screen failed:', err);
    } finally {
      setRunningStrategy(null);
    }
  }

  const filterButtons: { label: FilterType; icon: string }[] = [
    { label: 'All', icon: '🔍' },
    { label: 'Trend', icon: '📈' },
    { label: 'Reversal', icon: '🔄' },
    { label: 'Breakout', icon: '💥' },
    { label: 'Value', icon: '💎' },
  ];

  return (
    <div style={{ width: '100%', maxWidth: '100%' }}>
      {/* ── Header ── */}
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 'clamp(24px, 4vw, 32px)' }}>🧪</span>
            <h1 style={{
              fontSize: 'clamp(22px, 4vw, 32px)',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6, #a78bfa)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: 0,
              letterSpacing: '-0.02em',
            }}>
              Proven Strategy Hub
            </h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15, margin: 0, maxWidth: 700 }}>
            10 battle-tested swing trading strategies scanning <strong style={{ color: '#a78bfa' }}>250 NSE stocks</strong> across
            large-cap, mid-cap, and small-cap to find hidden gems using live OHLCV data.
          </p>
        </div>

        {/* ── Filter Bar ── */}
        <div style={{
          display: 'flex',
          gap: 8,
          marginBottom: 28,
          flexWrap: 'wrap',
        }}>
          {filterButtons.map((fb) => (
            <button
              key={fb.label}
              onClick={() => setActiveFilter(fb.label)}
              style={{
                padding: '8px 18px',
                borderRadius: 10,
                border: activeFilter === fb.label
                  ? '1px solid rgba(99, 102, 241, 0.5)'
                  : '1px solid var(--border-color)',
                background: activeFilter === fb.label
                  ? 'rgba(99, 102, 241, 0.15)'
                  : 'var(--bg-card)',
                color: activeFilter === fb.label ? '#a78bfa' : 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>{fb.icon}</span>
              {fb.label}
            </button>
          ))}

          <div style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
            {filteredStrategies.length} strategies
          </div>
        </div>

        {/* ── Strategy Cards Grid ── */}
        <div className="strategy-grid" style={{
          gap: 20,
        }}>
          {filteredStrategies.map((strategy) => (
            <StrategyCard
              key={strategy.id}
              strategy={strategy}
              isRunning={runningStrategy === strategy.id}
              isExpanded={expandedCard === strategy.id}
              result={results[strategy.id]}
              onRunScreen={() => runScreen(strategy.id)}
              onToggleExpand={() =>
                setExpandedCard(expandedCard === strategy.id ? null : strategy.id)
              }
            />
          ))}
        </div>

        {/* ── Disclaimer ── */}
        <div style={{
          marginTop: 40,
          padding: '16px 20px',
          borderRadius: 12,
          background: 'rgba(245, 158, 11, 0.06)',
          border: '1px solid rgba(245, 158, 11, 0.15)',
          color: 'var(--text-muted)',
          fontSize: 12,
          lineHeight: 1.6,
        }}>
          <strong style={{ color: '#f59e0b' }}>⚠️ Disclaimer:</strong>{' '}
          These strategies are for educational and research purposes only. Past performance does not guarantee future results.
          All data is sourced from <strong style={{ color: 'var(--text-secondary)' }}>Yahoo Finance</strong> (OHLCV, fundamentals, volume).
          Always backtest on your own data, manage risk with proper position sizing, and never risk more than 2% of capital per trade.
        </div>
      </div>
    </div>
  );
}

// ─── Strategy Card Component ────────────────────────────────────────
function StrategyCard({
  strategy,
  isRunning,
  isExpanded,
  result,
  onRunScreen,
  onToggleExpand,
}: {
  strategy: StrategyDef;
  isRunning: boolean;
  isExpanded: boolean;
  result?: ScreenResult;
  onRunScreen: () => void;
  onToggleExpand: () => void;
}) {
  const hasResults = !!result;

  return (
    <div
      style={{
        borderRadius: 16,
        border: `1px solid ${hasResults && result.matchCount > 0 ? strategy.accentColor + '40' : 'var(--border-color)'}`,
        background: 'var(--bg-card)',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
        position: 'relative',
      }}
    >
      {/* Gradient Top Accent */}
      <div style={{
        height: 3,
        background: strategy.gradient,
        borderRadius: '16px 16px 0 0',
      }} />

      <div style={{ padding: '20px 22px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontSize: 28,
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 12,
              background: strategy.accentColor + '15',
            }}>
              {strategy.icon}
            </span>
            <div>
              <h3 style={{
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
                lineHeight: 1.3,
              }}>
                {strategy.name}
              </h3>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: strategy.accentColor + '20',
                  color: strategy.accentColor,
                }}>
                  {strategy.type}
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-muted)',
                }}>
                  #{strategy.id}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        <p style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          margin: '0 0 14px 0',
        }}>
          {strategy.description}
        </p>

        {/* Stats Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
          marginBottom: 14,
        }}>
          <div style={{
            padding: '8px 10px',
            borderRadius: 8,
            background: 'var(--bg-elevated)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Win Rate</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>{strategy.winRate}</div>
          </div>
          <div style={{
            padding: '8px 10px',
            borderRadius: 8,
            background: 'var(--bg-elevated)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>R:R</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6' }}>{strategy.riskReward}</div>
          </div>
          <div style={{
            padding: '8px 10px',
            borderRadius: 8,
            background: 'var(--bg-elevated)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Hold</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{strategy.holdingPeriod}</div>
          </div>
        </div>

        {/* Rules (collapsible) */}
        <button
          onClick={onToggleExpand}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: isExpanded ? 12 : 14,
            transition: 'all 0.2s ease',
          }}
        >
          <span>📋 Entry Rules & Indicators</span>
          <span style={{
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            fontSize: 14,
          }}>
            ▼
          </span>
        </button>

        {isExpanded && (
          <div style={{
            marginBottom: 14,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(15, 20, 42, 0.6)',
            border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Entry Rules
            </div>
            {strategy.rules.map((rule, i) => (
              <div key={i} style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                marginBottom: i < strategy.rules.length - 1 ? 6 : 0,
              }}>
                <span style={{
                  color: strategy.accentColor,
                  fontSize: 10,
                  marginTop: 3,
                  flexShrink: 0,
                }}>●</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {rule}
                </span>
              </div>
            ))}
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {strategy.keyIndicators.map((ind) => (
                <span key={ind} style={{
                  fontSize: 10,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: strategy.accentColor + '12',
                  color: strategy.accentColor,
                  fontWeight: 600,
                }}>
                  {ind}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Run Screen Button */}
        <button
          onClick={onRunScreen}
          disabled={isRunning}
          style={{
            width: '100%',
            padding: '10px 16px',
            borderRadius: 10,
            border: 'none',
            background: isRunning ? 'var(--bg-elevated)' : strategy.gradient,
            color: isRunning ? 'var(--text-muted)' : '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: isRunning ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'all 0.2s ease',
            opacity: isRunning ? 0.7 : 1,
          }}
        >
          {isRunning ? (
            <>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
              Deep-scanning 250 NSE stocks...
            </>
          ) : hasResults ? (
            <>🔄 Re-Scan 250 Stocks</>
          ) : (
            <>🔍 Scan 250 NSE Stocks</>
          )}
        </button>

        {/* Results */}
        {hasResults && (
          <ScreenResults result={result} strategy={strategy} />
        )}
      </div>

      {/* Spin animation */}
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── Screen Results Component ───────────────────────────────────────
function ScreenResults({ result, strategy }: { result: ScreenResult; strategy: StrategyDef }) {
  if (!result) return null;

  return (
    <div style={{
      marginTop: 14,
      borderTop: '1px solid var(--border-subtle)',
      paddingTop: 14,
    }}>
      {/* Summary Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
      }}>
        <span style={{
          fontSize: 13,
          fontWeight: 700,
          color: result.matchCount > 0 ? '#10b981' : 'var(--text-muted)',
        }}>
          {result.matchCount > 0
            ? `✅ ${result.matchCount} stocks matched`
            : '❌ No matches today'}
        </span>
        <span style={{
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          Scanned {result.totalScanned} stocks
          {result.cached && ' (cached)'}
        </span>
      </div>

      {/* Match Cards */}
      {result.matches.map((match) => (
        <Link
          key={match.symbol}
          href={`/stock/${match.symbol}`}
          style={{ textDecoration: 'none' }}
        >
          <div style={{
            padding: '12px 14px',
            borderRadius: 10,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            marginBottom: 8,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = strategy.accentColor + '50';
            (e.currentTarget as HTMLElement).style.background = 'rgba(30, 38, 65, 0.7)';
          }}
          onMouseOut={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)';
            (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)';
          }}
          >
            {/* Stock Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  letterSpacing: '0.02em',
                }}>
                  {match.symbol}
                </span>
                <span style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                }}>
                  ₹{match.price.toLocaleString('en-IN')}
                </span>
              </div>

              {/* Signal Strength Badge */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <div style={{
                  width: 50,
                  height: 5,
                  borderRadius: 3,
                  background: 'var(--bg-input)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${match.signalStrength}%`,
                    height: '100%',
                    borderRadius: 3,
                    background: match.signalStrength >= 80 ? '#10b981'
                      : match.signalStrength >= 65 ? '#3b82f6'
                      : '#f59e0b',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: match.signalStrength >= 80 ? '#10b981'
                    : match.signalStrength >= 65 ? '#3b82f6'
                    : '#f59e0b',
                }}>
                  {match.signalStrength}%
                </span>
              </div>
            </div>

            {/* Entry / Target / SL */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 6,
              marginBottom: 8,
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Entry</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>₹{match.entry.toLocaleString('en-IN')}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Target</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>₹{match.target.toLocaleString('en-IN')}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Stop Loss</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#f43f5e' }}>₹{match.stopLoss.toLocaleString('en-IN')}</div>
              </div>
            </div>

            {/* Signals */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {match.signals.slice(0, 3).map((signal, i) => (
                <span key={i} style={{
                  fontSize: 10,
                  padding: '2px 7px',
                  borderRadius: 5,
                  background: strategy.accentColor + '12',
                  color: strategy.accentColor,
                  fontWeight: 500,
                  lineHeight: 1.5,
                }}>
                  {signal}
                </span>
              ))}
              {match.signals.length > 3 && (
                <span style={{
                  fontSize: 10,
                  padding: '2px 7px',
                  borderRadius: 5,
                  background: 'var(--bg-input)',
                  color: 'var(--text-muted)',
                }}>
                  +{match.signals.length - 3} more
                </span>
              )}
            </div>

            {/* Fundamentals (for Strategy 9 — REAL Yahoo Finance data) */}
            {match.fundamentals && (
              <div style={{
                marginTop: 8,
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                fontSize: 10,
                color: 'var(--text-muted)',
                paddingTop: 6,
                borderTop: '1px solid var(--border-subtle)',
              }}>
                <span>ROE <strong style={{ color: '#10b981' }}>{match.fundamentals.roe}%</strong></span>
                <span>D/E <strong style={{ color: match.fundamentals.debtToEquity < 0.5 ? '#10b981' : '#f59e0b' }}>{match.fundamentals.debtToEquity}</strong></span>
                <span>PE <strong style={{ color: '#3b82f6' }}>{match.fundamentals.peRatio}</strong></span>
                <span>Margin <strong style={{ color: match.fundamentals.profitMargin > 10 ? '#10b981' : 'var(--text-secondary)' }}>{match.fundamentals.profitMargin}%</strong></span>
                <span style={{ fontSize: 9, color: 'var(--accent-teal)', fontStyle: 'italic' }}>via Yahoo Finance</span>
              </div>
            )}
          </div>
        </Link>
      ))}

      {/* No matches message */}
      {result.matchCount === 0 && (
        <div style={{
          padding: '16px',
          borderRadius: 10,
          background: 'var(--bg-elevated)',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: 13,
        }}>
          <span style={{ fontSize: 24, display: 'block', marginBottom: 6 }}>🔎</span>
          No stocks currently match this strategy's criteria.
          <br />
          <span style={{ fontSize: 11 }}>This is normal — strict filters mean fewer but higher-quality signals.</span>
        </div>
      )}
    </div>
  );
}
