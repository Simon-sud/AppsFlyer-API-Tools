import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { axiosInstance } from '../services/api';
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
    
    // 检查 token 是否过期（12小时）
    const loginTimestamp = parseInt(loginTime, 10);
    const now = Date.now();
    return now - loginTimestamp <= 12 * 60 * 60 * 1000;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(true);

  // 初始化时设置 axios 默认请求头
  useEffect(() => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) {
      axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    setIsLoading(false);
    setIsVerifying(false);
  }, []);

  useEffect(() => {
    const verifyToken = async () => {
      try {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const userProfile = localStorage.getItem('userProfile') || sessionStorage.getItem('userProfile');
        const loginTime = localStorage.getItem('loginTime') || sessionStorage.getItem('loginTime');
        
        if (!token || !userProfile || !loginTime) {
          console.log('缺少token或用户信息，执行登出操作');
          logout();
          return;
        }

            const loginTimestamp = parseInt(loginTime, 10);
            const now = Date.now();
            
        // 检查 token 是否过期（12小时）
        if (now - loginTimestamp > 12 * 60 * 60 * 1000) {
          console.log('Token已过期，执行登出操作');
          logout();
          return;
        }

        // 设置 axios 默认请求头
        axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;

        try {
          const response = await axiosInstance.get('/api/auth/verify');
          if (response.status === 200) {
            const user = JSON.parse(userProfile);
            setCurrentUser(user);
            setIsAuthenticated(true);
            console.log('Token验证成功，用户已登录');
          }
        } catch (error: any) {
          console.error('Token验证失败:', error);
          // 只有在明确收到401错误时才登出
          if (error.response?.status === 401) {
            console.log('Token无效，执行登出操作');
            logout();
          }
        }
      } catch (error) {
        console.error('Token验证过程出错:', error);
        // 保持当前状态
        const userProfile = localStorage.getItem('userProfile') || sessionStorage.getItem('userProfile');
        if (userProfile) {
          const user = JSON.parse(userProfile);
          setCurrentUser(user);
          setIsAuthenticated(true);
        }
      }
    };

    // 立即执行一次验证
    verifyToken();

    // 设置定时验证（每30分钟验证一次）
    const intervalId = setInterval(verifyToken, 30 * 60 * 1000);

    // 清理函数
    return () => {
      clearInterval(intervalId);
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
    // 清除语言设置，确保下次登录时重置为默认英文
    sessionStorage.removeItem('language');
    delete axiosInstance.defaults.headers.common['Authorization'];
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
    return <LoadingSpinner text={language === 'zh' ? '正在验证登录状态' : 'Verifying Login Status'} />;
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext; 