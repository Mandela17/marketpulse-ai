// API Route: Market events calendar
// Returns upcoming market events, earnings, RBI policy dates, F&O expiry

import { NextResponse } from 'next/server';
import { getUpcomingEvents, getEventsForMonth, getStockEvent } from '@/lib/eventCalendar';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'upcoming';
  const symbol = searchParams.get('symbol') || '';
  const days = parseInt(searchParams.get('days') || '14');
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1));

  try {
    switch (type) {
      case 'upcoming': {
        const events = getUpcomingEvents(days);
        return NextResponse.json({ events, count: events.length });
      }
      case 'month': {
        const events = getEventsForMonth(year, month);
        return NextResponse.json({ events, year, month, count: events.length });
      }
      case 'stock': {
        if (!symbol) return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
        const event = getStockEvent(symbol, days);
        return NextResponse.json({ event, symbol });
      }
      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[Events API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
