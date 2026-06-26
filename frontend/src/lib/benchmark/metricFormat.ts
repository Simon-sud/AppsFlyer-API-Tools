/**
 * Benchmark metric value units — aligned with AppsFlyer public definitions:
 * https://www.appsflyer.com/benchmarks/metric-definitions/
 * https://www.appsflyer.com/benchmarks/faq/
 */
import type { SectionId } from './types';

export type MetricValueKind =
  | 'percent'
  | 'percent_change'
  | 'percent_share'
  | 'currency_usd'
  | 'count'
  | 'ratio'
  | 'index'
  | 'ipm'
  | 'decimal';

export type MetricDisplaySpec = {
  kind: MetricValueKind;
  /** Short label for table header / stats (e.g. %, USD, ×) */
  unitLabel: string;
  /** One-line explanation for tooltips */
  description: string;
};

type Rule = {
  pattern: RegExp;
  spec: MetricDisplaySpec;
};

/** Trends: these install/session series use QoQ % with +/- prefix (AppsFlyer chart). */
const TRENDS_QOQ_PERCENT_PATTERN =
  /organic installs|overall installs|paid installs|^\s*sessions\s*$/i;

/** UA / Remarketing ad spend are always % (every section — Trends, Performance, Top Countries, etc.). */
const GLOBAL_PERCENT_AD_SPEND_PATTERN =
  /^\s*ua\s+ad\s+spend\s*$|^\s*re-?\s*marketing\s+ad\s+spend\s*$/i;

const GLOBAL_PERCENT_AD_SPEND_SPEC: MetricDisplaySpec = {
  kind: 'percent_share',
  unitLabel: '%',
  description:
    'Ad spend shown as percentage share (AppsFlyer benchmarks — UA and Remarketing ad spend in all sections)',
};

/** IAA revenue is a % split (Extra / media-type charts), not USD — must run before generic "revenue". */
const GLOBAL_IAA_REVENUE_PATTERN = /\biaa\s+revenue\b/i;

const GLOBAL_IAA_REVENUE_SPEC: MetricDisplaySpec = {
  kind: 'percent_share',
  unitLabel: '%',
  description:
    'In-app ad (IAA) revenue share by media type or channel (AppsFlyer benchmarks — aggregated %, not dollar revenue)',
};

/** Strong name-based rules (checked before section defaults). */
const SPECIFIC_METRIC_RULES: Rule[] = [
  {
    pattern: /install fraud|fraud rate/i,
    spec: {
      kind: 'percent',
      unitLabel: '%',
      description:
        'Share of non-organic installs identified as fraudulent (fraudulent ÷ non-organic installs).',
    },
  },
  {
    pattern: /retention|day\s*1|day\s*7|day\s*30|\bd1\b|\bd7\b|\bd30\b/i,
    spec: {
      kind: 'percent',
      unitLabel: '%',
      description:
        'Percentage of users who opened the app 1, 7, or 30 days after install in the quarter.',
    },
  },
  {
    pattern: /in[- ]?app purchase|iap|paying user|purchase rate|share of paying/i,
    spec: {
      kind: 'percent',
      unitLabel: '%',
      description: 'Percentage of users with in-app purchase(s) within 30 days of install.',
    },
  },
  {
    pattern: /cost per install|\bcpi\b/i,
    spec: {
      kind: 'currency_usd',
      unitLabel: 'USD',
      description: 'Cost per attributed install (total spend ÷ attributed installs).',
    },
  },
  {
    pattern: /\bspend\b|(?<!iaa\s)revenue|ad revenue/i,
    spec: {
      kind: 'currency_usd',
      unitLabel: 'USD',
      description: 'Marketing spend or revenue (USD, aggregated).',
    },
  },
  {
    pattern: /\broas\b|return on ad spend/i,
    spec: {
      kind: 'ratio',
      unitLabel: '×',
      description: 'Return on ad spend (revenue per dollar of UA spend; shown as a multiplier).',
    },
  },
  {
    pattern: /\bipm\b|installs per mille|per 1,?000 impressions/i,
    spec: {
      kind: 'ipm',
      unitLabel: 'IPM',
      description: 'Installs per 1,000 ad impressions.',
    },
  },
  {
    pattern: /dau\s*\/\s*mau|stickiness/i,
    spec: {
      kind: 'ratio',
      unitLabel: '×',
      description: 'DAU ÷ MAU stickiness ratio.',
    },
  },
];

/** Count-style metrics (Performance section; after section defaults). */
const COUNT_METRIC_RULES: Rule[] = [
  {
    pattern:
      /\binstalls?\b|\bsessions?\b|\bconversions?\b|remarketing|re-engagement|opens?\b/i,
    spec: {
      kind: 'count',
      unitLabel: '#',
      description: 'Count of installs, sessions, or conversions (aggregated).',
    },
  },
];

const SECTION_DEFAULTS: Partial<Record<SectionId, MetricDisplaySpec>> = {
  trends: {
    kind: 'percent',
    unitLabel: '%',
    description:
      'Trends chart value as percentage on AppsFlyer public benchmarks (including UA ad spend and other spend metrics)',
  },
  change: {
    kind: 'percent_change',
    unitLabel: '%',
    description:
      'QoQ % change vs the prior quarter (Section 4 — aggregated; see AppsFlyer benchmarks FAQ).',
  },
  top_countries: {
    kind: 'percent_share',
    unitLabel: '%',
    description:
      'Country share of the selected metric within the slice (Section 3 — aggregated % split; FAQ).',
  },
  extra: {
    kind: 'percent_share',
    unitLabel: '%',
    description:
      'Media-type % split by quarter (Section 5 — e.g. Sessions, IAA revenue, paid installs share; AppsFlyer Split by media type)',
  },
};

const FALLBACK_SPEC: MetricDisplaySpec = {
  kind: 'decimal',
  unitLabel: '',
  description: 'Numeric benchmark value; see AppsFlyer metric definitions for this metric name.',
};

const TRENDS_QOQ_PERCENT_SPEC: MetricDisplaySpec = {
  kind: 'percent_change',
  unitLabel: '%',
  description:
    'QoQ % change on the Trends chart (matches AppsFlyer; not a normalized index)',
};

/** In Trends, AppsFlyer charts use % — do not apply Performance-style USD / count / ratio rules. */
const TRENDS_SKIP_SPECIFIC_KINDS = new Set<MetricValueKind>([
  'currency_usd',
  'count',
  'ratio',
  'ipm',
  'index',
  'decimal',
]);

/** Strip trailing punctuation from one-line metric descriptions (UI sits next to ? icon). */
export function stripTrailingPunctuation(text: string): string {
  return text.replace(/[\s.,;:!?，。；：！？、]+$/u, '').trim();
}

function finalizeMetricSpec(spec: MetricDisplaySpec): MetricDisplaySpec {
  return {
    ...spec,
    description: stripTrailingPunctuation(spec.description),
  };
}

export function resolveMetricDisplay(metricName: string, sectionId?: SectionId): MetricDisplaySpec {
  const name = metricName.trim();

  if (GLOBAL_PERCENT_AD_SPEND_PATTERN.test(name)) {
    return finalizeMetricSpec(GLOBAL_PERCENT_AD_SPEND_SPEC);
  }

  if (GLOBAL_IAA_REVENUE_PATTERN.test(name)) {
    return finalizeMetricSpec(GLOBAL_IAA_REVENUE_SPEC);
  }

  if (sectionId === 'trends' && TRENDS_QOQ_PERCENT_PATTERN.test(name)) {
    return finalizeMetricSpec(TRENDS_QOQ_PERCENT_SPEC);
  }

  for (const { pattern, spec } of SPECIFIC_METRIC_RULES) {
    if (!pattern.test(name)) continue;
    if (sectionId === 'trends' && TRENDS_SKIP_SPECIFIC_KINDS.has(spec.kind)) {
      continue;
    }
    return finalizeMetricSpec(spec);
  }

  /** Extra charts are always % splits by media type (Sessions, Paid installs, IAA revenue, etc.). */
  if (sectionId === 'extra') {
    return finalizeMetricSpec(SECTION_DEFAULTS.extra!);
  }

  if (sectionId && SECTION_DEFAULTS[sectionId]) {
    return finalizeMetricSpec(SECTION_DEFAULTS[sectionId]!);
  }
  if (sectionId !== 'trends' && !GLOBAL_PERCENT_AD_SPEND_PATTERN.test(name)) {
    for (const { pattern, spec } of COUNT_METRIC_RULES) {
      if (pattern.test(name)) {
        return finalizeMetricSpec(spec);
      }
    }
  }
  return finalizeMetricSpec(FALLBACK_SPEC);
}

/** AppsFlyer stores most % metrics as 0–100; some rows use 0–1 fractions — normalize for display. */
export function normalizePercentScale(v: number): number {
  if (!Number.isFinite(v)) return v;
  if (v === 0) return 0;
  if (Math.abs(v) <= 1) {
    return v * 100;
  }
  return v;
}

function formatPercentDigits(pct: number): string {
  const abs = Math.abs(pct);
  if (abs >= 100) return pct.toFixed(1);
  if (abs >= 10) return pct.toFixed(2);
  if (abs >= 1) return pct.toFixed(2);
  return pct.toFixed(3);
}

function formatDecimalFallback(v: number): string {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 1000) return v.toFixed(0);
  if (abs >= 100) return v.toFixed(1);
  if (abs >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

export function formatBenchmarkMetricValue(v: number, spec: MetricDisplaySpec): string {
  if (!Number.isFinite(v)) return '—';

  switch (spec.kind) {
    case 'percent':
    case 'percent_share': {
      const pct = normalizePercentScale(v);
      return `${formatPercentDigits(pct)}%`;
    }
    case 'percent_change': {
      const pct = normalizePercentScale(v);
      const prefix = pct > 0 ? '+' : '';
      return `${prefix}${formatPercentDigits(pct)}%`;
    }
    case 'currency_usd': {
      const abs = Math.abs(v);
      if (abs >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
      if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
      if (abs >= 10_000) return `$${(v / 1_000).toFixed(1)}K`;
      if (abs >= 100) return `$${v.toFixed(0)}`;
      return `$${v.toFixed(2)}`;
    }
    case 'count':
      return Math.round(v).toLocaleString();
    case 'ratio':
      return `${v.toFixed(2)}×`;
    case 'ipm':
      return `${v.toFixed(2)}`;
    case 'index':
      return v.toFixed(2);
    default:
      return formatDecimalFallback(v);
  }
}

export function valueColumnLabel(spec: MetricDisplaySpec): string {
  if (!spec.unitLabel) return 'Value';
  return `Value (${spec.unitLabel})`;
}
