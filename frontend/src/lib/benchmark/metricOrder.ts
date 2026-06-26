/** Sort metric tab labels for Benchmark Slice Insights (e.g. Retention day1 → day7 → day30). */

const RETENTION_DAY_RE =
  /retention[^0-9]*day\s*(\d+)|day\s*(\d+)[^0-9]*retention|\bd(\d{1,2})\b/i;

function retentionDayOrder(name: string): number | null {
  const m = name.match(RETENTION_DAY_RE);
  if (!m) return null;
  const day = Number(m[1] ?? m[2] ?? m[3]);
  if (day === 1 || day === 7 || day === 30) return day;
  if (day > 0 && day < 100) return day + 1000;
  return null;
}

export function sortBenchmarkMetricKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ra = retentionDayOrder(a);
    const rb = retentionDayOrder(b);
    if (ra !== null && rb !== null) return ra - rb;
    if (ra !== null) return -1;
    if (rb !== null) return 1;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });
}
