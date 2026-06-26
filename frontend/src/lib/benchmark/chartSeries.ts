import {
  CHART_PLATFORM_COLORS,
  CHART_PLATFORM_ORDER,
  normalizeChartPlatform,
  type ChartPlatformId,
} from './chartPlatform';
import { compareBenchmarkQuarters } from './quarter';
import { normalizePercentScale, type MetricDisplaySpec } from './metricFormat';
import type { SectionDatum } from './types';

export type BenchmarkChartPoint = {
  quarter: string;
  value: number;
};

export type BenchmarkChartSeries = {
  id: ChartPlatformId;
  label: ChartPlatformId;
  color: string;
  points: BenchmarkChartPoint[];
};

function isPercentKind(kind: MetricDisplaySpec['kind']): boolean {
  return kind === 'percent' || kind === 'percent_change' || kind === 'percent_share';
}

function normalizeRowValue(v: number, display: MetricDisplaySpec): number {
  if (!Number.isFinite(v)) return NaN;
  if (isPercentKind(display.kind)) return normalizePercentScale(v);
  return v;
}

function median(vals: number[]): number {
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Group filtered rows by platform (Overall / Android / iOS), median per quarter — shared by line & bar charts. */
export function buildBenchmarkPlatformSeries(
  rows: SectionDatum[],
  display: MetricDisplaySpec
): { series: BenchmarkChartSeries[]; quarters: string[] } {
  const buckets = new Map<ChartPlatformId, Map<string, number[]>>();

  for (const r of rows) {
    const platform = normalizeChartPlatform(r.platform);
    if (!platform) continue;
    const quarter = String(r.date ?? '').trim();
    if (!quarter) continue;
    const v = normalizeRowValue(Number(r.dataValue), display);
    if (!Number.isFinite(v)) continue;

    let plat = buckets.get(platform);
    if (!plat) {
      plat = new Map();
      buckets.set(platform, plat);
    }
    const qBucket = plat.get(quarter);
    if (qBucket) qBucket.push(v);
    else plat.set(quarter, [v]);
  }

  const quarterSet = new Set<string>();
  for (const plat of buckets.values()) {
    for (const q of plat.keys()) quarterSet.add(q);
  }
  const quarters = [...quarterSet].sort(compareBenchmarkQuarters);

  const series: BenchmarkChartSeries[] = CHART_PLATFORM_ORDER.filter((id) => buckets.has(id)).map(
    (id) => {
      const plat = buckets.get(id)!;
      const points: BenchmarkChartPoint[] = quarters.map((quarter) => {
        const vals = plat.get(quarter);
        return {
          quarter,
          value: vals?.length ? median(vals) : NaN,
        };
      });
      return {
        id,
        label: id,
        color: CHART_PLATFORM_COLORS[id],
        points,
      };
    }
  );

  return { series, quarters };
}
