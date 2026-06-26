import axios from 'axios';

// Axios defaults
const API_BASE_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : '';
export const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: 60000,
  withCredentials: true  // Send credentials
});

// AI Chat service (separate port)
// Direct to Go service for performance (Go validates JWT)
export const AI_CHAT_BASE_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:5002' 
  : (process.env.REACT_APP_AI_CHAT_URL || '');
export const aiChatAxiosInstance = axios.create({
  baseURL: AI_CHAT_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 300000, // 5min timeout for long chats
  withCredentials: false, // AI service needs no auth cookies
});

// AutoPipe service (separate port)
// Direct to Go service for performance (Go validates JWT)
export const AUTOPIPE_BASE_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:5001' 
  : (process.env.REACT_APP_AUTOPIPE_URL || '');
export const autopipeAxiosInstance = axios.create({
  baseURL: AUTOPIPE_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 300000, // 5min timeout for long tasks
  withCredentials: false,
});

const getStoredAuthToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem('token') || sessionStorage.getItem('token');
};

/** GoChat uses X-User-Id for sessions; do not send login JWT to 5002 */
const getGochatUserId = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem('userProfile') || sessionStorage.getItem('userProfile');
    if (!raw) {
      return null;
    }
    const profile = JSON.parse(raw) as { id?: string };
    return profile?.id?.trim() || null;
  } catch {
    return null;
  }
};

const DASHBOARD_FORCE_REFRESH_KEY = 'dashboard_force_refresh_ts';
const DASHBOARD_FORCE_REFRESH_WINDOW_MS = 15000;

const shouldForceDashboardNoCache = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const raw = sessionStorage.getItem(DASHBOARD_FORCE_REFRESH_KEY);
    if (!raw) {
      return false;
    }
    const ts = Number(raw);
    if (!Number.isFinite(ts)) {
      sessionStorage.removeItem(DASHBOARD_FORCE_REFRESH_KEY);
      return false;
    }
    if (Date.now() - ts > DASHBOARD_FORCE_REFRESH_WINDOW_MS) {
      sessionStorage.removeItem(DASHBOARD_FORCE_REFRESH_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

const isHomeCachedReadRequest = (requestUrl: string, method?: string): boolean => {
  const requestMethod = String(method || 'get').toLowerCase();
  if (requestMethod !== 'get') {
    return false;
  }
  return (
    requestUrl.includes('/api/query-results') ||
    requestUrl.includes('/api/query-logs/') ||
    requestUrl.includes('/api/apps-finder/app-name/')
  );
};

aiChatAxiosInstance.interceptors.request.use(
  (config) => {
    if (config.headers) {
      const userId = getGochatUserId();
      if (userId) {
        config.headers['X-User-Id'] = userId;
      }
      delete config.headers.Authorization;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// AutoPipe interceptor: JWT + X-Selected-Team-Id (Go filters by team)
autopipeAxiosInstance.interceptors.request.use(
  (config) => {
    const token = getStoredAuthToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (typeof window !== 'undefined' && config.headers) {
      if (!teamScopeSyncedFromStorage) {
        try {
          const sid = sessionStorage.getItem(TEAM_SCOPE_STORAGE_ID);
          if (sid) selectedTeamIdForScope = sid;
          teamScopeSyncedFromStorage = true;
        } catch {
          /* ignore */
        }
      }
      if (selectedTeamIdForScope) {
        config.headers['X-Selected-Team-Id'] = selectedTeamIdForScope;
      }

      const requestUrl = String(config.url || '');
      if (requestUrl.includes('/api/dashboard/') && shouldForceDashboardNoCache()) {
        config.headers['X-Dashboard-Force-Refresh'] = '1';
        if (!requestUrl.includes('nocache=')) {
          config.url = requestUrl.includes('?') ? `${requestUrl}&nocache=1` : `${requestUrl}?nocache=1`;
        }
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// GoChat: X-User-Id only; MiMo API key on Go server
const getChatAuthHeaders = (_request: ChatRequest): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  };
  const userId = getGochatUserId();
  if (userId) {
    headers['X-User-Id'] = userId;
  }
  return headers;
};

// Request interceptor
axiosInstance.interceptors.request.use(
  (config) => {
    // Token from localStorage or sessionStorage
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
      // Request logs in dev only
      if (process.env.NODE_ENV === 'development') {
        console.log('Request sent with token:', token.substring(0, 20) + '...');
      }
    } else {
      // No-token request logs in dev only
      if (process.env.NODE_ENV === 'development') {
        console.log('Request sent without token');
      }
    }
    // Restore team from sessionStorage before first request
    if (!teamScopeSyncedFromStorage && typeof sessionStorage !== 'undefined') {
      teamScopeSyncedFromStorage = true;
      try {
        const sid = sessionStorage.getItem(TEAM_SCOPE_STORAGE_ID);
        if (sid) selectedTeamIdForScope = sid;
      } catch {
        /* ignore */
      }
    }
    if (selectedTeamIdForScope && config.headers) {
      config.headers['X-Selected-Team-Id'] = selectedTeamIdForScope;
    }

    const requestUrl = String(config.url || '');
    if (config.headers && shouldForceDashboardNoCache() && isHomeCachedReadRequest(requestUrl, config.method)) {
      config.headers['X-Home-Force-Refresh'] = '1';
      if (!requestUrl.includes('nocache=')) {
        config.url = requestUrl.includes('?') ? `${requestUrl}&nocache=1` : `${requestUrl}?nocache=1`;
      }
    }

    return config;
  },
  (error) => {
    // Request error logs in dev only
    if (process.env.NODE_ENV === 'development') {
      console.error('Request error:', error);
    }
    return Promise.reject(error);
  }
);

// Hide sensitive token in logs
const maskToken = (token: string | undefined | null): string => {
  if (!token || typeof token !== 'string') return '';
  if (token.length <= 15) return '***';
  return `${token.substring(0, 10)}...${token.substring(token.length - 5)}`;
};

// Batch token request logs
let tokenRequestBatch: Array<{ url: string; maskedToken: string }> = [];
let tokenRequestBatchTimer: NodeJS.Timeout | null = null;

const flushTokenRequestBatch = () => {
  if (tokenRequestBatch.length === 0) return;
  
  if (tokenRequestBatch.length === 1) {
    // Single request: concise log
    console.warn(
      `[Security Warning] Token response detected. ` +
      `Please do not share network request details containing sensitive tokens.`
    );
  } else {
    // Multiple requests: merged count log
    console.warn(
      `[Security Warning] ${tokenRequestBatch.length} token responses detected in batch. ` +
      `Please do not share network request details containing sensitive tokens.`
    );
  }
  
  tokenRequestBatch = [];
  tokenRequestBatchTimer = null;
};

// Sanitize sensitive fields in responses for logs
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const sanitizeResponseForLogging = (data: any): any => {
  if (!data || typeof data !== 'object') return data;
  
  const sanitized = Array.isArray(data) ? [...data] : { ...data };
  
  // Redact sensitive object fields
  if (!Array.isArray(sanitized)) {
    Object.keys(sanitized).forEach(key => {
      const lowerKey = key.toLowerCase();
      // Redact fields matching token/password/secret/key
      if (lowerKey.includes('token') || lowerKey.includes('password') || 
          lowerKey.includes('secret') || lowerKey.includes('api_key') ||
          lowerKey === 'api_token') {
        if (typeof sanitized[key] === 'string' && sanitized[key]) {
          sanitized[key] = maskToken(sanitized[key]);
        }
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        // Recurse into nested objects
        sanitized[key] = sanitizeResponseForLogging(sanitized[key]);
      }
    });
  } else {
    // Sanitize objects in arrays
    sanitized.forEach((item: any, index: number) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      if (typeof item === 'object' && item !== null) {
        sanitized[index] = sanitizeResponseForLogging(item);
      }
    });
  }
  
  return sanitized;
};

// Response interceptor
axiosInstance.interceptors.response.use(
  (response) => {
    // Sanitize sensitive responses in dev
    if (process.env.NODE_ENV === 'development' && response.config?.url?.includes('/token')) {
      const originalData = response.data;
      
      // Batch token logs to reduce noise
      if (originalData && typeof originalData === 'object' && 'api_token' in originalData) {
        const maskedToken = maskToken((originalData as { api_token?: string }).api_token);
        const url = response.config.url || 'unknown';
        
        // Enqueue for batch
        tokenRequestBatch.push({ url, maskedToken });
        
        // Clear prior timer
        if (tokenRequestBatchTimer) {
          clearTimeout(tokenRequestBatchTimer);
        }
        
        // 150ms batch timer to collect requests
        tokenRequestBatchTimer = setTimeout(() => {
          flushTokenRequestBatch();
        }, 150);
      }
      
      // Original data kept for callers (full token still available)
      // Note: response.data already has full payload
      if (originalData) {
        (response as any)._originalData = originalData;
      }
    }
    
    return response;
  },
  (error) => {
    // Ignore aborted requests
    if (error.name === 'AbortError' || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
      return Promise.reject(error);
    }

    // Response error logs in dev only
    if (process.env.NODE_ENV === 'development') {
      // Classify error type
      if (error.response) {
        // Response received from server
        console.error('Response error:', error.response.status, error.response.data);
        
        // Extra debug for 401
        if (error.response.status === 401) {
          console.error('401 Unauthorized Error Details:');
          console.error('  - URL:', error.config?.url);
          console.error('  - Response data:', error.response.data);
          if (error.response.data?.debug_info) {
            console.error('  - Debug info:', error.response.data.debug_info);
          }
          
          // Show current stored token info
          const currentToken = localStorage.getItem('token');
          console.error('  - Current token:', currentToken ? currentToken.substring(0, 20) + '...' : 'None');
          console.error('  - Token length:', currentToken ? currentToken.length : 0);
        }
      } else if (error.request) {
        // Request sent but no response (network error)
        console.error('Network error:', error.message || 'No response received');
        if (error.config?.url) {
          console.error('  - URL:', error.config.url);
        }
      } else {
        // Other errors
        console.error('Request error:', error.message || 'Unknown error');
      }
    }
    
    // Clear token only when:
    // 1. 401 Unauthorized
    // 2. Not a login request
    // 3. Not a token verify request
    // 4. Not a network error
    // 5. Not a user profile request
    // 6. Not initial load
    if (error.response?.status === 401 && !error.code) {
      const url = error.config.url || '';
      const isAuthRequest = url.includes('/api/auth/');
      const isFirstLoad = !localStorage.getItem('lastVerification');
      
      if (!isAuthRequest && !isFirstLoad) {
        // Token clear logs in dev only
        if (process.env.NODE_ENV === 'development') {
          console.log('Clearing token and user info');
        }
        localStorage.removeItem('token');
        localStorage.removeItem('userProfile');
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('loginTime');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('userProfile');
        sessionStorage.removeItem('isLoggedIn');
        sessionStorage.removeItem('loginTime');
      }
    }
    return Promise.reject(error);
  }
);

export interface FetchDataParams {
  accountType: string;
  accountId: string;
  dataType: string;
  fromDate: string;
  toDate: string;
  appId: string;
  apiToken: string;
  eventName?: string;
}

// Fetch account token on demand (not in list API)
// Security: returns full token; do not log or expose
// Token logs handled by response interceptor
export const getAccountToken = async (configId: string): Promise<string> => {
  try {
    const response = await axiosInstance.get<{ api_token?: string }>(`/api/auth/account-configs/${configId}/token`);
    const data = response.data;
    if (response.status === 200 && data?.api_token) {
      return data.api_token;
    }
    throw new Error('Failed to get account token');
  } catch (error) {
    // Error logs omit secrets
    console.error(`Failed to get account token for config ${configId}:`, error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
};

export const fetchData = async (params: FetchDataParams) => {
  try {
    const response = await axiosInstance.post('/api/query-data', params);
    return response.data;
  } catch (error: any) {
    // Fetch failure logs in dev only
    if (process.env.NODE_ENV === 'development') {
      console.error('Data fetch failed:', error);
    }
    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }
    throw new Error(`Data fetch failed: ${error.message}`);
  }
};
// Lookup only in passed accountConfigs; no API call
// Caller must pass accountConfigs from AccountContext
export const getAccountInfo = (accountType: string, accountConfigs: any[]) => {
  if (!accountConfigs || !Array.isArray(accountConfigs) || accountConfigs.length === 0) {
    return null;
  }

  const filtered = accountConfigs.filter((cfg: any) => cfg.account_type === accountType);
  if (filtered.length > 0) {
    // Strip token from returned data
    const { api_token, ...rest } = filtered[0];
    return rest;
  }
  
  return null;
};

export interface Organization {
  id: string;
  name: string;
  teamType: string;
}

/** Super Admin selected team id (X-Selected-Team-Id header) */
export const TEAM_SCOPE_STORAGE_ID = 'afwb_selected_team_id';
export const TEAM_SCOPE_STORAGE_NAME = 'afwb_selected_team_name';

let selectedTeamIdForScope: string | null = null;
let teamScopeSyncedFromStorage = false;

export const setSelectedTeamIdForScope = (teamId: string | null): void => {
  selectedTeamIdForScope = teamId;
};

export const getSelectedTeamIdForScope = (): string | null => selectedTeamIdForScope;

/** Clear team selection on logout or non–Super Admin */
export const clearTeamScopeStorage = (): void => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(TEAM_SCOPE_STORAGE_ID);
      sessionStorage.removeItem(TEAM_SCOPE_STORAGE_NAME);
    }
  } catch {
    /* ignore */
  }
  selectedTeamIdForScope = null;
  teamScopeSyncedFromStorage = false;
};

export const getOrganizations = async (): Promise<Organization[]> => {
  try {
    const response = await axiosInstance.get('/api/auth/organizations');
    const data = response.data as { organizations?: Organization[] };
    return data.organizations || [];
  } catch (error: any) {
    // Org fetch failure logs in dev only
    if (process.env.NODE_ENV === 'development') {
      console.error('Failed to get organizations:', error);
    }
    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }
    throw new Error(`Failed to get organizations: ${error.message}`);
  }
};

// AI Chat APIs
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  provider?: 'openai' | 'deepseek' | string;
  conversation_id?: string; // Conversation id for persistence
}

export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface GochatSettingsState {
  hasOpenaiKey: boolean;
  hasDeepseekKey: boolean;
}

export interface UpdateGochatSettingsPayload {
  openaiApiKey?: string;
  deepseekApiKey?: string;
}

export const getGochatSettings = async (): Promise<GochatSettingsState> => {
  const response = await axiosInstance.get<GochatSettingsState>('/api/auth/gochat/settings');
  return response.data;
};

export const updateGochatSettings = async (payload: UpdateGochatSettingsPayload): Promise<GochatSettingsState> => {
  const response = await axiosInstance.put<GochatSettingsState>('/api/auth/gochat/settings', payload);
  return response.data;
};

export const clearGochatSettings = async (): Promise<GochatSettingsState> => {
  const response = await axiosInstance.delete<GochatSettingsState>('/api/auth/gochat/settings');
  return response.data;
};

// ==================== Conversation & message APIs ====================

// Conversation types
export interface Conversation {
  id: string;
  user_id: string;
  title: string | null;
  provider: string;
  model: string | null;
  last_user_message?: string | null;
  created_at: string;
  updated_at: string;
}

// Stored message type (full DB shape)
export interface StoredChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status: 'pending' | 'completed' | 'error';
  error_message: string | null;
  token_count: number;
  created_at: string;
}

// List conversations
export const getConversations = async (): Promise<Conversation[]> => {
  const response = await aiChatAxiosInstance.get<{ conversations?: Conversation[] }>('/api/conversations');
  return response.data.conversations || [];
};

// Create conversation
export const createConversation = async (data: {
  title?: string;
  provider?: string;
  model?: string;
}): Promise<{ id: string }> => {
  const response = await aiChatAxiosInstance.post<{ id: string }>('/api/conversations', data);
  return response.data;
};

// Get conversation
export const getConversation = async (id: string): Promise<Conversation> => {
  const response = await aiChatAxiosInstance.get<Conversation>(`/api/conversations/${id}`);
  return response.data;
};

// Update conversation
export const updateConversation = async (id: string, data: { title?: string }): Promise<void> => {
  await aiChatAxiosInstance.put(`/api/conversations/${id}`, data);
};

// Delete conversation
export const deleteConversation = async (id: string): Promise<void> => {
  await aiChatAxiosInstance.delete(`/api/conversations/${id}`);
};

// List conversation messages
export const getMessages = async (conversationId: string): Promise<StoredChatMessage[]> => {
  const response = await aiChatAxiosInstance.get<{ messages?: StoredChatMessage[] }>(`/api/conversations/${conversationId}/messages`);
  return response.data.messages || [];
};

// Non-streaming chat request
export const sendChatMessage = async (request: ChatRequest): Promise<ChatResponse> => {
  try {
    const response = await aiChatAxiosInstance.post<ChatResponse>('/api/chat/completions', {
      ...request,
      stream: false,
    });
    return response.data;
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Chat request failed:', error);
    }
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error.message || 'Chat request failed');
    }
    throw new Error(`Chat request failed: ${error.message}`);
  }
};

export type ChatStreamOptions = {
  /** Callback reasoning_content separately from body */
  showReasoning?: boolean;
  onReasoningChunk?: (chunk: string) => void;
  /** Callback when X-Conversation-ID header arrives */
  onConversationId?: (conversationId: string) => void;
};

// Streaming chat request (SSE)
export const sendChatMessageStream = async (
  request: ChatRequest,
  onChunk: (chunk: string) => void,
  onError?: (error: Error) => void,
  onComplete?: (conversationId?: string) => void,
  streamOptions?: ChatStreamOptions
): Promise<string | undefined> => {
  try {
    const response = await fetch(`${AI_CHAT_BASE_URL}/api/chat/completions`, {
      method: 'POST',
      headers: getChatAuthHeaders(request),
      body: JSON.stringify({
        ...request,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as {
        message?: string;
        error?: { message?: string };
      };
      throw new Error(
        errorData.error?.message || errorData.message || `HTTP error! status: ${response.status}`
      );
    }

    // conversation_id from response header
    const conversationId = response.headers.get('X-Conversation-ID') || undefined;
    let conversationIdNotified = false;
    const notifyConversationId = () => {
      if (!conversationId || conversationIdNotified) return;
      conversationIdNotified = true;
      streamOptions?.onConversationId?.(conversationId);
    };
    notifyConversationId();

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        onComplete?.(conversationId);
        return conversationId;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            onComplete?.(conversationId);
            return conversationId;
          }

          let parsed: {
            error?: { message?: string };
            choices?: Array<{
              delta?: { content?: string | null; reasoning_content?: string | null };
            }>;
          };
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            if (process.env.NODE_ENV === 'development') {
              console.warn('Failed to parse SSE chunk:', e);
            }
            continue;
          }
          if (parsed.error?.message) {
            throw new Error(parsed.error.message);
          }
          const delta = parsed.choices?.[0]?.delta;
          const contentPiece = delta?.content;
          if (typeof contentPiece === 'string' && contentPiece.length > 0) {
            onChunk(contentPiece);
          }
          if (streamOptions?.showReasoning && streamOptions.onReasoningChunk) {
            const reasoningPiece = delta?.reasoning_content;
            if (typeof reasoningPiece === 'string' && reasoningPiece.length > 0) {
              streamOptions.onReasoningChunk(reasoningPiece);
            }
          }
        }
      }
    }
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Stream chat request failed:', error);
    }
    onError?.(error instanceof Error ? error : new Error(String(error)));
    return undefined;
  }
};

// Dashboard stats APIs
export interface DashboardStatisticsParams {
  accountNames: string[];
  appIds: string[];
  campaignIds?: string[]; // Optional campaign_id list
  fromDate: string; // YYYY-MM-DD
  toDate: string;   // YYYY-MM-DD
}

export interface DashboardStatistics {
  installs: number;
  events: number;
  retarget_installs: number;
  retarget_events: number;
}

// List campaign IDs
export const getDashboardCampaignIds = async (
  params: { accountNames: string[]; appIds: string[]; fromDate: string; toDate: string }
): Promise<Array<{ id: string; name: string }>> => {
  try {
    const queryParams = new URLSearchParams();
    params.accountNames.forEach(name => queryParams.append('accountNames', name));
    params.appIds.forEach(id => queryParams.append('appIds', id));
    queryParams.append('fromDate', params.fromDate);
    queryParams.append('toDate', params.toDate);

    const response = await autopipeAxiosInstance.get<{ success?: boolean; data?: Array<{ id: string; name: string }> }>(
      `/api/dashboard/campaign-ids?${queryParams.toString()}`
    );
    const data = response.data;
    if (data?.success && data?.data) {
      return data.data;
    }
    return [];
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Failed to get campaign IDs:', error);
    }
    return [];
  }
};

export const getDashboardStatistics = async (
  params: DashboardStatisticsParams
): Promise<DashboardStatistics> => {
  try {
    const queryParams = new URLSearchParams();
    params.accountNames.forEach(name => queryParams.append('accountNames', name));
    params.appIds.forEach(id => queryParams.append('appIds', id));
    if (params.campaignIds && params.campaignIds.length > 0) {
      params.campaignIds.forEach(id => queryParams.append('campaignIds', id));
    }
    queryParams.append('fromDate', params.fromDate);
    queryParams.append('toDate', params.toDate);

    const response = await autopipeAxiosInstance.get<{ success?: boolean; data?: DashboardStatistics }>(
      `/api/dashboard/statistics?${queryParams.toString()}`
    );
    const data = response.data;
    if (data?.success) {
      return data.data || {
        installs: 0,
        events: 0,
        retarget_installs: 0,
        retarget_events: 0,
      };
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Failed to get dashboard statistics:', error);
    }
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error(`Failed to get dashboard statistics: ${error.message}`);
  }
};

// Dashboard stats by date
export interface DashboardDailyStatistics {
  date: string;
  installs: number;
  events: number;
  retarget_installs: number;
  retarget_events: number;
}

export const getDashboardDailyStatistics = async (
  params: DashboardStatisticsParams
): Promise<DashboardDailyStatistics[]> => {
  try {
    const queryParams = new URLSearchParams();
    params.accountNames.forEach(name => queryParams.append('accountNames', name));
    params.appIds.forEach(id => queryParams.append('appIds', id));
    if (params.campaignIds && params.campaignIds.length > 0) {
      params.campaignIds.forEach(id => queryParams.append('campaignIds', id));
    }
    queryParams.append('fromDate', params.fromDate);
    queryParams.append('toDate', params.toDate);

    const response = await autopipeAxiosInstance.get<{ success?: boolean; data?: DashboardDailyStatistics[] }>(
      `/api/dashboard/statistics/daily?${queryParams.toString()}`
    );
    const data = response.data;
    if (data?.success) {
      return data.data || [];
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Failed to get dashboard daily statistics:', error);
    }
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error(`Failed to get dashboard daily statistics: ${error.message}`);
  }
};

// Install Conversion Chart data
export interface InstallConversionData {
  date: string;
  installs: number;
}

// Install Conversion Chart grouped data
export interface InstallConversionGroupedData {
  groupId: string;   // Account name or app id
  groupName: string; // Account or app name
  icon: string;      // Icon URL or base64
  platform?: string; // iOS or Android (APP grouping)
  data: InstallConversionData[]; // Series for this group
}

export const getInstallConversionData = async (
  params: DashboardStatisticsParams,
  groupBy: 'ACC' | 'APP' = 'ACC',
  dataType: 'UA' | 'RT' = 'UA'
): Promise<InstallConversionGroupedData[]> => {
  try {
    const queryParams = new URLSearchParams();
    params.accountNames.forEach(name => queryParams.append('accountNames', name));
    params.appIds.forEach(id => queryParams.append('appIds', id));
    if (params.campaignIds && params.campaignIds.length > 0) {
      params.campaignIds.forEach(id => queryParams.append('campaignIds', id));
    }
    queryParams.append('fromDate', params.fromDate);
    queryParams.append('toDate', params.toDate);
    queryParams.append('groupBy', groupBy);
    queryParams.append('dataType', dataType);

    const response = await autopipeAxiosInstance.get<{ success?: boolean; data?: InstallConversionGroupedData[] }>(
      `/api/dashboard/install-conversion?${queryParams.toString()}`
    );
    const data = response.data;
    if (data?.success) {
      return data.data || [];
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Failed to get install conversion data:', error);
    }
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error(`Failed to get install conversion data: ${error.message}`);
  }
};

// Event Conversion Chart data (same shape as Install)
export interface EventConversionData {
  date: string;
  events: number;
}

// Event Conversion Chart grouped data
export interface EventConversionGroupedData {
  groupId: string;   // Account name or app id
  groupName: string; // Account or app name
  icon: string;      // Icon URL or base64
  platform?: string; // iOS or Android (APP grouping)
  data: EventConversionData[]; // Series for this group
}

export const getEventConversionData = async (
  params: DashboardStatisticsParams,
  groupBy: 'ACC' | 'APP' = 'ACC',
  dataType: 'UA' | 'RT' = 'UA'
): Promise<EventConversionGroupedData[]> => {
  try {
    const queryParams = new URLSearchParams();
    params.accountNames.forEach(name => queryParams.append('accountNames', name));
    params.appIds.forEach(id => queryParams.append('appIds', id));
    if (params.campaignIds && params.campaignIds.length > 0) {
      params.campaignIds.forEach(id => queryParams.append('campaignIds', id));
    }
    queryParams.append('fromDate', params.fromDate);
    queryParams.append('toDate', params.toDate);
    queryParams.append('groupBy', groupBy);
    queryParams.append('dataType', dataType);

    const response = await autopipeAxiosInstance.get<{ success?: boolean; data?: EventConversionGroupedData[] }>(
      `/api/dashboard/event-conversion?${queryParams.toString()}`
    );
    const data = response.data;
    if (data?.success) {
      return data.data || [];
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Failed to get event conversion data:', error);
    }
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error(`Failed to get event conversion data: ${error.message}`);
  }
};

// Distribution Proportion Chart data
export interface DistributionProportionData {
  name: string;
  value: number;
  color?: string;
  // Optional icon for pie legend
  icon?: string;
  // Optional platform for APP mode
  platform?: string;
}

// Event Name Statistics data
export interface EventNameGroupDetail {
  groupName: string;          // Account or app name
  install: number;            // Install count
  event: number;              // Event count
  retargetingInstall: number; // Retargeting install count
  retargetingEvent: number;    // Retargeting event count
}

export interface EventNameStatisticsData {
  eventName: string;          // Event name
  install: number;            // Install count (UA)
  event: number;              // Event count (UA)
  retargetingInstall: number; // Retargeting install (RT)
  retargetingEvent: number;    // Retargeting event (RT)
  groupDetails?: EventNameGroupDetail[]; // Group details (ACC by account, APP by app_id)
}

export const getDistributionProportionData = async (
  params: DashboardStatisticsParams,
  mode: 'ACC' | 'APP' = 'ACC',
  badge: 'UA' | 'RT' = 'UA'
): Promise<DistributionProportionData[]> => {
  try {
    const queryParams = new URLSearchParams();
    // Append param only when array non-empty
    if (params.accountNames && params.accountNames.length > 0) {
      params.accountNames.forEach(name => queryParams.append('accountNames', name));
    }
    if (params.appIds && params.appIds.length > 0) {
      params.appIds.forEach(id => queryParams.append('appIds', id));
    }
    if (params.campaignIds && params.campaignIds.length > 0) {
      params.campaignIds.forEach(id => queryParams.append('campaignIds', id));
    }
    queryParams.append('fromDate', params.fromDate);
    queryParams.append('toDate', params.toDate);
    queryParams.append('mode', mode);
    queryParams.append('badge', badge);

    const response = await autopipeAxiosInstance.get<{ success?: boolean; data?: DistributionProportionData[]; error?: string }>(
      `/api/dashboard/distribution-proportion?${queryParams.toString()}`
    );
    const data = response.data;
    if (data?.success) {
      return data.data || [];
    }
    throw new Error(data?.error || 'Invalid response format');
  } catch (error: any) {
    console.error('Failed to get distribution proportion data:', error);
    console.error('Error details:', {
      message: error?.message,
      response: error?.response?.data,
      status: error?.response?.status,
      url: error?.config?.url
    });
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error(`Failed to get distribution proportion data: ${error.message}`);
  }
};

export const getEventNameStatisticsData = async (
  params: DashboardStatisticsParams,
  mode: 'ACC' | 'APP' = 'ACC',
  badge: 'UA' | 'RT' = 'UA',
  includeDetails = false
): Promise<EventNameStatisticsData[]> => {
  try {
    const queryParams = new URLSearchParams();
    // Append param only when array non-empty
    if (params.accountNames && params.accountNames.length > 0) {
      params.accountNames.forEach(name => queryParams.append('accountNames', name));
    }
    if (params.appIds && params.appIds.length > 0) {
      params.appIds.forEach(id => queryParams.append('appIds', id));
    }
    if (params.campaignIds && params.campaignIds.length > 0) {
      params.campaignIds.forEach(id => queryParams.append('campaignIds', id));
    }
    queryParams.append('fromDate', params.fromDate);
    queryParams.append('toDate', params.toDate);
    queryParams.append('mode', mode);
    queryParams.append('badge', badge);
    if (includeDetails) {
      queryParams.append('includeDetails', '1');
    }

    const response = await autopipeAxiosInstance.get<{ success?: boolean; data?: EventNameStatisticsData[] }>(
      `/api/dashboard/event-name-statistics?${queryParams.toString()}`
    );
    const data = response.data;
    if (data?.success) {
      return data.data || [];
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Failed to get event name statistics data:', error);
    }
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error(`Failed to get event name statistics data: ${error.message}`);
  }
};

// Regional Statistics Chart data
export interface RegionalStatisticsData {
  country: string; // Country code
  count: number;  // Total count (Install or Event mode)
  eventData?: { [eventName: string]: number }; // Per-event counts in Event mode
}

// Regional Statistics Chart grouped data (ACC)
export interface RegionalStatisticsGroupedData {
  account?: string;   // Account name (ACC)
  appId?: string;     // App id (APP)
  appName?: string;   // App name (APP)
  platform?: string;  // Platform (APP): iOS or Android
  icon?: string;      // Icon URL or base64
  data: RegionalStatisticsData[]; // Country stats for group
}

export const getRegionalStatisticsData = async (
  params: DashboardStatisticsParams,
  groupBy: 'ALL' | 'ACC' | 'APP' = 'ALL',
  dataType: 'UA' | 'RT' = 'UA',
  statisticsType: 'Install' | 'Event' = 'Event'
): Promise<RegionalStatisticsData[] | RegionalStatisticsGroupedData[]> => {
  try {
    const queryParams = new URLSearchParams();
    // Append param only when array non-empty
    if (params.accountNames && params.accountNames.length > 0) {
      params.accountNames.forEach(name => queryParams.append('accountNames', name));
    }
    if (params.appIds && params.appIds.length > 0) {
      params.appIds.forEach(id => queryParams.append('appIds', id));
    }
    if (params.campaignIds && params.campaignIds.length > 0) {
      params.campaignIds.forEach(id => queryParams.append('campaignIds', id));
    }
    queryParams.append('fromDate', params.fromDate);
    queryParams.append('toDate', params.toDate);
    queryParams.append('groupBy', groupBy);
    queryParams.append('dataType', dataType);
    queryParams.append('statisticsType', statisticsType);

    const response = await autopipeAxiosInstance.get<{ success?: boolean; data?: RegionalStatisticsData[] }>(
      `/api/dashboard/regional-statistics?${queryParams.toString()}`
    );
    const data = response.data;
    // Empty array is valid when no data
    if (data && data.success !== undefined) {
      if (Array.isArray(data.data)) {
        return data.data;
      }
      return [];
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Failed to get regional statistics data:', error);
    }
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error(`Failed to get regional statistics data: ${error.message}`);
  }
};

// Affiliate Channel Chart data
export interface AffiliateChannelData {
  name: string;
  channel: string;
  groupName?: string;
  count: number;
  eventData?: { [eventName: string]: number };
}

export const getAffiliateChannelData = async (
  params: DashboardStatisticsParams,
  groupBy: 'ALL' | 'ACC' | 'APP' = 'ALL',
  dataType: 'UA' | 'RT' = 'UA',
  statisticsType: 'Install' | 'Event' = 'Event'
): Promise<AffiliateChannelData[]> => {
  try {
    const queryParams = new URLSearchParams();
    if (params.accountNames && params.accountNames.length > 0) {
      params.accountNames.forEach(name => queryParams.append('accountNames', name));
    }
    if (params.appIds && params.appIds.length > 0) {
      params.appIds.forEach(id => queryParams.append('appIds', id));
    }
    if (params.campaignIds && params.campaignIds.length > 0) {
      params.campaignIds.forEach(id => queryParams.append('campaignIds', id));
    }
    queryParams.append('fromDate', params.fromDate);
    queryParams.append('toDate', params.toDate);
    queryParams.append('groupBy', groupBy);
    queryParams.append('dataType', dataType);
    queryParams.append('statisticsType', statisticsType);

    const response = await autopipeAxiosInstance.get<{ success?: boolean; data?: AffiliateChannelData[] }>(
      `/api/dashboard/affiliate-channels?${queryParams.toString()}`
    );
    const data = response.data;
    if (data && data.success !== undefined) {
      if (Array.isArray(data.data)) {
        return data.data;
      }
      return [];
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Failed to get affiliate channel data:', error);
    }
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error(`Failed to get affiliate channel data: ${error.message}`);
  }
};

