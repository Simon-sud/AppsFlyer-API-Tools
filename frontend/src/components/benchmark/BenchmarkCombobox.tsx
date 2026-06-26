import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { FieldLabel } from './FieldHint';
import { BenchmarkSelectDropdown } from './BenchmarkSelectDropdown';
import { useBenchmarkComboboxDismiss } from './benchmarkMotion';
import type { FieldHelpSpec } from '../../lib/benchmark/fieldHelp';
import { toTitleCase } from '../../lib/benchmark/display';
import type { ComboboxOption } from './types';

export type { ComboboxOption } from './types';

export const BenchmarkCombobox: React.FC<{
  label: string;
  icon?: React.ReactNode;
  value: string;
  options: ComboboxOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: 'default' | 'compact';
  hideLabel?: boolean;
  buttonClassName?: string;
  hideSearch?: boolean;
  help?: FieldHelpSpec;
  /** App Estimator filters: fit-width trigger, left-aligned text, vertical centering. */
  filterStyle?: boolean;
  /** Field label casing — App Estimator uses title case instead of uppercase. */
  labelCase?: 'uppercase' | 'title';
}> = ({
  label,
  icon,
  value,
  options,
  onChange,
  placeholder,
  disabled,
  size = 'default',
  hideLabel = false,
  buttonClassName,
  hideSearch = false,
  help,
  filterStyle = false,
  labelCase = 'uppercase',
}) => {
  const comboboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const {
    isVisible: dropdownVisible,
    isExpanded: dropdownExpanded,
    toggleDropdown,
    closeDropdown,
  } = useBenchmarkComboboxDismiss(comboboxId);
  const [panelShow, setPanelShow] = useState(false);
  const isCompact = size === 'compact';
  const uniformFilterList = isCompact && hideLabel && hideSearch;

  useEffect(() => {
    if (!dropdownExpanded) {
      setPanelShow(false);
      return undefined;
    }
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPanelShow(true));
    });
    return () => cancelAnimationFrame(id);
  }, [dropdownExpanded]);

  useEffect(() => {
    if (!dropdownVisible) return undefined;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDropdown();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [dropdownVisible, closeDropdown]);

  const selected = options.find((o) => o.value === value);
  const selectedLabel = selected?.label || placeholder || 'Select...';
  const btnSizeClass = isCompact ? 'benchmark-select-button--compact' : 'benchmark-select-button--default';
  const widthClass = hideLabel || filterStyle ? '' : 'w-full';

  return (
    <div
      ref={rootRef}
      data-benchmark-combobox={comboboxId}
      className={`benchmark-select-wrapper ${hideLabel || filterStyle ? 'inline-block' : 'block'} ${
        filterStyle ? 'benchmark-select-wrapper--filter-fit' : ''
      }`}
    >
      {!hideLabel && (
        <FieldLabel
          help={help}
          className={`mb-1 gap-1.5 ${
            labelCase === 'title' ? 'normal-case tracking-normal' : ''
          }`}
        >
          {icon}
          {label}
        </FieldLabel>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) toggleDropdown();
        }}
        disabled={disabled}
        className={`benchmark-select-button ${btnSizeClass} ${widthClass} ${
          dropdownExpanded ? 'is-active' : ''
        } ${filterStyle ? 'benchmark-select-button--filter-fit' : ''} ${buttonClassName || ''}`}
      >
        <span className="benchmark-select-button__label text-left">
          <span className="benchmark-select-button__label-text">{selectedLabel}</span>
        </span>
        <ChevronDown
          className={`benchmark-select-arrow ${
            filterStyle ? 'h-3 w-3' : isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'
          } ${dropdownExpanded ? 'is-open' : ''}`}
        />
      </button>
      {dropdownVisible && (
        <div
          className={`benchmark-select-dropdown ${
            hideLabel ? 'is-inline' : 'is-block'
          } ${panelShow ? 'is-show' : ''}`}
        >
          <BenchmarkSelectDropdown
            label={label}
            options={options}
            value={value}
            onChange={onChange}
            onClose={closeDropdown}
            open={dropdownVisible}
            hideSearch={hideSearch}
            compact={uniformFilterList}
          />
        </div>
      )}
    </div>
  );
};

export const buildComboOptionsWithAll = (
  values: string[],
  label: string,
  allValue: string,
  formatLabel: (v: string) => string = (v) => v
): ComboboxOption[] => [
  { value: allValue, label: `All ${toTitleCase(label)} (${values.length})` },
  ...values.map((v) => ({ value: v, label: formatLabel(v) })),
];
