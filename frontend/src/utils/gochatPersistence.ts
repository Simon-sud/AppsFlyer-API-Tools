import type { Conversation, StoredChatMessage } from '../services/api';
import type { ChatBubble } from '../components/gochatConstants';

/** Business timezone shared with backend AutoPipe / scheduling */
export const GOCHAT_APP_TIMEZONE = 'Asia/Shanghai';

const LAST_CONVERSATION_PREFIX = 'gochat.lastConversationId.';
const HISTORY_OPEN_PREFIX = 'gochat.historyOpen.';

/** Matches chat-sheet open animation duration (index.css) */
export const GOCHAT_SHEET_OPEN_MS = 400;

export function getGochatLastConversationId(userId: string): string | null {
  if (!userId || typeof window === 'undefined') return null;
  const id = localStorage.getItem(`${LAST_CONVERSATION_PREFIX}${userId}`);
  return id?.trim() || null;
}

export function getGochatHistoryOpen(userId: string): boolean {
  if (!userId || typeof window === 'undefined') return false;
  return localStorage.getItem(`${HISTORY_OPEN_PREFIX}${userId}`) === '1';
}

export function setGochatHistoryOpen(userId: string, open: boolean): void {
  if (!userId || typeof window === 'undefined') return;
  localStorage.setItem(`${HISTORY_OPEN_PREFIX}${userId}`, open ? '1' : '0');
}

export function setGochatLastConversationId(userId: string, conversationId: string | null): void {
  if (!userId || typeof window === 'undefined') return;
  const key = `${LAST_CONVERSATION_PREFIX}${userId}`;
  if (!conversationId) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, conversationId);
}

export function storedMessagesToChatBubbles(messages: StoredChatMessage[]): ChatBubble[] {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: message.content,
      status: message.status === 'error' ? 'error' : undefined,
    }));
}

export function deriveTitleFromUserMessage(content: string, maxLen = 48): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'New chat';
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen).trimEnd()}…`;
}

/**
 * Parse API timestamp strings.
 * Naive times without timezone suffix are treated as UTC (legacy data / Go JSON encoding).
 */
export function parseGochatTimestamp(value: string): Date {
  const trimmed = value.trim();
  if (!trimmed) return new Date(NaN);
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return new Date(trimmed);
  }
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  return new Date(`${normalized}Z`);
}

/** Conversation list timestamps displayed in Asia/Shanghai */
export function formatGochatDateTime(value: string): string {
  const date = parseGochatTimestamp(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: GOCHAT_APP_TIMEZONE,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatConversationDisplayTitle(conversation: Conversation): string {
  const title = conversation.title?.trim();
  if (title) return title;
  const lastUser = conversation.last_user_message?.replace(/\s+/g, ' ').trim();
  if (lastUser) return deriveTitleFromUserMessage(lastUser, 42);
  return 'New chat';
}

/** Second line: last user message preview (deduped against title) */
export function formatConversationPreview(conversation: Conversation): string {
  const raw = conversation.last_user_message?.replace(/\s+/g, ' ').trim();
  if (!raw) return '';

  const title = formatConversationDisplayTitle(conversation);
  const normalizedTitle = title.endsWith('…') ? title.slice(0, -1) : title;
  if (raw === title || raw.startsWith(normalizedTitle)) {
    return '';
  }
  return deriveTitleFromUserMessage(raw, 54);
}

/** @deprecated Use formatConversationDisplayTitle */
export function formatConversationTitle(conversation: Conversation): string {
  return formatConversationDisplayTitle(conversation);
}
