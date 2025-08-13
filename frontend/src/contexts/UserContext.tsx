import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { useAuth } from './AuthContext';
import { axiosInstance } from '../services/api';

interface UserProfile {
  username: string;
  email: string;
  role: string;
  lastLogin: string;
  avatar?: string;
}

interface UserContextType {
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  refreshUserProfile: () => Promise<void>;
  updateUserProfile: (profile: Partial<UserProfile>) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currentUser } = useAuth();

  // 缓存时间（5分钟）
  const CACHE_DURATION = 5 * 60 * 1000;
  const [lastUpdateTime, setLastUpdateTime] = useState(0);

  // 新增：每个账号独立缓存
  const userKey = currentUser?.id || '';
  const CACHE_KEY = `userProfile_${userKey}`;
  const CACHE_TIME_KEY = `userProfileTime_${userKey}`;

  const fetchUserProfile = useCallback(async (forceRefresh = false) => {
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token) {
        return;
      }

      // 检查缓存是否有效
      const now = Date.now();
      const cached = localStorage.getItem(CACHE_KEY);
      const cachedTime = Number(localStorage.getItem(CACHE_TIME_KEY) || 0);
      if (!forceRefresh && cached && now - cachedTime < CACHE_DURATION) {
        setUserProfile(JSON.parse(cached));
        setLastUpdateTime(cachedTime);
        return;
      }

      setLoading(true);
      setError(null);

      const response = await axiosInstance.get('/api/auth/user-info');

      if (response.status !== 200) {
        throw new Error('获取用户信息失败');
      }

      const data = response.data as {
        email: string;
        username?: string;
        role: string;
        last_login?: string;
        avatar?: string;
      };
      const profile: UserProfile = {
        username: data.username || data.email.split('@')[0],
        email: data.email,
        role: data.role,
        lastLogin: data.last_login || new Date().toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).replace(/\//g, '-'),
        avatar: data.avatar
      };

      setUserProfile(profile);
      setLastUpdateTime(now);
      // 写入本地缓存
      localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
      localStorage.setItem(CACHE_TIME_KEY, String(now));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userKey]);

  // 切换账号时清理旧缓存并强制拉取
  useEffect(() => {
    setUserProfile(null);
    setLastUpdateTime(0);
    if (userKey) {
      // 清理所有userProfile缓存（可选：只清理当前userKey）
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('userProfile_')) localStorage.removeItem(key);
        if (key.startsWith('userProfileTime_')) localStorage.removeItem(key);
      });
      fetchUserProfile(true);
    }
  }, [userKey, fetchUserProfile]);

  // 更新用户信息
  const updateUserProfile = useCallback((profile: Partial<UserProfile>) => {
    setUserProfile(prev => prev ? { ...prev, ...profile } : null);
  }, []);

  // 初始加载
  useEffect(() => {
    if (currentUser) {
      fetchUserProfile();
    }
  }, [currentUser, fetchUserProfile]);

  // 定期刷新（每30分钟，固定）
  useEffect(() => {
    if (!currentUser) return;
    let timer: NodeJS.Timeout | null = null;
    function setupInterval() {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        fetchUserProfile(true);
      }, 30 * 60 * 1000); // 固定30分钟
    }
    setupInterval();
    return () => { if (timer) clearInterval(timer); };
  }, [currentUser, userKey, fetchUserProfile]);

  return (
    <UserContext.Provider value={{
      userProfile,
      loading,
      error,
      refreshUserProfile: () => fetchUserProfile(true),
      updateUserProfile
    }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}; 