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
  { id: 'patterns', label: 'Chart Patterns & Breakouts', icon: '📈', color: '#f43f5e' },
  { id: 'fundamentals', label: 'Fundamentals & Screening', icon: '🏛️', color: '#10b981' },
  { id: 'sentiment', label: 'Sentiment & Hype Cycles', icon: '💬', color: '#a78bfa' },
  { id: 'greeks', label: 'Option Greeks & Hedging', icon: '🛡️', color: '#ec4899' },
  { id: 'psychology', label: 'Trading Psychology & Biases', icon: '🧠', color: '#f43f5e' },
  { id: 'metrics', label: 'Performance Metrics', icon: '📊', color: '#10b981' },
  { id: 'taxation', label: 'Indian Taxation & Audits', icon: '🏦', color: '#06b6d4' },
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
  patterns: [
    {
      question: 'A breakout occurs on a Bull Flag, but the daily volume ratio is 0.7x. Is this valid?',
      options: ['Yes — the pattern shape is all that matters', 'No — low volume breakout is likely a bull trap', 'Yes — volume is a lagging indicator', 'Only if PCR is bullish'],
      correct: 1,
      explanation: 'Genuine breakouts require institutional participation, which reflects in above-average volume (volume ratio > 1.5x). A low-volume breakout has high chances of failing (bull trap).',
    },
    {
      question: 'During a breakout above the neckline of an Inverse Head & Shoulders, what OI action confirms the move?',
      options: ['Price Up + OI Down (Short Covering)', 'Price Up + OI Up (New Long Positions)', 'Price Down + OI Up', 'No change in OI'],
      correct: 1,
      explanation: 'Price Up + OI Up confirms fresh long build-up, showing that buyers are initiating new positions with conviction to support the breakout.',
    },
  ],
  fundamentals: [
    {
      question: 'Why is ROCE (Return on Capital Employed) preferred over ROE for capital-intensive companies?',
      options: ['ROE ignores debt capital, while ROCE evaluates returns on both equity and debt', 'ROCE is easier to calculate', 'ROE is always lower than ROCE', 'ROCE is only used in IT sectors'],
      correct: 0,
      explanation: 'Capital-intensive companies (like Power, Energy, or Steel) use significant debt to fund operations. ROE only looks at return on equity. ROCE gives a true picture of capital efficiency by including debt.',
    },
    {
      question: 'If a stock has an ROE of 24% and a Debt-to-Equity of 0.25, how does the model evaluate it?',
      options: ['High risk due to high ROE', 'Excellent fundamental profile — low leverage and high profitability', 'Average profile', 'Risky because of debt'],
      correct: 1,
      explanation: 'An ROE > 18% shows high profitability, and Debt-to-Equity < 0.5 indicates minimal leverage risk. This is the optimal combination for high-grade swing trading signals.',
    },
  ],
  sentiment: [
    {
      question: 'A critical positive news article was published 24 hours ago. What weight does it carry in the model compared to news published 2 hours ago?',
      options: ['100% weight — it remains active for 48 hours', 'Decayed weight (significantly reduced)', '0% weight — it expires in 6 hours', 'Increased weight due to confirmation'],
      correct: 1,
      explanation: 'The model applies an exponential decay factor. News impact decays rapidly; at 24 hours, the weight drops significantly as market reaction has already occurred.',
    },
    {
      question: 'Price is rising rapidly but Delivery Volume % drops to 15%. What does this diverge signal?',
      options: ['Strong institutional buying', 'Retail-driven hype / speculation (high risk of reversal)', 'Strong option writing support', 'Long-term investment phase'],
      correct: 1,
      explanation: 'Low delivery % (<25%) during a price rise indicates speculative intraday day-trading, not institutional accumulation. This represents a retail hype cycle vulnerable to sharp pullbacks.',
    },
  ],
  greeks: [
    {
      question: 'Which Greek measures the rate of decay of an option contract\'s value over time?',
      options: ['Delta', 'Theta', 'Gamma', 'Vega'],
      correct: 1,
      explanation: 'Theta represents time decay. It is the amount an option\'s price declines daily, assuming no change in price or volatility. Theta decay accelerates exponentially as expiry approaches.',
    },
    {
      question: 'You own 1,000 shares of RELIANCE. To hedge against a sudden market drop, which options strategy should you use?',
      options: ['Covered Call (Sell Call)', 'Protective Put (Buy Put)', 'Bull Call Spread', 'Sell naked Puts'],
      correct: 1,
      explanation: 'Buying a Protective Put acts as insurance. If the stock falls below the strike price, the Put option gains value, offsetting the losses in the underlying shares.',
    },
  ],
  psychology: [
    {
      question: 'Which cognitive bias causes traders to hold onto a losing stock hoping to break even?',
      options: ['FOMO', 'Loss Aversion (Prospect Theory)', 'Confirmation Bias', 'Revenge Trading'],
      correct: 1,
      explanation: 'Loss Aversion causes traders to hold losing trades because admitting a loss hurts twice as much as the happiness of a gain. This behavior leads to massive drawdowns.',
    },
    {
      question: 'In a trading system with a 55% Win Rate, how likely is it to experience 3 consecutive losses?',
      options: ['Virtually impossible', 'Around 9.1% (roughly 1 in 11 sets of trades)', '55%', 'Less than 1%'],
      correct: 1,
      explanation: 'P(3 losses) = (1 - 0.55)^3 = (0.45)^3 = 9.11%. A run of 3 consecutive losses is mathematically very common and should be expected as normal variance.',
    },
  ],
  metrics: [
    {
      question: 'What does a Profit Factor of 1.8x imply?',
      options: ['The system is losing money', 'Gross profits are 1.8 times the gross losses (profitable)', 'You win 1.8% of your trades', 'Sharpe ratio is 1.8'],
      correct: 1,
      explanation: 'Profit Factor = Gross Profits / Gross Losses. A value > 1.0 means the strategy is profitable. A profit factor of 1.8x is considered very healthy.',
    },
    {
      question: 'Which metric only evaluates downside risk variance (ignoring upside volatility)?',
      options: ['Sharpe Ratio', 'Sortino Ratio', 'Profit Factor', 'Win Rate'],
      correct: 1,
      explanation: 'Sortino Ratio only penalizes downside (negative) volatility. Sharpe Ratio penalizes both upside and downside volatility. Traders prefer Sortino because upside volatility is desirable.',
    },
  ],
  taxation: [
    {
      question: 'Under Indian Income Tax rules, how is F&O (Futures & Options) trading classified?',
      options: ['Speculative Business Income', 'Non-Speculative Business Income', 'Short Term Capital Gains (STCG)', 'Salaried Income'],
      correct: 1,
      explanation: 'F&O is treated as Non-Speculative Business Income. This allows traders to declare expenses like internet, charts, brokerage, and laptop depreciation as business costs to offset taxes.',
    },
    {
      question: 'Which equity segment allows tax losses to be carried forward for 8 years and offset against general business income?',
      options: ['F&O (Non-Speculative Business)', 'Intraday Equity (Speculative Business)', 'Long Term Capital Gains only', 'None of the above'],
      correct: 0,
      explanation: 'Non-speculative business losses (like F&O) can be carried forward for 8 years and offset against any other business profits. Intraday speculative losses can only be carried forward for 4 years.',
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

  // Confluence calculator state
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

  // Module 6: Pattern Simulator State
  const [selectedPattern, setSelectedPattern] = useState<'double_bottom' | 'double_top' | 'bull_flag' | 'head_shoulders'>('double_bottom');

  // Module 7: Fundamental Calculator State
  const [calcRoe, setCalcRoe] = useState(15);
  const [calcDebtToEquity, setCalcDebtToEquity] = useState(0.8);
  const [calcRoce, setCalcRoce] = useState(16);

  // Module 8: Sentiment Decay State
  const [decayHours, setDecayHours] = useState(12);

  // Module 9: Theta Decay State
  const [thetaDays, setThetaDays] = useState(20);

  // Module 10: Psychology Bias State
  const [selectedBias, setSelectedBias] = useState<string | null>(null);

  // Module 11: Performance Metrics State
  const [metricsWinRate, setMetricsWinRate] = useState(55);
  const [metricsAvgProfit, setMetricsAvgProfit] = useState(3000);
  const [metricsAvgLoss, setMetricsAvgLoss] = useState(1000);

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

  // Fundamental check logic
  const getFundHealth = () => {
    if (calcRoe >= 18 && calcDebtToEquity <= 0.4 && calcRoce >= 18) {
      return { status: 'Excellent', color: '#10b981', advice: 'Excellent balance sheet profile. High profitability with minimal leverage risk. Fits Grade A setup benchmarks.' };
    }
    if (calcRoe >= 12 && calcDebtToEquity <= 0.9 && calcRoce >= 12) {
      return { status: 'Good / Moderate', color: '#fbbf24', advice: 'Steady financials. Acceptable debt margins, average profitability. Fits Grade B setups under strong technical confluence.' };
    }
    return { status: 'Risky / Avoid', color: '#ef4444', advice: 'Elevated leverage or low margins. Model penalizes low capital efficiency. Avoid swing setups unless strictly short-term.' };
  };
  const healthInfo = getFundHealth();

  // News Decay weight calculation
  const calculatedDecayWeight = Math.round(100 * Math.exp(-decayHours / 12));

  // Theta Decay value calculation
  const calculatedThetaValue = Math.round(100 * Math.pow(thetaDays / 30, 2));

  // ─── Formula Component ──────────────────────────────────────────────

  const Formula = ({ label, formula, desc, themeColor = '#3b82f6' }: { label: string; formula: string; desc: string; themeColor?: string }) => (
    <div className="my-4 p-4 rounded-xl" style={{ background: `${themeColor}09`, border: `1px solid ${themeColor}26` }}>
      <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: themeColor }}>📐 {label}</p>
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
          <>
            {[38,35,32,30,28,31,34,38,42,47,52,55,58,62,65,70,73,75,72,68].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-sm transition-all" style={{
                height: `${h}%`,
                background: i < 10 ? 'rgba(255,77,106,0.4)' : 'rgba(0,214,143,0.4)',
              }} />
            ))}
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
          <>
            {[50,48,45,40,35,30,28,25,28,32,38,42,48,52,55,58,55,52,50,48].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-sm" style={{
                height: `${h}%`,
                background: i >= 5 && i <= 8 ? 'rgba(0,214,143,0.5)' : 'rgba(255,255,255,0.1)',
              }} />
            ))}
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

      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2 text-blue-400">1️⃣ RSI — Relative Strength Index</h3>
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
        <h3 className="text-sm font-bold text-white mb-2 text-blue-400">2️⃣ MACD — Moving Average Convergence Divergence</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          Created by Gerald Appel, MACD shows the relationship between two EMAs. It's a trend-following momentum indicator that reveals changes in the strength, direction, momentum, and duration of a trend.
        </p>
        <Formula
          label="MACD Components"
          formula={`MACD Line    = EMA(12) - EMA(26)\nSignal Line  = EMA(9) of MACD Line\nHistogram    = MACD Line - Signal Line`}
          desc="The histogram visualizes momentum. When the histogram grows, momentum is accelerating. When it portfolio decays, it alerts."
        />
        <div className="grid grid-cols-2 gap-3">
          <SignalBox icon="📈" title="Bullish Crossover" signal="MACD crosses above Signal" color="#00d68f" />
          <SignalBox icon="📉" title="Bearish Crossover" signal="MACD crosses below Signal" color="#ff4d6a" />
        </div>
      </section>

      {/* EMA */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2 text-blue-400">3️⃣ EMA 20 & EMA 50 — Exponential Moving Averages</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          EMAs react faster to price updates. The 20-day and 50-day EMAs are key levels of momentum support.
        </p>
        <ChartVisual title="EMA 20/50 Golden Cross — Bullish Signal" type="ema" />
      </section>

      {/* Bollinger Bands */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2 text-blue-400">4️⃣ Bollinger Bands — Volatility & Mean Reversion</h3>
        <ChartVisual title="Bollinger Band Mean Reversion — Price bouncing off lower band" type="bollinger" />
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
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Options and futures data reveals what institutional "smart money" is doing.</p>
      </div>

      {/* PCR */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2 text-purple-400">1️⃣ PCR — Put-Call Ratio</h3>
        <Formula
          label="PCR Calculation"
          formula={`PCR = Total Put Open Interest / Total Call Open Interest\n\nBullish Zone:  PCR > 1.2 (more puts = support below)\nNeutral Zone:  0.8 < PCR < 1.2\nBearish Zone:  PCR < 0.7 (more calls = resistance)`}
          desc="High PCR means option sellers are writing puts at lower strikes, providing a floor."
        />
        <div className="grid grid-cols-3 gap-3">
          <SignalBox icon="🐂" title="Bullish" signal="PCR > 1.2" color="#00d68f" />
          <SignalBox icon="⚖️" title="Neutral" signal="0.8 – 1.2" color="#888" />
          <SignalBox icon="🐻" title="Bearish" signal="PCR < 0.7" color="#ff4d6a" />
        </div>
      </section>

      {/* OI Dynamics */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2 text-purple-400">2️⃣ Open Interest (OI) Dynamics — Interactive Decoder</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Click Price/OI combos to decode market dynamics:</p>

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
          <div className="p-4 rounded-lg" style={{
            background: oiMatrix[selectedOI].type === 'bullish' ? 'rgba(0,214,143,0.06)' : 'rgba(255,77,106,0.06)',
            border: `1px solid ${oiMatrix[selectedOI].type === 'bullish' ? 'rgba(0,214,143,0.2)' : 'rgba(255,77,106,0.2)'}`,
          }}>
            <p className="text-xs font-bold mb-2" style={{ color: oiMatrix[selectedOI].type === 'bullish' ? '#00d68f' : '#ff4d6a' }}>
              {oiMatrix[selectedOI].icon} {oiMatrix[selectedOI].label}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{oiMatrix[selectedOI].explanation}</p>
          </div>
        )}
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
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Inside the predictive ensemble model.</p>
      </div>

      {/* GBDT */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2 text-green-400">1️⃣ GBDT — Gradient Boosted Decision Trees</h3>
        <Formula
          label="GBDT Learning Process"
          formula={`Step 1: Start with base prediction rate\nStep 2: Train new tree to predict residuals (errors)\nStep 3: Update: New_Prediction = Old + learning_rate × Tree\n\nApp Params:\n  Trees: 50-80 | Depth: 3-4 | Learning Rate: 0.08`}
          desc="GBDT builds sequential decision trees to correct errors of the previous ones."
          themeColor="#10b981"
        />
      </section>

      {/* Interactive Confluence Grade Calculator */}
      <section className="p-5 rounded-xl" style={{ background: 'rgba(0,214,143,0.03)', border: '1px solid rgba(0,214,143,0.15)' }}>
        <h3 className="text-sm font-bold text-white mb-3">🧮 Interactive Confluence Calculator</h3>
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
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Optimal capital allocation and volatility-adjusted stops.</p>
      </div>

      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2 text-yellow-400">1️⃣ Expected Value (EV)</h3>
        <Formula
          label="Expected Value Formula"
          formula={`EV = (Win Rate × Average Win) - (Loss Rate × Average Loss)\n\nEV must be positive for long-term survival.`}
          desc="Win rate is secondary to reward-to-risk ratio."
          themeColor="#eab308"
        />
      </section>

      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2 text-yellow-400">2️⃣ Kelly Criterion</h3>
        <Formula
          label="Kelly Formula"
          formula={`f* = (b × p - q) / b\n\nwhere:\n  f* = fraction of capital to risk\n  b  = odds received (avg win / avg loss)\n  p  = probability of winning\n  q  = probability of losing (1 - p)`}
          desc="We use a conservative Quarter-Kelly setup to optimize growth and restrict variance."
          themeColor="#eab308"
        />
      </section>

      {/* Kelly Calculator */}
      <section className="p-5 rounded-xl" style={{ background: 'rgba(255,184,0,0.03)', border: '1px solid rgba(255,184,0,0.15)' }}>
        <h3 className="text-sm font-bold text-white mb-3">🧮 Position Size Calculator</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Trading Capital (₹)</label>
            <input type="number" value={kellyCapital} onChange={e => setAddCapital(e)}
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
          <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Suggested Trade Value</p>
          <p className="text-2xl font-black text-white mt-1">₹{(kellyCapital * kellySizing / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
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

  const setAddCapital = (e: any) => {
    setKellyCapital(Number(e.target.value));
  };

  const renderWorkflow = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">📅 Module 5: Daily Trader Execution Workflow</h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>A step-by-step checklist to structure your daily analysis.</p>
      </div>

      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-4">📋 Daily Schedule Checklist</h3>
        <div className="space-y-3">
          {[
            { time: '8:30 AM', icon: '🌍', title: 'Pre-Market Assessment', desc: 'Scan GIFT Nifty futures and global indices. Identify opening direction.' },
            { time: '8:45 AM', icon: '🎯', title: 'Scan AI Signals', desc: 'Check Predictions page. Filter out anything below Grade B.' },
            { time: '9:00 AM', icon: '📐', title: 'Position Sizing', desc: 'Use the Kelly calculator to size entries on Grade A setups.' },
            { time: '9:15 AM', icon: '⚡', title: 'Market Open Orders', desc: 'Place entry, ATR-based stop-loss, and target orders.' },
          ].map((s, idx) => (
            <div key={idx} className="flex gap-4">
              <div className="w-16 flex-shrink-0 text-right">
                <span className="text-xs font-black text-red-400">{s.time}</span>
              </div>
              <div className="flex-shrink-0">{s.icon}</div>
              <div className="flex-1">
                <p className="text-xs font-bold text-white">{s.title}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{s.desc}</p>
              </div>
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

  const renderPatterns = () => {
    // SVGs for the Pattern Simulator
    const renderPatternSketch = () => {
      switch (selectedPattern) {
        case 'double_bottom':
          return (
            <svg width="100%" height="100%" viewBox="0 0 200 100" fill="none">
              <path d="M 20 20 L 60 80 L 100 40 L 140 80 L 180 20" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="20" y1="40" x2="180" y2="40" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3" />
              <text x="100" y="32" fill="#f43f5e" fontSize="9" fontWeight="bold" textAnchor="middle">Neckline (Resistance)</text>
              <circle cx="60" cy="80" r="4" fill="#00d68f" />
              <circle cx="140" cy="80" r="4" fill="#00d68f" />
              <text x="60" y="93" fill="var(--text-secondary)" fontSize="8" textAnchor="middle">Bottom 1</text>
              <text x="140" y="93" fill="var(--text-secondary)" fontSize="8" textAnchor="middle">Bottom 2</text>
              <path d="M 153 40 L 170 17 L 163 17 M 170 17 L 170 24" stroke="#00d68f" strokeWidth="2" fill="none" />
              <text x="175" y="15" fill="#00d68f" fontSize="8" fontWeight="bold">Breakout</text>
            </svg>
          );
        case 'double_top':
          return (
            <svg width="100%" height="100%" viewBox="0 0 200 100" fill="none">
              <path d="M 20 80 L 60 20 L 100 60 L 140 20 L 180 80" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="20" y1="60" x2="180" y2="60" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3" />
              <text x="100" y="72" fill="#f43f5e" fontSize="9" fontWeight="bold" textAnchor="middle">Neckline (Support)</text>
              <circle cx="60" cy="20" r="4" fill="#ff4d6a" />
              <circle cx="140" cy="20" r="4" fill="#ff4d6a" />
              <text x="60" y="12" fill="var(--text-secondary)" fontSize="8" textAnchor="middle">Peak 1</text>
              <text x="140" y="12" fill="var(--text-secondary)" fontSize="8" textAnchor="middle">Peak 2</text>
              <path d="M 153 60 L 170 83 M 170 83 L 163 83 M 170 83 L 170 76" stroke="#ff4d6a" strokeWidth="2" fill="none" />
              <text x="175" y="90" fill="#ff4d6a" fontSize="8" fontWeight="bold">Breakdown</text>
            </svg>
          );
        case 'head_shoulders':
          return (
            <svg width="100%" height="100%" viewBox="0 0 200 100" fill="none">
              <path d="M 10 80 L 40 45 L 70 65 L 100 15 L 130 65 L 160 45 L 190 80" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="10" y1="65" x2="190" y2="65" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3" />
              <text x="100" y="75" fill="#f43f5e" fontSize="9" fontWeight="bold" textAnchor="middle">Neckline Support</text>
              <circle cx="40" cy="45" r="4" fill="#ff4d6a" />
              <circle cx="100" cy="15" r="4" fill="#ff4d6a" />
              <circle cx="160" cy="45" r="4" fill="#ff4d6a" />
              <text x="40" y="37" fill="var(--text-secondary)" fontSize="8" textAnchor="middle">Left Shoulder</text>
              <text x="100" y="8" fill="var(--text-secondary)" fontSize="8" textAnchor="middle">Head</text>
              <text x="160" y="37" fill="var(--text-secondary)" fontSize="8" textAnchor="middle">Right Shoulder</text>
            </svg>
          );
        case 'bull_flag':
          return (
            <svg width="100%" height="100%" viewBox="0 0 200 100" fill="none">
              <path d="M 20 90 L 60 20 L 110 50 L 90 70 L 140 40 L 120 60" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {/* Flag boundaries */}
              <line x1="55" y1="15" x2="145" y2="35" stroke="#fbbf24" strokeWidth="1.5" />
              <line x1="85" y1="65" x2="125" y2="75" stroke="#fbbf24" strokeWidth="1.5" />
              <text x="40" y="55" fill="var(--text-secondary)" fontSize="8">Flag Pole</text>
              <path d="M 125 45 L 155 25 M 155 25 L 148 25 M 155 25 L 155 32" stroke="#00d68f" strokeWidth="2" fill="none" />
              <text x="160" y="23" fill="#00d68f" fontSize="8" fontWeight="bold">Breakout</text>
            </svg>
          );
      }
    };

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-bold text-white mb-1">📈 Module 6: Chart Patterns & Breakout Validation</h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Identifying reliable market patterns and checking their validity using quantitative data feeds.</p>
        </div>

        {/* Pattern Simulator */}
        <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <h3 className="text-sm font-bold text-white mb-3 text-pink-400">🎛️ Interactive Pattern Simulator</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Select a pattern to visualize its structure and breakout target:</p>
          
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 no-scrollbar">
            {[
              { id: 'double_bottom', label: 'Double Bottom' },
              { id: 'double_top', label: 'Double Top' },
              { id: 'head_shoulders', label: 'Head & Shoulders' },
              { id: 'bull_flag', label: 'Bull Flag' },
            ].map(p => (
              <button key={p.id}
                onClick={() => setSelectedPattern(p.id as any)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-all"
                style={{
                  background: selectedPattern === p.id ? 'rgba(244,63,94,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selectedPattern === p.id ? 'rgba(244,63,94,0.4)' : 'var(--border-color)'}`,
                  color: selectedPattern === p.id ? '#f43f5e' : 'var(--text-secondary)',
                }}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="h-44 w-full bg-slate-950 rounded-xl p-4 flex items-center justify-center border border-white/[0.03]">
            {renderPatternSketch()}
          </div>
        </section>

        {/* Explanations */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <h4 className="text-xs font-bold uppercase tracking-wider text-pink-400 mb-2">🔄 Reversal Patterns</h4>
            <ul className="space-y-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <li>
                <strong className="text-white">Double Bottom:</strong> Formed when price hits a low support level twice and rallies. Neckline breakout confirms a change from bearish to bullish trend.
              </li>
              <li>
                <strong className="text-white">Head and Shoulders:</strong> Formed of three peaks (left shoulder, head, right shoulder) on a support neckline. Neckline breakdown signals structural bearish distribution.
              </li>
            </ul>
          </div>

          <div className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <h4 className="text-xs font-bold uppercase tracking-wider text-pink-400 mb-2">🚀 Continuation & Consolidation</h4>
            <ul className="space-y-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <li>
                <strong className="text-white">Bull Flag:</strong> A sharp upward vertical rise (pole) followed by a downward-sloping rectangular channel (flag). Breakout above channel confirms continuation of the rally.
              </li>
              <li>
                <strong className="text-white">Triangles:</strong> Ascending triangle (horizontal resistance, rising support) typically breaks out to the upside. Descending breaks down.
              </li>
            </ul>
          </div>
        </section>

        {/* Validation */}
        <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <h3 className="text-sm font-bold text-white mb-3 text-pink-400">🛡️ Breakout Validation (Avoiding Bull & Bear Traps)</h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            Most breakouts fail. To filter out traps, our algorithm validates price breakouts with secondary data feeds:
          </p>
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)' }}>
              <p className="font-bold text-white mb-1">📦 Volume Profile Alignment</p>
              <p style={{ color: 'var(--text-secondary)' }}>Breakout must happen on volume ratio &gt; 1.5x (relative to 20-day average) and successfully push past the Point of Control (POC) high-volume node. Low volume breakouts are highly prone to reversing.</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)' }}>
              <p className="font-bold text-white mb-1">📋 Open Interest & Option Writing Validation</p>
              <p style={{ color: 'var(--text-secondary)' }}>A bullish breakout must be supported by fresh Long Build-up (Price Up + OI Up) or massive Short Covering (Price Up + OI Down). Additionally, verify that PCR is rising (&gt; 1.1) to confirm put-writing support beneath the breakout strike.</p>
            </div>
          </div>
        </section>

        <div className="text-center">
          <button onClick={() => markComplete('patterns')} className="px-6 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all hover:scale-105"
            style={{ background: completedModules.has('patterns') ? 'rgba(0,214,143,0.2)' : 'linear-gradient(135deg, #f43f5e, #ec4899)', color: 'white' }}>
            {completedModules.has('patterns') ? '✓ Module Complete' : 'Mark Module as Complete'}
          </button>
        </div>

        <QuizWidget moduleId="patterns" />
      </div>
    );
  };

  const renderFundamentals = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">🏛️ Module 7: Fundamental Analysis & Value Screening</h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>How the model screens for high capital efficiency and low financial leverage to build swings with a solid safety net.</p>
      </div>

      {/* Health Checker Calculator */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-3 text-emerald-400">🧮 Fundamental Health Checker</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Adjust the sliders to see how the model evaluates a stock's fundamentals:</p>

        <div className="space-y-4 mb-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: 'var(--text-secondary)' }}>Return on Equity (ROE %):</span>
              <span className="font-bold text-white">{calcRoe}%</span>
            </div>
            <input type="range" min={0} max={40} value={calcRoe} onChange={e => setCalcRoe(parseInt(e.target.value))}
              className="w-full" style={{ accentColor: '#10b981' }} />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: 'var(--text-secondary)' }}>Debt-to-Equity Ratio:</span>
              <span className="font-bold text-white">{calcDebtToEquity}x</span>
            </div>
            <input type="range" min={0} max={3} step={0.1} value={calcDebtToEquity} onChange={e => setCalcDebtToEquity(parseFloat(e.target.value))}
              className="w-full" style={{ accentColor: '#10b981' }} />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: 'var(--text-secondary)' }}>ROCE %:</span>
              <span className="font-bold text-white">{calcRoce}%</span>
            </div>
            <input type="range" min={0} max={40} value={calcRoce} onChange={e => setCalcRoce(parseInt(e.target.value))}
              className="w-full" style={{ accentColor: '#10b981' }} />
          </div>
        </div>

        <div className="p-4 rounded-xl text-center border-2 transition-all duration-300" style={{
          background: `${healthInfo.color}11`,
          borderColor: healthInfo.color,
        }}>
          <p className="text-lg font-black" style={{ color: healthInfo.color }}>
            Assessment: {healthInfo.status}
          </p>
          <p className="text-xs mt-1 text-slate-300">{healthInfo.advice}</p>
        </div>
      </section>

      {/* Metric Explanations */}
      <section className="space-y-4">
        <div className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">1. P/E & PEG Ratios</h4>
          <Formula
            label="PEG Ratio Formula"
            formula={`PEG = (P/E Ratio) / (Annual EPS Growth Rate)\n\nUnder 1.0  = Undervalued relative to growth\nOver 2.0   = Overvalued relative to growth`}
            desc="A stock with a high P/E of 40 might look expensive, but if its earnings are growing at 40% per year, its PEG is 1.0 (fair value)."
            themeColor="#10b981"
          />
        </div>

        <div className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">2. ROE vs ROCE (Capital Efficiency)</h4>
          <Formula
            label="Capital Efficiency Formulas"
            formula={`ROE  = Net Income / Shareholders' Equity\nROCE = EBIT (Operating Profit) / Capital Employed\n\nCapital Employed = Total Assets - Current Liabilities`}
            desc="ROE only considers returns on equity. ROCE includes returns on debt. For infrastructure and power stocks, ROCE is the true efficiency test."
            themeColor="#10b981"
          />
        </div>
      </section>

      <div className="text-center">
        <button onClick={() => markComplete('fundamentals')} className="px-6 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all hover:scale-105"
          style={{ background: completedModules.has('fundamentals') ? 'rgba(0,214,143,0.2)' : 'linear-gradient(135deg, #10b981, #3b82f6)', color: 'white' }}>
          {completedModules.has('fundamentals') ? '✓ Module Complete' : 'Mark Module as Complete'}
        </button>
      </div>

      <QuizWidget moduleId="fundamentals" />
    </div>
  );

  const renderSentiment = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">💬 Module 8: Sentiment Analysis & Hype Cycles</h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>How the model calculates news sentiment velocity and detects unsustainable speculative retail bubbles.</p>
      </div>

      {/* News Decay Calculator */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-3 text-violet-400">⏱️ News Decay Weight Calculator</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Move the slider to see how news age degrades its predictive importance weight in the ML model:</p>

        <div className="space-y-4 mb-4">
          <div className="flex justify-between text-xs mb-1">
            <span style={{ color: 'var(--text-secondary)' }}>Age of News (Hours):</span>
            <span className="font-bold text-white">{decayHours} hours ago</span>
          </div>
          <input type="range" min={0} max={72} value={decayHours} onChange={e => setDecayHours(parseInt(e.target.value))}
            className="w-full" style={{ accentColor: '#a78bfa' }} />
        </div>

        <div className="p-4 rounded-xl text-center border transition-all duration-300" style={{
          background: 'rgba(167,139,250,0.06)',
          borderColor: 'rgba(167,139,250,0.4)',
        }}>
          <p className="text-xs uppercase tracking-wider text-slate-400">Effective Prediction Weight</p>
          <p className="text-3xl font-black text-white mt-1">{calculatedDecayWeight}%</p>
          <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden mt-3">
            <div className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${calculatedDecayWeight}%`,
                background: calculatedDecayWeight > 60 ? '#10b981' : calculatedDecayWeight > 25 ? '#fbbf24' : '#ef4444'
              }} />
          </div>
        </div>
      </section>

      {/* Sentiment Velocity */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-2 text-violet-400">1️⃣ Sentiment Velocity — Rate of Change</h3>
        <Formula
          label="Sentiment Velocity Formula"
          formula={`Sentiment Velocity = (1-day Net Sentiment) - (5-day Rolling Avg)\n\nVelocity > 0 = Positive news rate is ACCELERATING\nVelocity < 0 = Negative news rate is ACCELERATING`}
          desc="Accelerating sentiment indicates high momentum. It is a leading indicator for stock breakouts, while static sentiment is a lagging indicator."
          themeColor="#a78bfa"
        />
      </section>

      {/* Accumulation vs Hype */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-3 text-violet-400">2️⃣ Accumulation vs Speculative Hype</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>Comparing sentiment with delivery metrics reveals institutional vs retail activity:</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
            <p className="text-xs font-bold text-emerald-400 mb-1">🏦 Institutional Accumulation</p>
            <ul className="space-y-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              <li>• Price: Steady or slow rise</li>
              <li>• News Sentiment: Neutral / under-reported</li>
              <li>• Delivery Volume %: High (&gt;55%)</li>
              <li>• Action: Strong structural BUY setup</li>
            </ul>
          </div>
          <div className="p-3.5 rounded-lg border border-red-500/20 bg-red-500/5">
            <p className="text-xs font-bold text-red-400 mb-1">🔥 Retail Speculative Hype</p>
            <ul className="space-y-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              <li>• Price: Surging rapidly</li>
              <li>• News Sentiment: Extreme positive euphoria</li>
              <li>• Delivery Volume %: Very low (&lt;20%)</li>
              <li>• Action: Highly risky, prone to sharp reversals</li>
            </ul>
          </div>
        </div>
      </section>

      <div className="text-center">
        <button onClick={() => markComplete('sentiment')} className="px-6 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all hover:scale-105"
          style={{ background: completedModules.has('sentiment') ? 'rgba(0,214,143,0.2)' : 'linear-gradient(135deg, #a78bfa, #8b5cf6)', color: 'white' }}>
          {completedModules.has('sentiment') ? '✓ Module Complete' : 'Mark Module as Complete'}
        </button>
      </div>

      <QuizWidget moduleId="sentiment" />
    </div>
  );

  const renderGreeks = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">🛡️ Module 9: Option Greeks & Portfolio Hedging</h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Understanding option sensitivities and executing downside risk cover strategies.</p>
      </div>

      {/* Theta Decay Visualizer */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-3 text-pink-500">⏳ Option Theta Decay Visualizer</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Drag the slider to see how time remaining decays option value exponentially:</p>

        <div className="space-y-4 mb-4">
          <div className="flex justify-between text-xs mb-1">
            <span style={{ color: 'var(--text-secondary)' }}>Days to Expiry:</span>
            <span className="font-bold text-white">{thetaDays} days left</span>
          </div>
          <input type="range" min={0} max={30} value={thetaDays} onChange={e => setThetaDays(parseInt(e.target.value))}
            className="w-full" style={{ accentColor: '#ec4899' }} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl text-center border border-pink-500/20 bg-pink-500/5">
            <p className="text-[10px] uppercase text-slate-400">Option Intrinsic Value Remaining</p>
            <p className="text-3xl font-black text-white mt-1">{calculatedThetaValue}%</p>
          </div>
          <div className="p-4 rounded-xl text-center border border-white/10 bg-white/[0.02]">
            <p className="text-[10px] uppercase text-slate-400">Decay Speed</p>
            <p className="text-sm font-bold text-white mt-2">
              {thetaDays <= 5 ? '⚡ CRITICAL SPEED (Exponential)' : thetaDays <= 15 ? '🟡 MODERATE' : '🟢 SLOW'}
            </p>
          </div>
        </div>
      </section>

      {/* Option Greeks */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-3 text-pink-500">1. Option Sensitivity Metrics (Greeks)</h3>
        <div className="space-y-3 text-xs">
          {[
            { greek: 'Delta', rule: 'Directional sensitivity. Measures option price change per ₹1 stock move. Calls have positive delta (0 to 1); Puts have negative (-1 to 0).' },
            { greek: 'Gamma', rule: 'Rate of change of Delta. High Gamma means Delta changes rapidly. Highest near ATM strikes and close to expiry.' },
            { greek: 'Theta', rule: 'Time decay. Amount option value drops daily. Theta is positive for option sellers and negative for buyers.' },
            { greek: 'Vega', rule: 'Volatility sensitivity. Measures option price change per 1% change in Implied Volatility (IV).' },
          ].map(g => (
            <div key={g.greek} className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)' }}>
              <p className="font-bold text-white mb-1 font-sans">{g.greek}</p>
              <p style={{ color: 'var(--text-secondary)' }}>{g.rule}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Hedging */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-3 text-pink-500">2. Portfolio Hedging Strategies</h3>
        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-bold text-white mb-1">🛡️ The Protective Put Strategy (Downside Insurance)</h4>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              If you own a large equity swing position on a high-volatility stock (e.g., ADANIENT), purchase an out-of-the-money (OTM) Put option. If the market experiences a flash crash, the Put value increases dramatically, compensating for underlying portfolio losses.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-bold text-white mb-1">💵 Covered Call Strategy (Yield Generation)</h4>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              For stocks consolidating in a range (such as ITC), sell OTM Call options. The premiums collected provide a steady income yield, offsetting slight downside movements and maximizing yield during flat consolidations.
            </p>
          </div>
        </div>
      </section>

      <div className="text-center">
        <button onClick={() => markComplete('greeks')} className="px-6 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all hover:scale-105"
          style={{ background: completedModules.has('greeks') ? 'rgba(0,214,143,0.2)' : 'linear-gradient(135deg, #ec4899, #f43f5e)', color: 'white' }}>
          {completedModules.has('greeks') ? '✓ Module Complete' : 'Mark Module as Complete'}
        </button>
      </div>

      <QuizWidget moduleId="greeks" />
    </div>
  );

  const renderPsychology = () => {
    const biasScenarios = [
      {
        id: 'fomo',
        title: '🔥 Stock is surging +12%! I want to buy now.',
        advice: '🚨 FOMO RISK! Entering after a parabolic move exposes you to severe pullback risk. The AI model checks if the price is >10% extended from the 20-day EMA and discounts the confidence level. Wait for a breakout retest or a pullback to the EMA support.',
      },
      {
        id: 'loss_aversion',
        title: '📉 Trade hit my stop-loss, but I want to hold.',
        advice: '🚨 LOSS AVERSION RISK! Prospect theory proves humans feel the pain of a loss twice as strongly as the pleasure of a gain, leading to holding losers to zero. Your stop-loss is your mathematical protection. Trust the VIX-adaptive stop and exit immediately.',
      },
      {
        id: 'revenge_trading',
        title: '😡 I just had 3 losses in a row. I need to make it back.',
        advice: '🚨 REVENGE TRADING RISK! Over-leveraging or force-trading non-signals to recover capital usually leads to account blowouts. Mathematically, even in a 55% win-rate system, there is a 9.1% probability of experiencing 3 losses in a row. Stop trading for the day.',
      },
      {
        id: 'confirmation_bias',
        title: '📖 I am looking for news supporting my open position.',
        advice: '🚨 CONFIRMATION BIAS RISK! Seeking only positive articles and ignoring red flags (like falling delivery volumes or rising PCR) leads to trading blind. The ML model looks at news neutral/objectively, calculating sentiment decay and velocity without emotional bias.',
      },
    ];

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-bold text-white mb-1">🧠 Module 10: Trading Psychology & Emotional Discipline</h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Trading is 10% strategy and 90% execution discipline. Neutralize cognitive biases using system rules.</p>
        </div>

        {/* Self Test */}
        <section className="p-5 rounded-xl animate-fade-in" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <h3 className="text-sm font-bold text-white mb-3 text-rose-400">🧠 Interactive Trader Bias Self-Test</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Click on the scenario you are currently feeling to reveal psychological advice:</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {biasScenarios.map(s => (
              <button key={s.id}
                onClick={() => setSelectedBias(selectedBias === s.id ? null : s.id)}
                className="p-3.5 rounded-xl text-left transition-all cursor-pointer hover:scale-[1.02]"
                style={{
                  background: selectedBias === s.id ? 'rgba(244,63,94,0.1)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${selectedBias === s.id ? 'rgba(244,63,94,0.4)' : 'var(--border-color)'}`,
                }}>
                <span className="text-xs font-bold text-white">{s.title}</span>
              </button>
            ))}
          </div>

          {selectedBias && (
            <div className="p-4 rounded-lg animate-fade-in" style={{
              background: 'rgba(244,63,94,0.06)',
              border: '1px solid rgba(244,63,94,0.2)',
            }}>
              <p className="text-xs text-slate-300">
                {biasScenarios.find(s => s.id === selectedBias)?.advice}
              </p>
            </div>
          )}
        </section>

        {/* Drawdowns */}
        <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <h3 className="text-sm font-bold text-white mb-3 text-rose-400">📊 The Math of Drawdowns</h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            Drawdowns are normal. A sequence of losses does not mean your edge is gone:
          </p>
          <Formula
            label="Probability of Consecutive Losses"
            formula={`P(N consecutive losses) = (1 - Win Rate)^N\n\nFor a system with a 55% Win Rate:\n  • 3 losses in a row: (0.45)^3 = 9.1% (1 in 11 trades)\n  • 5 losses in a row: (0.45)^5 = 1.8% (1 in 55 trades)`}
            desc="Statistically, you will experience 5 losses in a row eventually. Professional traders do not panic or change their strategy during drawdowns — they preserve capital using proper sizing."
            themeColor="#f43f5e"
          />
        </section>

        <div className="text-center">
          <button onClick={() => markComplete('psychology')} className="px-6 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all hover:scale-105"
            style={{ background: completedModules.has('psychology') ? 'rgba(0,214,143,0.2)' : 'linear-gradient(135deg, #f43f5e, #ff6b6b)', color: 'white' }}>
            {completedModules.has('psychology') ? '✓ Module Complete' : 'Mark Module as Complete'}
          </button>
        </div>

        <QuizWidget moduleId="psychology" />
      </div>
    );
  };

  const renderMetrics = () => {
    const expectancy = (metricsWinRate / 100 * metricsAvgProfit) - ((1 - metricsWinRate / 100) * metricsAvgLoss);
    const profitFactor = (metricsWinRate / 100 * metricsAvgProfit) / (((1 - metricsWinRate / 100) * metricsAvgLoss) || 1);

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-bold text-white mb-1">📊 Module 11: Quantitative Performance Metrics</h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>How quantitative systems analyze performance using statistical indices rather than raw dollar returns.</p>
        </div>

        {/* Expectancy Calculator */}
        <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <h3 className="text-sm font-bold text-white mb-3 text-emerald-400">🧮 Interactive Expectancy Calculator</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Input your system metrics to calculate Expected Value (EV):</p>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 block mb-1">Win Rate %</label>
              <input type="number" value={metricsWinRate} onChange={e => setMetricsWinRate(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                className="w-full p-2 rounded bg-slate-900 border border-white/10 text-white font-bold text-xs" />
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 block mb-1">Avg Profit (₹)</label>
              <input type="number" value={metricsAvgProfit} onChange={e => setMetricsAvgProfit(parseInt(e.target.value) || 0)}
                className="w-full p-2 rounded bg-slate-900 border border-white/10 text-white font-bold text-xs" />
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 block mb-1">Avg Loss (₹)</label>
              <input type="number" value={metricsAvgLoss} onChange={e => setMetricsAvgLoss(parseInt(e.target.value) || 0)}
                className="w-full p-2 rounded bg-slate-900 border border-white/10 text-white font-bold text-xs" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl text-center border transition-all duration-300" style={{
              background: expectancy > 0 ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
              borderColor: expectancy > 0 ? '#10b981' : '#ef4444',
            }}>
              <p className="text-[10px] uppercase text-slate-400">Expectancy (Value per Trade)</p>
              <p className="text-2xl font-black text-white mt-1">₹{Math.round(expectancy).toLocaleString('en-IN')}</p>
              <p className="text-[10px] mt-1" style={{ color: expectancy > 0 ? '#10b981' : '#ef4444' }}>
                {expectancy > 0 ? '🏆 Mathematically Profitable Setup' : '⚠️ Mathematically Ruinous Strategy'}
              </p>
            </div>

            <div className="p-4 rounded-xl text-center border border-white/10 bg-white/[0.02]">
              <p className="text-[10px] uppercase text-slate-400">Implied Profit Factor</p>
              <p className="text-2xl font-black text-white mt-1">{profitFactor.toFixed(2)}x</p>
              <p className="text-[10px] mt-1 text-slate-400">Ratio of profits to losses</p>
            </div>
          </div>
        </section>

        {/* Detailed Metrics */}
        <section className="space-y-4">
          <div className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">1. Sharpe Ratio vs Sortino Ratio</h4>
            <ul className="space-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <li>
                <strong className="text-white">Sharpe Ratio:</strong> Evaluates return per unit of volatility. Considers both upside and downside swings.
              </li>
              <li>
                <strong className="text-white">Sortino Ratio:</strong> A variant of Sharpe that only penalizes downside volatility. Since upside volatility is desirable, Sortino is preferred by active traders.
              </li>
            </ul>
          </div>
        </section>

        <div className="text-center">
          <button onClick={() => markComplete('metrics')} className="px-6 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all hover:scale-105"
            style={{ background: completedModules.has('metrics') ? 'rgba(0,214,143,0.2)' : 'linear-gradient(135deg, #10b981, #3b82f6)', color: 'white' }}>
            {completedModules.has('metrics') ? '✓ Module Complete' : 'Mark Module as Complete'}
          </button>
        </div>

        <QuizWidget moduleId="metrics" />
      </div>
    );
  };

  const renderTaxation = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">🏦 Module 12: Indian Trader Taxation & Compliance</h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Taxation frameworks under the Income Tax Act for F&O, intraday, and capital gains in India.</p>
      </div>

      {/* Tax Matrix Table */}
      <section className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-bold text-white mb-3 text-cyan-400">📊 Tax Classification Matrix</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="py-2 pr-4 font-bold">Segment</th>
                <th className="py-2 px-4 font-bold">Income Type</th>
                <th className="py-2 px-4 font-bold">Tax Rate</th>
                <th className="py-2 pl-4 font-bold">Loss Offset Limits</th>
              </tr>
            </thead>
            <tbody style={{ color: 'var(--text-secondary)' }}>
              <tr className="border-b border-white/5">
                <td className="py-2.5 pr-4 font-bold text-white">Intraday Equity</td>
                <td className="py-2.5 px-4 text-amber-400">Speculative Business</td>
                <td className="py-2.5 px-4">Individual Income Slab Rates</td>
                <td className="py-2.5 pl-4">4 years (only against speculative profit)</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2.5 pr-4 font-bold text-white">F&O (Derivatives)</td>
                <td className="py-2.5 px-4 text-emerald-400">Non-Speculative Business</td>
                <td className="py-2.5 px-4">Individual Income Slab Rates</td>
                <td className="py-2.5 pl-4">8 years (against any business income)</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2.5 pr-4 font-bold text-white">Delivery Equity (&lt;1 yr)</td>
                <td className="py-2.5 px-4 text-blue-400">STCG</td>
                <td className="py-2.5 px-4">Flat 15%</td>
                <td className="py-2.5 pl-4">8 years (against STCG/LTCG)</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-bold text-white">Delivery Equity (&gt;1 yr)</td>
                <td className="py-2.5 px-4 text-indigo-400">LTCG</td>
                <td className="py-2.5 px-4">10% on gains &gt; ₹1 Lakh</td>
                <td className="py-2.5 pl-4">8 years (only against LTCG)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Compliance Rules */}
      <section className="space-y-4">
        <div className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2">📑 Non-Speculative Business Expenses (F&O)</h4>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Since F&O is treated as business income, you can claim tax deductions for business-related expenses. Deductible items include:
          </p>
          <ul className="list-disc list-inside text-xs mt-2 space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
            <li>• Transaction fees (brokerage, STT, exchange transaction charges).</li>
            <li>• Equipment costs (laptop, monitor depreciation).</li>
            <li>• Operations expense (internet bills, electricity fraction, office rent).</li>
            <li>• Subscriptions (charts, data feeds, and algorithmic alert systems).</li>
          </ul>
        </div>

        <div className="p-5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2">🧑‍💼 Section 44AB — Audit Limits</h4>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            A tax audit by a Chartered Accountant is required if your business turnover exceeds limits:
          </p>
          <ul className="list-disc list-inside text-xs mt-2 space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
            <li>• The standard threshold is ₹10 Crore (for digital transactions, which covers all stock market trades).</li>
            <li>• If audit conditions apply, you must file ITR-3 and submit audited financials.</li>
          </ul>
        </div>
      </section>

      <div className="text-center">
        <button onClick={() => markComplete('taxation')} className="px-6 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all hover:scale-105"
          style={{ background: completedModules.has('taxation') ? 'rgba(0,214,143,0.2)' : 'linear-gradient(135deg, #22d3ee, #06b6d4)', color: 'white' }}>
          {completedModules.has('taxation') ? '✓ Module Complete' : 'Mark Module as Complete'}
        </button>
      </div>

      <QuizWidget moduleId="taxation" />
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
      case 'patterns': return renderPatterns();
      case 'fundamentals': return renderFundamentals();
      case 'sentiment': return renderSentiment();
      case 'greeks': return renderGreeks();
      case 'psychology': return renderPsychology();
      case 'metrics': return renderMetrics();
      case 'taxation': return renderTaxation();
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
            Master technicals, fundamentals, options Greeks, the algorithm, and risk management — end to end.
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
                <span className="flex-1 text-left">{m.label}</span>
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
