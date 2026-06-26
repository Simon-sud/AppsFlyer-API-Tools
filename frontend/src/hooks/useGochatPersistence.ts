import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteConversation,
  getConversations,
  getMessages,
  updateConversation,
  type Conversation,
} from '../services/api';
import type { ChatBubble } from '../components/gochatConstants';
import { GOCHAT_MAX_CONVERSATIONS_PER_USER } from '../components/gochatConstants';
import {
  deriveTitleFromUserMessage,
  getGochatHistoryOpen,
  getGochatLastConversationId,
  GOCHAT_SHEET_OPEN_MS,
  setGochatHistoryOpen,
  setGochatLastConversationId,
  storedMessagesToChatBubbles,
} from '../utils/gochatPersistence';

type RefreshOptions = {
  /** Background refresh without showing loading */
  silent?: boolean;
};

type UseGochatPersistenceOptions = {
  userKey: string;
  chatSheetOpen: boolean;
  currentConversationId: string | null;
  chatMessagesLength: number;
  isChatStreaming: boolean;
  onMessagesLoaded: (messages: ChatBubble[]) => void;
  onConversationSelected: (conversationId: string) => void;
  onConversationCleared: () => void;
};

export function useGochatPersistence({
  userKey,
  chatSheetOpen,
  currentConversationId,
  chatMessagesLength,
  isChatStreaming,
  onMessagesLoaded,
  onConversationSelected,
  onConversationCleared,
}: UseGochatPersistenceOptions) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsReady, setConversationsReady] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [historyOpen, setHistoryOpenState] = useState(false);
  const restoreAttemptedRef = useRef(false);
  const loadRequestRef = useRef(0);
  const loadedForUserRef = useRef('');

  const setHistoryOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setHistoryOpenState((prev) => {
        const next = typeof value === 'function' ? value(prev) : value;
        if (userKey) {
          setGochatHistoryOpen(userKey, next);
        }
        return next;
      });
    },
    [userKey]
  );

  const refreshConversations = useCallback(
    async (options?: RefreshOptions): Promise<Conversation[]> => {
      if (!userKey) {
        setConversations([]);
        setConversationsReady(false);
        loadedForUserRef.current = '';
        return [];
      }

      const hasCache = loadedForUserRef.current === userKey;
      const silent = options?.silent ?? false;
      const showLoading = !silent && !hasCache;

      if (showLoading) {
        setConversationsLoading(true);
      }

      try {
        const list = await getConversations();
        setConversations(list);
        loadedForUserRef.current = userKey;
        setConversationsReady(true);
        return list;
      } catch {
        if (!hasCache) {
          setConversations([]);
          setConversationsReady(false);
        }
        return [];
      } finally {
        if (showLoading) {
          setConversationsLoading(false);
        }
      }
    },
    [userKey]
  );

  const loadConversation = useCallback(
    async (conversationId: string) => {
      if (!userKey || !conversationId) return;
      const requestId = ++loadRequestRef.current;
      setMessagesLoading(true);
      try {
        const stored = await getMessages(conversationId);
        if (requestId !== loadRequestRef.current) return;
        onConversationSelected(conversationId);
        setGochatLastConversationId(userKey, conversationId);
        onMessagesLoaded(storedMessagesToChatBubbles(stored));
      } catch {
        if (requestId !== loadRequestRef.current) return;
      } finally {
        if (requestId === loadRequestRef.current) {
          setMessagesLoading(false);
        }
      }
    },
    [userKey, onConversationSelected, onMessagesLoaded]
  );

  const deleteConversationById = useCallback(
    async (conversationId: string): Promise<boolean> => {
      if (!userKey) return false;

      const previousConversations = conversations;
      const wasActive = currentConversationId === conversationId;

      setConversations((prev) => prev.filter((item) => item.id !== conversationId));

      if (wasActive) {
        onConversationCleared();
        setGochatLastConversationId(userKey, null);
      } else {
        const lastId = getGochatLastConversationId(userKey);
        if (lastId === conversationId) {
          const nextLast =
            previousConversations.find((item) => item.id !== conversationId)?.id ?? null;
          setGochatLastConversationId(userKey, nextLast);
        }
      }

      try {
        await deleteConversation(conversationId);
        await refreshConversations({ silent: true });
        return true;
      } catch {
        setConversations(previousConversations);
        if (wasActive) {
          setGochatLastConversationId(userKey, conversationId);
        }
        return false;
      }
    },
    [userKey, conversations, currentConversationId, refreshConversations, onConversationCleared]
  );

  const clearPersistedSession = useCallback(() => {
    loadRequestRef.current += 1;
    setMessagesLoading(false);
    if (userKey) {
      setGochatLastConversationId(userKey, null);
    }
    onConversationCleared();
  }, [userKey, onConversationCleared]);

  const notifyConversationStarted = useCallback(
    async (conversationId: string) => {
      if (!userKey || !conversationId) return;
      setGochatLastConversationId(userKey, conversationId);
      await refreshConversations({ silent: true });
    },
    [userKey, refreshConversations]
  );

  const notifyConversationCompleted = useCallback(
    async (conversationId: string, firstUserMessage?: string) => {
      if (!userKey || !conversationId) return;
      setGochatLastConversationId(userKey, conversationId);
      const list = await refreshConversations({ silent: true });
      const conversation = list.find((item) => item.id === conversationId);
      if (conversation && !conversation.title?.trim() && firstUserMessage?.trim()) {
        const title = deriveTitleFromUserMessage(firstUserMessage);
        try {
          await updateConversation(conversationId, { title });
          await refreshConversations({ silent: true });
        } catch {
          /* ignore */
        }
      }
    },
    [userKey, refreshConversations]
  );

  const atConversationLimit =
    conversations.length >= GOCHAT_MAX_CONVERSATIONS_PER_USER;

  // Prefetch after login; restore history sidebar open state
  useEffect(() => {
    if (!userKey) {
      setConversations([]);
      setConversationsReady(false);
      setHistoryOpenState(false);
      restoreAttemptedRef.current = false;
      loadedForUserRef.current = '';
      return;
    }

    setHistoryOpenState(getGochatHistoryOpen(userKey));

    if (loadedForUserRef.current === userKey) {
      return;
    }

    void refreshConversations({ silent: true });
  }, [userKey, refreshConversations]);

  // On Gochat open: silent refresh if cached; otherwise show loading after sheet animation
  useEffect(() => {
    if (!chatSheetOpen || !userKey) {
      restoreAttemptedRef.current = false;
      return;
    }

    if (loadedForUserRef.current === userKey) {
      void refreshConversations({ silent: true });
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshConversations({ silent: false });
    }, GOCHAT_SHEET_OPEN_MS);

    return () => window.clearTimeout(timer);
  }, [chatSheetOpen, userKey, refreshConversations]);

  useEffect(() => {
    if (!chatSheetOpen || !userKey || restoreAttemptedRef.current) return;
    if (chatMessagesLength > 0 || isChatStreaming || currentConversationId) {
      restoreAttemptedRef.current = true;
      return;
    }
    if (conversationsLoading) return;

    restoreAttemptedRef.current = true;
    const lastId = getGochatLastConversationId(userKey);
    if (!lastId) return;
    const exists = conversations.some((item) => item.id === lastId);
    if (exists) {
      void loadConversation(lastId);
    } else {
      setGochatLastConversationId(userKey, null);
    }
  }, [
    chatSheetOpen,
    userKey,
    chatMessagesLength,
    isChatStreaming,
    currentConversationId,
    conversations,
    conversationsLoading,
    loadConversation,
  ]);

  const showConversationsLoading = conversationsLoading && conversations.length === 0;

  return {
    conversations,
    conversationsLoading: showConversationsLoading,
    conversationsReady,
    messagesLoading,
    historyOpen,
    setHistoryOpen,
    refreshConversations,
    loadConversation,
    deleteConversationById,
    clearPersistedSession,
    notifyConversationStarted,
    notifyConversationCompleted,
    atConversationLimit,
  };
};
