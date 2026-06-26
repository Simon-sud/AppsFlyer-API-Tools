import React from 'react';

import { FieldLabel } from './FieldHint';
import type { FieldHelpSpec } from '../../lib/benchmark/fieldHelp';

export const BenchmarkStatTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  help?: FieldHelpSpec;
}> = ({ icon, label, value, help }) => (
  <div className="select-none flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-50 text-slate-500">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <FieldLabel help={help} className="normal-case tracking-normal">
        {label}
      </FieldLabel>
      <div className="truncate text-base font-semibold text-slate-900">{value}</div>
    </div>
  </div>
);
