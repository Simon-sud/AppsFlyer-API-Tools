import { autopipeAxiosInstance } from '../../services/api';
import type {
  AppEstimatorOverview,
  AppEstimatorPipelineStatus,
  BenchmarkItem,
  CalibrationItem,
  EstimateItem,
  PaginatedResponse,
  SnapshotHistoryItem,
  SnapshotItem,
  VelocityItem,
} from './types';

export type ListQuery = {
  page?: number;
  pageSize?: number;
  platform?: string;
  country?: string;
  category?: string;
  search?: string;
  calcMethod?: string;
  sourceQuality?: string;
  confidence?: string;
  latestOnly?: boolean;
};

const base = '/api/app-estimator';

export async function fetchAppEstimatorOverview(): Promise<AppEstimatorOverview> {
  const res = await autopipeAxiosInstance.get<AppEstimatorOverview>(`${base}/overview`);
  return res.data;
}

export async function fetchAppEstimatorPipeline(): Promise<{
  success: boolean;
  pipeline: AppEstimatorPipelineStatus;
}> {
  const res = await autopipeAxiosInstance.get<{ success: boolean; pipeline: AppEstimatorPipelineStatus }>(
    `${base}/pipeline`
  );
  return res.data;
}

export async function fetchAppEstimatorSnapshots(
  query: ListQuery = {}
): Promise<PaginatedResponse<SnapshotItem>> {
  const res = await autopipeAxiosInstance.get<PaginatedResponse<SnapshotItem>>(`${base}/snapshots`, {
    params: query,
  });
  return res.data;
}

export async function fetchAppEstimatorSnapshotHistory(params: {
  platform: string;
  appId?: string;
  package?: string;
  country: string;
}): Promise<{ success: boolean; items: SnapshotHistoryItem[] }> {
  const res = await autopipeAxiosInstance.get<{ success: boolean; items: SnapshotHistoryItem[] }>(
    `${base}/snapshots/history`,
    { params }
  );
  return res.data;
}

export async function fetchAppEstimatorVelocity(
  query: ListQuery = {}
): Promise<PaginatedResponse<VelocityItem>> {
  const res = await autopipeAxiosInstance.get<PaginatedResponse<VelocityItem>>(`${base}/velocity`, {
    params: query,
  });
  return res.data;
}

export async function fetchAppEstimatorBenchmarks(
  query: ListQuery = {}
): Promise<PaginatedResponse<BenchmarkItem> & { categories?: string[] }> {
  const res = await autopipeAxiosInstance.get<PaginatedResponse<BenchmarkItem> & { categories?: string[] }>(
    `${base}/benchmarks`,
    { params: query }
  );
  return res.data;
}

export async function fetchAppEstimatorEstimates(
  query: ListQuery = {}
): Promise<PaginatedResponse<EstimateItem>> {
  const res = await autopipeAxiosInstance.get<PaginatedResponse<EstimateItem>>(`${base}/estimates`, {
    params: query,
  });
  return res.data;
}

export async function fetchAppEstimatorCalibration(
  query: ListQuery = {}
): Promise<PaginatedResponse<CalibrationItem> & { categories?: string[] }> {
  const res = await autopipeAxiosInstance.get<PaginatedResponse<CalibrationItem> & { categories?: string[] }>(
    `${base}/calibration`,
    {
      params: query,
    }
  );
  return res.data;
}
