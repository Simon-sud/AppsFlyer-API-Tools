import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
// Removed unused import: message
import { useAuth } from './AuthContext';
import { axiosInstance } from '../services/api';

interface PrimaryTeam {
  id: string;
  name: string;
  teamType: string;
  logo?: string;
}

interface UserProfile {
  username: string;
  email: string;
  role: string;
  lastLogin: string;
  avatar?: string;
  twoFactorEnabled?: boolean;
  primary_team?: PrimaryTeam | null;
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

  // Cache TTL 1 min for timely last_login
  const CACHE_DURATION = 1 * 60 * 1000;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_lastUpdateTime, setLastUpdateTime] = useState(0);

  // Per-account cache
  const userKey = currentUser?.id || '';
  const CACHE_KEY = `userProfile_${userKey}`;
  const CACHE_TIME_KEY = `userProfileTime_${userKey}`;

  const fetchUserProfile = useCallback(async (forceRefresh = false) => {
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token) {
        return;
      }

      // Skip duplicate fetch while loading
      if (loading && !forceRefresh) {
        console.log('UserContext: 正在加载中，跳过重复请求');
        return;
      }

      // Check cache validity
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
        two_factor_enabled?: boolean;
        primary_team?: { id: string; name: string; teamType: string; logo?: string } | null;
      };

      const profile: UserProfile = {
        username: data.username || data.email.split('@')[0],
        email: data.email,
        role: data.role,
        lastLogin: data.last_login || 'Never',
        avatar: data.avatar,
        twoFactorEnabled: data.two_factor_enabled || false,
        primary_team: data.primary_team ?? null
      };
      setUserProfile(profile);
      setLastUpdateTime(now);
      // Write local cache
      localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
      localStorage.setItem(CACHE_TIME_KEY, String(now));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey]); // Constants omitted; loading used internally

  // Ref: avoid duplicate init fetch
  const initializedRef = useRef(false);
  const lastUserKeyRef = useRef<string>('');

  // On account switch: clear cache and refetch
  useEffect(() => {
    // Skip if userKey unchanged and initialized
    if (userKey === lastUserKeyRef.current && initializedRef.current) {
      return;
    }

    // Update ref
    lastUserKeyRef.current = userKey;
    
    if (userKey && currentUser) {
      // Clear all userProfile caches
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('userProfile_')) localStorage.removeItem(key);
        if (key.startsWith('userProfileTime_')) localStorage.removeItem(key);
      });
      
      // Reset init flag
      initializedRef.current = false;
      
      // Force refresh
      fetchUserProfile(true);
      initializedRef.current = true; // Mark initialized
    } else if (!userKey) {
      // Logout: reset state
      setUserProfile(null);
      setLastUpdateTime(0);
      initializedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey, currentUser]); // fetchUserProfile omitted; ref dedupes

  // Update user profile
  const updateUserProfile = useCallback((profile: Partial<UserProfile>) => {
    setUserProfile(prev => prev ? { ...prev, ...profile } : null);
  }, []);

  // Periodic refresh every 30 minutes
  useEffect(() => {
    if (!currentUser) return;
    let timer: NodeJS.Timeout | null = null;
    function setupInterval() {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        fetchUserProfile(true);
      }, 30 * 60 * 1000); // Fixed 30 minutes
    }
    setupInterval();
    return () => { if (timer) clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, userKey]); // fetchUserProfile omitted to avoid loop

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