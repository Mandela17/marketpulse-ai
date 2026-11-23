// Rate Limiter for Yahoo Finance API calls
// Prevents 429 errors by enforcing per-host request budgets and adaptive backoff.
// Phase 6: Production infrastructure for reliable data collection.

interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  backoffBaseMs: number;
  maxBackoffMs: number;
}

interface RateLimitState {
  recentRequests: number[];     // timestamps of recent requests
  consecutiveErrors: number;
  lastErrorTime: number | null;
  totalRequests: number;
  totalErrors: number;
  is429Backoff: boolean;
  backoffUntil: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequestsPerMinute: 120,    // High burst capacity to keep cron runs well under 20s
  maxRequestsPerHour: 1000,
  backoffBaseMs: 1000,
  maxBackoffMs: 15000,          // Max 15 second backoff
};

// In-memory state (resets on cold start — fine for serverless)
const hostStates: Map<string, RateLimitState> = new Map();

function getState(host: string): RateLimitState {
  if (!hostStates.has(host)) {
    hostStates.set(host, {
      recentRequests: [],
      consecutiveErrors: 0,
      lastErrorTime: null,
      totalRequests: 0,
      totalErrors: 0,
      is429Backoff: false,
      backoffUntil: 0,
    });
  }
  return hostStates.get(host)!;
}

// ─── Wait for Rate Limit Clearance ──────────────────────────────────

export async function waitForRateLimit(
  host: string = 'yahoo',
  config: RateLimitConfig = DEFAULT_CONFIG,
): Promise<void> {
  const state = getState(host);
  const now = Date.now();

  // Check if we're in a 429 backoff period
  if (state.is429Backoff && now < state.backoffUntil) {
    const waitMs = state.backoffUntil - now;
    console.log(`[RateLimiter] ${host}: In backoff, waiting ${Math.round(waitMs / 1000)}s...`);
    await new Promise(r => setTimeout(r, waitMs));
  }

  // Clean old timestamps (keep last hour)
  const oneHourAgo = now - 3600000;
  state.recentRequests = state.recentRequests.filter(t => t > oneHourAgo);

  // Check hourly limit
  if (state.recentRequests.length >= config.maxRequestsPerHour) {
    const oldestInHour = state.recentRequests[0];
    const waitMs = oldestInHour + 3600000 - now + 100;
    if (waitMs > 0) {
      console.warn(`[RateLimiter] ${host}: Hourly limit hit (${config.maxRequestsPerHour}). Waiting ${Math.round(waitMs / 1000)}s...`);
      await new Promise(r => setTimeout(r, Math.min(waitMs, 30000))); // Max wait 30s
    }
  }

  // Check per-minute limit
  const oneMinuteAgo = now - 60000;
  const recentMinute = state.recentRequests.filter(t => t > oneMinuteAgo);
  if (recentMinute.length >= config.maxRequestsPerMinute) {
    const oldestInMinute = recentMinute[0];
    const waitMs = oldestInMinute + 60000 - now + 50;
    if (waitMs > 0 && waitMs < 60000) {
      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  // Record this request
  state.recentRequests.push(Date.now());
  state.totalRequests++;
}

// ─── Report Success / Error ─────────────────────────────────────────

export function reportSuccess(host: string = 'yahoo'): void {
  const state = getState(host);
  state.consecutiveErrors = 0;
  state.is429Backoff = false;
}

export function reportError(host: string = 'yahoo', statusCode?: number): void {
  const state = getState(host);
  state.totalErrors++;
  state.consecutiveErrors++;
  state.lastErrorTime = Date.now();

  if (statusCode === 429) {
    state.is429Backoff = true;
    // Exponential backoff: 2s, 4s, 8s, 16s, 32s, max 60s
    const backoffMs = Math.min(
      DEFAULT_CONFIG.maxBackoffMs,
      DEFAULT_CONFIG.backoffBaseMs * Math.pow(2, state.consecutiveErrors - 1),
    );
    state.backoffUntil = Date.now() + backoffMs;
    console.warn(`[RateLimiter] ${host}: 429 detected. Backoff ${Math.round(backoffMs / 1000)}s (attempt ${state.consecutiveErrors})`);
  }
}

// ─── Error Budget Check ─────────────────────────────────────────────
// Returns true if the error rate is within acceptable bounds

export function isWithinErrorBudget(host: string = 'yahoo', maxErrorRate: number = 0.15): boolean {
  const state = getState(host);
  if (state.totalRequests < 10) return true; // Not enough data
  const errorRate = state.totalErrors / state.totalRequests;
  return errorRate <= maxErrorRate;
}

// ─── Get Rate Limit Stats (for monitoring) ──────────────────────────

export function getRateLimitStats(host: string = 'yahoo'): {
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  consecutiveErrors: number;
  isInBackoff: boolean;
  requestsLastMinute: number;
  requestsLastHour: number;
} {
  const state = getState(host);
  const now = Date.now();
  return {
    totalRequests: state.totalRequests,
    totalErrors: state.totalErrors,
    errorRate: state.totalRequests > 0 ? state.totalErrors / state.totalRequests : 0,
    consecutiveErrors: state.consecutiveErrors,
    isInBackoff: state.is429Backoff && now < state.backoffUntil,
    requestsLastMinute: state.recentRequests.filter(t => t > now - 60000).length,
    requestsLastHour: state.recentRequests.filter(t => t > now - 3600000).length,
  };
}

