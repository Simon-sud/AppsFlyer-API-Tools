/** Parse & compare AppsFlyer benchmark quarter labels (e.g. "Q4 2025", "2025 Q4"). */

export type QuarterParts = { year: number; quarter: number };

function normalizeYear(y: number): number {
  if (y >= 1000) return y;
  if (y >= 100) return 1900 + (y % 100);
  return y >= 70 ? 1900 + y : 2000 + y;
}

/** Chronological sort key: higher = more recent. */
export function quarterSortKey(parts: QuarterParts): number {
  return parts.year * 10 + parts.quarter;
}

/**
 * Best-effort parse of quarter strings from AppsFlyer pageProps `date` field.
 * Supports: "Q4 2025", "2025 Q4", "2025-Q4", "2025Q4", "Q4'25", etc.
 */
export function parseBenchmarkQuarter(label: string): QuarterParts | null {
  const s = String(label ?? '').trim();
  if (!s) return null;

  let m = s.match(/\bQ\s*([1-4])\D{0,4}(\d{2,4})\b/i);
  if (m) {
    return { quarter: Number(m[1]), year: normalizeYear(Number(m[2])) };
  }

  m = s.match(/\b(\d{4})\D{0,4}Q\s*([1-4])\b/i);
  if (m) {
    return { year: Number(m[1]), quarter: Number(m[2]) };
  }

  m = s.match(/\b(\d{4})Q([1-4])\b/i);
  if (m) {
    return { year: Number(m[1]), quarter: Number(m[2]) };
  }

  return null;
}

/** Short axis label, e.g. Q2 '24 (AppsFlyer Trends chart style). */
export function formatBenchmarkQuarterAxis(label: string): string {
  const p = parseBenchmarkQuarter(label);
  if (!p) return String(label ?? '').trim();
  const yy = String(p.year).slice(-2);
  return `Q${p.quarter} '${yy}`;
}

/** Compare two quarter labels chronologically (earlier < later). */
export function compareBenchmarkQuarters(a: string, b: string): number {
  const pa = parseBenchmarkQuarter(a);
  const pb = parseBenchmarkQuarter(b);
  if (pa && pb) {
    return quarterSortKey(pa) - quarterSortKey(pb);
  }
  if (pa && !pb) return -1;
  if (!pa && pb) return 1;
  return String(a).localeCompare(String(b));
}
