import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { axiosInstance, clearTeamScopeStorage } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

interface User {
  id: string;
  accountType: string;
  accountId: string;
  accountName: string;
  apiToken?: string;
  appId?: string;
  appName?: string;
}

interface AuthContextType {
  currentUser: User | null;
  accountType: string;
  accountId: string;
  login: (user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  isVerifying: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
  language?: string;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children, language = 'en' }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('userProfile') || sessionStorage.getItem('userProfile');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const loginTime = localStorage.getItem('loginTime') || sessionStorage.getItem('loginTime');
    if (!token || !loginTime) return false;
    
    // Check token expiry (12h)
    const loginTimestamp = parseInt(loginTime, 10);
    const now = Date.now();
    return now - loginTimestamp <= 12 * 60 * 60 * 1000;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(true);

  // Set axios default headers on init
  useEffect(() => {
    // Skip Authorization on login page
    if (window.location.pathname === '/login') {
      setIsLoading(false);
      setIsVerifying(false);
      return;
    }

    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) {
      axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    setIsLoading(false);
    setIsVerifying(false);
  }, []);

  // Ref: avoid duplicate verify
  const isVerifyingRef = useRef(false);
  const lastVerifyTimeRef = useRef<number>(0);
  const VERIFY_COOLDOWN = 5000; // 5s cooldown between verifies

  useEffect(() => {
    const verifyToken = async () => {
      // Skip if verify in flight
      if (isVerifyingRef.current) {
        return;
      }

      // Skip if within cooldown
      const now = Date.now();
      if (now - lastVerifyTimeRef.current < VERIFY_COOLDOWN) {
        return;
      }

      try {
        // Skip verify on login page
        if (window.location.pathname === '/login') {
          setIsLoading(false);
          setIsVerifying(false);
          return;
        }

        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const userProfile = localStorage.getItem('userProfile') || sessionStorage.getItem('userProfile');
        const loginTime = localStorage.getItem('loginTime') || sessionStorage.getItem('loginTime');
        
        if (!token || !userProfile || !loginTime) {
          // Missing token logs in dev
          if (process.env.NODE_ENV === 'development') {
            console.log('Missing token or user info, executing logout');
          }
          logout();
          return;
        }

        const loginTimestamp = parseInt(loginTime, 10);
            
        // Check token expiry (12h)
        if (now - loginTimestamp > 12 * 60 * 60 * 1000) {
          // Expired token logs in dev
          if (process.env.NODE_ENV === 'development') {
            console.log('Token expired, executing logout');
          }
          logout();
          return;
        }

        // Set verify flags and timestamp
        isVerifyingRef.current = true;
        lastVerifyTimeRef.current = now;

        // Set axios default headers
        axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;

        try {
          const response = await axiosInstance.get('/api/auth/verify');
          if (response.status === 200) {
            const user = JSON.parse(userProfile);
            
            // Ensure user.id; parse from JWT if missing
            if (!user.id && token) {
              try {
                // Parse JWT payload for user id (no verify)
                const base64Url = token.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const payload = JSON.parse(window.atob(base64));
                
                if (payload.id) {
                  user.id = payload.id;
                  user.role = payload.role || user.role || 'Authenticated User';
                  // Update stored user
                  localStorage.setItem('userProfile', JSON.stringify(user));
                  if (sessionStorage.getItem('userProfile')) {
                    sessionStorage.setItem('userProfile', JSON.stringify(user));
                  }
                }
              } catch (e) {
                // Silent fail
              }
            }
            
            setCurrentUser(user);
            setIsAuthenticated(true);
            // Verify success logs in dev
            if (process.env.NODE_ENV === 'development') {
              console.log('Token verification successful, user logged in');
            }
          }
        } catch (error: any) {
          console.error('Token验证失败:', error);
          // Logout only on explicit 401
          if (error.response?.status === 401) {
            // Invalid token logs in dev
            if (process.env.NODE_ENV === 'development') {
              console.log('Token无效，执行登出操作');
            }
            logout();
          }
        } finally {
          isVerifyingRef.current = false;
        }
      } catch (error) {
        console.error('Token验证过程出错:', error);
        isVerifyingRef.current = false;
        // Keep current state
        const userProfile = localStorage.getItem('userProfile') || sessionStorage.getItem('userProfile');
        if (userProfile) {
          const user = JSON.parse(userProfile);
          setCurrentUser(user);
          setIsAuthenticated(true);
        }
      }
    };

    // Verify once immediately
    verifyToken();

    // Re-verify every 30 minutes
    const intervalId = setInterval(verifyToken, 30 * 60 * 1000);

    // Cleanup
    return () => {
      clearInterval(intervalId);
      isVerifyingRef.current = false;
    };
  }, []);

  const login = (user: User) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    setIsVerifying(false);
  };

  const logout = () => {
    setCurrentUser(null);
    setIsAuthenticated(false);
    setIsVerifying(false);
    localStorage.removeItem('token');
    localStorage.removeItem('userProfile');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('loginTime');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('userProfile');
    sessionStorage.removeItem('isLoggedIn');
    sessionStorage.removeItem('loginTime');
    // Clear language so next login defaults to English
    sessionStorage.removeItem('language');
    delete axiosInstance.defaults.headers.common['Authorization'];
    clearTeamScopeStorage();
  };

  const value = {
    currentUser,
    accountType: currentUser?.accountType || '',
    accountId: currentUser?.accountId || '',
    login,
    logout,
    isAuthenticated,
    isLoading,
    isVerifying
  };

  if (isLoading || isVerifying) {
    return <LoadingSpinner text="Verifying Login Status" />;
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext; 