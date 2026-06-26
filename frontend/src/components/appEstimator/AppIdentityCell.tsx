import React, { useMemo, useState } from 'react';
import { Smartphone } from 'lucide-react';

export type AppIdentityFields = {
  platform?: string;
  appName?: string;
  package?: string;
  bundle?: string;
  appId?: string;
  iconUrl?: string;
  storeUrl?: string;
  sourceUrl?: string;
};

const isInternalTrainId = (appId?: string, pkg?: string, bundle?: string): boolean =>
  Boolean(appId && /^\d{10,}$/.test(appId) && (pkg || bundle));

export const appDisplayTitle = (row: AppIdentityFields): string => {
  const name = row.appName?.trim();
  if (name) return name;
  const pkg = row.package?.trim();
  if (pkg) return pkg;
  const bundle = row.bundle?.trim();
  if (bundle) return bundle;
  const appId = row.appId?.trim();
  if (appId && !isInternalTrainId(appId, pkg, bundle)) return appId;
  return '—';
};

export const appDisplaySubtitle = (row: AppIdentityFields): string | null => {
  const pkg = row.package?.trim();
  const bundle = row.bundle?.trim();
  const title = appDisplayTitle(row);
  if (pkg && pkg !== title) return pkg;
  if (bundle && bundle !== title) return bundle;
  return null;
};

export const AppIdentityCell: React.FC<
  AppIdentityFields & { align?: 'left' | 'center'; compact?: boolean }
> = ({ align = 'left', compact = false, ...row }) => {
  const [iconFailed, setIconFailed] = useState(false);
  const title = appDisplayTitle(row);
  const subtitle = appDisplaySubtitle(row);
  const href = row.storeUrl || row.sourceUrl || undefined;
  const iconSrc = row.iconUrl && !iconFailed ? row.iconUrl : null;
  const initial = useMemo(() => (title !== '—' ? title.charAt(0).toUpperCase() : '?'), [title]);
  const justify = align === 'center' ? 'justify-center' : 'justify-start';
  const size = compact ? 'h-7 w-7' : 'h-8 w-8';

  const content = (
    <div className={`flex min-w-0 items-center gap-2.5 ${justify}`}>
      <div
        className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500`}
      >
        {iconSrc ? (
          <img
            src={iconSrc}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setIconFailed(true)}
          />
        ) : initial !== '?' ? (
          initial
        ) : (
          <Smartphone className="h-3.5 w-3.5" aria-hidden />
        )}
      </div>
      <div className={`min-w-0 ${align === 'center' ? 'text-center' : 'text-left'}`}>
        <div className={`truncate font-medium text-slate-900 ${compact ? 'text-xs' : 'text-sm'}`}>
          {title}
        </div>
        {subtitle ? (
          <div className="truncate font-mono text-[10px] text-slate-500">{subtitle}</div>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="block min-w-0 hover:opacity-90"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </a>
    );
  }

  return <div className="min-w-0">{content}</div>;
};
