import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TeamSwitcher } from './TeamSwitcher';
import { UserMenu } from './UserMenu';
import { SidebarToggleButton } from './SidebarToggleButton';
import { ChatMessageContent } from './ChatContentRenderer';
import { GochatScrollArea } from './GochatScrollArea';
import { 
  BsFiletypeRaw,
  BsClipboardData,
  BsDatabaseUp,
  BsAppIndicator,
  BsSearch,
  BsLink45Deg,
  BsClock,
  BsArrowRight,
  BsSun,
  BsMoon,
  BsHouseGear,
  BsHexagonHalf,
  BsSpeedometer2,
  BsBarChartLine,
} from 'react-icons/bs';
import { RiSettings6Line, RiShakeHandsLine } from 'react-icons/ri';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from './ui/command';

import { useUser } from '../contexts/UserContext';
import { useAccount } from '../contexts/AccountContext';
import { useAuth } from '../contexts/AuthContext';
import {
  sendChatMessageStream,
  type ChatMessage,
} from '../services/api';
import { useGochatPersistence } from '../hooks/useGochatPersistence';
import { GochatHistoryPanel } from './GochatHistoryPanel';
import {
  type ChatBubble,
  type ResponseFormat,
  GOCHAT_DEFAULT_PROVIDER,
  advanceStreamingDisplay,
  GOCHAT_REASONING_BASE_CPS,
  GOCHAT_REASONING_MAX_CPS,
  GOCHAT_REASONING_UI_MIN_MS,
  GOCHAT_TYPEWRITER_BASE_CPS,
  GOCHAT_TYPEWRITER_MAX_CPS,
  GOCHAT_TYPEWRITER_UI_MIN_MS,
  GOCHAT_MAX_CONVERSATIONS_PER_USER,
} from './gochatConstants';
import { GochatAiSettings } from './GochatAiSettings';
import { SettingsDrawerScrollTitle, useSettingsDrawerSection } from './SettingsDrawerScrollTitle';
import { SettingsHelpTip } from './SettingsHelpTip';
import {
  GOCHAT_PREFERENCES_CHANGED,
  buildGochatSystemInstruction,
  normalizeGochatTemperature,
  readGochatPreferences,
} from './gochatPreferences';
import { axiosInstance } from '../services/api';
import { readAutoRefreshSliderIndex, writeAutoRefreshRule } from '../utils/constants';
import { cn } from '../lib/utils';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerDescription,
} from './ui/drawer';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { Spinner } from './ui/spinner';
import {
  WORKBENCH_DOCS_NAV,
  WORKBENCH_DOCS_FLAT_CHAPTERS,
  WORKBENCH_DOCS_PATH,
} from '../docs/workbenchDocsNav';
// Removed unused imports: Sparkles, RotateCcw
import { Grid3x3, BarChart3, Send, PauseCircle, X as XIcon, Maximize2, Minimize2, MessageSquarePlus, Check, Trash2, GripVertical, Save, PanelLeft } from 'lucide-react';
import { MdOutlineWifi } from 'react-icons/md';

interface LayoutProps {
  children: React.ReactNode;
}

function isWorkbenchDocsPage(pathname: string): boolean {
  return pathname === WORKBENCH_DOCS_PATH || pathname === '/docs/dispatch-access-center';
}

function getDocsNavigation() {
  return {
    sections: WORKBENCH_DOCS_NAV,
    chapters: WORKBENCH_DOCS_FLAT_CHAPTERS,
  };
}

/** Matches `--docs-toc-gap` on `.docs-layout-shell`; shared by TOC click and scroll spy */
function getDocsTocGapPx(scrollRoot: HTMLElement): number {
  try {
    const raw = getComputedStyle(scrollRoot).getPropertyValue('--docs-toc-gap').trim();
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  } catch {
    /* ignore */
  }
  return 16;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [chatSheetOpen, setChatSheetOpen] = useState(false);
  const [chatSheetExpanded, setChatSheetExpanded] = useState(false);
  // Chat states
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatBubble[]>([]);
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const isChatStreamingRef = useRef(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatMessagesContainerRef = useRef<HTMLDivElement | null>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const chatUserInteractingRef = useRef(false);
  const chatInteractionTimerRef = useRef<number | null>(null);
  const typewriterLastUIUpdateRef = useRef(0);
  const streamingUILastPatchRef = useRef(0);
  const pendingStreamingFlushRef = useRef(false);
  const STREAMING_UI_MIN_MS = 180;
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatCompositionRef = useRef(false);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatSingleLineHeightRef = useRef(46);
  const [chatInputExpanded, setChatInputExpanded] = useState(false);
  const resizeChatInput = useCallback(() => {
    const el = chatInputRef.current;
    if (!el) return;
    const singleLine = chatSingleLineHeightRef.current;
    el.style.height = `${singleLine}px`;
    const needsGrow = el.value.includes('\n') || el.scrollHeight > singleLine + 2;
    if (needsGrow) {
      el.style.height = `${el.scrollHeight}px`;
    }
    setChatInputExpanded(needsGrow);
  }, []);

  useEffect(() => {
    const el = chatInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    chatSingleLineHeightRef.current = el.scrollHeight;
    el.style.height = `${chatSingleLineHeightRef.current}px`;
  }, []);

  useEffect(() => {
    resizeChatInput();
  }, [chatInput, resizeChatInput]);
  const streamingContentRef = useRef<string>('');
  const streamingReasoningRef = useRef<string>('');
  const streamingUpdateRef = useRef<number | null>(null);
  const streamingAssistantIndexRef = useRef<number>(-1);
  const streamingResponseFormatRef = useRef<ResponseFormat | null>(null);
  const [gochatDisplayFormat, setGochatDisplayFormat] = useState<ResponseFormat>(
    () => readGochatPreferences().responseFormat
  );
  const displayedLengthRef = useRef<number>(0);
  const displayedReasoningLengthRef = useRef<number>(0);
  const typewriterTimerRef = useRef<number | null>(null);
  const typewriterLastTimestampRef = useRef<number>(0);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const settingsScrollRef = useRef<HTMLDivElement | null>(null);
  const normalSectionStartRef = useRef<HTMLDivElement | null>(null);
  const accountSectionStartRef = useRef<HTMLDivElement | null>(null);
  const {
    section: settingsDrawerSection,
    onScroll: onSettingsDrawerScroll,
  } = useSettingsDrawerSection({
    open: settingsDrawerOpen,
    scrollRef: settingsScrollRef,
    normalStartRef: normalSectionStartRef,
    accountStartRef: accountSectionStartRef,
  });
  const [aggregateModeEnabled, setAggregateModeEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('appsflyerTokenValidate');
      if (saved === 'OFF') return false;
      if (saved == null) {
        localStorage.setItem('appsflyerTokenValidate', 'ON');
      }
      return true;
    }
    return true;
  });
  // PingStatus state
  const [pingStatus, setPingStatus] = useState<{
    status: 'good' | 'warning' | 'poor';
    pingTime: number;
  }>({ status: 'good', pingTime: 0 });
  const [isPinging, setIsPinging] = useState(false);
  const lastPingTimeRef = useRef(0);
  const COOLDOWN_TIME = 3000; // 3s cooldown
  const isPingingRef = useRef(false); // Tracks in-flight ping to avoid duplicate calls
  const pingAbortControllerRef = useRef<AbortController | null>(null); // Aborts duplicate requests
  const hasInitialPingRef = useRef(false);
  const layoutContainerRef = useRef<HTMLDivElement>(null); // Layout container ref
  const mainContentRef = useRef<HTMLElement>(null); // Main content area ref
  const docsMainPaneRef = useRef<HTMLDivElement>(null); // Docs page main scroll container
  const docScrollSpyLockRef = useRef(false); // Pause scroll spy during smooth TOC scroll to avoid highlight flicker
  const docScrollChapterTimerRef = useRef<number | null>(null);
  
  // Global flag: run initial ping once app-wide (even if Layout remounts)
  // Stored on window for cross-instance sharing
  if (typeof window !== 'undefined' && !(window as any).__pingInitialized) {
    (window as any).__pingInitialized = false;
  } // Tracks whether initial ping has run

  // PingStatus check
  const checkPing = useCallback(async () => {
    const now = Date.now();
    // Skip if still in cooldown
    if (now - lastPingTimeRef.current < COOLDOWN_TIME) {
      return;
    }
    
    // If pinging, abort prior request and skip
    if (isPingingRef.current) {
      if (pingAbortControllerRef.current) {
        pingAbortControllerRef.current.abort();
      }
      return;
    }

    try {
      // Create new AbortController
      const abortController = new AbortController();
      pingAbortControllerRef.current = abortController;
      
      isPingingRef.current = true;
      setIsPinging(true);
      const config: any = {
        signal: abortController.signal
      };
      const response = await axiosInstance.get('/api/ping', config) as {
        data: {
          success: boolean;
          pingTime: number;
          status: 'good' | 'warning' | 'poor';
          error?: string;
        };
      };

      // Set ping state from response
      if (response.data.success) {
        // pingTime 0 may be bad data; use default and retry
        const pingTime = response.data.pingTime || 100;
        setPingStatus({
          status: response.data.status,
          pingTime: pingTime
        });
      } else {
        // 401 means network OK, auth required
        if (response.data.error?.includes('401')) {
          setPingStatus({
            status: 'good',
            pingTime: 100  // Reasonable default
          });
        } else {
          setPingStatus({
            status: 'poor',
            pingTime: 3000
          });
        }
      }
    } catch (error: any) {
      // Ignore aborted requests
      if (error.name === 'AbortError' || error.name === 'CanceledError') {
        return;
      }
      // Handle network/other errors
      if (error.response) {
        // Non-200 response
        if (error.response.status === 401) {
          // 401: network OK, auth required
          setPingStatus({
            status: 'good',
            pingTime: 100
          });
        } else {
          setPingStatus({
            status: 'poor',
            pingTime: 3000
          });
        }
      } else if (error.request) {
        // Request sent but no response (network error)
        // Initial ping (pingTime 0): let retry handle it
        // Otherwise keep current state
        if (pingStatus.pingTime === 0) {
          // Initial ping failed: keep 0 for fast retry
          // Retry triggers immediately
        }
        // Otherwise keep current state
      } else {
        // Other errors: keep current state
      }
    } finally {
      isPingingRef.current = false;
      setIsPinging(false);
      lastPingTimeRef.current = now;
      pingAbortControllerRef.current = null;
    }
  }, [pingStatus.pingTime]);

  // Run once on page load
  const checkPingRef = useRef(checkPing);
  
  useEffect(() => {
    checkPingRef.current = checkPing;
  }, [checkPing]);
  
  useEffect(() => {
    // Detect page refresh
    const isPageRefresh = () => {
      // Use performance API for refresh detection
      if (typeof window !== 'undefined' && window.performance) {
        const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navigation && navigation.type === 'reload') {
          return true;
        }
      }
      return false;
    };

    const wasRefreshed = isPageRefresh();

    // On refresh, clear global flag and cooldown
    if (wasRefreshed) {
      if (typeof window !== 'undefined') {
        (window as any).__pingInitialized = false;
      }
      hasInitialPingRef.current = false;
      lastPingTimeRef.current = 0; // Reset cooldown for immediate run
    }

    // Global flag: one initial ping
    const globalPingInitialized = typeof window !== 'undefined' && (window as any).__pingInitialized;
    
    // Run once on first mount if not initialized
    if (!globalPingInitialized && !hasInitialPingRef.current) {
      hasInitialPingRef.current = true;
      if (typeof window !== 'undefined') {
        (window as any).__pingInitialized = true;
      }
      // Run immediately after refresh
      const delay = wasRefreshed ? 0 : 100;
      setTimeout(() => {
        checkPingRef.current();
      }, delay);
    }
  }, []); // Run once on mount

  // Periodic ping every 30s
  useEffect(() => {
    // Shorter interval when pingTime is 0
    const interval = pingStatus.pingTime === 0 ? 2000 : 30000; // 2s if pingTime 0, else 30s
    
    const autoRefreshInterval = setInterval(() => {
      // pingTime 0 and idle: refresh now
      if (pingStatus.pingTime === 0 && !isPinging) {
        checkPingRef.current();
      } else if (!isPinging) {
        // Otherwise refresh every 30s
        checkPingRef.current();
      }
    }, interval);

    return () => {
      clearInterval(autoRefreshInterval);
    };
  }, [pingStatus.pingTime, isPinging]);

  // Delayed retry when pingTime 0 and idle
  useEffect(() => {
    if (pingStatus.pingTime === 0 && !isPinging && hasInitialPingRef.current) {
      // detect whetherpage refresh
      const isPageRefresh = () => {
        if (typeof window !== 'undefined' && window.performance) {
          const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          if (navigation && navigation.type === 'reload') {
            return true;
          }
        }
        return false;
      };

      const wasRefreshed = isPageRefresh();
      const retryDelay = wasRefreshed ? 500 : 1000; // 500ms after refresh, else 1s

      // Initial ping ran but pingTime still 0: retry
      const retryTimer = setTimeout(() => {
        if (pingStatus.pingTime === 0 && !isPinging) {
          checkPingRef.current();
        }
      }, retryDelay);

      return () => {
        clearTimeout(retryTimer);
      };
    }
  }, [pingStatus.pingTime, isPinging]);

  // Aggressive retry after refresh
  useEffect(() => {
    // detect whetherpage refresh
    const isPageRefresh = () => {
      if (typeof window !== 'undefined' && window.performance) {
        const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navigation && navigation.type === 'reload') {
          return true;
        }
      }
      return false;
    };

    const wasRefreshed = isPageRefresh();
    
    if (wasRefreshed && pingStatus.pingTime === 0 && !isPinging && hasInitialPingRef.current) {
      // After refresh, retry if pingTime still 0
      const refreshRetryTimer = setTimeout(() => {
        if (pingStatus.pingTime === 0 && !isPinging) {
          checkPingRef.current();
        }
      }, 500); // Retry 500ms after refresh

      return () => {
        clearTimeout(refreshRetryTimer);
      };
    }
  }, [pingStatus.pingTime, isPinging]);

  // PingStatus label formatter
  const getPingStatusText = () => {
    if (isPinging) return 'Checking...';
    if (pingStatus.pingTime >= 3000) {
      return '3000+ MS';
    }
    return `${pingStatus.pingTime} MS`;
  };

  const navigate = useNavigate();
  const location = useLocation();
  const isDocsRoute = location.pathname.startsWith('/docs');
  const docsNavigation = useMemo(() => getDocsNavigation(), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!location.pathname.startsWith('/docs')) {
      sessionStorage.setItem('lastAppPath', `${location.pathname}${location.search || ''}`);
    }
  }, [location.pathname, location.search]);

  const exitDocsToApp = useCallback(() => {
    if (typeof window === 'undefined') {
      navigate('/');
      return;
    }
    const path = sessionStorage.getItem('lastAppPath');
    if (path && path.length > 0 && !path.startsWith('/docs')) {
      navigate(path);
    } else {
      navigate('/');
    }
  }, [navigate]);

  const [activeDocSectionId, setActiveDocSectionId] = useState(
    () => docsNavigation.chapters[0]?.id ?? '',
  );

  const updateActiveDocSection = useCallback(() => {
    if (docsNavigation.chapters.length === 0) return;
    if (docScrollSpyLockRef.current) return;
    const root = docsMainPaneRef.current;
    if (!root) return;
    const gapPx = getDocsTocGapPx(root);
    const rootRect = root.getBoundingClientRect();
    const activationY = rootRect.top + gapPx;
    const remainder = root.scrollHeight - root.scrollTop - root.clientHeight;
    const nearBottom = remainder < Math.max(24, gapPx * 2);
    if (nearBottom) {
      const lastId = docsNavigation.chapters[docsNavigation.chapters.length - 1]?.id;
      if (lastId) setActiveDocSectionId((p) => (p === lastId ? p : lastId));
      return;
    }
    let chosen = docsNavigation.chapters[0].id;
    for (const ch of docsNavigation.chapters) {
      const el = document.getElementById(ch.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top <= activationY + 0.5) chosen = ch.id;
    }
    setActiveDocSectionId((p) => (p === chosen ? p : chosen));
  }, [docsNavigation.chapters]);

  const finishDocChapterScroll = useCallback(() => {
    if (docScrollChapterTimerRef.current != null) {
      window.clearTimeout(docScrollChapterTimerRef.current);
      docScrollChapterTimerRef.current = null;
    }
    if (!docScrollSpyLockRef.current) return;
    docScrollSpyLockRef.current = false;
    updateActiveDocSection();
  }, [updateActiveDocSection]);

  const scrollDocChapter = useCallback(
    (id: string) => {
      if (!id) return;
      const root = docsMainPaneRef.current;
      const el = document.getElementById(id);
      if (!root || !el) return;
      const gapPx = getDocsTocGapPx(root);
      setActiveDocSectionId(id);
      docScrollSpyLockRef.current = true;
      if (docScrollChapterTimerRef.current != null) {
        window.clearTimeout(docScrollChapterTimerRef.current);
      }
      const paneRect = root.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const targetTop = root.scrollTop + (elRect.top - paneRect.top) - gapPx;
      root.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });

      const onScrollEnd = () => {
        root.removeEventListener('scrollend', onScrollEnd);
        finishDocChapterScroll();
      };
      if (typeof window !== 'undefined' && 'onscrollend' in window) {
        root.addEventListener('scrollend', onScrollEnd, { passive: true });
      }
      docScrollChapterTimerRef.current = window.setTimeout(() => {
        root.removeEventListener('scrollend', onScrollEnd);
        finishDocChapterScroll();
      }, 900);
    },
    [finishDocChapterScroll],
  );

  useEffect(
    () => () => {
      if (docScrollChapterTimerRef.current != null) {
        window.clearTimeout(docScrollChapterTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!isWorkbenchDocsPage(location.pathname)) return;
    setActiveDocSectionId(docsNavigation.chapters[0]?.id ?? '');
  }, [location.pathname, docsNavigation.chapters]);

  useEffect(() => {
    if (!isDocsRoute || !isWorkbenchDocsPage(location.pathname)) return;
    const root = docsMainPaneRef.current;
    if (!root) return;
    const run = () => updateActiveDocSection();
    run();
    const raf = requestAnimationFrame(run);
    root.addEventListener('scroll', run, { passive: true });
    const ro = new ResizeObserver(run);
    ro.observe(root);
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener('scroll', run);
      ro.disconnect();
    };
  }, [isDocsRoute, location.pathname, updateActiveDocSection]);

  const { userProfile } = useUser();
  const { currentUser } = useAuth();
  const { accountConfigs: contextAccountConfigs, refreshAccountConfigs, loading: accountConfigsLoading } = useAccount();
  
  // userKey for localStorage (currentUser.id, not userProfile.id)
  const userKey = currentUser?.id || '';

  const onGochatMessagesLoaded = useCallback((messages: ChatBubble[]) => {
    setChatMessages(messages);
  }, []);

  const onGochatConversationSelected = useCallback((conversationId: string) => {
    setCurrentConversationId(conversationId);
  }, []);

  const onGochatConversationCleared = useCallback(() => {
    setChatMessages([]);
    setChatInput('');
    setCurrentConversationId(null);
  }, []);

  const {
    conversations: gochatConversations,
    conversationsLoading: gochatConversationsLoading,
    messagesLoading: gochatMessagesLoading,
    historyOpen: gochatHistoryOpen,
    setHistoryOpen: setGochatHistoryOpen,
    loadConversation: loadGochatConversation,
    deleteConversationById: deleteGochatConversation,
    clearPersistedSession: clearGochatPersistedSession,
    notifyConversationStarted,
    notifyConversationCompleted,
    atConversationLimit: gochatAtConversationLimit,
  } = useGochatPersistence({
    userKey,
    chatSheetOpen,
    currentConversationId,
    chatMessagesLength: chatMessages.length,
    isChatStreaming,
    onMessagesLoaded: onGochatMessagesLoaded,
    onConversationSelected: onGochatConversationSelected,
    onConversationCleared: onGochatConversationCleared,
  });

  // Auto Refresh Time (default 15MIN; sync from localStorage when userKey ready)
  const [autoRefreshTime, setAutoRefreshTime] = useState(2);

  const syncAutoRefreshFromStorage = useCallback(() => {
    if (!userKey || typeof window === 'undefined') return;
    setAutoRefreshTime(readAutoRefreshSliderIndex(userKey));
  }, [userKey]);

  useEffect(() => {
    syncAutoRefreshFromStorage();
  }, [syncAutoRefreshFromStorage]);

  useEffect(() => {
    if (settingsDrawerOpen) {
      syncAutoRefreshFromStorage();
    }
  }, [settingsDrawerOpen, syncAutoRefreshFromStorage]);

  const hasActiveChatTextSelection = useCallback((): boolean => {
    const sel = window.getSelection();
    const root = chatMessagesContainerRef.current;
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !root) return false;

    const inRoot = (node: Node | null): boolean => {
      if (!node) return false;
      const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
      return el ? root.contains(el) : false;
    };

    return inRoot(sel.anchorNode) || inRoot(sel.focusNode);
  }, []);

  const shouldPauseStreamingUI = useCallback((): boolean => {
    if (chatUserInteractingRef.current) return true;
    return hasActiveChatTextSelection();
  }, [hasActiveChatTextSelection]);

  // Auto-scroll only when user is not interacting and remains near the bottom
  useEffect(() => {
    if (chatUserInteractingRef.current || hasActiveChatTextSelection()) return;
    if (!chatEndRef.current) return;

    const scrollEl = chatScrollContainerRef.current;
    if (scrollEl && isChatStreaming) {
      const distanceFromBottom =
        scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      if (distanceFromBottom > 120) return;
    }

    try {
      chatEndRef.current.scrollIntoView({
        behavior: isChatStreaming ? 'auto' : 'smooth',
        block: 'nearest',
      });
    } catch {}
  }, [chatMessages, isChatStreaming, chatSheetOpen, hasActiveChatTextSelection]);

  useEffect(() => {
    isChatStreamingRef.current = isChatStreaming;
  }, [isChatStreaming]);

  useEffect(() => {
    const syncGochatDisplayPrefs = () => {
      setGochatDisplayFormat(readGochatPreferences().responseFormat);
    };
    syncGochatDisplayPrefs();
    window.addEventListener(GOCHAT_PREFERENCES_CHANGED, syncGochatDisplayPrefs);
    return () => window.removeEventListener(GOCHAT_PREFERENCES_CHANGED, syncGochatDisplayPrefs);
  }, []);

  const handleNewChat = () => {
    // Clear streaming and typewriter effects
    if (streamingUpdateRef.current !== null) {
      cancelAnimationFrame(streamingUpdateRef.current);
      streamingUpdateRef.current = null;
    }
    if (typewriterTimerRef.current !== null) {
      cancelAnimationFrame(typewriterTimerRef.current);
      typewriterTimerRef.current = null;
    }
    streamingContentRef.current = '';
    streamingReasoningRef.current = '';
    streamingAssistantIndexRef.current = -1;
    displayedLengthRef.current = 0;
    displayedReasoningLengthRef.current = 0;
    typewriterLastTimestampRef.current = 0;
    
    clearGochatPersistedSession();
    setChatInput('');
    setChatSheetExpanded(false);
  };

  const handleSelectGochatConversation = (conversationId: string) => {
    if (conversationId === currentConversationId || isChatStreaming) return;
    void loadGochatConversation(conversationId);
  };

  const handleDeleteGochatConversation = useCallback(
    (conversationId: string) => deleteGochatConversation(conversationId),
    [deleteGochatConversation]
  );

  const showChatIntro = chatMessages.length === 0 && !gochatMessagesLoading;

  // Parse code blocks live (Code mode)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _parseCodeBlocksInRealTime = (content: string): { parts: Array<{ type: 'text' | 'code'; content: string; language?: string }>, isInCodeBlock: boolean } => {
    const parts: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;
    let isInCodeBlock = false;

    // Check for unclosed code fence
    const openCodeBlockMatch = content.match(/```(\w+)?\n?([\s\S]*?)$/);
    if ((openCodeBlockMatch && !content.match(/```/g)) || ((content.match(/```/g)?.length || 0) % 2 === 1)) {
      isInCodeBlock = true;
    }

    codeBlockRegex.lastIndex = 0;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Text before code block
      if (match.index > lastIndex) {
        const textBefore = content.substring(lastIndex, match.index);
        if (textBefore.trim()) {
          parts.push({ type: 'text', content: textBefore });
        }
      }

      // Code block
      const language = match[1] || 'text';
      const code = match[2];
      parts.push({ type: 'code', content: code, language });

      lastIndex = match.index + match[0].length;
    }

    // Unclosed fence or trailing text
    if (lastIndex < content.length) {
      const remaining = content.substring(lastIndex);
      if (isInCodeBlock) {
        // Inside fence: extract language and body
        const openMatch = remaining.match(/^```(\w+)?\n?([\s\S]*)$/);
        if (openMatch) {
          const language = openMatch[1] || 'text';
          const code = openMatch[2];
          parts.push({ type: 'code', content: code, language });
        } else {
          parts.push({ type: 'code', content: remaining, language: 'text' });
        }
      } else {
        if (remaining.trim()) {
          parts.push({ type: 'text', content: remaining });
        }
      }
    }

    return { parts, isInCodeBlock };
  };

  const pushAssistantContentToUI = useCallback(
    (displayedContent: string, options?: { force?: boolean }) => {
      const index = streamingAssistantIndexRef.current;
      if (index < 0) return;

      const force = options?.force ?? false;
      if (!force && shouldPauseStreamingUI()) {
        pendingStreamingFlushRef.current = true;
        return;
      }

      pendingStreamingFlushRef.current = false;
      const hasDisplayed = displayedContent.length > 0;
      const displayedReasoning = streamingReasoningRef.current.substring(
        0,
        displayedReasoningLengthRef.current
      );
      setChatMessages((prev) => {
        const updated = [...prev];
        const current = updated[index];
        if (!current) return prev;
        updated[index] = {
          ...current,
          content: displayedContent,
          reasoning: displayedReasoning || current.reasoning,
          reasoningComplete: hasDisplayed ? true : current.reasoningComplete,
          status: hasDisplayed ? undefined : 'loading',
        };
        return updated;
      });
    },
    [shouldPauseStreamingUI]
  );

  const flushPendingStreamingUI = useCallback(() => {
    if (!pendingStreamingFlushRef.current || shouldPauseStreamingUI()) return;
    pendingStreamingFlushRef.current = false;
    const prefs = readGochatPreferences();
    if (prefs.streamDisplay === 'instant') {
      pushAssistantContentToUI(streamingContentRef.current, { force: true });
    } else {
      pushAssistantContentToUI(
        streamingContentRef.current.substring(0, displayedLengthRef.current),
        { force: true }
      );
    }
  }, [shouldPauseStreamingUI, pushAssistantContentToUI]);

  const endChatInteraction = useCallback(() => {
    if (chatInteractionTimerRef.current !== null) {
      window.clearTimeout(chatInteractionTimerRef.current);
    }
    chatInteractionTimerRef.current = window.setTimeout(() => {
      chatUserInteractingRef.current = false;
      chatInteractionTimerRef.current = null;
      if (!hasActiveChatTextSelection()) {
        flushPendingStreamingUI();
      }
    }, 320);
  }, [flushPendingStreamingUI, hasActiveChatTextSelection]);

  const handleChatPointerDown = useCallback(() => {
    if (chatInteractionTimerRef.current !== null) {
      window.clearTimeout(chatInteractionTimerRef.current);
      chatInteractionTimerRef.current = null;
    }
    chatUserInteractingRef.current = true;
  }, []);

  const handleChatPointerUp = useCallback(() => {
    endChatInteraction();
  }, [endChatInteraction]);

  useEffect(() => {
    const onSelectionChange = () => {
      if (hasActiveChatTextSelection()) {
        pendingStreamingFlushRef.current = true;
        return;
      }
      if (pendingStreamingFlushRef.current && !chatUserInteractingRef.current) {
        flushPendingStreamingUI();
      }
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [hasActiveChatTextSelection, flushPendingStreamingUI]);

  // Streaming: time-driven typewriter + reasoning expand (single rAF)
  const startStreamingAnimator = () => {
    if (typewriterTimerRef.current !== null) {
      return;
    }

    typewriterLastTimestampRef.current = 0;

    const animateFrame = (timestamp: number) => {
      if (!typewriterLastTimestampRef.current) {
        typewriterLastTimestampRef.current = timestamp;
      }

      const elapsed = timestamp - typewriterLastTimestampRef.current;
      typewriterLastTimestampRef.current = timestamp;

      const prefs = readGochatPreferences();
      const isTypewriter = prefs.streamDisplay === 'typewriter';
      const index = streamingAssistantIndexRef.current;
      let contentDirty = false;
      let reasoningDirty = false;

      if (isTypewriter && index >= 0) {
        const before = displayedLengthRef.current;
        displayedLengthRef.current = advanceStreamingDisplay(
          before,
          streamingContentRef.current.length,
          elapsed,
          GOCHAT_TYPEWRITER_BASE_CPS,
          GOCHAT_TYPEWRITER_MAX_CPS
        );
        contentDirty = displayedLengthRef.current !== before;
      }

      const reasoningBefore = displayedReasoningLengthRef.current;
      displayedReasoningLengthRef.current = advanceStreamingDisplay(
        reasoningBefore,
        streamingReasoningRef.current.length,
        elapsed,
        GOCHAT_REASONING_BASE_CPS,
        GOCHAT_REASONING_MAX_CPS
      );
      reasoningDirty = displayedReasoningLengthRef.current !== reasoningBefore;

      const streamDone = !isChatStreamingRef.current;
      const contentCaughtUp =
        !isTypewriter || displayedLengthRef.current >= streamingContentRef.current.length;
      const reasoningCaughtUp =
        displayedReasoningLengthRef.current >= streamingReasoningRef.current.length;
      const uiMinMs = isTypewriter ? GOCHAT_TYPEWRITER_UI_MIN_MS : GOCHAT_REASONING_UI_MIN_MS;
      const uiDue = timestamp - typewriterLastUIUpdateRef.current >= uiMinMs;
      const shouldPush =
        (contentDirty || reasoningDirty) &&
        (uiDue || (streamDone && contentCaughtUp && reasoningCaughtUp));

      if (shouldPush) {
        typewriterLastUIUpdateRef.current = timestamp;
        if (isTypewriter) {
          pushAssistantContentToUI(
            streamingContentRef.current.substring(0, displayedLengthRef.current),
            { force: streamDone && contentCaughtUp }
          );
        } else if (reasoningDirty || (streamDone && reasoningCaughtUp)) {
          patchStreamingAssistant({
            reasoning: streamingReasoningRef.current.substring(
              0,
              displayedReasoningLengthRef.current
            ),
            status: 'loading',
          });
        }
      }

      const stillAnimating =
        isChatStreamingRef.current ||
        (isTypewriter &&
          index >= 0 &&
          displayedLengthRef.current < streamingContentRef.current.length) ||
        displayedReasoningLengthRef.current < streamingReasoningRef.current.length;

      if (stillAnimating) {
        typewriterTimerRef.current = window.requestAnimationFrame(animateFrame);
        return;
      }

      typewriterTimerRef.current = null;
      typewriterLastTimestampRef.current = 0;
    };

    typewriterTimerRef.current = window.requestAnimationFrame(animateFrame);
  };

  const patchStreamingAssistant = (patch: Partial<ChatBubble>) => {
    const index = streamingAssistantIndexRef.current;
    if (index < 0) return;
    setChatMessages((prev) => {
      const updated = [...prev];
      const current = updated[index];
      if (!current) return prev;
      updated[index] = { ...current, ...patch };
      return updated;
    });
  };

  const flushInstantReasoning = () => {
    if (shouldPauseStreamingUI()) return;
    startStreamingAnimator();
  };

  const flushInstantStreaming = (force = false) => {
    const content = streamingContentRef.current;
    const now = performance.now();
    if (!force && now - streamingUILastPatchRef.current < STREAMING_UI_MIN_MS) {
      return;
    }
    streamingUILastPatchRef.current = now;
    pushAssistantContentToUI(content, { force });
  };

  // Start or continue streaming on new content
  const flushStreamingContent = () => {
    const prefs = readGochatPreferences();
    if (prefs.streamDisplay === 'instant') {
      flushInstantStreaming();
    } else {
      startStreamingAnimator();
    }
  };

  const flushStreamingReasoning = () => {
    flushInstantReasoning();
  };

  const handleSend = async (prompt?: string) => {
    const content = (prompt ?? chatInput).trim();
    if (!content || isChatStreaming) return;

    const isStartingNewConversation = !currentConversationId;
    if (isStartingNewConversation && gochatAtConversationLimit) {
      const limitMessage = `Conversation limit reached (maximum ${GOCHAT_MAX_CONVERSATIONS_PER_USER} per user). Please delete an old conversation to start a new one.`;
      setChatMessages((prev) => [
        ...prev,
        { role: 'user', content },
        { role: 'assistant', content: limitMessage, status: 'error' },
      ]);
      setChatInput('');
      return;
    }

    // Clear prior streaming and typewriter effects
    if (streamingUpdateRef.current !== null) {
      cancelAnimationFrame(streamingUpdateRef.current);
      streamingUpdateRef.current = null;
    }
    if (typewriterTimerRef.current !== null) {
      cancelAnimationFrame(typewriterTimerRef.current);
      typewriterTimerRef.current = null;
    }
    streamingContentRef.current = '';
    streamingReasoningRef.current = '';
    streamingAssistantIndexRef.current = -1;
    displayedLengthRef.current = 0;
    displayedReasoningLengthRef.current = 0;
    typewriterLastTimestampRef.current = 0;

    const userMsg: ChatBubble = { role: 'user', content };
    const baseMessages = [...chatMessages, userMsg];
    const assistantMsgIndex = baseMessages.length;
    streamingAssistantIndexRef.current = assistantMsgIndex;

    const gochatPrefsAtSend = readGochatPreferences();
    streamingResponseFormatRef.current = gochatPrefsAtSend.responseFormat;
    
    setChatMessages([
      ...baseMessages,
      {
        role: 'assistant',
        content: '',
        status: 'loading',
        responseFormat: gochatPrefsAtSend.responseFormat,
      },
    ]);
    setChatInput('');

    // prepare assistant placeholder
    setIsChatStreaming(true);

    try {
      // AbortController (kept for future extension; fetch is inside helper)
      const controller = new AbortController();
      chatAbortRef.current = controller;

      const gochatPrefs = gochatPrefsAtSend;
      const providerToUse = GOCHAT_DEFAULT_PROVIDER;
      const modelToUse = gochatPrefs.model;
      const maxTokens = gochatPrefs.maxTokens;
      const normalizedTemperature = normalizeGochatTemperature(gochatPrefs.temperature);

      let requestMessages: ChatMessage[] = baseMessages.map(({ role, content }) => ({ role, content }));
      requestMessages = [
        { role: 'system', content: buildGochatSystemInstruction(gochatPrefs) },
        ...requestMessages,
      ];

      await sendChatMessageStream(
        {
          model: modelToUse,
          messages: requestMessages,
          stream: true,
          provider: providerToUse,
          max_tokens: maxTokens,
          temperature: normalizedTemperature,
          conversation_id: currentConversationId || undefined,
        },
        (chunk) => {
          streamingContentRef.current += chunk;
          flushStreamingContent();
        },
        (err) => {
          // Clear streaming and typewriter effects
          if (streamingUpdateRef.current !== null) {
            cancelAnimationFrame(streamingUpdateRef.current);
            streamingUpdateRef.current = null;
          }
          if (typewriterTimerRef.current !== null) {
            cancelAnimationFrame(typewriterTimerRef.current);
            typewriterTimerRef.current = null;
          }
          typewriterLastTimestampRef.current = 0;
          
          const message = err.message || 'Chat request failed';

          setChatMessages(prev => {
            const updated = [...prev];
            const lockedFormat = streamingResponseFormatRef.current ?? undefined;
            if (updated[assistantMsgIndex]) {
              updated[assistantMsgIndex] = {
                ...updated[assistantMsgIndex],
                role: 'assistant',
                content: message,
                status: 'error',
                responseFormat: lockedFormat ?? updated[assistantMsgIndex].responseFormat,
              };
            } else {
              updated.push({
                role: 'assistant',
                content: message,
                status: 'error',
                responseFormat: lockedFormat,
              });
            }
            return updated;
          });
          setIsChatStreaming(false);
          chatAbortRef.current = null;
          streamingContentRef.current = '';
          streamingReasoningRef.current = '';
          streamingAssistantIndexRef.current = -1;
          displayedLengthRef.current = 0;
          displayedReasoningLengthRef.current = 0;
        },
        (conversationId) => {
          if (conversationId) {
            void notifyConversationCompleted(conversationId, content);
          }

          // Clearstreaming updates
          if (streamingUpdateRef.current !== null) {
            cancelAnimationFrame(streamingUpdateRef.current);
            streamingUpdateRef.current = null;
          }
          
          const finishStreaming = () => {
            const finalContent = streamingContentRef.current;
            const finalIndex = streamingAssistantIndexRef.current;

            const applyFinal = () => {
              if (finalIndex >= 0) {
                displayedLengthRef.current = finalContent.length;
                displayedReasoningLengthRef.current = streamingReasoningRef.current.length;
                setChatMessages((prev) => {
                  const updated = [...prev];
                  if (updated[finalIndex]) {
                    const hasAnswer = finalContent.length > 0;
                    updated[finalIndex] = {
                      ...updated[finalIndex],
                      content: finalContent,
                      reasoning:
                        streamingReasoningRef.current || updated[finalIndex].reasoning,
                      reasoningComplete: hasAnswer ? true : updated[finalIndex].reasoningComplete,
                      status: updated[finalIndex].status === 'error' ? 'error' : undefined,
                    };
                  }
                  return updated;
                });
              }
              setIsChatStreaming(false);
              chatAbortRef.current = null;
              streamingContentRef.current = '';
              streamingReasoningRef.current = '';
              streamingAssistantIndexRef.current = -1;
              displayedLengthRef.current = 0;
              displayedReasoningLengthRef.current = 0;
            };

            if (readGochatPreferences().streamDisplay === 'instant') {
              applyFinal();
              return;
            }

            const waitForTypewriter = () => {
              if (typewriterTimerRef.current !== null) {
                setTimeout(waitForTypewriter, 50);
                return;
              }
              applyFinal();
            };
            waitForTypewriter();
          };

          finishStreaming();
        },
        {
          showReasoning: gochatPrefs.showReasoning,
          onReasoningChunk: (piece) => {
            streamingReasoningRef.current += piece;
            flushStreamingReasoning();
          },
          onConversationId: (conversationId) => {
            setCurrentConversationId(conversationId);
            void notifyConversationStarted(conversationId);
          },
        }
      );
    } catch (e: any) {
      const message = e?.message || 'Chat request failed';
      setChatMessages(prev => {
        const updated = [...prev];
        if (updated[assistantMsgIndex]) {
          updated[assistantMsgIndex] = {
            role: 'assistant',
            content: message,
            status: 'error',
          };
        } else {
          updated.push({
            role: 'assistant',
            content: message,
            status: 'error',
          });
        }
        return updated;
      });
      setIsChatStreaming(false);
      chatAbortRef.current = null;
    }
  };

  const handleCancelStream = () => {
    if (chatAbortRef.current) {
      try { chatAbortRef.current.abort(); } catch {}
      chatAbortRef.current = null;
    }
    
    // Clear streaming and typewriter effects
    if (streamingUpdateRef.current !== null) {
      cancelAnimationFrame(streamingUpdateRef.current);
      streamingUpdateRef.current = null;
    }
    if (typewriterTimerRef.current !== null) {
      cancelAnimationFrame(typewriterTimerRef.current);
      typewriterTimerRef.current = null;
    }
    typewriterLastTimestampRef.current = 0;
    
    // Show all received content immediately
    const finalContent = streamingContentRef.current;
    const finalReasoning = streamingReasoningRef.current;
    const finalIndex = streamingAssistantIndexRef.current;
    if (finalIndex >= 0 && (finalContent || finalReasoning)) {
      displayedLengthRef.current = finalContent.length;
      displayedReasoningLengthRef.current = finalReasoning.length;
      setChatMessages(prev => {
        const updated = [...prev];
        if (updated[finalIndex]) {
          updated[finalIndex] = {
            ...updated[finalIndex],
            content: finalContent,
            reasoning: finalReasoning || updated[finalIndex].reasoning,
            reasoningComplete: finalContent.length > 0 ? true : updated[finalIndex].reasoningComplete,
            status: undefined,
          };
        }
        return updated;
      });
    }
    
    streamingContentRef.current = '';
    streamingReasoningRef.current = '';
    streamingAssistantIndexRef.current = -1;
    displayedLengthRef.current = 0;
    displayedReasoningLengthRef.current = 0;
    setIsChatStreaming(false);
  };

  // Sync Auto Refresh Time from localStorage (cross-tab)
  useEffect(() => {
    if (!userKey || typeof window === 'undefined') return;
    
    const handleStorageChange = (e?: StorageEvent) => {
      // storage event: check current user key
      if (e && e.key !== `accountRefreshRule_${userKey}`) return;
      
      setAutoRefreshTime(readAutoRefreshSliderIndex(userKey));
    };

    // storage event (cross-tab)
    window.addEventListener('storage', handleStorageChange);

    // Custom event (same tab)
    window.addEventListener('autoRefreshTimeChanged', handleStorageChange as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('autoRefreshTimeChanged', handleStorageChange as EventListener);
    };
  }, [userKey]);

  // Sync Aggregate Mode from localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      if (typeof window !== 'undefined') {
        const agg = localStorage.getItem('appsflyerTokenValidate');
        setAggregateModeEnabled(agg !== 'OFF');
      }
    };

    // storage event (cross-tab)
    window.addEventListener('storage', handleStorageChange);

    // Custom event (same tab)
    window.addEventListener('aggregateModeChanged', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('aggregateModeChanged', handleStorageChange);
    };
  }, []);


  // Cache & File Clear state
  const isSuperAdmin = userProfile?.role === 'Super Admin';
  const [cleaning, setCleaning] = useState(false);
  const [cleanupSuccess, setCleanupSuccess] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleanupStats, setCleanupStats] = useState<{ deleted_files?: number; total_files?: number; valid_files_count?: number; retained_files?: number } | null>(null);

  // Account Configuration Order state
  // Use AccountContext accountConfigs to avoid duplicate fetches
  // Map contextAccountConfigs to Layout format (with sort_order)
  const baseAccountConfigs = useMemo(() => {
    return (contextAccountConfigs || []).map((config: any) => ({
      ...config,
      sort_order: config.sort_order ?? 999
    })).sort((a: any, b: any) => {
      const orderA = a.sort_order ?? 999;
      const orderB = b.sort_order ?? 999;
      return orderA - orderB;
    });
  }, [contextAccountConfigs]);
  
  // Local state for drag sort (init from baseAccountConfigs)
  const [localAccountConfigs, setLocalAccountConfigs] = useState<any[]>([]);
  
  // Sync local state when baseAccountConfigs changes
  useEffect(() => {
    setLocalAccountConfigs(baseAccountConfigs);
  }, [baseAccountConfigs]);
  
  // Display and drag use local state
  const accountConfigs = localAccountConfigs.length > 0 ? localAccountConfigs : baseAccountConfigs;
  const configsLoading = accountConfigsLoading;
  const [configsSaving, setConfigsSaving] = useState(false);
  const [configsSaveSuccess, setConfigsSaveSuccess] = useState(false);
  const [configsSaveError, setConfigsSaveError] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // Saved order snapshot for change detection
  const [savedConfigOrder, setSavedConfigOrder] = useState<string[] | null>(null);

  // Current config order as id array
  const getCurrentConfigOrder = useCallback((): string[] => {
    return accountConfigs.map((config: any) => config.id);
  }, [accountConfigs]);

  // Detect order changes
  const hasConfigOrderChanges = useMemo(() => {
    if (!savedConfigOrder || savedConfigOrder.length === 0) return false;
    const current = getCurrentConfigOrder();
    if (current.length !== savedConfigOrder.length) return true;
    return current.some((id, index) => id !== savedConfigOrder[index]);
  }, [savedConfigOrder, getCurrentConfigOrder]);

  // Save initial order snapshot when configs load
  useEffect(() => {
    if (!configsLoading && accountConfigs.length > 0 && savedConfigOrder === null) {
      setTimeout(() => {
        setSavedConfigOrder(getCurrentConfigOrder());
      }, 100);
    }
  }, [configsLoading, accountConfigs.length, savedConfigOrder, getCurrentConfigOrder]);
  
  // Update snapshot after server refresh if order unchanged
  useEffect(() => {
    if (!configsLoading && accountConfigs.length > 0 && savedConfigOrder !== null) {
      const currentOrder = getCurrentConfigOrder();
      const baseOrder = baseAccountConfigs.map((config: any) => config.id);
      // Update snapshot if order matches baseAccountConfigs (no drag)
      if (currentOrder.length === baseOrder.length && 
          currentOrder.every((id, index) => id === baseOrder[index])) {
        setTimeout(() => {
          setSavedConfigOrder(currentOrder);
        }, 100);
      }
    }
  }, [configsLoading, accountConfigs.length, baseAccountConfigs, savedConfigOrder, getCurrentConfigOrder]);
  
  // Update snapshot after server refresh if order unchanged
  useEffect(() => {
    if (!configsLoading && accountConfigs.length > 0 && savedConfigOrder !== null) {
      const currentOrder = getCurrentConfigOrder();
      const baseOrder = baseAccountConfigs.map((config: any) => config.id);
      // Update snapshot if order matches baseAccountConfigs (no drag)
      if (currentOrder.length === baseOrder.length && 
          currentOrder.every((id, index) => id === baseOrder[index])) {
        setTimeout(() => {
          setSavedConfigOrder(currentOrder);
        }, 100);
      }
    }
  }, [configsLoading, accountConfigs.length, baseAccountConfigs, savedConfigOrder, getCurrentConfigOrder]);

  const handleCleanup = async () => {
    if (!isSuperAdmin) return;
    
    setCleaning(true);
    setCleanupSuccess(false);
    setCleanupError(null);
    setCleanupStats(null);
    const startTime = Date.now();
    
    try {
      const response = await axiosInstance.post('/api/cleanup-orphaned-files');
      const data = response.data as { status: string; message: string; stats?: any };
      
      if (data.status === 'success') {
        setCleanupSuccess(true);
        setCleanupStats(data.stats || null);
        // Clear success state after 5s
        setTimeout(() => {
          setCleanupSuccess(false);
          setCleanupStats(null);
        }, 5000);
      } else {
        setCleanupError(data.message || 'Cleanup failed');
        setTimeout(() => {
          setCleanupError(null);
        }, 3000);
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message || 'Cleanup failed';
      setCleanupError(errorMsg);
      setTimeout(() => {
        setCleanupError(null);
      }, 3000);
    } finally {
      // Show loading at least 1s
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, 1000 - elapsedTime);
      setTimeout(() => {
        setCleaning(false);
      }, remainingTime);
    }
  };

  // Save order via AccountContext (no separate fetch)
  const handleSaveConfigOrder = async () => {
    setConfigsSaving(true);
    setConfigsSaveSuccess(false);
    setConfigsSaveError(null);
    const startTime = Date.now();
    try {
      const configOrders = accountConfigs.map((config: any, index: number) => ({
        id: config.id,
        sort_order: index
      }));
      
      const response = await axiosInstance.put('/api/auth/account-configs/order', {
        config_orders: configOrders
      });
      
      if (response.status === 200) {
        // Clear cache and refresh
        const userKey = currentUser?.id || '';
        const CACHE_KEY = `accountConfigs_${userKey}`;
        const CACHE_TIME_KEY = `accountConfigsTime_${userKey}`;
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_TIME_KEY);
        await refreshAccountConfigs(true);
        
        // Success feedback
        setConfigsSaveSuccess(true);
        setConfigsSaveError(null);
        setTimeout(() => {
          setConfigsSaveSuccess(false);
        }, 3000);
        
        // Update order snapshot after save
        setTimeout(() => {
          setSavedConfigOrder(getCurrentConfigOrder());
        }, 100);
      }
    } catch (error) {
      console.error('保存排序失败:', error);
      setConfigsSaveError('Failed to save configuration order');
      setConfigsSaveSuccess(false);
      setTimeout(() => {
        setConfigsSaveError(null);
      }, 3000);
    } finally {
      // Show loading at least 1s
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, 1000 - elapsedTime);
      setTimeout(() => {
        setConfigsSaving(false);
      }, remainingTime);
    }
  };

  // Refresh empty configs when drawer opens
  useEffect(() => {
    if (settingsDrawerOpen && accountConfigs.length === 0 && !configsLoading) {
      refreshAccountConfigs(true);
    }
  }, [settingsDrawerOpen, accountConfigs.length, configsLoading, refreshAccountConfigs]);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    // Theme from localStorage or system preference
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
      if (saved) return saved;
      // Check system preference
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  // Detect browser and add class
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const userAgent = navigator.userAgent;
    const isEdge = /Edg/.test(userAgent);
    const isChrome = /Chrome/.test(userAgent) && !isEdge;
    
    if (isChrome) {
      document.documentElement.classList.add('browser-chrome');
    } else if (isEdge) {
      document.documentElement.classList.add('browser-edge');
    }
    
    return () => {
      document.documentElement.classList.remove('browser-chrome', 'browser-edge');
    };
  }, []);

  // Apply theme to root
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // Follow system only if user has not set theme
      if (!localStorage.getItem('theme')) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Toggle theme
  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };


  // Load search history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('linksCheckerHistory');
    if (savedHistory) {
      try {
        setSearchHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Failed to parse search history:', e);
      }
    }
  }, []);

  // Save search history to localStorage
  const saveSearchHistory = (query: string) => {
    const newHistory = [query, ...searchHistory.filter(h => h !== query)].slice(0, 5);
    setSearchHistory(newHistory);
    localStorage.setItem('linksCheckerHistory', JSON.stringify(newHistory));
  };
  
  const handleLinkSearch = (query: string) => {
    if (!query.trim()) return;
    const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    window.open(url, '_blank');
    saveSearchHistory(query);
    setCommandQuery('');
    setCommandOpen(false);
  };

  const handlePageNavigation = (path: string) => {
    navigate(path);
    setCommandOpen(false);
  };

  // Shortcuts: Cmd/Ctrl+K open, ESC close
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (e.key === 'Escape') {
        setCommandOpen(false);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const menuItems = [
    {
      key: '/',
      icon: BsFiletypeRaw,
      label: 'Appsflyer Query',
    },
    {
      key: '/dashboard',
      icon: BsClipboardData,
      label: 'Dashboard',
    },
    {
      key: '/autopipe',
      icon: BsDatabaseUp,
      label: 'Auto Pipe',
    },
    {
      key: '/dispatch-access',
      icon: BsLink45Deg,
      label: 'Dispatch Access',
    },
    {
      key: '/benchmark',
      icon: BsSpeedometer2,
      label: 'Benchmark',
    },
    {
      key: '/app-estimator',
      icon: BsBarChartLine,
      label: 'App Estimator',
    },
    {
      key: '/apps',
      icon: BsAppIndicator,
      label: 'Apps Finder',
    },
  ];

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      const { logout } = require('../contexts/AuthContext');
      if (logout) logout();
    }
    window.location.href = '/login';
  };

  // Dev: reset sidebar toggle position (console)
  useEffect(() => {
    (window as any).resetSidebarTogglePosition = () => {
      localStorage.removeItem('sidebarTogglePosition');
      window.location.reload();
    };
    return () => {
      delete (window as any).resetSidebarTogglePosition;
    };
  }, []);

  return (
    <>
              <style>
          {`
          /* Global body reset */
          body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            height: 100vh;
            height: 100dvh; /* Dynamic viewport height for cross-browser consistency */
            width: 100%;
            min-width: 100%;
            max-width: 100vw;
            position: relative;
          }

          html {
            height: 100%;
            height: 100dvh; /* Dynamic viewport height */
            overflow: hidden;
            width: 100%;
            min-width: 100%;
            max-width: 100vw;
            position: relative;
            /* Correct font size; prevent Chrome shrink */
            font-size: 16px;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
          }

          /* Reset */
          * {
            box-sizing: border-box;
          }

          /* CSS vars: sidebar width */
          :root {
            --sidebar-width-expanded: 14rem;
            --sidebar-width-collapsed: 3.5rem;
            /* Viewport height via CSS var */
            --viewport-height: 100vh;
            --viewport-height-dynamic: 100dvh;
          }

          /* Root fills viewport */
          #root {
            height: 100vh;
            height: 100dvh; /* Dynamic viewport height */
            position: relative;
            overflow: hidden;
            width: 100%;
            min-width: 100%;
            max-width: 100vw;
          }

          /* Chrome: match Edge layout; no page shrink */
          html.browser-chrome {
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100vw !important;
            font-size: 16px !important;
            -webkit-text-size-adjust: 100% !important;
            text-size-adjust: 100% !important;
            /* No Chrome zoom; match Edge */
            zoom: 1 !important;
          }

          html.browser-chrome body {
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100vw !important;
            overflow-x: hidden !important;
            /* No body zoom */
            zoom: 1 !important;
            font-size: 16px !important;
            -webkit-text-size-adjust: 100% !important;
            text-size-adjust: 100% !important;
          }

          html.browser-chrome #root {
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100vw !important;
            /* No root zoom */
            zoom: 1 !important;
          }

          /* Top nav bar */
          .app-header {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 1100;
            height: 64px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-bottom: 1px dashed rgba(230, 233, 240, 0.6);
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            color: #222;
            overflow: visible;
            width: 100%;
            min-width: 0; /* Prevent overflow on large Chrome screens */
            max-width: 100%; /* Cap at viewport width */
            box-sizing: border-box;
            /* Adapt on zoom */
            padding: 0;
            margin: 0;
          }

          /* Top nav bar (dark) */
          .dark .app-header {
            background: rgba(15, 23, 42, 0.95);
            border-bottom: 1px dashed rgba(148, 163, 184, 0.4);
            color: hsl(0 0% 98%);
          }

          .header-container {
            display: flex;
            align-items: center;
            justify-content: space-between;
            height: 100%;
            max-width: 1800px;
            margin: 0 auto;
            padding: 0 6px;
            position: relative;
            overflow: visible;
            width: 100%;
            min-width: 0; /* Prevent flex child overflow */
            box-sizing: border-box;
          }

          /* Chrome: header-container width */
          html.browser-chrome .header-container {
            width: 100%;
            max-width: 1800px;
            min-width: 0;
            box-sizing: border-box;
          }

          /* Left spacer */
          .header-spacer {
            width: var(--sidebar-width-expanded);
            flex-shrink: 0;
            transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          
          .app-header.sidebar-collapsed .header-spacer {
            width: var(--sidebar-width-collapsed);
          }

          /* Nav menu: fixed to viewport right edge */
          .header-nav {
            display: flex;
            align-items: center;
            gap: 8px;
            z-index: 10;
            flex-shrink: 0;
            min-width: 0;
            /* Fixed to viewport; stays at right on zoom */
            position: fixed;
            right: 6px;
            top: 32px;
            transform: translateY(-50%);
            margin-left: 0;
            margin-right: 0;
            padding-right: 0;
            justify-content: flex-end;
          }

          /* Chrome: match Edge layout */
          html.browser-chrome .header-nav {
            position: fixed;
            right: 6px;
            top: 32px;
            transform: translateY(-50%);
            margin-left: 0;
            justify-content: flex-end;
          }

          /* Edge: right alignment */
          html.browser-edge .header-nav {
            position: fixed;
            right: 6px;
            top: 32px;
            transform: translateY(-50%);
            margin-left: 0;
            justify-content: flex-end;
          }

          html.browser-chrome .custom-sidebar {
            /* Fixed sidebar width */
            width: var(--sidebar-width-expanded);
            min-width: var(--sidebar-width-expanded);
            max-width: var(--sidebar-width-expanded);
            /* Reduce Chrome layout thrash */
            will-change: width;
            transform: translateZ(0); /* GPU layer to reduce jitter */
          }

          html.browser-chrome .custom-sidebar.collapsed {
            width: var(--sidebar-width-collapsed);
            min-width: var(--sidebar-width-collapsed);
            max-width: var(--sidebar-width-collapsed);
          }

          /* Edge: keep original position */
          html.browser-edge .header-nav {
            margin-left: auto;
          }

          /* Command trigger */
          .command-trigger {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            height: 36px;
            padding: 0 12px;
            border: 1px solid rgba(230, 233, 240, 0.8);
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.9);
            color: #666;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            min-width: 240px;
            justify-content: space-between;
          }

          .command-trigger:hover {
            border-color: rgba(99, 102, 241, 0.3);
            box-shadow: 0 2px 6px rgba(99, 102, 241, 0.1);
          }

          /* Command trigger (dark) */
          .dark .command-trigger {
            background: rgba(30, 41, 59, 0.9);
            border-color: rgba(240, 3.7%, 15.9%, 0.8);
            color: hsl(0 0% 98% / 0.8);
          }

          .dark .command-trigger:hover {
            border-color: rgba(99, 102, 241, 0.3);
            background: rgba(30, 41, 59, 1);
            color: hsl(0 0% 98%);
          }

          /* Theme toggle */
          .theme-toggle-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            padding: 0;
            border: none;
            border-radius: 6px;
            background: transparent;
            color: #666;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            flex-shrink: 0;
            position: relative;
            z-index: 10;
          }

          .theme-toggle-button:hover {
            background: rgba(0, 0, 0, 0.06);
          }

          .theme-toggle-button:active {
            transform: scale(0.95);
            background: rgba(0, 0, 0, 0.08);
          }

          .theme-toggle-icon {
            width: 18px;
            height: 18px;
          }

          /* Theme toggle (dark) */
          .dark .theme-toggle-button {
            background: transparent;
            color: hsl(0 0% 98% / 0.8);
          }

          .dark .theme-toggle-button:hover {
            background: rgba(255, 255, 255, 0.1);
          }

          .dark .theme-toggle-button:active {
            background: rgba(255, 255, 255, 0.15);
          }

          /* Particle button container */
          .particle-button-wrapper {
            position: relative;
            width: 36px;
            height: 36px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            z-index: 1;
            overflow: hidden;
            isolation: isolate;
          }

          .cosmic-dust-particles {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 150px;
            height: 150px;
            pointer-events: none;
            z-index: 0;
          }

          .particle-button {
            position: relative;
            z-index: 2;
            pointer-events: auto;
          }

          .particle-button .theme-toggle-icon {
            animation: particleScale 3s ease-in-out infinite;
            filter: drop-shadow(0 0 3px rgba(99, 102, 241, 0.6));
          }

          @keyframes particleScale {
            0%, 100% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.1);
            }
          }

          .dark .particle-button .theme-toggle-icon {
            filter: drop-shadow(0 0 3px rgba(139, 92, 246, 0.7));
          }

          /* Chat Icon Animation in Sheet */
          .chat-icon-animated {
            animation: particleScale 3s ease-in-out infinite;
            filter: drop-shadow(0 0 3px rgba(99, 102, 241, 0.6));
          }

          .dark .chat-icon-animated {
            filter: drop-shadow(0 0 3px rgba(139, 92, 246, 0.7));
          }

          /* Chat Sheet Content */

          /* Sheet Header Buttons */
          .sheet-header-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            padding: 0;
            border: none;
            border-radius: 6px;
            background: transparent;
            color: #666;
            cursor: pointer;
            transition:
              background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            flex-shrink: 0;
            -webkit-font-smoothing: antialiased;
          }

          .sheet-header-button:hover {
            background: rgba(0, 0, 0, 0.06);
            color: #333;
          }

          .sheet-header-button:active {
            transform: scale(0.95);
            background: rgba(0, 0, 0, 0.08);
          }

          .sheet-header-button svg {
            width: 16px;
            height: 16px;
          }

          .dark .sheet-header-button {
            color: hsl(0 0% 98% / 0.8);
          }

          .dark .sheet-header-button:hover {
            background: rgba(255, 255, 255, 0.1);
            color: hsl(0 0% 98%);
          }

          .dark .sheet-header-button:active {
            background: rgba(255, 255, 255, 0.15);
          }

          .gochat-history-toggle.is-active {
            background: rgba(6, 182, 212, 0.1);
            color: rgb(8, 145, 178);
            box-shadow: inset 0 0 0 1px rgba(6, 182, 212, 0.22);
          }

          .gochat-history-toggle.is-active:hover {
            background: rgba(6, 182, 212, 0.16);
            color: rgb(14, 116, 144);
            box-shadow: inset 0 0 0 1px rgba(6, 182, 212, 0.28);
          }

          .dark .gochat-history-toggle.is-active {
            background: rgba(34, 211, 238, 0.1);
            color: rgb(103, 232, 249);
            box-shadow: inset 0 0 0 1px rgba(34, 211, 238, 0.2);
          }

          .dark .gochat-history-toggle.is-active:hover {
            background: rgba(34, 211, 238, 0.16);
            color: rgb(165, 243, 252);
            box-shadow: inset 0 0 0 1px rgba(34, 211, 238, 0.26);
          }

          .command-trigger-icon {
            width: 16px;
            height: 16px;
            opacity: 0.5;
          }

          .command-trigger-kbd {
            display: inline-flex;
            align-items: center;
            padding: 2px 6px;
            font-size: 11px;
            font-weight: 600;
            color: #999;
            background: rgba(0, 0, 0, 0.04);
            border-radius: 3px;
            border: 1px solid rgba(230, 233, 240, 0.8);
          }

          .dark .command-trigger-kbd {
            color: hsl(0 0% 98% / 0.7);
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(148, 163, 184, 0.3);
          }

          /* PingStatus - minimal, dark-mode safe */
          .ping-status {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            font-family: "Museo Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif;
            cursor: pointer;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            transition: all 0.2s ease;
            background: transparent;
            border: 1px solid transparent;
          }

          .ping-status:hover {
            background: rgba(0, 0, 0, 0.04);
          }

          .ping-icon {
            font-size: 14px;
            transition: color 0.2s ease;
          }

          .ping-text {
            font-size: 12px;
            font-weight: 500;
            transition: color 0.2s ease;
          }

          /* PingStatus state colors */
          .ping-status-good .ping-icon,
          .ping-status-good .ping-text {
            color: rgb(34, 197, 94); /* Green */
          }

          .ping-status-warning .ping-icon,
          .ping-status-warning .ping-text {
            color: rgb(251, 191, 36); /* Yellow */
          }

          .ping-status-poor .ping-icon,
          .ping-status-poor .ping-text {
            color: rgb(239, 68, 68); /* Red */
          }

          /* PingStatus (dark) */
          .dark .ping-status {
            background: transparent;
            border: 1px solid transparent;
          }

          .dark .ping-status:hover {
            background: rgba(255, 255, 255, 0.08);
          }

          .dark .ping-status-good .ping-icon,
          .dark .ping-status-good .ping-text {
            color: rgb(74, 222, 128); /* Green (dark) */
          }

          .dark .ping-status-warning .ping-icon,
          .dark .ping-status-warning .ping-text {
            color: rgb(253, 224, 71); /* Yellow (dark) */
          }

          .dark .ping-status-poor .ping-icon,
          .dark .ping-status-poor .ping-text {
            color: rgb(248, 113, 113); /* Red (dark) */
          }

          /* Command dialog */
          .command-dialog-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
            z-index: 1300;
            animation: fadeIn 0.15s cubic-bezier(0.4, 0, 0.2, 1);
          }

          .command-dialog-content {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 640px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 16px 70px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
            z-index: 1301;
            animation: slideIn 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
          }

          /* Command dialog (dark) */
          .dark .command-dialog-content {
            background: rgba(15, 23, 42, 0.98);
            box-shadow: 0 16px 70px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(148, 163, 184, 0.2);
            color: hsl(0 0% 98%);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
          }

          /* Command inner styles */
          .command-dialog-content [cmdk-root] {
            padding: 0;
          }

          /* Override Command Tailwind (dark) */
          .dark .command-dialog-content [cmdk-root],
          .dark .command-dialog-content [cmdk-root].bg-white,
          .dark .command-dialog-content [cmdk-root][class*="bg-white"] {
            background: rgba(15, 23, 42, 0.98) !important;
            color: hsl(0 0% 98%) !important;
          }

          .dark .command-dialog-content [cmdk-root][class*="text-slate-950"],
          .dark .command-dialog-content [cmdk-root][class*="text-slate"] {
            color: hsl(0 0% 98%) !important;
          }

          .command-dialog-content [cmdk-input-wrapper] {
            border-bottom: 1px solid rgba(230, 233, 240, 0.8);
            padding: 16px;
          }

          .dark .command-dialog-content [cmdk-input-wrapper] {
            border-bottom: 1px solid rgba(148, 163, 184, 0.4);
          }

          .command-dialog-content [cmdk-input] {
            font-size: 15px;
            padding: 8px 0;
            user-select: text;
            -webkit-user-select: text;
            -moz-user-select: text;
            -ms-user-select: text;
            color: #222;
          }

          .dark .command-dialog-content [cmdk-input] {
            color: hsl(0 0% 98%) !important;
          }

          .dark .command-dialog-content [cmdk-input]::placeholder {
            color: hsl(0 0% 98% / 0.5) !important;
          }

          /* CommandInput search icon color */
          .dark .command-dialog-content [cmdk-input-wrapper] svg {
            color: hsl(0 0% 98% / 0.7) !important;
          }

          .command-dialog-content [cmdk-list] {
            max-height: 400px;
            padding: 8px;
          }

          /* CommandGroup Tailwind (dark) */
          .dark .command-dialog-content [cmdk-group] {
            color: hsl(0 0% 98%) !important;
          }

          .command-dialog-content [cmdk-group-heading] {
            font-size: 12px;
            font-weight: 600;
            color: #666;
            padding: 8px 12px 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .dark .command-dialog-content [cmdk-group-heading] {
            color: hsl(0 0% 98% / 0.6) !important;
          }

          .command-dialog-content [cmdk-item] {
            padding: 10px 12px;
            margin: 2px 0;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 14px;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            color: #222;
          }

          .command-dialog-content [cmdk-item]:hover,
          .command-dialog-content [cmdk-item][data-selected="true"] {
            background: rgba(99, 102, 241, 0.08);
            color: #5B21B6;
          }

          .dark .command-dialog-content [cmdk-item] {
            color: hsl(0 0% 98% / 0.9) !important;
            background: transparent !important;
          }

          .dark .command-dialog-content [cmdk-item]:hover,
          .dark .command-dialog-content [cmdk-item][data-selected="true"] {
            background: rgba(99, 102, 241, 0.15) !important;
            color: hsl(210 100% 75%) !important;
          }

          /* CommandItem selected state */
          .dark .command-dialog-content [cmdk-item][data-selected="true"],
          .dark .command-dialog-content [cmdk-item][data-selected="true"][class*="bg-slate-100"],
          .dark .command-dialog-content [cmdk-item][data-selected="true"][class*="text-slate-900"] {
            background: rgba(99, 102, 241, 0.15) !important;
            color: hsl(210 100% 75%) !important;
          }

          .command-dialog-content [cmdk-item] svg {
            width: 16px;
            height: 16px;
            flex-shrink: 0;
            opacity: 0.7;
            color: inherit;
          }

          .command-dialog-content [cmdk-item]:hover svg,
          .command-dialog-content [cmdk-item][data-selected="true"] svg {
            opacity: 1;
          }

          .dark .command-dialog-content [cmdk-item] svg {
            color: hsl(0 0% 98% / 0.8) !important;
          }

          .dark .command-dialog-content [cmdk-item]:hover svg,
          .dark .command-dialog-content [cmdk-item][data-selected="true"] svg {
            color: hsl(210 100% 70%) !important;
            opacity: 1 !important;
          }

          .command-dialog-content [cmdk-separator] {
            height: 1px;
            background: rgba(230, 233, 240, 0.6);
            margin: 8px 0;
          }

          .dark .command-dialog-content [cmdk-separator] {
            background: rgba(148, 163, 184, 0.4);
          }

          .command-dialog-content [cmdk-empty] {
            padding: 32px 16px;
            text-align: center;
            color: #999;
            font-size: 14px;
          }

          .dark .command-dialog-content [cmdk-empty] {
            color: hsl(0 0% 98% / 0.6) !important;
          }

          /* CommandShortcut (dark) */
          .dark .command-dialog-content [cmdk-shortcut],
          .dark .command-dialog-content .command-shortcut,
          .dark .command-dialog-content span[class*="text-slate-500"] {
            color: hsl(0 0% 98% / 0.6) !important;
          }

          .dark .command-dialog-content [cmdk-item]:hover [cmdk-shortcut],
          .dark .command-dialog-content [cmdk-item][data-selected="true"] [cmdk-shortcut],
          .dark .command-dialog-content [cmdk-item]:hover .command-shortcut,
          .dark .command-dialog-content [cmdk-item][data-selected="true"] .command-shortcut,
          .dark .command-dialog-content [cmdk-item]:hover span[class*="text-slate-500"],
          .dark .command-dialog-content [cmdk-item][data-selected="true"] span[class*="text-slate-500"] {
            color: hsl(210 100% 70%) !important;
          }

          /* Scrollbar - match Home account picker */
          .command-dialog-content [cmdk-list]::-webkit-scrollbar {
            width: 4px;
            height: 4px;
          }

          .command-dialog-content [cmdk-list]::-webkit-scrollbar-track {
            background: transparent;
          }

          .command-dialog-content [cmdk-list]::-webkit-scrollbar-thumb {
            background: rgba(0, 0, 0, 0.2);
            border-radius: 2px;
          }

          .command-dialog-content [cmdk-list]::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 0, 0, 0.3);
          }

          .dark .command-dialog-content [cmdk-list]::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.2);
          }

          .dark .command-dialog-content [cmdk-list]::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.3);
          }

          .command-dialog-content [cmdk-list]::-webkit-scrollbar-corner {
            background: transparent;
          }

          .command-dialog-content [cmdk-list]::-webkit-scrollbar-button {
            display: none;
          }

          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translate(-50%, -50%) translateY(-10px) scale(0.98);
            }
            to {
              opacity: 1;
              transform: translate(-50%, -50%) translateY(0) scale(1);
            }
          }

          /* Nav item base */
          .nav-item {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            height: 36px;
            padding: 0 12px;
            border: none;
            background: transparent;
            color: #222;
            font-size: 14px;
            font-weight: 600;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            white-space: nowrap;
            position: relative;
          }

          .nav-item:hover {
            background: rgba(0, 0, 0, 0.04);
            color: #5B21B6;
          }

          .nav-item svg {
            width: 16px;
            height: 16px;
            flex-shrink: 0;
          }


          .nav-chevron {
            width: 14px;
            height: 14px;
            transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          }

          .nav-chevron.open {
            transform: rotate(180deg);
          }

          /* Nav dropdown */
          .nav-dropdown {
            position: absolute;
            top: calc(100% + 14px);
            right: 0;
            left: 0;
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(230, 233, 240, 0.8);
            border-radius: 0 0 6px 6px;
            border-top: none;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
            padding: 4px;
            z-index: 1200;
            animation: slideDown 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          }

          /* Invisible bridge between button and menu */
          .nav-dropdown::before {
            content: '';
            position: absolute;
            top: -14px;
            left: 0;
            right: 0;
            height: 14px;
            background: transparent;
          }

          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translateY(-4px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .nav-dropdown-item {
            padding: 8px 12px;
            cursor: pointer;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            border-radius: 4px;
            color: #333;
            font-weight: 500;
          }

          .nav-dropdown-item:not(.disabled):hover {
            background: rgba(99, 102, 241, 0.08);
            color: #5B21B6;
          }

          .nav-dropdown-item.disabled {
            opacity: 0.5;
            background: rgba(0, 0, 0, 0.02);
            cursor: not-allowed;
            color: #666;
          }

          /* Sidebar */
          .custom-sidebar {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: var(--sidebar-width-expanded);
            min-width: var(--sidebar-width-expanded); /* Min width */
            max-width: var(--sidebar-width-expanded); /* Max width */
            background: #fff;
            border-right: 1px dashed rgba(230, 233, 240, 0.6);
            z-index: 1150;
            transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1), max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: visible;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            box-sizing: border-box;
          }

          .custom-sidebar.collapsed {
            overflow: visible;
            width: var(--sidebar-width-collapsed);
            min-width: var(--sidebar-width-collapsed); /* Min width */
            max-width: var(--sidebar-width-collapsed); /* Max width */
          }

          /* Sidebar (dark) */
          .dark .custom-sidebar {
            background: rgba(15, 23, 42, 0.95);
            border-right: 1px dashed rgba(148, 163, 184, 0.4);
            color: hsl(0 0% 98%);
          }

          .sidebar-content {
            display: flex;
            flex-direction: column;
            height: 100%;
            min-height: calc(100vh - 64px);
            max-height: calc(100vh - 64px);
            padding: 0;
            position: relative;
            overflow-y: auto;
            overflow-x: visible;
          }

          /* Hide scrollbar, keep scroll */
          .sidebar-content::-webkit-scrollbar {
            width: 6px;
          }

          .sidebar-content::-webkit-scrollbar-track {
            background: transparent;
          }

          .sidebar-content::-webkit-scrollbar-thumb {
            background: rgba(0, 0, 0, 0.1);
            border-radius: 3px;
          }

          .sidebar-content::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 0, 0, 0.15);
          }

          .custom-sidebar.collapsed .sidebar-content {
            padding: 0;
            align-items: stretch;
          }

          .sidebar-menu {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 0;
            padding: 0;
            margin: 0;
            width: 100%;
            overflow-y: auto;
          }

          .custom-sidebar.collapsed .sidebar-menu {
            gap: 0;
            align-items: stretch;
          }

          .sidebar-menu-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 0 16px;
            margin: 0;
            font-size: 15px;
            font-weight: 600;
            color: #222222;
            border-radius: 0;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            height: 56px;
            min-height: 56px;
          }

          .custom-sidebar.collapsed .sidebar-menu-item {
            width: 100%;
            height: 56px;
            padding: 0;
            margin: 0;
            justify-content: center;
            gap: 0;
          }

          .sidebar-menu-item:hover {
            background: rgba(0, 0, 0, 0.04);
            color: #5B21B6;
          }

          .sidebar-menu-item.active {
            background: rgba(91, 33, 182, 0.08);
            color: #5B21B6;
            font-weight: 700;
          }

          /* Sidebar menu items (dark) */
          .dark .sidebar-menu-item {
            color: hsl(0 0% 98% / 0.9);
          }

          .dark .sidebar-menu-item:hover {
            background: rgba(255, 255, 255, 0.08);
            color: hsl(210 100% 70%);
          }

          .dark .sidebar-menu-item.active {
            background: rgba(99, 102, 241, 0.15);
            color: hsl(210 100% 75%);
          }

          /* Icon colors hover/active (dark) */
          .dark .sidebar-menu-item:hover .sidebar-icon svg {
            color: hsl(210 100% 70%);
          }

          .dark .sidebar-menu-item.active .sidebar-icon svg {
            color: hsl(210 100% 75%);
          }

          /* Sidebar labels (dark) */
          .dark .sidebar-label {
            color: hsl(0 0% 98% / 0.9);
          }

          .sidebar-icon {
            width: 22px;
            height: 22px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 0;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }

          .sidebar-icon svg {
            display: block;
            margin: 0 !important;
            padding: 0 !important;
            width: 100%;
            height: 100%;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            color: inherit;
          }

          .custom-sidebar.collapsed .sidebar-icon {
            width: 22px;
            height: 22px;
            margin: 0 !important;
          }

          .sidebar-label {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex: 1;
            opacity: 1;
            visibility: visible;
            transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1) 0.15s, 
                        visibility 0s linear 0s;
          }

          .custom-sidebar.collapsed .sidebar-label {
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.1s cubic-bezier(0.4, 0, 0.2, 1) 0s,
                        visibility 0s linear 0.1s;
          }

          /* Sidebar header - Team Switcher */
          .sidebar-header {
            height: 64px;
            display: flex;
            align-items: center;
            padding: 0;
            border-bottom: 1px dashed rgba(230, 233, 240, 0.6);
            background: #fff;
            position: relative;
          }

          /* Sidebar header (dark) */
          .dark .sidebar-header {
            background: rgba(15, 23, 42, 0.95);
            border-bottom: 1px dashed rgba(148, 163, 184, 0.4);
          }

          /* Team Switcher */
          .team-switcher-container {
            position: relative;
            width: 100%;
            height: 100%;
            padding: 0 12px;
          }

          .team-switcher-trigger {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 0;
            border: none;
            border-radius: 0;
            background: transparent;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            width: 100%;
            height: 100%;
          }

          .team-switcher-trigger:hover {
            background: transparent;
          }

          .team-switcher-trigger.active {
            background: transparent;
          }

          .team-switcher-trigger.collapsed {
            padding: 0;
            justify-content: center;
          }

          .team-switcher-trigger:active {
            opacity: 0.7;
          }

          .team-icon {
            width: 32px;
            height: 32px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.08);
            color: rgba(0, 0, 0, 0.65);
            flex-shrink: 0;
          }

          .dark .team-icon {
            background: rgba(255, 255, 255, 0.12);
            color: hsl(0 0% 98% / 0.8);
          }

          .team-icon img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 6px;
          }

          .team-icon svg {
            width: 18px;
            height: 18px;
          }

          .team-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 0;
          }

          .team-name {
            font-size: 13px;
            font-weight: 600;
            color: #111;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .dark .team-name {
            color: hsl(0 0% 98%);
          }

          .team-type {
            font-size: 11px;
            color: #666;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .dark .team-type {
            color: hsl(0 0% 98% / 0.7);
          }

          .team-arrow {
            width: 16px;
            height: 16px;
            color: #666;
            transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            flex-shrink: 0;
          }

          .team-arrow.open {
            transform: rotate(180deg);
          }

          /* Team Switcher Dropdown */
          .team-switcher-dropdown {
            position: absolute;
            top: calc(100% + 8px);
            left: 12px;
            right: 12px;
            background: #fff;
            border: 1px solid rgba(230, 233, 240, 0.8);
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            z-index: 100;
            padding: 4px;
            min-width: 240px;
            animation: slideDown 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          }

          .dark .team-switcher-dropdown {
            background: hsl(240 10% 3.9%);
            border: 1px solid rgba(240, 3.7%, 15.9%, 0.8);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          }

          .team-switcher-dropdown.collapsed {
            left: auto;
            right: auto;
            min-width: 200px;
          }

          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translateY(-8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .team-dropdown-header {
            padding: 8px 12px;
            font-size: 11px;
            font-weight: 600;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .dark .team-dropdown-header {
            color: hsl(0 0% 98% / 0.6);
          }

          .team-dropdown-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px 12px;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
          }

          .team-dropdown-item:hover {
            background: rgba(0, 0, 0, 0.04);
          }

          .dark .team-dropdown-item:hover {
            background: rgba(255, 255, 255, 0.08);
          }

          .team-dropdown-item.active {
            background: rgba(0, 0, 0, 0.06);
          }

          .dark .team-dropdown-item.active {
            background: rgba(255, 255, 255, 0.12);
          }

          /* Selected org: display only, not clickable */
          .team-dropdown-item.current-no-action {
            cursor: default;
          }
          .team-dropdown-item.current-no-action:hover {
            background: rgba(0, 0, 0, 0.06);
          }
          .dark .team-dropdown-item.current-no-action:hover {
            background: rgba(255, 255, 255, 0.12);
          }

          .team-dropdown-item.add-team {
            color: rgba(0, 0, 0, 0.65);
            font-weight: 500;
          }

          .dark .team-dropdown-item.add-team {
            color: hsl(0 0% 98% / 0.8);
          }

          .team-item-icon {
            width: 28px;
            height: 28px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.06);
            color: rgba(0, 0, 0, 0.6);
            flex-shrink: 0;
          }

          .dark .team-item-icon {
            background: rgba(255, 255, 255, 0.1);
            color: hsl(0 0% 98% / 0.8);
          }

          .team-item-icon img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 6px;
          }

          .team-item-icon svg {
            width: 16px;
            height: 16px;
          }

          .team-item-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 0;
          }

          .team-item-name {
            font-size: 13px;
            font-weight: 500;
            color: #111;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .dark .team-item-name {
            color: hsl(0 0% 98%);
          }

          .team-item-type {
            font-size: 11px;
            color: #666;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .dark .team-item-type {
            color: hsl(0 0% 98% / 0.7);
          }

          .team-item-check {
            width: 16px;
            height: 16px;
            color: rgba(0, 0, 0, 0.6);
            flex-shrink: 0;
          }

          .dark .team-item-check {
            color: hsl(0 0% 98% / 0.8);
          }

          .team-dropdown-divider {
            height: 1px;
            background: rgba(230, 233, 240, 0.6);
            margin: 4px 0;
          }

          .dark .team-dropdown-divider {
            background: rgba(148, 163, 184, 0.4);
          }

          .sidebar-footer {
            padding: 0;
            border-top: 1px dashed rgba(230, 233, 240, 0.4);
            width: 100%;
            margin-top: auto;
            flex-shrink: 0;
            position: relative;
            background: #fff;
            box-sizing: border-box;
          }

          .dark .sidebar-footer {
            background: rgba(15, 23, 42, 0.95);
            border-top: 1px dashed rgba(148, 163, 184, 0.3);
          }

          .custom-sidebar.collapsed .sidebar-footer {
            padding: 0;
            display: flex;
            align-items: stretch;
            justify-content: center;
            background: #fff;
            position: relative;
            overflow: visible;
          }

          .dark .custom-sidebar.collapsed .sidebar-footer {
            background: rgba(15, 23, 42, 0.95);
          }

          .custom-sidebar.collapsed .user-menu-container {
            width: 100%;
            overflow: visible;
            position: relative;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            transform: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* User menu container */
          .user-menu-container {
            position: relative;
            width: 100%;
            overflow: visible;
          }

          /* User menu trigger */
          .user-menu-trigger {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px 10px 14px;
            cursor: pointer;
            transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            width: 100%;
            min-height: 56px;
            height: 56px;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            border-radius: 0;
            background: transparent;
            position: relative;
            margin: 0;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
          }

          .custom-sidebar.collapsed .user-menu-trigger {
            justify-content: center;
            padding: 0 !important;
            height: 56px;
            min-height: 56px;
            max-height: 56px;
            background: transparent;
            position: relative;
            z-index: 1;
            margin: 0 !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            transform: none !important;
            contain: layout;
            box-sizing: border-box;
            width: 100%;
            flex-shrink: 0;
          }

          .custom-sidebar.collapsed .user-menu-trigger:hover {
            background: rgba(0, 0, 0, 0.04);
          }

          .dark .custom-sidebar.collapsed .user-menu-trigger:hover {
            background: rgba(255, 255, 255, 0.08);
          }

          .custom-sidebar.collapsed .user-menu-trigger.active {
            background: rgba(91, 33, 182, 0.06);
          }

          .dark .custom-sidebar.collapsed .user-menu-trigger.active {
            background: rgba(99, 102, 241, 0.15);
          }

          .user-menu-trigger:hover {
            background: rgba(0, 0, 0, 0.04);
          }

          .dark .user-menu-trigger:hover {
            background: rgba(255, 255, 255, 0.08);
          }

          .user-menu-trigger.active {
            background: rgba(91, 33, 182, 0.06);
          }

          .dark .user-menu-trigger.active {
            background: rgba(99, 102, 241, 0.15);
          }

          /* User avatar */
          .user-avatar {
            width: 34px;
            height: 34px;
            border-radius: 50%;
            overflow: hidden;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: 2px solid rgba(230, 233, 240, 0.8);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            align-self: center;
          }

          .user-menu-trigger:hover .user-avatar {
            border-color: #5B21B6;
            box-shadow: 0 0 0 2px rgba(91, 33, 182, 0.1);
          }

          /* Avatar centered when collapsed */
          .custom-sidebar.collapsed .user-avatar {
            align-self: center;
            width: 32px;
            height: 32px;
            position: relative;
            margin: 0 auto !important;
            flex-shrink: 0;
            transform: none !important;
          }

          .user-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .default-avatar-icon {
            width: 18px;
            height: 18px;
            color: white;
          }

          .custom-sidebar.collapsed .default-avatar-icon {
            width: 16px;
            height: 16px;
          }

          /* User info */
          .user-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 5px;
            min-width: 0;
            overflow: hidden;
            justify-content: center;
            opacity: 1;
            visibility: visible;
            transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1) 0.15s,
                        visibility 0s linear 0s;
          }

          .custom-sidebar.collapsed .user-info {
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.1s cubic-bezier(0.4, 0, 0.2, 1) 0s,
                        visibility 0s linear 0.1s;
          }

          .user-name {
            font-size: 13px;
            font-weight: 600;
            color: #222;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1;
            text-align: center;
            width: 100%;
          }

          .dark .user-name {
            color: hsl(0 0% 98%);
          }

          /* User role badge */
          .user-role {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 9px;
            font-weight: 600;
            color: #5B21B6;
            background: rgba(91, 33, 182, 0.1);
            padding: 2px 8px;
            border-radius: 8px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
            height: 18px;
            line-height: 1;
            letter-spacing: 0.4px;
            text-transform: uppercase;
            border: 1px solid rgba(91, 33, 182, 0.15);
          }

          .dark .user-role {
            color: hsl(250 100% 91%);
            background: rgba(99, 102, 241, 0.15);
            border: 1px solid rgba(99, 102, 241, 0.2);
          }

          /* User menu dropdown */
          .user-menu-dropdown {
            position: absolute;
            bottom: calc(100% + 8px);
            left: 8px;
            right: 8px;
            background: white;
            border: 1px solid rgba(230, 233, 240, 0.8);
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
            padding: 6px;
            z-index: 1100;
            animation: slideUp 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
            pointer-events: auto;
          }

          .dark .user-menu-dropdown {
            background: hsl(240 10% 3.9%);
            border: 1px solid rgba(240, 3.7%, 15.9%, 0.8);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
          }

          .custom-sidebar.collapsed .user-menu-dropdown {
            left: 50%;
            right: auto;
            transform: translateX(-50%);
            width: auto;
            min-width: 44px;
            max-width: 44px;
            animation: slideUpCentered 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            white-space: nowrap;
            will-change: transform;
            margin: 0;
            position: absolute;
            pointer-events: auto;
            z-index: 1100;
            padding: 5px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }

          /* Collapsed menu: icons only */
          .user-menu-dropdown.collapsed .user-menu-item {
            justify-content: center;
            align-items: center;
            padding: 0;
            min-width: 34px;
            width: 34px;
            height: 34px;
            margin: 0;
            border-radius: 6px;
            box-sizing: border-box;
            display: flex;
            position: relative;
            gap: 0;
            flex-shrink: 0;
          }

          .user-menu-dropdown.collapsed .user-menu-item .menu-item-icon {
            margin: 0;
            width: 17px;
            height: 17px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .user-menu-dropdown.collapsed .user-menu-divider {
            margin: 3px 0;
            width: calc(100% - 10px);
            align-self: center;
            flex-shrink: 0;
          }

          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(8px) scale(0.95);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          @keyframes slideUpCentered {
            from {
              opacity: 0;
              transform: translateX(-50%) translateY(8px) scale(0.95);
            }
            to {
              opacity: 1;
              transform: translateX(-50%) translateY(0) scale(1);
            }
          }

          /* Menu item */
          .user-menu-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 14px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            font-size: 14px;
            font-weight: 500;
            color: #333;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
          }

          .user-menu-item:hover {
            background: rgba(99, 102, 241, 0.08);
            color: #5B21B6;
          }

          .user-menu-item.account-item:hover {
            background: rgba(0, 0, 0, 0.04);
            color: #333;
          }

          .user-menu-item.logout:hover {
            background: rgba(239, 68, 68, 0.08);
            color: #ef4444;
          }

          /* Collapsed item hover: centered */
          .user-menu-dropdown.collapsed .user-menu-item:hover {
            background: rgba(99, 102, 241, 0.08);
            color: #5B21B6;
            transform: none;
            margin: 0;
            justify-content: center;
            align-items: center;
          }

          .user-menu-dropdown.collapsed .user-menu-item:hover .menu-item-icon {
            margin: 0;
            transform: none;
          }

          .user-menu-dropdown.collapsed .user-menu-item.account-item:hover {
            background: rgba(0, 0, 0, 0.04);
            color: #333;
            transform: none;
            margin: 0;
            justify-content: center;
            align-items: center;
          }

          .user-menu-dropdown.collapsed .user-menu-item.account-item:hover .menu-item-icon {
            margin: 0;
            transform: none;
          }

          .user-menu-dropdown.collapsed .user-menu-item.logout:hover {
            background: rgba(239, 68, 68, 0.08);
            color: #ef4444;
            transform: none;
            margin: 0;
            justify-content: center;
            align-items: center;
          }

          .user-menu-dropdown.collapsed .user-menu-item.logout:hover .menu-item-icon {
            margin: 0;
            transform: none;
          }

          /* User menu items/icons (dark) */
          .dark .user-menu-item {
            color: hsl(0 0% 98% / 0.9);
          }

          .dark .user-menu-item:hover {
            background: rgba(255, 255, 255, 0.08);
            color: hsl(0 0% 98%);
          }

          .dark .user-menu-item.account-item:hover {
            background: rgba(255, 255, 255, 0.06);
            color: hsl(0 0% 98% / 0.9);
          }

          .dark .user-menu-item.logout:hover {
            background: rgba(239, 68, 68, 0.15);
            color: #f87171;
          }

          .menu-item-icon {
            width: 18px;
            height: 18px;
            flex-shrink: 0;
          }

          .dark .menu-item-icon {
            color: hsl(0 0% 98% / 0.8);
          }

          /* Menu divider */
          .user-menu-divider {
            height: 1px;
            background: rgba(230, 233, 240, 0.6);
            margin: 4px 6px;
          }

          .dark .user-menu-divider {
            background: rgba(148, 163, 184, 0.4);
          }

          /* Logout confirm popover */
          .logout-confirm-bubble {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1500;
            background: rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(2px);
            animation: fadeIn 0.15s cubic-bezier(0.4, 0, 0.2, 1);
          }

          .logout-confirm-content {
            background: white;
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
            width: 90%;
            max-width: 420px;
            overflow: hidden;
            animation: slideInBubble 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          }

          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes slideInBubble {
            from {
              opacity: 0;
              transform: translateY(-10px) scale(0.95);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          .logout-confirm-header {
            padding: 20px 24px 16px;
            border-bottom: 1px solid rgba(230, 233, 240, 0.8);
          }

          .logout-confirm-header h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #222;
          }

          .logout-confirm-body {
            padding: 20px 24px;
          }

          .logout-confirm-body p {
            margin: 0;
            font-size: 14px;
            line-height: 1.5;
            color: #666;
          }

          .logout-confirm-footer {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            padding: 16px 24px 20px;
            border-top: 1px solid rgba(230, 233, 240, 0.8);
          }

          .logout-confirm-btn {
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            border: 1px solid transparent;
            outline: none;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
          }

          .logout-confirm-btn.cancel-btn {
            background: white;
            border-color: rgba(230, 233, 240, 0.8);
            color: #333;
          }

          .logout-confirm-btn.cancel-btn:hover {
            background: rgba(0, 0, 0, 0.04);
            border-color: rgba(230, 233, 240, 1);
          }

          .logout-confirm-btn.logout-btn {
            background: #ef4444;
            color: white;
            border-color: #ef4444;
          }

          .logout-confirm-btn.logout-btn:hover {
            background: #dc2626;
            border-color: #dc2626;
          }

          .logout-confirm-btn:active {
            transform: scale(0.98);
          }

          /* Sidebar toggle */
          .sidebar-edge-toggle {
            position: absolute;
            right: -18px;
            transform: translateY(-50%);
            width: 36px;
            height: 36px;
            background: #ffffff;
            border: 1px solid rgba(230, 233, 240, 0.8);
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: grab;
            z-index: 1050;
            transition: background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
            padding: 0;
            line-height: 0;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
          }

          .sidebar-edge-toggle.dragging {
            cursor: grabbing;
            box-shadow: 0 4px 16px rgba(91, 33, 182, 0.3);
            border-color: rgba(91, 33, 182, 0.6);
            background: rgba(245, 243, 255, 0.95);
          }

          .sidebar-edge-toggle:hover:not(.dragging) {
            background: rgba(245, 245, 245, 0.95);
            border-color: rgba(200, 200, 210, 0.9);
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);
          }

          .sidebar-edge-toggle svg {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 20px;
            height: 20px;
            color: #666;
            transition: color 0.2s ease;
            display: block;
            margin: 0;
            flex-shrink: 0;
          }

          .sidebar-edge-toggle:hover svg {
            color: #5B21B6;
          }

          .sidebar-edge-toggle:active {
            background: rgba(235, 235, 240, 1);
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
          }

          /* Sidebar toggle (dark) */
          .dark .sidebar-edge-toggle {
            background: rgba(30, 41, 59, 0.95);
            border-color: rgba(148, 163, 184, 0.3);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          }

          .dark .sidebar-edge-toggle.dragging {
            box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
            border-color: rgba(99, 102, 241, 0.5);
            background: rgba(30, 41, 59, 1);
          }

          .dark .sidebar-edge-toggle:hover:not(.dragging) {
            background: rgba(51, 65, 85, 0.95);
            border-color: rgba(148, 163, 184, 0.5);
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4);
          }

          .dark .sidebar-edge-toggle svg {
            color: hsl(0 0% 98%);
          }

          .dark .sidebar-edge-toggle:hover svg {
            color: hsl(210 100% 70%);
          }

          .dark .sidebar-edge-toggle:active {
            background: rgba(51, 65, 85, 1);
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
          }

          /* Main content */
          .main-content {
            height: calc(100vh - 64px);
            height: calc(100dvh - 64px); /* Dynamic viewport height */
            position: fixed;
            top: 64px;
            left: var(--sidebar-width-expanded);
            width: calc(100% - var(--sidebar-width-expanded));
            min-width: 0; /* Prevent overflow on large Chrome screens */
            max-width: calc(100vw - var(--sidebar-width-expanded)); /* Cap at viewport width */
            transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 1;
            background: transparent;
            overflow-y: auto;
            overflow-x: hidden;
            box-sizing: border-box;
          }

          .main-content.sidebar-collapsed {
            left: var(--sidebar-width-collapsed);
            width: calc(100% - var(--sidebar-width-collapsed));
            max-width: calc(100vw - var(--sidebar-width-collapsed)); /* Cap at viewport width */
          }

          .main-content.sidebar-expanded {
            left: var(--sidebar-width-expanded);
            width: calc(100% - var(--sidebar-width-expanded));
            max-width: calc(100vw - var(--sidebar-width-expanded)); /* Cap at viewport width */
          }

          /* Chrome: keep main content right edge stable */
          /* Fixed elements: use left+right, not left+width */
          html.browser-chrome .main-content {
            /* left+right pins right edge to viewport */
            left: var(--sidebar-width-expanded) !important;
            right: 0 !important;
            /* No width; left+right compute width */
            width: auto !important;
            /* Reduce Chrome layout thrash */
            will-change: left;
            transform: translateZ(0); /* GPU acceleration */
            /* Onlytransition left，do nottransition width */
            transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          }

          html.browser-chrome .main-content.sidebar-collapsed {
            left: var(--sidebar-width-collapsed) !important;
            right: 0 !important;
            width: auto !important;
          }

          html.browser-chrome .main-content.sidebar-expanded {
            left: var(--sidebar-width-expanded) !important;
            right: 0 !important;
            width: auto !important;
          }

          /* Docs: full-width main; chapter nav + body */
          .main-content.docs-route-main {
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            max-width: 100vw !important;
            display: flex;
            flex-direction: row;
            align-items: stretch;
            overflow: hidden !important;
            padding: 0 !important;
          }

          html.browser-chrome .main-content.docs-route-main {
            left: 0 !important;
            right: 0 !important;
            width: auto !important;
            max-width: none !important;
          }

          .docs-layout-shell {
            display: flex;
            flex: 1;
            min-height: 0;
            min-width: 0;
            width: 100%;
            height: 100%;
            /* Matches DispatchAccessCenterDoc scroll-mt and JS TOC */
            --docs-toc-gap: 16px;
          }

          .benchmark-scrollable::-webkit-scrollbar {
            width: 8px;
            height: 8px;
            background-color: transparent;
          }
          .benchmark-scrollable::-webkit-scrollbar-track {
            background-color: transparent;
            border-radius: 4px;
          }
          .benchmark-scrollable::-webkit-scrollbar-thumb {
            background-color: rgba(0, 0, 0, 0.2);
            border-radius: 4px;
            border: 1px solid transparent;
            background-clip: content-box;
          }
          .benchmark-scrollable::-webkit-scrollbar-thumb:hover {
            background-color: rgba(0, 0, 0, 0.3);
          }
          .benchmark-scrollable::-webkit-scrollbar-thumb:active {
            background-color: rgba(0, 0, 0, 0.4);
          }
          .benchmark-scrollable {
            scrollbar-width: thin;
            scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
          }
          .dark .benchmark-scrollable::-webkit-scrollbar-thumb {
            background-color: rgba(255, 255, 255, 0.25);
          }
          .dark .benchmark-scrollable::-webkit-scrollbar-thumb:hover {
            background-color: rgba(255, 255, 255, 0.35);
          }
          .dark .benchmark-scrollable::-webkit-scrollbar-thumb:active {
            background-color: rgba(255, 255, 255, 0.45);
          }
          .dark .benchmark-scrollable {
            scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
          }

          .docs-chapters {
            width: var(--sidebar-width-expanded);
            min-width: var(--sidebar-width-expanded);
            max-width: var(--sidebar-width-expanded);
            flex-shrink: 0;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 1rem 0.75rem 1.5rem;
            box-sizing: border-box;
            background: rgba(255, 255, 255, 0.96);
            border-right: 1px dashed rgba(230, 233, 240, 0.6);
          }

          .dark .docs-chapters {
            background: rgba(15, 23, 42, 0.98);
            border-right-color: rgba(148, 163, 184, 0.4);
          }


          .docs-chapters-parent-title {
            font-size: 11px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: rgb(100, 116, 139);
            margin: 0 0 0.5rem 0.25rem;
            font-weight: 700;
          }

          .dark .docs-chapters-parent-title {
            color: rgb(148, 163, 184);
          }

          .docs-chapters-section + .docs-chapters-section .docs-chapters-parent-title {
            margin-top: 0.85rem;
            padding-top: 0.35rem;
            border-top: 1px dashed rgba(226, 232, 240, 0.9);
          }

          .dark .docs-chapters-section + .docs-chapters-section .docs-chapters-parent-title {
            border-top-color: rgba(71, 85, 105, 0.45);
          }

          .docs-chapter-link {
            display: block;
            width: 100%;
            text-align: left;
            font-size: 13px;
            line-height: 1.35;
            padding: 0.4rem 0.5rem;
            margin-bottom: 2px;
            border: none;
            border-radius: 6px;
            background: transparent;
            color: rgb(51, 65, 85);
            cursor: pointer;
            transition: background 0.15s ease, color 0.15s ease;
          }

          .docs-chapter-link:hover {
            background: rgba(241, 245, 249, 0.95);
            color: rgb(15, 23, 42);
          }

          .docs-chapter-link.active {
            background: rgba(91, 33, 182, 0.08);
            color: #5b21b6;
            font-weight: 700;
          }

          .docs-chapter-link.active:hover {
            background: rgba(91, 33, 182, 0.1);
            color: #5b21b6;
          }

          .dark .docs-chapter-link {
            color: rgb(203, 213, 225);
          }

          .dark .docs-chapter-link:hover {
            background: rgba(51, 65, 85, 0.5);
            color: rgb(248, 250, 252);
          }

          .dark .docs-chapter-link.active {
            background: rgba(99, 102, 241, 0.15);
            color: hsl(210 100% 75%);
          }

          .dark .docs-chapter-link.active:hover {
            background: rgba(99, 102, 241, 0.2);
            color: hsl(210 100% 75%);
          }

          .docs-main-pane {
            flex: 1;
            min-width: 0;
            overflow-y: auto;
            overflow-x: hidden;
            box-sizing: border-box;
          }

          .app-header.docs-mode .header-spacer {
            width: var(--sidebar-width-expanded) !important;
            flex-shrink: 0;
          }

          .app-header.docs-mode.sidebar-collapsed .header-spacer {
            width: var(--sidebar-width-expanded) !important;
          }

          .header-docs-team-fixed {
            position: fixed;
            top: 0;
            left: 0;
            z-index: 1101;
            width: var(--sidebar-width-expanded);
            height: 64px;
            display: flex;
            align-items: center;
            box-sizing: border-box;
            background: rgba(255, 255, 255, 0.95);
            border-bottom: 1px dashed rgba(230, 233, 240, 0.6);
            border-right: 1px dashed rgba(230, 233, 240, 0.6);
          }

          .dark .header-docs-team-fixed {
            background: rgba(15, 23, 42, 0.95);
            border-bottom-color: rgba(148, 163, 184, 0.4);
            border-right-color: rgba(148, 163, 184, 0.4);
          }

          .header-docs-team-fixed .team-switcher-container {
            width: 100%;
            height: 100%;
            padding: 0 12px;
            display: flex;
            align-items: center;
            box-sizing: border-box;
          }


          .main-content.docs-route-main .main-content-inner {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }

          .dark .main-content.docs-route-main .main-content-inner {
            background: transparent !important;
          }

          /* Main content background (dark) */
          .dark .main-content {
            background: rgba(248, 250, 252, 1) !important;
          }

          /* Main content inner */
          .main-content-inner {
            background: #fff;
            min-height: 100%;
            padding: 0 16px;
            max-width: 1800px;
            margin: 0 auto;
            width: 100%;
            min-width: 0; /* Prevent overflow on large Chrome screens */
            box-sizing: border-box;
          }

          /* Chrome: main inner width */
          html.browser-chrome .main-content-inner {
            width: 100%;
            max-width: 1800px;
            min-width: 0;
            box-sizing: border-box;
          }

          /* Main inner background (dark) */
          .dark .main-content-inner {
            background: rgba(248, 250, 252, 1) !important;
          }
          
          /* Reset CSS vars in main for dark theme */
          /* Exclude badges */
          .dark .main-content-inner,
          .dark .main-content-inner *:not(.role-badge):not(.role-badge *):not(.status-badge):not(.status-badge *):not(.status-badge-active):not(.status-badge-unknown):not(.status-badge-invalid):not(.status-badge-loading):not(.status-dot):not(.status-loading-spinner) {
            --background: 0 0% 100% !important;
            --foreground: 240 10% 3.9% !important;
            --card: 0 0% 100% !important;
            --card-foreground: 240 10% 3.9% !important;
            --popover: 0 0% 100% !important;
            --popover-foreground: 240 10% 3.9% !important;
            --primary: 240 5.9% 10% !important;
            --primary-foreground: 0 0% 98% !important;
            --secondary: 240 4.8% 95.9% !important;
            --secondary-foreground: 240 5.9% 10% !important;
            --muted: 240 4.8% 95.9% !important;
            --muted-foreground: 240 3.8% 46.1% !important;
            --accent: 240 4.8% 95.9% !important;
            --accent-foreground: 240 5.9% 10% !important;
            --destructive: 0 84.2% 60.2% !important;
            --destructive-foreground: 0 0% 98% !important;
            --border: 240 5.9% 90% !important;
            --input: 240 5.9% 90% !important;
            --ring: 240 5.9% 10% !important;
          }
          
          /* Buttons in main keep light styles */
          .dark .main-content-inner button[class*="bg-primary"],
          .dark .main-content-inner [class*="bg-primary"] {
            background-color: hsl(240 5.9% 10%) !important;
            color: hsl(0 0% 98%) !important;
          }
          
          .dark .main-content-inner button[class*="bg-secondary"],
          .dark .main-content-inner [class*="bg-secondary"] {
            background-color: hsl(240 4.8% 95.9%) !important;
            color: hsl(240 5.9% 10%) !important;
          }
          
          /* Text in main keeps light colors */
          .dark .main-content-inner [class*="text-foreground"],
          .dark .main-content-inner [class*="text-primary"] {
            color: hsl(240 10% 3.9%) !important;
          }
          
          .dark .main-content-inner [class*="text-muted-foreground"] {
            color: hsl(240 3.8% 46.1%) !important;
          }
          
          /* Non-Tailwind text in main */
          .dark .main-content-inner {
            color: rgb(34, 13, 78) !important;
          }
          
          .dark .main-content-inner h1,
          .dark .main-content-inner h2,
          .dark .main-content-inner h3,
          .dark .main-content-inner h4,
          .dark .main-content-inner h5,
          .dark .main-content-inner h6,
          .dark .main-content-inner p,
          .dark .main-content-inner span:not(.role-badge):not(.status-badge):not(.status-badge *):not(.status-dot):not(.status-loading-spinner):not(.date-marker):not(.date-marker *):not(.calendar-date-text):not(.calendar-date-text *),
          .dark .main-content-inner div:not(.role-badge):not(.status-badge):not(.status-badge-active):not(.status-badge-unknown):not(.status-badge-invalid):not(.status-badge-loading):not(.date-marker):not(.date-marker *):not(.calendar-date-cell):not(.calendar-date-cell *) {
            color: inherit !important;
          }

          /* Top nav unaffected by drawer blur */
          .app-header {
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
          }
          `}
        </style>

      <div ref={layoutContainerRef} style={{ width: '100%', height: '100%' }}>
        {/* Top nav bar */}
        <header className={`app-header ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${isDocsRoute ? 'docs-mode' : ''}`}>
          {/* Docs: Team aligned with default sidebar top (fixed viewport column) */}
          {isDocsRoute ? (
            <div className="header-docs-team-fixed">
              <TeamSwitcher
                collapsed={false}
                onExpandSidebar={() => {}}
                docsHeaderExitMode
                onDocsHeaderExit={exitDocsToApp}
              />
            </div>
          ) : null}
          <div className="header-container">
            <div className="header-spacer" />
            
            {/* Right: nav menu */}
            <nav className="header-nav">
              {/* PingStatus - minimal, dark-mode safe */}
              <button
                type="button"
                onClick={() => navigate(WORKBENCH_DOCS_PATH)}
                className="inline-flex items-center h-8 px-2 text-xs font-medium text-gray-700 dark:text-slate-200 bg-transparent border-0 shadow-none rounded-md hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors"
                title="Docs"
              >
                Docs
              </button>

              <div 
                className={`ping-status ping-status-${pingStatus.status}`}
                onClick={checkPing}
                title="Click to check network status"
              >
                <MdOutlineWifi className="ping-icon" />
                <span className="ping-text">
                  {getPingStatusText()}
                </span>
              </div>
              
              {/* Links Checker - Command */}
              <button 
                className="command-trigger"
                onClick={() => setCommandOpen(true)}
              >
                <BsSearch className="command-trigger-icon" />
                <span>Searching Tab...</span>
                <span className="command-trigger-kbd">⌘K</span>
              </button>
              
              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="theme-toggle-button"
                title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                aria-label="Toggle theme"
              >
                {theme === 'light' ? (
                  <BsMoon className="theme-toggle-icon" />
                ) : (
                  <BsSun className="theme-toggle-icon" />
                )}
              </button>
              
              {/* Settings button */}
              <button
                onClick={() => setSettingsDrawerOpen(true)}
                className="theme-toggle-button"
                title="Settings"
                aria-label="Settings"
              >
                <BsHouseGear className="theme-toggle-icon" />
              </button>
              
              {/* Go Chat button */}
              <Sheet open={chatSheetOpen} onOpenChange={setChatSheetOpen}>
                <SheetTrigger asChild>
                  <div className="particle-button-wrapper">
                    <button
                      className="theme-toggle-button particle-button"
                      title="Go chat"
                      aria-label="Go chat"
                    >
                      <BsHexagonHalf className="theme-toggle-icon" />
                    </button>
                  </div>
                </SheetTrigger>
                <SheetContent 
                  side="right" 
                  className={cn(
                    'chat-sheet-content w-full p-0 flex flex-col h-full',
                    chatSheetExpanded && 'chat-sheet-expanded',
                    gochatHistoryOpen && userKey && 'chat-sheet-with-history'
                  )}
                  style={{ pointerEvents: 'auto' }}
                >
                  <SheetHeader className="sr-only">
                    <SheetTitle>Gochat Assistant</SheetTitle>
                    <SheetDescription>Interact with the Gochat AI assistant.</SheetDescription>
                  </SheetHeader>
                  {/* Custom Header with Buttons */}
                  <div className="gochat-sheet-toolbar flex items-center justify-between p-3">
                    <div className="flex items-center gap-2">
                      {/* Expand/Minimize Button */}
                      <button
                        onClick={() => setChatSheetExpanded(!chatSheetExpanded)}
                        className="sheet-header-button"
                        title={chatSheetExpanded ? "Minimize" : "Expand"}
                        aria-label={chatSheetExpanded ? "Minimize" : "Expand"}
                      >
                        {chatSheetExpanded ? (
                          <Minimize2 className="h-4 w-4" />
                        ) : (
                          <Maximize2 className="h-4 w-4" />
                        )}
                      </button>
                      {userKey ? (
                        <button
                          type="button"
                          onClick={() => setGochatHistoryOpen((open) => !open)}
                          className={cn(
                            'sheet-header-button gochat-history-toggle',
                            gochatHistoryOpen && 'is-active'
                          )}
                          title="Conversation history"
                          aria-label="Conversation history"
                          aria-pressed={gochatHistoryOpen}
                        >
                          <PanelLeft className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Close Button */}
                      <button
                        onClick={() => {
                          setChatSheetOpen(false);
                          setChatSheetExpanded(false);
                        }}
                        className="sheet-header-button"
                        title="Close"
                        aria-label="Close"
                      >
                        <XIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div
                    className={cn(
                      'gochat-sheet-body flex min-h-0 flex-1 overflow-hidden',
                      userKey ? 'flex-col md:flex-row' : 'flex-col'
                    )}
                  >
                    {userKey ? (
                      <GochatHistoryPanel
                        open={gochatHistoryOpen}
                        onClose={() => setGochatHistoryOpen(false)}
                        conversations={gochatConversations}
                        loading={gochatConversationsLoading}
                        messagesLoading={gochatMessagesLoading}
                        activeConversationId={currentConversationId}
                        onSelect={handleSelectGochatConversation}
                        onDelete={handleDeleteGochatConversation}
                        expanded={chatSheetExpanded}
                        className="max-h-[34vh] md:max-h-none"
                      />
                    ) : null}

                    <div className="gochat-sheet-main flex min-h-0 min-w-0 flex-1 flex-col">
                  {/* Content Area - Scrollable */}
                  <div
                    ref={chatScrollContainerRef}
                    className="benchmark-scrollable flex-1 overflow-y-auto px-4 pt-6 pb-6"
                    onPointerDown={handleChatPointerDown}
                    onPointerUp={handleChatPointerUp}
                    onPointerCancel={handleChatPointerUp}
                  >
                  {/* Top Section - AI Assistant Branding */}
                  <div
                    className={`text-center transition-all duration-500 ease-in-out transform ${
                      showChatIntro
                        ? 'mb-8 opacity-100 translate-y-0'
                        : 'mb-0 opacity-0 -translate-y-4 pointer-events-none'
                    }`}
                    style={{
                      maxHeight: showChatIntro ? '380px' : '0px',
                      overflow: 'visible',
                      transitionProperty: 'opacity, transform, max-height',
                      paddingTop: showChatIntro ? '16px' : '0px',
                    }}
                  >
                    <div className="flex justify-center mb-4 transition-transform duration-500 ease-in-out pt-2">
                      <div
                        className={`relative transition-all duration-500 ease-in-out ${
                          showChatIntro ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
                        }`}
                        style={{ paddingTop: '8px', paddingBottom: '8px' }}
                      >
                        <BsHexagonHalf className="h-12 w-12 text-indigo-600 dark:text-indigo-400 chat-icon-animated" />
                        <div className="absolute inset-0 bg-cyan-400/20 blur-xl rounded-full"></div>
                      </div>
                    </div>
                    <h3
                      className={`text-lg font-semibold text-gray-900 dark:text-gray-100 transition-opacity duration-300 ${
                        showChatIntro ? 'mb-3 opacity-100' : 'mb-0 opacity-0'
                      }`}
                    >
                      How can I help you today?
                    </h3>
                    <p
                      className={`text-sm text-gray-600 dark:text-gray-400 text-center max-w-sm mx-auto transition-opacity duration-300 ${
                        showChatIntro ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      Gochat can answer most of your questions.
                    </p>
                  </div>

                    {/* Suggestions / Messages */}
                    <div
                      key={`gochat-pane-${currentConversationId ?? 'draft'}-${gochatMessagesLoading ? 'loading' : 'idle'}`}
                      className={cn(
                        'gochat-messages-pane space-y-6',
                        gochatMessagesLoading && 'is-switching',
                        !gochatMessagesLoading && 'is-ready'
                      )}
                    >
                      {gochatMessagesLoading ? (
                        <div className="gochat-messages-loading" role="status">
                          <div className="gochat-messages-loading-icon-wrap">
                            <BsHexagonHalf className="gochat-messages-loading-icon" aria-hidden />
                            <div className="gochat-messages-loading-glow" aria-hidden />
                          </div>
                          <span>Loading conversation…</span>
                        </div>
                      ) : chatMessages.length === 0 ? (
                        <>
                      {/* Mobile Ad Attribution & MMP Section */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Grid3x3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                            Mobile Ad Attribution & MMP
                          </h4>
                        </div>
                        <div className="space-y-2">
                          <button onClick={() => handleSend('What is the attribution of mobile advertising?')} className="w-full text-left p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-600">
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              What is the attribution of mobile advertising?
                            </p>
                          </button>
                          <button onClick={() => handleSend('What are the mainstream MMP attribution tools currently available on the market?')} className="w-full text-left p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-600">
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              What are the mainstream MMP attribution tools currently available on the market?
                            </p>
                          </button>
                          <button onClick={() => handleSend('How to get started and use Appsflyer effectively？')} className="w-full text-left p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-600">
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              How to get started and use Appsflyer effectively？
                            </p>
                          </button>
                        </div>
                      </div>

                      {/* Mobile Ad Data Analysis Section */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                            Mobile Ad Data Analysis
                          </h4>
                        </div>
                        <div className="space-y-2">
                          <button onClick={() => handleSend('How to summarize trends from mobile advertising attribution data and optimize traffic？')} className="w-full text-left p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-600">
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              How to summarize trends from mobile advertising attribution data and optimize traffic？
                            </p>
                          </button>
                          <button onClick={() => handleSend('Which data is crucial for mobile advertising, and what are the differences in data between CTV and CTA traffic?')} className="w-full text-left p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-600">
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              Which data is crucial for mobile advertising, and what are the differences in data between CTV and CTA traffic?
                            </p>
                          </button>
                        </div>
                      </div>
                        </>
                      ) : (
                        <div
                          ref={chatMessagesContainerRef}
                          className="space-y-4"
                          onPointerDown={handleChatPointerDown}
                          onPointerUp={handleChatPointerUp}
                          onPointerCancel={handleChatPointerUp}
                        >
                          {chatMessages.map((m, idx) => {
                            const isUser = m.role === 'user';
                            const isError = m.status === 'error';
                            const bubbleBase = isUser
                              ? 'bg-indigo-600 text-white'
                              : isError
                                ? 'text-red-700 dark:text-red-200'
                                : 'text-gray-900 dark:text-gray-100';
                            return (
                              <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                                <div
                                  className={`max-w-[85%] text-sm ${bubbleBase} ${
                                    isUser
                                      ? 'whitespace-pre-wrap rounded-lg px-3 py-2'
                                      : 'px-0 py-1'
                                  }`}
                                >
                                  <ChatMessageContent
                                    message={m}
                                    fallbackFormat={gochatDisplayFormat}
                                  />
                                </div>
                              </div>
                            );
                          })}
                          <div ref={chatEndRef} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bottom Section - Input and Disclaimer */}
                  <div className="p-4 space-y-3">
                    {/* Input Field */}
                    <div className="relative">
                      <div
                        className={cn(
                          'gochat-input-shell w-full rounded-lg border border-cyan-300 bg-white dark:border-cyan-700 dark:bg-gray-900',
                          chatInputExpanded && 'is-input-expanded'
                        )}
                      >
                        <GochatScrollArea
                          className="gochat-input-scroll"
                          maxHeight="10rem"
                          direction="y"
                          contentClassName="min-w-0"
                        >
                          <div className="gochat-input-inner">
                            <textarea
                              ref={chatInputRef}
                              rows={1}
                              placeholder="Ask any questions..."
                              className="gochat-input-field border-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:text-gray-100 dark:placeholder:text-gray-500"
                              value={chatInput}
                              onChange={(e) => setChatInput(e.target.value)}
                              onInput={resizeChatInput}
                              onCompositionStart={() => {
                                chatCompositionRef.current = true;
                              }}
                              onCompositionEnd={() => {
                                chatCompositionRef.current = false;
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  const nativeEvent = e.nativeEvent as KeyboardEvent & { isComposing?: boolean };
                                  if (chatCompositionRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229) {
                                    return;
                                  }
                                  e.preventDefault();
                                  handleSend();
                                }
                              }}
                            />
                            <div className="gochat-input-actions-col">
                              {chatMessages.length > 0 && !isChatStreaming && (
                                <button
                                  type="button"
                                  onClick={handleNewChat}
                                  disabled={gochatAtConversationLimit}
                                  className={cn(
                                    'rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-gray-800',
                                    gochatAtConversationLimit &&
                                      'cursor-not-allowed opacity-40 hover:bg-transparent dark:hover:bg-transparent'
                                  )}
                                  title={
                                    gochatAtConversationLimit
                                      ? `Conversation limit reached (${GOCHAT_MAX_CONVERSATIONS_PER_USER} max)`
                                      : 'Start new conversation'
                                  }
                                  aria-label="Start new conversation"
                                >
                                  <MessageSquarePlus className="h-4 w-4" />
                                </button>
                              )}
                              {isChatStreaming ? (
                                <button
                                  onClick={handleCancelStream}
                                  className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                                  title="Stop generating"
                                  aria-label="Stop generating"
                                >
                                  <PauseCircle className="h-4 w-4" />
                                </button>
                              ) : (
                                <button
                                  className="rounded-md p-1.5 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
                                  onClick={() => handleSend()}
                                  disabled={!chatInput.trim()}
                                  title="Send"
                                  aria-label="Send"
                                >
                                  <Send className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                </button>
                              )}
                            </div>
                          </div>
                        </GochatScrollArea>
                      </div>
                    </div>
                    {/* Disclaimer */}
                    <div className="select-none space-y-1 text-center text-xs text-gray-500 dark:text-gray-400">
                      <p className="select-none">
                        AI generation is for reference only, and the results may not be accurate.
                      </p>
                    </div>
                  </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </nav>
          </div>
        </header>

        {/* Command dialog */}
        {commandOpen && (
          <>
            <div 
              className="command-dialog-overlay"
              onClick={() => setCommandOpen(false)}
            />
            <div className="command-dialog-content">
              <Command>
                <CommandInput 
                  placeholder="Search links, navigate pages, or type a command..."
                  value={commandQuery}
                  onValueChange={setCommandQuery}
                />
                <CommandList>
                  <CommandEmpty>No results found.</CommandEmpty>
                  
                  {/* Quick nav */}
                  <CommandGroup heading="Quick Navigation">
                    {menuItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <CommandItem
                          key={item.key}
                          onSelect={() => handlePageNavigation(item.key)}
                        >
                          <Icon />
                          <span>{item.label}</span>
                          <CommandShortcut>
                            <BsArrowRight />
                          </CommandShortcut>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>

                  {/* Search */}
                  {commandQuery && (
                    <>
                      <CommandSeparator />
                    <CommandGroup heading="Search">
                      <CommandItem
                        onSelect={() => handleLinkSearch(commandQuery)}
                      >
                        <BsSearch />
                        <span>Search for: "{commandQuery}"</span>
                        <CommandShortcut>↵</CommandShortcut>
                      </CommandItem>
                    <CommandItem
                      onSelect={() => {
                          const query = commandQuery.trim();
                          // Full URL (http/https): open directly
                          if (query.startsWith('http://') || query.startsWith('https://')) {
                            window.open(query, '_blank');
                          } 
                          // Path (/...): navigate
                          else if (query.startsWith('/')) {
                            navigate(query);
                            setCommandOpen(false);
                          }
                          // Else treat as path (no domain prefix)
                          else {
                            // Dots may be domain; prepend https://
                            if (query.includes('.') && !query.includes(' ')) {
                              window.open(`https://${query}`, '_blank');
                            } else {
                              // Else treat as path
                              navigate(`/${query}`);
                              setCommandOpen(false);
                            }
                          }
                          saveSearchHistory(commandQuery);
                          setCommandQuery('');
                          setCommandOpen(false);
                        }}
                      >
                        <BsLink45Deg />
                        <span>Open link: "{commandQuery}"</span>
                        <CommandShortcut>⌘↵</CommandShortcut>
                    </CommandItem>
                  </CommandGroup>
                    </>
                  )}

                  {/* Search history */}
                  {!commandQuery && searchHistory.length > 0 && (
                    <>
                      <CommandSeparator />
                  <CommandGroup heading="Recent Searches">
                        {searchHistory.map((history, index) => (
                          <CommandItem
                            key={index}
                            onSelect={() => handleLinkSearch(history)}
                          >
                            <BsClock />
                            <span>{history}</span>
                    </CommandItem>
                        ))}
                  </CommandGroup>
                    </>
                  )}

                  {/* Help */}
                  {!commandQuery && (
                    <>
                      {/* Divider only when no search history */}
                      {searchHistory.length === 0 && <CommandSeparator />}
                      <CommandGroup heading="Tips">
                        <CommandItem disabled>
                          <span className="text-slate-500 text-xs">
                            💡 Type to search links or navigate pages
                          </span>
                        </CommandItem>
                        <CommandItem disabled>
                          <span className="text-slate-500 text-xs">
                            ⌘K to open, ESC to close
                          </span>
                        </CommandItem>
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            </div>
          </>
        )}

        {/* Sidebar (hidden on docs; chapter nav in main) */}
        {!isDocsRoute ? (
          <aside className={`custom-sidebar ${sidebarCollapsed ? 'collapsed' : 'expanded'}`}>
            <SidebarToggleButton collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

            {/* Sidebar header - Team Switcher */}
            <div className="sidebar-header">
              <TeamSwitcher
                collapsed={sidebarCollapsed}
                onExpandSidebar={() => setSidebarCollapsed(false)}
              />
            </div>

            <div className="sidebar-content">
              <nav className="sidebar-menu">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.key;
                  return (
                    <div
                      key={item.key}
                      className={`sidebar-menu-item ${isActive ? 'active' : ''}`}
                      onClick={() => navigate(item.key)}
                      title={item.label}
                    >
                      <Icon className="sidebar-icon" />
                      {!sidebarCollapsed && <span className="sidebar-label">{item.label}</span>}
                    </div>
                  );
                })}
              </nav>

              <div className="sidebar-footer">
                <UserMenu
                  collapsed={sidebarCollapsed}
                  userProfile={userProfile}
                  onNavigate={navigate}
                  onLogout={handleLogout}
                />
              </div>
            </div>
          </aside>
        ) : null}

        {/* Main content */}
        <main
          ref={mainContentRef}
          className={
            isDocsRoute
              ? 'main-content docs-route-main'
              : `main-content ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`
          }
        >
          {isDocsRoute ? (
            <div className="docs-layout-shell">
              {isWorkbenchDocsPage(location.pathname) ? (
                <aside className="docs-chapters" aria-label="Documentation sections">
                  {docsNavigation.sections.map((sec, secIdx) => (
                    <div key={sec.sectionTitle ?? `doc-sec-${secIdx}`} className="docs-chapters-section">
                      {sec.sectionTitle ? (
                        <div className="docs-chapters-parent-title">{sec.sectionTitle}</div>
                      ) : null}
                      {sec.items.map((ch) => (
                        <button
                          key={ch.id}
                          type="button"
                          className={`docs-chapter-link${activeDocSectionId === ch.id ? ' active' : ''}`}
                          onClick={() => scrollDocChapter(ch.id)}
                        >
                          <span className="flex w-full items-center justify-between gap-2">
                            <span>{ch.label}</span>
                            {ch.badge ? (
                              <span className="inline-flex shrink-0 items-center rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-100 dark:bg-zinc-700 dark:text-zinc-100">
                                {ch.badge}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </aside>
              ) : null}
              <div className="docs-main-pane" ref={docsMainPaneRef}>
                <div style={{ padding: '24px' }}>
                  <div className="main-content-inner">{children}</div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '24px' }}>
              <div className="main-content-inner">{children}</div>
            </div>
          )}
        </main>

        {/* Settings Drawer */}
        <Drawer open={settingsDrawerOpen} onOpenChange={setSettingsDrawerOpen}>
          <DrawerContent className="overflow-hidden flex flex-col select-none h-[70vh] max-h-[70vh]">
            <div className="flex-shrink-0 select-none bg-white dark:bg-gray-900 z-10">
              <DrawerHeader>
                <SettingsDrawerScrollTitle section={settingsDrawerSection} />
                <DrawerDescription className="select-none">
                  Manage your application settings and preferences.
                </DrawerDescription>
              </DrawerHeader>
            </div>
            <div
              ref={settingsScrollRef}
              onScroll={onSettingsDrawerScroll}
              className="benchmark-scrollable flex-1 min-h-0 overflow-y-auto overflow-x-hidden select-none"
            >
              <div className="px-6 pb-6 pt-6">
                <GochatAiSettings />
              </div>

              <div
                className="w-full border-b border-gray-200 dark:border-gray-700 shrink-0"
                aria-hidden
              />

              {/* Aggregate Mode Setting */}
              <div
                ref={normalSectionStartRef}
                className="flex items-center justify-between px-6 py-3 select-none"
              >
                <div className="flex flex-col select-none">
                  <div className="flex items-center gap-1.5">
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-100 select-none">
                      Aggregate Mode
                    </label>
                    <SettingsHelpTip text="Combine token validations into batch requests for better performance. Turn off when you need strict per-call verification." />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 select-none">
                    Enable aggregate mode for data processing
                  </p>
                </div>
                <Switch
                  checked={aggregateModeEnabled}
                  onCheckedChange={(checked: boolean) => {
                    setAggregateModeEnabled(checked);
                    localStorage.setItem('appsflyerTokenValidate', checked ? 'ON' : 'OFF');
                    // Dispatch custom event for other components
                    window.dispatchEvent(new CustomEvent('aggregateModeChanged'));
                  }}
                />
              </div>

              <div
                className="w-full border-b border-gray-200 dark:border-gray-700 shrink-0"
                aria-hidden
              />

              {/* Auto Refresh Time Setting */}
              <div className="flex items-center justify-between px-6 py-3 select-none">
                <div className="flex flex-col flex-1 mr-4 select-none">
                  <div className="flex items-center gap-1.5">
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-100 select-none">
                      Auto Refresh Time
                    </label>
                    <SettingsHelpTip text="Automatically refresh account data using the selected interval. Switch to manual updates by choosing a longer interval." />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 select-none">
                    Set automatic refresh interval for account data
                  </p>
                </div>
                <div className="flex items-center gap-3 min-w-[240px] select-none">
                  <div className="flex-1">
                    <Slider
                      value={[autoRefreshTime]}
                      onValueChange={(value) => {
                        const newValue = value[0];
                        setAutoRefreshTime(newValue);
                        // Save to localStorage immediately
                        if (userKey && typeof window !== 'undefined') {
                          writeAutoRefreshRule(userKey, newValue);
                          window.dispatchEvent(new CustomEvent('autoRefreshTimeChanged'));
                          window.dispatchEvent(new CustomEvent('accountRefreshRuleChanged'));
                        }
                      }}
                      min={0}
                      max={2}
                      step={1}
                      className="w-full"
                    />
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[40px] text-right select-none">
                    {autoRefreshTime === 0 ? '5 Min' : autoRefreshTime === 1 ? '10 Min' : '15 Min'}
                  </span>
                </div>
              </div>

              <div
                className="w-full border-b border-gray-200 dark:border-gray-700 shrink-0"
                aria-hidden
              />

              {/* Cache & File Clear Setting */}
              <div className="flex items-center justify-between px-6 py-3 select-none">
                <div className="flex flex-col flex-1 mr-4 select-none">
                  <div className="flex items-center gap-1.5">
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-100 select-none">
                      Cache & File Clear
                    </label>
                    <SettingsHelpTip text="Remove orphaned exports and cached files to free storage. Available to Super Admins for periodic housekeeping." />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 select-none">
                    Clean up orphaned files and clear cache
                  </p>
                </div>
                <button
                  onClick={handleCleanup}
                  disabled={!isSuperAdmin || cleaning}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors h-[36px] select-none ${
                    cleanupSuccess
                      ? 'bg-green-600 dark:bg-green-500 text-white hover:bg-green-700 dark:hover:bg-green-600'
                      : cleanupError
                      ? 'bg-red-600 dark:bg-red-500 text-white hover:bg-red-700 dark:hover:bg-red-600'
                      : 'bg-gray-900 dark:bg-gray-50 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100'
                  } disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed`}
                >
                  {cleaning ? (
                    <>
                      <Spinner className="w-4 h-4" />
                      <span className="select-none">Clearing...</span>
                    </>
                  ) : cleanupSuccess && cleanupStats ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span className="select-none">
                        {cleanupStats.deleted_files || 0} file{cleanupStats.deleted_files !== 1 ? 's' : ''} deleted
                      </span>
                    </>
                  ) : cleanupError ? (
                    <>
                      <XIcon className="w-4 h-4" />
                      <span className="select-none">Failed</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span className="select-none">Clear</span>
                    </>
                  )}
                </button>
              </div>

              <div
                ref={accountSectionStartRef}
                className="w-full border-b border-gray-200 dark:border-gray-700 shrink-0"
                aria-hidden
              />

              {/* Account Configuration Order Setting */}
              <div className="px-6 pb-6 pt-6 flex flex-col flex-1 min-h-0 select-none">
                <div className="flex items-center justify-between mb-3 flex-shrink-0 select-none">
                  <div className="flex flex-col flex-1 mr-4 select-none">
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-100 select-none">
                      Account Configuration Order
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 select-none">
                      Drag and drop to reorder account configurations
                    </p>
                  </div>
                  <button
                    onClick={handleSaveConfigOrder}
                    disabled={configsSaving || configsLoading || (!hasConfigOrderChanges && !configsSaving && !configsSaveSuccess)}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors h-[36px] select-none ${
                      configsSaveSuccess
                        ? 'bg-green-600 dark:bg-green-500 text-white hover:bg-green-700 dark:hover:bg-green-600'
                        : configsSaveError
                        ? 'bg-red-600 dark:bg-red-500 text-white hover:bg-red-700 dark:hover:bg-red-600'
                        : !hasConfigOrderChanges && !configsSaving && !configsSaveSuccess
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                        : 'bg-gray-900 dark:bg-gray-50 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100'
                    } disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed`}
                  >
                    {configsSaving ? (
                      <>
                        <Spinner className="w-4 h-4" />
                        <span className="select-none">Saving...</span>
                      </>
                    ) : configsSaveSuccess ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span className="select-none">Saved</span>
                      </>
                    ) : configsSaveError ? (
                      <>
                        <XIcon className="w-4 h-4" />
                        <span className="select-none">Failed</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span className="select-none">Save</span>
                      </>
                    )}
                  </button>
                </div>
                
                {/* Config list */}
                {configsLoading ? (
                  <div className="flex items-center justify-center py-8 flex-shrink-0 select-none">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 select-none">
                      <Spinner className="size-4" />
                      <span className="select-none">Loading configurations...</span>
                    </div>
                  </div>
                ) : accountConfigs.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0 select-none">
                    No account configurations found
                  </div>
                ) : (
                  <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-2 config-list-scroll select-none">
                    <style>{`
                      .config-list-scroll::-webkit-scrollbar {
                        width: 4px;
                      }
                      
                      .config-list-scroll::-webkit-scrollbar-track {
                        background: transparent;
                      }
                      
                      .config-list-scroll::-webkit-scrollbar-thumb {
                        background: rgba(0, 0, 0, 0.2);
                        border-radius: 2px;
                      }
                      
                      .config-list-scroll::-webkit-scrollbar-thumb:hover {
                        background: rgba(0, 0, 0, 0.2);
                        width: 4px;
                      }
                      
                      .dark .config-list-scroll::-webkit-scrollbar-thumb {
                        background: rgba(255, 255, 255, 0.2);
                      }
                      
                      .dark .config-list-scroll::-webkit-scrollbar-thumb:hover {
                        background: rgba(255, 255, 255, 0.2);
                      }
                    `}</style>
                    {accountConfigs.map((config: any, index: number) => (
                      <div
                        key={config.id}
                        draggable
                        onDragStart={(e) => {
                          setDraggedIndex(index);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => {
                          setDraggedIndex(null);
                          setDropIndex(null);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDropIndex(index);
                        }}
                        onDragLeave={() => {
                          setDropIndex(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromIndex = draggedIndex;
                          const toIndex = index;
                          
                          if (fromIndex !== null && fromIndex !== toIndex) {
                            const items = Array.from(accountConfigs);
                            const [reorderedItem] = items.splice(fromIndex, 1);
                            items.splice(toIndex, 0, reorderedItem);
                            setLocalAccountConfigs(items);
                          }
                          setDraggedIndex(null);
                          setDropIndex(null);
                        }}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-move relative select-none ${
                          draggedIndex === index
                            ? 'opacity-50 scale-95 border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md'
                        }`}
                      >
                        {/* Drag Handle */}
                        <GripVertical className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                        
                        {/* Account Icon */}
                        <div className="flex-shrink-0 select-none">
                          {config.custom_icon ? (
                            <img 
                              src={config.custom_icon}
                              alt={config.account_type === 'PRT' ? "Agency Account | PRT logo" : "Ad Network Account | PID logo"}
                              className="w-10 h-10 rounded-md object-cover select-none"
                              draggable={false}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-md flex items-center justify-center bg-gradient-to-br from-gray-600 to-gray-700 dark:from-gray-700 dark:to-gray-800 select-none">
                              {config.account_type === 'PRT' ? (
                                <RiShakeHandsLine className="w-5 h-5 text-white" />
                              ) : (
                                <RiSettings6Line className="w-5 h-5 text-white" />
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Account Info */}
                        <div className="flex-1 min-w-0 select-none">
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate select-none">
                            {config.account_name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 select-none">
                            {config.account_type === 'PRT' ? 'Agency Account | PRT' : 'Ad Network Account | PID'}
                          </div>
                        </div>
                        
                        {/* Drop Indicator */}
                        {dropIndex === index && draggedIndex !== null && draggedIndex !== index && (
                          <div className="absolute left-0 right-0 top-0 h-0.5 bg-blue-500 dark:bg-blue-400 rounded-full select-none" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
};

export default Layout;
export type { LayoutProps };

