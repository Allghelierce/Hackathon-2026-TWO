import type { PermitRecord } from './permits';

export interface TrainedModel {
  weights: number[];
  bias: number;
  featureNames: string[];
  countyEncoding: Map<string, number>;
  typeEncoding: Map<string, number>;
  propertyTypeEncoding: Map<string, number>;
  subtypeEncoding: Map<string, number>;
  jurisdictionEncoding: Map<string, number>;
  featureMeans: number[];
  featureStds: number[];
  r2: number;
  rmse: number;
  trainingSamples: number;
  globalMean: number;
}

export interface PredictionInput {
  county: string;
  type: string;
  propertyType: string;
  jobValue: number | null;
  fees: number | null;
  jurisdiction?: string;
}

export interface PredictionResult {
  predictedDays: number;
  lowerBound: number;
  upperBound: number;
}

function buildEncoding(records: PermitRecord[], key: (r: PermitRecord) => string): Map<string, number> {
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const r of records) {
    const k = key(r);
    sums.set(k, (sums.get(k) ?? 0) + (r.totalDuration as number));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const enc = new Map<string, number>();
  for (const [k, sum] of sums) {
    enc.set(k, sum / (counts.get(k) ?? 1));
  }
  return enc;
}

function zNorm(X: number[][]): { means: number[]; stds: number[]; Xn: number[][] } {
  const p = X[0].length;
  const n = X.length;
  const means = Array.from({ length: p }, (_, j) => X.reduce((s, row) => s + row[j], 0) / n);
  const stds = Array.from({ length: p }, (_, j) => {
    const variance = X.reduce((s, row) => s + (row[j] - means[j]) ** 2, 0) / n;
    return Math.sqrt(variance) > 1e-8 ? Math.sqrt(variance) : 1;
  });
  return {
    means,
    stds,
    Xn: X.map(row => row.map((v, j) => (v - means[j]) / stds[j])),
  };
}

function applyNorm(X: number[][], means: number[], stds: number[]): number[][] {
  return X.map(row => row.map((v, j) => (v - means[j]) / stds[j]));
}

function dot(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

function gradientDescent(
  X: number[][],
  y: number[],
  lambda = 0.001,
  lr = 0.08,
  epochs = 3000,
): { weights: number[]; bias: number } {
  const n = X.length;
  const p = X[0].length;
  let w = new Array(p).fill(0);
  let b = 0;
  for (let e = 0; e < epochs; e++) {
    const errs = X.map((row, i) => dot(row, w) + b - y[i]);
    const dw = w.map((wj, j) => errs.reduce((s, err, i) => s + err * X[i][j], 0) / n + lambda * wj);
    const db = errs.reduce((s, err) => s + err, 0) / n;
    w = w.map((wj, j) => wj - lr * dw[j]);
    b -= lr * db;
  }
  return { weights: w, bias: b };
}

function r2Score(yTrue: number[], yPred: number[]): number {
  const mean = yTrue.reduce((s, v) => s + v, 0) / yTrue.length;
  const ssTot = yTrue.reduce((s, v) => s + (v - mean) ** 2, 0);
  const ssRes = yTrue.reduce((s, v, i) => s + (v - yPred[i]) ** 2, 0);
  return ssTot < 1e-8 ? 1 : Math.max(0, 1 - ssRes / ssTot);
}

function rmseScore(yTrue: number[], yPred: number[]): number {
  return Math.sqrt(yTrue.reduce((s, v, i) => s + (v - yPred[i]) ** 2, 0) / yTrue.length);
}

export function trainModel(records: PermitRecord[]): TrainedModel | null {
  const valid = records.filter(
    r =>
      r.totalDuration !== null &&
      Number.isFinite(r.totalDuration as number) &&
      (r.totalDuration as number) > 0,
  );
  if (valid.length < 20) return null;

  const trainSet = valid.filter((_, i) => i % 5 !== 0);
  const testSet = valid.filter((_, i) => i % 5 === 0);

  const globalMean = trainSet.reduce((s, r) => s + (r.totalDuration as number), 0) / trainSet.length;

  const countyEncoding = buildEncoding(trainSet, r => r.county);
  const typeEncoding = buildEncoding(trainSet, r => r.type);
  const propertyTypeEncoding = buildEncoding(trainSet, r => r.propertyType);
  const subtypeEncoding = buildEncoding(trainSet, r => r.subtype);
  const jurisdictionEncoding = buildEncoding(trainSet, r => r.jurisdiction);

  const encode = (r: PermitRecord): number[] => [
    countyEncoding.get(r.county) ?? globalMean,
    typeEncoding.get(r.type) ?? globalMean,
    propertyTypeEncoding.get(r.propertyType) ?? globalMean,
    (r.jobValue ?? 0) / 1000,
    r.fees ?? 0,
    subtypeEncoding.get(r.subtype) ?? globalMean,
    r.issueDate ? r.issueDate.getMonth() + 1 : 6,
    jurisdictionEncoding.get(r.jurisdiction) ?? globalMean,
  ];

  const Xtrain = trainSet.map(encode);
  const ytrain = trainSet.map(r => r.totalDuration as number);
  const { means: featureMeans, stds: featureStds, Xn: XtrainNorm } = zNorm(Xtrain);
  const { weights, bias } = gradientDescent(XtrainNorm, ytrain);

  const Xtest = applyNorm(testSet.map(encode), featureMeans, featureStds);
  const ytest = testSet.map(r => r.totalDuration as number);
  const yPred = Xtest.map(row => dot(row, weights) + bias);

  return {
    weights,
    bias,
    featureNames: [
      'County avg duration',
      'Permit type avg',
      'Property type avg',
      'Job value ($K)',
      'Permit fees ($)',
      'Subtype avg duration',
      'Issue month',
      'Jurisdiction avg',
    ],
    countyEncoding,
    typeEncoding,
    propertyTypeEncoding,
    subtypeEncoding,
    jurisdictionEncoding,
    featureMeans,
    featureStds,
    r2: r2Score(ytest, yPred),
    rmse: rmseScore(ytest, yPred),
    trainingSamples: trainSet.length,
    globalMean,
  };
}

export function predict(model: TrainedModel, input: PredictionInput): PredictionResult {
  const currentMonth = new Date().getMonth() + 1;
  const raw = [
    model.countyEncoding.get(input.county) ?? model.globalMean,
    model.typeEncoding.get(input.type) ?? model.globalMean,
    model.propertyTypeEncoding.get(input.propertyType) ?? model.globalMean,
    (input.jobValue ?? 0) / 1000,
    input.fees ?? 0,
    model.globalMean,
    currentMonth,
    input.jurisdiction ? (model.jurisdictionEncoding.get(input.jurisdiction) ?? model.globalMean) : model.globalMean,
  ];
  const norm = raw.map((v, i) => (v - model.featureMeans[i]) / model.featureStds[i]);
  const pred = Math.max(1, dot(norm, model.weights) + model.bias);
  return {
    predictedDays: Math.round(pred),
    lowerBound: Math.round(Math.max(1, pred - model.rmse)),
    upperBound: Math.round(pred + model.rmse),
  };
}

export function featureImportances(model: TrainedModel): Array<{ name: string; pct: number }> {
  const abs = model.weights.map(Math.abs);
  const total = abs.reduce((s, v) => s + v, 0) || 1;
  return model.featureNames
    .map((name, i) => ({ name, pct: abs[i] / total }))
    .sort((a, b) => b.pct - a.pct);
}
