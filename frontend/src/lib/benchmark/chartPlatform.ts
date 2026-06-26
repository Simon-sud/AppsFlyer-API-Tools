/** Platform order for legend & series (Overall first, then Android, iOS). */

export const CHART_PLATFORM_ORDER = ['Overall', 'Android', 'iOS'] as const;
export type ChartPlatformId = (typeof CHART_PLATFORM_ORDER)[number];

export const CHART_PLATFORM_COLORS: Record<ChartPlatformId, string> = {
  Overall: '#475569',
  Android: '#34d399',
  iOS: '#60a5fa',
};

/** Bars per quarter: iOS left, Android right (AppsFlyer Performance benchmarks chart). */
export const PERFORMANCE_CLUSTER_PLATFORM_ORDER: ChartPlatformId[] = ['iOS', 'Android', 'Overall'];

/**
 * Map raw `platform` cell values to canonical legend ids.
 * Returns null when the value is not one of Android / iOS / Overall.
 */
export function normalizeChartPlatform(raw: string): ChartPlatformId | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'overall' || s === 'all platforms' || s === 'all' || s === 'total') {
    return 'Overall';
  }
  if (s === 'android' || s.startsWith('android')) return 'Android';
  if (s === 'ios' || s === 'iphone' || s === 'apple' || s.includes('ios')) return 'iOS';
  return null;
}
