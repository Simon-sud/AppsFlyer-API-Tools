import React, { useState, useEffect, useRef, CSSProperties } from 'react';
import { Card, Avatar, Descriptions, Button, Space, Form, Input, Table, message, Modal, Select, Upload, Spin } from 'antd';
import { UserOutlined, EditOutlined, KeyOutlined, DeleteOutlined, PlusOutlined, UploadOutlined, EyeOutlined, LogoutOutlined, ReloadOutlined } from '@ant-design/icons';
import { useLanguage } from '../contexts/LanguageContext';
import type { UploadProps } from 'antd';
import type { RcFile } from 'antd/es/upload/interface';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAccount } from '../contexts/AccountContext';
import { useUser } from '../contexts/UserContext';
import { axiosInstance } from '../services/api';
import './Account.css';

interface AccountConfig {
  id: string;
  account_name: string;
  account_type: 'PID' | 'PRT';
  is_default: boolean;
  api_token?: string;
  validate?: any; // 兼容后端返回的 validate 字段
}

interface UserProfile {
  username: string;
  email: string;
  role: string;
  lastLogin: string;
  avatar?: string;
}

const Account: React.FC = () => {
  const { translations } = useLanguage();
  const { currentUser } = useAuth();
  const { userProfile, loading: userLoading, refreshUserProfile, updateUserProfile } = useUser();
  const { accountConfigs, loading: accountLoading, refreshAccountConfigs } = useAccount();
  const [localAccountConfigs, setLocalAccountConfigs] = useState<AccountConfig[]>(accountConfigs);
  useEffect(() => { setLocalAccountConfigs(accountConfigs); }, [accountConfigs]);
  const [form] = Form.useForm();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AccountConfig | null>(null);
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [deletingConfig, setDeletingConfig] = useState<AccountConfig | null>(null);
  const navigate = useNavigate();
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [eyeStates, setEyeStates] = useState<Record<string, boolean>>({});
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [validateLoading, setValidateLoading] = useState<Record<string, boolean>>({});
  const [hoveredValidateId, setHoveredValidateId] = useState<string | null>(null);
  const [validateModal, setValidateModal] = useState<{ visible: boolean, content: string, status: string | null }>({ visible: false, content: '', status: null });
  const [validateModalLoading, setValidateModalLoading] = useState(false);
  const [currentValidatingRecord, setCurrentValidatingRecord] = useState<AccountConfig | null>(null);
  
  // Account Type选择器状态
  const [accountTypeSelectorVisible, setAccountTypeSelectorVisible] = useState(false);
  const [accountTypeDropdownPosition, setAccountTypeDropdownPosition] = useState({ top: 0, left: 0 });
  
  // 本地缓存 key
  const VALIDATE_STATUS_CACHE_KEY = 'account_validate_status';

  // 初始化 validateStatus，优先用 localStorage
  const [validateStatus, setValidateStatus] = useState<Record<string, { status: string | null, text: string }>>(() => {
    const cache = localStorage.getItem(VALIDATE_STATUS_CACHE_KEY);
    return cache ? JSON.parse(cache) : {};
  });

  // 页面首次加载/刷新时，用数据库 accountConfigs 内容覆盖本地缓存
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

  // 更新 validateStatus 并同步 localStorage
  const updateValidateStatus = (updater: (prev: typeof validateStatus) => typeof validateStatus) => {
    setValidateStatus(prev => {
      const next = updater(prev);
      localStorage.setItem(VALIDATE_STATUS_CACHE_KEY, JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    // 验证完成后，清除hover，避免UI变大
    setHoveredValidateId(null);
  }, [validateStatus]);

  // 处理点击外部关闭Account Type选择器
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-account-type-selector]')) {
        setAccountTypeSelectorVisible(false);
      }
    };

    if (accountTypeSelectorVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [accountTypeSelectorVisible]);

  const usernameValue = String(profileForm.getFieldValue('username') || '').trim();
  const isProfileUnchanged = !!userProfile && usernameValue === String(userProfile.username).trim();

  // 处理添加/编辑配置
  const handleAddEdit = async (values: any) => {
    setConfigLoading(true);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token) {
        navigate('/login');
        setConfigLoading(false);
        return;
      }
      if (editingConfig) {
        // 编辑现有配置
        const response = await axiosInstance.put(`/api/auth/account-configs/${editingConfig.id}`, {
          account_name: values.account_name,
          account_type: values.account_type,
          api_token: encryptToken(values.api_token)
        });
        if (response.status !== 200) {
          throw new Error('Failed to update account config');
        }
        // 局部更新本地配置
        setLocalAccountConfigs(prev => prev.map(cfg => cfg.id === editingConfig.id ? { ...cfg, account_name: values.account_name, account_type: values.account_type, api_token: encryptToken(values.api_token) } : cfg));
        message.success(translations.account.configUpdated);
      } else {
        // 添加新配置
        const response = await axiosInstance.post('/api/auth/account-configs', {
          account_name: values.account_name,
          account_type: values.account_type,
          api_token: encryptToken(values.api_token)
        });
        if (response.status !== 200 && response.status !== 201) {
          throw new Error('Failed to add account config');
        }
        // 获取新配置ID
        const newConfig = response.data as { id: string };
        setLocalAccountConfigs(prev => [...prev, { id: newConfig.id, account_name: values.account_name, account_type: values.account_type, api_token: encryptToken(values.api_token), is_default: false }]);
        message.success(translations.account.configAdded);
      }
      // 新增/编辑后强制刷新全局配置并同步本地
      await refreshAccountConfigs(true);
      setLocalAccountConfigs(accountConfigs => [...accountConfigs]);
      setIsModalVisible(false);
      form.resetFields();
      setEditingConfig(null);
    } catch (error) {
      console.error('Error saving account config:', error);
      message.error(error instanceof Error ? error.message : '保存配置失败');
    }
    setConfigLoading(false);
  };

  // 处理编辑资料
  const handleEditProfile = async (values: any) => {
    setProfileLoading(true);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token) {
        message.error('请先登录');
        setProfileLoading(false);
        return;
      }
      const response = await axiosInstance.post('/api/auth/update-profile', {
        username: values.username
      });
      if (response.status === 200) {
        updateUserProfile({ username: values.username });
        message.success(translations.account.profileUpdated);
        setIsProfileModalVisible(false);
        profileForm.resetFields();
      } else {
        const data = response.data as { message?: string };
        message.error(data.message || '更新资料失败');
      }
    } catch (error) {
      message.error('更新资料失败');
    }
    setProfileLoading(false);
  };

  // 处理修改密码
  const handleChangePassword = async (values: any) => {
    setPasswordError('');
    if (values.newPassword !== values.confirmPassword) {
      message.error(translations.account.passwordMismatch);
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
      const response = await axiosInstance.post('/api/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword
      });
      const data = response.data as { message?: string };
      if (response.status !== 200) {
        // 新旧密码相同的特殊处理
        if (data.message && data.message.includes('New password cannot be the same as the old password')) {
          setPasswordError(translations.account.passwordSameError || data.message);
        } else {
          message.error(data.message || '修改密码失败');
      }
        setPasswordLoading(false);
        return;
      }
      message.success(translations.account.passwordChanged);
      setIsPasswordModalVisible(false);
      passwordForm.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '修改密码失败');
    }
    setPasswordLoading(false);
  };

  // 处理删除配置
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
      message.success(translations.account.configDeleted);
      // 删除后强制刷新全局配置并同步本地
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

  // 计算Account Type选择器下拉菜单位置
  const calculateAccountTypeDropdownPosition = () => {
    const accountTypeSelector = document.querySelector('[data-account-type-selector]') as HTMLElement;
    if (accountTypeSelector) {
      const rect = accountTypeSelector.getBoundingClientRect();
      setAccountTypeDropdownPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX
      });
    }
  };

  // 简单的加密函数
  const encryptToken = (token: string): string => {
    try {
      return btoa(encodeURIComponent(token));
    } catch (error) {
      console.error('加密失败:', error);
      return token;
    }
  };

  // 新增 base64 检查函数
  function isBase64(str: string) {
    if (!str || typeof str !== 'string') return false;
    // base64 字符串长度必须为4的倍数
    if (str.length % 4 !== 0) return false;
    // 只允许 base64 字符
    if (!/^[A-Za-z0-9+/=]+$/.test(str)) return false;
    try {
      return btoa(atob(str)) === str;
    } catch (err) {
      return false;
    }
  }

  // 简单的解密函数
  const decryptToken = (encryptedToken: string): string => {
    try {
      if (!isBase64(encryptedToken)) {
        // 直接返回明文，不输出任何警告
        return encryptedToken;
      }
      return decodeURIComponent(atob(encryptedToken));
    } catch (error) {
      console.error('解密失败:', error);
      return encryptedToken;
    }
  };

  // 修改 displayPartialToken 函数
  const displayPartialToken = (token: string | undefined): string => {
    if (!token) return '';
    try {
      const decrypted = decryptToken(token);
      // 限制显示长度为20个字符
      const maxLength = 20;
      if (decrypted.length <= maxLength) {
        return decrypted;
      }
      // 使用星号替换中间部分，保持总长度为20
      const prefix = decrypted.slice(0, 4);
      const suffix = decrypted.slice(-4);
      const maskedPart = '*'.repeat(maxLength - 8); // 8 = 4(prefix) + 4(suffix)
      return `${prefix}${maskedPart}${suffix}`;
    } catch (error) {
      console.error('显示token失败:', error);
      return token;
    }
  };

  const columns = [
    {
      title: translations.account.accountName,
      dataIndex: 'account_name',
      key: 'account_name',
      width: '18%',
      align: 'center' as const,
    },
    {
      title: translations.account.accountType,
      dataIndex: 'account_type',
      key: 'account_type',
      width: '20%',
      align: 'center' as const,
    },
    {
      title: translations.account.apiToken,
      dataIndex: 'api_token',
      key: 'api_token',
      width: '30%',
      align: 'center' as const,
      render: (text: string) => displayPartialToken(text),
    },
    {
      title: translations.account.actions,
      key: 'action',
      width: '18%',
      align: 'center' as const,
      render: (_: any, record: AccountConfig) => {
        const isDefaultConfig = record.is_default;
        return (
          <Space size="middle">
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => {
                setEditingConfig(record);
                form.setFieldsValue({
                  ...record,
                  api_token: record.api_token ? decryptToken(record.api_token) : '',
                });
                setIsModalVisible(true);
              }}
            />
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              loading={deletingIds.includes(record.id)}
              onClick={() => {
                setDeletingConfig(record);
                setIsDeleteModalVisible(true);
              }}
              disabled={isDefaultConfig}
              style={{ 
                color: isDefaultConfig ? '#d9d9d9' : undefined,
                cursor: isDefaultConfig ? 'not-allowed' : 'pointer'
              }}
            />
          </Space>
        );
      },
    },
    {
      title: translations.account.validate,
      key: 'validate',
      width: '14%',
      align: 'center' as const,
      render: (_: any, record: AccountConfig) => {
        const loading = validateLoading[record.id];
        const statusObj = validateStatus[record.id];
        const isHovered = hoveredValidateId === record.id;
        if (loading) {
          return <Spin size="small" />;
        }
        if (statusObj && statusObj.status) {
          let color = statusObj.status === 'Active' ? '#52c41a' : '#ff4d4f';
          const style: CSSProperties = {
            color,
            fontWeight: 500,
            cursor: 'pointer',
            userSelect: 'none',
            fontSize: 13,
            boxShadow: isHovered ? `0 1px 4px ${color}22` : undefined,
            borderRadius: 6,
            padding: isHovered ? '2px 8px' : '0 4px',
            background: isHovered ? '#f6ffed' : undefined,
            transition: 'all 0.15s cubic-bezier(.4,1.2,.6,1)',
            display: 'inline-flex',
            alignItems: 'center',
            lineHeight: 1.2,
            transform: isHovered ? 'scale(1.12)' : 'none',
          };
          return (
            <span
              style={style}
              onClick={() => handleValidate(record)}
              onMouseEnter={() => setHoveredValidateId(record.id)}
              onMouseLeave={() => setHoveredValidateId(null)}
            >
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color, marginRight: 6, verticalAlign: 'middle', boxShadow: isHovered ? `0 0 4px ${color}` : undefined, transition: 'all 0.15s cubic-bezier(.4,1.2,.6,1)', transform: isHovered ? 'scale(1.18)' : 'none' }}></span>{statusObj.status}
            </span>
          );
        }
        // 验证按钮未执行时，悬浮有高亮和pointer，风格参考Action列
        const btnStyle: CSSProperties = {
          color: isHovered ? '#0958d9' : '#1677ff',
          background: isHovered ? '#e6f4ff' : undefined,
          borderRadius: 4,
          cursor: 'pointer',
          userSelect: 'none',
          padding: '0 6px',
          fontSize: 13,
          fontWeight: 500,
          transition: 'all 0.15s',
        };
        return (
          <span
            style={btnStyle}
            onClick={() => handleValidate(record)}
            onMouseEnter={() => setHoveredValidateId(record.id)}
            onMouseLeave={() => setHoveredValidateId(null)}
          >
            {translations.account.verify}
          </span>
        );
      },
    },
  ];

  // 处理图片选择
  const handleImageSelect = (file: RcFile) => {
    // 验证文件类型和大小
    const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png';
    if (!isJpgOrPng) {
      message.error(translations.account.avatarFormatError);
      return false;
    }
    const isLt2M = file.size / 1024 / 1024 < 2;
    if (!isLt2M) {
      message.error(translations.account.avatarSizeError);
      return false;
    }

    try {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setSelectedImage(result);
        setCropModalVisible(true);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      message.error('图片读取失败');
    }
    return false;
  };

  // 处理图片加载
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

  // 处理裁剪完成
  const handleCropComplete = async () => {
    if (!imgRef.current || !completedCrop) return;
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
      // 压缩图片质量
      const croppedImage = canvas.toDataURL('image/jpeg', 0.8);
      const response = await axiosInstance.post('/api/auth/update-avatar', {
        avatar: croppedImage
      });
      const data = response.data as { message?: string };
      if (response.status === 200) {
        await refreshUserProfile();
        setCropModalVisible(false);
        setSelectedImage(null);
        message.success(translations.account.avatarUploadSuccess);
      } else {
        message.error(data.message || translations.account.avatarUploadError);
      }
    } catch (error) {
      message.error(translations.account.avatarUploadError);
    }
  };

  // 刷新验证函数
  const handleRefreshValidate = async () => {
    console.log('点击了重新验证按钮', currentValidatingRecord);
    if (!currentValidatingRecord) {
      setValidateModal({
        visible: true,
        content: '当前没有可用的账户配置，无法重新验证。',
        status: 'Failed'
      });
      return;
    }
    setValidateModalLoading(true);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const response = await axiosInstance.post(`/api/account-configs/${currentValidatingRecord.id}/validate`);
      const data = response.data as { validate?: any };
      let status: string | null = null;
      if (data.validate && Array.isArray(data.validate.users) && data.validate.users.length > 0) {
        status = 'Active';
      } else {
        status = 'Failed';
      }
      const text = typeof data.validate === 'string' ? data.validate : JSON.stringify(data.validate, null, 2);
      updateValidateStatus(prev => ({
        ...prev,
        [currentValidatingRecord.id]: {
          status,
          text
        }
      }));
      setValidateModal({
        visible: true,
        content: text,
        status
      });
    } catch (error) {
      const errorText = String(error);
      updateValidateStatus(prev => ({
        ...prev,
        [currentValidatingRecord.id]: {
          status: 'Failed',
          text: errorText
        }
      }));
      setValidateModal({
        visible: true,
        content: errorText,
        status: 'Failed'
      });
    } finally {
      setValidateModalLoading(false);
    }
  };

  const handleValidate = async (record: AccountConfig) => {
    setCurrentValidatingRecord(record);
    const current = validateStatus[record.id];
    // 如果已经有结果，直接弹窗
    if (current && current.status === 'Active') {
      setValidateModal({ visible: true, content: current.text, status: current.status });
      return;
    }
    setValidateLoading(prev => ({ ...prev, [record.id]: true }));
    updateValidateStatus(prev => ({ ...prev, [record.id]: { status: null, text: '' } }));
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const response = await axiosInstance.post(`/api/account-configs/${record.id}/validate`);
      const data = response.data as { validate?: any };
      let status: string | null = null;
      // 判断 validate 字段结构
      if (data.validate && Array.isArray(data.validate.users) && data.validate.users.length > 0) {
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

  // 修正 getValidateTitle 兼容 Active/Failed
  const getValidateTitle = (status: string | null) => {
    if (status === 'Active' || status === 'success') return translations.account.validateSuccess || '验证成功';
    return translations.account.validateFail || '验证失败';
  };

  return (
    <div style={{ padding: '24px' }}>
      <style>
        {`
          /* 表单样式 - 与报表管理页面保持一致 */
          .ant-form-item-label > label {
            font-size: 14px !important;
            font-weight: 500 !important;
            color: rgb(34, 13, 78) !important;
            margin-bottom: 8px !important;
            font-family: "Museo Sans", sans-serif !important;
          }
          
          /* 自定义输入框样式 */
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
          
          /* 自定义密码输入框样式 */
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
          
          /* 完全清除Input.Password的Ant Design默认样式 */
          .ant-input-password {
            border: none !important;
            outline: none !important;
            background: transparent !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            line-height: normal !important;
            font-size: inherit !important;
            font-family: inherit !important;
            font-weight: inherit !important;
            color: inherit !important;
            transition: none !important;
            -webkit-appearance: none !important;
            -moz-appearance: none !important;
            appearance: none !important;
          }
          
          .ant-input-password:focus {
            border: none !important;
            outline: none !important;
            box-shadow: none !important;
            background: transparent !important;
          }
          
          .ant-input-password:hover {
            border: none !important;
            outline: none !important;
            box-shadow: none !important;
            background: transparent !important;
          }
          
          /* 清除Input.Password内部的所有子元素样式 */
          .ant-input-password .ant-input {
            border: none !important;
            outline: none !important;
            background: transparent !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            line-height: normal !important;
            font-size: inherit !important;
            font-family: inherit !important;
            font-weight: inherit !important;
            color: inherit !important;
            transition: none !important;
            -webkit-appearance: none !important;
            -moz-appearance: none !important;
            appearance: none !important;
          }
          
          .ant-input-password .ant-input:focus {
            border: none !important;
            outline: none !important;
            box-shadow: none !important;
            background: transparent !important;
          }
          
          .ant-input-password .ant-input:hover {
            border: none !important;
            outline: none !important;
            box-shadow: none !important;
            background: transparent !important;
          }
          
          /* 清除Input.Password的图标样式 */
          .ant-input-password .anticon {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            position: absolute !important;
            left: -9999px !important;
            top: -9999px !important;
            width: 0 !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            background: transparent !important;
            color: transparent !important;
            font-size: 0 !important;
            line-height: 0 !important;
          }
          
          /* 全局强制清除所有Input.Password相关样式 */
          .ant-input-password,
          .ant-input-password *,
          .ant-input-password *::before,
          .ant-input-password *::after {
            border: none !important;
            outline: none !important;
            background: transparent !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            line-height: normal !important;
            font-size: inherit !important;
            font-family: inherit !important;
            font-weight: inherit !important;
            color: inherit !important;
            transition: none !important;
            -webkit-appearance: none !important;
            -moz-appearance: none !important;
            appearance: none !important;
            box-sizing: border-box !important;
            -webkit-box-sizing: border-box !important;
            -moz-box-sizing: border-box !important;
          }
          
          /* 特别针对可能的边框重叠问题 */
          .ant-input-password .ant-input-suffix,
          .ant-input-password .ant-input-prefix,
          .ant-input-password .ant-input-group-addon {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            position: absolute !important;
            left: -9999px !important;
            top: -9999px !important;
            width: 0 !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            background: transparent !important;
            color: transparent !important;
            font-size: 0 !important;
            line-height: 0 !important;
          }
          
          /* 确保Account Type下拉框宽度与输入框完全一致 */
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
          
          /* 自定义选择器样式 */
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
          
          /* 按钮样式 - 与报表管理页面保持一致 */
          .ant-btn {
            height: 36px !important;
            padding: 0 16px !important;
            border-radius: 4px !important;
            font-size: 14px !important;
            font-family: "Museo Sans", sans-serif !important;
            font-weight: 400 !important;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1) !important;
          }
          
          .ant-btn-primary {
            background: rgb(114, 46, 209) !important;
            border-color: rgb(114, 46, 209) !important;
            color: #fff !important;
            font-weight: 500 !important;
          }
          
          .ant-btn-primary:hover {
            background: rgb(95, 35, 168) !important;
            border-color: rgb(95, 35, 168) !important;
          }
          
          .ant-btn-default {
            border-color: rgb(230, 233, 240) !important;
            color: rgb(34, 13, 78) !important;
          }
          
          .ant-btn-default:hover {
            border-color: rgb(114, 46, 209) !important;
            color: rgb(114, 46, 209) !important;
          }
          
          /* 模态框样式 - 与报表管理页面保持一致 */
          .ant-modal-content {
            border-radius: 8px !important;
          }
          
          .ant-modal-header {
            border-bottom: 1px solid rgb(240, 240, 240) !important;
            padding: 20px 24px 16px 24px !important;
          }
          
          .ant-modal-title {
            font-size: 16px !important;
            font-weight: 600 !important;
            color: rgb(34, 13, 78) !important;
            font-family: "Museo Sans", sans-serif !important;
          }
          
          .ant-modal-body {
            padding: 24px !important;
            font-size: 14px !important;
            line-height: 1.6 !important;
            color: rgb(34, 13, 78) !important;
            font-family: "Museo Sans", sans-serif !important;
            font-weight: 300 !important;
          }
          
          /* Card样式 - 与报表管理页面保持一致 */
          .ant-card {
            border: 1px solid rgb(230, 233, 240) !important;
            border-radius: 2px !important;
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02) !important;
            overflow: hidden !important;
          }
          
          .ant-card-head {
            background: #fff !important;
            border-bottom: 1px solid rgb(230, 233, 240) !important;
            padding: 16px 24px !important;
            min-height: 48px !important;
          }
          
          .ant-card-head-title {
            font-size: 16px !important;
            font-weight: 600 !important;
            color: rgb(34, 13, 78) !important;
            font-family: "Museo Sans", sans-serif !important;
            line-height: 1.4 !important;
          }
          
          .ant-card-body {
            padding: 24px !important;
            background: #fff !important;
          }
          
          /* 表格样式 - 与报表管理页面完全一致 */
          .ant-table {
            border: 1px solid #f0f0f0 !important;
            border-radius: 2px !important;
            background: #fff !important;
          }
          
          .ant-table-container {
            border-radius: 2px !important;
            background: #fff !important;
          }
          
          .ant-table-content {
            border-radius: 2px !important;
            background: #fff !important;
          }
          
          .ant-table-header {
            border-radius: 2px 2px 0 0 !important;
          }
          
          .ant-table-thead > tr > th {
            background-color: #fafafa !important;
            border-bottom: 1px solid #f0f0f0 !important;
            font-weight: 600 !important;
            font-family: "Museo Sans", sans-serif !important;
            font-size: 13px !important;
            color: rgb(34, 13, 78) !important;
            padding: 16px 12px !important;
            text-align: center !important;
            border-radius: 0 !important;
          }
          
          .ant-table-thead > tr > th:first-child {
            border-top-left-radius: 2px !important;
          }
          
          .ant-table-thead > tr > th:last-child {
            border-top-right-radius: 2px !important;
          }
          
          .ant-table-tbody > tr > td {
            border-bottom: 1px solid #f0f0f0 !important;
            font-family: "Museo Sans", sans-serif !important;
            font-size: 13px !important;
            color: rgb(34, 13, 78) !important;
            padding: 16px 12px !important;
            text-align: center !important;
            background: #fff !important;
            white-space: nowrap !important;
            overflow: hidden !important;
          }
          
          /* 表格行样式 */
          .ant-table-tbody > tr {
            transition: background-color 0.2s ease !important;
          }
          
          .ant-table-tbody > tr:hover > td {
            background-color: #f5f5f5 !important;
          }
          
          /* 表格滚动条样式 */
          .ant-table-body::-webkit-scrollbar {
            height: 8px !important;
            width: 8px !important;
          }
          
          .ant-table-body::-webkit-scrollbar-track {
            background: #f1f1f1 !important;
            border-radius: 4px !important;
          }
          
          .ant-table-body::-webkit-scrollbar-thumb {
            background: #c1c1c1 !important;
            border-radius: 4px !important;
          }
          
          .ant-table-body::-webkit-scrollbar-thumb:hover {
            background: #a8a8a8 !important;
          }
          
          /* 分页按钮样式自定义 */
          .ant-pagination-item { 
            border-radius: 4px !important; 
            border: 1px solid #d9d9d9 !important;
            color: #fff !important;
          }
          
          .ant-pagination-item:hover { 
            border-color: #722ed1 !important; 
            color: #fff !important;
          }
          
          .ant-pagination-item-active { 
            background-color: #722ed1 !important; 
            border-color: #722ed1 !important;
            color: #fff !important;
          }
          
          .ant-pagination-item-active:hover { 
            background-color: #5b23a8 !important; 
            border-color: #5b23a8 !important;
            color: #fff !important;
          }
          
          /* 确保分页按钮内的数字文本为白色 */
          .ant-pagination-item a,
          .ant-pagination-item span,
          .ant-pagination-item .ant-pagination-item-link {
            color: #fff !important;
          }
          
          .ant-pagination-item:hover a,
          .ant-pagination-item:hover span,
          .ant-pagination-item:hover .ant-pagination-item-link {
            color: #fff !important;
          }
          
          .ant-pagination-item-active a,
          .ant-pagination-item-active span,
          .ant-pagination-item-active .ant-pagination-item-link {
            color: #fff !important;
          }
          
          .ant-pagination-item-active:hover a,
          .ant-pagination-item-active:hover span,
          .ant-pagination-item-active:hover .ant-pagination-item-link {
            color: #fff !important;
          }
          
          /* 左右箭头按钮保持原样，不更改 */
          .ant-pagination-prev .ant-pagination-item-link,
          .ant-pagination-next .ant-pagination-item-link { 
            border: none !important;
            background: transparent !important;
            color: #666 !important;
            box-shadow: none !important;
            outline: none !important;
          }
          
          .ant-pagination-prev:hover .ant-pagination-item-link,
          .ant-pagination-next:hover .ant-pagination-item-link { 
            border: none !important;
            color: #722ed1 !important;
            background: transparent !important;
          }
          
          .ant-pagination-jump-prev .ant-pagination-item-container .ant-pagination-item-ellipsis,
          .ant-pagination-jump-next .ant-pagination-item-container .ant-pagination-item-ellipsis { 
            color: #722ed1 !important;
          }
          
          /* 分页选择器样式自定义 */
          .ant-pagination-options .ant-select-selector {
            border-radius: 4px !important;
            border: 1px solid rgb(230, 233, 240) !important;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1) !important;
          }
          
          .ant-pagination-options .ant-select-selector:hover {
            border-color: #220D4E !important;
          }
          
          .ant-pagination-options .ant-select-focused .ant-select-selector {
            border-color: #220D4E !important;
            box-shadow: 0 0 0 2px rgba(34, 13, 78, 0.1) !important;
          }
          
          /* 分页选择器下拉弹层样式 */
          .ant-pagination-options .ant-select-dropdown {
            margin-top: -1px !important;
            border-radius: 4px !important;
            border-top-left-radius: 0 !important;
            border-top-right-radius: 0 !important;
            border: 1px solid rgb(230, 233, 240) !important;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
            overflow: hidden !important;
            -webkit-font-smoothing: antialiased !important;
            text-size-adjust: 100% !important;
          }
          
          /* 选择器样式 */
          .ant-select-selection-search-input { display: none !important; }
          .ant-select-selection-item { cursor: pointer !important; }
          .ant-select-selection-placeholder { cursor: pointer !important; }
          .ant-pagination-options .ant-select { width: 110px !important; }
          .ant-pagination-options .ant-select-selector { width: 110px !important; }
          .ant-pagination-options .ant-select-selection-item { width: 110px !important; text-align: center !important; }
          .ant-pagination-options .ant-select-selection-placeholder { width: 110px !important; text-align: center !important; }
          .ant-pagination-total-text { line-height: 32px !important; height: 32px !important; display: inline-block !important; }
          
          /* 表格加载状态样式 */
          .ant-table-loading .ant-table-loading-mask {
            background: rgba(255, 255, 255, 0.9) !important;
            border-radius: 6px !important;
          }
          
          .ant-table-loading .ant-spin {
            color: rgb(114, 46, 209) !important;
          }
          
          /* 表格空数据样式 */
          .ant-table-empty .ant-table-tbody > tr.ant-table-placeholder > td {
            border-bottom: none !important;
            padding: 32px 16px !important;
          }
          
          .ant-table-empty .ant-table-tbody > tr.ant-table-placeholder:hover > td {
            background: #fff !important;
          }
          
          /* 表格选择器样式 */
          .ant-table-selection {
            text-align: center !important;
          }
          
          /* 表格操作列样式 */
          .ant-table-tbody > tr > td:last-child {
            text-align: center !important;
          }
          
          /* Account Type选择器下拉菜单动画 */
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
          
          /* 表格状态标签样式 */
          .ant-tag {
            border-radius: 4px !important;
            font-size: 12px !important;
            font-weight: 500 !important;
            padding: 2px 8px !important;
            height: 20px !important;
            line-height: 16px !important;
          }
          
          /* Descriptions组件样式 - 与报表管理页面表格样式保持一致 */
          .ant-descriptions {
            background: #fff !important;
            border: 1px solid #f0f0f0 !important;
            border-radius: 2px !important;
            overflow: hidden !important;
          }
          
          .ant-descriptions-bordered .ant-descriptions-item-label,
          .ant-descriptions-bordered .ant-descriptions-item-content {
            border-right: 1px solid #f0f0f0 !important;
            border-bottom: 1px solid #f0f0f0 !important;
            padding: 16px 12px !important;
            font-family: "Museo Sans", sans-serif !important;
            font-size: 13px !important;
            line-height: 1.4 !important;
          }
          
          .ant-descriptions-bordered .ant-descriptions-item-label {
            background-color: #fafafa !important;
            font-weight: 600 !important;
            color: rgb(34, 13, 78) !important;
            text-align: center !important;
            min-width: 120px !important;
            width: 120px !important;
          }
          
          .ant-descriptions-bordered .ant-descriptions-item-content {
            background: #fff !important;
            color: rgb(34, 13, 78) !important;
            text-align: center !important;
          }
          
          .ant-descriptions-bordered .ant-descriptions-item:last-child .ant-descriptions-item-label,
          .ant-descriptions-bordered .ant-descriptions-item:last-child .ant-descriptions-item-content {
            border-bottom: none !important;
          }
          
          .ant-descriptions-bordered .ant-descriptions-item:last-child .ant-descriptions-item-label {
            border-bottom-left-radius: 2px !important;
          }
          
          .ant-descriptions-bordered .ant-descriptions-item:last-child .ant-descriptions-item-content {
            border-bottom-right-radius: 2px !important;
          }
          
          .ant-descriptions-bordered .ant-descriptions-item:first-child .ant-descriptions-item-label {
            border-top-left-radius: 2px !important;
          }
          
          .ant-descriptions-bordered .ant-descriptions-item:first-child .ant-descriptions-item-content {
            border-top-right-radius: 2px !important;
          }
          
          /* Descriptions表格样式优化 */
          .ant-descriptions-bordered .ant-descriptions-view {
            border-radius: 2px !important;
            overflow: hidden !important;
          }
          
          .ant-descriptions-bordered .ant-descriptions-table {
            border-radius: 2px !important;
            overflow: hidden !important;
          }
          
          .ant-descriptions-bordered .ant-descriptions-table .ant-table-thead > tr > th,
          .ant-descriptions-bordered .ant-descriptions-table .ant-table-tbody > tr > td {
            border-radius: 0 !important;
            padding: 16px 12px !important;
            font-family: "Museo Sans", sans-serif !important;
            font-size: 13px !important;
            text-align: center !important;
          }
          
          .ant-descriptions-bordered .ant-descriptions-table .ant-table-thead > tr > th {
            background-color: #fafafa !important;
            border-bottom: 1px solid #f0f0f0 !important;
            font-weight: 600 !important;
            color: rgb(34, 13, 78) !important;
          }
          
          .ant-descriptions-bordered .ant-descriptions-table .ant-table-tbody > tr > td {
            border-bottom: 1px solid #f0f0f0 !important;
            background: #fff !important;
            color: rgb(34, 13, 78) !important;
          }
          
          .ant-descriptions-bordered .ant-descriptions-table .ant-table-tbody > tr:hover > td {
            background-color: #f5f5f5 !important;
          }
        `}
      </style>
      <Card title={translations.account.title} style={{ marginBottom: '24px' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'flex-start', 
          marginBottom: 24,
          padding: '8px 0'
        }}>
          <div style={{ 
            marginRight: 24,
            display: 'flex',
            alignItems: 'center',
            height: '100%'
          }}>
            <Upload
              name="avatar"
              showUploadList={false}
              beforeUpload={handleImageSelect}
              accept="image/jpeg,image/png"
            >
              <div 
                style={{ 
                  position: 'relative',
                  cursor: 'pointer',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  width: 64,
                  height: 64,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Avatar 
                  size={64} 
                  src={userProfile?.avatar}
                  icon={<UserOutlined />} 
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0,
                    transition: 'opacity 0.3s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '0';
                  }}
                >
                  <UploadOutlined style={{ color: 'white', fontSize: '24px' }} />
                </div>
              </div>
            </Upload>
          </div>
          <div style={{ 
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            height: '64px',
            minWidth: '300px'
          }}>
            <h2 style={{ 
              margin: 0, 
              fontSize: '20px', 
              fontWeight: 500,
              lineHeight: '1.4',
              whiteSpace: 'nowrap'
            }}>
              {userLoading ? '' : userProfile?.username}
            </h2>
            <p style={{ 
              margin: '4px 0 0', 
              color: '#666', 
              fontSize: '14px',
              lineHeight: '1.4',
              whiteSpace: 'nowrap'
            }}>
              {userLoading ? '' : userProfile?.email}
            </p>
          </div>
        </div>

        <Descriptions bordered column={1}>
          <Descriptions.Item label={translations.account.username} style={{ minWidth: '200px' }}>
            {userLoading ? '' : userProfile?.username}
          </Descriptions.Item>
          <Descriptions.Item label={translations.account.email} style={{ minWidth: '200px' }}>
            {userLoading ? '' : userProfile?.email}
          </Descriptions.Item>
          <Descriptions.Item label={translations.account.role} style={{ minWidth: '200px' }}>
            {userLoading ? '' : userProfile?.role}
          </Descriptions.Item>
          <Descriptions.Item label={translations.account.lastLogin} style={{ minWidth: '200px' }}>
            {userLoading ? '' : (userProfile?.lastLogin ? new Date(userProfile.lastLogin).toLocaleString() : '')}
          </Descriptions.Item>
        </Descriptions>

        <Space style={{ marginTop: 24 }}>
          <Button 
            type="primary" 
            icon={<EditOutlined />}
            onClick={() => {
              if (!userLoading) {
              profileForm.setFieldsValue({
                  username: userProfile?.username,
              });
              setIsProfileModalVisible(true);
              }
            }}
            disabled={userLoading}
          >
            {translations.account.editProfile}
          </Button>
          <Button 
            icon={<KeyOutlined />}
            onClick={() => setIsPasswordModalVisible(true)}
            disabled={userLoading}
          >
            {translations.account.changePassword}
          </Button>
        </Space>
      </Card>

      <Card 
        title={translations.account.configTitle}
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingConfig(null);
              form.resetFields();
              setIsModalVisible(true);
            }}
          >
            {translations.account.addConfig}
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={localAccountConfigs}
          rowKey="id"
          pagination={false}
          style={{ position: 'relative', zIndex: 2 }}
          loading={accountLoading}
        />
      </Card>

      {/* 账户配置模态框 */}
      <Modal
        title={editingConfig ? translations.account.editConfig : translations.account.addConfig}
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
          setEditingConfig(null);
        }}
        footer={null}
        style={{
          borderRadius: '8px'
        }}
        bodyStyle={{
          padding: '24px',
          fontSize: '14px',
          lineHeight: '1.6',
          color: 'rgb(34, 13, 78)'
        }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleAddEdit}
          autoComplete="new-password"
        >
          {/* 合并的输入框组件 */}
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '16px', 
            marginBottom: '24px',
            width: '100%'
          }}>
            {/* Account Name输入框 */}
          <Form.Item
            name="account_name"
              rules={[{ required: true, message: '' }]}
              style={{ marginBottom: 0, width: '100%' }}
              validateStatus={form.getFieldError('account_name').length > 0 ? 'error' : ''}
            >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                border: form.getFieldError('account_name').length > 0 ? '1px solid #ff4d4f' : '1px solid #d9d9d9',
                borderRadius: '4px',
                background: '#fff',
                cursor: 'text',
                fontSize: '13px',
                fontFamily: '"Museo Sans", sans-serif',
                fontWeight: 300,
                color: 'rgb(34, 13, 78)',
                width: '100%',
                transition: 'all 0.2s ease',
                opacity: editingConfig?.is_default ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (!editingConfig?.is_default) {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                  e.currentTarget.style.borderColor = '#bfbfbf';
                }
              }}
              onMouseLeave={(e) => {
                if (!editingConfig?.is_default) {
                  e.currentTarget.style.backgroundColor = '#fff';
                  e.currentTarget.style.borderColor = '#d9d9d9';
                }
              }}
            >
              <Input
                placeholder="Enter Your Account Name"
                disabled={editingConfig?.is_default}
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '13px',
                  fontFamily: '"Museo Sans", sans-serif',
                  fontWeight: 300,
                  color: 'rgb(34, 13, 78)',
                  width: '100%',
                  padding: '0',
                  boxShadow: 'none',
                  height: 'auto'
                }}
                onFocus={(e) => {
                  const parent = e.target.parentElement;
                  if (parent) {
                    parent.style.border = '1px solid #722ED1';
                    parent.style.boxShadow = '0 0 0 2px rgba(114, 46, 209, 0.1)';
                  }
                }}
                onBlur={(e) => {
                  const parent = e.target.parentElement;
                  if (parent) {
                    const hasError = form.getFieldError('account_name').length > 0;
                    parent.style.border = hasError ? '1px solid #ff4d4f' : '1px solid #d9d9d9';
                    parent.style.boxShadow = 'none';
                  }
                }}
              />
            </div>
          </Form.Item>
          
            {/* Account Type下拉框 */}
          <Form.Item
            name="account_type"
              rules={[{ required: true, message: '' }]}
              style={{ marginBottom: 0, width: '100%' }}
              validateStatus={form.getFieldError('account_type').length > 0 ? 'error' : ''}
            >
            <div style={{ position: 'relative', zIndex: 9999, width: '100%', display: 'block' }} data-account-type-selector>
              <button
                onClick={() => {
                  if (!accountTypeSelectorVisible) {
                    calculateAccountTypeDropdownPosition();
                  }
                  setAccountTypeSelectorVisible(!accountTypeSelectorVisible);
                }}
                disabled={editingConfig?.is_default}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  border: form.getFieldError('account_type').length > 0 ? '1px solid #ff4d4f' : '1px solid #d9d9d9',
                  borderRadius: '4px',
                  background: '#fff',
                  cursor: editingConfig?.is_default ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontFamily: '"Museo Sans", sans-serif',
                  fontWeight: 300,
                  color: 'rgb(34, 13, 78)',
                  width: '100%',
                  minWidth: '100%',
                  boxSizing: 'border-box',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s ease',
                  opacity: editingConfig?.is_default ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (!editingConfig?.is_default) {
                    e.currentTarget.style.backgroundColor = '#f5f5f5';
                    e.currentTarget.style.borderColor = '#bfbfbf';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!editingConfig?.is_default) {
                    e.currentTarget.style.backgroundColor = '#fff';
                    const hasError = form.getFieldError('account_type').length > 0;
                    e.currentTarget.style.borderColor = hasError ? '#ff4d4f' : '#d9d9d9';
                  }
                }}
              >
                <span>
                  {form.getFieldValue('account_type') || 'Select Account Type'}
                </span>
                <svg 
                  width="12" 
                  height="12" 
                  viewBox="0 0 12 12" 
                  fill="none"
                  style={{
                    transform: accountTypeSelectorVisible ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease'
                  }}
                >
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              
              {/* Account Type选择器下拉菜单 */}
              {accountTypeSelectorVisible && (
                <div
                  data-account-type-selector-dropdown
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: '0',
                    right: '0',
                    zIndex: 99999,
                    background: 'rgb(255, 255, 255)',
                    color: 'rgb(34, 13, 78)',
                    boxShadow: 'rgba(3, 109, 235, 0.03) 0px 2px 4px, rgba(3, 109, 235, 0.02) 0px 4px 5px, rgba(3, 109, 235, 0.12) 0px 1px 10px',
                    borderRadius: '4px',
                    width: '100%',
                    minWidth: '100%',
                    boxSizing: 'border-box',
                    maxHeight: '280px',
                    overflowY: 'auto',
                    fontFamily: '"Museo Sans", sans-serif',
                    fontWeight: 300,
                    fontSize: '13px',
                    lineHeight: '20px',
                    letterSpacing: '0.0025em',
                    WebkitFontSmoothing: 'antialiased',
                    textSizeAdjust: '100%',
                    WebkitTapHighlightColor: 'rgba(0, 0, 0, 0)',
                    outline: 0,
                    border: '1px solid #f0f0f0',
                    transform: 'translateY(0) scale(1)',
                    opacity: 1,
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    transformOrigin: 'top center'
                  }}
                >
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {/* Account Type选项列表 */}
                    {[
                      { label: 'PID', value: 'PID' },
                      { label: 'PRT', value: 'PRT' }
                    ].map((option, index) => (
                      <div
                        key={option.value}
                        onClick={() => {
                          form.setFieldValue('account_type', option.value);
                          setAccountTypeSelectorVisible(false);
                        }}
                        style={{
                          padding: '10px 16px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          borderBottom: index < 1 ? '1px solid #f8f8f8' : 'none',
                          backgroundColor: form.getFieldValue('account_type') === option.value ? '#f6f8ff' : 'transparent',
                          transition: 'background-color 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (form.getFieldValue('account_type') !== option.value) {
                            e.currentTarget.style.backgroundColor = '#fafafa';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (form.getFieldValue('account_type') !== option.value) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '13px',
                            fontWeight: 400,
                            color: 'rgb(34, 13, 78)',
                            marginBottom: '2px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {option.label}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Form.Item>
          
            {/* API Token输入框 */}
          <Form.Item
            name="api_token"
              rules={[{ required: true, message: '' }]}
              style={{ marginBottom: 0, width: '100%' }}
              validateStatus={form.getFieldError('api_token').length > 0 ? 'error' : ''}
            >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                border: form.getFieldError('api_token').length > 0 ? '1px solid #ff4d4f' : '1px solid #d9d9d9',
                borderRadius: '4px',
                background: '#fff',
                cursor: 'text',
                fontSize: '13px',
                fontFamily: '"Museo Sans", sans-serif',
                fontWeight: 300,
                color: 'rgb(34, 13, 78)',
                width: '100%',
                transition: 'all 0.2s ease',
                opacity: editingConfig?.is_default ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (!editingConfig?.is_default) {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                  e.currentTarget.style.borderColor = '#bfbfbf';
                }
              }}
              onMouseLeave={(e) => {
                if (!editingConfig?.is_default) {
                  e.currentTarget.style.backgroundColor = '#fff';
                  e.currentTarget.style.borderColor = '#d9d9d9';
                }
              }}
            >
              <Input.Password
                placeholder="Enter Your API Token"
                disabled={editingConfig?.is_default}
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '13px',
                  fontFamily: '"Museo Sans", sans-serif',
                  fontWeight: 300,
                  color: 'rgb(34, 13, 78)',
                  width: '100%',
                  padding: '0',
                  boxShadow: 'none',
                  height: 'auto',
                  borderRadius: '0',
                  margin: '0',
                  minHeight: 'auto',
                  maxHeight: 'none',
                  lineHeight: 'normal',
                  transition: 'none'
                }}
                onFocus={(e) => {
                  const parent = e.target.parentElement;
                  if (parent) {
                    parent.style.border = '1px solid #722ED1';
                    parent.style.boxShadow = '0 0 0 2px rgba(114, 46, 209, 0.1)';
                  }
                }}
                onBlur={(e) => {
                  const parent = e.target.parentElement;
                  if (parent) {
                    const hasError = form.getFieldError('api_token').length > 0;
                    parent.style.border = hasError ? '1px solid #ff4d4f' : '1px solid #d9d9d9';
                    parent.style.boxShadow = 'none';
                  }
                }}
              />
            </div>
          </Form.Item>
          </div>
          
          <Form.Item shouldUpdate style={{ marginBottom: 0 }}>
            {() => {
              const configValues = form.getFieldsValue(["account_name", "account_type", "api_token"]);
              const allConfigFilled = Object.values(configValues).every(v => v && String(v).trim() !== "");
              return (
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end',
                  paddingTop: '8px',
                  borderTop: '1px solid rgb(240, 240, 240)'
                }}>
                  <Button 
                    onClick={() => {
                      setIsModalVisible(false);
                      form.resetFields();
                      setEditingConfig(null);
                      setConfigLoading(false);
                    }}
                    style={{
                      height: '36px',
                      padding: '0 16px',
                      borderRadius: '4px',
                      border: '1px solid rgb(230, 233, 240)',
                      background: '#fff',
                      color: 'rgb(34, 13, 78)',
                      fontSize: '14px',
                      fontFamily: '"Museo Sans", sans-serif',
                      fontWeight: 400,
                      transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgb(114, 46, 209)';
                      e.currentTarget.style.color = 'rgb(114, 46, 209)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgb(230, 233, 240)';
                      e.currentTarget.style.color = 'rgb(34, 13, 78)';
                    }}
                  >
                    {translations.account.cancel}
                  </Button>
              <Button 
                type="primary" 
                htmlType="submit"
                    loading={configLoading}
                    disabled={
                      editingConfig?.is_default ||
                      form.getFieldsError().some(({ errors }) => errors.length) ||
                      !allConfigFilled
                    }
                    style={{
                      height: '36px',
                      padding: '0 16px',
                      borderRadius: '4px',
                      background: 'rgb(114, 46, 209)',
                      border: '1px solid rgb(114, 46, 209)',
                      color: '#fff',
                      fontSize: '14px',
                      fontFamily: '"Museo Sans", sans-serif',
                      fontWeight: 500,
                      transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgb(95, 35, 168)';
                      e.currentTarget.style.borderColor = 'rgb(95, 35, 168)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgb(114, 46, 209)';
                      e.currentTarget.style.borderColor = 'rgb(114, 46, 209)';
                    }}
              >
                {editingConfig ? translations.account.update : translations.account.add}
              </Button>
                </div>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑资料模态框 */}
      <Modal
        title={translations.account.editProfile}
        open={isProfileModalVisible}
        onCancel={() => {
          setIsProfileModalVisible(false);
          profileForm.resetFields();
        }}
        footer={null}
        style={{
          borderRadius: '8px'
        }}
        bodyStyle={{
          padding: '24px',
          fontSize: '14px',
          lineHeight: '1.6',
          color: 'rgb(34, 13, 78)'
        }}
      >
        <Form
          form={profileForm}
          layout="vertical"
          onFinish={handleEditProfile}
          autoComplete="off"
        >
          <Form.Item
            name="username"
            label={
              <span style={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'rgb(34, 13, 78)',
                marginBottom: '8px'
              }}>
                {translations.account.username}
              </span>
            }
            rules={[{ required: true, message: translations.account.usernameRequired }]}
            style={{ marginBottom: '20px', width: '100%' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                background: '#fff',
                cursor: 'text',
                fontSize: '13px',
                fontFamily: '"Museo Sans", sans-serif',
                fontWeight: 300,
                color: 'rgb(34, 13, 78)',
                width: '100%',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
                e.currentTarget.style.borderColor = '#bfbfbf';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#fff';
                e.currentTarget.style.borderColor = '#d9d9d9';
              }}
            >
              <Input
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '13px',
                  fontFamily: '"Museo Sans", sans-serif',
                  fontWeight: 300,
                  color: 'rgb(34, 13, 78)',
                  width: '100%',
                  padding: '0',
                  boxShadow: 'none',
                  height: 'auto'
                }}
                onFocus={(e) => {
                  const parent = e.target.parentElement;
                  if (parent) {
                    parent.style.border = '1px solid #722ED1';
                    parent.style.boxShadow = '0 0 0 2px rgba(114, 46, 209, 0.1)';
                  }
                }}
                onBlur={(e) => {
                  const parent = e.target.parentElement;
                  if (parent) {
                    parent.style.border = '1px solid #d9d9d9';
                    parent.style.boxShadow = 'none';
                  }
                }}
              />
            </div>
          </Form.Item>
          <Form.Item shouldUpdate>
            {() => {
              const usernameValue = String(profileForm.getFieldValue('username') || '').trim();
              const isProfileUnchanged = !!userProfile && usernameValue === String(userProfile.username).trim();
              return (
            <Space>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={profileLoading}
                    disabled={
                      profileForm.getFieldsError().some(({ errors }) => errors.length) ||
                      !usernameValue ||
                      isProfileUnchanged
                    }
                  >
                {translations.account.update}
              </Button>
              <Button onClick={() => {
                setIsProfileModalVisible(false);
                profileForm.resetFields();
                    setProfileLoading(false);
              }}>
                {translations.account.cancel}
              </Button>
            </Space>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* 修改密码模态框 */}
      <Modal
        title={translations.account.changePassword}
        open={isPasswordModalVisible}
        onCancel={() => {
          setIsPasswordModalVisible(false);
          passwordForm.resetFields();
          setPasswordError('');
          setPasswordLoading(false);
        }}
        footer={null}
        style={{
          borderRadius: '8px'
        }}
        bodyStyle={{
          padding: '24px',
          fontSize: '14px',
          lineHeight: '1.6',
          color: 'rgb(34, 13, 78)'
        }}
      >
        <Form
          form={passwordForm}
          layout="vertical"
          onFinish={handleChangePassword}
          autoComplete="new-password"
        >
          <Form.Item
            name="currentPassword"
            label={
              <span style={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'rgb(34, 13, 78)',
                marginBottom: '8px'
              }}>
                {translations.account.currentPassword}
              </span>
            }
            rules={[{ required: true, message: translations.account.currentPasswordRequired }]}
            style={{ marginBottom: '20px', width: '100%' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                background: '#fff',
                cursor: 'text',
                fontSize: '13px',
                fontFamily: '"Museo Sans", sans-serif',
                fontWeight: 300,
                color: 'rgb(34, 13, 78)',
                width: '100%',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
                e.currentTarget.style.borderColor = '#bfbfbf';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#fff';
                e.currentTarget.style.borderColor = '#d9d9d9';
              }}
            >
              <Input.Password
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '13px',
                  fontFamily: '"Museo Sans", sans-serif',
                  fontWeight: 300,
                  color: 'rgb(34, 13, 78)',
                  width: '100%',
                  padding: '0',
                  boxShadow: 'none',
                  height: 'auto',
                  borderRadius: '0',
                  margin: '0',
                  minHeight: 'auto',
                  maxHeight: 'none',
                  lineHeight: 'normal',
                  transition: 'none'
                }}
                onFocus={(e) => {
                  const parent = e.target.parentElement;
                  if (parent) {
                    parent.style.border = '1px solid #722ED1';
                    parent.style.boxShadow = '0 0 0 2px rgba(114, 46, 209, 0.1)';
                  }
                }}
                onBlur={(e) => {
                  const parent = e.target.parentElement;
                  if (parent) {
                    parent.style.border = '1px solid #d9d9d9';
                    parent.style.boxShadow = 'none';
                  }
                }}
              />
            </div>
          </Form.Item>
          
          <Form.Item
            name="newPassword"
            label={
              <span style={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'rgb(34, 13, 78)',
                marginBottom: '8px'
              }}>
                {translations.account.newPassword}
              </span>
            }
            rules={[
              { required: true, message: translations.account.newPasswordRequired },
              { min: 8, message: translations.account.passwordTooShort }
            ]}
            validateStatus={passwordError ? 'error' : ''}
            help={passwordError}
            style={{ marginBottom: '20px', width: '100%' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                background: '#fff',
                cursor: 'text',
                fontSize: '13px',
                fontFamily: '"Museo Sans", sans-serif',
                fontWeight: 300,
                color: 'rgb(34, 13, 78)',
                width: '100%',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
                e.currentTarget.style.borderColor = '#bfbfbf';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#fff';
                e.currentTarget.style.borderColor = '#d9d9d9';
              }}
          >
            <Input.Password 
              autoComplete="new-password" 
              autoCorrect="off" 
              autoCapitalize="off" 
              spellCheck={false}
              onChange={() => passwordError && setPasswordError('')}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '13px',
                  fontFamily: '"Museo Sans", sans-serif',
                  fontWeight: 300,
                  color: 'rgb(34, 13, 78)',
                  width: '100%',
                  padding: '0',
                  boxShadow: 'none',
                  height: 'auto',
                  borderRadius: '0',
                  margin: '0',
                  minHeight: 'auto',
                  maxHeight: 'none',
                  lineHeight: 'normal',
                  transition: 'none'
                }}
                onFocus={(e) => {
                  const parent = e.target.parentElement;
                  if (parent) {
                    parent.style.border = '1px solid #722ED1';
                    parent.style.boxShadow = '0 0 0 2px rgba(114, 46, 209, 0.1)';
                  }
                }}
                onBlur={(e) => {
                  const parent = e.target.parentElement;
                  if (parent) {
                    parent.style.border = '1px solid #d9d9d9';
                    parent.style.boxShadow = 'none';
                  }
                }}
              />
            </div>
          </Form.Item>
          
          <Form.Item
            name="confirmPassword"
            label={
              <span style={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'rgb(34, 13, 78)',
                marginBottom: '8px'
              }}>
                {translations.account.confirmPassword}
              </span>
            }
            rules={[
              { required: true, message: translations.account.confirmPasswordRequired },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error(translations.account.passwordMismatch));
                },
              }),
            ]}
            style={{ marginBottom: '24px', width: '100%' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                background: '#fff',
                cursor: 'text',
                fontSize: '13px',
                fontFamily: '"Museo Sans", sans-serif',
                fontWeight: 300,
                color: 'rgb(34, 13, 78)',
                width: '100%',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
                e.currentTarget.style.borderColor = '#bfbfbf';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#fff';
                e.currentTarget.style.borderColor = '#d9d9d9';
              }}
            >
              <Input.Password
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '13px',
                  fontFamily: '"Museo Sans", sans-serif',
                  fontWeight: 300,
                  color: 'rgb(34, 13, 78)',
                  width: '100%',
                  padding: '0',
                  boxShadow: 'none',
                  height: 'auto',
                  borderRadius: '0',
                  margin: '0',
                  minHeight: 'auto',
                  maxHeight: 'none',
                  lineHeight: 'normal',
                  transition: 'none'
                }}
                onFocus={(e) => {
                  const parent = e.target.parentElement;
                  if (parent) {
                    parent.style.border = '1px solid #722ED1';
                    parent.style.boxShadow = '0 0 0 2px rgba(114, 46, 209, 0.1)';
                  }
                }}
                onBlur={(e) => {
                  const parent = e.target.parentElement;
                  if (parent) {
                    parent.style.border = '1px solid #d9d9d9';
                    parent.style.boxShadow = 'none';
                  }
                }}
              />
            </div>
          </Form.Item>
          
          <Form.Item shouldUpdate style={{ marginBottom: 0 }}>
            {() => {
              const pwdValues = passwordForm.getFieldsValue(["currentPassword", "newPassword", "confirmPassword"]);
              const allPwdFilled = Object.values(pwdValues).every(v => v && String(v).trim() !== "");
              return (
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end',
                  paddingTop: '8px',
                  borderTop: '1px solid rgb(240, 240, 240)'
                }}>
                  <Button 
                    onClick={() => {
                      setIsPasswordModalVisible(false);
                      passwordForm.resetFields();
                      setPasswordError('');
                      setPasswordLoading(false);
                    }}
                    style={{
                      height: '36px',
                      padding: '0 16px',
                      borderRadius: '4px',
                      border: '1px solid rgb(230, 233, 240)',
                      background: '#fff',
                      color: 'rgb(34, 13, 78)',
                      fontSize: '14px',
                      fontFamily: '"Museo Sans", sans-serif',
                      fontWeight: 400,
                      transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgb(114, 46, 209)';
                      e.currentTarget.style.color = 'rgb(114, 46, 209)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgb(230, 233, 240)';
                      e.currentTarget.style.color = 'rgb(34, 13, 78)';
                    }}
                  >
                    {translations.account.cancel}
                  </Button>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={passwordLoading}
                    disabled={
                      passwordForm.getFieldsError().some(({ errors }) => errors.length) ||
                      !allPwdFilled
                    }
                    style={{
                      height: '36px',
                      padding: '0 16px',
                      borderRadius: '4px',
                      background: 'rgb(114, 46, 209)',
                      border: '1px solid rgb(114, 46, 209)',
                      color: '#fff',
                      fontSize: '14px',
                      fontFamily: '"Museo Sans", sans-serif',
                      fontWeight: 500,
                      transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgb(95, 35, 168)';
                      e.currentTarget.style.borderColor = 'rgb(95, 35, 168)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgb(114, 46, 209)';
                      e.currentTarget.style.borderColor = 'rgb(114, 46, 209)';
                    }}
                  >
                {translations.account.update}
              </Button>
                </div>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* 头像裁剪模态框 */}
      <Modal
        title={translations.account.cropAvatar}
        open={cropModalVisible}
        onCancel={() => {
          setCropModalVisible(false);
          setSelectedImage(null);
        }}
        onOk={handleCropComplete}
        width={400}
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

      {/* 删除配置模态框 */}
      <Modal
        title={translations.account.confirmDelete}
        open={isDeleteModalVisible}
        onCancel={() => {
          setIsDeleteModalVisible(false);
          setDeletingConfig(null);
        }}
        footer={null}
      >
        <Form 
          layout="vertical"
          initialValues={{
            account_name: deletingConfig?.account_name,
            account_type: deletingConfig?.account_type,
            api_token: deletingConfig ? displayPartialToken(deletingConfig.api_token) : ''
          }}
        >
          <Form.Item
            name="account_name"
            label={translations.account.accountName}
          >
            <Input disabled />
          </Form.Item>

          <Form.Item
            name="account_type"
            label={translations.account.accountType}
          >
            <Select dropdownClassName="af-form" disabled>
              <Select.Option value="PID">PID</Select.Option>
              <Select.Option value="PRT">PRT</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="api_token"
            label={translations.account.apiToken}
          >
            <Input disabled value={deletingConfig?.api_token ? displayPartialToken(deletingConfig.api_token) : ''} />
          </Form.Item>

          <p style={{ color: '#ff4d4f', marginTop: '16px' }}>
            {translations.account.deleteWarning}
          </p>

          <Form.Item>
            <Space>
              <Button 
                type="primary" 
                danger
                onClick={handleDelete}
                loading={!!deletingConfig && deletingIds.includes(deletingConfig.id)}
              >
                {translations.account.delete}
              </Button>
              <Button onClick={() => {
                setIsDeleteModalVisible(false);
                setDeletingConfig(null);
              }}>
                {translations.account.cancel}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 验证结果弹窗 */}
      <Modal
        open={validateModal.visible}
        title={getValidateTitle(validateModal.status || '')}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingRight: 8, paddingBottom: 4 }}>
            <Button
              type="text"
              onClick={handleRefreshValidate}
              disabled={validateModalLoading}
              icon={
                <ReloadOutlined
                  className={validateModalLoading ? 'anticon-spin' : ''}
                  style={{ fontSize: 22, color: '#1677ff', transition: 'transform 0.2s' }}
                />
              }
              className="validate-refresh-btn"
              style={{ border: 'none', boxShadow: 'none', background: 'none', padding: 0, minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            />
          </div>
        }
        onCancel={() => {
          setValidateModal({ ...validateModal, visible: false });
          setCurrentValidatingRecord(null);
        }}
      >
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{validateModal.content}</pre>
      </Modal>
    </div>
  );
};

export default Account; 