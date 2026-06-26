import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { WORKBENCH_DOCS_PATH } from './docs/workbenchDocsNav';
import Layout from './components/Layout';
import AppsflyerQuery from './pages/Home';
import Dashboard from './pages/Dashboard';
import AutoPipe from './pages/AutoPipe';
import Account from './pages/Account';
import DispatchAccess from './pages/DispatchAccess';
import Doc from './pages/Doc';
import Login from './pages/login';
import Signup from './pages/signup';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AccountProvider, useAccount } from './contexts/AccountContext';
import { UserProvider, useUser } from './contexts/UserContext';
import LoadingSpinner from './components/LoadingSpinner';
import AppsFinder from './pages/AppsFinder';
import Benchmark from './pages/Benchmark';
import AppEstimator from './pages/AppEstimator';
import { ToastContainer } from './components/ui/toast';

const MAX_LOGIN_AGE = 1000 * 60 * 60 * 12; // 12 hours

// Context wrapper component, handles the loading state of UserContext and AccountContext
const ContextWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading: userLoading } = useUser();
  const { loading: accountLoading } = useAccount();

  // If the Context is still loading, display the loading status
  if (userLoading || accountLoading) {
    return <LoadingSpinner text="Loading User Information" />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <AuthProvider language="en">
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/*"
            element={
              <PrivateRoute>
                <UserProvider>
                  <AccountProvider>
                    <ContextWrapper>
                      <Layout>
                        <Routes>
                          <Route path="/" element={<AppsflyerQuery />} />
                          <Route path="/dashboard" element={<Dashboard />} />
                          <Route path="/autopipe" element={<AutoPipe />} />
                          <Route path="/dispatch-access" element={<DispatchAccess />} />
                          <Route path={WORKBENCH_DOCS_PATH} element={<Doc />} />
                          <Route
                            path="/docs/dispatch-access-center"
                            element={<Navigate to={WORKBENCH_DOCS_PATH} replace />}
                          />
                          <Route path="/account" element={<Account />} />
                          <Route path="/apps" element={<AppsFinder />} />
                          <Route path="/benchmark" element={<Benchmark />} />
                          <Route path="/app-estimator" element={<AppEstimator />} />
                        </Routes>
                      </Layout>
                    </ContextWrapper>
                  </AccountProvider>
                </UserProvider>
              </PrivateRoute>
            }
          />
        </Routes>
      </Router>
      <ToastContainer />
    </AuthProvider>
  );
};

// private routing component
const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, currentUser, isLoading, isVerifying } = useAuth();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Give a short delay to ensure the AuthContext is fully initialized
    const timer = setTimeout(() => {
      setIsInitializing(false);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Show loading status during verification
  if (isLoading || isVerifying || isInitializing) {
    return <LoadingSpinner text="Verifying Login Status" />;
  }

  // Check token and login time in local storage
  const token = localStorage.getItem('token');
  const userProfile = localStorage.getItem('userProfile');
  const loginTime = localStorage.getItem('loginTime');

  // If there is token, user information and login time, and the login time has not expired
  if (token && userProfile && loginTime) {
    const loginTimestamp = parseInt(loginTime, 10);
    const now = Date.now();
    const isTokenValid = now - loginTimestamp <= MAX_LOGIN_AGE;

    if (isTokenValid) {
      return <>{children}</>;
    }
  }

  // Redirect to login page only if unauthenticated is confirmed
  if (!isAuthenticated || !currentUser) {
    console.log('Unauthenticated, redirecting to login page');
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default App;
