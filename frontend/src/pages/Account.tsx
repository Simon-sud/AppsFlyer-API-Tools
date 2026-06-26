import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
// Removed unused import: CSSProperties
import { message } from '../components/ui/toast';
import { Modal } from '../components/ui/modal';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { PasswordInput } from '../components/ui/password-input';
// Removed unused icon imports: FiUser, FiTrash2, FiEye, FiLogOut, FiRefreshCw
import { 
  FiPlus, 
} from 'react-icons/fi';
import { RiLockPasswordLine, RiImageAddLine, RiSettings6Line, RiShakeHandsLine, RiEditBoxLine, RiDeleteBin7Line, RiShieldCheckLine, RiFileCopyLine, RiCheckLine, RiCloseLine, RiLoader4Line } from 'react-icons/ri';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../components/ui/breadcrumb';
import { Switch } from '../components/ui/switch';


import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAccount } from '../contexts/AccountContext';
import { useUser } from '../contexts/UserContext';
import { axiosInstance, getAccountToken } from '../services/api';
import './Account.css';

// Add global placeholder style optimization
const placeholderStyles = `
  ::-webkit-input-placeholder {
    font-family: "Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif !important;
    font-weight: 400 !important;
    font-size: 14px !important;
    color: rgb(150, 150, 150) !important;
    opacity: 0.8 !important;
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
    text-rendering: optimizeLegibility !important;
  }
  
  ::-moz-placeholder {
    font-family: "Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif !important;
    font-weight: 400 !important;
    font-size: 14px !important;
    color: rgb(150, 150, 150) !important;
    opacity: 0.8 !important;
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
    text-rendering: optimizeLegibility !important;
  }
  
  :-ms-input-placeholder {
    font-family: "Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif !important;
    font-weight: 400 !important;
    font-size: 14px !important;
    color: rgb(150, 150, 150) !important;
    opacity: 0.8 !important;
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
    text-rendering: optimizeLegibility !important;
  }
  
  ::placeholder {
    font-family: "Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif !important;
    font-weight: 400 !important;
    font-size: 14px !important;
    color: rgb(150, 150, 150) !important;
    opacity: 0.8 !important;
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
    text-rendering: optimizeLegibility !important;
  }
`;

// Dynamically add styles to the page
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = placeholderStyles;
  document.head.appendChild(styleElement);
}

interface AccountConfig {
  id: string;
  account_name: string;
  account_type: 'PID' | 'PRT';
  api_token?: string;
  validate?: any; // Compatible with the validate field returned by the backend
  custom_icon?: string; // Custom icon, store base64 or URL
  account_event_types?: any;
  account_message_fields?: any;
}

type AccountValidateApiPayload = {
  validate?: unknown;
  account_event_types?: unknown;
  account_message_fields?: unknown;
};

function mergeValidateResponseIntoConfigs(
  prev: AccountConfig[],
  configId: string,
  data: AccountValidateApiPayload
): AccountConfig[] {
  return prev.map(c => {
    if (c.id !== configId) return c;
    return {
      ...c,
      ...(data.validate !== undefined ? { validate: data.validate } : {}),
      ...(data.account_event_types !== undefined ? { account_event_types: data.account_event_types } : {}),
      ...(data.account_message_fields !== undefined ? { account_message_fields: data.account_message_fields } : {}),
    };
  });
}

/** Format the JSON object or JSON string returned by the interface into text for display in the bubble */
function insightPayloadToDisplayText(val: unknown): string {
  if (val == null || val === '') return '';
  if (typeof val === 'string') {
    try {
      return JSON.stringify(JSON.parse(val), null, 2);
    } catch {
      return val;
    }
  }
  return JSON.stringify(val, null, 2);
}

type AccountInsightKind = 'details' | 'event_types' | 'message_fields';

const writeClipboardSilently = async (text: string): Promise<boolean> => {
  try {
    if (!text || !text.trim()) return false;
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
};

// Removed unused interface: UserProfile
// interface UserProfile {
//   username: string;
//   email: string;
//   role: string;
//   lastLogin: string;
//   avatar?: string;
//   twoFactorEnabled?: boolean;
// }

// OTP Input Component (copied from login page)
const OTPInputComponent: React.FC<{
  length: number;
  value: string;
  onChange: (value: string) => void;
}> = React.memo(({ length, value, onChange }) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [localValue, setLocalValue] = useState(value || '');
  
  const handleChange = useCallback((index: number, inputValue: string) => {
    if (!/^\d*$/.test(inputValue)) return;
    
    const currentValue = localValue || '';
    const newValue = currentValue.split('');
    newValue[index] = inputValue;
    const finalValue = newValue.join('');
    
    setLocalValue(finalValue);
    
    setTimeout(() => {
      onChange(finalValue);
    }, 100);
    
    if (inputValue && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }, [localValue, length, onChange]);
  
  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const currentValue = localValue || '';
    if (e.key === 'Backspace' && !currentValue[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }, [localValue]);
  
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text');
    const numbers = pastedData.replace(/\D/g, '').slice(0, length);
    
    if (numbers.length === length) {
      setLocalValue(numbers);
      setTimeout(() => {
        onChange(numbers);
      }, 100);
      inputRefs.current[length - 1]?.focus();
    }
  }, [length, onChange]);
  
  useEffect(() => {
    if (value !== localValue) {
      setLocalValue(value || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]); // localValue is a state variable and does not need to be a dependency
  
  return (
    <div className="flex justify-center gap-3 mb-4">
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={localValue[index] || ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className="w-12 h-12 text-center text-lg font-semibold border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
        />
      ))}
    </div>
  );
});
OTPInputComponent.displayName = 'OTPInputComponent';

const Account: React.FC = () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { currentUser: _currentUser } = useAuth();
  const { userProfile, loading: userLoading, refreshUserProfile, updateUserProfile } = useUser();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accountConfigs, loading: _accountLoading, refreshAccountConfigs } = useAccount();
  const [localAccountConfigs, setLocalAccountConfigs] = useState<AccountConfig[]>(accountConfigs);
  // Store the obtained token (obtained on demand, not exposed in the list API)
  const [accountTokens, setAccountTokens] = useState<Record<string, string>>({});
  
  // Synchronize global configuration to local state
  useEffect(() => { 
    setLocalAccountConfigs(accountConfigs); 
  }, [accountConfigs]);
  
  // Obtain account token on demand
  // Security tip: The token is stored in memory and the complete content will not be exposed in the log.
  const fetchAccountToken = useCallback(async (configId: string) => {
    if (accountTokens[configId]) {
      return accountTokens[configId];
    }
    try {
      const token = await getAccountToken(configId);
      // Store the token immediately to avoid exposure in error handling
      setAccountTokens(prev => ({ ...prev, [configId]: token }));
      return token;
    } catch (error) {
      // Error logs do not contain sensitive information
      console.error(`Failed to fetch account token for config ${configId}:`, error instanceof Error ? error.message : 'Unknown error');
      return '';
    }
  }, [accountTokens]);
  
  // Refresh configuration data when the page is initialized
  useEffect(() => {
    // When the page loads, if the configuration is empty, the data will be refreshed actively.
    if (!accountConfigs || accountConfigs.length === 0) {
      refreshAccountConfigs(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array, only executed once when the component is mounted (accountConfigs and refreshAccountConfigs do not need to be dependencies)

  // Refresh user information when the page is initialized
  useEffect(() => {
    // When the page loads, actively refresh user information to obtain the latest lastLogin
    // Add delay to avoid conflicts with configuration refresh
    const timer = setTimeout(() => {
      // Refresh only if user information is not loaded
      if (!userProfile && !userLoading) {
        refreshUserProfile();
      }
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile, userLoading]); // refreshUserProfile is defined inside the component and does not need to be a dependency
  // Separate pop-up window status management
  // Note: We are using a custom input box and no longer need an Ant Design form instance
  const [isAddModalVisible, setIsAddModalVisible] = useState(false); // Added configuration pop-up window
  const [isEditModalVisible, setIsEditModalVisible] = useState(false); // Edit configuration pop-up window
  const [editingConfig, setEditingConfig] = useState<AccountConfig | null>(null);
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [securitySettingsTab, setSecuritySettingsTab] = useState<'password' | '2fa'>('password');
  
  // 2FA related status
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [setupStep, setSetupStep] = useState<'switch' | 'qr' | 'verify'>('switch');
  
  // Sync userProfile’s 2FA status
  useEffect(() => {
    if (userProfile) {
      setTwoFactorEnabled(userProfile.twoFactorEnabled || false);
      if (userProfile.twoFactorEnabled) {
        setSetupStep('switch');
      }
    }
  }, [userProfile]);
  // Remove Form.useForm() and use native state management
  // const [profileForm] = Form.useForm();
  // const [passwordForm] = Form.useForm();
  
  // Password form status
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});
  // Handle editing operations
  const handleActionEdit = (config: AccountConfig) => {
    setEditingConfig(config);
    
            // In edit mode, API Token is invisible by default, and users need to manually click the eye icon to view it.
        setApiTokenVisible(false);
        

        setIsEditModalVisible(true);
  };
  
  // Handle delete operations
  const handleActionDelete = (config: AccountConfig) => {
    setDeletingConfig(config);
    setIsDeleteModalVisible(true);
    // Get token on demand for display
    if (!accountTokens[config.id]) {
      fetchAccountToken(config.id);
    }
  };
  
  // Handle verification operations (actual request verification interface)
  const handleActionVerify = async (config: AccountConfig) => {
    setCurrentValidatingRecord(config);
    setVerifyResultBubbleConfigId(null);
    
    // Call the real validation logic
    try {
      setValidateLoading(prev => ({ ...prev, [config.id]: true }));
      // Do not clear the status immediately, keep the current status until the verification is completed
      
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const response = await axiosInstance.post(`/api/account-configs/${config.id}/validate`);
      const data = response.data as AccountValidateApiPayload;
      
      let status: string | null = null;
      // Determine validate field structure
      if (data.validate && Array.isArray((data.validate as { users?: unknown }).users) && (data.validate as { users: unknown[] }).users.length > 0) {
        status = 'Active';
      } else {
        status = 'Failed';
      }
      
      const text = typeof data.validate === 'string' ? data.validate : JSON.stringify(data.validate, null, 2);
      
      updateValidateStatus(prev => ({
        ...prev,
 [config.id]: {
          status,
          text
        }
      }));

      setLocalAccountConfigs(prev => mergeValidateResponseIntoConfigs(prev, config.id, data));
      void refreshAccountConfigs(true);
      
      setVerifyResultBubbleConfigId(config.id);
    } catch (error) {
      updateValidateStatus(prev => ({
        ...prev,
        [config.id]: {
          status: 'Failed',
          text: String(error)
        }
      }));
      
      setVerifyResultBubbleConfigId(config.id);
    } finally {
      setValidateLoading(prev => ({ ...prev, [config.id]: false }));
    }
  };

  /** When there is a successful verification record (Active + non-empty storage text), clicking Verify only pops up a bubble and does not request the interface. */
  const hasStoredActiveVerify = (configId: string) => {
    const row = validateStatus[configId];
    return row?.status === 'Active' && Boolean(row?.text?.trim());
  };

  const handleVerifyClick = (config: AccountConfig) => {
    if (hasStoredActiveVerify(config.id)) {
      setCurrentValidatingRecord(config);
      setVerifyResultBubbleConfigId(config.id);
      return;
    }
    void handleActionVerify(config);
  };

  // Monitor editingConfig changes and automatically fill in the editing form
  useEffect(() => {
    if (editingConfig && isEditModalVisible) {
      // In edit mode, set state variables
      setEditFormAccountName(editingConfig.account_name || '');
      // Get token on demand
      fetchAccountToken(editingConfig.id).then(token => {
        setEditFormApiToken(token ? decryptToken(token) : '');
      });
      setSelectedAccountType(editingConfig.account_type || '');
      // Set custom icon
      setUploadedImage(editingConfig.custom_icon || null);
      setImageFile(null);
      setImageUploadError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingConfig, isEditModalVisible, fetchAccountToken]); // decryptToken is defined inside the component and does not need to be used as a dependency


  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [avatarSubmitLoading, setAvatarSubmitLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [deletingConfig, setDeletingConfig] = useState<AccountConfig | null>(null);
  const navigate = useNavigate();
  const [passwordLoading, setPasswordLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_passwordError, setPasswordError] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_eyeStates, _setEyeStates] = useState<Record<string, boolean>>({});
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [validateLoading, setValidateLoading] = useState<Record<string, boolean>>({});
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_hoveredValidateId, setHoveredValidateId] = useState<string | null>(null);
  const [validateModal, setValidateModal] = useState<{ visible: boolean, content: string, status: string | null }>({ visible: false, content: '', status: null });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_currentValidatingRecord, setCurrentValidatingRecord] = useState<AccountConfig | null>(null);
  const [copiedBlockKey, setCopiedBlockKey] = useState<string | null>(null);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyWithInlineFeedback = async (text: string, key: string) => {
    const ok = await writeClipboardSilently(text);
    if (!ok) return;
    setCopiedBlockKey(key);
    if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current);
    copyFeedbackTimerRef.current = setTimeout(() => setCopiedBlockKey(null), 1200);
  };
  
  // Account Type selector state


  
      // API Token visibility status
    const [apiTokenVisible, setApiTokenVisible] = useState(false);
    
    // Password visibility status
    const [currentPasswordVisible, setCurrentPasswordVisible] = useState(false);
    const [newPasswordVisible, setNewPasswordVisible] = useState(false);
    const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
    
    // Current password verification status
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_currentPasswordValid, setCurrentPasswordValid] = useState<boolean | null>(null);
  
  // Account Type menu status (drop-down is hung to the body through Portal to avoid being clipped by .custom-user-info-table overflow)
  const [showAccountTypeMenu, setShowAccountTypeMenu] = useState(false);
  const addConfigButtonRef = useRef<HTMLButtonElement>(null);
  const [accountTypeMenuPlacement, setAccountTypeMenuPlacement] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  /** Add show on the next frame after Portal is mounted to avoid the transition being skipped by the first frame */
  const [accountTypeMenuShowClass, setAccountTypeMenuShowClass] = useState(false);
  const [selectedAccountType, setSelectedAccountType] = useState('');
  
  // form input value status
  const [formAccountName, setFormAccountName] = useState('');
  const [formApiToken, setFormApiToken] = useState('');
  
  // form error status
  const [formAccountNameError, setFormAccountNameError] = useState<string | null>(null);
  const [formApiTokenError, setFormApiTokenError] = useState<string | null>(null);
  
  // Edit mode form input value state
  const [editFormAccountName, setEditFormAccountName] = useState('');
  const [editFormApiToken, setEditFormApiToken] = useState('');
  
  // Image upload related status
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string>('');
  
  // Monitor the opening of new pop-up windows to ensure that the form status is correct
  useEffect(() => {
    if (isAddModalVisible && !editingConfig) {
      // New configuration mode: ensure the form has an initial value
      
      // In new mode, reset state variables
      setFormAccountName('');
      setFormApiToken('');
    }
  }, [isAddModalVisible, editingConfig, selectedAccountType]);

  // Listen for the edit pop-up window to open and set the initial value of the edit mode.
  useEffect(() => {
    if (isEditModalVisible && editingConfig) {
      // Edit configuration mode: Set form initial values
      console.log('编辑配置模式，设置表单初始值');
      
      // In edit mode, set the status variable to the currently configured value
      setEditFormAccountName(editingConfig.account_name || '');
      setEditFormApiToken(editingConfig.api_token ? decryptToken(editingConfig.api_token) : '');
      setSelectedAccountType(editingConfig.account_type || '');
      
      // Debugging: Check if state variables are set correctly
      setTimeout(() => {
        console.log('编辑配置模式 - 状态变量设置后的值:', {
          account_name: editFormAccountName,
          api_token: editFormApiToken,
          account_type: selectedAccountType
        });
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditModalVisible, editingConfig]); // decryptToken, editFormAccountName, editFormApiToken, selectedAccountType are defined inside the component and do not need to be used as dependencies
  
  // Function to reset the state of the newly added configuration pop-up window
  const resetAddModalState = () => {
    setFormAccountName('');
    setFormApiToken('');
    setSelectedAccountType('');
    setApiTokenVisible(false);
    setFormAccountNameError(null);
    setFormApiTokenError(null);
  };
  
  // Verify Account Name (checkDuplicate is used to control whether to check for duplicates)
  const validateAccountName = (value: string, checkDuplicate: boolean = true): string | null => {
    const trimmed = value.trim();
    
    if (!trimmed) {
      return 'Account name is required';
    }
    
    // At least 10 characters (lowercase letters or numbers)
    if (trimmed.length < 10) {
      return 'Account name must be at least 10 characters';
    }
    
    // Can only contain lowercase letters, numbers, or underscores
    if (!/^[a-z0-9_]+$/.test(trimmed)) {
      return 'Account name must contain only lowercase letters, numbers, and underscores';
    }
    
    // Cannot be a pure number
    if (/^\d+$/.test(trimmed)) {
      return 'Account name cannot be numbers only';
    }
    
    // Check for duplicates only when needed (out of focus or on commit)
    if (checkDuplicate) {
      const isDuplicate = localAccountConfigs.some(
        config => config.account_name.toLowerCase() === trimmed.toLowerCase()
      );
      if (isDuplicate) {
        return 'Account name already exists';
      }
    }
    
    return null;
  };
  
  // Verify API Token
  const validateApiToken = (value: string): string | null => {
    const trimmed = value.trim();
    
    if (!trimmed) {
      return 'API token is required';
    }
    
    // Start with lowercase eyjhb
    if (!trimmed.toLowerCase().startsWith('eyjhb')) {
      return 'API token must start with eyjhb';
    }
    
    // The length must be greater than 500
    if (trimmed.length <= 500) {
      return 'API token must be longer than 500 characters';
    }
    
    return null;
  };

  // Function to reset the status of the edit configuration pop-up window
  const resetEditModalState = () => {
    setEditFormAccountName('');
    setEditFormApiToken('');
    setApiTokenVisible(false);
    setUploadedImage(null);
    setImageFile(null);
    setImageUploadError('');
  };

  // Image processing function
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Verify file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setImageUploadError('Please upload a valid image format (JPEG, PNG, or SVG)');
      return;
    }

    // Verify file size (max 2MB)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      setImageUploadError('Image size must be less than 2MB');
      return;
    }

    setImageUploadError('');
    setImageFile(file);

    // Compress image and convert to base64
    compressImage(file, (compressedDataUrl) => {
      setUploadedImage(compressedDataUrl);
    });
  };

  // Image compression function
  const compressImage = (file: File, callback: (dataUrl: string) => void) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      // Set target size (max 200x200px)
      const maxSize = 200;
      let { width, height } = img;

      // Calculate scaling
      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }

      // Set canvas size
      canvas.width = width;
      canvas.height = height;

      // Draw compressed images
      ctx?.drawImage(img, 0, 0, width, height);

      // Convert to base64, using lower quality to reduce file size
      const quality = file.type === 'image/png' ? 0.8 : 0.7; // PNG uses slightly higher quality
      const dataUrl = canvas.toDataURL(file.type, quality);
      callback(dataUrl);
    };

    img.src = URL.createObjectURL(file);
  };

  // Remove image
  const handleRemoveImage = () => {
    setUploadedImage(null);
    setImageFile(null);
    setImageUploadError('');
  };

  // local cache key
  const VALIDATE_STATUS_CACHE_KEY = 'account_validate_status';

  // Initialize validateStatus, preferentially use localStorage
  const [validateStatus, setValidateStatus] = useState<Record<string, { status: string | null, text: string }>>(() => {
    const cache = localStorage.getItem(VALIDATE_STATUS_CACHE_KEY);
    return cache ? JSON.parse(cache) : {};
  });

  // When the page is first loaded/refreshed, the local cache is overwritten with the database accountConfigs content.
  useEffect(() => {
    if (!accountConfigs || accountConfigs.length === 0) return;
    setValidateStatus(prev => {
      const next = { ...prev };
      let changed = false;
      accountConfigs.forEach(cfg => {
        if (cfg.validate && !next[cfg.id]) {
          let status: string | null = null;
          let text = typeof cfg.validate === 'string' ? cfg.validate : JSON.stringify(cfg.validate, null, 2);
          let validateObj = cfg.validate;
          if (typeof validateObj === 'string') {
            try { validateObj = JSON.parse(validateObj); } catch {}
          }
          if (validateObj && Array.isArray(validateObj.users) && validateObj.users.length > 0) {
            status = 'Active';
          } else {
            status = 'Failed';
          }
          next[cfg.id] = { status, text };
          changed = true;
        }
      });
      if (changed) {
        localStorage.setItem(VALIDATE_STATUS_CACHE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, [accountConfigs]);

  // Update validateStatus and sync localStorage
  const updateValidateStatus = (updater: (prev: typeof validateStatus) => typeof validateStatus) => {
    setValidateStatus(prev => {
      const next = updater(prev);
      localStorage.setItem(VALIDATE_STATUS_CACHE_KEY, JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    // After the verification is completed, clear the hover to avoid the UI from becoming larger.
    setHoveredValidateId(null);
  }, [validateStatus]);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current);
    };
  }, []);

  // Handling click outside to close Account Type menu
  useEffect(() => {
    const handleClickOutsideMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-add-config-button]') && !target.closest('.account-type-menu')) {
        setShowAccountTypeMenu(false);
      }
    };

    if (showAccountTypeMenu) {
      document.addEventListener('mousedown', handleClickOutsideMenu);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideMenu);
    };
  }, [showAccountTypeMenu]);

  useLayoutEffect(() => {
    if (!showAccountTypeMenu) {
      setAccountTypeMenuPlacement(null);
      setAccountTypeMenuShowClass(false);
      return;
    }
    const updatePlacement = () => {
      const el = addConfigButtonRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setAccountTypeMenuPlacement({
        top: r.bottom + 6,
        left: r.left,
        width: r.width,
      });
    };
    updatePlacement();
    window.addEventListener('scroll', updatePlacement, true);
    window.addEventListener('resize', updatePlacement);
    return () => {
      window.removeEventListener('scroll', updatePlacement, true);
      window.removeEventListener('resize', updatePlacement);
    };
  }, [showAccountTypeMenu]);

  useEffect(() => {
    if (!showAccountTypeMenu || !accountTypeMenuPlacement) {
      return;
    }
    let alive = true;
    const id = requestAnimationFrame(() => {
      if (alive) setAccountTypeMenuShowClass(true);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, [showAccountTypeMenu, accountTypeMenuPlacement]);

  // Use state variables to track username changes and avoid calling form methods during rendering
  const [profileUsername, setProfileUsername] = useState('');
  const [profileUsernameError, setProfileUsernameError] = useState<string | null>(null);
  const [isUsernameEditing, setIsUsernameEditing] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [usernameDraftError, setUsernameDraftError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _isProfileUnchanged = !!userProfile && profileUsername === String(userProfile.username).trim();

  const validateInlineUsername = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return 'Username cannot be empty';
    // Only text allowed (English letters and spaces)
    if (!/^[A-Za-z\s]+$/.test(trimmed)) {
      return 'Username can only contain letters';
    }
    return null;
  };

  const startInlineUsernameEdit = () => {
    const current = String(userProfile?.username || '').trim();
    setUsernameDraft(current);
    setUsernameDraftError(null);
    setIsUsernameEditing(true);
  };

  const cancelInlineUsernameEdit = () => {
    setIsUsernameEditing(false);
    setUsernameDraft('');
    setUsernameDraftError(null);
  };

  const submitInlineUsernameEdit = async () => {
    const currentUsername = String(userProfile?.username || '').trim();
    const nextUsername = usernameDraft.trim();
    const err = validateInlineUsername(nextUsername);
    if (err) {
      setUsernameDraftError(err);
      return;
    }
    if (nextUsername === currentUsername) {
      return;
    }
    setProfileLoading(true);
    try {
      const response = await axiosInstance.post('/api/auth/update-profile', {
        username: nextUsername
      });
      if (response.status === 200) {
        updateUserProfile({ username: nextUsername });
        message.success('Profile updated successfully');
        cancelInlineUsernameEdit();
      } else {
        const data = response.data as { message?: string };
        message.error(data.message || 'Failed to update username');
      }
    } catch (error: any) {
      const backendMsg = error?.response?.data?.message;
      if (backendMsg) {
        message.error(String(backendMsg));
      } else {
        message.error('Failed to update username');
      }
    } finally {
      setProfileLoading(false);
    }
  };

  // Handle adding/editing configuration
  const handleAddEdit = async (values: any) => {
    // Validate form fields (only in new mode)
    if (!editingConfig) {
      const accountNameError = validateAccountName(values.account_name || '');
      const apiTokenError = validateApiToken(values.api_token || '');
      
      setFormAccountNameError(accountNameError);
      setFormApiTokenError(apiTokenError);
      
      // If there are validation errors, do not submit
      if (accountNameError || apiTokenError) {
        return;
      }
    }
    
    // Verify Account Type
    if (!values.account_type) {
      message.error('Account type is required');
      return;
    }
    
    setConfigLoading(true);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token) {
        navigate('/login');
        setConfigLoading(false);
        return;
      }
      if (editingConfig) {
        const configId = editingConfig.id;
        const newTokenEnc = encryptToken(values.api_token);
        // Edit: The backend PUT has implemented the same three interfaces as Verify and written the library. Only the response is consumed here.
        setValidateLoading(prev => ({ ...prev, [configId]: true }));
        let putData: AccountValidateApiPayload = {};
        try {
          const response = await axiosInstance.put(`/api/auth/account-configs/${configId}`, {
            account_name: values.account_name,
            account_type: values.account_type,
            api_token: newTokenEnc,
            custom_icon: uploadedImage
          });
          if (response.status !== 200) {
            throw new Error('Failed to update account config');
          }
          putData = response.data as AccountValidateApiPayload;
        } catch (err) {
          updateValidateStatus(prev => ({
            ...prev,
            [configId]: { status: 'Failed', text: String(err) }
          }));
          throw err;
        } finally {
          setValidateLoading(prev => ({ ...prev, [configId]: false }));
        }
        let status: string | null = null;
        if (putData.validate && Array.isArray((putData.validate as { users?: unknown }).users) && (putData.validate as { users: unknown[] }).users.length > 0) {
          status = 'Active';
        } else {
          status = 'Failed';
        }
        const vText = putData.validate === undefined || putData.validate === null
          ? ''
          : typeof putData.validate === 'string'
            ? putData.validate
            : JSON.stringify(putData.validate, null, 2);
        updateValidateStatus(prev => ({ ...prev, [configId]: { status, text: vText } }));
        setLocalAccountConfigs(prev =>
          mergeValidateResponseIntoConfigs(
            prev.map(cfg =>
              cfg.id === configId
                ? { ...cfg, account_name: values.account_name, account_type: values.account_type, api_token: newTokenEnc, custom_icon: uploadedImage || undefined }
                : cfg
            ),
            configId,
            putData
          )
        );
        message.success('Configuration updated successfully');
        await refreshAccountConfigs(true);
        setIsEditModalVisible(false);
        setEditingConfig(null);
        resetEditModalState();
      } else {
        // Add new configuration
        const response = await axiosInstance.post('/api/auth/account-configs', {
          account_name: values.account_name,
          account_type: values.account_type,
          api_token: encryptToken(values.api_token)
        });
        if (response.status !== 200 && response.status !== 201) {
          throw new Error('Failed to add account config');
        }
        // When the backend was created, the same three interfaces as Verify have been executed and the library has been written. The response contains id + validate + extended fields.
        const responseData = response.data as AccountValidateApiPayload & {
          id: string;
          account_name: string;
          account_type: string;
          custom_icon?: string | null;
          message?: string;
        };

        const newConfig: AccountConfig = {
          id: responseData.id,
          account_name: responseData.account_name,
          account_type: responseData.account_type as 'PID' | 'PRT',
          custom_icon: responseData.custom_icon || undefined,
          validate: responseData.validate,
          account_event_types: responseData.account_event_types,
          account_message_fields: responseData.account_message_fields,
        };

        message.success('Configuration added successfully');

        setLocalAccountConfigs(prev => [...prev, newConfig]);

        const newId = newConfig.id;
        let status: string | null = null;
        if (responseData.validate && Array.isArray((responseData.validate as { users?: unknown }).users) && (responseData.validate as { users: unknown[] }).users.length > 0) {
          status = 'Active';
        } else {
          status = 'Failed';
        }
        const text =
          responseData.validate === undefined || responseData.validate === null
            ? ''
            : typeof responseData.validate === 'string'
              ? responseData.validate
              : JSON.stringify(responseData.validate, null, 2);
        updateValidateStatus(prev => ({ ...prev, [newId]: { status, text } }));

        await refreshAccountConfigs(true);
        setIsAddModalVisible(false);
        resetAddModalState();
      }
    } catch (error) {
      console.error('Error saving account config:', error);
      message.error(error instanceof Error ? error.message : '保存配置失败');
    }
    setConfigLoading(false);
  };

  // Handling edit data - using native state management
  const handleEditProfile = async () => {
    const usernameValue = profileUsername.trim();
    
    // Verify before submitting
    if (!usernameValue) {
      setProfileUsernameError('Username cannot be empty');
      return;
    }
    
    // Check if the username is the same as the current username
    const currentUsername = userProfile?.username ? String(userProfile.username).trim() : '';
    
    if (currentUsername && usernameValue === currentUsername) {
      setProfileUsernameError('New username cannot be the same as the current username');
      return;
    }
    
    setProfileLoading(true);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token) {
        message.error('请先登录');
        setProfileLoading(false);
        return;
      }
      
      const response = await axiosInstance.post('/api/auth/update-profile', {
        username: usernameValue
      });
      if (response.status === 200) {
        updateUserProfile({ username: usernameValue });
        message.success('Profile updated successfully');
        setIsProfileModalVisible(false);
        setProfileUsername('');
        setProfileUsernameError(null);
      } else {
        const data = response.data as { message?: string };
        message.error(data.message || '更新资料失败');
      }
    } catch (error) {
      console.error('提交失败:', error); // debugging information
      message.error('更新资料失败');
    }
    setProfileLoading(false);
  };

  // Handling password changes - using native state management
  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordErrors({});
    
    const currentPasswordValue = currentPassword.trim();
    const newPasswordValue = newPassword.trim();
    const confirmPasswordValue = confirmPassword.trim();
    
    // Verify all fields are filled in
    if (!currentPasswordValue) {
      setPasswordErrors({ currentPassword: 'Current password cannot be empty' });
      return;
    }
    
    if (!newPasswordValue) {
      setPasswordErrors({ newPassword: 'New password cannot be empty' });
      return;
    }
    
    if (!confirmPasswordValue) {
      setPasswordErrors({ confirmPassword: 'Confirm password cannot be empty' });
      return;
    }
    
    // Verify all password lengths (at least 6 characters)
    if (currentPasswordValue.length < 6) {
      setPasswordErrors({ currentPassword: 'Password must be at least 6 characters' });
      return;
    }
    
    if (newPasswordValue.length < 6) {
      setPasswordErrors({ newPassword: 'Password must be at least 6 characters' });
      return;
    }
    
    if (confirmPasswordValue.length < 6) {
      setPasswordErrors({ confirmPassword: 'Password must be at least 6 characters' });
      return;
    }
    
    // Verify that the new password and the confirmed password are consistent
    if (newPasswordValue !== confirmPasswordValue) {
      setPasswordErrors({
        newPassword: 'New password and confirm password do not match',
        confirmPassword: 'New password and confirm password do not match'
      });
      return;
    }
    
    // Verify that the new password cannot be the same as the current password
    if (currentPasswordValue === newPasswordValue) {
      setPasswordErrors({ newPassword: 'New password cannot be the same as the current password' });
      return;
    }
    
    setPasswordLoading(true);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token) {
        message.error('请先登录');
        setPasswordLoading(false);
        return;
      }
      
      // First verify whether the current password is correct
      try {
        const verifyResponse = await axiosInstance.post('/api/auth/verify-current-password', {
          currentPassword: currentPasswordValue
        });
        
        if (verifyResponse.status !== 200) {
          // Current password verification failed
          setCurrentPasswordValid(false);
          setPasswordErrors({ currentPassword: 'Current password is incorrect' });
          message.error('Current password is incorrect');
          setPasswordLoading(false);
          return;
        }
        
        // Current password verification successful
        setCurrentPasswordValid(true);
      } catch (verifyError) {
        // Current password verification failed
        setCurrentPasswordValid(false);
        setPasswordErrors({ currentPassword: 'Current password is incorrect' });
        message.error('Current password is incorrect');
        setPasswordLoading(false);
        return;
      }
      
      // After the current password is successfully verified, continue to change the password.
      const response = await axiosInstance.post('/api/auth/change-password', {
        currentPassword: currentPasswordValue,
        newPassword: newPasswordValue
      });
      
      const data = response.data as { message?: string };
      if (response.status !== 200) {
        // Special handling for old and new passwords being the same
        if (data.message && data.message.includes('New password cannot be the same as the old password')) {
          setPasswordErrors({ newPassword: 'New password cannot be the same as the current password' });
        } else {
          message.error(data.message || 'Failed to change password');
      }
        setPasswordLoading(false);
        return;
      }
      
      message.success('Password changed successfully');
      setIsPasswordModalVisible(false);
      // Reset all password fields
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordErrors({});
      // Reset the visibility state of all password fields
      setCurrentPasswordVisible(false);
      setNewPasswordVisible(false);
      setConfirmPasswordVisible(false);
      // Reset current password verification status
      setCurrentPasswordValid(null);
    } catch (error) {
      // Handle network errors or server errors
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          setPasswordErrors({ currentPassword: 'Current password is incorrect' });
          message.error('Current password is incorrect');
        } else {
          message.error(error.message || 'Failed to change password');
        }
      } else {
        message.error('Failed to change password');
      }
    }
    setPasswordLoading(false);
  };

  // Handling delete configuration
  const handleDelete = async () => {
    if (!deletingConfig) return;
    setDeletingIds(ids => [...ids, deletingConfig.id]);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token) {
        navigate('/login');
        setDeletingIds(ids => ids.filter(id => id !== deletingConfig.id));
        return;
      }
      const response = await axiosInstance.delete(`/api/auth/account-configs/${deletingConfig.id}`);
      const data = response.data as { message?: string };
      if (response.status !== 200) {
        throw new Error(data.message || '删除配置失败');
      }
      setLocalAccountConfigs(prev => prev.filter(cfg => cfg.id !== deletingConfig.id));
      message.success('Configuration deleted successfully');
      // Force refresh global configuration and synchronize local configuration after deletion
      await refreshAccountConfigs(true);
      setLocalAccountConfigs(accountConfigs => [...accountConfigs]);
      setIsDeleteModalVisible(false);
      setDeletingConfig(null);
    } catch (error) {
      console.error('删除配置失败:', error);
      message.error(error instanceof Error ? error.message : '删除配置失败');
    } finally {
      setDeletingIds(ids => ids.filter(id => id !== (deletingConfig && deletingConfig.id)));
    }
  };


  

  
  // Handling menu item clicks
  const handleMenuItemClick = (accountType: string) => {
    setSelectedAccountType(accountType);
    setShowAccountTypeMenu(false);
    setEditingConfig(null);
    
    // When adding new configurations, make sure the form status is completely clean
    setApiTokenVisible(false);
    
    // Set the initial value to ensure that the input box can be edited normally
    setFormAccountName('');
    setFormApiToken('');
    setSelectedAccountType(accountType);
    
    console.log('新增配置 - 菜单项点击后表单状态:', {
      account_type: accountType,
      account_name: '',
      api_token: ''
    });
    setIsAddModalVisible(true);
  };

  // Simple encryption function
  const encryptToken = (token: string): string => {
    try {
      return btoa(encodeURIComponent(token));
    } catch (error) {
      console.error('加密失败:', error);
      return token;
    }
  };

  // Added base64 check function
  function isBase64(str: string) {
    if (!str || typeof str !== 'string') return false;
    // base64 string length must be a multiple of 4
    if (str.length % 4 !== 0) return false;
    // Only base64 characters allowed
    if (!/^[A-Za-z0-9+/=]+$/.test(str)) return false;
    try {
      return btoa(atob(str)) === str;
    } catch (err) {
      return false;
    }
  }

  // Simple decryption function
  const decryptToken = (encryptedToken: string): string => {
    try {
      if (!isBase64(encryptedToken)) {
        // Return plain text directly without outputting any warnings
        return encryptedToken;
      }
      return decodeURIComponent(atob(encryptedToken));
    } catch (error) {
      console.error('解密失败:', error);
      return encryptedToken;
    }
  };

  // Modify displayPartialToken function
  const displayPartialToken = (token: string | undefined): string => {
    if (!token) return '';
    try {
      const decrypted = decryptToken(token);
      // Limit display length to 20 characters
      const maxLength = 20;
      if (decrypted.length <= maxLength) {
        return decrypted;
      }
      // Replace the middle part with an asterisk, keeping the total length at 20
      const prefix = decrypted.slice(0, 4);
      const suffix = decrypted.slice(-4);
      const maskedPart = '*'.repeat(maxLength - 8); // 8 = 4(prefix) + 4(suffix)
      return `${prefix}${maskedPart}${suffix}`;
    } catch (error) {
      console.error('显示token失败:', error);
      return token;
    }
  };



  // Handle image selection
  const handleImageSelect = (file: File) => {
    // Verify file type and size
    const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png';
    if (!isJpgOrPng) {
      message.error('You can only upload JPG/PNG files');
      return false;
    }
    const isLt2M = file.size / 1024 / 1024 < 2;
    if (!isLt2M) {
      message.error('Image must be smaller than 2MB');
      return false;
    }

    try {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setSelectedImage(result);
        setAvatarSubmitLoading(false);
        setCropModalVisible(true);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      message.error('图片读取失败');
    }
    return false;
  };

  // Handle image loading
  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const crop = centerCrop(
      makeAspectCrop(
        {
          unit: '%',
          width: 90,
        },
        1,
        width,
        height
      ),
      width,
      height
    );
    setCrop(crop);
  };

  // Processing and cropping completed
  const handleCropComplete = async () => {
    if (!imgRef.current || !completedCrop || avatarSubmitLoading) return;
    setAvatarSubmitLoading(true);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token) {
        message.error('请先登录');
        return;
      }
      const canvas = document.createElement('canvas');
      const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
      const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        message.error('无法创建画布上下文');
        return;
      }
      canvas.width = completedCrop.width;
      canvas.height = completedCrop.height;
      ctx.drawImage(
        imgRef.current,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0,
        0,
        completedCrop.width,
        completedCrop.height
      );
      // Compressed picture quality
      const croppedImage = canvas.toDataURL('image/jpeg', 0.8);
      const response = await axiosInstance.post('/api/auth/update-avatar', {
        avatar: croppedImage
      });
      const data = response.data as { message?: string };
      if (response.status === 200) {
        await refreshUserProfile();
        setCropModalVisible(false);
        setSelectedImage(null);
        message.success('Avatar uploaded successfully');
      } else {
        message.error(data.message || 'Failed to upload avatar');
      }
    } catch (error) {
      message.error('Failed to upload avatar');
    } finally {
      setAvatarSubmitLoading(false);
    }
  };



  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleValidate = async (record: AccountConfig) => {
    setCurrentValidatingRecord(record);
    const current = validateStatus[record.id];
    // If there are already results, pop up the window directly
    if (current && current.status === 'Active') {
      setValidateModal({ visible: true, content: current.text, status: current.status });
      return;
    }
    setValidateLoading(prev => ({ ...prev, [record.id]: true }));
    updateValidateStatus(prev => ({ ...prev, [record.id]: { status: null, text: '' } }));
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const response = await axiosInstance.post(`/api/account-configs/${record.id}/validate`);
      const data = response.data as AccountValidateApiPayload;
      let status: string | null = null;
      // Determine validate field structure
      if (data.validate && Array.isArray((data.validate as { users?: unknown }).users) && (data.validate as { users: unknown[] }).users.length > 0) {
        status = 'Active';
      } else {
        status = 'Failed';
      }
      const text = typeof data.validate === 'string' ? data.validate : JSON.stringify(data.validate, null, 2);
      updateValidateStatus(prev => ({
        ...prev,
        [record.id]: {
          status,
          text
        }
      }));
      setLocalAccountConfigs(prev => mergeValidateResponseIntoConfigs(prev, record.id, data));
      setCurrentValidatingRecord(record);
      setValidateModal({
        visible: true,
        content: text,
        status
      });
    } catch (error) {
      updateValidateStatus(prev => ({
        ...prev,
        [record.id]: {
          status: 'Failed',
          text: String(error)
        }
      }));
      setCurrentValidatingRecord(record);
      setValidateModal({
        visible: true,
        content: String(error),
        status: 'Failed'
      });
    } finally {
      setValidateLoading(prev => ({ ...prev, [record.id]: false }));
    }
  };

  // Fixed getValidateTitle compatible with Active/Failed
  const getValidateTitle = (status: string | null) => {
    if (status === 'Active' || status === 'success') return 'Validation Successful';
    return 'Validation Failed';
  };

  // Get the CSS class name of the status badge (Active/Invalid only, no more Unknown)
  const getStatusBadgeClass = (configId: string) => {
    if (validateLoading[configId]) {
      return 'status-badge-loading';
    }
    const status = validateStatus[configId]?.status;
    if (status === 'Active') return 'status-badge-active';
    return 'status-badge-invalid'; // Failed or not verified are displayed as Invalid
  };

  // Get the display text of the status badge (Active/Invalid only)
  const getStatusBadgeText = (configId: string) => {
    if (validateLoading[configId]) {
      return 'Verifying...';
    }
    const status = validateStatus[configId]?.status;
    if (status === 'Active') return 'Active';
    return 'Invalid';
  };

  // The result bubble that pops up after Verify is clicked (only informs, no secondary interaction)
  const [verifyResultBubbleConfigId, setVerifyResultBubbleConfigId] = useState<string | null>(null);

  // Account details/event type/message field: only available for hovering after Verify is successful (same set of delayed closing)
  const [accountInsightBubble, setAccountInsightBubble] = useState<{
    configId: string;
    kind: AccountInsightKind;
  } | null>(null);
  const accountInsightHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAccountInsightHide = () => {
    if (accountInsightHideTimeoutRef.current) clearTimeout(accountInsightHideTimeoutRef.current);
    accountInsightHideTimeoutRef.current = setTimeout(() => setAccountInsightBubble(null), 260);
  };
  const cancelAccountInsightHide = () => {
    if (accountInsightHideTimeoutRef.current) {
      clearTimeout(accountInsightHideTimeoutRef.current);
      accountInsightHideTimeoutRef.current = null;
    }
  };

  // Parse the JSON stored by verify as readable content; the apps~username range is an independent information block (selected copying is supported)
  const renderAccountDetailsContent = (rawText: string | undefined): React.ReactNode => {
    if (!rawText || !rawText.trim()) return <span className="account-details-empty">—</span>;
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return <span className="account-details-plain">{rawText}</span>;
    }
    if (parsed === null || typeof parsed !== 'object') {
      return <span className="account-details-plain">{String(parsed)}</span>;
    }

    const renderValue = (v: unknown, depth: number): React.ReactNode => {
      if (v === null) return 'null';
      if (typeof v === 'boolean') return String(v);
      if (typeof v === 'number') return String(v);
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) {
        if (v.length === 0) return '[]';
        return (
          <ul className="account-details-list" style={{ margin: 0, paddingLeft: '16px' }}>
            {v.map((item, i) => (
              <li key={i}>{typeof item === 'object' && item !== null ? renderValue(item, depth + 1) : String(item)}</li>
            ))}
          </ul>
        );
      }
      if (typeof v === 'object' && v !== null) {
        return renderFlatObjectWithAppsUsernameBlock(v as Record<string, unknown>, depth);
      }
      return String(v);
    };

    /** Put apps to username (closed range in key order) into separate blocks; when forceSingleBlock=true, the entire object is put into the same block */
    const renderFlatObjectWithAppsUsernameBlock = (
      obj: Record<string, unknown>,
      depth: number,
      forceSingleBlock: boolean = false
    ): React.ReactNode => {
      const keys = Object.keys(obj);
      const iApps = keys.indexOf('apps');
      const iUser = keys.indexOf('username');
      const row = (k: string) => {
        const val = obj[k];
        return (
          <li key={k} className="account-details-row">
            <span className="account-details-key">{k}:</span>{' '}
            {typeof val === 'object' && val !== null && !Array.isArray(val)
              ? renderValue(val, depth + 1)
              : Array.isArray(val)
                ? renderValue(val, depth + 1)
                : String(val)}
          </li>
        );
      };

      if (iApps !== -1 && iUser !== -1) {
        if (forceSingleBlock) {
          return (
            <div className="account-details-parsed-split">
              <div className="account-details-apps-user-block my-2 rounded-md border border-gray-200 bg-gray-50 p-2.5">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Apps · Username</div>
                <ul className="account-details-kv" style={{ margin: 0, paddingLeft: '12px', listStyle: 'none' }}>
                  {keys.map(row)}
                </ul>
              </div>
            </div>
          );
        }
        const start = Math.min(iApps, iUser);
        const end = Math.max(iApps, iUser);
        const blockKeys = keys.slice(start, end + 1);
        const beforeKeys = keys.slice(0, start);
        const afterKeys = keys.slice(end + 1);
        return (
          <div className="account-details-parsed-split">
            {beforeKeys.length > 0 && (
              <ul className="account-details-kv mb-2" style={{ margin: 0, paddingLeft: '16px', listStyle: 'none' }}>
                {beforeKeys.map(row)}
              </ul>
            )}
            <div className="account-details-apps-user-block my-2 rounded-md border border-gray-200 bg-gray-50 p-2.5">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Apps · Username</div>
              <ul className="account-details-kv" style={{ margin: 0, paddingLeft: '12px', listStyle: 'none' }}>
                {blockKeys.map(row)}
              </ul>
            </div>
            {afterKeys.length > 0 && (
              <ul className="account-details-kv mt-2" style={{ margin: 0, paddingLeft: '16px', listStyle: 'none' }}>
                {afterKeys.map(row)}
              </ul>
            )}
          </div>
        );
      }

      if (keys.length === 0) return '{}';
      return (
        <ul className="account-details-kv" style={{ margin: 0, paddingLeft: '16px', listStyle: 'none' }}>
          {keys.map(row)}
        </ul>
      );
    };

    if (Array.isArray(parsed)) {
      return <div className="account-details-parsed">{renderValue(parsed, 0)}</div>;
    }

    const rootObj = parsed as Record<string, unknown>;
    if (Array.isArray(rootObj.users)) {
      const users = rootObj.users as unknown[];
      const otherKeys = Object.keys(rootObj).filter((k) => k !== 'users');
      const otherSlice: Record<string, unknown> = {};
      otherKeys.forEach((k) => {
        otherSlice[k] = rootObj[k];
      });
      return (
        <div className="account-details-parsed">
          {otherKeys.length > 0 && (
            <div className="mb-3 border-b border-gray-100 pb-3">{renderFlatObjectWithAppsUsernameBlock(otherSlice, 0)}</div>
          )}
          {users.map((u, idx) => (
            <div
              key={idx}
              className="account-details-user-wrap mb-3 border-b border-gray-100 pb-3 last:mb-0 last:border-b-0 last:pb-0"
            >
              <div className="mb-1.5 flex items-center justify-between">
                <div className="text-[11px] font-medium text-gray-600">User {idx + 1}</div>
                <button
                  type="button"
                  onClick={() => {
                    const text = typeof u === 'object' && u !== null ? JSON.stringify(u, null, 2) : String(u);
                    void copyWithInlineFeedback(text, `details-user-${idx}`);
                  }}
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                  title={`Copy User ${idx + 1}`}
                  aria-label={`Copy User ${idx + 1}`}
                >
                  {copiedBlockKey === `details-user-${idx}` ? (
                    <RiCheckLine className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <RiFileCopyLine className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              {typeof u === 'object' && u !== null && !Array.isArray(u)
                ? renderFlatObjectWithAppsUsernameBlock(u as Record<string, unknown>, 0, true)
                : String(u)}
            </div>
          ))}
        </div>
      );
    }

    return <div className="account-details-parsed">{renderFlatObjectWithAppsUsernameBlock(rootObj, 0)}</div>;
  };

  // Message Fields-specific formatting: segment by platform, hide fetched_at/request_id
  const stripInsightMetaKeys = (val: unknown): unknown => {
    if (Array.isArray(val)) {
      return val.map(stripInsightMetaKeys);
    }
    if (val && typeof val === 'object') {
      const out: Record<string, unknown> = {};
      Object.entries(val as Record<string, unknown>).forEach(([k, v]) => {
        if (k === 'request_id' || k === 'fetched_at') return;
        out[k] = stripInsightMetaKeys(v);
      });
      return out;
    }
    return val;
  };

  const renderAccountEventTypesContent = (rawVal: unknown): React.ReactNode => {
    const parseObj = (v: unknown): Record<string, unknown> | null => {
      if (v == null) return null;
      if (typeof v === 'string') {
        try {
          const p = JSON.parse(v);
          return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
        } catch {
          return null;
        }
      }
      if (typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
      return null;
    };

    const cleaned = stripInsightMetaKeys(rawVal);
    const root = parseObj(cleaned);
    if (!root) return <span className="account-details-empty">—</span>;

    const renderEventTypesCodeBlock = (eventTypesVal: unknown): React.ReactNode => {
      if (!Array.isArray(eventTypesVal) || eventTypesVal.length === 0) {
        return <span className="account-details-empty">—</span>;
      }
      const codeText = eventTypesVal.map((v) => String(v)).join('\n');
      return (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-2">
          <pre className="m-0 max-h-[180px] overflow-auto font-mono text-[11px] leading-relaxed text-gray-800 whitespace-pre-wrap break-all">
            {codeText}
          </pre>
        </div>
      );
    };

    // Success structure: { attributing_entity, data: { event_types: [...] } }
    const entity = typeof root.attributing_entity === 'string' ? root.attributing_entity : null;
    const dataObj = parseObj(root.data);
    if (entity && dataObj) {
      if (Array.isArray(dataObj.event_types)) {
        return (
          <div className="account-details-parsed">
            <div className="account-details-user-wrap mb-3 border-b border-gray-100 pb-3 last:mb-0 last:border-b-0 last:pb-0">
              <div className="mb-1.5 flex items-center justify-between">
                <div className="text-[11px] font-medium uppercase text-gray-600">{entity}</div>
                <button
                  type="button"
                  onClick={() => { void copyWithInlineFeedback((dataObj.event_types as unknown[]).map((v) => String(v)).join('\n'), `event-${entity}`); }}
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                  title="Copy"
                  aria-label="Copy event types"
                >
                  {copiedBlockKey === `event-${entity}` ? (
                    <RiCheckLine className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <RiFileCopyLine className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              {renderEventTypesCodeBlock(dataObj.event_types)}
            </div>
          </div>
        );
      }
      return (
        <div className="account-details-parsed">
          <div className="account-details-user-wrap mb-3 border-b border-gray-100 pb-3 last:mb-0 last:border-b-0 last:pb-0">
            <div className="mb-1.5 text-[11px] font-medium uppercase text-gray-600">{entity}</div>
            {renderAccountDetailsContent(insightPayloadToDisplayText(dataObj))}
          </div>
        </div>
      );
    }

    // Failure structure: { error, attempts: [{ attributing_entity, result }] }
    if (Array.isArray(root.attempts)) {
      const attempts = root.attempts as Array<Record<string, unknown>>;
      return (
        <div className="account-details-parsed">
          {attempts.map((a, idx) => {
            const e = typeof a.attributing_entity === 'string' ? a.attributing_entity : `attempt_${idx + 1}`;
            const res = parseObj(a.result) ?? {};
            if (Array.isArray(res.event_types)) {
              return (
                <div key={`${e}-${idx}`} className="account-details-user-wrap mb-3 border-b border-gray-100 pb-3 last:mb-0 last:border-b-0 last:pb-0">
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="text-[11px] font-medium uppercase text-gray-600">{e}</div>
                    <button
                      type="button"
                      onClick={() => { void copyWithInlineFeedback((res.event_types as unknown[]).map((v) => String(v)).join('\n'), `event-${e}-${idx}`); }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                      title="Copy"
                      aria-label="Copy event types"
                    >
                      {copiedBlockKey === `event-${e}-${idx}` ? (
                        <RiCheckLine className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <RiFileCopyLine className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  {renderEventTypesCodeBlock(res.event_types)}
                </div>
              );
            }
            return (
              <div key={`${e}-${idx}`} className="account-details-user-wrap mb-3 border-b border-gray-100 pb-3 last:mb-0 last:border-b-0 last:pb-0">
                <div className="mb-1.5 text-[11px] font-medium uppercase text-gray-600">{e}</div>
                {renderAccountDetailsContent(insightPayloadToDisplayText(res))}
              </div>
            );
          })}
        </div>
      );
    }

    return renderAccountDetailsContent(insightPayloadToDisplayText(root));
  };

  const renderAccountMessageFieldsContent = (rawVal: unknown): React.ReactNode => {
    const parseObj = (v: unknown): Record<string, unknown> | null => {
      if (v == null) return null;
      if (typeof v === 'string') {
        try {
          const p = JSON.parse(v);
          return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
        } catch {
          return null;
        }
      }
      if (typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
      return null;
    };

    const root = parseObj(stripInsightMetaKeys(rawVal));
    if (!root) return <span className="account-details-empty">—</span>;
    const byPlatform = parseObj(root.by_platform);
    if (!byPlatform) {
      return (
        <div className="account-details-parsed">
          {renderAccountDetailsContent(insightPayloadToDisplayText(rawVal))}
        </div>
      );
    }

    const renderFieldList = (fieldsVal: unknown) => {
      if (!Array.isArray(fieldsVal) || fieldsVal.length === 0) {
        return <span className="account-details-empty">—</span>;
      }
      const codeText = fieldsVal.map((f) => String(f)).join('\n');
      return (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-2">
          <pre className="m-0 max-h-[180px] overflow-auto font-mono text-[11px] leading-relaxed text-gray-800 whitespace-pre-wrap break-all">
            {codeText}
          </pre>
        </div>
      );
    };

    const platforms = Object.keys(byPlatform);
    if (platforms.length === 0) return <span className="account-details-empty">—</span>;

    return (
      <div className="account-details-parsed">
        {platforms.map((platform) => {
          const platformObj = parseObj(byPlatform[platform]);
          const fieldsVal = platformObj?.fields;
          return (
            <div key={platform} className="account-details-user-wrap mb-3 border-b border-gray-100 pb-3 last:mb-0 last:border-b-0 last:pb-0">
              <div className="mb-1.5 flex items-center justify-between">
                <div className="text-[11px] font-medium uppercase text-gray-600">{platform}</div>
                <button
                  type="button"
                  onClick={() => {
                    const text = Array.isArray(fieldsVal) ? fieldsVal.map((f) => String(f)).join('\n') : '';
                    void copyWithInlineFeedback(text, `message-${platform}`);
                  }}
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                  title="Copy"
                  aria-label={`Copy ${platform} message fields`}
                >
                  {copiedBlockKey === `message-${platform}` ? (
                    <RiCheckLine className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <RiFileCopyLine className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              {renderFieldList(fieldsVal)}
            </div>
          );
        })}
      </div>
    );
  };

  // Click the area outside the Verify bubble to close it
  useEffect(() => {
    if (!verifyResultBubbleConfigId) return;
    const onDocDown = (e: MouseEvent) => {
      const el = document.querySelector(`[data-verify-bubble-anchor="${verifyResultBubbleConfigId}"]`);
      if (el && !el.contains(e.target as Node)) {
        setVerifyResultBubbleConfigId(null);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [verifyResultBubbleConfigId]);

  // The Verify button changes color according to the verification results: Active blue-purple, Invalid red
  const getVerifyButtonClass = (configId: string) => {
    if (validateLoading[configId]) return '';
    const status = validateStatus[configId]?.status;
    if (status === 'Active') return 'verify-button-active';
    if (status === 'Failed') return 'verify-button-invalid';
    return 'verify-button-invalid'; // Unverified is also shown in red
  };

  return (
    <div className="no-select" style={{ padding: '24px' }}>
      <style>
        {`
          /* Custom input box style */
          .custom-input {
            height: 40px !important;
            border-radius: 4px !important;
            border: 1px solid rgb(230, 233, 240) !important;
            font-size: 14px !important;
            font-family: "Museo Sans", sans-serif !important;
            font-weight: 500 !important;
            color: rgb(34, 13, 78) !important;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1) !important;
            -webkit-font-smoothing: antialiased !important;
            -moz-osx-font-smoothing: grayscale !important;
            text-rendering: optimizeLegibility !important;
          }
          
          .custom-input:focus {
            border-color: rgb(114, 46, 209) !important;
            box-shadow: 0 0 0 2px rgba(114, 46, 209, 0.1) !important;
          }
          
          .custom-input:hover {
            border-color: rgb(114, 46, 209) !important;
          }
          
          /* Customize password input box style */
          .custom-password-input {
            height: 40px !important;
            border-radius: 4px !important;
            border: 1px solid rgb(230, 233, 240) !important;
            font-size: 14px !important;
            font-family: "Museo Sans", sans-serif !important;
            font-weight: 500 !important;
            color: rgb(34, 13, 78) !important;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1) !important;
            -webkit-font-smoothing: antialiased !important;
            -moz-osx-font-smoothing: grayscale !important;
            text-rendering: optimizeLegibility !important;
          }
          
          .custom-password-input:focus {
            border-color: rgb(114, 46, 209) !important;
            box-shadow: 0 0 0 2px rgba(114, 46, 209, 0.1) !important;
          }
          
          .custom-password-input:hover {
            border-color: rgb(114, 46, 209) !important;
          }
          
          /* API Token input box style optimization - ensure that the text is truncated to the left of the small eye icon */
          .api-token-input-container {
            position: relative;
            width: 100%;
            display: flex;
            align-items: center;
          }
          
          .api-token-input {
            width: calc(100% - 32px);
            padding-right: 8px;
            text-overflow: ellipsis;
            overflow: hidden;
            white-space: nowrap;
            border: none;
            outline: none;
            background: transparent;
            font-size: 14px;
            font-family: "Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif;
            font-weight: 500;
            color: rgb(34, 13, 78);
            line-height: 1.4;
            letter-spacing: 0.01em;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            text-rendering: optimizeLegibility;
          }
          
          .api-token-visibility-toggle {
            position: absolute;
            right: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 32px;
            height: 24px;
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 6px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            z-index: 10;
          }
          
          .api-token-visibility-toggle:hover {
            background-color: rgba(114, 46, 209, 0.1);
          }
          
          .api-token-visibility-toggle:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          
          .api-token-visibility-toggle:disabled:hover {
            background-color: transparent;
          }
          

          
          /* Customize user information form style */
          .custom-user-info-table {
            background: linear-gradient(135deg, #ffffff 0%, #fafbfc 100%);
            border-radius: 4px;
            padding: 24px;
            margin: 0 0 24px 0;
            box-shadow: 
              0 4px 6px -1px rgba(0, 0, 0, 0.05),
              0 10px 15px -3px rgba(0, 0, 0, 0.05),
              0 0 0 1px rgba(0, 0, 0, 0.05);
            border: 1px solid rgba(230, 233, 240, 0.8);
            position: relative;
            overflow: hidden;
            animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          }
          
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          
          .custom-user-info-table::before {
            display: none;
          }
          
          .custom-user-info-table::after {
            display: none;
          }
          
          .info-row {
            display: flex;
            align-items: center;
            padding: 16px 0;
            border-bottom: 1px solid rgba(230, 233, 240, 0.6);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            animation: slideInLeft 0.6s cubic-bezier(0.4, 0, 0.2, 1) both;
          }
          
          .info-row:nth-child(1) { animation-delay: 0.1s; }
          .info-row:nth-child(2) { animation-delay: 0.2s; }
          .info-row:nth-child(3) { animation-delay: 0.3s; }
          .info-row:nth-child(4) { animation-delay: 0.4s; }
          .info-row:nth-child(5) { animation-delay: 0.5s; }
          .info-row:nth-child(6) { animation-delay: 0.6s; }
          
          @keyframes slideInLeft {
            from {
              opacity: 0;
              transform: translateX(-20px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
          
          .info-row:last-child {
            border-bottom: none;
          }
          
          .info-row:hover {
            background: rgba(0, 0, 0, 0.02);
            border-radius: 4px;
            padding-left: 16px;
            padding-right: 16px;
            margin-left: -16px;
            margin-right: -16px;
            transform: translateX(4px);
          }
          
          .info-label {
            flex: 0 0 140px;
            padding-right: 24px;
            position: relative;
          }
          
          .label-text {
            font-family: "Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif;
            font-size: 14px;
            font-weight: 600;
            color: rgb(34, 13, 78);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            position: relative;
            display: inline-block;
          }
          
          .label-text::after {
            content: '';
            position: absolute;
            bottom: -4px;
            left: 0;
            width: 0;
            height: 2px;
            background: #1f2937;
            transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 1px;
          }
          
          .info-row:hover .label-text::after {
            width: 100%;
          }
          
          .info-value {
            flex: 1;
            display: flex;
            align-items: center;
            min-height: 24px;
          }

          /* Username: View/edit share the same row height to avoid the entire row being raised when entering the input box. */
          .info-row-username .info-value {
            min-height: 32px;
            align-items: center;
          }
          
          /* User profile row special style */
          .user-profile-row {
            border-bottom: 2px solid rgba(0, 0, 0, 0.06);
            padding: 20px 0;
            margin-bottom: 8px;
          }
          
          .user-profile-value {
            display: flex;
            align-items: center;
            gap: 20px;
          }
          
          .avatar-section {
            flex-shrink: 0;
          }
          
          .avatar-container {
            position: relative;
            cursor: pointer;
            border-radius: 50%;
            overflow: hidden;
            width: 64px;
            height: 64px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 3px solid rgba(0, 0, 0, 0.08);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            background: #f9fafb;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          }
          
          .avatar-container:hover {
            border-color: rgba(0, 0, 0, 0.2);
            transform: scale(1.08) translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          }
          
          .avatar-container:active {
            transform: scale(1.02) translateY(0);
            transition: all 0.1s ease;
          }
          
          .avatar-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 50%;
          }
          
          .avatar-placeholder {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            color: #6b7280;
          }
          
          .avatar-placeholder.hidden {
            display: none;
          }
          
          .avatar-icon {
            width: 28px;
            height: 28px;
          }
          
          .avatar-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 50%;
          }
          
          .avatar-container:hover .avatar-overlay {
            opacity: 1;
          }
          
          .upload-content {
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
          }
          
          .upload-icon-container {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            background: transparent;
            border-radius: 50%;
            border: 2px solid rgba(255, 255, 255, 0.9);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          
          .avatar-container:hover .upload-icon-container {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 1);
            transform: scale(1.1);
          }
          
          .upload-icon {
            width: 18px;
            height: 18px;
            color: white;
            filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.3));
          }
          
          .user-details {
            display: flex;
            flex-direction: column;
            justify-content: center;
            min-height: 48px;
          }
          
          .username {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: rgb(34, 13, 78);
            line-height: 1.4;
            white-space: nowrap;
            font-family: "Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif;
          }
          
          .user-email {
            margin: 4px 0 0;
            color: rgb(102, 102, 102);
            font-size: 14px;
            line-height: 1.4;
            white-space: nowrap;
            font-family: "Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif;
          }
          
          /* Button row special styles */
          .button-row {
            border-bottom: none !important;
            padding: 20px 0 0 0;
            margin-top: 8px;
          }
          
          .button-row:hover {
            background: none !important;
            transform: none !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
          }
          
          .button-value {
            display: flex;
            gap: 16px;
            align-items: center;
          }
          
          .value-text {
            font-family: "Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif;
            font-size: 15px;
            font-weight: 500;
            color: rgb(51, 51, 51);
            line-height: 1.5;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          
          .info-row:hover .value-text {
            color: rgb(34, 13, 78);
            transform: translateX(4px);
          }
          
          /* Make sure the role-badge text remains white on hover and does not move */
          .info-row:hover .value-text.role-badge {
            color: white !important;
            transform: none !important;
          }
          
          .role-badge {
            background: #1f2937;
            color: white;
            padding: 6px 16px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            position: relative;
            overflow: hidden;
          }
          
          .role-badge::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
            transition: left 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          }
          
          .info-row:hover .role-badge::before {
            left: 100%;
          }
          

          
                    /* API Token component style - AppsFlyer style, compact design */
          .api-token-row {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-top: 8px;
            height: 24px;
          }
          
          .api-token-label {
            font-size: 11px;
            font-weight: 500;
            color: #8c8c8c;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            white-space: nowrap;
            flex-shrink: 0;
          }
          
          .api-token-display {
            display: flex;
            align-items: center;
            gap: 6px;
            background: transparent;
            border: none;
            padding: 0;
            height: 20px;
            line-height: 1;
            width: 33.33%;
            min-width: 0;
          }
          
          .token-masked {
            color: #000000;
            letter-spacing: 1px;
            font-weight: 400;
          }
          
          .token-visible {
            color: rgb(34, 13, 78);
            font-weight: 400;
            font-family: "Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif;
            font-size: 13px;
            line-height: 1.4;
          }
          
                    /* Responsive design */
          @media (max-width: 768px) {
            .custom-user-info-table {
              padding: 16px;
              margin: 16px 0;
            }
            
            .info-row {
              flex-direction: column;
              align-items: flex-start;
              padding: 12px 0;
            }
            
            .info-label {
              flex: none;
              padding-right: 0;
              padding-bottom: 8px;
              margin-bottom: 4px;
            }
            
            .info-value {
              flex: none;
              width: 100%;
            }
            
            .user-profile-value {
              flex-direction: column;
              align-items: flex-start;
              gap: 16px;
            }
            
            .avatar-section {
              align-self: center;
            }
            
            .user-details {
              align-items: center;
              text-align: center;
            }
            
            .button-value {
              flex-direction: column;
              gap: 12px;
            }
            
            .custom-btn {
              width: 100%;
              min-width: auto;
            }
          }
           
           
           
                     .custom-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            font-family: "Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
            min-width: 120px;
            height: 38px;
          }
           
           .custom-btn::before {
             content: '';
             position: absolute;
             top: 0;
             left: -100%;
             width: 100%;
             height: 100%;
             background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
             transition: left 0.6s cubic-bezier(0.4, 0, 0.2, 1);
           }
           
           .custom-btn:hover::before {
             left: 100%;
           }
           
           .edit-profile-btn {
             background: linear-gradient(135deg, #722ed1 0%, #9254de 100%);
             color: white;
             box-shadow: 0 4px 12px rgba(114, 46, 209, 0.3);
           }
           
           .edit-profile-btn:hover {
             transform: translateY(-2px);
             box-shadow: 0 8px 20px rgba(114, 46, 209, 0.4);
           }
           
           .change-password-btn {
             background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
             color: rgb(34, 13, 78);
             border: 2px solid rgba(114, 46, 209, 0.2);
             box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
           }
           
           .change-password-btn:hover {
             background: linear-gradient(135deg, rgba(114, 46, 209, 0.05) 0%, rgba(114, 46, 209, 0.02) 100%);
             border-color: rgba(114, 46, 209, 0.4);
             transform: translateY(-1px);
             box-shadow: 0 4px 12px rgba(114, 46, 209, 0.15);
           }
           
           .custom-btn:disabled {
             opacity: 0.6;
             cursor: not-allowed;
             transform: none !important;
           }
           
           .custom-btn:disabled:hover {
             transform: none !important;
             box-shadow: inherit !important;
           }
           
                     .btn-icon {
            font-size: 14px;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
           
           .custom-btn:hover .btn-icon {
             transform: scale(1.1);
           }
           
           .btn-text {
             font-weight: 600;
             letter-spacing: 0.3px;
           }
           
           /* Responsive button design */
           @media (max-width: 768px) {
             .custom-button-group {
               flex-direction: column;
               gap: 12px;
             }
             
             .custom-btn {
               width: 100%;
               min-width: auto;
             }
          }
          
          /* Make sure the width of the Account Type drop-down box is exactly the same as the input box */
          [data-account-type-selector] {
            width: 100% !important;
            display: block !important;
            box-sizing: border-box !important;
          }
          
          [data-account-type-selector] button {
            width: 100% !important;
            min-width: 100% !important;
            box-sizing: border-box !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
          }
          
          [data-account-type-selector-dropdown] {
            width: 100% !important;
            min-width: 100% !important;
            box-sizing: border-box !important;
            left: 0 !important;
            right: 0 !important;
          }
          
          /* Custom selector style */
          .custom-select {
            height: 40px !important;
            border-radius: 4px !important;
            border: 1px solid rgb(230, 233, 240) !important;
            font-size: 14px !important;
            font-family: "Museo Sans", sans-serif !important;
            font-weight: 500 !important;
            color: rgb(34, 13, 78) !important;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1) !important;
            -webkit-font-smoothing: antialiased !important;
            -moz-osx-font-smoothing: grayscale !important;
            text-rendering: optimizeLegibility !important;
          }
          
          .custom-select:focus {
            border-color: rgb(114, 46, 209) !important;
            box-shadow: 0 0 0 2px rgba(114, 46, 209, 0.1) !important;
          }
          
          .custom-select:hover {
            border-color: rgb(114, 46, 209) !important;
          }
          
            box-shadow: 0 0 0 2px rgba(34, 13, 78, 0.1) !important;
          }
          
          /* Account Type selector dropdown menu animation */
          [data-account-type-selector-dropdown] {
            animation: dropdownFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
            opacity: 1 !important;
            transform: translateY(0) scale(1) !important;
          }
          
          @keyframes dropdownFadeIn {
            from {
              opacity: 0;
              transform: translateY(-10px) scale(0.95);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}
      </style>
      {/* Integrated user information area */}
      <div className="custom-user-info-table" data-user-info-section>
          {/* Avatar and basic information lines */}
          <div className="info-row user-profile-row">
            <div className="info-label">
              <span className="label-text">Profile</span>
            </div>
            <div className="info-value user-profile-value">
              <div className="avatar-section">
                <div className="avatar-container" onClick={() => document.getElementById('avatar-input')?.click()}>
                  {userProfile?.avatar ? (
                    <img 
                      src={userProfile.avatar} 
                      alt="Avatar" 
                      className="avatar-image"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <div className={`avatar-placeholder ${userProfile?.avatar ? 'hidden' : ''}`}>
                    <svg className="avatar-icon" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                  
                  {/* Simple upload overlay */}
                  <div className="avatar-overlay">
                    <div className="upload-content">
                      <div className="upload-icon-container">
                        <svg className="upload-icon" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  {/* Hidden file input */}
                  <input
                    id="avatar-input"
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleImageSelect(file as any);
                        e.target.value = ''; // reset input
                      }
                    }}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>
              <div className="user-details">
                <h3 className="username">{userLoading ? '' : userProfile?.username}</h3>
                <p className="user-email">{userLoading ? '' : userProfile?.email}</p>
              </div>
          </div>
        </div>


          <div className="info-row info-row-username group">
            <div className="info-label">
              <span className="label-text">Username</span>
            </div>
            <div className="info-value">
              {!isUsernameEditing ? (
                <div className="flex min-h-8 items-center gap-2">
                  <span className="value-text leading-[1.25]">{userLoading ? '' : userProfile?.username}</span>
                  {!userLoading && (
                    <button
                      type="button"
                      onClick={startInlineUsernameEdit}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-transparent text-gray-400 opacity-0 transition hover:border-gray-200 hover:bg-gray-50 hover:text-gray-600 group-hover:opacity-100"
                      title="Edit username"
                      aria-label="Edit username"
                    >
                      <RiEditBoxLine className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative inline-flex min-h-8 max-w-full flex-wrap items-center gap-2">
                  <Input
                    type="text"
                    value={usernameDraft}
                    onChange={(e) => {
                      const v = e.target.value;
                      setUsernameDraft(v);
                      setUsernameDraftError(validateInlineUsername(v));
                    }}
                    className="h-8 min-h-8 max-h-8 w-auto min-w-[220px] max-w-[220px] shrink-0 py-0 text-[15px] leading-tight shadow-sm"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={submitInlineUsernameEdit}
                    disabled={
                      profileLoading ||
                      !!usernameDraftError ||
                      usernameDraft.trim() === String(userProfile?.username || '').trim()
                    }
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded bg-transparent text-gray-500 transition hover:bg-green-50 hover:text-green-600 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Save"
                    aria-label="Save username"
                  >
                    <RiCheckLine className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={cancelInlineUsernameEdit}
                    disabled={profileLoading}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded bg-transparent text-gray-500 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Cancel"
                    aria-label="Cancel username edit"
                  >
                    <RiCloseLine className="h-4 w-4" />
                  </button>
                  {usernameDraftError ? (
                    <span
                      className="absolute left-0 top-full z-[1] mt-1 max-w-[min(100%,320px)] text-xs leading-tight text-red-600"
                      role="alert"
                    >
                      {usernameDraftError}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          </div>
          
          <div className="info-row">
            <div className="info-label">
              <span className="label-text">Email</span>
            </div>
            <div className="info-value">
              <span className="value-text">{userLoading ? '' : userProfile?.email}</span>
            </div>
          </div>
          
          <div className="info-row">
            <div className="info-label">
              <span className="label-text">Role</span>
            </div>
            <div className="info-value">
              <span className="value-text role-badge">{userLoading ? '' : userProfile?.role}</span>
            </div>
          </div>
          
          <div className="info-row">
            <div className="info-label">
              <span className="label-text">Last Login</span>
            </div>
            <div className="info-value">
              <div className="last-login-container">
                <span className="value-text main-time">
                  {userLoading ? '' : (() => {
                    if (!userProfile?.lastLogin || userProfile.lastLogin === 'Never') {
                      return 'Never';
                    }
                    
                    try {
                      // Try to parse the time and convert to local time zone
                      const loginDate = new Date(userProfile.lastLogin);
                      if (isNaN(loginDate.getTime())) {
                        return 'Invalid Date';
                      }
                      
                      // Use a more friendly time format, based on GMT time format
                      const now = new Date();
                      const diffMs = now.getTime() - loginDate.getTime();
                      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                      
                      if (diffDays === 0) {
                        // today
                        return `Today ${loginDate.toLocaleTimeString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          hour12: false 
                        })}`;
                      } else if (diffDays === 1) {
                        // yesterday
                        return `Yesterday ${loginDate.toLocaleTimeString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          hour12: false 
                        })}`;
                      } else if (diffDays < 7) {
                        // within a week
                        return `${loginDate.toLocaleDateString('en-US', { 
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric'
                        })} ${loginDate.toLocaleTimeString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          hour12: false 
                        })}`;
                      } else {
                        // earlier
                        return `${loginDate.toLocaleDateString('en-US', { 
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })} ${loginDate.toLocaleTimeString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          hour12: false 
                        })}`;
                      }
                    } catch (error) {
                      console.error('Error parsing lastLogin date:', error);
                      return 'Invalid Date';
                    }
                  })()}
                </span>
                
                {/* Debug information - only displays raw GMT time in development environment */}
                {process.env.NODE_ENV === 'development' && (
                  <span className="gmt-time">
                    GMT: {userProfile?.lastLogin || 'No data'}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Button row - integrated into the form */}
          <div className="info-row button-row">
            <div className="info-label">
              <span className="label-text">Actions</span>
            </div>
            <div className="info-value button-value">
              <Button
                variant="outline"
                className="bg-white hover:bg-gray-50 border border-gray-300 hover:border-gray-400 text-gray-900 shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 px-4 py-2"
                onClick={() => {
                  // Reset the visibility state of all password fields to the default encrypted display
                  setCurrentPasswordVisible(false);
                  setNewPasswordVisible(false);
                  setConfirmPasswordVisible(false);
                  // Reset current password verification status
                  setCurrentPasswordValid(null);
                  setIsPasswordModalVisible(true);
                }}
                disabled={userLoading}
              >
                <RiLockPasswordLine className="w-4 h-4" />
                <span>Security Settings</span>
              </Button>
              <Button
                ref={addConfigButtonRef}
                variant="default"
                onClick={() => setShowAccountTypeMenu(!showAccountTypeMenu)}
                data-add-config-button
                className="flex items-center gap-2"
                disabled={userLoading}
              >
                <FiPlus />
                Add Configuration
              </Button>
            </div>
          </div>
        </div>

        {/* Account Configuration module - header row (Add Configuration has been merged into Actions above) */}
        <div className="account-config-header">
          <h2 className="account-config-title">
            Account Configurations
          </h2>
        </div>
      
      {/* AppsFlyer Marketplace container module - strictly follows the official style */}
      <div className="mp-ms__container">
        <ul className="mp-ms__list" data-qa-id="mp-ms__list">

          
          {/* Empty status display */}
          {localAccountConfigs.length === 0 ? (
            <li className="mp-ms-item-empty" style={{
              listStyle: 'none',
              width: '100%',
              padding: '80px 20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
              fontFamily: '"Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif'
            }}>
              <div style={{
                width: '72px',
                height: '72px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '24px',
                color: 'rgb(156, 163, 175)'
              }}>
                <RiSettings6Line size={36} />
              </div>
              <h3 style={{
                margin: '0 0 12px 0',
                fontSize: '20px',
                fontWeight: '600',
                color: 'rgb(34, 13, 78)',
                fontFamily: '"Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif'
              }}>
                No Account Configurations
              </h3>
              <p style={{
                margin: '0',
                fontSize: '14px',
                color: 'rgb(107, 114, 128)',
                lineHeight: '1.6',
                maxWidth: '420px'
              }}>
                You haven't added any account configurations yet. Click "Add Configuration" to get started.
              </p>
            </li>
          ) : (
            /* Dynamically render account configuration card */
            localAccountConfigs.map((config, index) => {
            // TokenDisplay component: optimized to use cached tokens and not actively request
            // Only obtain it on demand when the user needs to view (edit/delete) to avoid a large number of requests when the page is loading.
            const TokenDisplay: React.FC<{ configId: string }> = ({ configId }) => {
              const token = accountTokens[configId];
              
              // If there is no token, no active request is made and only the placeholder is displayed.
              // The token will be obtained on demand when the user performs an operation (edit/delete)
              return (
                <span className="token-visible">
                  {token ? displayPartialToken(token) : '••••••••••••'}
                </span>
              );
            };
            
            const verifyRowActive = validateStatus[config.id]?.status === 'Active';
            return (
            <li
              key={config.id}
              className={`mp-ms-item ${accountInsightBubble?.configId === config.id ? 'is-insight-open' : ''}`}
              data-qa-id="mp-ms-item"
              tabIndex={0}
            >
            <article className="mp-ms-item__container relative z-[2] min-w-0 flex-1">
              <i className="mp-ms-item__logo" data-qa-id="mp-ms-item__logo">
                {config.custom_icon ? (
                <img 
                  className="mp-ms-item__logo-image" 
                  data-qa-id="mp-ms-item__logo-image" 
                    src={config.custom_icon}
                    alt={config.account_type === 'PRT' ? "Agency Account | PRT logo" : "Ad Network Account | PID logo"}
                />
                ) : (
                  <div className="mp-ms-item__logo-image" style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #4b5563, #374151)',
                    borderRadius: '4px',
                    color: 'white',
                    fontSize: '20px',
                    fontWeight: 'bold'
                  }}>
                    {config.account_type === 'PRT' ? (
                      <RiShakeHandsLine size={20} />
                    ) : (
                      <RiSettings6Line size={20} />
                    )}
                  </div>
                    )}
              </i>
              <div className="mp-ms-item__details">
                <div className="mp-ms-item__details-heading">
                    <h3 className="mp-ms-item__name" data-qa-id="mp-ms-item__name">{config.account_name}</h3>
                    <span className="mp-ms-item__type" data-qa-id="mp-ms-item__type">
                      {config.account_type === 'PRT' ? 'Agency Account | PRT' : 'Ad Network Account | PID'}
                    </span>
                    <div className="action-buttons-container" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="action-button"
                        title="Edit"
                        onClick={() => handleActionEdit(config)}
                      >
                        <RiEditBoxLine size={18} />
                      </button>
                      <div
                        className="verify-button-bubble-anchor relative inline-flex shrink-0 items-center"
                        data-verify-bubble-anchor={config.id}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className={`action-button ${getVerifyButtonClass(config.id)}`}
                          title="Verify"
                          onClick={() => handleVerifyClick(config)}
                        >
                          <RiShieldCheckLine size={18} />
                        </button>
                        {verifyResultBubbleConfigId === config.id && !validateLoading[config.id] && (
                          <div
                            className={`account-bubble-fade-in pointer-events-none absolute bottom-full left-1/2 z-[60] mb-2 -translate-x-1/2 select-none rounded-md border border-gray-200 bg-white py-2 text-xs text-neutral-800 shadow-md ${
                              validateStatus[config.id]?.status === 'Active'
                                ? 'min-w-max max-w-none whitespace-nowrap px-5'
                                : 'max-w-[280px] px-3 leading-relaxed'
                            }`}
                            role="status"
                          >
                            {validateStatus[config.id]?.status === 'Active' ? (
                              <span>Api token valid</span>
                            ) : (
                              <span>Invalid token. Replace API token, then Verify.</span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        className="action-button"
                        title="Delete"
                        onClick={() => handleActionDelete(config)}
                      >
                        <RiDeleteBin7Line size={18} />
                      </button>
                    </div>
                </div>
                  <div className="api-token-row">
                    <span className="api-token-label">API Token</span>
                    <div className="api-token-display">
                      <TokenDisplay configId={config.id} />
                    </div>
                  </div>
              </div>
            </article>
            {/* Three insight icons: aligned with the status badge on the right with a spacing of 36px (margin-right + .mp-ms-item gap of this block), flex responsive spacing to avoid narrow screen squeeze */}
            <div
              className="mp-ms-item__account-insights relative z-[5] shrink min-w-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mp-ms-item__account-insights-inner">
                <div
                  className={
                    verifyRowActive
                      ? 'account-insight-trigger relative transition-colors duration-200 ease-out'
                      : 'pointer-events-none relative text-gray-200'
                  }
                  title={verifyRowActive ? 'Account Details' : 'Available after verification succeeds'}
                  onClick={(e) => e.stopPropagation()}
                  {...(verifyRowActive
                    ? {
                        onMouseEnter: (e: React.MouseEvent) => {
                          e.stopPropagation();
                          cancelAccountInsightHide();
                          setAccountInsightBubble({ configId: config.id, kind: 'details' });
                        },
                        onMouseLeave: (e: React.MouseEvent) => {
                          e.stopPropagation();
                          scheduleAccountInsightHide();
                        }
                      }
                    : {})}
                >
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="block h-10 w-10 shrink-0"
                    aria-hidden
                  >
                    <path d="M2 20V19C2 15.134 5.13401 12 9 12V12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    <path d="M15.8038 12.3135C16.4456 11.6088 17.5544 11.6088 18.1962 12.3135V12.3135C18.5206 12.6697 18.9868 12.8628 19.468 12.8403V12.8403C20.4201 12.7958 21.2042 13.5799 21.1597 14.532V14.532C21.1372 15.0132 21.3303 15.4794 21.6865 15.8038V15.8038C22.3912 16.4456 22.3912 17.5544 21.6865 18.1962V18.1962C21.3303 18.5206 21.1372 18.9868 21.1597 19.468V19.468C21.2042 20.4201 20.4201 21.2042 19.468 21.1597V21.1597C18.9868 21.1372 18.5206 21.3303 18.1962 21.6865V21.6865C17.5544 22.3912 16.4456 22.3912 15.8038 21.6865V21.6865C15.4794 21.3303 15.0132 21.1372 14.532 21.1597V21.1597C13.5799 21.2042 12.7958 20.4201 12.8403 19.468V19.468C12.8628 18.9868 12.6697 18.5206 12.3135 18.1962V18.1962C11.6088 17.5544 11.6088 16.4456 12.3135 15.8038V15.8038C12.6697 15.4794 12.8628 15.0132 12.8403 14.532V14.532C12.7958 13.5799 13.5799 12.7958 14.532 12.8403V12.8403C15.0132 12.8628 15.4794 12.6697 15.8038 12.3135V12.3135Z" stroke="currentColor" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
                    <path d="M15.3636 17L16.4546 18.0909L18.6364 15.9091" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    <path d="M9 12C11.2091 12 13 10.2091 13 8C13 5.79086 11.2091 4 9 4C6.79086 4 5 5.79086 5 8C5 10.2091 6.79086 12 9 12Z" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  </svg>
                  {accountInsightBubble?.configId === config.id && accountInsightBubble?.kind === 'details' && verifyRowActive && (
                    <div
                      className="account-bubble-fade-in account-details-popover account-insight-popover pointer-events-auto flex max-h-[360px] min-w-[280px] max-w-[420px] flex-col overflow-hidden"
                      onMouseEnter={(e) => {
                        e.stopPropagation();
                        cancelAccountInsightHide();
                        setAccountInsightBubble({ configId: config.id, kind: 'details' });
                      }}
                      onMouseLeave={(e) => {
                        e.stopPropagation();
                        scheduleAccountInsightHide();
                      }}
                    >
                      <div className="account-details-select-text account-bubble-scrollable max-h-[360px] cursor-text overflow-y-auto p-3">
                        <div className="account-details-select-text mb-2.5 border-b border-gray-100 pb-2 text-sm font-semibold text-gray-900">
                          <span>Account Details</span>
                        </div>
                        <div className="account-details-select-text account-bubble-scrollable max-h-[280px] overflow-y-auto text-xs leading-relaxed text-gray-800">
                          {renderAccountDetailsContent(validateStatus[config.id]?.text)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div
                  className={
                    verifyRowActive
                      ? 'account-insight-trigger relative shrink-0 transition-colors duration-200 ease-out'
                      : 'pointer-events-none relative shrink-0 text-gray-200'
                  }
                  title={verifyRowActive ? 'Account Event Types (from Verify)' : 'Available after verification succeeds'}
                  aria-label="Account Event Types"
                  onClick={(e) => e.stopPropagation()}
                  {...(verifyRowActive
                    ? {
                        onMouseEnter: (e: React.MouseEvent) => {
                          e.stopPropagation();
                          cancelAccountInsightHide();
                          setAccountInsightBubble({ configId: config.id, kind: 'event_types' });
                        },
                        onMouseLeave: (e: React.MouseEvent) => {
                          e.stopPropagation();
                          scheduleAccountInsightHide();
                        }
                      }
                    : {})}
                >
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="block h-10 w-10 shrink-0">
                    <path d="M20 12V5.74853C20 5.5894 19.9368 5.43679 19.8243 5.32426L16.6757 2.17574C16.5632 2.06321 16.4106 2 16.2515 2H4.6C4.26863 2 4 2.26863 4 2.6V21.4C4 21.7314 4.26863 22 4.6 22H11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    <path d="M8 10H16M8 6H12M8 14H11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    <path d="M20.5 20.5L22 22" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    <path d="M15 18C15 19.6569 16.3431 21 18 21C18.8299 21 19.581 20.663 20.1241 20.1185C20.6654 19.5758 21 18.827 21 18C21 16.3431 19.6569 15 18 15C16.3431 15 15 16.3431 15 18Z" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    <path d="M16 2V5.4C16 5.73137 16.2686 6 16.6 6H20" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  </svg>
                  {accountInsightBubble?.configId === config.id && accountInsightBubble?.kind === 'event_types' && verifyRowActive && (
                    <div
                      className="account-bubble-fade-in account-details-popover account-insight-popover pointer-events-auto flex max-h-[360px] min-w-[280px] max-w-[420px] flex-col overflow-hidden"
                      onMouseEnter={(e) => {
                        e.stopPropagation();
                        cancelAccountInsightHide();
                        setAccountInsightBubble({ configId: config.id, kind: 'event_types' });
                      }}
                      onMouseLeave={(e) => {
                        e.stopPropagation();
                        scheduleAccountInsightHide();
                      }}
                    >
                      <div className="account-details-select-text account-bubble-scrollable max-h-[360px] cursor-text overflow-y-auto p-3">
                        <div className="account-details-select-text mb-2.5 border-b border-gray-100 pb-2 text-sm font-semibold text-gray-900">
                          <span>Account Event Types</span>
                        </div>
                        <div className="account-details-select-text account-bubble-scrollable max-h-[280px] overflow-y-auto text-xs leading-relaxed text-gray-800">
                          {renderAccountEventTypesContent(config.account_event_types)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div
                  className={
                    verifyRowActive
                      ? 'account-insight-trigger relative shrink-0 transition-colors duration-200 ease-out'
                      : 'pointer-events-none relative shrink-0 text-gray-200'
                  }
                  title={verifyRowActive ? 'Account Message Fields (from Verify)' : 'Available after verification succeeds'}
                  aria-label="Account Message Fields"
                  onClick={(e) => e.stopPropagation()}
                  {...(verifyRowActive
                    ? {
                        onMouseEnter: (e: React.MouseEvent) => {
                          e.stopPropagation();
                          cancelAccountInsightHide();
                          setAccountInsightBubble({ configId: config.id, kind: 'message_fields' });
                        },
                        onMouseLeave: (e: React.MouseEvent) => {
                          e.stopPropagation();
                          scheduleAccountInsightHide();
                        }
                      }
                    : {})}
                >
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="block h-10 w-10 shrink-0">
                    <path d="M20.5 20.5L22 22" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    <path d="M16 18.5C16 19.8807 17.1193 21 18.5 21C19.1916 21 19.8175 20.7192 20.2701 20.2654C20.7211 19.8132 21 19.1892 21 18.5C21 17.1193 19.8807 16 18.5 16C17.1193 16 16 17.1193 16 18.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    <path d="M4 6V12C4 12 4 15 11 15C18 15 18 12 18 12V6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    <path d="M11 3C18 3 18 6 18 6C18 6 18 9 11 9C4 9 4 6 4 6C4 6 4 3 11 3Z" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    <path d="M11 21C4 21 4 18 4 18V12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  </svg>
                  {accountInsightBubble?.configId === config.id && accountInsightBubble?.kind === 'message_fields' && verifyRowActive && (
                    <div
                      className="account-bubble-fade-in account-details-popover account-insight-popover pointer-events-auto flex max-h-[360px] min-w-[280px] max-w-[420px] flex-col overflow-hidden"
                      onMouseEnter={(e) => {
                        e.stopPropagation();
                        cancelAccountInsightHide();
                        setAccountInsightBubble({ configId: config.id, kind: 'message_fields' });
                      }}
                      onMouseLeave={(e) => {
                        e.stopPropagation();
                        scheduleAccountInsightHide();
                      }}
                    >
                      <div className="account-details-select-text account-bubble-scrollable max-h-[360px] cursor-text overflow-y-auto p-3">
                        <div className="account-details-select-text mb-2.5 border-b border-gray-100 pb-2 text-sm font-semibold text-gray-900">
                          <span>Account Message Fields</span>
                        </div>
                        <div className="account-details-select-text account-bubble-scrollable max-h-[280px] overflow-y-auto text-xs leading-relaxed text-gray-800">
                          {renderAccountMessageFieldsContent(config.account_message_fields)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="mp-ms-item__right-elements relative z-[2]" onClick={(e) => e.stopPropagation()}>
              <div className={`status-badge ${getStatusBadgeClass(config.id)}`}>
                {validateLoading[config.id] ? (
                  <div className="status-loading-spinner"></div>
                ) : (
                  <div className="status-dot"></div>
                )}
                <div>{getStatusBadgeText(config.id)}</div>
              </div>
            </div>
          </li>
            );
            })
          )}
        </ul>
      </div>
      
      {/* Completely clear Ant Design styles and only keep custom styles */}
      <style>{`
        /* Menu container style */
        div.account-type-menu {
          position: absolute;
          top: 100%;
          left: 0;
          width: 100%;
          z-index: 10000;
          margin-top: 6px;
          background: rgb(255, 255, 255);
          border-radius: 8px;
          box-shadow: rgba(3, 109, 235, 0.03) 0px 2px 4px, rgba(3, 109, 235, 0.02) 0px 4px 5px, rgba(3, 109, 235, 0.12) 0px 1px 10px;
          border: none;
          overflow: hidden;
          transform: translateY(-6px) scale(0.97);
          opacity: 0;
          transform-origin: top center;
          pointer-events: none;
          transition: opacity 0.22s cubic-bezier(0.4, 0, 0.2, 1),
            transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
          will-change: transform, opacity;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        
        div.account-type-menu.show {
          transform: translateY(0) scale(1);
          opacity: 1;
          pointer-events: auto;
        }

        /* Portal to body: fixed positioning, not affected by parent overflow (top/left/width buttons are bound by inline styles) */
        div.account-type-menu.account-type-menu--portal {
          position: fixed;
          top: 0;
          left: 0;
          width: auto;
          margin-top: 0;
          z-index: 10050;
        }
        
        /* Menu item container style */
        div.account-type-menu .menu-container {
          padding: 0;
        }
        
        /* Menu item style */
        div.account-type-menu .menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
          background: transparent;
          width: 100%;
          text-align: left;
          font-size: 13px;
          color: rgb(34, 13, 78);
          font-family: "Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif;
          box-sizing: border-box;
        }
        
        
        /* text style */
        div.account-type-menu .menu-text {
          flex: 1;
          font-family: "Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif;
          font-size: 13px;
          color: rgb(34, 13, 78);
          font-weight: 400;
          line-height: 20px;
        }
        
        /* menu item hover effect */
        div.account-type-menu .menu-item:hover {
          background-color: rgba(114, 46, 209, 0.08);
          color: rgb(114, 46, 209);
        }
        
        /* Icon color change when menu item is hovered */
        div.account-type-menu .menu-item:hover svg {
          color: rgb(114, 46, 209);
        }
        
        /* Account Configurations visual unified token */
        .account-config-header {
          margin-bottom: 24px;
          padding: 0 16px;
        }

        .account-config-title {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
          line-height: 1.2;
          letter-spacing: -0.01em;
          color: rgb(34, 13, 78);
          font-family: "Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif;
        }

        /* AppsFlyer Marketplace Container Style - Unified Page Texture */
        .mp-ms__container {
          width: 100%;
          max-width: 100%;
          margin-top: 24px;
          border-radius: 8px;
        }
        
        .mp-ms__list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .mp-ms-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: linear-gradient(135deg, #ffffff 0%, #fcfcfd 100%);
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease, background-color 0.2s ease;
          cursor: pointer;
          position: relative;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }
        
        .mp-ms-item:hover {
          border-color: #cbd5e1;
          background: #ffffff;
          box-shadow:
            0 6px 16px rgba(15, 23, 42, 0.08),
            0 1px 2px rgba(15, 23, 42, 0.04);
          transform: translateY(-1px);
        }

        .mp-ms-item:focus-visible {
          outline: none;
          border-color: rgb(114, 46, 209);
          box-shadow:
            0 0 0 3px rgba(114, 46, 209, 0.12),
            0 6px 16px rgba(15, 23, 42, 0.08);
        }
        
        .mp-ms-item.active {
          border-color: #1890ff;
          background: #f6ffed;
        }
        
        .mp-ms-item__right-elements {
          display: flex;
          align-items: center;
          margin-left: 0;
          margin-right: 40px;
          gap: 8px;
        }

        /* Insight three icon: next to the status badge on the right, the distance between the badge and the badge = margin-right of this block + gap(12px) of .mp-ms-item = 36px */
        .mp-ms-item__account-insights {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          margin-right: 24px;
        }

        .mp-ms-item__account-insights-inner {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: clamp(12px, 3vw, 56px);
          row-gap: 8px;
          min-width: 0;
        }
        
        /* Action Button Container - Immediately to the right of Ad Network Account | PID, at the same height as the left title row, using a global rounded corner of 4px */
        .action-buttons-container {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 4px;
          height: 28px;
          flex-shrink: 0;
        }
        /* Action button - rounded corners consistent with .mp-ms-item__type (4px), height consistent with the left title line */
        .action-button {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          cursor: pointer;
          padding: 0 8px;
          border-radius: 6px;
          color: #64748b;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          flex-shrink: 0;
        }
        
        .action-button:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
          color: #334155;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);
        }
        
        .action-button:active {
          background: #f1f5f9;
          transform: translateY(0);
        }
        
        .action-button svg {
          width: 18px;
          height: 18px;
        }

        /* Verify button: Only the icon line color changes with the state, the filling does not change when hovering */
        .action-button.verify-button-active {
          color: rgb(114, 46, 209);
          border-color: rgba(114, 46, 209, 0.3);
          background: rgba(114, 46, 209, 0.05);
        }
        .action-button.verify-button-active:hover {
          color: rgb(114, 46, 209);
          border-color: rgba(114, 46, 209, 0.45);
          background: rgba(114, 46, 209, 0.08);
        }
        .action-button.verify-button-invalid {
          color: #ff4d4f;
          border-color: rgba(255, 77, 79, 0.35);
          background: rgba(255, 77, 79, 0.05);
        }
        .action-button.verify-button-invalid:hover {
          color: #ff4d4f;
          border-color: rgba(255, 77, 79, 0.5);
          background: rgba(255, 77, 79, 0.08);
        }

        .account-details-empty,
        .account-details-plain {
          color: #8c8c8c;
        }
        .account-details-parsed {
          font-size: 12px;
          color: #262626;
        }
        .account-details-kv .account-details-row {
          margin-bottom: 4px;
        }
        .account-details-key {
          font-weight: 600;
          color: #595959;
        }
        .account-details-list li {
          margin-bottom: 2px;
        }
        /* Account bubble scroll bar: consistent with Dashboard drop-down scroll bar style */
        .account-bubble-scrollable::-webkit-scrollbar {
          width: 4px;
        }
        .account-bubble-scrollable::-webkit-scrollbar-track {
          background: transparent;
        }
        .account-bubble-scrollable::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 2px;
        }
        .account-bubble-scrollable::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.2);
          width: 4px;
        }

        /* Remove pop-up window loading animation */
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        /* Status badge basic style */
        .status-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          color: #ffffff;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          min-width: 80px;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }
        
        /* Active status - green */
        .status-badge-active {
          background: #52c41a;
        }
        
        /* Unknown status - dark gray */
        .status-badge-unknown {
          background: #4b5563;
        }
        
        /* Invalid status - red */
        .status-badge-invalid {
          background: #ff4d4f;
        }
        
        /* Loading status - dark gray, consistent with Unknown */
        .status-badge-loading {
          background: #4b5563;
          transform-origin: center;
          animation: badge-loading-expand 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        
        /* Loading state extended animation */
        @keyframes badge-loading-expand {
          0% {
            transform: scaleX(0.8);
            opacity: 0.8;
          }
          100% {
            transform: scaleX(1);
            opacity: 1;
          }
        }
        
        /* Smooth transition when switching states */
        .status-badge:not(.status-badge-loading) {
          animation: badge-state-transition 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        
        /* Status switching animation */
        @keyframes badge-state-transition {
          0% {
            transform: scale(1.05);
            opacity: 0.9;
          }
          50% {
            transform: scale(1.02);
            opacity: 0.95;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        
        .status-dot {
          width: 6px;
          height: 6px;
          background: #ffffff;
          border-radius: 50%;
        }
        
        /* Loading rotation animation */
        .status-loading-spinner {
          width: 6px;
          height: 6px;
          border: 1px solid #ffffff;
          border-top: 1px solid transparent;
          border-radius: 50%;
          animation: status-spin 1s linear infinite;
          opacity: 0;
          animation: status-spin 1s linear infinite, status-spinner-fade-in 0.3s ease forwards;
        }
        
        @keyframes status-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes status-spinner-fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        
        .mp-ms-item__container {
          display: flex;
          align-items: center;
          min-width: 0;
          gap: 16px;
        }
        
        .mp-ms-item__logo {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border-radius: 6px;
          background: #f8fafc;
          overflow: hidden;
          flex-shrink: 0;
          position: relative;
        }
        
        .mp-ms-item__logo-image {
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
          border-radius: 6px;
          transition: transform 0.2s ease;
        }
        
        /* Custom icon special style - ensure complete display */
        .mp-ms-item__logo-image[src*="data:image"] {
          object-fit: contain;
          object-position: center;
          max-width: 100%;
          max-height: 100%;
          background: transparent;
        }
        
        /* hover effect */
        .mp-ms-item:hover .mp-ms-item__logo-image {
          transform: scale(1.05);
        }
        
        /* Optimization for different image ratios */
        .mp-ms-item__logo-image {
          /* Make sure the image does not exceed the container */
          max-width: 100%;
          max-height: 100%;
          /* Keep aspect ratio */
          aspect-ratio: 1;
          /* Make sure the image is centered */
          display: block;
          margin: auto;
        }
        
        /* Special handling for non-square images */
        .mp-ms-item__logo-image:not([src*="data:image"]) {
          /* The default icon maintains its original style */
          aspect-ratio: unset;
        }
        
        /* Ensure custom icons are fully displayed within the container */
        .mp-ms-item__logo:has(.mp-ms-item__logo-image[src*="data:image"]) {
          background: #fff;
          border: 1px solid #e8e8e8;
        }
        
        .mp-ms-item__details {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .mp-ms-item__details-heading {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          width: 100%;
          min-width: 0;
        }
        
        .mp-ms-item__name {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #262626;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        
        .mp-ms-item__type {
          padding: 4px 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 12px;
          color: #64748b;
          font-weight: 500;
          white-space: nowrap;
        }
        
        .tags-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        
        .tags-list__tag {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          background: #f6ffed;
          border: 1px solid #b7eb8f;
          border-radius: 4px;
          font-size: 12px;
          color: #52c41a;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        
        .tags-list__tag:hover {
          background: #d9f7be;
          border-color: #95de64;
        }
        
        .tags-list__tag.not-active {
          background: #f5f5f5;
          border-color: #d9d9d9;
          color: #8c8c8c;
        }
        
        .tag__icon {
          width: 14px;
          height: 14px;
          flex-shrink: 0;
        }
        
        .tag__name {
          font-size: 12px;
          font-weight: 500;
        }
        
        /* Disable text selection in pop-up windows (except input boxes) */
        .modal-body,
        .modal-body * {
          user-select: none;
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
        }
        
        /* The input box in the pop-up window allows text selection */
        .modal-body input,
        .modal-body textarea,
        .modal-body [role="textbox"],
        .modal-body [data-input],
        .modal-body input[readonly] {
          user-select: text !important;
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
        }
        
        /* Responsive design */
        @media (max-width: 768px) {
          .mp-ms-item {
            padding: 12px;
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }
          
          .mp-ms-item__container {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
            width: 100%;
          }
          
          .mp-ms-item__details-heading {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }
          
          .mp-ms-item__right-elements {
            margin-right: 0;
            margin-bottom: 8px;
            align-self: flex-end;
          }

          .mp-ms-item__account-insights {
            margin-right: 0;
            width: 100%;
            justify-content: flex-start;
          }

          .mp-ms-item__account-insights-inner {
            justify-content: flex-start;
          }
        }
        
        /* Make sure the Add Configuration button retains its original style in dark mode */
        [data-add-config-button],
        [data-add-config-button] * {
          --primary: 240 5.9% 10% !important;
          --primary-foreground: 0 0% 98% !important;
        }
        
        .dark [data-add-config-button],
        .dark [data-add-config-button] * {
          --primary: 240 5.9% 10% !important;
          --primary-foreground: 0 0% 98% !important;
        }
        
        .dark [data-add-config-button][class*="bg-primary"],
        .dark [data-add-config-button] button[class*="bg-primary"] {
          background-color: hsl(240 5.9% 10%) !important;
          color: hsl(0 0% 98%) !important;
        }
        
        /* Ensure Role badge retains original style in dark mode - use higher priority selector */
        .dark .main-content-inner .role-badge,
        .dark .role-badge {
          background: #1f2937 !important;
          color: white !important;
        }
        
        .dark .main-content-inner .role-badge::before,
        .dark .role-badge::before {
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent) !important;
        }
        
        /* Ensure verification status badge retains original style in dark mode - use higher priority selector */
        .dark .main-content-inner .status-badge,
        .dark .status-badge {
          color: #ffffff !important;
        }
        
        .dark .main-content-inner .status-badge-active,
        .dark .status-badge-active {
          background: #52c41a !important;
          color: #ffffff !important;
        }
        
        .dark .main-content-inner .status-badge-unknown,
        .dark .status-badge-unknown {
          background: #4b5563 !important;
          color: #ffffff !important;
        }
        
        .dark .main-content-inner .status-badge-invalid,
        .dark .status-badge-invalid {
          background: #ff4d4f !important;
          color: #ffffff !important;
        }
        
        .dark .main-content-inner .status-badge-loading,
        .dark .status-badge-loading {
          background: #4b5563 !important;
          color: #ffffff !important;
        }
        
        .dark .main-content-inner .status-dot,
        .dark .status-dot {
          background: #ffffff !important;
        }
        
        .dark .main-content-inner .status-loading-spinner,
        .dark .status-loading-spinner {
          border-color: #ffffff !important;
          border-top-color: transparent !important;
        }
        
        /* Make sure all text and elements within the status badge are white */
        .dark .main-content-inner .status-badge *,
        .dark .status-badge * {
          color: #ffffff !important;
        }
        
        /* Make sure the Role label text is clearly visible in dark mode - use a higher priority selector */
        .dark .main-content-inner .info-label .label-text,
        .dark .info-label .label-text {
          color: rgb(34, 13, 78) !important;
        }
        
        /* Ensure that all text in the info-row retains its original color in dark mode */
        .dark .main-content-inner .info-row .value-text:not(.role-badge),
        .dark .info-row .value-text:not(.role-badge) {
          color: rgb(51, 51, 51) !important;
        }
        
        .dark .main-content-inner .info-row:hover .value-text:not(.role-badge),
        .dark .info-row:hover .value-text:not(.role-badge) {
          color: rgb(34, 13, 78) !important;
        }
        
        /* Make sure the text inside the Role badge is always white */
        .dark .main-content-inner .role-badge,
        .dark .role-badge {
          color: white !important;
        }
        
        .dark .main-content-inner .role-badge *,
        .dark .role-badge * {
          color: white !important;
        }
      `}</style>
      


      {/* Added configuration modal box */}
      <Modal
        title={`Add Configuration - ${selectedAccountType === 'PID' ? 'Ad Network' : 'Agency Account'}`}
        open={isAddModalVisible}
        onCancel={() => {
          setIsAddModalVisible(false);
          setEditingConfig(null);
          resetAddModalState();
        }}
        footer={null}
        style={{
          borderRadius: '8px'
        }}
        styles={{
          body: {
            padding: '24px',
            fontSize: '14px',
            lineHeight: '1.6',
            color: 'rgb(34, 13, 78)'
          }
        }}
        data-form-type="other"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-keeweb-ignore="true"
        data-chrome-autofill="false"
        data-browser-autofill="false"
        data-purpose="configuration"
        data-context="settings"
      >
        <div
          className="no-select"
          data-form-type="other"
          data-lpignore="true"
          data-1p-ignore="true"
          data-bwignore="true"
          data-keeweb-ignore="true"
          data-chrome-autofill="false"
          data-browser-autofill="false"
          data-purpose="configuration"
          data-context="settings"
        >
          {/* Input box component using CSS Grid layout */}
          <div className="account-modal-grid">



            {/* Account Name input box */}
            <div className="space-y-2 mb-4">
              <Input
                type="text"
                placeholder="Enter Your Account Name"
                value={formAccountName}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-keeweb-ignore="true"
                data-chrome-autofill="false"
                data-browser-autofill="false"
                data-purpose="configuration"
                data-context="settings"
                className={`account-modal-input ${formAccountNameError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormAccountName(value);
                  // Real-time verification (does not check for duplicates and avoids frequent prompts when typing)
                  const error = validateAccountName(value, false);
                  setFormAccountNameError(error);
                }}
                onBlur={(e) => {
                  // Complete verification when out of focus (including duplicate checks)
                  const error = validateAccountName(e.target.value, true);
                  setFormAccountNameError(error);
                }}
              />
              {formAccountNameError && (
                <p className="text-sm text-destructive mt-1">
                  {formAccountNameError}
                </p>
              )}
            </div>
          
            {/* API Token input box */}
            <div className="space-y-2 mb-4">
              <PasswordInput
                  className="account-modal-input"
                  placeholder="Enter Your API Token"
                  value={formApiToken}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                spellCheck={false}
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-keeweb-ignore="true"
                  data-chrome-autofill="false"
                  data-browser-autofill="false"
                  data-purpose="configuration"
                  data-context="settings"
                showPassword={apiTokenVisible}
                onTogglePassword={() => setApiTokenVisible(!apiTokenVisible)}
                error={formApiTokenError || undefined}
                  onChange={(e) => {
                  const value = e.target.value;
                  setFormApiToken(value);
                  // clear errors
                  if (formApiTokenError) {
                    setFormApiTokenError(null);
                  }
                  // Real-time verification
                  const error = validateApiToken(value);
                  if (error) {
                    setFormApiTokenError(error);
                    }
                  }}
                  onBlur={(e) => {
                  const error = validateApiToken(e.target.value);
                  setFormApiTokenError(error);
                }}
              />
              {formApiTokenError && (
                <p className="text-sm text-destructive mt-1">
                  {formApiTokenError}
                </p>
              )}
            </div>
          </div>
          
          {/* button area */}
                <div className="account-modal-footer">
            <Button
              variant="outline"
              className="account-modal-btn account-modal-btn--outline"
              disabled={configLoading}
                onClick={() => {
                  // Get form values ​​using state variables
                  const values = {
                    account_name: formAccountName,
                    api_token: formApiToken,
                    account_type: selectedAccountType
                  };
                  
                  console.log('提交时的表单值:', values);
                  handleAddEdit(values);
                }}
            >
              {configLoading ? 'Adding...' : 'Add'}
            </Button>
                </div>
        </div>
      </Modal>

      {/* Edit configuration modal box */}
      <Modal
        title="Edit Configuration"
        open={isEditModalVisible}
        onCancel={() => {
          setIsEditModalVisible(false);
          setEditingConfig(null);
          resetEditModalState();
        }}
        footer={null}
        style={{
          borderRadius: '8px'
        }}
        styles={{
          body: {
            padding: '24px',
            fontSize: '14px',
            lineHeight: '1.6',
            color: 'rgb(34, 13, 78)'
          }
        }}
        data-form-type="other"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-keeweb-ignore="true"
        data-chrome-autofill="false"
        data-browser-autofill="false"
        data-purpose="configuration"
        data-context="settings"
      >
        <div
          className="no-select"
          data-form-type="other"
          data-lpignore="true"
          data-1p-ignore="true"
          data-bwignore="true"
          data-keeweb-ignore="true"
          data-chrome-autofill="false"
          data-browser-autofill="false"
          data-purpose="configuration"
          data-context="settings"
        >
          {/* Input box component using CSS Grid layout */}
          <div className="account-modal-grid">

            {/* Account Name input box */}
            <div className="space-y-2 mb-4">
              <Input
                  className="account-modal-input"
                  type="text"
                  placeholder="Enter Your Account Name"
                  value={editFormAccountName}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-keeweb-ignore="true"
                  data-chrome-autofill="false"
                  data-browser-autofill="false"
                  data-purpose="configuration"
                  data-context="settings"
                onChange={(e) => setEditFormAccountName(e.target.value)}
                />
            </div>
          
            {/* API Token input box */}
            <div className="space-y-2 mb-4">
              <PasswordInput
                  className="account-modal-input"
                  placeholder="Enter Your API Token"
                  value={editFormApiToken}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-keeweb-ignore="true"
                  data-chrome-autofill="false"
                  data-browser-autofill="false"
                  data-purpose="configuration"
                  data-context="settings"
                showPassword={apiTokenVisible}
                onTogglePassword={() => setApiTokenVisible(!apiTokenVisible)}
                onChange={(e) => setEditFormApiToken(e.target.value)}
              />
            </div>

            {/* Custom icon upload area */}
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
              id="image-upload-input"
            />
            
            {/* Single container contains icon preview and information */}
            <div className="flex items-center gap-3 p-3 border border-gray-300 rounded-md bg-gray-50">
              {/* Icon preview area - click to change */}
              <div
                className="flex-shrink-0 w-16 h-16 border border-gray-300 rounded-md bg-white overflow-hidden cursor-pointer hover:border-gray-500 hover:shadow-md hover:bg-gray-50 transition-all duration-200"
                onClick={() => {
                  const input = document.getElementById('image-upload-input');
                  if (input) input.click();
                }}
              >
                {uploadedImage ? (
                  <img 
                    src={uploadedImage} 
                    alt="Custom Icon" 
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <RiImageAddLine className="w-6 h-6" />
                    </div>
                )}
              </div>
              
              {/* Information text area */}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-600 mb-1">
                  {uploadedImage ? 'Image Selected' : 'Click Icon & Select Image'}
                </div>
                {uploadedImage && (
                  <div className="text-xs text-gray-500 truncate">
                      {imageFile?.name || 'Custom Icon'}
                    </div>
                )}
                  </div>
              
              {/* Remove button - only shown when an image is selected */}
              {uploadedImage && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                  className="flex-shrink-0 px-3 py-1.5 text-xs text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 hover:border-gray-400 rounded transition-all duration-200"
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Error message */}
              {imageUploadError && (
              <div className="text-xs text-red-600 mt-2 px-2 py-1 bg-red-50 border border-red-200 rounded">
                  {imageUploadError}
                </div>
              )}
          </div>

          {/* button area */}
          <div className="account-modal-footer">
            <Button
              variant="outline"
              className="account-modal-btn account-modal-btn--outline"
              disabled={configLoading}
              onClick={() => {
                // Get form values ​​using state variables
                const values = {
                  account_name: editFormAccountName,
                  api_token: editFormApiToken,
                  account_type: selectedAccountType
                };
                console.log('编辑模式 - 提交时的表单值:', values);
                handleAddEdit(values);
              }}
            >
              {configLoading ? 'Updating...' : 'Update'}
            </Button>
                </div>
        </div>
      </Modal>

      {/* Edit data modal box */}
      <Modal
        title="Edit Profile"
        open={isProfileModalVisible}
        onCancel={() => {
          setIsProfileModalVisible(false);
          setProfileUsername('');
          setProfileUsernameError(null);
          setProfileLoading(false);
        }}
        footer={null}
        style={{
          borderRadius: '8px'
        }}
        styles={{
          body: {
            padding: '24px',
            fontSize: '14px',
            lineHeight: '1.6',
            color: 'rgb(34, 13, 78)'
          }
        }}
      >
        <div className="no-select" style={{ width: '100%' }}>
          {/* Username input box */}
          <div className="space-y-2 mb-5">
                <Input
                  type="text"
                  placeholder="New User Name"
                  readOnly
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-keeweb-ignore="true"
                  data-chrome-autofill="false"
                  data-browser-autofill="false"
                  data-purpose="profile-edit"
                  data-context="settings"
              value={profileUsername}
              className={`account-modal-input ${profileUsernameError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  onFocus={(e) => {
                    // Force it to text type, remove readonly, and allow user input
                    e.target.setAttribute('type', 'text');
                    e.target.removeAttribute('readonly');
                  }}
                  onChange={(e) => {
                const usernameValue = e.target.value;
                    
                    // Update state variables
                    setProfileUsername(usernameValue);
                    
                // clear error status
                if (profileUsernameError) {
                  setProfileUsernameError(null);
                }
                
                // Real-time verification
                const trimmedValue = usernameValue.trim();
                if (trimmedValue && userProfile && trimmedValue === String(userProfile.username).trim()) {
                  setProfileUsernameError('New username cannot be the same as the current username');
                } else if (trimmedValue) {
                  setProfileUsernameError(null);
                    }
                  }}
                  onBlur={(e) => {
                    // Keep the text type, restore readonly, and prevent Chrome from recognizing it
                    e.target.setAttribute('type', 'text');
                    e.target.setAttribute('readonly', 'readonly');
                    
                      const inputValue = e.target.value.trim();
                      const isCurrentUsername = userProfile && inputValue === String(userProfile.username).trim();
                      const isEmpty = !inputValue;
                      
                if (isEmpty) {
                  setProfileUsernameError('Username cannot be empty');
                } else if (isCurrentUsername) {
                  setProfileUsernameError('New username cannot be the same as the current username');
                      } else {
                  setProfileUsernameError(null);
                    }
                  }}
                />
            {/* Error message */}
            {profileUsernameError && (
              <p className="text-sm text-destructive mt-1">
                {profileUsernameError}
              </p>
            )}
              </div>
          
          {/* button area */}
          <div className="account-modal-footer">
            <Button 
              variant="outline"
              className="account-modal-btn account-modal-btn--outline"
              onClick={() => {
              setIsProfileModalVisible(false);
                setProfileUsername('');
                setProfileUsernameError(null);
              setProfileLoading(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              className="account-modal-btn account-modal-btn--primary"
              disabled={profileLoading}
              onClick={handleEditProfile}
            >
              {profileLoading ? 'Updating...' : 'Update'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Security Settings modal box */}
      <Modal
        title="Security Settings"
        open={isPasswordModalVisible}
        onCancel={() => {
          setIsPasswordModalVisible(false);
          // Reset all password fields
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setPasswordErrors({});
          setPasswordError('');
          setPasswordLoading(false);
          // Reset current password verification status
          setCurrentPasswordValid(null);
          // Reset tab
          setSecuritySettingsTab('password');
          // Reset 2FA related status
          setQrCode(null);
          setTotpCode('');
          setSetupStep('switch');
          setVerifying(false);
          setQrLoading(false);
        }}
        footer={null}
        style={{
          borderRadius: '8px'
        }}
        styles={{
          body: {
            padding: '24px',
            fontSize: '14px',
            lineHeight: '1.6',
            color: 'rgb(34, 13, 78)'
          }
        }}
      >
        <div className="no-select" style={{ width: '100%' }}>
          {/* Breadcrumb Navigation */}
          <Breadcrumb className="account-security-tabs">
            <BreadcrumbList>
              <BreadcrumbItem>
                {securitySettingsTab === 'password' ? (
                  <BreadcrumbPage className="account-security-tab-page">Change Password</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    onClick={(e) => {
                      e.preventDefault();
                      setSecuritySettingsTab('password');
                    }}
                    className="account-security-tab-link cursor-pointer"
                  >
                    Change Password
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {securitySettingsTab === '2fa' ? (
                  <BreadcrumbPage className="account-security-tab-page">2FA Settings</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    onClick={(e) => {
                      e.preventDefault();
                      setSecuritySettingsTab('2fa');
                    }}
                    className="account-security-tab-link cursor-pointer"
                  >
                    2FA Settings
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Change Password module */}
          {securitySettingsTab === 'password' && (
            <div className="account-security-panel">
          {/* Current password input box */}
          <div className="space-y-2 mb-5">
            <PasswordInput
              className="account-modal-input"
                  placeholder="Enter Your Current Password"
                  readOnly
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-keeweb-ignore="true"
                  data-chrome-autofill="false"
                  data-browser-autofill="false"
                  data-purpose="password-change"
                  data-context="settings"
              value={currentPassword}
              showPassword={currentPasswordVisible}
              onTogglePassword={() => setCurrentPasswordVisible(!currentPasswordVisible)}
              error={passwordErrors.currentPassword}
                  onFocus={(e) => {
                    e.target.setAttribute('type', 'text');
                    e.target.removeAttribute('readonly');
                  }}
                  onChange={(e) => {
                const value = e.target.value;
                setCurrentPassword(value);
                if (passwordErrors.currentPassword) {
                  setPasswordErrors(prev => ({ ...prev, currentPassword: undefined }));
                    }
                  }}
                  onBlur={(e) => {
                    e.target.setAttribute('type', 'text');
                    e.target.setAttribute('readonly', 'readonly');
                    
                      const inputValue = e.target.value;
                      const isEmpty = !inputValue || !inputValue.trim();
                      const isTooShort = inputValue && inputValue.length < 6;
                      
                if (isEmpty) {
                  setPasswordErrors(prev => ({ ...prev, currentPassword: 'Current password cannot be empty' }));
                } else if (isTooShort) {
                  setPasswordErrors(prev => ({ ...prev, currentPassword: 'Password must be at least 6 characters' }));
                      } else {
                  setPasswordErrors(prev => ({ ...prev, currentPassword: undefined }));
                    }
                  }}
                                  />
            {passwordErrors.currentPassword && (
              <p className="text-sm text-destructive mt-1">
                {passwordErrors.currentPassword}
              </p>
            )}
                </div>
          
          {/* New password input box */}
          <div className="space-y-2 mb-5">
            <PasswordInput
              className="account-modal-input"
                  placeholder="Enter Your New Password"
                  readOnly
                  autoComplete="off"
              autoCorrect="off" 
              autoCapitalize="off" 
              spellCheck={false}
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-keeweb-ignore="true"
                  data-chrome-autofill="false"
                  data-browser-autofill="false"
                  data-purpose="password-change"
                  data-context="settings"
              value={newPassword}
              showPassword={newPasswordVisible}
              onTogglePassword={() => setNewPasswordVisible(!newPasswordVisible)}
              error={passwordErrors.newPassword}
              onFocus={(e) => {
                e.target.setAttribute('type', 'text');
                e.target.removeAttribute('readonly');
              }}
                                onChange={(e) => {
                    const newPasswordValue = e.target.value;
                setNewPassword(newPasswordValue);
                
                // clear errors
                if (passwordErrors.newPassword) {
                  setPasswordErrors(prev => ({ ...prev, newPassword: undefined }));
                    }
                    
                    // Verify in real time whether the new password and the confirmed password are consistent
                if (newPasswordValue && confirmPassword) {
                  if (newPasswordValue !== confirmPassword) {
                    setPasswordErrors(prev => ({
                      ...prev,
                      newPassword: 'New password and confirm password do not match',
                      confirmPassword: 'New password and confirm password do not match'
                    }));
                      } else {
                    setPasswordErrors(prev => ({
                      ...prev,
                      newPassword: undefined,
                      confirmPassword: undefined
                    }));
                  }
                    }
                  }}
                  onBlur={(e) => {
                    e.target.setAttribute('type', 'text');
                    e.target.setAttribute('readonly', 'readonly');
                    
                      const inputValue = e.target.value;
                      const isEmpty = !inputValue || !inputValue.trim();
                      const isTooShort = inputValue && inputValue.length < 6;
                      
                if (isEmpty) {
                  setPasswordErrors(prev => ({ ...prev, newPassword: 'New password cannot be empty' }));
                } else if (isTooShort) {
                  setPasswordErrors(prev => ({ ...prev, newPassword: 'Password must be at least 6 characters' }));
                } else if (inputValue && confirmPassword && inputValue !== confirmPassword) {
                  setPasswordErrors(prev => ({
                    ...prev,
                    newPassword: 'New password and confirm password do not match'
                  }));
                      } else {
                  setPasswordErrors(prev => ({ ...prev, newPassword: undefined }));
                    }
                  }}
                  />
            {passwordErrors.newPassword && (
              <p className="text-sm text-destructive mt-1">
                {passwordErrors.newPassword}
              </p>
            )}
                </div>
          
          {/* Confirm password input box */}
          <div className="space-y-2 mb-5">
            <PasswordInput
              className="account-modal-input"
                  placeholder="Confirm Your New Password"
                  readOnly
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-keeweb-ignore="true"
                  data-chrome-autofill="false"
                  data-browser-autofill="false"
                  data-purpose="password-change"
                  data-context="settings"
              value={confirmPassword}
              showPassword={confirmPasswordVisible}
              onTogglePassword={() => setConfirmPasswordVisible(!confirmPasswordVisible)}
              error={passwordErrors.confirmPassword}
              onFocus={(e) => {
                e.target.setAttribute('type', 'text');
                e.target.removeAttribute('readonly');
                  }}
                  onChange={(e) => {
                    const confirmPasswordValue = e.target.value;
                setConfirmPassword(confirmPasswordValue);
                
                // clear errors
                if (passwordErrors.confirmPassword) {
                  setPasswordErrors(prev => ({ ...prev, confirmPassword: undefined }));
                    }
                    
                    // Verify in real time whether the new password and the confirmed password are consistent
                if (confirmPasswordValue && newPassword) {
                  if (confirmPasswordValue !== newPassword) {
                    setPasswordErrors(prev => ({
                      ...prev,
                      newPassword: 'New password and confirm password do not match',
                      confirmPassword: 'New password and confirm password do not match'
                    }));
                      } else {
                    setPasswordErrors(prev => ({
                      ...prev,
                      newPassword: undefined,
                      confirmPassword: undefined
                    }));
                  }
                    }
                  }}
                  onBlur={(e) => {
                    e.target.setAttribute('type', 'text');
                    e.target.setAttribute('readonly', 'readonly');
                    
                      const inputValue = e.target.value;
                      const isEmpty = !inputValue || !inputValue.trim();
                      const isTooShort = inputValue && inputValue.length < 6;
                      
                if (isEmpty) {
                  setPasswordErrors(prev => ({ ...prev, confirmPassword: 'Confirm password cannot be empty' }));
                } else if (isTooShort) {
                  setPasswordErrors(prev => ({ ...prev, confirmPassword: 'Password must be at least 6 characters' }));
                } else if (inputValue && newPassword && inputValue !== newPassword) {
                  setPasswordErrors(prev => ({
                    ...prev,
                    confirmPassword: 'New password and confirm password do not match'
                  }));
                      } else {
                  setPasswordErrors(prev => ({ ...prev, confirmPassword: undefined }));
                    }
                  }}
                                  />
            {passwordErrors.confirmPassword && (
              <p className="text-sm text-destructive mt-1">
                {passwordErrors.confirmPassword}
              </p>
            )}
              </div>
          
          {/* button area */}
                <div className="account-modal-footer">
                  <Button
              variant="outline"
              className="account-modal-btn account-modal-btn--outline"
              disabled={passwordLoading}
              onClick={handleChangePassword}
            >
              {passwordLoading ? 'Updating...' : 'Update Password'}
                  </Button>
                </div>
            </div>
          )}

          {/* 2FA Settings module */}
          {securitySettingsTab === '2fa' && (
            <div className="account-security-panel space-y-4">
              <div className="text-sm text-muted-foreground mb-4">
                Manage your two-factor authentication settings. Enable 2FA to add an extra layer of security to your account.
              </div>
              
              {/* 2FA switch */}
              <div className="account-security-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-semibold text-sm mb-1">Two-Factor Authentication</div>
                    <div className="text-xs text-muted-foreground">
                      {twoFactorEnabled ? 'Enabled - Your account is protected with 2FA' : 'Disabled - Enable to add extra security'}
                    </div>
                  </div>
                  <Switch
                    checked={twoFactorEnabled}
                    onCheckedChange={async (checked) => {
                      if (checked) {
                        // Enable 2FA - Generate QR code
                        setQrLoading(true);
                        try {
                          const response = await axiosInstance.post('/api/auth/2fa/setup');
                          const data = response.data as { success?: boolean; qr_code?: string; error?: string };
                          if (data.success) {
                            setQrCode(data.qr_code || null);
                            setSetupStep('qr');
                            setTwoFactorEnabled(false); // Do not enable it now, wait until the verification is passed and then enable it
                          } else {
                            message.error(data.error || 'Failed to generate QR code');
                          }
                        } catch (error: any) {
                          message.error(error.response?.data?.error || 'Failed to generate QR code');
                        } finally {
                          setQrLoading(false);
                        }
                      } else {
                        // Disable 2FA
                        try {
                          const response = await axiosInstance.post('/api/auth/2fa/disable');
                          const data = response.data as { success?: boolean; error?: string };
                          if (data.success) {
                            setTwoFactorEnabled(false);
                            setQrCode(null);
                            setTotpCode('');
                            setSetupStep('switch');
                            updateUserProfile({ twoFactorEnabled: false });
                            message.success('2FA disabled successfully');
                            refreshUserProfile();
                          } else {
                            message.error(data.error || 'Failed to disable 2FA');
                          }
                        } catch (error: any) {
                          message.error(error.response?.data?.error || 'Failed to disable 2FA');
                        }
                      }
                    }}
                    disabled={qrLoading || verifying}
                  />
                </div>
              </div>

              {/* QR code display */}
              {setupStep === 'qr' && qrCode && (
                <div className="account-security-card account-security-card--white p-4">
                  <div className="text-center mb-4">
                    <div className="font-semibold text-sm mb-2">Scan QR Code</div>
                    <div className="text-xs text-muted-foreground mb-4">
                      Scan this QR code with Google Authenticator or any TOTP app
                    </div>
                    <div className="flex justify-center mb-4">
                      <img 
                        src={qrCode} 
                        alt="2FA QR Code" 
                        className="w-48 h-48 border border-gray-200 rounded-lg"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSetupStep('verify');
                      }}
                      className="account-modal-btn account-modal-btn--outline mb-2"
                    >
                      I've scanned the QR code
                    </Button>
                  </div>
                </div>
              )}

              {/* TOTP verification */}
              {setupStep === 'verify' && (
                <div className="account-security-card account-security-card--white p-4">
                  <div className="text-center mb-4">
                    <div className="font-semibold text-sm mb-2">Enter Verification Code</div>
                    <div className="text-xs text-muted-foreground mb-4">
                      Enter the 6-digit code from your authenticator app
                    </div>
                    <OTPInputComponent
                      length={6}
                      value={totpCode}
                      onChange={setTotpCode}
                    />
                    <Button
                      variant="default"
                      onClick={async () => {
                        if (totpCode.length !== 6) {
                          message.error('Please enter a 6-digit code');
                          return;
                        }
                        setVerifying(true);
                        try {
                          const response = await axiosInstance.post('/api/auth/2fa/verify-setup', {
                            totp_code: totpCode
                          });
                          const data = response.data as { success?: boolean; error?: string };
                          if (data.success) {
                            setTwoFactorEnabled(true);
                            setSetupStep('switch');
                            setQrCode(null);
                            setTotpCode('');
                            updateUserProfile({ twoFactorEnabled: true });
                            message.success('2FA enabled successfully');
                            refreshUserProfile();
                          } else {
                            message.error(data.error || 'Invalid verification code');
                          }
                        } catch (error: any) {
                          message.error(error.response?.data?.error || 'Verification failed');
                        } finally {
                          setVerifying(false);
                        }
                      }}
                      disabled={totpCode.length !== 6 || verifying}
                      className="account-modal-btn account-modal-btn--primary w-full"
                    >
                      {verifying ? 'Verifying...' : 'Verify and Enable'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSetupStep('qr');
                        setTotpCode('');
                      }}
                      className="account-modal-btn account-modal-btn--outline mt-2 w-full"
                    >
                      Back to QR Code
                    </Button>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </Modal>

      {/* Avatar crop modal box */}
      <Modal
        title="Crop Avatar"
        open={cropModalVisible}
        onCancel={() => {
          setCropModalVisible(false);
          setSelectedImage(null);
          setAvatarSubmitLoading(false);
        }}
        width={400}
        footer={
          <Button
            variant="default"
            disabled={
              avatarSubmitLoading ||
              !completedCrop ||
              !completedCrop.width ||
              !completedCrop.height
            }
            onClick={() => void handleCropComplete()}
            className={
              avatarSubmitLoading ? 'min-w-[120px] !opacity-100' : 'min-w-[120px]'
            }
          >
            {avatarSubmitLoading ? (
              <span className="inline-flex items-center gap-2">
                <RiLoader4Line className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                <span>Submitting…</span>
              </span>
            ) : (
              'Submit'
            )}
          </Button>
        }
      >
        <div style={{ maxWidth: '100%', maxHeight: '400px', overflow: 'hidden' }}>
          {selectedImage && (
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={1}
              circularCrop
            >
              <img
                ref={imgRef}
                src={selectedImage}
                onLoad={onImageLoad}
                style={{ maxWidth: '100%' }}
                alt="Crop preview"
              />
            </ReactCrop>
          )}
        </div>
      </Modal>

      {/* Remove configuration modal box - use unified Modal component */}
      <Modal
        open={isDeleteModalVisible}
        title="Confirm Delete"
        onCancel={() => {
          setIsDeleteModalVisible(false);
          setDeletingConfig(null);
        }}
        footer={null}
        width={520}
      >
        <div className="space-y-4">
          {/* Account Name display box */}
          <div>
            <label className="account-delete-field-label">
              Account Name
            </label>
            <input
              type="text"
              value={deletingConfig?.account_name || ''}
              disabled
              readOnly
              className="account-delete-field cursor-not-allowed"
            />
          </div>

          {/* Account Type display box */}
          <div>
            <label className="account-delete-field-label">
              Account Type
            </label>
            <input
              type="text"
                  value={deletingConfig?.account_type === 'PRT' ? 'Agency Account | PRT' : 'Ad Network Account | PID'}
              disabled
              readOnly
              className="account-delete-field cursor-not-allowed"
            />
          </div>

          {/* API Token display box */}
          <div>
            <label className="account-delete-field-label">
              API Token
            </label>
            <input
              type="text"
              value={deletingConfig ? (accountTokens[deletingConfig.id] ? displayPartialToken(accountTokens[deletingConfig.id]) : 'Loading...') : ''}
              disabled
              readOnly
              className="account-delete-field cursor-not-allowed"
            />
          </div>

              {/* warning message */}
          <div className="account-delete-warning">
            <p>
                Are you sure you want to delete this account configuration? This action cannot be undone.
            </p>
              </div>

              {/* button area */}
          <div className="account-delete-footer">
            <Button
              variant="outline"
              className="account-modal-btn account-modal-btn--outline"
            onClick={handleDelete}
            disabled={!!deletingConfig && deletingIds.includes(deletingConfig.id)}
          >
            {!!deletingConfig && deletingIds.includes(deletingConfig.id) ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                      Deleting...
              </span>
            ) : (
              'Delete'
            )}
            </Button>
        </div>
      </div>
      </Modal>

      {/* Verification result pop-up window */}
      <Modal
        open={validateModal.visible}
        title={getValidateTitle(validateModal.status || '')}
        footer={null}
        onCancel={() => {
          setValidateModal({ ...validateModal, visible: false });
          setCurrentValidatingRecord(null);
        }}
      >
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{validateModal.content}</pre>
      </Modal>

      {showAccountTypeMenu &&
        accountTypeMenuPlacement &&
        createPortal(
          <div
            className={`account-type-menu account-type-menu--portal${accountTypeMenuShowClass ? ' show' : ''}`}
            style={{
              top: accountTypeMenuPlacement.top,
              left: accountTypeMenuPlacement.left,
              width: accountTypeMenuPlacement.width,
            }}
            aria-hidden={false}
          >
            <div className="menu-container">
              <div className="menu-item" onClick={() => handleMenuItemClick('PID')}>
                <RiSettings6Line
                  style={{
                    width: '20px',
                    height: '20px',
                    flexShrink: 0,
                    marginRight: '12px',
                    color: 'rgb(34, 13, 78)',
                  }}
                />
                <div className="menu-text">Ad Network</div>
              </div>
              <div className="menu-item" onClick={() => handleMenuItemClick('PRT')}>
                <RiShakeHandsLine
                  style={{
                    width: '20px',
                    height: '20px',
                    flexShrink: 0,
                    marginRight: '12px',
                    color: 'rgb(34, 13, 78)',
                  }}
                />
                <div className="menu-text">Agency Account</div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default Account; 