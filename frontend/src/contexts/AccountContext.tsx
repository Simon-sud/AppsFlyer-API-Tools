import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { message } from '../components/ui/toast';
import { useAuth } from './AuthContext';
import { getAccountRefreshInterval } from '../utils/constants';
import { axiosInstance } from '../services/api';

interface AccountConfig {
  id: string;
  account_name: string;
  account_type: 'PID' | 'PRT';
  is_default: boolean;
  api_token?: string;
  custom_icon?: string; // Custom icon field
  validate?: any; // Backend validate field
  /** Deduped event names from Raw Data sample after Verify (JSON string possible) */
  account_event_types?: any;
  /** Raw Data export column names after Verify (JSON string possible) */
  account_message_fields?: any;
}

interface AccountContextType {
  accountConfigs: AccountConfig[];
  loading: boolean;
  error: string | null;
  refreshAccountConfigs: (silent?: boolean) => Promise<void>;
  getAccountConfig: (accountType: string) => AccountConfig | undefined;
  lastUpdateTime: number;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export const AccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accountConfigs, setAccountConfigs] = useState<AccountConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState(0);
  const { currentUser } = useAuth();

  // Cache TTL (5 minutes)
  const CACHE_DURATION = 5 * 60 * 1000;

  // user.id as cache key
  const userKey = currentUser?.id || '';
  const CACHE_KEY = `accountConfigs_${userKey}`;
  const CACHE_TIME_KEY = `accountConfigsTime_${userKey}`;

  // Ref: cache cleanup done once
  const cacheCleanedRef = useRef(false);
  
  // One-time purge of legacy token caches
  useEffect(() => {
    if (typeof window !== 'undefined' && !cacheCleanedRef.current) {
      // Remove accountConfigs_* keys (may contain tokens)
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('accountConfigs_')) {
          keysToRemove.push(key);
        }
        if (key && key.startsWith('accountConfigsTime_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      cacheCleanedRef.current = true; // Mark cleaned
    }
  }, []); // Run once on mount

  const fetchAccountConfigs = useCallback(async (forceRefresh = false, silent = false) => {
    try {
      if (!silent) setLoading(true);
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token) {
        setAccountConfigs([]);
        if (!silent) setLoading(false);
        return;
      }

      // Check local cache
      const now = Date.now();
      const cacheKey = `accountConfigs_${userKey}`;
      const cacheTimeKey = `accountConfigsTime_${userKey}`;
      const cached = localStorage.getItem(cacheKey);
      const cachedTime = Number(localStorage.getItem(cacheTimeKey) || 0);
      
      if (!forceRefresh && cached && now - cachedTime < CACHE_DURATION) {
        const parsedCache = JSON.parse(cached);
        // Strip token from cached data
        const sanitizedCache = parsedCache.map((config: any) => {
          const { api_token, ...rest } = config;
          return rest;
        });
        setAccountConfigs(sanitizedCache);
        setLastUpdateTime(cachedTime);
        if (!silent) setLoading(false);
        return;
      }

      setError(null);

      const response = await axiosInstance.get('/api/auth/account-configs');
      
      if (response.status === 200) {
        const data = response.data as { configs?: AccountConfig[] };
        // Strip token from API data
        const sanitizedConfigs = (data.configs || []).map((config: any) => {
          const { api_token, ...rest } = config;
          return rest;
        });
        setAccountConfigs(sanitizedConfigs);
        setLastUpdateTime(now);
        // Write cache without token
        localStorage.setItem(cacheKey, JSON.stringify(sanitizedConfigs));
        localStorage.setItem(cacheTimeKey, String(now));
      }
    } catch (err) {
      setAccountConfigs([]);
      setError(err instanceof Error ? err.message : '获取账户配置失败');
      message.error(err instanceof Error ? err.message : '获取账户配置失败');
    } finally {
      if (!silent) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey]); // CACHE_DURATION is constant

  // Account configs by type
  const getAccountConfig = useCallback((accountType: string) => {
    return accountConfigs.find(config => config.account_type === accountType);
  }, [accountConfigs]);

  // Ref: avoid duplicate init fetch
  const accountInitializedRef = useRef(false);
  const lastAccountUserKeyRef = useRef<string>('');

  // On account switch: clear cache and refetch
  useEffect(() => {
    // Skip if userKey unchanged and initialized
    if (userKey === lastAccountUserKeyRef.current && accountInitializedRef.current) {
      return;
    }

    // Empty userKey: reset without fetch
    if (!userKey) {
      setAccountConfigs([]);
      setLastUpdateTime(0);
      accountInitializedRef.current = false;
      lastAccountUserKeyRef.current = '';
      return;
    }

    // Update ref
    lastAccountUserKeyRef.current = userKey;
    
    setAccountConfigs([]);
    setLastUpdateTime(0);
    // Purge legacy token cache
    const cacheKey = `accountConfigs_${userKey}`;
    const cacheTimeKey = `accountConfigsTime_${userKey}`;
    localStorage.removeItem(cacheKey);
    localStorage.removeItem(cacheTimeKey);
    
    // Reset init flag
    accountInitializedRef.current = false;
    
    // Defer to next tick to avoid init races
    const timer = setTimeout(() => {
      fetchAccountConfigs(true);
      accountInitializedRef.current = true; // Mark initialized
    }, 0);
    
    return () => clearTimeout(timer);
  }, [userKey, fetchAccountConfigs]); // fetchAccountConfigs dep; ref/setTimeout dedupes

  // Periodic refresh (interval configurable)
  useEffect(() => {
    if (!currentUser) return;
    let timer: NodeJS.Timeout | null = null;
    function setupInterval() {
      if (timer) clearInterval(timer);
      const interval = getAccountRefreshInterval(userKey);
      timer = setInterval(() => {
        fetchAccountConfigs(true, true); // Silent refresh
      }, interval);
    }
    setupInterval();
    // Listen for settings changes
    function onRuleChanged() {
      setupInterval();
    }
    window.addEventListener('accountRefreshRuleChanged', onRuleChanged);
    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener('accountRefreshRuleChanged', onRuleChanged);
    };
  }, [currentUser, userKey, fetchAccountConfigs]);

  // Refetch account configs when Super Admin changes team
  useEffect(() => {
    const onSelectedTeamChanged = () => {
      fetchAccountConfigs(true, true);
    };
    window.addEventListener('selected-team-changed', onSelectedTeamChanged);
    return () => window.removeEventListener('selected-team-changed', onSelectedTeamChanged);
  }, [fetchAccountConfigs]);

  // Clear cache on logout
  useEffect(() => {
    if (!currentUser) {
      setAccountConfigs([]);
      setLastUpdateTime(0);
      // Clear all user caches (legacy tokens)
      if (userKey) {
        const cacheKey = `accountConfigs_${userKey}`;
        const cacheTimeKey = `accountConfigsTime_${userKey}`;
        localStorage.removeItem(cacheKey);
        localStorage.removeItem(cacheTimeKey);
      }
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_TIME_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, userKey]); // CACHE_KEY/CACHE_TIME_KEY derived from userKey

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = React.useMemo(() => ({
    accountConfigs,
    loading,
    error,
    refreshAccountConfigs: (silent = false) => fetchAccountConfigs(true, silent),
    getAccountConfig,
    lastUpdateTime
  }), [accountConfigs, loading, error, getAccountConfig, lastUpdateTime, fetchAccountConfigs]);

  return (
    <AccountContext.Provider value={contextValue}>
      {children}
    </AccountContext.Provider>
  );
};

export const useAccount = () => {
  const context = useContext(AccountContext);
  if (context === undefined) {
    throw new Error('useAccount must be used within an AccountProvider');
  }
  return context;
}; 