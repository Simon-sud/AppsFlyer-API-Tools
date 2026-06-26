import React, { useMemo } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { cn } from '../lib/utils';

type GochatCsvFileCardProps = {
  filename: string;
  csvText: string;
  rowCount?: number;
  className?: string;
};

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function triggerCsvDownload(filename: string, csvText: string) {
  const blob = new Blob(['\uFEFF', csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const GochatCsvFileCard: React.FC<GochatCsvFileCardProps> = ({
  filename,
  csvText,
  rowCount,
  className,
}) => {
  const byteSize = useMemo(() => new Blob([csvText]).size, [csvText]);
  const safeName = filename.trim() || 'export.csv';

  return (
    <div
      className={cn(
        'not-prose my-1.5 overflow-hidden rounded-xl border shadow-sm select-none',
        'border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/50',
        'dark:border-emerald-800/40 dark:from-emerald-950/30 dark:via-slate-900/80 dark:to-teal-950/20',
        className
      )}
    >
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            'bg-emerald-100/90 dark:bg-emerald-900/40'
          )}
        >
          <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{safeName}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            CSV
            {typeof rowCount === 'number' ? ` · ${rowCount} row${rowCount === 1 ? '' : 's'}` : ''}
            {` · ${formatByteSize(byteSize)}`}
          </p>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            triggerCsvDownload(safeName, csvText);
          }}
          className={cn(
            'gochat-csv-download-btn inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2',
            'text-xs font-semibold text-white',
            'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-1',
            'transition-colors duration-150'
          )}
          aria-label={`Download ${safeName}`}
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Download
        </button>
      </div>
    </div>
  );
};

export default GochatCsvFileCard;
