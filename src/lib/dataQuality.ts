// Data Quality & System Health Monitoring
// Checks for stale data, missing features, and API failures.

import { getServiceClient } from './supabase';
import { fetchIndiaVIX } from './nseData';
import { getRecentFIIDIIFlows } from './fiiDiiData';

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'failing';
  lastUpdated: string;
  checks: {
    databaseConnected: boolean;
    fiiDiiDataFresh: boolean;
    vixDataFresh: boolean;
    modelTrainingData: 'sufficient' | 'insufficient' | 'building';
  };
  warnings: string[];
}

export async function checkSystemHealth(): Promise<SystemHealth> {
  const warnings: string[] = [];
  let status: SystemHealth['status'] = 'healthy';
  const checks = {
    databaseConnected: false,
    fiiDiiDataFresh: false,
    vixDataFresh: false,
    modelTrainingData: 'building' as SystemHealth['checks']['modelTrainingData'],
  };

  try {
    const db = getServiceClient();

    // 1. Check DB Connection & Model Data
    const { count, error } = await db
      .from('daily_features')
      .select('*', { count: 'exact', head: true });

    if (error) {
      warnings.push(`Database connection failed: ${error.message}`);
      status = 'failing';
    } else {
      checks.databaseConnected = true;
      if (count && count > 500) { // Approx 10 days * 40 stocks + some history
        checks.modelTrainingData = 'sufficient';
      } else if (count && count > 100) {
        checks.modelTrainingData = 'building';
        warnings.push('Model is in warm-up phase. Predictions rely heavily on heuristics.');
        status = 'degraded';
      } else {
        checks.modelTrainingData = 'insufficient';
        warnings.push('Insufficient historical data for ML ensemble. Fallback heuristics active.');
        status = 'degraded';
      }
    }

    // 2. Check FII/DII Freshness (Should be updated every trading day evening)
    const recentFlows = await getRecentFIIDIIFlows(1);
    if (recentFlows.length > 0) {
      const lastDate = new Date(recentFlows[0].date);
      const today = new Date();
      const diffDays = (today.getTime() - lastDate.getTime()) / (1000 * 3600 * 24);
      
      // If it's been more than 3 days (accounting for weekends), it's stale
      if (diffDays <= 4) {
        checks.fiiDiiDataFresh = true;
      } else {
        warnings.push(`FII/DII data is stale. Last updated: ${recentFlows[0].date}`);
        status = 'degraded';
      }
    } else {
      warnings.push('No FII/DII flow data available.');
      status = 'degraded';
    }

    // 3. Check VIX Freshness
    const vix = await fetchIndiaVIX();
    if (vix) {
      checks.vixDataFresh = true;
    } else {
      warnings.push('India VIX fetch failed. Market context may be impaired.');
      status = 'degraded';
    }

  } catch (err: any) {
    status = 'failing';
    warnings.push(`System health check failed: ${err.message}`);
  }

  return {
    status,
    lastUpdated: new Date().toISOString(),
    checks,
    warnings,
  };
}
