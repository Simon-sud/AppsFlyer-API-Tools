export type AppEstimatorPipelineStep = {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  verifiedBy?: string;
};

export type AppEstimatorPipelineStatus = {
  enabled: boolean;
  runDate: string;
  timezone: string;
  overall: 'pending' | 'running' | 'completed' | 'failed' | string;
  running: boolean;
  startedAt?: string;
  finishedAt?: string;
  lastError?: string;
  lastTickAt?: string;
  skillRoot?: string;
  steps: AppEstimatorPipelineStep[];
  nextStep?: string;
};

export type AppEstimatorOverview = {
  success: boolean;
  dbPath?: string;
  dbSizeBytes?: number;
  loadedAt?: string;
  distinctApps?: number;
  counts?: Record<string, number>;
  ranges?: Record<string, { min?: string; max?: string }>;
  platforms?: string[];
  countries?: string[];
  sourceQualities?: string[];
  pipeline?: AppEstimatorPipelineStatus;
  error?: string;
};

export type PaginatedResponse<T> = {
  success: boolean;
  total: number;
  page: number;
  pageSize: number;
  items: T[];
  error?: string;
};

export type SnapshotItem = {
  platform: string;
  appId: string;
  appName?: string;
  package: string;
  bundle: string;
  country: string;
  ratingCount: number;
  avgRating: number;
  snapshotDate: string;
  sourceUrl: string;
  sourceQuality: string;
  collectedAt: string;
  iconUrl?: string;
  storeUrl?: string;
};

export type SnapshotHistoryItem = {
  snapshotDate: string;
  ratingCount: number;
  avgRating: number;
  sourceQuality: string;
  collectedAt: string;
};

export type VelocityItem = {
  platform: string;
  appId: string;
  appName?: string;
  package: string;
  bundle: string;
  country: string;
  asOfDate: string;
  previousDate: string;
  currentRatingCount: number;
  previousRatingCount: number;
  deltaRatings: number;
  snapshotDays: number;
  ratingVelocityDaily: number;
  confidence: string;
  confidenceScore: number;
  calcMethod: string;
  createdAt: string;
  iconUrl?: string;
  storeUrl?: string;
};

export type BenchmarkItem = {
  country: string;
  appId: string;
  appName: string;
  bundle: string;
  package: string;
  platform: string;
  category: string;
  categoryName: string;
  downloads: number;
  reportStart: string;
  reportEnd: string;
  sourceFile: string;
  importedAt: string;
  iconUrl?: string;
  storeUrl?: string;
};

export type EstimateItem = {
  estimateDate: string;
  platform: string;
  appId: string;
  appName?: string;
  package: string;
  bundle: string;
  country: string;
  category: string;
  rank: number;
  totalRatings: number;
  deltaRatings: number;
  ratingVelocityDaily: number;
  kBase: number;
  maturityBeta: number;
  regionalM: number;
  estMonthlyDownloads: number;
  estDailyDownloads: number;
  confidence: string;
  methodology: string;
  benchmarkWaterline: number;
  modelVersion: string;
  createdAt: string;
  iconUrl?: string;
  storeUrl?: string;
};

export type CalibrationItem = {
  platform: string;
  category: string;
  country: string;
  effectiveK: number;
  sampleCount: number;
  mape: number;
  p50Error: number;
  updatedAt: string;
};

export type AppEstimatorTab =
  | 'overview'
  | 'snapshots'
  | 'velocity'
  | 'benchmarks'
  | 'estimates'
  | 'calibration';

export type AppEstimatorFilters = {
  platform: string;
  country: string;
  category: string;
  search: string;
  calcMethod: string;
  sourceQuality: string;
  confidence: string;
};
