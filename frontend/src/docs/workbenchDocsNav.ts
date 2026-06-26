/** Section ids must match DispatchAccessCenterDoc; Layout sidebar scroll targets depend on these */
export type DocNavItem = { id: string; label: string; badge?: string };
export type DocNavSection = { sectionTitle: string | null; items: DocNavItem[] };

export const WORKBENCH_DOCS_PATH = '/docs';

export const WORKBENCH_DOCS_NAV: DocNavSection[] = [
  {
    sectionTitle: 'Introduction',
    items: [{ id: 'doc-overview', label: 'Overview' }],
  },
  {
    sectionTitle: 'Application pages',
    items: [
      { id: 'doc-home', label: 'Appsflyer Query' },
      { id: 'doc-dashboard', label: 'Dashboard' },
      { id: 'doc-autopipe', label: 'AutoPipe' },
      { id: 'doc-dispatch-access', label: 'Dispatch Access' },
      { id: 'doc-benchmark', label: 'Benchmark' },
      { id: 'doc-app-estimator', label: 'App Estimator' },
      { id: 'doc-apps-finder', label: 'Apps Finder' },
      { id: 'doc-account', label: 'Account' },
    ],
  },
  {
    sectionTitle: 'Gochat',
    items: [{ id: 'doc-gochat', label: 'Gochat Assistant' }],
  },
  {
    sectionTitle: 'API Reference',
    items: [
      { id: 'doc-track', label: 'Track Request', badge: 'GET' },
      { id: 'doc-track-log', label: 'Track Log', badge: 'GET' },
      { id: 'doc-track-pipe-report', label: 'Track Pipe Report', badge: 'GET' },
    ],
  },
  {
    sectionTitle: 'Reference',
    items: [{ id: 'doc-country-dictionary', label: 'Country Code Dictionary' }],
  },
];

export const WORKBENCH_DOCS_FLAT_CHAPTERS: DocNavItem[] = WORKBENCH_DOCS_NAV.flatMap((s) => s.items);
