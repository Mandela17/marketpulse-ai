// Machine Learning Prediction Model in Pure TypeScript
// Implements a Logistic Regression classifier trained via Gradient Descent

export interface MLPredictionInput {
  date: string;
  close: number;
  rsi: number;
  macdHist: number;
  ema20: number;
  volumeRatio: number;
  sentiment: number; // 0 - 100
  pcr: number;
  deliveryPercent: number; // 0 - 100
}

export interface MLModelResult {
  predictedDirection: 'up' | 'down';
  probability: number; // 0 - 100
  featureImportance: {
    sentiment: number;
    rsi: number;
    macd: number;
    emaTrend: number;
    volume: number;
    pcr: number;
    delivery: number;
  };
  metrics: {
    trainingAccuracy: number;
    totalSamples: number;
    epochsRun: number;
  };
}

// Sigmoid activation function
function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function trainAndPredict(history: MLPredictionInput[]): MLModelResult | null {
  // We need at least 15 historical points to construct training data and have a labels list
  if (history.length < 15) {
    return null;
  }

  // 1. Prepare Features & Labels
  // Features vector for each day: [Intercept (1), Sentiment, RSI, MACD, EMA_Dev, Volume_Ratio, PCR, Delivery_Percent]
  const X: number[][] = [];
  const Y: number[] = [];

  // We loop up to length - 2 because day t features predict day t+1 direction.
  // The last element (length - 1) is the current day, which has features but no label yet (that is what we predict!)
  for (let i = 0; i < history.length - 1; i++) {
    const current = history[i];
    const next = history[i + 1];

    // Feature normalization/scaling
    const f1_sentiment = (current.sentiment - 50) / 50;           // scale 0..100 to -1..1
    const f2_rsi = (current.rsi - 50) / 50;                       // scale 0..100 to -1..1
    const f3_macd = current.close > 0 ? current.macdHist / current.close : 0; // relative to price
    const f4_emaDev = current.ema20 > 0 ? (current.close - current.ema20) / current.ema20 : 0; // deviation percentage
    const f5_volume = Math.log(Math.max(0.01, current.volumeRatio)); // compress ratio log-scale
    const f6_pcr = current.pcr - 1.0;                             // normalize around 1.0
    const f7_delivery = current.deliveryPercent / 100;           // scale 0..100 to 0..1

    X.push([1, f1_sentiment, f2_rsi, f3_macd, f4_emaDev, f5_volume, f6_pcr, f7_delivery]);
    Y.push(next.close > current.close ? 1 : 0); // target label: price went up
  }

  const m = X.length; // Number of training samples
  if (m === 0) return null;

  const n = X[0].length; // Number of features (8, including intercept)
  let theta = new Array(n).fill(0); // weights initialization

  // 2. Training via Gradient Descent
  const alpha = 0.15; // learning rate
  const epochs = 300;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradients = new Array(n).fill(0);
    
    for (let i = 0; i < m; i++) {
      const x_i = X[i];
      const y_i = Y[i];
      
      // Calculate dot product theta^T * x
      let z = 0;
      for (let j = 0; j < n; j++) {
        z += theta[j] * x_i[j];
      }
      
      const prediction = sigmoid(z);
      const error = prediction - y_i;
      
      for (let j = 0; j < n; j++) {
        gradients[j] += error * x_i[j];
      }
    }
    
    // Update weights
    for (let j = 0; j < n; j++) {
      theta[j] -= (alpha / m) * gradients[j];
    }
  }

  // 3. Calculate Training Accuracy
  let correctPredictions = 0;
  for (let i = 0; i < m; i++) {
    const x_i = X[i];
    const y_i = Y[i];
    let z = 0;
    for (let j = 0; j < n; j++) {
      z += theta[j] * x_i[j];
    }
    const pred = sigmoid(z) >= 0.5 ? 1 : 0;
    if (pred === y_i) {
      correctPredictions++;
    }
  }
  const trainingAccuracy = m > 0 ? (correctPredictions / m) * 100 : 0;

  // 4. Predict Next Day
  // Use current day features (last item in history) to predict next day
  const latest = history[history.length - 1];
  const f1_sentiment = (latest.sentiment - 50) / 50;
  const f2_rsi = (latest.rsi - 50) / 50;
  const f3_macd = latest.close > 0 ? latest.macdHist / latest.close : 0;
  const f4_emaDev = latest.ema20 > 0 ? (latest.close - latest.ema20) / latest.ema20 : 0;
  const f5_volume = Math.log(Math.max(0.01, latest.volumeRatio));
  const f6_pcr = latest.pcr - 1.0;
  const f7_delivery = latest.deliveryPercent / 100;

  const latestFeatures = [1, f1_sentiment, f2_rsi, f3_macd, f4_emaDev, f5_volume, f6_pcr, f7_delivery];
  let z_latest = 0;
  for (let j = 0; j < n; j++) {
    z_latest += theta[j] * latestFeatures[j];
  }
  
  const prob = sigmoid(z_latest);
  const predictedDirection = prob >= 0.5 ? 'up' : 'down';
  const probPercent = Math.round((predictedDirection === 'up' ? prob : 1 - prob) * 100);

  // 5. Compute Feature Importance (based on normalized absolute weights)
  // Indices: 1: Sentiment, 2: RSI, 3: MACD, 4: EMA Dev, 5: Volume, 6: PCR, 7: Delivery
  const absW1 = Math.abs(theta[1]);
  const absW2 = Math.abs(theta[2]);
  const absW3 = Math.abs(theta[3]);
  const absW4 = Math.abs(theta[4]);
  const absW5 = Math.abs(theta[5]);
  const absW6 = Math.abs(theta[6]);
  const absW7 = Math.abs(theta[7]);
  const sumAbsW = absW1 + absW2 + absW3 + absW4 + absW5 + absW6 + absW7 || 1;

  const featureImportance = {
    sentiment: Math.round((absW1 / sumAbsW) * 100),
    rsi: Math.round((absW2 / sumAbsW) * 100),
    macd: Math.round((absW3 / sumAbsW) * 100),
    emaTrend: Math.round((absW4 / sumAbsW) * 100),
    volume: Math.round((absW5 / sumAbsW) * 100),
    pcr: Math.round((absW6 / sumAbsW) * 100),
    delivery: Math.round((absW7 / sumAbsW) * 100),
  };

  // Adjust sum to exactly 100 if rounding caused issues
  const currentSum = Object.values(featureImportance).reduce((s, v) => s + v, 0);
  if (currentSum !== 100) {
    featureImportance.sentiment += (100 - currentSum);
  }

  return {
    predictedDirection,
    probability: probPercent,
    featureImportance,
    metrics: {
      trainingAccuracy: parseFloat(trainingAccuracy.toFixed(1)),
      totalSamples: m,
      epochsRun: epochs,
    }
  };
}
