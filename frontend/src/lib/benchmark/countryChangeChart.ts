import { compareBenchmarkQuarters, formatBenchmarkQuarterAxis } from './quarter';
import { CHART_PLATFORM_ORDER, normalizeChartPlatform, type ChartPlatformId } from './chartPlatform';
import { normalizePercentScale, type MetricDisplaySpec } from './metricFormat';
import type { SectionDatum } from './types';

export type CountryChangeBar = {
  country: string;
  value: number;
};

export type CountryChangePanel = {
  platform: ChartPlatformId;
  quarter: string;
  quarterLabel: string;
  bars: CountryChangeBar[];
};

function median(vals: number[]): number {
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * One horizontal cluster per platform (Overall / Android / iOS): latest quarter in the row set,
 * one bar per country (median when multiple rows collapse), sorted high → low (winners left).
 */
export function buildCountryChangePanels(
  rows: SectionDatum[],
  display: MetricDisplaySpec
): CountryChangePanel[] {
  const parsed = rows
    .map((r) => {
      const v = Number(r.dataValue);
      if (!Number.isFinite(v)) return null;
      const q = String(r.date ?? '').trim();
      const country = String(r.countryName ?? '').trim();
      if (!q || !country) return null;
      const platform = normalizeChartPlatform(r.platform);
      if (!platform) return null;
      let value = v;
      if (
        display.kind === 'percent' ||
        display.kind === 'percent_change' ||
        display.kind === 'percent_share'
      ) {
        value = normalizePercentScale(v);
      }
      if (!Number.isFinite(value)) return null;
      return { quarter: q, country, platform, value };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  if (parsed.length === 0) return [];

  const quarters = [...new Set(parsed.map((p) => p.quarter))];
  quarters.sort(compareBenchmarkQuarters);
  const latestQuarter = quarters[quarters.length - 1]!;

  const inQuarter = parsed.filter((p) => p.quarter === latestQuarter);
  const quarterLabel = formatBenchmarkQuarterAxis(latestQuarter);

  const panels: CountryChangePanel[] = [];

  for (const platform of CHART_PLATFORM_ORDER) {
    const pr = inQuarter.filter((p) => p.platform === platform);
    if (pr.length === 0) continue;

    const byCountry = new Map<string, number[]>();
    for (const p of pr) {
      const bucket = byCountry.get(p.country);
      if (bucket) bucket.push(p.value);
      else byCountry.set(p.country, [p.value]);
    }

    const bars: CountryChangeBar[] = [...byCountry.entries()]
      .map(([country, vals]) => ({ country, value: median(vals) }))
      .sort((a, b) => b.value - a.value || a.country.localeCompare(b.country));

    if (bars.length === 0) continue;

    panels.push({
      platform,
      quarter: latestQuarter,
      quarterLabel,
      bars,
    });
  }

  return panels;
}
