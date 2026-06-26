import {
  CHART_PLATFORM_ORDER,
  normalizeChartPlatform,
  type ChartPlatformId,
} from './chartPlatform';
import { compareBenchmarkQuarters } from './quarter';
import { normalizePercentScale, type MetricDisplaySpec } from './metricFormat';
import type { SectionDatum } from './types';

export type CountrySegment = {
  country: string;
  value: number;
  color: string;
};

export type StackedQuarterBar = {
  quarter: string;
  segments: CountrySegment[];
};

export type TopCountriesPlatformPanel = {
  platform: ChartPlatformId;
  quarters: StackedQuarterBar[];
  /** Countries in legend order (largest average share first). */
  countries: string[];
  /** Swatch colors for legend: larger overall share → darker (stable across quarters). */
  countryLegendColors: Record<string, string>;
};

const MAX_COUNTRIES = 10;

/** Refined light→deep gradients per platform (AppsFlyer-style, softer than saturated primaries). */
const COUNTRY_PALETTES: Record<ChartPlatformId, string[]> = {
  Overall: ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#a8b4c4', '#8896a8', '#6b7a8c', '#4a5568'],
  Android: ['#f4fbf8', '#e8f7f1', '#d4efe4', '#b8e6d4', '#8fd9bd', '#5fc9a0', '#3aab82', '#2a8f6c'],
  iOS: ['#f5f9fe', '#eaf3fc', '#d9e9fa', '#c2dcfa', '#9ec5f5', '#75a8eb', '#4f8ad9', '#3b6fb8'],
};

function median(vals: number[]): number {
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function normalizeRowValue(v: number): number {
  if (!Number.isFinite(v)) return NaN;
  return normalizePercentScale(v);
}

function buildPanel(
  rows: SectionDatum[],
  platform: ChartPlatformId,
  palette: string[]
): TopCountriesPlatformPanel | null {
  const filtered = rows.filter((r) => normalizeChartPlatform(r.platform) === platform);
  if (filtered.length === 0) return null;

  const byQuarter = new Map<string, Map<string, number[]>>();
  for (const r of filtered) {
    const quarter = String(r.date ?? '').trim();
    const country = String(r.countryName ?? '').trim();
    if (!quarter || !country) continue;
    const v = normalizeRowValue(Number(r.dataValue));
    if (!Number.isFinite(v)) continue;
    let qMap = byQuarter.get(quarter);
    if (!qMap) {
      qMap = new Map();
      byQuarter.set(quarter, qMap);
    }
    const bucket = qMap.get(country);
    if (bucket) bucket.push(v);
    else qMap.set(country, [v]);
  }

  if (byQuarter.size === 0) return null;

  const countryTotals = new Map<string, number>();
  for (const qMap of byQuarter.values()) {
    for (const [country, vals] of qMap.entries()) {
      const m = median(vals);
      countryTotals.set(country, (countryTotals.get(country) ?? 0) + m);
    }
  }

  let rankedCountries = [...countryTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);

  let otherLabel: string | null = null;
  if (rankedCountries.length > MAX_COUNTRIES) {
    otherLabel = 'Other';
    rankedCountries = rankedCountries.slice(0, MAX_COUNTRIES - 1);
  }

  const quarters = [...byQuarter.keys()].sort(compareBenchmarkQuarters);
  const stackedQuarters: StackedQuarterBar[] = quarters.map((quarter) => {
    const qMap = byQuarter.get(quarter)!;
    const raw: { country: string; value: number }[] = [];

    for (const country of rankedCountries) {
      const vals = qMap.get(country);
      if (!vals?.length) continue;
      raw.push({ country, value: median(vals) });
    }

    if (otherLabel) {
      let otherSum = 0;
      for (const [country, vals] of qMap.entries()) {
        if (rankedCountries.includes(country)) continue;
        otherSum += median(vals);
      }
      if (otherSum > 0) raw.push({ country: otherLabel, value: otherSum });
    }

    const total = raw.reduce((s, x) => s + x.value, 0);
    const normalized = raw.map(({ country, value }) => ({
      country,
      value: total > 0 && Math.abs(total - 100) > 0.5 ? (value / total) * 100 : value,
    }));

    /** Stack bottom → top: smallest share first, largest on top. */
    const sortedAsc = [...normalized].sort(
      (a, b) => a.value - b.value || a.country.localeCompare(b.country)
    );
    const sortedDesc = [...sortedAsc].reverse();
    const valueRank = new Map(sortedDesc.map((s, i) => [s.country, i]));
    const plen = palette.length;
    const segments: CountrySegment[] = sortedAsc.map(({ country, value }) => {
      const r = valueRank.get(country) ?? 0;
      const idx = Math.max(0, plen - 1 - Math.min(r, plen - 1));
      return { country, value, color: palette[idx] };
    });

    return { quarter, segments };
  });

  const legendCountries = otherLabel
    ? [...rankedCountries, otherLabel]
    : [...rankedCountries];

  const countryLegendColors: Record<string, string> = {};
  legendCountries.forEach((c, i) => {
    countryLegendColors[c] =
      palette[Math.max(0, palette.length - 1 - Math.min(i, palette.length - 1))];
  });

  return {
    platform,
    quarters: stackedQuarters,
    countries: legendCountries,
    countryLegendColors,
  };
}

/** Up to 3 panels: Overall, Android, iOS (AppsFlyer Top Countries split). */
export function buildTopCountriesStackedPanels(
  rows: SectionDatum[],
  _display: MetricDisplaySpec
): TopCountriesPlatformPanel[] {
  return CHART_PLATFORM_ORDER.map((platform) =>
    buildPanel(rows, platform, COUNTRY_PALETTES[platform])
  ).filter((p): p is TopCountriesPlatformPanel => p != null);
}
