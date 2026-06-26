import { normalizeChartPlatform, type ChartPlatformId } from './chartPlatform';
import { compareBenchmarkQuarters } from './quarter';
import { normalizePercentScale, type MetricDisplaySpec } from './metricFormat';
import type { SectionDatum } from './types';

/** AppsFlyer "Split by media type" uses iOS + Android side by side (no Overall panel). */
export type MediaTypeChartPlatformId = Extract<ChartPlatformId, 'iOS' | 'Android'>;

export const MEDIA_TYPE_CHART_PLATFORMS: MediaTypeChartPlatformId[] = ['iOS', 'Android'];

export type MediaTypeSegment = {
  mediaType: string;
  value: number;
  color: string;
};

export type MediaTypeStackedQuarterBar = {
  quarter: string;
  segments: MediaTypeSegment[];
};

export type MediaTypePlatformPanel = {
  platform: MediaTypeChartPlatformId;
  quarters: MediaTypeStackedQuarterBar[];
  mediaTypes: string[];
  mediaTypeLegendColors: Record<string, string>;
};

const MAX_MEDIA_TYPES = 12;

/** Violet ramp (iOS) and amber ramp (Android) — distinct from Top Countries slate / mint / blue. */
const MEDIA_TYPE_PALETTES: Record<MediaTypeChartPlatformId, string[]> = {
  iOS: ['#faf5ff', '#f3e8ff', '#e9d5ff', '#d8b4fe', '#c084fc', '#a855f7', '#9333ea', '#7e22ce'],
  Android: ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309'],
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
  platform: MediaTypeChartPlatformId,
  palette: string[]
): MediaTypePlatformPanel | null {
  const filtered = rows.filter((r) => normalizeChartPlatform(r.platform) === platform);
  if (filtered.length === 0) return null;

  const byQuarter = new Map<string, Map<string, number[]>>();
  for (const r of filtered) {
    const quarter = String(r.date ?? '').trim();
    const mediaType = String(r.mediaType ?? '').trim();
    if (!quarter || !mediaType) continue;
    const v = normalizeRowValue(Number(r.dataValue));
    if (!Number.isFinite(v)) continue;
    let qMap = byQuarter.get(quarter);
    if (!qMap) {
      qMap = new Map();
      byQuarter.set(quarter, qMap);
    }
    const bucket = qMap.get(mediaType);
    if (bucket) bucket.push(v);
    else qMap.set(mediaType, [v]);
  }

  if (byQuarter.size === 0) return null;

  const mediaTotals = new Map<string, number>();
  for (const qMap of byQuarter.values()) {
    for (const [mediaType, vals] of qMap.entries()) {
      const m = median(vals);
      mediaTotals.set(mediaType, (mediaTotals.get(mediaType) ?? 0) + m);
    }
  }

  let rankedMedia = [...mediaTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([m]) => m);

  let otherLabel: string | null = null;
  if (rankedMedia.length > MAX_MEDIA_TYPES) {
    otherLabel = 'Other';
    rankedMedia = rankedMedia.slice(0, MAX_MEDIA_TYPES - 1);
  }

  const quarters = [...byQuarter.keys()].sort(compareBenchmarkQuarters);
  const stackedQuarters: MediaTypeStackedQuarterBar[] = quarters.map((quarter) => {
    const qMap = byQuarter.get(quarter)!;
    const raw: { mediaType: string; value: number }[] = [];

    for (const mediaType of rankedMedia) {
      const vals = qMap.get(mediaType);
      if (!vals?.length) continue;
      raw.push({ mediaType, value: median(vals) });
    }

    if (otherLabel) {
      let otherSum = 0;
      for (const [mediaType, vals] of qMap.entries()) {
        if (rankedMedia.includes(mediaType)) continue;
        otherSum += median(vals);
      }
      if (otherSum > 0) raw.push({ mediaType: otherLabel, value: otherSum });
    }

    const total = raw.reduce((s, x) => s + x.value, 0);
    const normalized = raw.map(({ mediaType, value }) => ({
      mediaType,
      value: total > 0 && Math.abs(total - 100) > 0.5 ? (value / total) * 100 : value,
    }));

    const sortedAsc = [...normalized].sort(
      (a, b) => a.value - b.value || a.mediaType.localeCompare(b.mediaType)
    );
    const sortedDesc = [...sortedAsc].reverse();
    const valueRank = new Map(sortedDesc.map((s, i) => [s.mediaType, i]));
    const plen = palette.length;
    const segments: MediaTypeSegment[] = sortedAsc.map(({ mediaType, value }) => {
      const r = valueRank.get(mediaType) ?? 0;
      const idx = Math.max(0, plen - 1 - Math.min(r, plen - 1));
      return { mediaType, value, color: palette[idx] };
    });

    return { quarter, segments };
  });

  const legendMedia = otherLabel ? [...rankedMedia, otherLabel] : [...rankedMedia];

  const mediaTypeLegendColors: Record<string, string> = {};
  legendMedia.forEach((m, i) => {
    mediaTypeLegendColors[m] =
      palette[Math.max(0, palette.length - 1 - Math.min(i, palette.length - 1))];
  });

  return {
    platform,
    quarters: stackedQuarters,
    mediaTypes: legendMedia,
    mediaTypeLegendColors,
  };
}

export function buildMediaTypeStackedPanels(
  rows: SectionDatum[],
  _display: MetricDisplaySpec
): MediaTypePlatformPanel[] {
  return MEDIA_TYPE_CHART_PLATFORMS.map((platform) =>
    buildPanel(rows, platform, MEDIA_TYPE_PALETTES[platform])
  ).filter((p): p is MediaTypePlatformPanel => p != null);
}
