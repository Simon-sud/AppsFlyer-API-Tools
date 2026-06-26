import {
  GOCHAT_DEFAULT_LANGUAGE,
  GOCHAT_DEFAULT_MAX_TOKENS,
  GOCHAT_DEFAULT_MODEL,
  GOCHAT_DEFAULT_RESPONSE_FORMAT,
  GOCHAT_DEFAULT_STREAM_DISPLAY,
  GOCHAT_DEFAULT_TEMPERATURE,
  GOCHAT_LANGUAGE_OPTIONS,
  GOCHAT_MAX_TOKEN_OPTIONS,
  GOCHAT_MODEL_OPTIONS,
  GOCHAT_RESPONSE_FORMAT_OPTIONS,
  GOCHAT_STREAM_DISPLAY_OPTIONS,
  GOCHAT_TEMPERATURE_OPTIONS,
  type ChatLanguage,
  type GochatModelId,
  type GochatStreamDisplay,
  type ResponseFormat,
} from './gochatConstants';

export { buildGochatSystemInstruction } from './gochatResponseFormat';

export const GOCHAT_PREFERENCES_CHANGED = 'gochatPreferencesChanged';

const STORAGE_KEYS = {
  model: 'gochat.model',
  maxTokens: 'gochat.maxTokens',
  temperature: 'gochat.temperature',
  language: 'gochat.language',
  responseFormat: 'gochat.responseFormat',
  streamDisplay: 'gochat.streamDisplay',
  showReasoning: 'gochat.showReasoning',
} as const;

export interface GochatUserPreferences {
  model: GochatModelId;
  maxTokens: number; // One of GOCHAT_MAX_TOKEN_OPTIONS
  temperature: number;
  language: ChatLanguage;
  responseFormat: ResponseFormat;
  streamDisplay: GochatStreamDisplay;
  showReasoning: boolean;
}

export function readGochatPreferences(): GochatUserPreferences {
  if (typeof window === 'undefined') {
    return getDefaultGochatPreferences();
  }

  let maxTokens: number = GOCHAT_DEFAULT_MAX_TOKENS;
  const storedMaxTokens = Number(localStorage.getItem(STORAGE_KEYS.maxTokens) || `${GOCHAT_DEFAULT_MAX_TOKENS}`);
  if (!Number.isNaN(storedMaxTokens)) {
    maxTokens = snapToGochatMaxTokens(storedMaxTokens);
  }

  let temperature = GOCHAT_DEFAULT_TEMPERATURE;
  const storedTemperature = Number(localStorage.getItem(STORAGE_KEYS.temperature) || `${GOCHAT_DEFAULT_TEMPERATURE}`);
  if (!Number.isNaN(storedTemperature)) {
    temperature = snapToGochatTemperature(storedTemperature);
  }

  const storedLanguage = (localStorage.getItem(STORAGE_KEYS.language) || '').toLowerCase();
  const languageOption = GOCHAT_LANGUAGE_OPTIONS.find((option) => option.id === storedLanguage);
  const language: ChatLanguage = languageOption?.id ?? GOCHAT_DEFAULT_LANGUAGE;

  const storedFormat = (localStorage.getItem(STORAGE_KEYS.responseFormat) || '').toLowerCase();
  const formatOption = GOCHAT_RESPONSE_FORMAT_OPTIONS.find((option) => option.id === storedFormat);
  const responseFormat: ResponseFormat = formatOption?.id ?? GOCHAT_DEFAULT_RESPONSE_FORMAT;

  let streamDisplay: GochatStreamDisplay = GOCHAT_DEFAULT_STREAM_DISPLAY;
  const storedStreamDisplay = localStorage.getItem(STORAGE_KEYS.streamDisplay) as GochatStreamDisplay | null;
  if (storedStreamDisplay && GOCHAT_STREAM_DISPLAY_OPTIONS.some((option) => option.id === storedStreamDisplay)) {
    streamDisplay = storedStreamDisplay;
  }

  const showReasoning = localStorage.getItem(STORAGE_KEYS.showReasoning) === 'true';

  const storedModel = localStorage.getItem(STORAGE_KEYS.model) || '';
  const modelOption = GOCHAT_MODEL_OPTIONS.find((option) => option.id === storedModel);
  const model: GochatModelId = modelOption?.id ?? GOCHAT_DEFAULT_MODEL;

  return {
    model,
    maxTokens,
    temperature,
    language,
    responseFormat,
    streamDisplay,
    showReasoning,
  };
}

export function getDefaultGochatPreferences(): GochatUserPreferences {
  return {
    model: GOCHAT_DEFAULT_MODEL,
    maxTokens: GOCHAT_DEFAULT_MAX_TOKENS,
    temperature: GOCHAT_DEFAULT_TEMPERATURE,
    language: GOCHAT_DEFAULT_LANGUAGE,
    responseFormat: GOCHAT_DEFAULT_RESPONSE_FORMAT,
    streamDisplay: GOCHAT_DEFAULT_STREAM_DISPLAY,
    showReasoning: false,
  };
}

export function snapToGochatTemperature(value: number): number {
  return GOCHAT_TEMPERATURE_OPTIONS.reduce((best, cur) =>
    Math.abs(cur - value) < Math.abs(best - value) ? cur : best
  );
}

export function snapToGochatMaxTokens(value: number): (typeof GOCHAT_MAX_TOKEN_OPTIONS)[number] {
  const options = GOCHAT_MAX_TOKEN_OPTIONS;
  if ((options as readonly number[]).includes(value)) {
    return value as (typeof GOCHAT_MAX_TOKEN_OPTIONS)[number];
  }
  return options.reduce((best, cur) =>
    Math.abs(cur - value) < Math.abs(best - value) ? cur : best
  );
}

export function normalizeGochatTemperature(uiValue: number): number {
  const snapped = snapToGochatTemperature(uiValue);
  return Math.min(1, Math.max(0, Number((snapped / 10).toFixed(2))));
}

export function saveGochatPreferences(patch: Partial<GochatUserPreferences>): GochatUserPreferences {
  if (typeof window === 'undefined') {
    return getDefaultGochatPreferences();
  }

  const current = readGochatPreferences();
  const next: GochatUserPreferences = { ...current, ...patch };

  localStorage.setItem(STORAGE_KEYS.model, next.model);
  localStorage.setItem(STORAGE_KEYS.maxTokens, String(next.maxTokens));
  localStorage.setItem(STORAGE_KEYS.temperature, String(next.temperature));
  localStorage.setItem(STORAGE_KEYS.language, next.language);
  localStorage.setItem(STORAGE_KEYS.responseFormat, next.responseFormat);
  localStorage.setItem(STORAGE_KEYS.streamDisplay, next.streamDisplay);
  localStorage.setItem(STORAGE_KEYS.showReasoning, next.showReasoning ? 'true' : 'false');

  window.dispatchEvent(new CustomEvent(GOCHAT_PREFERENCES_CHANGED));
  return next;
}

