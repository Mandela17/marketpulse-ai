'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// ─── Types ──────────────────────────────────────────────────────────

interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}

interface OICell {
  price: 'up' | 'down';
  oi: 'up' | 'down';
  label: string;
  type: 'bullish' | 'bearish';
  icon: string;
  explanation: string;
}

// ─── Module Data ────────────────────────────────────────────────────

const modules = [
  { id: 'technicals', label: 'Core Technicals & Volume', icon: '📊', color: '#3b82f6' },
  { id: 'derivatives', label: 'Derivatives & Smart Money', icon: '📋', color: '#8b5cf6' },
  { id: 'algorithm', label: 'App Algorithm & Grading', icon: '🤖', color: '#00d68f' },
  { id: 'risk', label: 'Risk & Kelly Strategy', icon: '🛡️', color: '#fbbf24' },
  { id: 'workflow', label: 'Daily Trader Workflow', icon: '📅', color: '#ff6b6b' },
];

// ─── Quiz Data ──────────────────────────────────────────────────────

const quizzes: Record<string, QuizQuestion[]> = {
  technicals: [
    {
      question: 'RSI is at 78. What does this signal?',
      options: ['Strong Buy — momentum is bullish', 'Overbought — potential pullback ahead', 'Neutral — no signal', 'Oversold — bounce likely'],
      correct: 1,
      explanation: 'RSI > 70 is considered overbought. The stock has risen too fast and may be due for a mean-reversion pullback. Smart traders look to book profits, not initiate new long positions.',
    },
    {
      question: 'MACD line crosses ABOVE the Signal line. This is a:',
      options: ['Death Cross — sell signal', 'Bullish Crossover — buy signal', 'No signal — wait for confirmation', 'Bearish divergence'],
      correct: 1,
      explanation: 'When the MACD line crosses above the signal line, it indicates increasing bullish momentum. The histogram turns positive, confirming the crossover.',
    },
    {
      question: 'Price touches the lower Bollinger Band with RSI at 25. What setup is this?',
      options: ['Breakdown — sell immediately', 'Mean Reversion Buy — oversold bounce', 'Consolidation — no trade', 'Trend continuation'],
      correct: 1,
      explanation: 'Price at the lower Bollinger Band + RSI < 30 = double oversold confirmation. This is a classic mean-reversion setup where a bounce back toward the middle band (20-SMA) is statistically likely.',
    },
  ],
  derivatives: [
    {
      question: 'PCR (Put-Call Ratio) is at 1.45. What does this indicate?',
      options: ['Extremely bearish — market will crash', 'Bullish — excessive put writing suggests support', 'Neutral market', 'Time to buy puts'],
      correct: 1,
      explanation: 'High PCR (>1.2) means more puts are being written than calls. Option sellers (who are usually institutional players) are confident the market won\'t fall below put strikes — this is bullish.',
    },
    {
      question: 'Price is going UP and Open Interest is also going UP. What type of build-up is this?',
      options: ['Short Covering', 'Long Build-up (Strong Bullish)', 'Short Build-up', 'Long Unwinding'],
      correct: 1,
      explanation: 'Price ↑ + OI ↑ = New long positions being created. Fresh money is entering the market on the buy side. This is the strongest bullish signal in OI analysis.',
    },
    {
      question: 'FII sold ₹3,500 Cr in cash market today. What does this mean?',
      options: ['Guaranteed crash tomorrow', 'Institutional selling pressure — bearish bias', 'No impact on markets', 'DII will always compensate'],
      correct: 1,
      explanation: 'FII selling > ₹1000 Cr is considered significant institutional outflow. While DII may partially offset, sustained FII selling creates structural bearish pressure on the market.',
    },
  ],
  algorithm: [
    {
      question: 'The GBDT model says BUY but the Heuristic says SELL. What grade does the app assign?',
      options: ['A — Strong Buy', 'B — Moderate', 'C or lower — No Trade', 'The app averages them'],
      correct: 2,
      explanation: 'For A or B grade, BOTH sub-models must agree on direction. When GBDT and Heuristic disagree, the confidence is discounted by 8% and the trade gets a C grade or lower = DO NOT TRADE.',
    },
    {
      question: 'A stock has confluence score 5/6 and 70% confidence. What grade?',
      options: ['A — Strong Trade', 'B — Moderate', 'C — No Trade', 'D — Avoid'],
      correct: 0,
      explanation: 'With 5/6 confluence (≥4 required), 70% confidence (≥62% required), and assuming both models agree, this earns an A grade = strongest trade signal the system can produce.',
    },
  ],
  risk: [
    {
      question: 'Your system has 45% win rate, average win = ₹3000, average loss = ₹1000. Is this profitable?',
      options: ['No — less than 50% win rate means losing money', 'Yes — Expected Value is positive', 'Depends on the market', 'Need more data'],
      correct: 1,
      explanation: 'EV = (0.45 × ₹3000) - (0.55 × ₹1000) = ₹1350 - ₹550 = +₹800 per trade. Despite losing more often than winning, the 3:1 reward-to-risk ratio makes this highly profitable.',
    },
    {
      question: 'India VIX jumps from 13 to 28. How should your stop-loss change?',
      options: ['Tighten stops to minimize loss', 'Widen stops — high volatility causes larger swings', 'Keep stops the same', 'Remove stops entirely'],
      correct: 1,
      explanation: 'High VIX = high volatility. Tight stops will get triggered by normal market noise. The app uses VIX-adaptive stops: at VIX 28, stops are widened by 1.8x ATR to account for larger swings.',
    },
  ],
  workflow: [
    {
      question: 'It\'s 9:05 AM IST. The app shows 0 Active Trade Signals (all stocks are C/D grade). What should you do?',
      options: ['Force a trade anyway on the best C-grade stock', 'Do nothing — wait for better setups tomorrow', 'Switch to intraday scalping', 'Increase position size to compensate'],
      correct: 1,
      explanation: 'The #1 rule of selective trading: NO TRADE is a valid trade. If the system shows no A/B signals, the disciplined action is to sit on your hands. Trading C-grade signals destroys your edge.',
    },
  ],
};

// ─── OI Decoder Data ────────────────────────────────────────────────

const oiMatrix: OICell[] = [
  { price: 'up', oi: 'up', label: 'Long Build-up', type: 'bullish', icon: '🟢', explanation: 'New long positions being created. Fresh money entering on buy side. This is the STRONGEST bullish signal. Traders are opening new buy positions with conviction. Often seen at the start of a new uptrend.' },
  { price: 'up', oi: 'down', label: 'Short Covering', type: 'bullish', icon: '🟡', explanation: 'Existing short positions being closed (bought back). Bears are exiting. Price rises because short sellers are buying back to close. This is a WEAKER bullish signal as it\'s not new buying — it\'s old shorts exiting. Rally may be temporary.' },
  { price: 'down', oi: 'up', label: 'Short Build-up', type: 'bearish', icon: '🔴', explanation: 'New short positions being created. Fresh money entering on sell side. This is the STRONGEST bearish signal. Traders are opening new sell positions with conviction. Often seen at the start of a new downtrend.' },
  { price: 'down', oi: 'down', label: 'Long Unwinding', type: 'bearish', icon: '🟠', explanation: 'Existing long positions being closed (sold). Bulls are exiting. Price falls because long holders are selling to exit. This is a WEAKER bearish signal as it\'s not new selling — it\'s old longs exiting. Decline may be temporary.' },
];

// ─── Main Component ─────────────────────────────────────────────────

export default function LearningAcademy() {
  const [activeModule, setActiveModule] = useState('technicals');
  const [completedModules, setCompletedModules] = useState<Set<string>>(new Set());
  const [quizAnswers, setQuizAnswers] = useState<Record<string, Record<number, number | null>>>({});
  const [selectedOI, setSelectedOI] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  type ConfluenceKey = 'Technical' | 'Bollinger' | 'Volume' | 'Institutional' | 'Sentiment' | 'Options';
  const [confluenceState, setConfluenceState] = useState<Record<ConfluenceKey, boolean>>({
    Technical: false, Bollinger: false, Volume: false,
    Institutional: false, Sentiment: false, Options: false,
  });
  const [calcModelsAgree, setCalcModelsAgree] = useState(true);
  const [calcConfidence, setCalcConfidence] = useState(65);

  // Kelly calculator state
  const [kellyCapital, setKellyCapital] = useState(100000);
  const [kellySizing, setKellySizing] = useState(2.5);

  // Progress
  const progress = Math.round((completedModules.size / modules.length) * 100);

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('academy_progress');
      if (saved) setCompletedModules(new Set(JSON.parse(saved)));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('academy_progress', JSON.stringify([...completedModules]));
    } catch {}
  }, [completedModules]);

  const markComplete = (id: string) => {
    setCompletedModules(prev => new Set([...prev, id]));
  };

  const handleQuizAnswer = (moduleId: string, qIdx: number, ansIdx: number) => {
    setQuizAnswers(prev => ({
      ...prev,
      [moduleId]: { ...(prev[moduleId] || {}), [qIdx]: ansIdx },
    }));
  };

  // Confluence calculator logic
  const confluenceCount = Object.values(confluenceState).filter(Boolean).length;
  const calcGrade = (() => {
    if (confluenceCount >= 4 && calcConfidence >= 62 && calcModelsAgree) return 'A';
    if (confluenceCount >= 3 && calcConfidence >= 58 && calcModelsAgree) return 'B';
    if (confluenceCount >= 2 && calcConfidence >= 55) return 'C';
    if (confluenceCount >= 1) return 'D';
    return 'F';
  })();

  // ─── Formula Component ──────────────────────────────────────────────

  const Formula = ({ label, formula, desc }: { label: string; formula: string; desc: string }) => (
    <div className="my-4 p-4 rounded-xl" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
      <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--accent-blue)' }}>📐 {label}</p>
      <pre className="text-sm font-mono font-bold text-white mb-2 overflow-x-auto">{formula}</pre>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
    </div>
  );

  // ─── Signal Box Component ───────────────────────────────────────────

  const SignalBox = ({ icon, title, signal, color }: { icon: string; title: string; signal: string; color: string }) => (
    <div className="p-3 rounded-lg text-center" style={{ background: `${color}10`, border: `1px solid ${color}30` }}>
      <p className="text-lg mb-1">{icon}</p>
      <p className="text-xs font-bold" style={{ color }}>{title}</p>
      <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{signal}</p>
    </div>
  );

  // ─── Chart Visual (CSS) ─────────────────────────────────────────────

  const ChartVisual = ({ title, type }: { title: string; type: 'ema' | 'bollinger' }) => (
    <div className="my-4 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)' }}>
      <p className="text-xs font-bold mb-3 text-white">{title}</p>
      <div className="relative h-32 flex items-end gap-[2px]">
        {type === 'ema' ? (
          // EMA Crossover visualization
          <>
            {[38,35,32,30,28,31,34,38,42,47,52,55,58,62,65,70,73,75,72,68].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-sm transition-all" style={{
                height: `${h}%`,
                background: i < 10 ? 'rgba(255,77,106,0.4)' : 'rgba(0,214,143,0.4)',
              }} />
            ))}
            {/* EMA lines overlay */}
            <div className="absolute inset-0 flex items-center">
              <svg width="100%" height="100%" viewBox="0 0 200 100" preserveAspectRatio="none">
                <polyline points="0,62 20,65 40,68 60,70 80,68 100,65 120,60 140,55 160,48 180,42 200,38" fill="none" stroke="#3b82f6" strokeWidth="2" />
                <polyline points="0,58 20,60 40,63 60,66 80,67 100,66 120,63 140,58 160,52 180,45 200,40" fill="none" stroke="#fbbf24" strokeWidth="2" strokeDasharray="4" />
              </svg>
            </div>
            <div className="absolute top-2 right-2 flex gap-2 text-[9px]">
              <span style={{ color: '#3b82f6' }}>━ EMA 20</span>
              <span style={{ color: '#fbbf24' }}>┅ EMA 50</span>
            </div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] px-2 py-0.5 rounded" style={{ background: 'rgba(0,214,143,0.2)', color: '#00d68f' }}>
              ✦ Golden Cross
            </div>
          </>
        ) : (
          // Bollinger Band visualization
          <>
            {[50,48,45,40,35,30,28,25,28,32,38,42,48,52,55,58,55,52,50,48].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-sm" style={{
                height: `${h}%`,
                background: i >= 5 && i <= 8 ? 'rgba(0,214,143,0.5)' : 'rgba(255,255,255,0.1)',
              }} />
            ))}
            {/* BB bands overlay */}
            <div className="absolute inset-0">
              <svg width="100%" height="100%" viewBox="0 0 200 100" preserveAspectRatio="none">
                <polyline points="0,20 40,22 60,25 80,30 100,28 120,22 160,18 200,20" fill="none" stroke="rgba(139,92,246,0.5)" strokeWidth="1" />
                <polyline points="0,50 40,52 60,50 80,48 100,50 120,50 160,50 200,50" fill="none" stroke="rgba(139,92,246,0.3)" strokeWidth="1" strokeDasharray="3" />
                <polyline points="0,80 40,78 60,75 80,70 100,72 120,78 160,82 200,80" fill="none" stroke="rgba(139,92,246,0.5)" strokeWidth="1" />
              </svg>
            </div>
            <div className="absolute top-2 right-2 text-[9px]" style={{ color: '#8b5cf6' }}>━ Bollinger Bands</div>
            <div className="absolute bottom-1 left-[30%] text-[9px] px-2 py-0.5 rounded" style={{ background: 'rgba(0,214,143,0.2)', color: '#00d68f' }}>
              ↑ Mean Reversion Buy
            </div>
          </>
        )}
      </div>
    </div>
  );

  // ─── Quiz Component ─────────────────────────────────────────────────

  const QuizWidget = ({ moduleId }: { moduleId: string }) => {
    const questions = quizzes[moduleId] || [];
    if (questions.length === 0) return null;
    const answers = quizAnswers[moduleId] || {};
    const allAnswered = questions.every((_, i) => answers[i] != null);
    const correctCount = questions.filter((q, i) => answers[i] === q.correct).length;

    return (
      <div className="mt-8 p-5 rounded-xl" style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.2)' }}>
        <h3 className="text-sm font-bold text-white mb-4">🧠 Quick Quiz — Test Your Understanding</h3>
        <div className="space-y-5">
          {questions.map((q, qIdx) => (
            <div key={qIdx}>
              <p className="text-xs font-bold text-white mb-2">Q{qIdx + 1}. {q.question}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {q.options.map((opt, oIdx) => {
                  const answered = answers[qIdx] != null;
                  const isSelected = answers[qIdx] === oIdx;
                  const isCorrect = oIdx === q.correct;
                  let bg = 'rgba(255,255,255,0.03)';
                  let border = 'var(--border-color)';
                  let color = 'var(--text-secondary)';
                  if (answered && isCorrect) { bg = 'rgba(0,214,143,0.1)'; border = 'rgba(0,214,143,0.4)'; color = '#00d68f'; }
                  if (answered && isSelected && !isCorrect) { bg = 'rgba(255,77,106,0.1)'; border = 'rgba(255,77,106,0.4)'; color = '#ff4d6a'; }

                  return (
                    <button key={oIdx}
                      onClick={() => !answered && handleQuizAnswer(moduleId, qIdx, oIdx)}
                      disabled={answered}
                      className="text-left p-2.5 rounded-lg text-xs transition-all cursor-pointer"
                      style={{ background: bg, border: `1px solid ${border}`, color, opacity: answered && !isSelected && !isCorrect ? 0.4 : 1 }}>
                      <span className="font-bold mr-1">{String.fromCharCode(65 + oIdx)}.</span> {opt}
                      {answered && isCorrect && ' ✓'}
                      {answered && isSelected && !isCorrect && ' ✗'}
                    </button>
                  );
                })}
              </div>
              {answers[qIdx] != null && (
                <div className="mt-2 p-2.5 rounded-lg text-[11px]" style={{
                  background: answers[qIdx] === q.correct ? 'rgba(0,214,143,0.06)' : 'rgba(255,77,106,0.06)',
                  color: 'var(--text-secondary)',
                }}>
                  💡 {q.explanation}
                </div>
              )}
            </div>
          ))}
        </div>
        {allAnswered && (
          <div className="mt-4 p-3 rounded-lg text-center" style={{
            background: correctCount === questions.length ? 'rgba(0,214,143,0.1)' : 'rgba(255,184,0,0.1)',
            color: correctCount === questions.length ? '#00d68f' : '#fbbf24',
          }}>
            <p className="text-sm font-bold">Score: {correctCount}/{questions.length} {correctCount === questions.length ? '🎉 Perfect!' : '— Review the explanations above'}</p>
          </div>
        )}
      </div>
    );
  };

  // ─── MODULE CONTENT RENDERERS ─────────────────────────────────────

  const renderTechnicals = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">📊 Module 1: Core Technical Indicators</h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Technical analysis is the foundation of algorithmic trading. These indicators form the "Technical" category in our 6-factor confluence system.</p>
      </div>

      {/* RSI */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2">1️⃣ RSI — Relative Strength Index</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          Developed by J. Welles Wilder in 1978, RSI measures the speed and magnitude of price changes to identify overbought or oversold conditions. It oscillates between 0 and 100.
        </p>
        <Formula
          label="RSI Formula (Wilder's Smoothing)"
          formula={`RSI = 100 - (100 / (1 + RS))\n\nRS = Average Gain (14 periods) / Average Loss (14 periods)\n\nFirst Average Gain = Sum of Gains over 14 periods / 14\nSubsequent = (Prev Avg Gain × 13 + Current Gain) / 14`}
          desc="Wilder's smoothing uses exponentially weighted averages rather than simple averages. The 14-period lookback is standard."
        />
        <div className="grid grid-cols-3 gap-3 mb-3">
          <SignalBox icon="🔴" title="Overbought" signal="RSI > 70" color="#ff4d6a" />
          <SignalBox icon="⚪" title="Neutral" signal="30 < RSI < 70" color="#888" />
          <SignalBox icon="🟢" title="Oversold" signal="RSI < 30" color="#00d68f" />
        </div>
        <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.15)', color: 'var(--text-secondary)' }}>
          <span className="font-bold text-yellow-400">⚡ Pro Tip:</span> RSI works best in ranging markets. In strong trends, RSI can stay overbought (&gt;70) for weeks. Use RSI divergences (price makes new high but RSI doesn&apos;t) for more reliable reversal signals.
        </div>
        <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: 'rgba(0,214,143,0.04)', color: 'var(--text-secondary)' }}>
          <span className="font-bold text-green-400">📱 In This App:</span> RSI is computed using Wilder's 14-period smoothing on Yahoo Finance OHLCV data. When RSI &lt; 40, the "Technical" confluence category scores +1 bullish. When RSI &gt; 60, it scores -1 (bearish).
        </div>
      </section>

      {/* MACD */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2">2️⃣ MACD — Moving Average Convergence Divergence</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          Created by Gerald Appel, MACD shows the relationship between two EMAs. It's a trend-following momentum indicator that reveals changes in the strength, direction, momentum, and duration of a trend.
        </p>
        <Formula
          label="MACD Components"
          formula={`MACD Line    = EMA(12) - EMA(26)\nSignal Line  = EMA(9) of MACD Line\nHistogram    = MACD Line - Signal Line`}
          desc="The histogram visualizes momentum. When the histogram grows, momentum is accelerating. When it shrinks, momentum is decelerating."
        />
        <div className="grid grid-cols-2 gap-3">
          <SignalBox icon="📈" title="Bullish Crossover" signal="MACD crosses above Signal" color="#00d68f" />
          <SignalBox icon="📉" title="Bearish Crossover" signal="MACD crosses below Signal" color="#ff4d6a" />
        </div>
        <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: 'rgba(0,214,143,0.04)', color: 'var(--text-secondary)' }}>
          <span className="font-bold text-green-400">📱 In This App:</span> Positive MACD histogram = +1 for Technical confluence category (bullish). Negative histogram = -1 (bearish). Used alongside RSI and EMA trend for the combined Technical score.
        </div>
      </section>

      {/* EMA */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2">3️⃣ EMA 20 & EMA 50 — Exponential Moving Averages</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          Unlike Simple Moving Averages (SMA) which weight all prices equally, EMAs give more weight to recent prices, making them faster to react. The 20-day and 50-day EMAs are the most widely used by institutional traders.
        </p>
        <Formula
          label="EMA Calculation"
          formula={`Multiplier = 2 / (Period + 1)\n\nEMA(20) multiplier = 2/21 = 0.0952\nEMA(50) multiplier = 2/51 = 0.0392\n\nEMA = (Close - Previous EMA) × Multiplier + Previous EMA`}
          desc="Higher multiplier = faster reaction. EMA(20) reacts to price changes 2.4x faster than EMA(50)."
        />
        <ChartVisual title="EMA 20/50 Golden Cross — Bullish Signal" type="ema" />
        <div className="grid grid-cols-2 gap-3">
          <SignalBox icon="✨" title="Golden Cross" signal="EMA20 crosses above EMA50" color="#00d68f" />
          <SignalBox icon="💀" title="Death Cross" signal="EMA20 crosses below EMA50" color="#ff4d6a" />
        </div>
        <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: 'rgba(0,214,143,0.04)', color: 'var(--text-secondary)' }}>
          <span className="font-bold text-green-400">📱 In This App:</span> Price &gt; EMA20 = +1 bullish score in Technical category. Price &lt; EMA20 = -1 bearish. This is combined with RSI and MACD for the overall Technical confluence signal.
        </div>
      </section>

      {/* Bollinger Bands */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2">4️⃣ Bollinger Bands — Volatility & Mean Reversion</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          Created by John Bollinger, these bands expand and contract based on volatility (standard deviation). Prices tend to revert to the mean (middle band). Squeezes signal upcoming breakouts.
        </p>
        <Formula
          label="Bollinger Bands"
          formula={`Middle Band = SMA(20)\nUpper Band  = SMA(20) + 2 × σ(20)\nLower Band  = SMA(20) - 2 × σ(20)\n\nσ(20) = Standard Deviation of closing prices over 20 periods`}
          desc="95% of price action occurs within 2 standard deviations. Prices touching or exceeding the bands are considered extreme."
        />
        <ChartVisual title="Bollinger Band Mean Reversion — Price bouncing off lower band" type="bollinger" />
        <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: 'rgba(0,214,143,0.04)', color: 'var(--text-secondary)' }}>
          <span className="font-bold text-green-400">📱 In This App:</span> Price below lower band = "Bollinger" confluence category scores bullish. Price above upper band = bearish. This is an INDEPENDENT category from Technical (RSI/MACD/EMA) to avoid double-counting.
        </div>
      </section>

      {/* ATR */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2">5️⃣ ATR — Average True Range</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          ATR measures volatility, not direction. It tells you how much a stock typically moves per day. Used for setting stop-loss and target levels proportional to the stock's normal range.
        </p>
        <Formula
          label="ATR Formula"
          formula={`True Range = MAX(\n  High - Low,\n  |High - Previous Close|,\n  |Low - Previous Close|\n)\n\nATR(14) = Wilder's smoothed average of True Range over 14 periods`}
          desc="If ATR = ₹15 for a stock trading at ₹1500, it means the stock moves ~1% per day on average."
        />
        <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: 'rgba(0,214,143,0.04)', color: 'var(--text-secondary)' }}>
          <span className="font-bold text-green-400">📱 In This App:</span> ATR is the backbone of risk management. Stop-loss = 1×ATR, Target 1 = 1×ATR, Target 2 = 2×ATR. The risk engine adjusts ATR by a VIX multiplier (1.0–2.2x) depending on market fear levels.
        </div>
      </section>

      {/* Volume Profile */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2">6️⃣ Volume Profile & Point of Control (POC)</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          Volume Profile shows the amount of trading activity at different price levels. The Point of Control (POC) is the price level with the highest traded volume — it acts as a "fair value" magnet.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <SignalBox icon="🏔️" title="High Volume Node (HVN)" signal="Support/Resistance zone — price tends to consolidate here" color="#3b82f6" />
          <SignalBox icon="🏜️" title="Low Volume Node (LVN)" signal="Price moves quickly through — breakout/breakdown zone" color="#ff6b6b" />
        </div>
        <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(0,214,143,0.04)', color: 'var(--text-secondary)' }}>
          <span className="font-bold text-green-400">📱 In This App:</span> Volume ratio (today's volume / 20-day average) is used in the "Volume" confluence category. Volume &gt; 1.3x in an uptrend = bullish confirmation. High delivery% (&gt;55%) signals genuine institutional buying, not speculative trading.
        </div>
      </section>

      <div className="text-center">
        <button onClick={() => markComplete('technicals')} className="px-6 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all hover:scale-105"
          style={{ background: completedModules.has('technicals') ? 'rgba(0,214,143,0.2)' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white' }}>
          {completedModules.has('technicals') ? '✓ Module Complete' : 'Mark Module as Complete'}
        </button>
      </div>

      <QuizWidget moduleId="technicals" />
    </div>
  );

  const renderDerivatives = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">📋 Module 2: Derivatives & Smart Money Tracking</h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Options and futures data reveals what institutional "smart money" is doing — information not visible in price charts alone.</p>
      </div>

      {/* PCR */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2">1️⃣ PCR — Put-Call Ratio</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          PCR measures the ratio of put options to call options. It's a contrarian indicator: when everyone is buying puts (bearish), the market often reverses upward, and vice versa.
        </p>
        <Formula
          label="PCR Calculation"
          formula={`PCR = Total Put Open Interest / Total Call Open Interest\n\nBullish Zone:  PCR > 1.2 (more puts = support below)\nNeutral Zone:  0.8 < PCR < 1.2\nBearish Zone:  PCR < 0.7 (more calls = resistance above)`}
          desc="High PCR means option sellers are writing puts at lower strikes, providing a floor. They're betting the market WON'T fall that far."
        />
        <div className="grid grid-cols-3 gap-3">
          <SignalBox icon="🐂" title="Bullish" signal="PCR > 1.2" color="#00d68f" />
          <SignalBox icon="⚖️" title="Neutral" signal="0.8 – 1.2" color="#888" />
          <SignalBox icon="🐻" title="Bearish" signal="PCR < 0.7" color="#ff4d6a" />
        </div>
        <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: 'rgba(0,214,143,0.04)', color: 'var(--text-secondary)' }}>
          <span className="font-bold text-green-400">📱 In This App:</span> PCR &gt; 1.2 scores +1 in the "Options" confluence category. PCR &lt; 0.7 scores -1. Only calculated for F&O stocks (not all 25 are in F&O segment).
        </div>
      </section>

      {/* Max Pain */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2">2️⃣ Max Pain Theory</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          Max Pain is the strike price where option holders (buyers) would lose the MAXIMUM amount of money. Option sellers (institutional players) have an incentive to push the price toward Max Pain on expiry day.
        </p>
        <Formula
          label="Max Pain Concept"
          formula={`Max Pain Strike = argmin Σ (Call Pain + Put Pain)\n\nCall Pain at strike K = max(0, Price - K) × Call OI at K\nPut Pain at strike K  = max(0, K - Price) × Put OI at K\n\nThe strike that minimizes total payout to option buyers = Max Pain`}
          desc="On expiry day, prices gravitate toward Max Pain because option sellers actively hedge to minimize their payout."
        />
        <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: 'rgba(0,214,143,0.04)', color: 'var(--text-secondary)' }}>
          <span className="font-bold text-green-400">📱 In This App:</span> If the current price is BELOW Max Pain, the "Options" category gets a +0.5 bullish score (mean-reversion pull upward). Above Max Pain = -0.5 (downward pull). Strongest on expiry days (Thursday).
        </div>
      </section>

      {/* OI Dynamics — Interactive Matrix */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2">3️⃣ Open Interest (OI) Dynamics — Interactive Decoder</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Open Interest = total number of outstanding derivative contracts. Changes in OI combined with price direction reveal whether big players are creating new positions or closing existing ones.
        </p>

        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>👇 Click a combination to see what it means:</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {oiMatrix.map((cell, idx) => (
            <button key={idx}
              onClick={() => setSelectedOI(selectedOI === idx ? null : idx)}
              className="p-3 rounded-xl text-left transition-all cursor-pointer hover:scale-[1.02]"
              style={{
                background: selectedOI === idx
                  ? (cell.type === 'bullish' ? 'rgba(0,214,143,0.1)' : 'rgba(255,77,106,0.1)')
                  : 'rgba(255,255,255,0.03)',
                border: `1px solid ${selectedOI === idx
                  ? (cell.type === 'bullish' ? 'rgba(0,214,143,0.4)' : 'rgba(255,77,106,0.4)')
                  : 'var(--border-color)'}`,
              }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{cell.icon}</span>
                <span className="text-xs font-bold text-white">{cell.label}</span>
              </div>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Price {cell.price === 'up' ? '↑ UP' : '↓ DOWN'} + OI {cell.oi === 'up' ? '↑ UP' : '↓ DOWN'}
              </p>
            </button>
          ))}
        </div>

        {selectedOI !== null && (
          <div className="p-4 rounded-lg animate-fade-in" style={{
            background: oiMatrix[selectedOI].type === 'bullish' ? 'rgba(0,214,143,0.06)' : 'rgba(255,77,106,0.06)',
            border: `1px solid ${oiMatrix[selectedOI].type === 'bullish' ? 'rgba(0,214,143,0.2)' : 'rgba(255,77,106,0.2)'}`,
          }}>
            <p className="text-xs font-bold mb-2" style={{ color: oiMatrix[selectedOI].type === 'bullish' ? '#00d68f' : '#ff4d6a' }}>
              {oiMatrix[selectedOI].icon} {oiMatrix[selectedOI].label} — {oiMatrix[selectedOI].type === 'bullish' ? 'BULLISH' : 'BEARISH'}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{oiMatrix[selectedOI].explanation}</p>
          </div>
        )}
      </section>

      {/* FII/DII */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2">4️⃣ FII & DII Net Flows — Following Smart Money</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          Foreign Institutional Investors (FII) and Domestic Institutional Investors (DII) move billions of rupees daily. Their flows are the single most important driver of Indian equity markets.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="p-3 rounded-lg" style={{ background: 'rgba(0,214,143,0.04)', border: '1px solid rgba(0,214,143,0.15)' }}>
            <p className="text-xs font-bold text-green-400 mb-1">🏛️ FII Buying &gt; ₹1000 Cr</p>
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Strong institutional inflow. Foreign capital entering India. Bullish for markets and INR.</p>
          </div>
          <div className="p-3 rounded-lg" style={{ background: 'rgba(255,77,106,0.04)', border: '1px solid rgba(255,77,106,0.15)' }}>
            <p className="text-xs font-bold text-red-400 mb-1">🏛️ FII Selling &gt; ₹1000 Cr</p>
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Institutional outflow. Foreign capital leaving India. Bearish pressure on markets.</p>
          </div>
        </div>
        <Formula
          label="FII Velocity (App Feature)"
          formula={`FII Velocity = (5-day avg FII net) - (10-day avg FII net)\n\nPositive velocity = FII buying is ACCELERATING\nNegative velocity = FII selling is ACCELERATING\n\nFlow Divergence = FII velocity × DII velocity\nNegative divergence = FII and DII moving in opposite directions`}
          desc="FII velocity tells you the rate of change of institutional flow, not just the absolute level. Accelerating flows are more significant than stable ones."
        />
        <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(0,214,143,0.04)', color: 'var(--text-secondary)' }}>
          <span className="font-bold text-green-400">📱 In This App:</span> FII net &gt; ₹500 Cr = +1 in "Institutional" confluence. FII velocity &gt; 300 = +0.5 additional. Cumulative 10-day FII inflow &gt; ₹5000 Cr = +1. These signals are combined for the overall Institutional score.
        </div>
      </section>

      <div className="text-center">
        <button onClick={() => markComplete('derivatives')} className="px-6 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all hover:scale-105"
          style={{ background: completedModules.has('derivatives') ? 'rgba(0,214,143,0.2)' : 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: 'white' }}>
          {completedModules.has('derivatives') ? '✓ Module Complete' : 'Mark Module as Complete'}
        </button>
      </div>

      <QuizWidget moduleId="derivatives" />
    </div>
  );

  const renderAlgorithm = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">🤖 Module 3: How the Prediction Algorithm Works</h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>This module reveals the exact inner workings of MarketPulse AI's prediction engine — so you understand exactly what you're trading on.</p>
      </div>

      {/* GBDT */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2">1️⃣ GBDT — Gradient Boosted Decision Trees</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          GBDT is the same algorithm used by top Kaggle winners and hedge funds like Two Sigma. It builds an ensemble of decision trees, where each new tree corrects the errors of all previous trees.
        </p>
        <Formula
          label="GBDT Learning Process"
          formula={`Step 1: Start with initial prediction (base rate)\nStep 2: Compute residuals (errors) = Actual - Predicted\nStep 3: Train a new tree to predict the RESIDUALS\nStep 4: Update prediction: New = Old + learning_rate × Tree\nStep 5: Repeat for N trees (with early stopping)\n\nApp Config:\n  Trees: 50-80 | Depth: 3-4 | Learning Rate: 0.08\n  Early Stopping: 6-8 rounds | L2 Regularization: 1.0`}
          desc="Each tree 'boosts' the model by focusing on what the previous trees got wrong. Learning rate (0.08) prevents overfitting by making each tree contribute only a small improvement."
        />
        <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.15)', color: 'var(--text-secondary)' }}>
          <span className="font-bold text-yellow-400">⚡ Why GBDT over Neural Networks?</span> Neural networks need millions of data points. Indian stocks have ~250 trading days/year × 10 years = ~2,500 rows. GBDT works well with small datasets and is interpretable (you can see which features matter most).
        </div>
      </section>

      {/* Heuristic */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2">2️⃣ Rule-Based Heuristic Engine</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          Pure ML models can overfit to historical noise. The heuristic engine encodes structural market rules that never change (e.g., "RSI &lt; 30 with high volume = oversold bounce is likely"). It acts as a sanity check on the GBDT.
        </p>
        <div className="p-3 rounded-lg text-xs font-mono" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', color: 'var(--text-secondary)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2 font-sans" style={{ color: '#8b5cf6' }}>Sample Heuristic Rules:</p>
          <p>RSI &lt; 30 → score += 2 (oversold bounce likely)</p>
          <p>RSI &gt; 70 → score -= 2 (overbought pullback risk)</p>
          <p>FII buying &gt; ₹1000Cr → score += 2 (strong inflow)</p>
          <p>Price below BB Lower → score += 1.5 (mean reversion)</p>
          <p>GIFT Nifty gap &gt; 0.3% → score += 1.5 (positive open)</p>
          <p className="mt-2">Final: probability = sigmoid(score × 0.3)</p>
        </div>
      </section>

      {/* Ensemble */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2">3️⃣ Adaptive Ensemble (GBDT + Heuristic)</h3>
        <Formula
          label="Ensemble Prediction"
          formula={`Ensemble Prob = (GBDT_prob × W_gbdt + Heur_prob × W_heur) / (W_gbdt + W_heur)\n\nWeights are ADAPTIVE — updated daily based on 30-day rolling accuracy:\n  If GBDT accuracy > Heuristic → W_gbdt increases\n  If Heuristic accuracy > GBDT → W_heur increases\n\nConfidence Discounts:\n  - Training data < 20 samples → -10%\n  - VIX > 22 → -5% (high uncertainty)\n  - GBDT disagrees with Heuristic → -8%`}
          desc="The ensemble automatically shifts weight to whichever sub-model is performing better. Confidence is capped at 95% and floored at 50%."
        />
      </section>

      {/* Signal Confluence */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2">4️⃣ 6-Factor Signal Confluence System</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Instead of trading every prediction, the app counts how many INDEPENDENT signal categories agree. This is the key innovation that filters out noise.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {[
            { cat: 'Technical', rules: 'RSI < 40 (+1), MACD > 0 (+1), Price > EMA20 (+1)', icon: '📊' },
            { cat: 'Bollinger', rules: 'Price below lower band = bullish, above upper = bearish', icon: '📏' },
            { cat: 'Volume', rules: 'Volume > 1.3x + uptrend = bullish; Delivery > 55% = genuine', icon: '📦' },
            { cat: 'Institutional', rules: 'FII > ₹500Cr (+1), velocity > ₹300Cr/day (+0.5)', icon: '🏛️' },
            { cat: 'Sentiment', rules: 'Sentiment > 60 (+1), VIX < 14 (+0.5)', icon: '💬' },
            { cat: 'Options', rules: 'PCR > 1.2 (+1), price below Max Pain (+0.5)', icon: '📋' },
          ].map(c => (
            <div key={c.cat} className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)' }}>
              <p className="text-xs font-bold text-white mb-1">{c.icon} {c.cat}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{c.rules}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Confluence Calculator */}
      <section className="p-5 rounded-xl" style={{ background: 'rgba(0,214,143,0.03)', border: '1px solid rgba(0,214,143,0.15)' }}>
        <h3 className="text-sm font-bold text-white mb-3">🧮 Interactive Confluence Calculator</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Toggle the categories below to simulate how the trade grade changes:</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {Object.entries(confluenceState).map(([cat, active]) => (
            <button key={cat}
              onClick={() => setConfluenceState(prev => ({ ...prev, [cat]: !prev[cat as ConfluenceKey] }))}
              className="p-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
              style={{
                background: active ? 'rgba(0,214,143,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${active ? 'rgba(0,214,143,0.4)' : 'var(--border-color)'}`,
                color: active ? '#00d68f' : 'var(--text-muted)',
              }}>
              {active ? '✓' : '○'} {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 mb-3">
          <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={calcModelsAgree} onChange={e => setCalcModelsAgree(e.target.checked)} className="mr-2" />
            GBDT & Heuristic agree on direction
          </label>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Confidence:</span>
          <input type="range" min={50} max={95} value={calcConfidence} onChange={e => setCalcConfidence(parseInt(e.target.value))}
            className="flex-1" style={{ accentColor: '#3b82f6' }} />
          <span className="text-sm font-bold text-white">{calcConfidence}%</span>
        </div>

        <div className="p-4 rounded-xl text-center" style={{
          background: calcGrade === 'A' ? 'rgba(0,214,143,0.1)' : calcGrade === 'B' ? 'rgba(255,184,0,0.1)' : 'rgba(255,255,255,0.03)',
          border: `2px solid ${calcGrade === 'A' ? '#00d68f' : calcGrade === 'B' ? '#fbbf24' : 'var(--border-color)'}`,
        }}>
          <p className="text-3xl font-black mb-1" style={{
            color: calcGrade === 'A' ? '#00d68f' : calcGrade === 'B' ? '#fbbf24' : calcGrade === 'C' ? '#888' : '#ff4d6a',
          }}>
            Grade: {calcGrade}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Confluence: {confluenceCount}/6 | Confidence: {calcConfidence}% | Models: {calcModelsAgree ? 'Agree' : 'Disagree'}
          </p>
          <p className="text-xs font-bold mt-2" style={{
            color: calcGrade === 'A' ? '#00d68f' : calcGrade === 'B' ? '#fbbf24' : '#ff4d6a',
          }}>
            {calcGrade === 'A' ? '✅ STRONG TRADE — Full position size' :
             calcGrade === 'B' ? '🟡 MODERATE TRADE — Half position size' :
             calcGrade === 'C' ? '⚪ NO TRADE — Monitor only' :
             '🔴 AVOID — Do not trade this setup'}
          </p>
        </div>
      </section>

      <div className="text-center">
        <button onClick={() => markComplete('algorithm')} className="px-6 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all hover:scale-105"
          style={{ background: completedModules.has('algorithm') ? 'rgba(0,214,143,0.2)' : 'linear-gradient(135deg, #00d68f, #3b82f6)', color: 'white' }}>
          {completedModules.has('algorithm') ? '✓ Module Complete' : 'Mark Module as Complete'}
        </button>
      </div>

      <QuizWidget moduleId="algorithm" />
    </div>
  );

  const renderRisk = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">🛡️ Module 4: Risk Management & The Kelly Strategy</h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Risk management is the ONLY thing that separates profitable traders from bankrupt ones. You can have a 45% win rate and still make money — if your risk is managed correctly.</p>
      </div>

      {/* Expected Value */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2">1️⃣ Expected Value (EV) — Why Win Rate Is Misleading</h3>
        <Formula
          label="Expected Value Formula"
          formula={`EV = (Win Rate × Average Win) - (Loss Rate × Average Loss)\n\n── Example 1: 45% win rate, 3:1 reward ──\nEV = (0.45 × ₹3000) - (0.55 × ₹1000)\n   = ₹1350 - ₹550 = +₹800 per trade ✅ PROFITABLE\n\n── Example 2: 90% win rate, 1:10 reward ──\nEV = (0.90 × ₹100) - (0.10 × ₹1000)\n   = ₹90 - ₹100 = -₹10 per trade ❌ LOSING\n\nConclusion: Win rate is SECONDARY to reward-to-risk ratio.`}
          desc="A trader with 45% accuracy but 3:1 R:R will outperform a trader with 90% accuracy but 1:10 R:R. This is the mathematical foundation of the selective strategy."
        />
      </section>

      {/* Kelly Criterion */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2">2️⃣ Kelly Criterion — Optimal Position Sizing</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          The Kelly Criterion, developed by John Kelly at Bell Labs in 1956, mathematically determines the optimal percentage of your capital to risk on each trade to maximize long-term growth while minimizing the risk of ruin.
        </p>
        <Formula
          label="Kelly Formula"
          formula={`f* = (b × p - q) / b\n\nwhere:\n  f* = fraction of capital to bet\n  b  = odds received (avg win / avg loss)\n  p  = probability of winning\n  q  = probability of losing (1 - p)\n\n── Example: 55% win rate, 2:1 odds ──\nf* = (2 × 0.55 - 0.45) / 2 = 0.65 / 2 = 0.325 (32.5%)\n\nFull Kelly is TOO AGGRESSIVE. Industry uses Quarter-Kelly:\nActual position = f* × 0.25 = 8.1% of capital`}
          desc="Quarter-Kelly sacrifices ~25% of optimal growth for ~75% reduction in volatility and drawdowns. This is what the app uses."
        />
        <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(0,214,143,0.04)', color: 'var(--text-secondary)' }}>
          <span className="font-bold text-green-400">📱 In This App:</span> Kelly is computed from your rolling 30-day win rate and average win/loss. Then adjusted by: confidence multiplier (0.3–1.0), trade grade (A=100%, B=50%, C=20%), and VIX cap (max 2% in panic). Final position clamped to 0.5%–5% of capital.
        </div>
      </section>

      {/* VIX Adaptive Stops */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2">3️⃣ VIX-Adaptive Stop-Losses</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          A fixed stop-loss (e.g., "always use 1.5%") is dangerous. In calm markets (VIX=12), 1.5% works fine. In panicky markets (VIX=28), normal price swings are 3-4%, so a 1.5% stop gets triggered by noise.
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            { vix: '≤12', mult: '0.8x', label: 'Very Calm', color: '#00d68f' },
            { vix: '12-15', mult: '1.0x', label: 'Normal', color: '#3b82f6' },
            { vix: '15-18', mult: '1.2x', label: 'Elevated', color: '#fbbf24' },
            { vix: '18-22', mult: '1.5x', label: 'High', color: '#ff9500' },
            { vix: '22-28', mult: '1.8x', label: 'Very High', color: '#ff6b6b' },
            { vix: '>28', mult: '2.2x', label: 'Panic', color: '#ff4d6a' },
          ].map(v => (
            <div key={v.vix} className="p-2 rounded-lg text-center" style={{ background: `${v.color}10`, border: `1px solid ${v.color}30` }}>
              <p className="text-xs font-bold" style={{ color: v.color }}>{v.mult}</p>
              <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>VIX {v.vix}</p>
              <p className="text-[8px]" style={{ color: 'var(--text-muted)' }}>{v.label}</p>
            </div>
          ))}
        </div>
        <Formula
          label="Stop-Loss Calculation"
          formula={`Stop Loss = Entry Price ± (ATR × VIX Multiplier)\n\n── Example: RELIANCE at ₹2800, ATR=₹42, VIX=20 ──\nMultiplier = 1.5 (VIX 18-22 range)\nStop Loss = ₹2800 - (₹42 × 1.5) = ₹2800 - ₹63 = ₹2737\nTarget 1  = ₹2800 + ₹42 = ₹2842 (1:1 ATR)\nTarget 2  = ₹2800 + ₹84 = ₹2884 (2:1 ATR)`}
          desc="In panic markets, stops are 2.2x wider than normal — preventing noise-induced exits while still protecting capital on genuine breakdowns."
        />
      </section>

      {/* Kelly Calculator */}
      <section className="p-5 rounded-xl" style={{ background: 'rgba(255,184,0,0.03)', border: '1px solid rgba(255,184,0,0.15)' }}>
        <h3 className="text-sm font-bold text-white mb-3">🧮 Position Size Calculator</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Enter your trading capital and the Kelly sizing from the app to see your exact position size:</p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Trading Capital (₹)</label>
            <input type="number" value={kellyCapital} onChange={e => setKellyCapital(Number(e.target.value))}
              className="w-full p-2.5 rounded-lg text-sm font-bold text-white"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)' }} />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Kelly Sizing (%)</label>
            <input type="number" step="0.1" value={kellySizing} onChange={e => setKellySizing(Number(e.target.value))}
              className="w-full p-2.5 rounded-lg text-sm font-bold text-white"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)' }} />
          </div>
        </div>

        <div className="p-4 rounded-xl text-center" style={{ background: 'rgba(0,214,143,0.08)', border: '1px solid rgba(0,214,143,0.3)' }}>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Position Size</p>
          <p className="text-2xl font-black text-white mt-1">₹{(kellyCapital * kellySizing / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
          <p className="text-xs mt-1" style={{ color: '#00d68f' }}>{kellySizing}% of ₹{kellyCapital.toLocaleString('en-IN')}</p>
          <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
            If stop-loss is 1.5% away → Max risk = ₹{(kellyCapital * kellySizing / 100 * 0.015).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </p>
        </div>
      </section>

      <div className="text-center">
        <button onClick={() => markComplete('risk')} className="px-6 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all hover:scale-105"
          style={{ background: completedModules.has('risk') ? 'rgba(0,214,143,0.2)' : 'linear-gradient(135deg, #fbbf24, #ff6b6b)', color: 'white' }}>
          {completedModules.has('risk') ? '✓ Module Complete' : 'Mark Module as Complete'}
        </button>
      </div>

      <QuizWidget moduleId="risk" />
    </div>
  );

  const renderWorkflow = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">📅 Module 5: Daily Trader Execution Workflow</h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>A step-by-step routine to follow every trading day. Consistency and discipline beat intelligence every time.</p>
      </div>

      {/* Timeline */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-4">📋 Your Daily Trading Checklist</h3>
        <div className="space-y-4">
          {[
            { time: '8:30 AM', icon: '🌍', title: 'Pre-Market Scan', steps: ['Check overnight S&P 500 performance (Dashboard → S&P 500 widget)', 'Check GIFT Nifty implied gap (if gap > 0.3%, expect positive open)', 'Check India VIX (Dashboard → VIX Gauge) — if > 22, reduce position sizes'] },
            { time: '8:45 AM', icon: '🎯', title: 'Review AI Trade Signals', steps: ['Go to Predictions → "Active Trade Signals" section', 'Look for A-grade (green) and B-grade (gold) stocks ONLY', 'Ignore ALL C/D/F grade stocks — they have no edge', 'Check confluence dots: hover each dot to see which categories agree'] },
            { time: '9:00 AM', icon: '📐', title: 'Calculate Position Size', steps: ['Click "View →" on any A/B grade stock', 'Note the Kelly position size % on the stock detail page', 'Use the calculator in Module 4 to compute exact ₹ amount', 'Verify stop-loss, Target 1, and Target 2 levels'] },
            { time: '9:15 AM', icon: '⚡', title: 'Execute Trades (Market Open)', steps: ['Enter position at market open (or use limit order at Entry price)', 'Set stop-loss order immediately (ATR-based, from the stock page)', 'Set Target 1 order for 50% of position (1x ATR)', 'Let remaining 50% ride with trailing stop to Target 2 (2x ATR)'] },
            { time: '3:15 PM', icon: '📊', title: 'End-of-Day Review', steps: ['Check if trades hit target or stop-loss', 'Do NOT manually close trades early — let the system work', 'Review accuracy on the Predictions page (cumulative vs weekly)', 'Log results in a trading journal (mental discipline)'] },
            { time: 'Evening', icon: '📖', title: 'Learning & Prep', steps: ['Review any new FII/DII flows posted after market close', 'Check if the cron job ran and new predictions are ready for tomorrow', 'Study one concept from this Academy each day', 'Never trade on emotion — only trade on signals'] },
          ].map((step, idx) => (
            <div key={idx} className="flex gap-4">
              <div className="flex-shrink-0 w-20 text-right">
                <span className="text-xs font-bold" style={{ color: 'var(--accent-blue)' }}>{step.time}</span>
              </div>
              <div className="flex-shrink-0 w-8 flex flex-col items-center">
                <span className="text-lg">{step.icon}</span>
                {idx < 5 && <div className="w-px flex-1 mt-1" style={{ background: 'var(--border-color)' }} />}
              </div>
              <div className="flex-1 pb-2">
                <p className="text-xs font-bold text-white mb-1">{step.title}</p>
                <ul className="space-y-1">
                  {step.steps.map((s, i) => (
                    <li key={i} className="text-[11px] flex items-start gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                      <span style={{ color: 'var(--accent-blue)' }}>•</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Golden Rules */}
      <section className="p-5 rounded-xl" style={{ background: 'rgba(255,184,0,0.04)', border: '1px solid rgba(255,184,0,0.2)' }}>
        <h3 className="text-sm font-bold text-white mb-3">⭐ 10 Golden Rules of the Selective Strategy</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            'Only trade A/B grade signals. C/D/F = sit on hands.',
            'Never risk more than 5% of capital on a single trade.',
            'Always set stop-loss BEFORE entering. No exceptions.',
            'Let winners run to Target 2. Don\'t book early.',
            'If no A/B signals today, DO NOT TRADE. Cash is a position.',
            'Never average down on a losing trade.',
            'Trade the system, not your gut feeling.',
            'Review accuracy weekly, not daily. Small samples lie.',
            'VIX > 25? Reduce ALL positions by 50%.',
            'Paper trade for 100 trades before using real money.',
          ].map((rule, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <span className="text-xs font-black" style={{ color: '#fbbf24' }}>{i + 1}.</span>
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{rule}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="text-center">
        <button onClick={() => markComplete('workflow')} className="px-6 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all hover:scale-105"
          style={{ background: completedModules.has('workflow') ? 'rgba(0,214,143,0.2)' : 'linear-gradient(135deg, #ff6b6b, #ff9500)', color: 'white' }}>
          {completedModules.has('workflow') ? '✓ Module Complete' : 'Mark Module as Complete'}
        </button>
      </div>

      <QuizWidget moduleId="workflow" />
    </div>
  );

  // ─── Module Router ────────────────────────────────────────────────

  const renderModule = () => {
    switch (activeModule) {
      case 'technicals': return renderTechnicals();
      case 'derivatives': return renderDerivatives();
      case 'algorithm': return renderAlgorithm();
      case 'risk': return renderRisk();
      case 'workflow': return renderWorkflow();
      default: return renderTechnicals();
    }
  };

  // ─── MAIN RENDER ──────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            🎓 Trading Academy
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            Master technicals, derivatives, the algorithm, and risk management — end to end.
          </p>
        </div>
        <Link href="/predictions" className="text-xs px-3 py-1.5 rounded-lg font-bold"
          style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
          ← Back to Predictions
        </Link>
      </div>

      {/* Progress Bar */}
      <div className="p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-white">Academy Progress</span>
          <span className="text-xs font-bold" style={{ color: progress === 100 ? '#00d68f' : '#3b82f6' }}>{progress}%</span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, background: progress === 100 ? 'linear-gradient(90deg, #00d68f, #3b82f6)' : 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }} />
        </div>
        {progress === 100 && (
          <p className="text-xs mt-2 text-center font-bold" style={{ color: '#00d68f' }}>
            🎉 Congratulations! You've completed all modules. You're ready to trade with the system.
          </p>
        )}
      </div>

      {/* Mobile Module Selector */}
      <div className="lg:hidden">
        <button onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-full p-3 rounded-xl text-sm font-bold text-white flex items-center justify-between cursor-pointer"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <span>{modules.find(m => m.id === activeModule)?.icon} {modules.find(m => m.id === activeModule)?.label}</span>
          <span>{sidebarOpen ? '▲' : '▼'}</span>
        </button>
        {sidebarOpen && (
          <div className="mt-2 p-2 rounded-xl space-y-1" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            {modules.map(m => (
              <button key={m.id}
                onClick={() => { setActiveModule(m.id); setSidebarOpen(false); }}
                className="w-full p-2.5 rounded-lg text-xs font-bold text-left flex items-center gap-2 cursor-pointer transition-all"
                style={{
                  background: activeModule === m.id ? `${m.color}15` : 'transparent',
                  color: activeModule === m.id ? m.color : 'var(--text-secondary)',
                  border: activeModule === m.id ? `1px solid ${m.color}40` : '1px solid transparent',
                }}>
                <span>{m.icon}</span> {m.label}
                {completedModules.has(m.id) && <span className="ml-auto text-green-400">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop Layout: Sidebar + Content */}
      <div className="flex gap-6">
        {/* Sidebar — Desktop */}
        <div className="hidden lg:block w-56 flex-shrink-0">
          <div className="sticky top-6 space-y-1.5 p-3 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2 px-2" style={{ color: 'var(--text-muted)' }}>Modules</p>
            {modules.map(m => (
              <button key={m.id}
                onClick={() => setActiveModule(m.id)}
                className="w-full p-2.5 rounded-lg text-xs font-bold text-left flex items-center gap-2 cursor-pointer transition-all"
                style={{
                  background: activeModule === m.id ? `${m.color}15` : 'transparent',
                  color: activeModule === m.id ? m.color : 'var(--text-secondary)',
                  border: activeModule === m.id ? `1px solid ${m.color}40` : '1px solid transparent',
                }}>
                <span>{m.icon}</span>
                <span className="flex-1">{m.label}</span>
                {completedModules.has(m.id) && <span className="text-green-400 text-xs">✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {renderModule()}
        </div>
      </div>

      {/* Footer */}
      <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
        Trading involves risk. This academy is for educational purposes. Always paper trade before using real money. Not financial advice.
      </p>
    </div>
  );
}
