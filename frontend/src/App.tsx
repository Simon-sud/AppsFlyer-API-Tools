import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Account from './pages/Account';
import Login from './pages/login';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import ReportManagement from './pages/ReportManagement';
import MindsDB from './pages/MindsDB';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AccountProvider, useAccount } from './contexts/AccountContext';
import { UserProvider, useUser } from './contexts/UserContext';
import LoadingSpinner from './components/LoadingSpinner';
import AppsFinder from './pages/AppsFinder';
import Settings from './pages/Settings';

const MAX_LOGIN_AGE = 1000 * 60 * 60 * 12; // 12小时

const App: React.FC = () => {
  return (
    <LanguageProvider>
      <AppWithLanguage />
    </LanguageProvider>
  );
};

const AppWithLanguage: React.FC = () => {
  const { language } = useLanguage();
  
  return (
    <AuthProvider language={language}>
      <UserProvider>
        <AccountProvider>
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/*"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/reports" element={<ReportManagement />} />
                        <Route path="/account" element={<Account />} />
                        <Route path="/mindsdb" element={<MindsDB />} />
                        <Route path="/apps" element={<AppsFinder />} />
                        <Route path="/settings" element={<Settings />} />
                      </Routes>
                    </Layout>
                  </PrivateRoute>
                }
              />
            </Routes>
          </Router>
        </AccountProvider>
      </UserProvider>
    </AuthProvider>
  );
};

// 私有路由组件
const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, currentUser, isLoading, isVerifying } = useAuth();
  const { loading: userLoading } = useUser();
  const { loading: accountLoading } = useAccount();
  const [isInitializing, setIsInitializing] = useState(true);
  const { language } = useLanguage();

  useEffect(() => {
    // 给一个短暂的延迟，确保 AuthContext 完全初始化
    const timer = setTimeout(() => {
      setIsInitializing(false);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // 在验证过程中显示加载状态
  if (isLoading || isVerifying || isInitializing || userLoading || accountLoading) {
    return <LoadingSpinner text={language === 'zh' ? '正在验证登录状态' : 'Verifying Login Status'} />;
  }

  // 检查本地存储中的 token 和登录时间
  const token = localStorage.getItem('token');
  const userProfile = localStorage.getItem('userProfile');
  const loginTime = localStorage.getItem('loginTime');

  // 如果有 token、用户信息和登录时间，且登录时间未过期
  if (token && userProfile && loginTime) {
    const loginTimestamp = parseInt(loginTime, 10);
    const now = Date.now();
    const isTokenValid = now - loginTimestamp <= MAX_LOGIN_AGE;

    if (isTokenValid) {
      return <>{children}</>;
    }
  }

  // 只有在确认未认证时才重定向到登录页面
  if (!isAuthenticated || !currentUser) {
    console.log('未认证状态，重定向到登录页面');
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default App;
