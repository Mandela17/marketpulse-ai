// Pure TypeScript Gradient Boosted Decision Tree (GBDT) Classifier
// Replaces LogReg + Decision Stump ensemble for production ML predictions.
// Features: configurable depth/trees/learning rate, early stopping, feature importance, subsample.

// ─── Types ──────────────────────────────────────────────────────────

interface TreeNode {
  featureIndex: number;
  threshold: number;
  left: TreeNode | number;   // child node or leaf value
  right: TreeNode | number;
  gain: number;              // split gain for feature importance
}

interface GBDTConfig {
  numTrees: number;          // default 50
  maxDepth: number;          // default 4
  learningRate: number;      // default 0.1
  subsampleRatio: number;    // default 0.8
  minSamplesLeaf: number;    // default 3
  l2Regularization: number;  // default 1.0
  earlyStoppingRounds: number; // default 5
}

export interface GBDTModel {
  trees: TreeNode[];
  intercept: number;
  config: GBDTConfig;
  featureImportance: number[];
  trainingMetrics: {
    trainingAccuracy: number;
    validationAccuracy: number;
    bestIteration: number;
    totalSamples: number;
  };
}

const DEFAULT_CONFIG: GBDTConfig = {
  numTrees: 50,
  maxDepth: 4,
  learningRate: 0.1,
  subsampleRatio: 0.8,
  minSamplesLeaf: 3,
  l2Regularization: 1.0,
  earlyStoppingRounds: 5,
};

// ─── Sigmoid ─────────────────────────────────────────────────────────

function sigmoid(z: number): number {
  if (z > 500) return 1;
  if (z < -500) return 0;
  return 1 / (1 + Math.exp(-z));
}

// ─── Log Loss Gradient & Hessian ────────────────────────────────────

function computeGradientsHessians(
  predictions: number[],
  labels: number[]
): { gradients: number[]; hessians: number[] } {
  const m = predictions.length;
  const gradients = new Array(m);
  const hessians = new Array(m);

  for (let i = 0; i < m; i++) {
    const pred = sigmoid(predictions[i]);
    gradients[i] = pred - labels[i];           // First derivative of log-loss
    hessians[i] = pred * (1 - pred);           // Second derivative (always positive)
    // Clamp hessian to avoid numerical instability
    if (hessians[i] < 1e-6) hessians[i] = 1e-6;
  }

  return { gradients, hessians };
}

// ─── Build a Single Regression Tree ─────────────────────────────────

function buildTree(
  X: number[][],
  gradients: number[],
  hessians: number[],
  indices: number[],
  depth: number,
  config: GBDTConfig,
  featureGains: number[]
): TreeNode | number {
  // Leaf condition: max depth or insufficient samples
  if (depth >= config.maxDepth || indices.length < config.minSamplesLeaf * 2) {
    return computeLeafValue(gradients, hessians, indices, config.l2Regularization);
  }

  // Find best split
  const bestSplit = findBestSplit(X, gradients, hessians, indices, config, featureGains);

  if (!bestSplit || bestSplit.gain <= 0) {
    return computeLeafValue(gradients, hessians, indices, config.l2Regularization);
  }

  // Split indices
  const leftIndices: number[] = [];
  const rightIndices: number[] = [];
  for (const idx of indices) {
    if (X[idx][bestSplit.featureIndex] <= bestSplit.threshold) {
      leftIndices.push(idx);
    } else {
      rightIndices.push(idx);
    }
  }

  // Don't create splits with too few samples on either side
  if (leftIndices.length < config.minSamplesLeaf || rightIndices.length < config.minSamplesLeaf) {
    return computeLeafValue(gradients, hessians, indices, config.l2Regularization);
  }

  return {
    featureIndex: bestSplit.featureIndex,
    threshold: bestSplit.threshold,
    gain: bestSplit.gain,
    left: buildTree(X, gradients, hessians, leftIndices, depth + 1, config, featureGains),
    right: buildTree(X, gradients, hessians, rightIndices, depth + 1, config, featureGains),
  };
}

// ─── Compute Leaf Value (Newton's Method) ───────────────────────────

function computeLeafValue(
  gradients: number[],
  hessians: number[],
  indices: number[],
  lambda: number
): number {
  let sumGrad = 0;
  let sumHess = 0;
  for (const idx of indices) {
    sumGrad += gradients[idx];
    sumHess += hessians[idx];
  }
  // Optimal leaf value: -G / (H + λ)
  return -sumGrad / (sumHess + lambda);
}

// ─── Find Best Split ────────────────────────────────────────────────

interface SplitCandidate {
  featureIndex: number;
  threshold: number;
  gain: number;
}

function findBestSplit(
  X: number[][],
  gradients: number[],
  hessians: number[],
  indices: number[],
  config: GBDTConfig,
  featureGains: number[]
): SplitCandidate | null {
  const numFeatures = X[0].length;
  let bestSplit: SplitCandidate | null = null;
  let bestGain = 0;
  const lambda = config.l2Regularization;

  // Parent node statistics
  let parentGradSum = 0;
  let parentHessSum = 0;
  for (const idx of indices) {
    parentGradSum += gradients[idx];
    parentHessSum += hessians[idx];
  }

  for (let f = 0; f < numFeatures; f++) {
    // Sort indices by feature value for efficient split search
    const sorted = [...indices].sort((a, b) => X[a][f] - X[b][f]);

    let leftGradSum = 0;
    let leftHessSum = 0;

    for (let i = 0; i < sorted.length - 1; i++) {
      const idx = sorted[i];
      leftGradSum += gradients[idx];
      leftHessSum += hessians[idx];

      const rightGradSum = parentGradSum - leftGradSum;
      const rightHessSum = parentHessSum - leftHessSum;

      // Skip if either side would be too small
      if (i + 1 < config.minSamplesLeaf || sorted.length - i - 1 < config.minSamplesLeaf) continue;

      // Skip if feature values are identical (no split possible)
      if (X[sorted[i]][f] === X[sorted[i + 1]][f]) continue;

      // Compute gain: G_L²/(H_L+λ) + G_R²/(H_R+λ) - G_P²/(H_P+λ)
      const gain =
        (leftGradSum * leftGradSum) / (leftHessSum + lambda) +
        (rightGradSum * rightGradSum) / (rightHessSum + lambda) -
        (parentGradSum * parentGradSum) / (parentHessSum + lambda);

      if (gain > bestGain) {
        bestGain = gain;
        bestSplit = {
          featureIndex: f,
          threshold: (X[sorted[i]][f] + X[sorted[i + 1]][f]) / 2,
          gain,
        };
      }
    }
  }

  // Track feature importance
  if (bestSplit) {
    featureGains[bestSplit.featureIndex] += bestSplit.gain;
  }

  return bestSplit;
}

// ─── Predict with a Single Tree ─────────────────────────────────────

function predictTree(node: TreeNode | number, features: number[]): number {
  if (typeof node === 'number') return node;

  if (features[node.featureIndex] <= node.threshold) {
    return predictTree(node.left, features);
  } else {
    return predictTree(node.right, features);
  }
}

// ─── Subsample Indices ──────────────────────────────────────────────

function subsampleIndices(m: number, ratio: number): number[] {
  if (ratio >= 1.0) return Array.from({ length: m }, (_, i) => i);

  const n = Math.max(1, Math.floor(m * ratio));
  const indices: number[] = [];
  const used = new Set<number>();

  while (indices.length < n) {
    const idx = Math.floor(Math.random() * m);
    if (!used.has(idx)) {
      used.add(idx);
      indices.push(idx);
    }
  }

  return indices;
}

// ─── Log Loss ───────────────────────────────────────────────────────

function computeLogLoss(predictions: number[], labels: number[]): number {
  let loss = 0;
  for (let i = 0; i < predictions.length; i++) {
    const p = Math.max(1e-7, Math.min(1 - 1e-7, sigmoid(predictions[i])));
    loss -= labels[i] * Math.log(p) + (1 - labels[i]) * Math.log(1 - p);
  }
  return loss / predictions.length;
}

// ─── Compute Accuracy ───────────────────────────────────────────────

function computeAccuracy(predictions: number[], labels: number[]): number {
  let correct = 0;
  for (let i = 0; i < predictions.length; i++) {
    const predicted = sigmoid(predictions[i]) >= 0.5 ? 1 : 0;
    if (predicted === labels[i]) correct++;
  }
  return predictions.length > 0 ? (correct / predictions.length) * 100 : 50;
}

// ─── Main GBDT Training Function ────────────────────────────────────

export function trainGBDT(
  X_train: number[][],
  Y_train: number[],
  X_val: number[][],
  Y_val: number[],
  partialConfig?: Partial<GBDTConfig>
): GBDTModel {
  const config: GBDTConfig = { ...DEFAULT_CONFIG, ...partialConfig };
  const m = X_train.length;
  const numFeatures = X_train[0].length;

  // Initialize predictions with log-odds of positive class
  const posCount = Y_train.filter(y => y === 1).length;
  const negCount = m - posCount;
  const intercept = Math.log((posCount + 1) / (negCount + 1)); // Laplace smoothing

  const trainPredictions = new Array(m).fill(intercept);
  const valPredictions = new Array(X_val.length).fill(intercept);

  const trees: TreeNode[] = [];
  const featureGains = new Array(numFeatures).fill(0);

  let bestValLoss = Infinity;
  let bestIteration = 0;
  let roundsWithoutImprovement = 0;

  for (let t = 0; t < config.numTrees; t++) {
    // Compute gradients and hessians
    const { gradients, hessians } = computeGradientsHessians(trainPredictions, Y_train);

    // Subsample
    const sampleIndices = subsampleIndices(m, config.subsampleRatio);

    // Build tree on negative gradients
    const tree = buildTree(X_train, gradients, hessians, sampleIndices, 0, config, featureGains);

    // If tree is just a leaf number (no good splits found), create a minimal node
    if (typeof tree === 'number') {
      // Update predictions with leaf value
      for (let i = 0; i < m; i++) {
        trainPredictions[i] += config.learningRate * tree;
      }
      for (let i = 0; i < X_val.length; i++) {
        valPredictions[i] += config.learningRate * tree;
      }
      continue;
    }

    trees.push(tree);

    // Update training predictions
    for (let i = 0; i < m; i++) {
      trainPredictions[i] += config.learningRate * predictTree(tree, X_train[i]);
    }

    // Update validation predictions
    for (let i = 0; i < X_val.length; i++) {
      valPredictions[i] += config.learningRate * predictTree(tree, X_val[i]);
    }

    // Early stopping check
    if (X_val.length > 0) {
      const valLoss = computeLogLoss(valPredictions, Y_val);
      if (valLoss < bestValLoss - 1e-4) {
        bestValLoss = valLoss;
        bestIteration = t + 1;
        roundsWithoutImprovement = 0;
      } else {
        roundsWithoutImprovement++;
      }

      if (roundsWithoutImprovement >= config.earlyStoppingRounds) {
        // Prune trees beyond best iteration
        trees.splice(bestIteration);
        break;
      }
    }
  }

  // Normalize feature importance
  const totalGain = featureGains.reduce((s, g) => s + g, 0) || 1;
  const featureImportance = featureGains.map(g => Math.round((g / totalGain) * 100));

  // Compute final accuracies
  // Recompute predictions with the final tree set
  const finalTrainPreds = new Array(m).fill(intercept);
  const finalValPreds = new Array(X_val.length).fill(intercept);
  for (const tree of trees) {
    for (let i = 0; i < m; i++) {
      finalTrainPreds[i] += config.learningRate * predictTree(tree, X_train[i]);
    }
    for (let i = 0; i < X_val.length; i++) {
      finalValPreds[i] += config.learningRate * predictTree(tree, X_val[i]);
    }
  }

  return {
    trees,
    intercept,
    config,
    featureImportance,
    trainingMetrics: {
      trainingAccuracy: parseFloat(computeAccuracy(finalTrainPreds, Y_train).toFixed(1)),
      validationAccuracy: parseFloat(computeAccuracy(finalValPreds, Y_val).toFixed(1)),
      bestIteration: bestIteration || trees.length,
      totalSamples: m,
    },
  };
}

// ─── Predict Probability with Trained GBDT ──────────────────────────

export function predictGBDT(model: GBDTModel, features: number[]): number {
  let score = model.intercept;

  for (const tree of model.trees) {
    score += model.config.learningRate * predictTree(tree, features);
  }

  return sigmoid(score);
}
