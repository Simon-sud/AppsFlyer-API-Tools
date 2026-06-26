import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import {
  COUNTRY_CODE_DICTIONARY,
  type CountryCodeDictionaryRow,
} from '../lib/countryCodeDictionaryData';

function formatDevices(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

type SortKey = keyof Pick<
  CountryCodeDictionaryRow,
  'code' | 'nameEn' | 'nameZh' | 'iosAppSharePct' | 'androidAppSharePct' | 'estimatedMobileDevices'
>;

type SortDir = 'asc' | 'desc';

type ColumnAlign = 'left' | 'center' | 'right';

const COLUMNS: ReadonlyArray<{
  key: SortKey;
  label: string;
  align: ColumnAlign;
}> = [
  { key: 'code', label: 'Code', align: 'left' },
  { key: 'nameEn', label: 'Country (EN)', align: 'center' },
  { key: 'nameZh', label: 'Country (ZH)', align: 'center' },
  { key: 'iosAppSharePct', label: 'iOS app %', align: 'center' },
  { key: 'androidAppSharePct', label: 'Android app %', align: 'center' },
  { key: 'estimatedMobileDevices', label: 'Est. mobile devices', align: 'right' },
];

function cellAlignClass(align: ColumnAlign): string {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

function sortButtonClass(align: ColumnAlign): string {
  const base =
    'inline-flex items-center gap-0.5 hover:text-slate-800 dark:hover:text-slate-200';
  if (align === 'center') return `${base} w-full justify-center`;
  if (align === 'right') return `${base} ml-auto`;
  return base;
}

export const CountryCodeDictionaryTable: React.FC = () => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'nameEn',
    dir: 'asc',
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? COUNTRY_CODE_DICTIONARY.filter(
          (r) =>
            r.code.toLowerCase().includes(q) ||
            r.nameEn.toLowerCase().includes(q) ||
            r.nameZh.includes(search.trim())
        )
      : COUNTRY_CODE_DICTIONARY;

    const sorted = [...list].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [search, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    );
  };

  const sortIndicator = (key: SortKey) => {
    if (sort.key !== key) return '';
    return sort.dir === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by code, English or Chinese name…"
          className="h-8 w-full rounded-md border border-slate-300 bg-white pl-8 pr-2 text-xs text-slate-700 shadow-sm hover:border-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
        />
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
        <div className="benchmark-scrollable max-h-[min(70vh,640px)] overflow-auto bg-white dark:bg-slate-900/40">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_rgb(226,232,240)] dark:bg-slate-800 dark:shadow-[0_1px_0_0_rgb(51,65,85)]">
              <tr>
                {COLUMNS.map(({ key, label, align }) => (
                  <th
                    key={key}
                    className={`whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${cellAlignClass(align)}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className={sortButtonClass(align)}
                    >
                      {label}
                      <span className="font-mono text-[10px] text-slate-400">{sortIndicator(key)}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900/40">
              {filtered.map((row) => (
                <tr
                  key={row.code}
                  className="border-t border-slate-100 hover:bg-sky-50/30 dark:border-slate-700/80 dark:hover:bg-slate-800/50"
                >
                  {COLUMNS.map(({ key, align }) => {
                    const mono = key !== 'nameEn' && key !== 'nameZh';
                    const value =
                      key === 'iosAppSharePct' || key === 'androidAppSharePct'
                        ? `${row[key].toFixed(1)}%`
                        : key === 'estimatedMobileDevices'
                          ? formatDevices(row.estimatedMobileDevices)
                          : row[key];
                    return (
                      <td
                        key={key}
                        className={`whitespace-nowrap px-3 py-2 ${cellAlignClass(align)} ${
                          mono ? 'font-mono tabular-nums' : ''
                        } ${
                          key === 'code'
                            ? 'text-xs font-semibold text-slate-800 dark:text-slate-100'
                            : key === 'nameZh'
                              ? 'text-slate-700 dark:text-slate-300'
                              : key === 'estimatedMobileDevices'
                                ? 'text-slate-900 dark:text-slate-100'
                                : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                    No countries match your search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-slate-700">
          Showing {filtered.length.toLocaleString()} / {COUNTRY_CODE_DICTIONARY.length.toLocaleString()}{' '}
          entries. iOS / Android shares and device counts are planning estimates (not live store telemetry).
        </div>
      </div>
    </div>
  );
};
