import React, { useCallback, useEffect, useState } from 'react';
import { Switch } from './ui/switch';
import { GochatPillSwitch } from './GochatPillSwitch';
import { GochatDiscreteSlider } from './GochatDiscreteSlider';
import { SettingsHelpTip } from './SettingsHelpTip';
import {
  GOCHAT_LANGUAGE_OPTIONS,
  GOCHAT_MAX_TOKEN_OPTIONS,
  GOCHAT_MODEL_OPTIONS,
  GOCHAT_RESPONSE_FORMAT_OPTIONS,
  GOCHAT_TEMPERATURE_OPTIONS,
} from './gochatConstants';
import {
  GOCHAT_PREFERENCES_CHANGED,
  readGochatPreferences,
  saveGochatPreferences,
  snapToGochatTemperature,
  type GochatUserPreferences,
} from './gochatPreferences';

const formatCreativityLabel = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

const formatMaxTokensLabel = (n: number) =>
  n >= 1024 ? `${n / 1024}k` : String(n);

const SettingRow: React.FC<{
  title: string;
  help?: string;
  children: React.ReactNode;
}> = ({ title, help, children }) => (
  <div className="space-y-2.5">
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</span>
      {help ? <SettingsHelpTip text={help} /> : null}
    </div>
    {children}
  </div>
);

const ToggleRow: React.FC<{
  title: string;
  help?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}> = ({ title, help, checked, onCheckedChange }) => (
  <div className="flex items-center justify-between gap-4 py-0.5">
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</span>
      {help ? <SettingsHelpTip text={help} /> : null}
    </div>
    <Switch checked={checked} onCheckedChange={onCheckedChange} />
  </div>
);

const modelPillOptions = GOCHAT_MODEL_OPTIONS.map((o) => ({
  id: o.id,
  label: o.shortLabel,
}));

const formatPillOptions = GOCHAT_RESPONSE_FORMAT_OPTIONS.map((o) => ({
  id: o.id,
  label: o.shortLabel,
}));

export const GochatAiSettings: React.FC = () => {
  const [prefs, setPrefs] = useState<GochatUserPreferences>(() => readGochatPreferences());

  const refresh = useCallback(() => {
    setPrefs(readGochatPreferences());
  }, []);

  useEffect(() => {
    window.addEventListener(GOCHAT_PREFERENCES_CHANGED, refresh);
    return () => window.removeEventListener(GOCHAT_PREFERENCES_CHANGED, refresh);
  }, [refresh]);

  const update = (patch: Partial<GochatUserPreferences>) => {
    setPrefs(saveGochatPreferences(patch));
  };

  return (
    <section className="pb-6 select-none">
      <div className="space-y-6">
        <SettingRow
          title="Model Select"
          help="Choose the MiMo model used for your next messages. API access is managed on the server."
        >
          <GochatPillSwitch
            options={modelPillOptions}
            value={prefs.model}
            onChange={(model) => update({ model: model as GochatUserPreferences['model'] })}
          />
        </SettingRow>

        <div className="space-y-4 rounded-xl border border-slate-200/80 dark:border-slate-700/70 bg-slate-50/50 dark:bg-slate-900/30 px-3.5 py-3.5">
          <ToggleRow
            title="Instant Streaming"
            help="When enabled, text appears as soon as chunks arrive."
            checked={prefs.streamDisplay === 'instant'}
            onCheckedChange={(checked) =>
              update({ streamDisplay: checked ? 'instant' : 'typewriter' })
            }
          />
          <ToggleRow
            title="Show Reasoning"
            help="Display model thinking before the final answer when available."
            checked={prefs.showReasoning}
            onCheckedChange={(checked) => update({ showReasoning: checked })}
          />
        </div>

        <SettingRow title="Reply Language" help="Preferred language for assistant replies.">
          <GochatPillSwitch
            compact
            options={GOCHAT_LANGUAGE_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
            value={prefs.language}
            onChange={(language) => update({ language: language as GochatUserPreferences['language'] })}
          />
        </SettingRow>

        <SettingRow
          title="Creativity"
          help="Higher values produce more varied answers; lower values are more focused."
        >
          <GochatDiscreteSlider
            values={GOCHAT_TEMPERATURE_OPTIONS}
            value={snapToGochatTemperature(prefs.temperature)}
            onChange={(temperature) => update({ temperature })}
            formatLabel={formatCreativityLabel}
          />
        </SettingRow>

        <SettingRow
          title="Max Output Tokens"
          help="Drag to the nearest step; the value below shows the locked selection."
        >
          <GochatDiscreteSlider
            values={GOCHAT_MAX_TOKEN_OPTIONS}
            value={prefs.maxTokens}
            onChange={(maxTokens) => update({ maxTokens })}
            formatLabel={formatMaxTokensLabel}
          />
        </SettingRow>

        <SettingRow
          title="Response Format"
          help="Primary output style for structured segments. Replies may include prose plus fenced code/JSON/CSV blocks; matching blocks render in copy-enabled containers."
        >
          <GochatPillSwitch
            options={formatPillOptions}
            value={prefs.responseFormat}
            onChange={(responseFormat) =>
              update({ responseFormat: responseFormat as GochatUserPreferences['responseFormat'] })
            }
          />
        </SettingRow>
      </div>
    </section>
  );
};

export default GochatAiSettings;
