/**
 * Field-level help copy for Benchmark Explorer UI.
 * Sources: https://www.appsflyer.com/benchmarks/faq/
 *          https://www.appsflyer.com/benchmarks/metric-definitions/
 */
import { resolveMetricDisplay } from './metricFormat';
import type { SectionId } from './types';

export type FieldHelpSpec = {
  title: string;
  body: string;
  href?: string;
  hrefLabel?: string;
};

const FAQ = 'https://www.appsflyer.com/benchmarks/faq/';
const METRICS = 'https://www.appsflyer.com/benchmarks/metric-definitions/';

export const BENCHMARK_FIELD_HELP = {
  // —— Page KPI tiles ——
  kpiTotalSlices: {
    title: 'Total slices',
    body: 'Number of benchmark URLs in the loaded sitemap (category × country × media type combinations).',
    href: FAQ,
  },
  kpiMatchCount: {
    title: 'Match count',
    body: 'Slices that match your current Slice Picker filters and are eligible for bulk fetch.',
  },
  kpiActiveSlice: {
    title: 'Active slice',
    body: 'Total data points in the slice currently open in Slice Insights (all sections combined).',
  },
  kpiBulkResults: {
    title: 'Bulk results',
    body: 'Successful fetches vs total attempts in the latest bulk run.',
  },

  // —— Slice Picker ——
  pickerCategory: {
    title: 'Category',
    body: 'Top-level app taxonomy (gaming / non-gaming verticals per AppsFlyer & Sensor Tower App IQ).',
    href: FAQ,
  },
  pickerSubCategory: {
    title: 'Sub-category',
    body: 'Second-level genre or vertical within the selected category.',
    href: FAQ,
  },
  pickerSubSubCategory: {
    title: 'Segments',
    body: 'Optional third-level segment when published for that category path.',
    href: FAQ,
  },
  pickerCountry: {
    title: 'Country',
    body: 'Country or sub-region for the benchmark slice. If country thresholds are not met, results may reflect a labeled sub-region.',
    href: FAQ,
  },
  pickerMediaType: {
    title: 'Media type',
    body: 'Paid channel group (e.g. Social & Search, Ad Networks, DSPs) for UA or remarketing metrics.',
    href: FAQ,
  },
  pickerBulkSearch: {
    title: 'Bulk Search',
    body: 'Fetches page data for every matched slice in parallel. Results stay in this browser tab until refresh.',
  },

  // —— Bulk results table ——
  bulkSlice: {
    title: 'Slice',
    body: 'Canonical benchmark URL path on appsflyer.com/benchmarks.',
  },
  bulkStatus: {
    title: 'Status',
    body: 'Whether the proxy fetch returned valid pageProps or failed.',
  },
  bulkDataPoints: {
    title: 'Data points',
    body: 'Count of metric rows across all sections in the fetched slice.',
  },
  bulkInspect: {
    title: 'Inspect',
    body: 'Load this slice into Slice Insights below for metrics, filters, and export.',
  },

  // —— Slice Insights ——
  insightsSection: {
    title: 'Section tabs',
    body: 'Each tab is a different aggregation from AppsFlyer: Performance (per-app average), Trends (index), Top Countries / Change / Extra (aggregated %).',
    href: FAQ,
  },

  // —— Metric & filters ——
  metricPicker: {
    title: 'Metric',
    body: 'Benchmark KPI for this section. Unit and definition follow AppsFlyer; hover the active metric or column headers for details.',
    href: METRICS,
  },
  filterRow: {
    title: 'Row filters',
    body: 'Narrow visible rows by platform, app size cohort, or country within the current metric table.',
    href: FAQ,
  },
  filterPlatform: {
    title: 'Platform',
    body: 'Mobile OS dimension in the row (e.g. iOS, Android).',
  },
  filterAppSize: {
    title: 'App size',
    body: 'Install-volume cohort: Large (top 20%), Medium (50–80th %ile), Small (20–50th %ile).',
    href: FAQ,
  },
  filterCountry: {
    title: 'Country (row)',
    body: 'Country dimension on each data row (may differ from the slice-level country in the URL).',
  },
  filterSearch: {
    title: 'Search rows',
    body: 'Free-text filter across quarter, platform, app size, country, and media type columns.',
  },

  // —— Table columns ——
  colQuarter: {
    title: 'Quarter',
    body: 'Reporting quarter for the benchmark cohort (updated quarterly per AppsFlyer schedule).',
    href: FAQ,
  },
  colPlatform: {
    title: 'Platform',
    body: 'Operating system for this row.',
  },
  colAppSize: {
    title: 'App size',
    body: 'Size bucket by install volume among apps in the benchmark panel.',
    href: FAQ,
  },
  colCountry: {
    title: 'Country',
    body: 'Geography dimension for this row (country or aggregated sub-region label).',
    href: FAQ,
  },
  colMediaType: {
    title: 'Media type',
    body: 'Paid media channel classification for UA or remarketing activity.',
    href: FAQ,
  },

  // —— Summary strip ——
  statRows: {
    title: 'Rows',
    body: 'Number of table rows after your filters (not total slice points).',
  },
  statMin: {
    title: 'Min',
    body: 'Minimum value among filtered rows for the active metric.',
  },
  statMedian: {
    title: 'Median',
    body: 'Median value among filtered rows for the active metric.',
  },
  statAvg: {
    title: 'Avg',
    body: 'Arithmetic mean among filtered rows for the active metric.',
  },
  statMax: {
    title: 'Max',
    body: 'Maximum value among filtered rows for the active metric.',
  },
} as const satisfies Record<string, FieldHelpSpec>;

const SECTION_HELP: Record<SectionId, FieldHelpSpec> = {
  performance: {
    title: 'Performance',
    body: 'Per-app equal-weight averages (D1/D7/D30 retention, CPI, ROAS, fraud rate, etc.). Top/bottom 10% outliers removed before averaging.',
    href: FAQ,
  },
  trends: {
    title: 'Trends',
    body: 'Normalized quarter-over-quarter trend index (aggregated; larger apps influence more). Values are indices, not raw counts.',
    href: FAQ,
  },
  top_countries: {
    title: 'Top Countries',
    body: 'Each value is that country’s % share of the metric within the slice (aggregated methodology).',
    href: FAQ,
  },
  change: {
    title: 'Change',
    body: 'Quarter-over-quarter % change vs the previous quarter (aggregated). Positive = increase, negative = decrease.',
    href: FAQ,
  },
  extra: {
    title: 'Extra',
    body: '100% stacked bars by media type per quarter (iOS / Android). Metrics such as Sessions and IAA revenue are % shares, not USD.',
    href: FAQ,
  },
};

export function getSectionFieldHelp(sectionId: SectionId): FieldHelpSpec {
  return SECTION_HELP[sectionId];
}

export function getMetricFieldHelp(metricName: string, sectionId?: SectionId): FieldHelpSpec {
  const display = resolveMetricDisplay(metricName, sectionId);
  const unit = display.unitLabel ? `Unit: ${display.unitLabel}. ` : '';
  return {
    title: metricName,
    body: `${unit}${display.description}`,
    href: METRICS,
    hrefLabel: 'Official definitions',
  };
}

export function getValueColumnHelp(metricName: string, sectionId?: SectionId): FieldHelpSpec {
  const display = resolveMetricDisplay(metricName, sectionId);
  const unit = display.unitLabel || 'value';
  return {
    title: `Value (${unit})`,
    body: display.description,
    href: METRICS,
    hrefLabel: 'Official definitions',
  };
}
