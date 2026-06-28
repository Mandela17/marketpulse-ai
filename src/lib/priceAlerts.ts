// Price Alert System
// Web Push Notifications for ML prediction changes and price thresholds
// Uses browser Notification API — no external service required

export interface PriceAlert {
  id: string;
  symbol: string;
  type: 'prediction_change' | 'confidence_threshold' | 'price_target';
  condition: {
    direction?: 'up' | 'down';    // For prediction_change
    minConfidence?: number;        // For confidence_threshold (e.g. 75)
    targetPrice?: number;          // For price_target
    operator?: 'above' | 'below'; // For price_target
  };
  createdAt: string;
  triggered: boolean;
  triggeredAt?: string;
}

const ALERTS_KEY = 'marketpulse_price_alerts';

// ─── Storage ─────────────────────────────────────────
export function getAlerts(): PriceAlert[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(ALERTS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function saveAlerts(alerts: PriceAlert[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
}

export function addAlert(alert: Omit<PriceAlert, 'id' | 'createdAt' | 'triggered'>): PriceAlert {
  const alerts = getAlerts();
  const newAlert: PriceAlert = {
    ...alert,
    id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    triggered: false,
  };
  alerts.push(newAlert);
  saveAlerts(alerts);
  return newAlert;
}

export function removeAlert(id: string): void {
  const alerts = getAlerts().filter(a => a.id !== id);
  saveAlerts(alerts);
}

export function clearTriggeredAlerts(): void {
  const alerts = getAlerts().filter(a => !a.triggered);
  saveAlerts(alerts);
}

// ─── Notification Permission ──────────────────────────
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') return 'granted';
  return await Notification.requestPermission();
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  return Notification.permission;
}

// ─── Fire a Notification ──────────────────────────────
export function fireNotification(title: string, body: string, icon?: string): void {
  if (typeof window === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  const notif = new Notification(title, {
    body,
    icon: icon || '/favicon.ico',
    badge: '/favicon.ico',
    tag: `marketpulse-${Date.now()}`,
    requireInteraction: false,
  });

  // Auto-close after 8 seconds
  setTimeout(() => notif.close(), 8000);
}

// ─── Check Alerts Against Current Prediction ─────────
export function checkPredictionAlerts(
  symbol: string,
  prediction: { direction: 'up' | 'down'; confidence: number }
): void {
  const alerts = getAlerts();
  let changed = false;

  for (const alert of alerts) {
    if (alert.triggered) continue;
    if (alert.symbol !== symbol) continue;

    let shouldFire = false;
    let message = '';

    if (alert.type === 'prediction_change') {
      if (!alert.condition.direction || alert.condition.direction === prediction.direction) {
        shouldFire = true;
        message = `${symbol} is now predicted to go ${prediction.direction.toUpperCase()} with ${prediction.confidence}% confidence`;
      }
    } else if (alert.type === 'confidence_threshold') {
      const minConf = alert.condition.minConfidence ?? 70;
      if (prediction.confidence >= minConf) {
        shouldFire = true;
        message = `${symbol} hit ${prediction.confidence}% confidence — ${prediction.direction.toUpperCase()} signal`;
      }
    }

    if (shouldFire) {
      fireNotification(
        `🔔 MarketPulse Alert: ${symbol}`,
        message
      );
      alert.triggered = true;
      alert.triggeredAt = new Date().toISOString();
      changed = true;
    }
  }

  if (changed) saveAlerts(alerts);
}

// ─── Check Price Alerts Against Live Quote ────────────
export function checkPriceAlerts(
  symbol: string,
  currentPrice: number
): void {
  const alerts = getAlerts();
  let changed = false;

  for (const alert of alerts) {
    if (alert.triggered) continue;
    if (alert.symbol !== symbol) continue;
    if (alert.type !== 'price_target') continue;

    const { targetPrice, operator } = alert.condition;
    if (!targetPrice || !operator) continue;

    const shouldFire =
      (operator === 'above' && currentPrice >= targetPrice) ||
      (operator === 'below' && currentPrice <= targetPrice);

    if (shouldFire) {
      fireNotification(
        `💰 Price Alert: ${symbol}`,
        `${symbol} is now ₹${currentPrice.toLocaleString('en-IN')} (${operator} target of ₹${targetPrice.toLocaleString('en-IN')})`
      );
      alert.triggered = true;
      alert.triggeredAt = new Date().toISOString();
      changed = true;
    }
  }

  if (changed) saveAlerts(alerts);
}
