'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  IChartApi,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  AreaSeries,
  createSeriesMarkers,
} from 'lightweight-charts';
import type { Time, CandlestickData, HistogramData, LineData, AreaData, SeriesMarker } from 'lightweight-charts';

interface ChartPricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PredictionMarker {
  date: string;
  direction: 'up' | 'down';
  confidence: number;
}

interface TradingViewChartProps {
  priceData: ChartPricePoint[];
  sentimentHistory?: { date: string; sentiment: number }[];
  symbol: string;
  predictions?: PredictionMarker[];
}

// ─── EMA Computation ────────────────────────────────
function computeEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  const k = 2 / (period + 1);
  const emaValues: number[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += prices[i];
  let ema = sum / period;
  emaValues.push(ema);
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    emaValues.push(ema);
  }
  return emaValues;
}

// ─── RSI Computation ────────────────────────────────
function computeRSI(prices: number[], period: number = 14): number[] {
  if (prices.length < period + 1) return [];
  const rsiValues: number[] = [];
  let gains = 0, losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsiValues.push(100 - 100 / (1 + rs));

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
    const rs2 = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiValues.push(100 - 100 / (1 + rs2));
  }
  return rsiValues;
}

export default function TradingViewChart({ priceData, sentimentHistory, symbol, predictions }: TradingViewChartProps) {
  const priceContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const priceChartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const [timeframe, setTimeframe] = useState<'1M' | '3M' | '6M' | '1Y'>('3M');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ChartPricePoint[]>(priceData);

  // Fetch data for different timeframe
  const fetchTimeframe = useCallback(async (tf: string) => {
    const days = tf === '1M' ? 30 : tf === '3M' ? 90 : tf === '6M' ? 180 : 365;
    setLoading(true);
    try {
      const res = await fetch(`/api/stock/ohlcv?symbol=${symbol}&days=${days}`);
      const json = await res.json();
      if (json.data?.length) setData(json.data);
    } catch (err) {
      console.warn('[Chart] Timeframe fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  // Update data when props change
  useEffect(() => { if (priceData.length) setData(priceData); }, [priceData]);
  useEffect(() => { fetchTimeframe(timeframe); }, [timeframe, fetchTimeframe]);

  // ─── Build Charts ─────────────────────────────────
  useEffect(() => {
    if (!priceContainerRef.current || !rsiContainerRef.current || data.length === 0) return;

    // Cleanup
    if (priceChartRef.current) { try { priceChartRef.current.remove(); } catch {} priceChartRef.current = null; }
    if (rsiChartRef.current) { try { rsiChartRef.current.remove(); } catch {} rsiChartRef.current = null; }

    const chartWidth = priceContainerRef.current.clientWidth;

    const chartOptions = {
      width: chartWidth,
      layout: {
        background: { type: ColorType.Solid as const, color: 'transparent' },
        textColor: 'rgba(255,255,255,0.45)',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(255,255,255,0.12)', width: 1 as const, style: 3 as const },
        horzLine: { color: 'rgba(255,255,255,0.12)', width: 1 as const, style: 3 as const },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: false,
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
      },
    };

    // ── Price Chart ──────────────────────────────────
    const priceChart = createChart(priceContainerRef.current, {
      ...chartOptions,
      height: 320,
      rightPriceScale: { ...chartOptions.rightPriceScale, scaleMargins: { top: 0.05, bottom: 0.2 } },
      timeScale: { ...chartOptions.timeScale, visible: false },
    });
    priceChartRef.current = priceChart;

    // Candlesticks
    const candleSeries = priceChart.addSeries(CandlestickSeries, {
      upColor: '#00d68f',
      downColor: '#ff4d6a',
      borderUpColor: '#00d68f',
      borderDownColor: '#ff4d6a',
      wickUpColor: 'rgba(0,214,143,0.6)',
      wickDownColor: 'rgba(255,77,106,0.6)',
    });
    candleSeries.setData(data.map(d => ({
      time: d.date as Time,
      open: d.open, high: d.high, low: d.low, close: d.close,
    })));

    // Volume
    const volSeries = priceChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    priceChart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volSeries.setData(data.map(d => ({
      time: d.date as Time,
      value: d.volume,
      color: d.close >= d.open ? 'rgba(0,214,143,0.15)' : 'rgba(255,77,106,0.15)',
    })));

    // EMA 20
    const closes = data.map(d => d.close);
    const ema20Vals = computeEMA(closes, 20);
    if (ema20Vals.length > 0) {
      const ema20Series = priceChart.addSeries(LineSeries, {
        color: '#3b82f6', lineWidth: 1,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      ema20Series.setData(ema20Vals.map((v, i) => ({
        time: data[data.length - ema20Vals.length + i].date as Time, value: v,
      })));
    }

    // EMA 50
    const ema50Vals = computeEMA(closes, 50);
    if (ema50Vals.length > 0) {
      const ema50Series = priceChart.addSeries(LineSeries, {
        color: '#f59e0b', lineWidth: 1,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      ema50Series.setData(ema50Vals.map((v, i) => ({
        time: data[data.length - ema50Vals.length + i].date as Time, value: v,
      })));
    }

    // Prediction markers
    if (predictions?.length) {
      const dateSet = new Set(data.map(d => d.date));
      const validPreds = predictions.filter(p => dateSet.has(p.date));
      if (validPreds.length) {
        createSeriesMarkers(candleSeries, validPreds.map(p => ({
          time: p.date as Time,
          position: p.direction === 'up' ? 'belowBar' as const : 'aboveBar' as const,
          color: p.direction === 'up' ? '#00d68f' : '#ff4d6a',
          shape: p.direction === 'up' ? 'arrowUp' as const : 'arrowDown' as const,
          text: `${p.direction === 'up' ? '▲' : '▼'} ${p.confidence}%`,
          size: 1,
        })));
      }
    }

    priceChart.timeScale().fitContent();

    // ── RSI Chart ────────────────────────────────────
    const rsiChart = createChart(rsiContainerRef.current, {
      ...chartOptions,
      height: 100,
      rightPriceScale: {
        ...chartOptions.rightPriceScale,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
    });
    rsiChartRef.current = rsiChart;

    const rsiVals = computeRSI(closes);
    if (rsiVals.length > 0) {
      const rsiSeries = rsiChart.addSeries(LineSeries, {
        color: '#8b5cf6', lineWidth: 2,
        priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true,
      });
      rsiSeries.setData(rsiVals.map((v, i) => ({
        time: data[data.length - rsiVals.length + i].date as Time,
        value: parseFloat(v.toFixed(1)),
      })));

      // Overbought/Oversold lines
      const ob = rsiChart.addSeries(LineSeries, {
        color: 'rgba(255,77,106,0.3)', lineWidth: 1,
        lineStyle: 2, priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      ob.setData(data.slice(-rsiVals.length).map(d => ({
        time: d.date as Time, value: 70,
      })));

      const os = rsiChart.addSeries(LineSeries, {
        color: 'rgba(0,214,143,0.3)', lineWidth: 1,
        lineStyle: 2, priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      os.setData(data.slice(-rsiVals.length).map(d => ({
        time: d.date as Time, value: 30,
      })));
    }

    rsiChart.timeScale().fitContent();

    // Sync timescales
    let isSyncing = false;
    priceChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (isSyncing || !range) return;
      isSyncing = true;
      rsiChart.timeScale().setVisibleLogicalRange(range);
      isSyncing = false;
    });
    rsiChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (isSyncing || !range) return;
      isSyncing = true;
      priceChart.timeScale().setVisibleLogicalRange(range);
      isSyncing = false;
    });

    // Resize observer
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = e.contentRect.width;
        priceChart.applyOptions({ width: w });
        rsiChart.applyOptions({ width: w });
      }
    });
    ro.observe(priceContainerRef.current);

    return () => {
      ro.disconnect();
      try { priceChart.remove(); } catch {}
      try { rsiChart.remove(); } catch {}
      priceChartRef.current = null;
      rsiChartRef.current = null;
    };
  }, [data, predictions]);

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            📈 Price Chart
          </h3>
          <div className="flex items-center gap-3 ml-2">
            <span className="flex items-center gap-1 text-[10px]" style={{ color: '#3b82f6' }}>
              <span className="inline-block w-3 h-0.5 rounded" style={{ background: '#3b82f6' }} /> EMA20
            </span>
            <span className="flex items-center gap-1 text-[10px]" style={{ color: '#f59e0b' }}>
              <span className="inline-block w-3 h-0.5 rounded" style={{ background: '#f59e0b' }} /> EMA50
            </span>
            <span className="flex items-center gap-1 text-[10px]" style={{ color: '#8b5cf6' }}>
              <span className="inline-block w-3 h-0.5 rounded" style={{ background: '#8b5cf6' }} /> RSI
            </span>
          </div>
        </div>

        {/* Timeframe Selector */}
        <div className="flex gap-1">
          {(['1M', '3M', '6M', '1Y'] as const).map(tf => (
            <button key={tf} onClick={() => setTimeframe(tf)}
              className="text-[10px] font-bold px-2.5 py-1 rounded transition-all cursor-pointer"
              style={{
                background: timeframe === tf ? 'rgba(59,130,246,0.2)' : 'transparent',
                color: timeframe === tf ? '#60a5fa' : 'var(--text-muted)',
                border: timeframe === tf ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
              }}>
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10"
            style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--border-color)', borderTopColor: '#3b82f6' }} />
          </div>
        )}
        <div ref={priceContainerRef} />
        <div className="px-4 py-1">
          <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            RSI (14)
          </p>
        </div>
        <div ref={rsiContainerRef} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 text-[10px]"
        style={{ borderTop: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
        <span>{data.length} candles • Yahoo Finance</span>
        <span>Scroll / drag to zoom & pan</span>
      </div>
    </div>
  );
}
