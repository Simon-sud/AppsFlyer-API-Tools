import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { axiosInstance } from '../../services/api';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../../components/ui/input-otp';
import { message } from '../../components/ui/toast';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePassword(pwd: string): { valid: boolean; message: string } {
  if (pwd.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  if (!/[a-zA-Z]/.test(pwd)) {
    return { valid: false, message: 'Password must contain at least one letter' };
  }
  if (!/[0-9]/.test(pwd)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true, message: '' };
}

type Step = 'email_password' | 'verify_code';

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email_password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [codeError, setCodeError] = useState('');
  /** Whether the mailbox is already in the library: null=not verified or modified and not refocused, true=exists, false=does not exist */
  const [emailExistsInDb, setEmailExistsInDb] = useState<boolean | null>(null);
  const [sendCodeLoading, setSendCodeLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isChrome, setIsChrome] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsChrome(/chrome/.test(userAgent) && !/edg/.test(userAgent));
  }, []);

  const validateEmail = useCallback((value: string) => {
    if (!value.trim()) {
      setEmailError('Email is required');
      return false;
    }
    if (!EMAIL_REGEX.test(value.trim())) {
      setEmailError('Please enter a valid email address');
      return false;
    }
    setEmailError('');
    return true;
  }, []);

  const validatePasswordField = useCallback((value: string) => {
    if (!value) {
      setPasswordError('Password is required');
      return false;
    }
    const result = validatePassword(value);
    if (!result.valid) {
      setPasswordError(result.message);
      return false;
    }
    setPasswordError('');
    return true;
  }, []);

  /** Verify whether the mailbox exists in the system when out of focus (only request the backend if the format is correct) */
  const checkEmailExistsForReset = useCallback(async (emailValue: string) => {
    const trimmed = emailValue.trim().toLowerCase();
    if (!trimmed || !EMAIL_REGEX.test(trimmed)) return;
    try {
      const res = await axiosInstance.get<{ exists?: boolean }>('/api/auth/check-email-for-reset', {
        params: { email: trimmed },
      });
      const exists = res?.data?.exists === true;
      setEmailExistsInDb(exists);
      if (!exists) {
        setEmailError('No account found with this email address');
      } else {
        setEmailError((prev) => (prev === 'No account found with this email address' ? '' : prev));
      }
    } catch {
      setEmailExistsInDb(null);
      // When there is a network or other error, existing errors will not be overwritten, only existence verification will be done.
    }
  }, []);

  const handleGetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailOk = validateEmail(email);
    const passwordOk = validatePasswordField(password);
    if (!emailOk || !passwordOk) return;
    setSendCodeLoading(true);
    setEmailError('');
    setPasswordError('');
    try {
      const res = await axiosInstance.post<{ success?: boolean }>('/api/auth/send-reset-code', {
        email: email.trim().toLowerCase(),
        password,
      });
      // Only enter the next step when the backend returns success. Mailboxes that are not in the library will return 400 and will not enter here.
      if (res?.status === 200 && res?.data?.success !== false) {
        message.success('Verification code sent to your email. Please enter the 6-digit code.');
        setStep('verify_code');
        setVerificationCode('');
        setCodeError('');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to send verification email';
      message.error(msg);
      if (msg.toLowerCase().includes('account') || msg.toLowerCase().includes('email')) setEmailError(msg);
      else if (msg.toLowerCase().includes('password')) setPasswordError(msg);
    } finally {
      setSendCodeLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (verificationCode.length !== 6) {
      setCodeError('Please enter the 6-digit verification code');
      return;
    }
    setCodeError('');
    setSubmitLoading(true);
    try {
      await axiosInstance.post('/api/auth/reset-password', {
        email: email.trim().toLowerCase(),
        password,
        verificationCode,
      });
      message.success('Password reset successfully. You can now log in.');
      navigate('/login');
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Reset password failed';
      message.error(msg);
      if (msg.toLowerCase().includes('code') || msg.toLowerCase().includes('verification')) {
        setCodeError(msg);
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  const EyeIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
  const EyeOffIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );

  return (
    <div className={`min-h-screen flex items-center justify-center bg-white px-4 py-12 select-none ${isChrome ? 'chrome-browser' : ''}`} style={{ userSelect: 'none' }}>
      <style>{`
        .select-none * { user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }
        .select-none input, .select-none textarea { user-select: text !important; -webkit-user-select: text !important; -moz-user-select: text !important; -ms-user-select: text !important; }
        .select-none input#signup-email:-webkit-autofill, .select-none input#signup-email:-webkit-autofill:hover, .select-none input#signup-email:-webkit-autofill:focus, .select-none input#signup-email:-webkit-autofill:active,
        .select-none input#signup-password:-webkit-autofill, .select-none input#signup-password:-webkit-autofill:hover, .select-none input#signup-password:-webkit-autofill:focus, .select-none input#signup-password:-webkit-autofill:active,
        .select-none input:-webkit-autofill, .select-none input:-webkit-autofill:hover, .select-none input:-webkit-autofill:focus, .select-none input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 30px white inset !important; -webkit-text-fill-color: inherit !important; box-shadow: 0 0 0 30px white inset !important; transition: background-color 5000s ease-in-out 0s;
          font-size: 0.875rem !important; zoom: 1 !important; -webkit-text-size-adjust: 100% !important; text-size-adjust: 100% !important;
          -webkit-font-smoothing: antialiased !important; -moz-osx-font-smoothing: grayscale !important; line-height: 1.5 !important;
        }
        .chrome-browser #signup-email, .chrome-browser #signup-password, .chrome-browser input[type="email"], .chrome-browser input[type="password"],
        .chrome-browser #signup-email:hover, .chrome-browser #signup-email:focus, .chrome-browser #signup-email:active, .chrome-browser #signup-email:focus-visible,
        .chrome-browser #signup-password:hover, .chrome-browser #signup-password:focus, .chrome-browser #signup-password:active, .chrome-browser #signup-password:focus-visible {
          font-size: 0.875rem !important; line-height: 1.5 !important; zoom: 1 !important; -webkit-text-size-adjust: 100% !important; text-size-adjust: 100% !important; font-family: inherit !important;
        }
        #signup-email::placeholder, #signup-password::placeholder {
          font-size: 0.875rem !important;
          line-height: 1.5 !important;
        }
        #signup-email::-webkit-input-placeholder, #signup-password::-webkit-input-placeholder {
          font-size: 0.875rem !important;
          line-height: 1.5 !important;
        }
        #signup-email::-moz-placeholder, #signup-password::-moz-placeholder {
          font-size: 0.875rem !important;
          line-height: 1.5 !important;
        }
        #signup-email:-ms-input-placeholder, #signup-password:-ms-input-placeholder {
          font-size: 0.875rem !important;
          line-height: 1.5 !important;
        }
        .chrome-browser #signup-email::placeholder, .chrome-browser #signup-password::placeholder {
          font-size: 0.875rem !important; line-height: 1.5 !important; transform: translateY(-1px) !important;
        }
        .chrome-browser #signup-email::-webkit-input-placeholder, .chrome-browser #signup-password::-webkit-input-placeholder {
          font-size: 0.875rem !important; line-height: 1.5 !important; transform: translateY(-1px) !important;
        }
        .chrome-browser #signup-email::-moz-placeholder, .chrome-browser #signup-password::-moz-placeholder {
          font-size: 0.875rem !important; line-height: 1.5 !important; transform: translateY(-1px) !important;
        }
        .chrome-browser #signup-email:-ms-input-placeholder, .chrome-browser #signup-password:-ms-input-placeholder {
          font-size: 0.875rem !important; line-height: 1.5 !important; transform: translateY(-1px) !important;
        }
      `}</style>
      <div className="w-full max-w-md" style={isChrome ? { zoom: 1.25 } : undefined}>
        <Card className="border-gray-200 shadow-none">
          <CardHeader className="space-y-1 pb-4">
            <div className="flex justify-center mb-4" style={{ minHeight: '48px' }}>
              <img src="/favicon.svg" alt="ADNEXUS Logo" className="h-12 w-auto" />
            </div>
            <CardTitle className="text-2xl font-semibold text-center">
              {step === 'email_password' ? 'Reset Password' : 'Verify Your Email'}
            </CardTitle>
            {step === 'verify_code' && (
              <p className="text-sm text-gray-600 text-center pt-1">{email}</p>
            )}
            <CardDescription className="text-center text-gray-600">
              {step === 'email_password'
                ? 'Enter your email and new password, then we\'ll send a verification code to your email.'
                : 'Enter the code to set your new password.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {step === 'email_password' ? (
              <form onSubmit={handleGetCode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="beta@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailExistsInDb(null);
                      if (emailError) validateEmail(e.target.value);
                    }}
                    onBlur={() => {
                      if (email) {
                        if (!validateEmail(email)) {
                          setEmailExistsInDb(null);
                          return;
                        }
                        checkEmailExistsForReset(email);
                      } else {
                        setEmailExistsInDb(null);
                      }
                    }}
                    className={`h-11 w-full ${emailError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                    autoComplete="email"
                    disabled={sendCodeLoading}
                  />
                  {emailError && <p className="text-sm text-red-500 text-left">{emailError}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">New password</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 8 characters, with letter and number"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (passwordError) validatePasswordField(e.target.value);
                      }}
                      onBlur={() => password && validatePasswordField(password)}
                      className={`h-11 w-full pr-10 ${passwordError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                      autoComplete="new-password"
                      disabled={sendCodeLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 p-0 border-0 bg-transparent cursor-pointer flex items-center justify-center w-5 h-5"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                  </div>
                  {passwordError && <p className="text-sm text-red-500 text-left">{passwordError}</p>}
                </div>
                <div className="flex justify-center">
                  <Button
                    type="submit"
                    className="w-full h-11 bg-black text-white hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={
                      sendCodeLoading ||
                      !!emailError ||
                      !!passwordError ||
                      emailExistsInDb !== true ||
                      !email.trim() ||
                      !password
                    }
                  >
                    {sendCodeLoading ? 'Sending code...' : 'Send verification code'}
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 flex flex-col items-center">
                <div className="space-y-2 w-full flex flex-col items-center">
                  <Label className="text-sm font-medium text-gray-700">Verification code (6 digits)</Label>
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={verificationCode}
                      onChange={(value) => {
                        setVerificationCode(value);
                        if (codeError) setCodeError('');
                      }}
                    >
                      <InputOTPGroup className="gap-1">
                        {[0, 1, 2, 3, 4, 5].map((index) => (
                          <InputOTPSlot key={index} index={index} className="h-11 w-11 rounded-md border border-gray-300 text-base first:rounded-l-md last:rounded-r-md" />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  {codeError && <p className="text-sm text-red-500 text-left">{codeError}</p>}
                </div>
                <div className="w-full flex justify-center">
                  <Button
                    type="submit"
                    className="w-full h-11 bg-black text-white hover:bg-gray-900"
                    disabled={submitLoading || verificationCode.length !== 6}
                  >
                    {submitLoading ? 'Resetting password...' : 'Reset password'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-2 pt-0">
            <p className="text-sm text-center text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-gray-900 underline underline-offset-4 hover:no-underline">
                Log in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
