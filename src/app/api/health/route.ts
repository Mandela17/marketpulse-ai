import { NextResponse } from 'next/server';
import { checkSystemHealth } from '@/lib/dataQuality';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const health = await checkSystemHealth();
    return NextResponse.json(health, {
      status: health.status === 'failing' ? 503 : 200,
    });
  } catch (error: any) {
    console.error('[Health API] Error:', error);
    return NextResponse.json(
      { status: 'failing', lastUpdated: new Date().toISOString(), warnings: [error.message], checks: {} },
      { status: 500 }
    );
  }
}
