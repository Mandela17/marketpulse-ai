// API Route: Query sentiment history from Supabase
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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

      return NextResponse.json({
        type: 'stock',
        id,
        days,
        history: data || [],
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
