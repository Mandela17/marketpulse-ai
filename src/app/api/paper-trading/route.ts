// API route for Paper Trading — persists to Supabase
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

const TABLE = 'paper_trading_state';

// GET — Load paper trading state
export async function GET() {
  try {
    const supabase = getServiceClient();
    
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', 'default')
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = "no rows" — that's OK, return empty state
      console.error('[PaperTrading API] Load error:', error);
    }

    if (data?.state) {
      return NextResponse.json({
        state: data.state,
        autoConfig: data.auto_config || null,
        autoLog: data.auto_log || null,
      });
    }

    // No saved state — return null so client creates fresh
    return NextResponse.json({ state: null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — Save paper trading state
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { state, autoConfig, autoLog } = body;

    if (!state) {
      return NextResponse.json({ error: 'No state provided' }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { error } = await supabase
      .from(TABLE)
      .upsert({
        id: 'default',
        state,
        auto_config: autoConfig || null,
        auto_log: autoLog || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (error) {
      console.error('[PaperTrading API] Save error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
