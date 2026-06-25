// API Route: Query sentiment history from Supabase
import { NextResponse } from 'next/server';
import { supabase, getServiceClient } from '@/lib/supabase';
import { fetchHistoricalOHLCV } from '@/lib/technicalAnalysis';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'sector'; // 'sector' or 'stock'
  const id = searchParams.get('id'); // sector_id or stock symbol
  const days = parseInt(searchParams.get('days') || '7');

  if (!id) {
    return NextResponse.json({ error: 'Missing "id" parameter' }, { status: 400 });
  }

  try {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromDateStr = fromDate.toISOString().split('T')[0];

    if (type === 'sector') {
      const { data, error } = await supabase
        .from('sector_sentiment_history')
        .select('date, score, article_count, key_driver')
        .eq('sector_id', id)
        .gte('date', fromDateStr)
        .order('date', { ascending: true });

      if (error) throw error;

      return NextResponse.json({
        type: 'sector',
        id,
        days,
        history: data || [],
      });
    } else {
      const { data, error } = await supabase
        .from('stock_sentiment_history')
        .select('date, sentiment, article_count, price_close')
        .eq('symbol', id)
        .gte('date', fromDateStr)
        .order('date', { ascending: true });

      if (error) throw error;

      // Lazy Backfilling: Find past dates where price_close is NULL or 0
      const historyData = data || [];
      const todayStr = new Date().toISOString().split('T')[0];
      const missingClose = historyData.filter(
        item => (item.price_close === null || item.price_close === 0) && item.date !== todayStr
      );

      if (missingClose.length > 0) {
        try {
          const ohlcv = await fetchHistoricalOHLCV(id, days + 10);
          const priceMap = new Map<string, number>();
          for (const candle of ohlcv) {
            priceMap.set(candle.date, candle.close);
          }

          const db = getServiceClient();
          const updates = [];

          for (const item of missingClose) {
            const closePrice = priceMap.get(item.date);
            if (closePrice !== undefined && closePrice > 0) {
              item.price_close = closePrice; // update in-memory object
              updates.push(
                db.from('stock_sentiment_history')
                  .update({ price_close: closePrice })
                  .eq('symbol', id)
                  .eq('date', item.date)
              );
            }
          }

          if (updates.length > 0) {
            await Promise.all(updates);
            console.log(`[History API] Backfilled ${updates.length} closing prices for ${id}`);
          }
        } catch (err: any) {
          console.warn('[History API] Lazy backfill failed:', err.message);
        }
      }

      return NextResponse.json({
        type: 'stock',
        id,
        days,
        history: historyData,
      });
    }
  } catch (error: any) {
    console.error('[History API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history', details: error.message },
      { status: 500 }
    );
  }
}
