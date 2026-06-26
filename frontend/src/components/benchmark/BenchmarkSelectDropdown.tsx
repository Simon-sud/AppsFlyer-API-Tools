import React, { useEffect, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';

import type { ComboboxOption } from './types';

/** Flat option list — one row per button; centering via symmetric py + items-center (AppsFinder pattern). */
export const BenchmarkSelectDropdown: React.FC<{
  label: string;
  options: ComboboxOption[];
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  open?: boolean;
  hideSearch?: boolean;
  compact?: boolean;
}> = ({ label, options, value, onChange, onClose, open = true, hideSearch = false, compact = false }) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const visibleOptions = useMemo(() => {
    if (hideSearch) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [hideSearch, options, query]);

  const pick = (next: string) => {
    onChange(next);
    onClose();
  };

  return (
    <div className="benchmark-select-dropdown__panel rounded-md">
      {!hideSearch ? (
        <div className="benchmark-select-dropdown__search">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}...`}
            className="benchmark-select-dropdown__search-input"
            autoFocus
          />
        </div>
      ) : null}

      <div className="benchmark-select-dropdown__list benchmark-scrollable" role="listbox">
        {visibleOptions.length === 0 ? (
          <div className="benchmark-select-dropdown__empty">No results.</div>
        ) : (
          visibleOptions.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`benchmark-select-dropdown__option${
                  compact ? ' benchmark-select-dropdown__option--compact' : ''
                }${isSelected ? ' is-selected' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  pick(opt.value);
                }}
              >
                <span className="benchmark-select-dropdown__option-text">{opt.label}</span>
                <span className="benchmark-select-dropdown__option-check" aria-hidden>
                  {isSelected ? (
                    <Check className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                  ) : null}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
