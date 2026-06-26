// Machine Learning Prediction Model in Pure TypeScript
// Implements a Logistic Regression classifier with L2 (Ridge) Regularization,
// Z-score standardization, advanced engineered features, and Time-Series Walk-Forward validation.

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
    sentimentMomentum: number;
    rsi: number;
    macd: number;
    emaTrend: number;
    volume: number;
    pcr: number;
    delivery: number;
    priceMomentum: number;
  };
  metrics: {
    trainingAccuracy: number;
    validationAccuracy: number;
    totalSamples: number;
    epochsRun: number;
  };
}

// Sigmoid activation function
function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function trainAndPredict(history: MLPredictionInput[]): MLModelResult | null {
  // We need at least 15 historical points to construct training data, lag features, and labels
  if (history.length < 15) {
    return null;
  }

  // 1. Prepare Features & Labels
  // Features vector for each day: 
  // [Intercept (1), Sentiment, Sentiment_Momentum, RSI, MACD_Rel, EMA_Dev, Log_Volume, PCR_Dev, Delivery, Price_Momentum]
  const X: number[][] = [];
  const Y: number[] = [];

  // Start at index 1 because we need index i-1 for lag/momentum features
  // Loop up to length - 2 because day t features predict day t+1 direction.
  // The very last element (length - 1) is today, which has features but no label (what we predict!)
  for (let i = 1; i < history.length - 1; i++) {
    const current = history[i];
    const prev = history[i - 1];
    const next = history[i + 1];

    // Feature extraction (raw scales)
    const f_sentiment = (current.sentiment - 50) / 50;           // scale 0..100 to -1..1
    const f_sentimentMom = (current.sentiment - prev.sentiment) / 50; // 1D sentiment velocity
    const f_rsi = (current.rsi - 50) / 50;                       // scale 0..100 to -1..1
    const f_macd = current.close > 0 ? current.macdHist / current.close : 0;
    const f_emaDev = current.ema20 > 0 ? (current.close - current.ema20) / current.ema20 : 0;
    const f_volume = Math.log(Math.max(0.01, current.volumeRatio));
    const f_pcr = current.pcr - 1.0;
    const f_delivery = current.deliveryPercent / 100;
    const f_priceMom = prev.close > 0 ? (current.close - prev.close) / prev.close : 0; // 1D stock return

    X.push([
      1, // Intercept
      f_sentiment,
      f_sentimentMom,
      f_rsi,
      f_macd,
      f_emaDev,
      f_volume,
      f_pcr,
      f_delivery,
      f_priceMom
    ]);
    
    // Label: did price go up next day?
    Y.push(next.close > current.close ? 1 : 0);
  }

  const m = X.length; // Number of training + validation samples
  if (m < 5) return null;

  const n = X[0].length; // Number of features (10, including intercept)

  // 2. Chronological Train-Test Split (Walk-Forward Validation)
  // We split 70% training and 30% out-of-sample validation to prevent data leakage in time-series
  const trainSize = Math.floor(m * 0.7);
  const valSize = m - trainSize;

  if (trainSize === 0) return null;

  // Extract raw subsets
  const X_train = X.slice(0, trainSize);
  const Y_train = Y.slice(0, trainSize);
  const X_val = X.slice(trainSize);
  const Y_val = Y.slice(trainSize);

  // 3. Fit Z-score Standardization Scaler on training subset (features 1 to n-1)
  const means = new Array(n).fill(0);
  const stdDevs = new Array(n).fill(1);

  for (let j = 1; j < n; j++) {
    let sum = 0;
    for (let i = 0; i < trainSize; i++) {
      sum += X_train[i][j];
    }
    const mean = sum / trainSize;
    means[j] = mean;

    let varianceSum = 0;
    for (let i = 0; i < trainSize; i++) {
      varianceSum += Math.pow(X_train[i][j] - mean, 2);
    }
    const stdDev = Math.sqrt(varianceSum / trainSize);
    stdDevs[j] = stdDev > 0 ? stdDev : 1.0; // Avoid divide-by-zero
  }

  // Scale train features
  for (let i = 0; i < trainSize; i++) {
    for (let j = 1; j < n; j++) {
      X_train[i][j] = (X_train[i][j] - means[j]) / stdDevs[j];
    }
  }

  // Scale validation features (using training means/stdDevs to prevent look-ahead leakage)
  for (let i = 0; i < valSize; i++) {
    for (let j = 1; j < n; j++) {
      X_val[i][j] = (X_val[i][j] - means[j]) / stdDevs[j];
    }
  }

  // 4. Model Training via Gradient Descent with L2 (Ridge) Regularization
  let theta = new Array(n).fill(0); // weights initialization
  const alpha = 0.15;               // learning rate
  const lambda = 0.05;              // L2 regularization penalty
  const epochs = 400;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradients = new Array(n).fill(0);
    
    for (let i = 0; i < trainSize; i++) {
      const x_i = X_train[i];
      const y_i = Y_train[i];
      
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
    
    // Update weights with L2 Regularization (do not penalize intercept theta[0])
    theta[0] -= (alpha / trainSize) * gradients[0];
    for (let j = 1; j < n; j++) {
      theta[j] -= (alpha / trainSize) * (gradients[j] + lambda * theta[j]);
    }
  }

  // 5. Evaluate training accuracy
  let correctTrain = 0;
  for (let i = 0; i < trainSize; i++) {
    const x_i = X_train[i];
    const y_i = Y_train[i];
    let z = 0;
    for (let j = 0; j < n; j++) {
      z += theta[j] * x_i[j];
    }
    const pred = sigmoid(z) >= 0.5 ? 1 : 0;
    if (pred === y_i) correctTrain++;
  }
  const trainingAccuracy = trainSize > 0 ? (correctTrain / trainSize) * 100 : 0;

  // 6. Evaluate out-of-sample validation accuracy
  let correctVal = 0;
  for (let i = 0; i < valSize; i++) {
    const x_i = X_val[i];
    const y_i = Y_val[i];
    let z = 0;
    for (let j = 0; j < n; j++) {
      z += theta[j] * x_i[j];
    }
    const pred = sigmoid(z) >= 0.5 ? 1 : 0;
    if (pred === y_i) correctVal++;
  }
  // Default to training accuracy if validation set is empty (safety fallback)
  const validationAccuracy = valSize > 0 ? (correctVal / valSize) * 100 : trainingAccuracy;

  // 7. Predict Next Day
  // Use today's features (last item in history) to forecast tomorrow
  const latest = history[history.length - 1];
  const prevLatest = history[history.length - 2];

  const f_sentiment = (latest.sentiment - 50) / 50;
  const f_sentimentMom = (latest.sentiment - prevLatest.sentiment) / 50;
  const f_rsi = (latest.rsi - 50) / 50;
  const f_macd = latest.close > 0 ? latest.macdHist / latest.close : 0;
  const f_emaDev = latest.ema20 > 0 ? (latest.close - latest.ema20) / latest.ema20 : 0;
  const f_volume = Math.log(Math.max(0.01, latest.volumeRatio));
  const f_pcr = latest.pcr - 1.0;
  const f_delivery = latest.deliveryPercent / 100;
  const f_priceMom = prevLatest.close > 0 ? (latest.close - prevLatest.close) / prevLatest.close : 0;

  const rawLatestFeatures = [
    1,
    f_sentiment,
    f_sentimentMom,
    f_rsi,
    f_macd,
    f_emaDev,
    f_volume,
    f_pcr,
    f_delivery,
    f_priceMom
  ];

  // Standardize using training scales
  const standardizedLatest = [...rawLatestFeatures];
  for (let j = 1; j < n; j++) {
    standardizedLatest[j] = (standardizedLatest[j] - means[j]) / stdDevs[j];
  }

  let z_latest = 0;
  for (let j = 0; j < n; j++) {
    z_latest += theta[j] * standardizedLatest[j];
  }
  
  const prob = sigmoid(z_latest);
  const predictedDirection = prob >= 0.5 ? 'up' : 'down';
  const probPercent = Math.round((predictedDirection === 'up' ? prob : 1 - prob) * 100);

  // 8. Compute Feature Importance (based on normalized absolute standardized coefficients)
  // Standardizing ensures coefficients are on the same scale, so their magnitudes directly show importance!
  const absW = theta.slice(1).map(w => Math.abs(w)); // omit intercept
  const sumAbsW = absW.reduce((sum, w) => sum + w, 0) || 1.0;

  const featureImportance = {
    sentiment: Math.round((absW[0] / sumAbsW) * 100),
    sentimentMomentum: Math.round((absW[1] / sumAbsW) * 100),
    rsi: Math.round((absW[2] / sumAbsW) * 100),
    macd: Math.round((absW[3] / sumAbsW) * 100),
    emaTrend: Math.round((absW[4] / sumAbsW) * 100),
    volume: Math.round((absW[5] / sumAbsW) * 100),
    pcr: Math.round((absW[6] / sumAbsW) * 100),
    delivery: Math.round((absW[7] / sumAbsW) * 100),
    priceMomentum: Math.round((absW[8] / sumAbsW) * 100),
  };

  // Adjust sum to exactly 100 if rounding caused off-by-one issues
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
      validationAccuracy: parseFloat(validationAccuracy.toFixed(1)),
      totalSamples: m,
      epochsRun: epochs,
    }
  };
}

