import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { axiosInstance } from '../../services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction, CardFooter } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { message } from '../../components/ui/toast';
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '../../components/ui/input-otp';

// Removed unused interfaces: LoginFormData, TwoFactorFormData, LoginResponse

// Eye icon components
const EyeIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const EyeOffIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
  </svg>
);


const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loginLoading, setLoginLoading] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [twoFactorData, setTwoFactorData] = useState<any>(null);
  const [qrModalData, setQrModalData] = useState<any>(null);
  const [buttonShake, setButtonShake] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  
  // Autofill: off initially, enabled on user interaction
  const [emailAutoComplete, setEmailAutoComplete] = useState<string>('off');
  const [passwordAutoComplete, setPasswordAutoComplete] = useState<string>('new-password');
  
  // Page resource loading state
  const [isPageReady, setIsPageReady] = useState(false);
  const logoLoadedRef = useRef(false);
  const logoErrorRef = useRef(false);
  const logoImageRef = useRef<HTMLImageElement | null>(null);
  
  // Detect Chrome (exclude Edge)
  const [isChrome, setIsChrome] = useState(false);
  
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isChromeBrowser = /chrome/.test(userAgent) && !/edg/.test(userAgent);
    setIsChrome(isChromeBrowser);
  }, []);

  const isTotpComplete = useMemo(() => {
    return totpCode && totpCode.length === 6;
  }, [totpCode]);
  
  // Preload logo image
  useEffect(() => {
    const logoImg = new Image();
    logoImg.src = '/favicon.svg';
    
    logoImg.onload = () => {
      logoLoadedRef.current = true;
      logoImageRef.current = logoImg;
      // Wait one microtask so resources finish loading
      setTimeout(() => {
        setIsPageReady(true);
      }, 0);
    };
    
    logoImg.onerror = () => {
      logoErrorRef.current = true;
      // Show page even if logo fails (logo hidden)
      setTimeout(() => {
        setIsPageReady(true);
      }, 0);
    };
    
    // Timeout cap to avoid long resource waits
    const timeout = setTimeout(() => {
      if (!logoLoadedRef.current && !logoErrorRef.current) {
        setIsPageReady(true);
      }
    }, 2000); // Max wait 2s
    
    return () => {
      clearTimeout(timeout);
    };
  }, []);

  // Prevent Chrome autofill on page load
  useEffect(() => {
    // Set via requestAnimationFrame before paint
    const rafId = requestAnimationFrame(() => {
      const emailInput = document.getElementById('email') as HTMLInputElement;
      const passwordInput = document.getElementById('password') as HTMLInputElement;
      
      if (emailInput) {
        // Force autocomplete off
        emailInput.setAttribute('autocomplete', 'off');
        emailInput.setAttribute('data-lpignore', 'true'); // Ignore LastPass
        emailInput.setAttribute('data-form-type', 'other'); // Block other password managers
        emailInput.setAttribute('data-1p-ignore', 'true'); // Ignore 1Password
      }
      
      if (passwordInput) {
        // Use new-password to block autofill until user interacts
        passwordInput.setAttribute('autocomplete', 'new-password');
        passwordInput.setAttribute('data-lpignore', 'true');
        passwordInput.setAttribute('data-form-type', 'other');
        passwordInput.setAttribute('data-1p-ignore', 'true');
      }
    });
    
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, []); // Run once on mount

  // Filter out Chinese characters and other non-ASCII characters (keep only ASCII letters, numbers, and common punctuation)
  const filterNonASCII = (value: string): string => {
    // Remove Chinese characters (Unicode range \u4e00-\u9fa5)
    // Keep ASCII letters, numbers, and common punctuation: @ . _ - + ! # $ % & * ( ) [ ] { } | \ : ; " ' < > , ? / ~ ` ^
    return value.replace(/[\u4e00-\u9fa5\u3400-\u4dbf\uf900-\ufaff]/g, '');
  };
  
  // Email validation
  const validateEmail = (email: string): boolean => {
    if (!email) {
      setEmailError('Enter email');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError('Invalid email format');
      return false;
    }
    setEmailError('');
    return true;
  };
  
  // Password validation
  const validatePassword = (password: string): boolean => {
    if (!password) {
      setPasswordError('Enter password');
      return false;
    }
    if (password.length < 6) {
      setPasswordError('Password too short');
      return false;
    }
    setPasswordError('');
    return true;
  };
  
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isComposing) {
      const filteredValue = filterNonASCII(e.target.value);
      setEmail(filteredValue);
      if (emailError) {
        validateEmail(filteredValue);
      }
    } else {
      setEmail(e.target.value);
    }
  };
  
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isComposing) {
      const filteredValue = filterNonASCII(e.target.value);
      setPassword(filteredValue);
      if (passwordError) {
        validatePassword(filteredValue);
      }
    } else {
      setPassword(e.target.value);
    }
  };
  
  const handleCompositionStart = () => {
    setIsComposing(true);
  };
  
  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    setIsComposing(false);
    // Filter the final value after composition ends
    const filteredValue = filterNonASCII(e.currentTarget.value);
    if (e.currentTarget.id === 'email') {
      setEmail(filteredValue);
      if (emailError) {
        validateEmail(filteredValue);
      }
    } else if (e.currentTarget.id === 'password') {
      setPassword(filteredValue);
      if (passwordError) {
        validatePassword(filteredValue);
      }
    }
  };
  
  const handleTotpChange = useCallback((value: string) => {
    setTotpCode(value);
  }, []);
  
  const handleLoginSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    
    if (!isEmailValid || !isPasswordValid) {
      return;
    }
    
    setLoginLoading(true);
    
    try {
      const response = await axiosInstance.post('/api/auth/login', { email, password });
      const data = response.data as any;
      
      // Check 2FA requirement before token check
      if (data && (data.requires_2fa === true || data.requires_2fa === 'true')) {
        console.log('2FA required, showing 2FA input:', data);
          setTwoFactorData(data);
          setShow2FA(true);
          setLoginLoading(false);
          return;
        }
        
        // Normal login flow
      if (response.status === 200) {
        if (!data.token || !data.user) {
          console.error('Login response missing token or user:', data);
          message.error('Login failed. Invalid response from server.');
          setLoginLoading(false);
          return;
        }
        
        const userData = {
          id: data.user.id,
          email: data.user.email,
          role: data.user.role,
          accountType: data.user.accountType || 'default',
          accountId: data.user.accountId || data.user.id,
          accountName: data.user.accountName || data.user.username || data.user.email
        };
        
        try {
          localStorage.setItem('token', data.token);
          localStorage.setItem('userProfile', JSON.stringify(userData));
          localStorage.setItem('loginTime', Date.now().toString());
        localStorage.setItem('isLoggedIn', 'true');
          
          // Update AuthContext state
          login(userData);
          
          // Navigate via React Router (no full reload)
          navigate('/', { replace: true });
        } catch (error) {
          console.error('Login function execution failed:', error);
          message.error('Login failed. Please try again.');
          setLoginLoading(false);
        }
        } else {
        const errorMsg = data?.message || data?.error || 'Login failed';
        message.error(errorMsg);
        setLoginLoading(false);
      }
    } catch (error: any) {
      console.error('Login exception:', error);
      
      // Handle axios error response
      let errorMessage = 'Login failed. Please check your credentials and try again.';
      let isAuthError = false;
      
      if (error.response) {
        // Server returned error response
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 401) {
          errorMessage = data?.message || 'Invalid email or password';
          isAuthError = true;
        } else if (status === 500) {
          errorMessage = data?.message || 'Server error. Please try again later.';
        } else {
          errorMessage = data?.message || `Login failed (${status})`;
        }
      } else if (error.request) {
        // Request sent but no response received
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      
      message.error(errorMessage, undefined, isAuthError);
      setLoginLoading(false);
    }
  };

  const handleTwoFactorSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!isTotpComplete) {
      setButtonShake(true);
      setTimeout(() => setButtonShake(false), 600);
      return;
    }
    
    if (!twoFactorData || !twoFactorData.temp_identifier) {
      message.error('Invalid 2FA session. Please login again.');
      setShow2FA(false);
      setTwoFactorData(null);
      return;
    }
    
    setTwoFactorLoading(true);
    try {
      const response = await axiosInstance.post('/api/auth/2fa/verify', {
        temp_identifier: twoFactorData.temp_identifier,
        totp_code: totpCode
      });

      const data = response.data as any;
        
      if (response.status === 200) {
        if (!data.token || !data.user) {
          message.error('Verification failed. Please try again.');
          setTwoFactorLoading(false);
        return;
      }
        
        const userData = {
          id: data.user.id,
          email: data.user.email,
          role: data.user.role || 'Authenticated User',
          accountType: data.user.accountType || 'default',
          accountId: data.user.accountId || data.user.id,
          accountName: data.user.accountName || data.user.username || data.user.email
        };
        
                  try {
            localStorage.setItem('token', data.token);
            localStorage.setItem('userProfile', JSON.stringify(userData));
            localStorage.setItem('loginTime', Date.now().toString());
            localStorage.setItem('isLoggedIn', 'true');
            
          // Update AuthContext state
          login(userData);
            
          // Navigate via React Router (no full reload)
          navigate('/', { replace: true });
          } catch (error) {
          console.error('Login function execution failed:', error);
          message.error('Login failed. Please try again.');
            setTwoFactorLoading(false);
          }
      } else {
        const errorMsg = data?.message || data?.error || 'Verification failed';
        message.error(errorMsg);
          setTwoFactorLoading(false);
        }
    } catch (error: any) {
      console.error('2FA verification exception:', error);
      
      let errorMessage = 'Verification failed. Please check your code and try again.';
      let isAuthError = false;
      
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 401) {
          errorMessage = data?.message || 'Invalid verification code';
          isAuthError = true;
        } else if (status === 500) {
          errorMessage = data?.message || 'Server error. Please try again later.';
        } else {
          errorMessage = data?.message || `Verification failed (${status})`;
        }
      } else if (error.request) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      
      message.error(errorMessage, undefined, isAuthError);
      setTwoFactorLoading(false);
      // Keep TOTP on verify failure for retry
      // Re-login only when temp id expires
      if (error.response?.status === 401 && 
          (error.response?.data?.error?.includes('Temporary identifier') || 
           error.response?.data?.error?.includes('invalid or expired'))) {
        // Temp id expired; re-login required
        setShow2FA(false);
        setTwoFactorData(null);
        setTotpCode('');
        message.error('Session expired. Please login again.');
      }
      // Other errors keep TOTP for retry
    }
  };

    // Show loading until page ready
    if (!isPageReady) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white" style={{ userSelect: 'none' }}>
          <div className="flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-3 border-gray-300 border-t-black rounded-full animate-spin mb-4" />
            <p className="text-sm text-gray-600">Loading...</p>
          </div>
        </div>
      );
    }
    
    return (
    <div className={`min-h-screen flex items-center justify-center bg-white px-4 py-12 select-none ${isChrome ? 'chrome-browser' : ''}`} style={{ userSelect: 'none' }}>
      <style>{`
        .select-none * { user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }
        .select-none input, .select-none textarea { user-select: text !important; -webkit-user-select: text !important; -moz-user-select: text !important; -ms-user-select: text !important; }
        .select-none input#email:-webkit-autofill, .select-none input#email:-webkit-autofill:hover, .select-none input#email:-webkit-autofill:focus, .select-none input#email:-webkit-autofill:active,
        .select-none input#password:-webkit-autofill, .select-none input#password:-webkit-autofill:hover, .select-none input#password:-webkit-autofill:focus, .select-none input#password:-webkit-autofill:active,
        .select-none input:-webkit-autofill, .select-none input:-webkit-autofill:hover, .select-none input:-webkit-autofill:focus, .select-none input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 30px white inset !important; -webkit-text-fill-color: inherit !important; box-shadow: 0 0 0 30px white inset !important; transition: background-color 5000s ease-in-out 0s;
          font-size: 0.875rem !important; zoom: 1 !important; -webkit-text-size-adjust: 100% !important; text-size-adjust: 100% !important;
          -webkit-font-smoothing: antialiased !important; -moz-osx-font-smoothing: grayscale !important; line-height: 1.5 !important;
        }
        .chrome-browser #email, .chrome-browser #password, .chrome-browser input[type="email"], .chrome-browser input[type="password"],
        .chrome-browser #email:hover, .chrome-browser #email:focus, .chrome-browser #email:active, .chrome-browser #email:focus-visible,
        .chrome-browser #password:hover, .chrome-browser #password:focus, .chrome-browser #password:active, .chrome-browser #password:focus-visible {
          font-size: 0.875rem !important; line-height: 1.5 !important; zoom: 1 !important; -webkit-text-size-adjust: 100% !important; text-size-adjust: 100% !important; font-family: inherit !important;
        }
        #email::placeholder, #password::placeholder {
          font-size: 0.875rem !important;
          line-height: 1.5 !important;
        }
        #email::-webkit-input-placeholder, #password::-webkit-input-placeholder {
          font-size: 0.875rem !important;
          line-height: 1.5 !important;
        }
        #email::-moz-placeholder, #password::-moz-placeholder {
          font-size: 0.875rem !important;
          line-height: 1.5 !important;
        }
        #email:-ms-input-placeholder, #password:-ms-input-placeholder {
          font-size: 0.875rem !important;
          line-height: 1.5 !important;
        }
        .chrome-browser #email::placeholder, .chrome-browser #password::placeholder {
          font-size: 0.875rem !important; line-height: 1.5 !important; transform: translateY(-1px) !important;
        }
        .chrome-browser #email::-webkit-input-placeholder, .chrome-browser #password::-webkit-input-placeholder {
          font-size: 0.875rem !important; line-height: 1.5 !important; transform: translateY(-1px) !important;
        }
        .chrome-browser #email::-moz-placeholder, .chrome-browser #password::-moz-placeholder {
          font-size: 0.875rem !important; line-height: 1.5 !important; transform: translateY(-1px) !important;
        }
        .chrome-browser #email:-ms-input-placeholder, .chrome-browser #password:-ms-input-placeholder {
          font-size: 0.875rem !important; line-height: 1.5 !important; transform: translateY(-1px) !important;
        }
      `}</style>
      <div 
        className="w-full max-w-md"
        style={isChrome ? { 
          zoom: 1.25
        } : undefined}
      >
        <Card className="border-gray-200 shadow-none">
          <CardHeader className="space-y-1 pb-4">
            {/* Logo */}
            <div className="flex justify-center mb-4" style={{ minHeight: '48px' }}>
              {logoLoadedRef.current ? (
                <img 
                  src="/favicon.svg"
                  alt="ADNEXUS Logo" 
                  className="h-12 w-auto"
                />
              ) : null}
            </div>
            <CardTitle className="text-2xl font-semibold text-center">
              {show2FA ? '2-Step Verification' : 'ADNEXUS LOGIN'}
            </CardTitle>
            {!show2FA && (
              <CardDescription className="text-center text-gray-600">
                Enter your email below to login to your account
              </CardDescription>
            )}
            {show2FA && (
              <CardAction className="justify-center pt-2">
                    <Button
                  variant="link"
                  className="text-sm text-gray-600 hover:text-gray-900"
                      onClick={async () => {
                        setQrModalData({ loading: true });
                        try {
                          const response = await fetch('/api/auth/2fa/generate-qr', {
                            method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              temp_identifier: twoFactorData.temp_identifier,
                              email: twoFactorData.user.email
                            })
                          });
                          
                          const qrData = await response.json();
                          if (response.ok && qrData.success) {
                            setQrModalData(qrData);
                          } else {
                            setQrModalData({ error: true });
                          }
                        } catch (error) {
                          setQrModalData({ error: true });
                        }
                      }}
                    >
                      {qrModalData ? 'Refresh QR Code' : 'Generate New QR Code'}
                    </Button>
              </CardAction>
            )}
          </CardHeader>
          
          <CardContent className="space-y-4">
            {!show2FA ? (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="alpha@example.com"
                    value={email}
                    onChange={handleEmailChange}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    onFocus={() => {
                      // Enable autofill on input focus
                      setEmailAutoComplete('username');
                      // Sync DOM attributes
                      const emailInput = document.getElementById('email') as HTMLInputElement;
                      if (emailInput) {
                        emailInput.setAttribute('autocomplete', 'username');
                        emailInput.removeAttribute('data-lpignore');
                        emailInput.removeAttribute('data-form-type');
                        emailInput.removeAttribute('data-1p-ignore');
                      }
                    }}
                    className={`h-11 ${emailError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                    autoComplete={emailAutoComplete}
                  />
                  {emailError && (
                    <p className="text-sm text-red-500">{emailError}</p>
                  )}
                  </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => message.info('This feature is not available yet.')}
                      className="text-sm text-gray-600 hover:text-gray-900 underline-offset-4 hover:underline bg-transparent border-none p-0 cursor-pointer font-inherit text-left"
                    >
                      Forgot your password?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={handlePasswordChange}
                      onCompositionStart={handleCompositionStart}
                      onCompositionEnd={handleCompositionEnd}
                      onFocus={() => {
                        // Enable autofill on input focus
                        setPasswordAutoComplete('current-password');
                        // Sync DOM attributes
                        const passwordInput = document.getElementById('password') as HTMLInputElement;
                        if (passwordInput) {
                          passwordInput.setAttribute('autocomplete', 'current-password');
                          passwordInput.removeAttribute('data-lpignore');
                          passwordInput.removeAttribute('data-form-type');
                          passwordInput.removeAttribute('data-1p-ignore');
                        }
                      }}
                      className={`h-11 pr-10 ${passwordError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                      autoComplete={passwordAutoComplete}
                      style={{ 
                        paddingRight: '2.5rem'
                      }}
                    />
                    {/* Hide browser default password reveal controls */}
                    <style>{`
                      #password::-ms-reveal,
                      #password::-ms-clear {
                        display: none;
                      }
                      #password::-webkit-credentials-auto-fill-button {
                        display: none;
                      }
                    `}</style>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 text-gray-500 hover:text-gray-700 z-10"
                      style={{
                        top: '50%',
                        transform: 'translateY(-50%)',
                        WebkitTransform: 'translateY(-50%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '20px',
                        height: '20px',
                        padding: 0,
                        margin: 0,
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer'
                      }}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                  </div>
                  {passwordError && (
                    <p className="text-sm text-red-500">{passwordError}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-black text-white hover:bg-gray-900"
                  disabled={loginLoading}
                >
                  {loginLoading ? 'Loading...' : 'Log In'}
                </Button>
              </form>
            ) : (
              <>
                  {qrModalData && (
                  <div className="text-center mb-6 p-5 bg-gray-50 rounded-lg border border-gray-200">
                      {qrModalData.loading && (
                      <div className="flex flex-col items-center justify-center min-h-[180px]">
                        <div className="w-10 h-10 border-3 border-gray-300 border-t-black rounded-full animate-spin mb-4" />
                        <p className="text-sm text-gray-600">Generating QR Code...</p>
                </div>
                      )}
                      
                      {qrModalData.error && (
                      <div className="flex flex-col items-center justify-center min-h-[180px]">
                        <div className="w-10 h-10 border-2 border-red-300 rounded-full flex items-center justify-center mb-4">
                          <span className="text-red-500 text-xl">!</span>
                </div>
                        <p className="text-sm text-red-600 mb-2">Failed to generate QR Code</p>
                          <Button
                          variant="link"
                            onClick={() => setQrModalData(null)}
                          className="text-xs text-gray-600"
                          >
                            Try Again
                          </Button>
              </div>
                      )}
                      
                      {qrModalData.qr_code && !qrModalData.loading && !qrModalData.error && (
                        <>
                          <img 
                            src={qrModalData.qr_code} 
                            alt="2FA QR Code" 
                          className="max-w-[180px] mx-auto mb-4 rounded-lg shadow-md"
                        />
                        <p className="text-sm text-gray-600">
                            Please scan this QR code with Google Authenticator
                          </p>
                        </>
                      )}
              </div>
                  )}
                  
                <form onSubmit={handleTwoFactorSubmit} className="space-y-4">
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={totpCode}
                        onChange={handleTotpChange}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                      </InputOTPGroup>
                      <InputOTPSeparator />
                      <InputOTPGroup>
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                      <Button
                    type="submit"
                    className={`w-full h-11 bg-black text-white hover:bg-gray-900 ${buttonShake ? 'animate-pulse' : ''}`}
                    disabled={!isTotpComplete || twoFactorLoading}
                  >
                    {twoFactorLoading ? 'Verifying...' : 'Verify'}
                      </Button>
                </form>
                </>
              )}
          </CardContent>
          
          {!show2FA && (
            <CardFooter className="flex-col gap-2 pt-0">
              <div className="text-sm text-center text-gray-600">
                Don't have an account?{' '}
                <Link
                  to="/signup"
                  className="text-blue-600 hover:underline bg-transparent border-none p-0 cursor-pointer font-medium"
                >
                  Sign Up
                </Link>
              </div>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Login; 
