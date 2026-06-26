/** GoChat / Mix sidebar constants and types (decoupled from Settings drawer UI) */

/** Max conversations per user (matches backend GochatMaxConversationsPerUser) */
export const GOCHAT_MAX_CONVERSATIONS_PER_USER = 20;

/** MiMo configured on backend; frontend only sets default model/provider for requests */
export const GOCHAT_DEFAULT_PROVIDER = 'openai';
export const GOCHAT_DEFAULT_MODEL = 'mimo-v2.5-pro';

/** MiMo Token Plan models (passed through normalizeGochatModel) */
export const GOCHAT_MODEL_OPTIONS = [
  { id: 'mimo-v2.5-pro', label: 'MiMo v2.5 Pro', shortLabel: 'v2.5 Pro' },
  { id: 'mimo-v2.5', label: 'MiMo v2.5', shortLabel: 'v2.5' },
  { id: 'mimo-v2-pro', label: 'MiMo v2 Pro', shortLabel: 'v2 Pro' },
  { id: 'mimo-v2-omni', label: 'MiMo v2 Omni', shortLabel: 'v2 Omni' },
] as const;

export type GochatModelId = (typeof GOCHAT_MODEL_OPTIONS)[number]['id'];

/** Max output token tiers (aligned with MiMo max_tokens) */
export const GOCHAT_MAX_TOKEN_OPTIONS = [1024, 2048, 4096, 8192, 16384, 32768] as const;
export const GOCHAT_DEFAULT_MAX_TOKENS =
  GOCHAT_MAX_TOKEN_OPTIONS[GOCHAT_MAX_TOKEN_OPTIONS.length - 1];

export const GOCHAT_LANGUAGE_OPTIONS = [
  { id: 'en', label: 'English' },
  { id: 'zh', label: 'Chinese' },
] as const;

export type ChatLanguage = (typeof GOCHAT_LANGUAGE_OPTIONS)[number]['id'];
export const GOCHAT_DEFAULT_LANGUAGE: ChatLanguage = 'zh';

/** Creativity discrete scale (0–10, step 0.5) */
export const GOCHAT_TEMPERATURE_OPTIONS = Array.from(
  { length: 21 },
  (_, i) => Number((i * 0.5).toFixed(1))
) as readonly number[];

export const GOCHAT_TEMPERATURE_MIN = GOCHAT_TEMPERATURE_OPTIONS[0];
export const GOCHAT_TEMPERATURE_MAX = GOCHAT_TEMPERATURE_OPTIONS[GOCHAT_TEMPERATURE_OPTIONS.length - 1];
export const GOCHAT_TEMPERATURE_STEP = 0.5;
export const GOCHAT_DEFAULT_TEMPERATURE = 8;

/** @deprecated Kept for compatibility; new animation uses CPS + advanceStreamingDisplay */
export const GOCHAT_TYPEWRITER_INTERVAL = 24;
/** @deprecated Kept for compatibility; new animation uses CPS + advanceStreamingDisplay */
export const GOCHAT_TYPEWRITER_MAX_CHUNK = 4;

/** Typewriter base/catch-up speed (chars/sec) */
export const GOCHAT_TYPEWRITER_BASE_CPS = 56;
export const GOCHAT_TYPEWRITER_MAX_CPS = 340;
/** Typewriter UI tick interval (ms), ~60fps */
export const GOCHAT_TYPEWRITER_UI_MIN_MS = 16;

/** Reasoning stream display speed (chars/sec) */
export const GOCHAT_REASONING_BASE_CPS = 160;
export const GOCHAT_REASONING_MAX_CPS = 520;
export const GOCHAT_REASONING_UI_MIN_MS = 24;

/** Advance displayed chars by backlog (time-driven, smooth) */
export function advanceStreamingDisplay(
  current: number,
  target: number,
  elapsedMs: number,
  baseCps: number,
  maxCps: number
): number {
  if (current >= target || elapsedMs <= 0) return current;
  const backlog = target - current;
  const ramp = Math.min(1, backlog / 160);
  const cps = baseCps + (maxCps - baseCps) * ramp * ramp;
  const add = Math.max(1, Math.round((elapsedMs / 1000) * cps));
  return Math.min(current + add, target);
}

export const GOCHAT_STREAM_DISPLAY_OPTIONS = [
  { id: 'instant', label: 'Instant' },
  { id: 'typewriter', label: 'Typewriter' },
] as const;

export type GochatStreamDisplay = (typeof GOCHAT_STREAM_DISPLAY_OPTIONS)[number]['id'];
export const GOCHAT_DEFAULT_STREAM_DISPLAY: GochatStreamDisplay = 'instant';

export const GOCHAT_RESPONSE_FORMAT_OPTIONS = [
  { id: 'markdown', label: 'Markdown', shortLabel: 'Markdown', description: 'Rich text with formatting' },
  { id: 'plain', label: 'Plain Text', shortLabel: 'Plain', description: 'Simple text only' },
  { id: 'json', label: 'JSON', shortLabel: 'JSON', description: 'Structured JSON format' },
  { id: 'csv', label: 'CSV', shortLabel: 'CSV', description: 'Comma-separated values format' },
  { id: 'code', label: 'Code', shortLabel: 'Code', description: 'Code-focused responses' },
] as const;

export type ResponseFormat = (typeof GOCHAT_RESPONSE_FORMAT_OPTIONS)[number]['id'];
export const GOCHAT_DEFAULT_RESPONSE_FORMAT: ResponseFormat = 'plain';

export type ChatBubble = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  status?: 'loading' | 'error';
  /** Response format locked when this assistant message was generated */
  responseFormat?: ResponseFormat;
  /** MiMo reasoning_content chain (when Show Reasoning is on) */
  reasoning?: string;
  /** Whether final reply phase started (collapse reasoning block) */
  reasoningComplete?: boolean;
};
