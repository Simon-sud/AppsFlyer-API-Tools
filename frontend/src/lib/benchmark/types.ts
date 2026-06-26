/** AppsFlyer Public Benchmark — canonical types for UI, export, and OpenClaw */

export type SectionKey =
  | 'section1Data'
  | 'section2Data'
  | 'section3Data'
  | 'section4Data'
  | 'section5Data';

export type SectionId = 'trends' | 'performance' | 'top_countries' | 'change' | 'extra';

export const SECTION_META: {
  key: SectionKey;
  id: SectionId;
  label: string;
  description: string;
}[] = [
  {
    key: 'section2Data',
    id: 'performance',
    label: 'Performance',
    description: 'App-level averages (D1/D7 retention, ROAS, fraud, etc.)',
  },
  {
    key: 'section1Data',
    id: 'trends',
    label: 'Trends',
    description: 'Quarter-over-quarter trends as percentages (spend and other named units keep native scale)',
  },
  {
    key: 'section3Data',
    id: 'top_countries',
    label: 'Top Countries',
    description:
      'Aggregated % share by country (AppsFlyer FAQ §3 — apps with more data points weigh more)',
  },
  {
    key: 'section4Data',
    id: 'change',
    label: 'Change',
    description:
      'Quarter-over-quarter % change vs prior quarter (AppsFlyer FAQ §4, aggregated)',
  },
  {
    key: 'section5Data',
    id: 'extra',
    label: 'Extra',
    description: 'Split by media type (% share by quarter — Sessions, IAA revenue, etc.)',
  },
];

export type SectionDatum = {
  dataValue: number;
  appSize: string;
  date: string;
  platform: string;
  countryName: string;
  mediaType: string;
};

export type SectionMetric = {
  data: SectionDatum[];
  [k: string]: unknown;
};

export type PageProps = {
  section1Data?: Record<string, SectionMetric>;
  section2Data?: Record<string, SectionMetric>;
  section3Data?: Record<string, SectionMetric>;
  section4Data?: Record<string, SectionMetric>;
  section5Data?: Record<string, SectionMetric>;
  filterData?: Record<string, unknown>;
  titleData?: Record<string, unknown>;
  slug?: string[];
};

export type SliceDescriptor = {
  category: string;
  subCategory: string;
  subSubCategory: string | null;
  country: string;
  mediaType: string;
  labels: {
    category: string;
    subCategory: string;
    subSubCategory?: string;
    country: string;
    mediaType: string;
  };
};

export type MetricStats = {
  n: number;
  min: number;
  median: number;
  avg: number;
  max: number;
};

export type MetricCube = {
  section: SectionId;
  sectionLabel: string;
  metric: string;
  rows: SectionDatum[];
  stats: MetricStats;
};

export type BenchmarkSlice = {
  id: string;
  url: string;
  descriptor: SliceDescriptor;
  sectionsAvailable: SectionId[];
  cubes: MetricCube[];
  pointCount: number;
};

export type SummaryStats = {
  rows: number;
  min: number;
  median: number;
  avg: number;
  max: number;
};
