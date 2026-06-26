'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { createChart, ColorType, IChartApi, CandlestickSeries, HistogramSeries, AreaSeries, createSeriesMarkers } from 'lightweight-charts';

interface ChartPricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartSentimentPoint {
  date: string;
  sentiment: number;
}

interface TradingViewChartProps {
  priceData: ChartPricePoint[];
  sentimentHistory: ChartSentimentPoint[];
  symbol: string;
}

export default function TradingViewChart({ priceData, sentimentHistory, symbol }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const priceChartRef = useRef<HTMLDivElement>(null);
  const sentimentChartRef = useRef<HTMLDivElement>(null);
  
  const priceChartApi = useRef<IChartApi | null>(null);
  const sentimentChartApi = useRef<IChartApi | null>(null);

  // Store series references for incremental data updates
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const sentimentSeriesRef = useRef<any>(null);

  // ── CHART CREATION (runs once on mount) ──
  useEffect(() => {
    if (!priceChartRef.current || !sentimentChartRef.current) return;

    const chartWidth = priceChartRef.current.clientWidth || 600;

    // ─── 1. Price Candlestick Chart ───
    const priceChart = createChart(priceChartRef.current, {
      width: chartWidth,
      height: 260,
      layout: {
        background: { type: ColorType.Solid, color: '#0f172a' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(51, 65, 85, 0.2)' },
        horzLines: { color: 'rgba(51, 65, 85, 0.2)' },
      },
      timeScale: {
        borderColor: 'rgba(51, 65, 85, 0.4)',
        visible: false,
      },
      rightPriceScale: {
        borderColor: 'rgba(51, 65, 85, 0.4)',
      },
    });

    const candleSeries = priceChart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    const volumeSeries = priceChart.addSeries(HistogramSeries, {
      color: '#3b82f6',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.7, bottom: 0 },
    });

    // ─── 2. Sentiment Area Chart ───
    const sentimentChart = createChart(sentimentChartRef.current, {
      width: chartWidth,
      height: 120,
      layout: {
        background: { type: ColorType.Solid, color: '#0f172a' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(51, 65, 85, 0.2)' },
        horzLines: { color: 'rgba(51, 65, 85, 0.2)' },
      },
      timeScale: {
        borderColor: 'rgba(51, 65, 85, 0.4)',
        visible: true,
      },
      rightPriceScale: {
        borderColor: 'rgba(51, 65, 85, 0.4)',
        visible: true,
      },
    });

    const sentimentSeries = sentimentChart.addSeries(AreaSeries, {
      topColor: 'rgba(139, 92, 246, 0.4)',
      bottomColor: 'rgba(139, 92, 246, 0.05)',
      lineColor: '#8b5cf6',
      lineWidth: 2,
      autoscaleInfoProvider: () => ({
        priceRange: { minValue: 0, maxValue: 100 },
      }),
    });

    // ─── 3. Synchronise Zoom/Scroll Timescales ───
    let isReflecting = false;
    
    const syncTimeScale = (fromChart: IChartApi, toChart: IChartApi) => {
      const fromTimeScale = fromChart.timeScale();
      const toTimeScale = toChart.timeScale();
      
      fromTimeScale.subscribeVisibleLogicalRangeChange(range => {
        if (isReflecting || !range) return;
        isReflecting = true;
        toTimeScale.setVisibleLogicalRange(range);
        isReflecting = false;
      });
    };

    syncTimeScale(priceChart, sentimentChart);
    syncTimeScale(sentimentChart, priceChart);

    // ─── 4. Handle Window Resizing ───
    const handleResize = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      priceChart.resize(width, 260);
      sentimentChart.resize(width, 120);
    };

    window.addEventListener('resize', handleResize);

    // Store refs for data updates and cleanup
    priceChartApi.current = priceChart;
    sentimentChartApi.current = sentimentChart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    sentimentSeriesRef.current = sentimentSeries;

    return () => {
      window.removeEventListener('resize', handleResize);
      if (priceChartApi.current) {
        try { priceChartApi.current.remove(); } catch (err) {
          console.warn('[TradingViewChart] Price chart cleanup failed:', err);
        }
        priceChartApi.current = null;
      }
      if (sentimentChartApi.current) {
        try { sentimentChartApi.current.remove(); } catch (err) {
          console.warn('[TradingViewChart] Sentiment chart cleanup failed:', err);
        }
        sentimentChartApi.current = null;
      }
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      sentimentSeriesRef.current = null;
    };
  }, []); // Mount only — chart infrastructure created once

  // ── DATA UPDATES (runs when priceData or sentimentHistory changes) ──
  // Instead of destroying and recreating charts, we call setData() on existing series.
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !sentimentSeriesRef.current) return;
    if (priceData.length === 0) return;

    // Update candlestick data
    const formattedPriceData = priceData.map(d => ({
      time: d.date,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    candleSeriesRef.current.setData(formattedPriceData);

    // Update volume data
    const formattedVolumeData = priceData.map(d => ({
      time: d.date,
      value: d.volume,
      color: d.close >= d.open ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
    }));
    volumeSeriesRef.current.setData(formattedVolumeData);

    // Update sentiment data
    const sentimentMap = new Map<string, number>();
    for (const item of sentimentHistory) {
      sentimentMap.set(item.date, item.sentiment);
    }

    const formattedSentimentData = priceData.map(d => ({
      time: d.date,
      value: sentimentMap.get(d.date) ?? 50,
    }));
    sentimentSeriesRef.current.setData(formattedSentimentData);

    // Update sentiment markers on candlestick chart
    const markers: any[] = [];
    for (const candle of priceData) {
      const score = sentimentMap.get(candle.date);
      if (score !== undefined) {
        if (score >= 70) {
          markers.push({
            time: candle.date,
            position: 'belowBar',
            color: '#10b981',
            shape: 'arrowUp',
            text: 'BULL',
            size: 1,
          });
        } else if (score <= 30) {
          markers.push({
            time: candle.date,
            position: 'aboveBar',
            color: '#ef4444',
            shape: 'arrowDown',
            text: 'BEAR',
            size: 1,
          });
        }
      }
    }
    if (markers.length > 0) {
      createSeriesMarkers(candleSeriesRef.current, markers);
    }

    // Auto-fit the time scale to show all data
    if (priceChartApi.current) {
      priceChartApi.current.timeScale().fitContent();
    }
    if (sentimentChartApi.current) {
      sentimentChartApi.current.timeScale().fitContent();
    }
  }, [priceData, sentimentHistory]);

  return (
    <div ref={containerRef} className="w-full rounded-xl overflow-hidden p-4 border" 
         style={{ background: '#0f172a', borderColor: 'var(--border-color)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <span>🕯️ Interactive Candlesticks ({symbol})</span>
        </h3>
        <span className="text-[10px] text-slate-500 font-medium">Scroll / drag to zoom & pan</span>
      </div>
      <div ref={priceChartRef} className="w-full relative" />
      
      <div className="flex items-center justify-between mt-4 mb-2">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
          <span>🧠 AI Sentiment Trend (0-100)</span>
        </h3>
      </div>
      <div ref={sentimentChartRef} className="w-full relative" />
    </div>
  );
}
