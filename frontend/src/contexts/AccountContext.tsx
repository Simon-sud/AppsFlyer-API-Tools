import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { useAuth } from './AuthContext';
import { getAccountRefreshInterval } from '../utils/constants';
import { axiosInstance } from '../services/api';

interface AccountConfig {
  id: string;
  account_name: string;
  account_type: 'PID' | 'PRT';
  is_default: boolean;
  api_token?: string;
  validate?: any; // 兼容后端返回的 validate 字段
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

  // 缓存时间（5分钟）
  const CACHE_DURATION = 5 * 60 * 1000;

  // 使用user.id作为唯一标识
  const userKey = currentUser?.id || '';
  const CACHE_KEY = `accountConfigs_${userKey}`;
  const CACHE_TIME_KEY = `accountConfigsTime_${userKey}`;

  const fetchAccountConfigs = useCallback(async (forceRefresh = false, silent = false) => {
    try {
      if (!silent) setLoading(true);
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token) {
        setAccountConfigs([]);
        if (!silent) setLoading(false);
        return;
      }

      // 检查本地缓存
      const now = Date.now();
      const cached = localStorage.getItem(CACHE_KEY);
      const cachedTime = Number(localStorage.getItem(CACHE_TIME_KEY) || 0);
      if (!forceRefresh && cached && now - cachedTime < CACHE_DURATION) {
        setAccountConfigs(JSON.parse(cached));
        setLastUpdateTime(cachedTime);
        if (!silent) setLoading(false);
        return;
      }

      setError(null);

      const response = await axiosInstance.get('/api/auth/account-configs');
      if (response.status === 200) {
        const data = response.data as { configs?: AccountConfig[] };
        setAccountConfigs(data.configs || []);
        setLastUpdateTime(now);
        // 写入本地缓存
        localStorage.setItem(CACHE_KEY, JSON.stringify(data.configs || []));
        localStorage.setItem(CACHE_TIME_KEY, String(now));
      }
    } catch (err) {
      setAccountConfigs([]);
      setError(err instanceof Error ? err.message : '获取账户配置失败');
      message.error(err instanceof Error ? err.message : '获取账户配置失败');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [userKey]);

  // 获取指定类型的账户配置
  const getAccountConfig = useCallback((accountType: string) => {
    return accountConfigs.find(config => config.account_type === accountType);
  }, [accountConfigs]);

  // 账号切换时清空缓存并强制拉取
  useEffect(() => {
    setAccountConfigs([]);
    setLastUpdateTime(0);
    if (userKey) {
      fetchAccountConfigs(true);
    }
  }, [userKey, fetchAccountConfigs]);

  // 定期刷新（周期可动态调整）
  useEffect(() => {
    if (!currentUser) return;
    let timer: NodeJS.Timeout | null = null;
    function setupInterval() {
      if (timer) clearInterval(timer);
      const interval = getAccountRefreshInterval(userKey);
      timer = setInterval(() => {
        fetchAccountConfigs(true, true); // 静默刷新
      }, interval);
    }
    setupInterval();
    // 监听设置变更事件
    function onRuleChanged() {
      setupInterval();
    }
    window.addEventListener('accountRefreshRuleChanged', onRuleChanged);
    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener('accountRefreshRuleChanged', onRuleChanged);
    };
  }, [currentUser, userKey, fetchAccountConfigs]);

  // 退出登录时清空缓存
  useEffect(() => {
    if (!currentUser) {
      setAccountConfigs([]);
      setLastUpdateTime(0);
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_TIME_KEY);
    }
  }, [currentUser]);

  return (
    <AccountContext.Provider value={{
      accountConfigs,
      loading,
      error,
      refreshAccountConfigs: (silent = false) => fetchAccountConfigs(true, silent),
      getAccountConfig,
      lastUpdateTime
    }}>
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