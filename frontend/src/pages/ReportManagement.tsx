import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Space, message, Button, Modal, Pagination, Spin, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';
import { DeleteOutlined, EyeOutlined, BarChartOutlined, DownloadOutlined, LoadingOutlined } from '@ant-design/icons';
import { useLanguage } from '../contexts/LanguageContext';
import { axiosInstance } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useUser } from '../contexts/UserContext';
import { saveAs } from 'file-saver';
import { io } from 'socket.io-client';

// 账户配置接口
interface AccountConfig {
  id: string;
  accountName: string;
  accountType: 'PID' | 'PRT';
  apiToken: string;
}

interface Report {
  id: string;
  reportName: string;
  status: string;
  createTime: string;
  size: number;
  accountType: string;
  accountId: string;
  appId: string;
  appName: string;
  dataType: string;
  dateRange: string;
  recordCount: number;
  primaryAttributionCount: number;
  manager?: string; // 新增上传者字段
}

interface ApiResponse {
  success: boolean;
  message?: string;
}



interface ReportUpdate {
  type: 'report_update';
  status: 'success' | 'error';
  report: Report;
  timestamp?: string;
}

interface QueryResponse {
  status: 'success' | 'error';
  downloadUrl?: string;
  message?: string;
}

// AF-style icon buttons (aligned with Home page)
const IconPreviewButton: React.FC<{ disabled?: boolean; onClick: () => void; loading?: boolean }> = ({ disabled = false, onClick, loading = false }) => (
  <button
    onClick={onClick}
    disabled={disabled || loading}
    style={{
      cursor: disabled || loading ? 'not-allowed' : 'pointer',
      userSelect: 'none',
      WebkitTapHighlightColor: 'transparent',
      background: 'transparent',
      border: 'none',
      padding: '4px',
      borderRadius: '4px',
      transition: 'all 0.2s ease',
      opacity: disabled || loading ? 0.5 : 1,
      outline: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px'
    }}
    onMouseEnter={(e) => {
      if (!disabled && !loading) {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
      }
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
    }}
  >
    {loading ? (
      <LoadingOutlined style={{ fontSize: '16px' }} />
    ) : (
      /* grid icon */
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M2.66663 5.33333H5.33329V2.66667H2.66663V5.33333ZM6.66663 13.3333H9.33329V10.6667H6.66663V13.3333ZM5.33329 13.3333H2.66663V10.6667H5.33329V13.3333ZM2.66663 9.33333H5.33329V6.66667H2.66663V9.33333ZM9.33329 9.33333H6.66663V6.66667H9.33329V9.33333ZM10.6666 2.66667V5.33333H13.3333V2.66667H10.6666ZM9.33329 5.33333H6.66663V2.66667H9.33329V5.33333ZM10.6666 9.33333H13.3333V6.66667H10.6666V9.33333ZM13.3333 13.3333H10.6666V10.6667H13.3333V13.3333Z" fill={disabled ? '#999' : '#220D4E'}></path>
      </svg>
    )}
  </button>
);

const AppsFlyerDownloadButton: React.FC<{ disabled?: boolean; onClick: () => void; loading?: boolean }> = ({ disabled = false, onClick, loading = false }) => (
  <button
    onClick={onClick}
    disabled={disabled || loading}
    style={{
      WebkitFontSmoothing: 'antialiased',
      textSizeAdjust: '100%',
      borderCollapse: 'collapse',
      borderSpacing: '0px',
      fontFamily: 'Museo Sans',
      fontWeight: 300,
      lineHeight: '20px',
      letterSpacing: '0.0025em',
      textAlign: 'center',
      display: 'inline-block',
      fill: 'currentColor',
      flexShrink: 0,
      fontSize: '20px',
      width: '20px',
      height: '20px',
      boxSizing: 'content-box',
      color: disabled ? 'rgba(34, 35, 36, 0.26)' : 'rgba(34, 35, 36, 0.87)',
      userSelect: 'none',
      cursor: disabled ? 'default' : 'pointer',
      transition: 'fill 200ms cubic-bezier(0.4, 0, 0.2, 1)',
      padding: '4px',
      borderRadius: '4px',
      background: 'transparent',
      border: 'none',
      outline: 'none',
      position: 'relative'
    }}
    onMouseEnter={(e) => {
      if (!disabled && !loading) {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
        (e.currentTarget as HTMLButtonElement).style.color = 'rgba(34, 35, 36, 1)';
      }
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
      (e.currentTarget as HTMLButtonElement).style.color = disabled ? 'rgba(34, 35, 36, 0.26)' : 'rgba(34, 35, 36, 0.87)';
    }}
  >
    {loading ? (
      <LoadingOutlined style={{ fontSize: '16px' }} />
    ) : (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ fill: 'currentColor' }}>
        <path d="M12 2C12.5523 2 13 2.44772 13 3V13.5858L16.2929 10.2929C16.6834 9.90237 17.3166 9.90237 17.7071 10.2929C18.0976 10.6834 18.0976 11.3166 17.7071 11.7071L12.7071 16.7071C12.3166 17.0976 11.6834 17.0976 11.2929 16.7071L6.29289 11.7071C5.90237 11.3166 5.90237 10.6834 6.29289 10.2929C6.68342 9.90237 7.31658 9.90237 7.70711 10.2929L11 13.5858V3C11 2.44772 11.4477 2 12 2Z"/>
        <path d="M4 20C4 19.4477 4.44772 19 5 19H19C19.5523 19 20 19.4477 20 20C20 20.5523 19.5523 21 19 21H5C4.44772 21 4 20.5523 4 20Z"/>
      </svg>
    )}
  </button>
);

const AppsFlyerDeleteButton: React.FC<{ disabled?: boolean; onClick: () => void; loading?: boolean }> = ({ disabled = false, onClick, loading = false }) => (
  <button
    onClick={onClick}
    disabled={disabled || loading}
    style={{
      WebkitFontSmoothing: 'antialiased',
      borderSpacing: 0,
      borderCollapse: 'collapse',
      boxSizing: 'inherit',
      border: 0,
      cursor: disabled ? 'not-allowed' : 'pointer',
      margin: 0,
      display: 'inline-flex',
      outline: 0,
      position: 'relative',
      alignItems: 'center',
      userSelect: 'none',
      verticalAlign: 'middle',
      justifyContent: 'center',
      textDecoration: 'none',
      backgroundColor: 'transparent',
      WebkitAppearance: 'none',
      WebkitTapHighlightColor: 'transparent',
      flex: '0 0 auto',
      color: disabled ? 'rgba(34,35,36,0.26)' : 'rgba(34,35,36,0.54)',
      overflow: 'visible',
      textAlign: 'center',
      transition: 'background-color 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms',
      borderRadius: '4px',
      fontSize: '1.125rem',
      padding: '6px',
      width: '32px',
      height: '32px'
    }}
    onMouseEnter={(e) => {
      if (!disabled && !loading) {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
        (e.currentTarget as HTMLButtonElement).style.color = 'rgba(34,35,36,0.87)';
      }
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
      (e.currentTarget as HTMLButtonElement).style.color = disabled ? 'rgba(34,35,36,0.26)' : 'rgba(34,35,36,0.54)';
    }}
  >
    {loading ? (
      <LoadingOutlined style={{ fontSize: '16px' }} />
    ) : (
      /* trash icon */
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ fill: 'currentColor' }}>
        <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM8 9H16V19H8V9ZM15.5 4L14.5 3H9.5L8.5 4H5V6H19V4H15.5Z"/>
      </svg>
    )}
  </button>
);

const ReportManagement: React.FC = () => {
  const { language } = useLanguage();
  const { currentUser, accountType, accountId } = useAuth();
  const { userProfile } = useUser();
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(true); // 初始状态设为true，显示Loading
  const [deleteConfirmModalVisible, setDeleteConfirmModalVisible] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<Report | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [previewing, setPreviewing] = useState<Record<string, boolean>>({});
  
  // 账户配置相关状态
  const [accountConfigs, setAccountConfigs] = useState<AccountConfig[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedManager, setSelectedManager] = useState<string>('');  // 新增Manager选择状态
  const [users, setUsers] = useState<string[]>([]);  // 新增用户列表状态
  const [managerSelectorVisible, setManagerSelectorVisible] = useState(false);  // 新增Manager选择器显示状态
  const [managerDropdownPosition, setManagerDropdownPosition] = useState({ top: 0, left: 0 });  // 新增Manager下拉位置状态
  const [accountSelectorVisible, setAccountSelectorVisible] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  // 计算下拉位置
  const calculateDropdownPosition = () => {
    const button = document.querySelector('[data-account-selector] button');
    if (button) {
      const rect = button.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX
      });
    }
  };

  // 计算Manager选择器的下拉位置
  const calculateManagerDropdownPosition = () => {
    const button = document.querySelector('[data-manager-selector] button');
    if (button) {
      const rect = button.getBoundingClientRect();
      setManagerDropdownPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX
      });
    }
  };

  // 权限判断函数
  const canDeleteReport = (record: Report): boolean => {
    // Super Admin可以删除所有报表
    if (userProfile?.role === 'Super Admin') {
      return true;
    }
    
    // 其他用户只能删除自己上传的报表
    return record.manager === userProfile?.username;
  };

  // 加载报表数据
  const loadReports = async () => {
    try {
      setLoading(true);
      setTableLoading(true); // 开始加载时显示Loading
      
      // 构建查询参数
      const params: any = {};
      
      // 如果选择了账户，添加账户筛选条件
      if (selectedAccounts.length > 0) {
        // 根据选择的账户名称找到对应的账户配置
        const selectedConfigs = accountConfigs.filter(config => 
          selectedAccounts.includes(config.accountName)
        );
        
        if (selectedConfigs.length > 0) {
          // 提取账户名称和类型进行筛选
          const accountNames = selectedConfigs.map(config => config.accountName);
          const accountTypes = selectedConfigs.map(config => config.accountType);
          
          // 添加筛选参数 - 使用账户名称而不是ID
          params.accountIds = accountNames.join(',');
          params.accountTypes = accountTypes.join(',');
          
          console.log('筛选参数:', { accountNames, accountTypes, params });
        }
      } else {
        // 如果没有选择账户（即选择"Select Account"），不添加筛选条件，显示所有报表
        console.log('未选择账户，显示所有报表');
      }
      
      // 如果选择了Manager，添加Manager筛选条件
      if (selectedManager) {
        params.manager = selectedManager;
        console.log('Manager筛选参数:', selectedManager);
      }
      
      // 发送请求获取筛选后的报表数据
      const response = await axiosInstance.get('/api/reports', { params });
      console.log('筛选后的报表数据:', response.data);
      setReports(response.data as Report[]);
    } catch (error) {
      console.error('加载报表失败:', error);
      message.error(language === 'en' ? 'Failed to load reports' : '加载报表失败');
    } finally {
      setLoading(false);
      setTableLoading(false); // 加载完成后隐藏Loading
    }
  };

  // 加载账户配置
  const loadAccountConfigs = async () => {
    try {
      console.log('开始加载账户配置...');
      const response = await axiosInstance.get('/api/global-account-configs');
      console.log('API响应:', response);
      
      if (response.status === 200) {
        const data = response.data as { configs?: any[] };
        console.log('响应数据:', data);
        
        const formattedConfigs = data.configs?.map((config: any) => ({
          id: config.id,
          accountName: config.account_name,
          accountType: config.account_type,
          apiToken: config.api_token
        })) || [];
        
        console.log('格式化后的配置:', formattedConfigs);
        setAccountConfigs(formattedConfigs);
        
        // 默认选择"Select Account"（全选）
        setSelectedAccounts([]);
        console.log('默认选择全选（无筛选）');
      } else {
        console.error('获取账户配置失败:', response.statusText);
        message.error('获取账户配置失败');
      }
    } catch (error) {
      console.error('加载账户配置失败:', error);
      message.error('加载账户配置失败');
    }
  };

  // 加载用户列表
  const loadUsers = async () => {
    try {
      console.log('开始加载用户列表...');
      const response = await axiosInstance.get('/api/users');
      console.log('用户API响应:', response);
      
      if (response.status === 200) {
        const data = response.data as { usernames?: string[] };
        console.log('用户数据:', data);
        
        if (data.usernames) {
          setUsers(data.usernames);
          console.log('成功加载用户列表:', data.usernames);
        } else {
          console.log('没有找到用户数据');
          setUsers([]);
        }
      } else {
        console.error('获取用户列表失败:', response.statusText);
        message.error('获取用户列表失败');
      }
    } catch (error) {
      console.error('加载用户列表失败:', error);
      message.error('加载用户列表失败');
    }
  };

  // 监听账户选择变化，自动重新加载数据
  useEffect(() => {
    if (accountConfigs.length > 0) {
      loadReports();
    }
  }, [selectedAccounts, selectedManager, accountConfigs]);  // 添加selectedManager监听
  


  useEffect(() => {
    loadAccountConfigs(); // 加载账户配置
    loadUsers(); // 加载用户列表

    // 连接WebSocket
    const socket = io('ws://www.afgo-workbench.icu', {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    // 监听窗口大小变化，重新计算下拉位置
    const handleResize = () => {
      if (accountSelectorVisible) {
        calculateDropdownPosition();
      }
      if (managerSelectorVisible) {
        // 计算Manager选择器的下拉位置
        calculateManagerDropdownPosition();
      }
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize);

    // 监听连接事件
    socket.on('connect', () => {
      console.log('WebSocket connected');
      message.success(language === 'en' ? 'WebSocket connected' : 'WebSocket已连接');
    });

    // 监听报表更新
    socket.on('report_update', (data: ReportUpdate) => {
      console.log('Received report update:', data);
      if (data.type === 'report_update' && data.status === 'success') {
        console.log('Processing report update with data:', data.report);
        console.log('Report fields:', {
          id: data.report.id,
          reportName: data.report.reportName,
          appName: data.report.appName,
          manager: data.report.manager,
          createTime: data.report.createTime,
          status: data.report.status
        });
        
        setReports(prev => {
          const index = prev.findIndex(r => r.id === data.report.id);
          if (index === -1) {
            // 新报告
            console.log('Adding new report:', data.report);
            return [data.report, ...prev];
          } else {
            // 更新现有报告
            console.log('Updating existing report:', data.report);
            const updated = [...prev];
            updated[index] = data.report;
            return updated;
          }
        });
      }
    });

    // 监听报表删除
    socket.on('report_deleted', (data: { type: string; reportKey: string }) => {
      console.log('Received report deletion:', data);
      if (data.type === 'report_deleted') {
        setReports(prev => prev.filter(report => report.id !== data.reportKey));
      }
    });

    // 监听错误
    socket.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      message.error(language === 'en' ? 'WebSocket connection error' : 'WebSocket连接错误');
    });

    return () => {
      socket.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize);
    };
  }, []);

  // 点击外部关闭账户选择器
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-account-selector]')) {
        setAccountSelectorVisible(false);
      }
      if (!target.closest('[data-manager-selector]')) {
        setManagerSelectorVisible(false);
      }
    };

    if (accountSelectorVisible || managerSelectorVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [accountSelectorVisible, managerSelectorVisible]);

  // 账户选择器动画效果
  useEffect(() => {
    const element = document.querySelector('[data-account-selector-dropdown]') as HTMLElement;
    if (element) {
      if (accountSelectorVisible) {
        // 展开动画
        const timer = setTimeout(() => {
          element.style.transform = 'translateY(0) scale(1)';
          element.style.opacity = '1';
        }, 10);
        return () => clearTimeout(timer);
      } else {
        // 收回动画
        element.style.transform = 'translateY(-10px) scale(0.95)';
        element.style.opacity = '0';
      }
    }
  }, [accountSelectorVisible]);

  // Manager选择器动画效果
  useEffect(() => {
    const element = document.querySelector('[data-manager-selector-dropdown]') as HTMLElement;
    if (element) {
      if (managerSelectorVisible) {
        // 展开动画
        const timer = setTimeout(() => {
          element.style.transform = 'translateY(0) scale(1)';
          element.style.opacity = '1';
        }, 10);
        return () => clearTimeout(timer);
      } else {
        // 收回动画
        element.style.transform = 'translateY(-10px) scale(0.95)';
        element.style.opacity = '0';
      }
    }
  }, [managerSelectorVisible]);

  const handleDownload = async (record: Report) => {
    try {
      if (record.status !== 'completed') {
        message.warning(language === 'en' ? 'Only completed reports can be downloaded' : '只能下载已完成的报表');
        return;
      }

      setDownloading(prev => ({ ...prev, [record.id]: true }));

      // 使用Home页面的下载逻辑
      // 首先从后端获取正确的下载URL（重新执行Home页面的查询逻辑）
      const response = await axiosInstance.get<{
        success: boolean;
        downloadUrl?: string;
        message?: string;
      }>(`/api/reports/${record.id}/download-url`, {
        params: {
          accountType: record.accountType,
          accountId: record.accountId
        }
      });
      
      if (response.data.success && response.data.downloadUrl) {
        // 使用获取到的下载URL（这是Home页面使用的同一个URL）
        console.log(`使用Home页面的下载URL: ${response.data.downloadUrl}`);
        
        // 直接使用浏览器原生下载，就像Home页面一样
        window.open(response.data.downloadUrl, '_blank');
        message.success(language === 'en' ? 'Download successful' : '下载成功');
      } else {
        throw new Error(response.data.message || 'Failed to get download URL');
      }
    } catch (error) {
      console.error('下载失败:', error);
      message.error(language === 'en' ? 'Download failed' : '下载失败');
    } finally {
      setDownloading(prev => ({ ...prev, [record.id]: false }));
    }
  };



  const handleCheck = async (record: Report) => {
    try {
      setPreviewing(prev => ({ ...prev, [record.id]: true }));
      
      const response = await axiosInstance.get(`/api/reports/${record.id}/preview`, {
        params: {
          accountType: record.accountType,
          accountId: record.accountId
        }
      });
      setPreviewData(response.data as any[]);
      setSelectedReport(record);
      setPreviewModalVisible(true);
    } catch (error) {
      console.error('获取预览数据失败:', error);
      message.error(language === 'en' ? 'Failed to get preview data' : '获取预览数据失败');
    } finally {
      setPreviewing(prev => ({ ...prev, [record.id]: false }));
    }
  };

  const handleDelete = async (record: Report) => {
    setRecordToDelete(record);
    setDeleteConfirmModalVisible(true);
  };

  const confirmDelete = async () => {
    if (!recordToDelete) return;
    
    try {
      setDeleting(prev => ({ ...prev, [recordToDelete.id]: true }));
      
      await axiosInstance.delete(`/api/reports/${recordToDelete.id}`, {
        params: {
          accountType: recordToDelete.accountType,
          accountId: recordToDelete.accountId
        }
      });

      message.success(language === 'en' ? 'Delete successful' : '删除成功');
      setDeleteConfirmModalVisible(false);
      setRecordToDelete(null);
    } catch (error) {
      console.error('删除失败:', error);
      message.error(language === 'en' ? 'Delete failed' : '删除失败');
    } finally {
      if (recordToDelete) {
        setDeleting(prev => ({ ...prev, [recordToDelete.id]: false }));
      }
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmModalVisible(false);
    setRecordToDelete(null);
  };

  const columns = [
    {
      title: language === 'en' ? 'Report Name' : '报表名称',
      dataIndex: 'reportName',
      key: 'reportName',
      align: 'center' as const,
      width: 280, // Report Name列宽
    },
    {
      title: language === 'en' ? 'App Name' : '应用名称',
      dataIndex: 'appName',
      key: 'appName',
      align: 'center' as const,
      width: 150, // 应用名称列宽
      render: (appName: string) => {
        return appName || '-'; // 如果没有数据则显示'-'
      },
    },
    {
      title: language === 'en' ? 'Manager' : '上传者',
      dataIndex: 'manager',
      key: 'manager',
      align: 'center' as const,
      width: 100, // 减小上传者列宽
      render: (manager: string) => {
        return manager || '-'; // 如果没有数据则显示'-'
      },
    },
    {
      title: language === 'en' ? 'Upload Time' : '上传时间',
      dataIndex: 'createTime',
      key: 'createTime',
      align: 'center' as const,
      width: 160, // 增加Upload Time列宽
      render: (createTime: string) => {
        if (!createTime) return '';
        // 将 2025-07-31T17:17:55 格式转换为 2025-07-31(17:17:55)
        return createTime.replace('T', '(') + ')';
      },
    },
    {
      title: (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: 0, margin: 0 }}>
          {language === 'en' ? 'Status' : '状态'}
        </div>
      ),
      dataIndex: 'status',
      key: 'status',
      width: 80,
      align: 'center' as const,
      render: (status: string) => {
        let color = 'default';
        let fill = '#fff';
        
        if (status === 'completed') {
          color = 'green';
          fill = '#52c41a';
        } else if (status === 'processing' || status === 'uploading') {
          color = 'processing';
          fill = '#1677ff';
        } else if (status === 'failed') {
          color = 'error';
          fill = '#ff4d4f';
        }
        
        return (
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: 0, margin: 0 }}>
            <Tag
              color={fill}
              style={{
                minWidth: 40,
                textAlign: 'center',
                margin: 0,
                padding: '0 8px',
                height: 24,
                lineHeight: '24px',
                fontSize: 14,
                background: fill,
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                position: 'relative',
                overflow: 'visible',
              }}
            >
              {status === 'completed' 
                ? (language === 'en' ? 'Completed' : '已完成')
                : status === 'processing' || status === 'uploading'
                ? (language === 'en' ? 'Processing' : '处理中')
                : (language === 'en' ? 'Failed' : '失败')}
            </Tag>
          </div>
        );
      }
    },
    {
      title: language === 'en' ? 'Size' : '大小',
      dataIndex: 'size',
      key: 'size',
      align: 'center' as const,
      width: 100, // 减小Size列宽
      render: (size: number) => {
        if (size < 1024 * 1024) {
          // 小于1MB，显示为KB
          return `${(size / 1024).toFixed(2)} KB`;
        } else {
          // 大于等于1MB，显示为MB
          return `${(size / 1024 / 1024).toFixed(2)} MB`;
        }
      },
    },
    {
      title: language === 'en' ? 'Actions' : '操作',
      key: 'action',
      width: 100,
      align: 'center' as const,
      render: (_: any, record: Report) => (
        <Space size="middle">
          <Tooltip title={language === 'en' ? 'Preview Report' : '预览报表'}>
            <span>
              <IconPreviewButton
                onClick={() => handleCheck(record)}
                disabled={record.status !== 'completed'}
                loading={previewing[record.id]}
              />
            </span>
          </Tooltip>
          <Tooltip title={language === 'en' ? 'Download Report' : '下载报表'}>
            <span>
              <AppsFlyerDownloadButton
                onClick={() => handleDownload(record)}
                disabled={record.status !== 'completed'}
                loading={downloading[record.id]}
              />
            </span>
          </Tooltip>
          <Tooltip title={canDeleteReport(record) ? (language === 'en' ? 'Delete Report' : '删除报表') : (language === 'en' ? 'No permission to delete' : '无删除权限')}>
            <span>
              <AppsFlyerDeleteButton
                onClick={() => handleDelete(record)}
                disabled={!canDeleteReport(record)}
                loading={deleting[record.id]}
              />
            </span>
          </Tooltip>
        </Space>
      ),
    },
  ];



  return (
    <div style={{ padding: '24px' }}>
      <style>
        {`
          .ant-select-selection-search-input { display: none !important; }
          .ant-select-selection-item { cursor: pointer !important; }
          .ant-select-selection-placeholder { cursor: pointer !important; }
          .ant-pagination-options .ant-select { width: 110px !important; }
          .ant-pagination-options .ant-select-selector { width: 110px !important; }
          .ant-pagination-options .ant-select-selection-item { width: 110px !important; text-align: center !important; }
          .ant-pagination-options .ant-select-selection-placeholder { width: 110px !important; text-align: center !important; }
          .ant-pagination-total-text { line-height: 32px !important; height: 32px !important; display: inline-block !important; }
          .ant-table-thead > tr > th { background-color: #fafafa !important; border-bottom: 1px solid #f0f0f0 !important; font-weight: 600 !important; }
          .ant-table-tbody > tr > td { border-bottom: 1px solid #f0f0f0 !important; }
          .ant-table-tbody > tr:hover > td { background-color: #f5f5f5 !important; }
          .ant-table { border: 1px solid #f0f0f0 !important; border-radius: 6px !important; }
          .ant-table-container { border-radius: 6px !important; }
          
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
          
          /* 分页选择器样式自定义 - 参考Home页面 */
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
          
          /* 分页选择器下拉弹层样式 - 参考Home页面 */
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
            -webkit-tap-highlight-color: rgba(0,0,0,0) !important;
            font-family: "Museo Sans", sans-serif !important;
            font-weight: 300 !important;
            font-size: 13px !important;
            line-height: 20px !important;
            letter-spacing: 0.0025em !important;
            color: rgb(34, 13, 78) !important;
            padding-top: 0 !important;
            padding-bottom: 0 !important;
            box-sizing: border-box !important;
            max-height: 380px !important;
            overflow-y: overlay !important;
            position: relative !important;
            background: rgb(255, 255, 255) !important;
          }
          
          /* 分页选择器下拉选项样式 - 参考Home页面 */
          .ant-pagination-options .ant-select-dropdown .ant-select-item,
          .ant-pagination-options .ant-select-dropdown .ant-select-item-option,
          .ant-pagination-options .ant-select-dropdown .ant-select-item-option-content {
            border-radius: 0 !important;
            margin: 0 !important;
            padding: 8px 12px !important;
            min-height: 36px !important;
            display: flex !important;
            align-items: center !important;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1) !important;
            border: none !important;
            outline: none !important;
            box-shadow: none !important;
            background: transparent !important;
          }
          
          /* 分页选择器选项悬停状态 - 无边距覆盖 */
          .ant-pagination-options .ant-select-dropdown .ant-select-item-option:hover {
            background-color: rgba(114, 46, 209, 0.04) !important;
            transform: none !important;
            margin: 0 !important;
            border-radius: 0 !important;
          }
          
          /* 分页选择器选项激活状态 - 无边距覆盖 */
          .ant-pagination-options .ant-select-dropdown .ant-select-item-option-active {
            border-radius: 0 !important;
            background-color: rgba(114, 46, 209, 0.08) !important;
            outline: none !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
          
          /* 分页选择器选项选中状态 - 无边距覆盖 */
          .ant-pagination-options .ant-select-dropdown .ant-select-item-option-selected {
            border-radius: 0 !important;
            background-color: rgba(114, 46, 209, 0.12) !important;
            outline: none !important;
            box-shadow: none !important;
            font-weight: 500 !important;
            margin: 0 !important;
          }
          
          /* 分页选择器选项文本样式 */
          .ant-pagination-options .ant-select-dropdown .ant-select-item-option-content {
            font-size: 13px !important;
            line-height: 20px !important;
            color: rgb(34, 13, 78) !important;
            font-weight: 400 !important;
            letter-spacing: 0.0025em !important;
          }
          
          /* 分页选择器选中项文本样式 */
          .ant-pagination-options .ant-select-dropdown .ant-select-item-option-selected .ant-select-item-option-content {
            font-weight: 500 !important;
            color: rgb(114, 46, 209) !important;
          }
        `}
      </style>
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '18px', fontWeight: 600 }}>
              {language === 'en' ? 'Public Report Management' : '公开报表管理'}
            </span>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {/* Manager选择器 */}
              <div style={{ position: 'relative', zIndex: 9999 }} data-manager-selector>
                <button
                  onClick={() => {
                    if (!managerSelectorVisible) {
                      calculateManagerDropdownPosition();
                    }
                    setManagerSelectorVisible(!managerSelectorVisible);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    border: '1px solid #d9d9d9',
                    borderRadius: '4px',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontFamily: '"Museo Sans", sans-serif',
                    fontWeight: 300,
                    color: 'rgb(34, 13, 78)',
                    minWidth: '150px',
                    justifyContent: 'space-between',
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
                  <span>
                    {selectedManager || (language === 'zh' ? '选择Manager' : 'Select Manager')}
                  </span>
                  <svg 
                    width="12" 
                    height="12" 
                    viewBox="0 0 12 12" 
                    fill="none"
                    style={{
                      transform: managerSelectorVisible ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease'
                    }}
                  >
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {managerSelectorVisible && (
                  <div
                    data-manager-selector-dropdown
                    style={{
                      position: 'fixed',
                      top: `${managerDropdownPosition.top}px`,
                      left: `${managerDropdownPosition.left}px`,
                      zIndex: 99999,
                      background: 'rgb(255, 255, 255)',
                      color: 'rgb(34, 13, 78)',
                      boxShadow: 'rgba(3, 109, 235, 0.03) 0px 2px 4px, rgba(3, 109, 235, 0.02) 0px 4px 5px, rgba(3, 109, 235, 0.12) 0px 1px 10px',
                      borderRadius: '4px',
                      width: '150px',
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
                      transform: 'translateY(-10px) scale(0.95)',
                      opacity: 0,
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      transformOrigin: 'top center'
                    }}
                  >
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      {/* 添加"Select Manager"选项 */}
                      <div
                        onClick={() => {
                          setSelectedManager('');
                          setManagerSelectorVisible(false);
                        }}
                        style={{
                          padding: '10px 16px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          borderBottom: '1px solid #f8f8f8',
                          backgroundColor: selectedManager === '' ? '#f6f8ff' : 'transparent',
                          transition: 'background-color 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (selectedManager !== '') {
                            e.currentTarget.style.backgroundColor = '#fafafa';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedManager !== '') {
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
                            {language === 'zh' ? '选择Manager' : 'Select Manager'}
                          </div>
                          <div style={{
                            fontSize: '11px',
                            color: '#666',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {language === 'zh' ? '显示所有报表' : 'Show all reports'}
                          </div>
                        </div>
                      </div>
                      {/* 用户列表 */}
                      {users.map((username, index) => (
                        <div
                          key={index}
                          onClick={() => {
                            setSelectedManager(username);
                            setManagerSelectorVisible(false);
                          }}
                          style={{
                            padding: '10px 16px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            borderBottom: index < users.length - 1 ? '1px solid #f8f8f8' : 'none',
                            backgroundColor: selectedManager === username ? '#f6f8ff' : 'transparent',
                            transition: 'background-color 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (selectedManager !== username) {
                              e.currentTarget.style.backgroundColor = '#fafafa';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (selectedManager !== username) {
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
                              {username}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              {/* 账户选择器 */}
              <div style={{ position: 'relative', zIndex: 9999 }} data-account-selector>
                <button
                  onClick={() => {
                    if (!accountSelectorVisible) {
                      calculateDropdownPosition();
                    }
                    setAccountSelectorVisible(!accountSelectorVisible);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    border: '1px solid #d9d9d9',
                    borderRadius: '4px',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontFamily: '"Museo Sans", sans-serif',
                    fontWeight: 300,
                    color: 'rgb(34, 13, 78)',
                    minWidth: '150px',
                    justifyContent: 'space-between',
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
                  <span>
                    {selectedAccounts.length > 0 
                      ? selectedAccounts[0]  // 单选模式，只显示第一个选中的账户
                      : (language === 'zh' ? '选择账户' : 'Select Account')
                    }
                  </span>
                  <svg 
                    width="12" 
                    height="12" 
                    viewBox="0 0 12 12" 
                    fill="none"
                    style={{
                      transform: accountSelectorVisible ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease'
                    }}
                  >
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {accountSelectorVisible && (
                  <div
                    data-account-selector-dropdown
                    style={{
                      position: 'fixed',
                      top: `${dropdownPosition.top}px`,
                      left: `${dropdownPosition.left}px`,
                      zIndex: 99999,
                      background: 'rgb(255, 255, 255)',
                      color: 'rgb(34, 13, 78)',
                      boxShadow: 'rgba(3, 109, 235, 0.03) 0px 2px 4px, rgba(3, 109, 235, 0.02) 0px 4px 5px, rgba(3, 109, 235, 0.12) 0px 1px 10px',
                      borderRadius: '4px',
                      width: '150px',
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
                      transform: 'translateY(-10px) scale(0.95)',
                      opacity: 0,
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      transformOrigin: 'top center'
                    }}
                  >

                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      {/* 添加"Select Account"选项 */}
                      <div
                        onClick={() => {
                          setSelectedAccounts([]);
                          setAccountSelectorVisible(false);
                        }}
                        style={{
                          padding: '10px 16px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          borderBottom: '1px solid #f8f8f8',
                          backgroundColor: selectedAccounts.length === 0 ? '#f6f8ff' : 'transparent',
                          transition: 'background-color 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (selectedAccounts.length > 0) {
                            e.currentTarget.style.backgroundColor = '#fafafa';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedAccounts.length > 0) {
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
                            {language === 'zh' ? '选择账户' : 'Select Account'}
                          </div>
                          <div style={{ 
                            fontSize: '11px', 
                            color: '#666',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {language === 'zh' ? '显示所有报表' : 'Show all reports'}
                          </div>
                        </div>
                      </div>
                      
                      {accountConfigs.length === 0 ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
                          {language === 'zh' ? '暂无账户配置' : 'No account configs'}
                        </div>
                      ) : (
                        accountConfigs.map((config) => (
                          <div
                            key={config.id}
                            onClick={() => {
                              // 单选模式：直接设置选中的账户
                              setSelectedAccounts([config.accountName]);
                              setAccountSelectorVisible(false);
                            }}
                            style={{
                              padding: '10px 16px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              borderBottom: '1px solid #f8f8f8',
                              backgroundColor: selectedAccounts.includes(config.accountName) ? '#f6f8ff' : 'transparent',
                              transition: 'background-color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              if (!selectedAccounts.includes(config.accountName)) {
                                e.currentTarget.style.backgroundColor = '#fafafa';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!selectedAccounts.includes(config.accountName)) {
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
                                {config.accountName}
                              </div>
                              <div style={{ 
                                fontSize: '11px', 
                                color: '#666',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {config.accountType}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        }
        style={{
          WebkitFontSmoothing: 'antialiased',
          textSizeAdjust: '100%',
          color: 'rgb(34, 13, 78)',
          fontFamily: '"Museo Sans", sans-serif',
          fontWeight: 300,
          fontSize: 13,
          lineHeight: '20px',
          letterSpacing: '0.0025em',
          boxSizing: 'inherit',
          margin: 24,
          padding: 24,
          borderRadius: 4,
          border: '1px solid rgb(230, 233, 240)',
          background: 'rgb(255, 255, 255)',
          maxWidth: '1200px',
          marginLeft: 'auto',
          marginRight: 'auto'
        }}
      >
        {/* AppsFlyer-like table presentation styles (visual only) */}
        <style>
          {`
          .appsflyer-table .ant-table {
            -webkit-font-smoothing: antialiased;
            text-size-adjust: 100%;
            color: rgb(34, 13, 78);
            font-family: "Museo Sans", sans-serif;
            font-weight: 300;
            font-size: 13px;
            line-height: 20px;
            letter-spacing: 0.0025em;
            box-sizing: inherit;
          }
          .appsflyer-table .ant-table table {
            border-collapse: collapse;
            border-spacing: 0px;
          }
          .appsflyer-table .ant-table-thead { display: table-header-group; }
          .appsflyer-table .ant-table-tbody { display: table-row-group; }
          .appsflyer-table .ant-table-thead > tr > th,
          .appsflyer-table .ant-table-tbody > tr > td {
            white-space: nowrap;
            overflow: hidden;
          }
          .appsflyer-table .ant-table-content { transform: translateZ(0); }
          .appsflyer-table .ant-table-container,
          .appsflyer-table .ant-table-body {
            overscroll-behavior-x: contain;
            scroll-behavior: auto;
          }
          .appsflyer-table .ant-table table { table-layout: auto; }
          .appsflyer-table .ant-table-thead > tr > th,
          .appsflyer-table .ant-table-tbody > tr > td {
            width: auto !important;
          }
          .appsflyer-table .ant-table,
          .appsflyer-table .ant-table-container,
          .appsflyer-table .ant-table-content,
          .appsflyer-table .ant-table-header {
            border-radius: 2px !important;
          }
          .appsflyer-table .ant-table-thead > tr > th {
            border-radius: 0 !important;
          }
          .appsflyer-table .ant-table-thead > tr > th:first-child {
            border-top-left-radius: 2px !important;
          }
          .appsflyer-table .ant-table-thead > tr > th:last-child {
            border-top-right-radius: 2px !important;
          }
          .appsflyer-table .ant-table-container { 
            border-right: none !important; 
            background: #fff !important; 
          }
          .appsflyer-table .ant-table-content { 
            background: #fff !important; 
          }
          .appsflyer-table .ant-table-body { 
            background: #fff !important; 
          }
          .appsflyer-table .ant-table-body::-webkit-scrollbar {
            height: 8px;
            width: 8px;
          }
          .appsflyer-table .ant-table-body::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 4px;
          }
          .appsflyer-table .ant-table-body::-webkit-scrollbar-thumb {
            background: #c1c1c1;
            border-radius: 4px;
          }
          .appsflyer-table .ant-table-body::-webkit-scrollbar-thumb:hover {
            background: #a8a8a8;
          }
          
          /* 表格行渐进式显示动画 */
          .appsflyer-table .ant-table-tbody > tr.fade-in-row {
            animation: fadeInRow 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
            animation-delay: calc(var(--row-index, 0) * 0.1s);
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          
          @keyframes fadeInRow {
            0% {
              opacity: 0;
              transform: translateY(20px) scale(0.95);
            }
            50% {
              opacity: 0.7;
              transform: translateY(10px) scale(0.98);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          
          /* 确保Loading覆盖层完全不透明 */
          .table-loading-overlay {
            background: #ffffff !important;
            background-color: #ffffff !important;
            background-image: none !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            /* 强制完全不透明 */
            opacity: 1 !important;
            /* 确保覆盖所有内容 */
            z-index: 1000 !important;
            /* 强制背景色 */
            background: #ffffff !important;
            background-color: #ffffff !important;
            /* 禁用任何透明度 */
            filter: none !important;
            -webkit-filter: none !important;
          }
          
          /* 表格淡入动画优化 */
          .appsflyer-table {
            will-change: opacity, transform; /* 优化动画性能 */
          }
          `}
        </style>
        <div style={{ position: 'relative' }}>
          <Table
            className="appsflyer-table"
            columns={columns}
            dataSource={reports}
            loading={false} // 禁用默认Loading，使用自定义Loading
            locale={{ emptyText: language === 'en' ? 'No Data' : '暂无数据' }}
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: reports.length,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `${language === 'en' ? 'Total' : '共'} ${total} ${language === 'en' ? 'Volume' : '条'}`,
              pageSizeOptions: ['10', '25', '50'],
              onChange: (page, size) => { setCurrentPage(page); setPageSize(size); },
              onShowSizeChange: (current, size) => { setCurrentPage(current); setPageSize(size); },
              size: 'default',
              locale: {
                items_per_page: language === 'en' ? ' / Page' : ' / 页',
                jump_to: language === 'en' ? 'Go to' : '跳至',
                jump_to_confirm: language === 'en' ? 'Go' : '确定',
                page: language === 'en' ? 'Page' : '页'
              }
            }}
            rowKey="id"
            style={{ 
              margin: '16px auto', 
              maxWidth: '100%',
              opacity: tableLoading ? 0 : 1, // Loading时隐藏表格，完成后显示
              transition: 'opacity 1s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 1s cubic-bezier(0.25, 0.46, 0.45, 0.94)', // 表格淡入动画：1秒
              transform: tableLoading ? 'translateY(15px) scale(0.98)' : 'translateY(0) scale(1)', // Loading时轻微下移和缩小，完成后回到原位
              transformOrigin: 'center top', // 从顶部中心开始变换
            }}
            scroll={{ x: 'max-content' }}
            bordered
            size="middle"
            rowClassName={(record, index) => {
              let className = '';
              // 为每一行添加动画延迟
              if (!tableLoading) {
                className += ' fade-in-row';
              }
              return className.trim();
            }}
            onRow={(record, index) => ({ 
              id: `row-${record.id}`,
              style: {
                '--row-index': index || 0,
                animationDelay: `${(index || 0) * 0.1}s`
              } as React.CSSProperties
            })}
          />
          
          {/* 表格Loading覆盖层 - 完全覆盖表格区域（包括表头） */}
          <div 
            className="table-loading-overlay"
            style={{
              position: 'absolute',
              top: '-24px', // 向上扩展，覆盖Card的padding区域，确保覆盖表头
              left: '-24px', // 向左扩展，覆盖Card的padding区域
              right: '-24px', // 向右扩展，覆盖Card的padding区域
              bottom: '-24px', // 向下扩展，覆盖Card的padding区域
              background: '#ffffff', // 完全不透明，完全遮挡表格内容
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000, // 大幅提高z-index，确保覆盖所有元素
              borderRadius: '8px',
              pointerEvents: 'none', // 允许点击穿透到下层
              opacity: tableLoading ? 1 : 0, // 根据加载状态控制透明度
              transition: 'opacity 1s cubic-bezier(0.25, 0.46, 0.45, 0.94)', // Loading淡出：1秒
              visibility: tableLoading ? 'visible' : 'hidden', // 加载完成后完全隐藏
              // 确保Loading覆盖层完全遮挡表格内容
              boxShadow: '0 0 0 2px #ffffff', // 增加白色边框宽度，确保完全覆盖
              backdropFilter: 'blur(0px)', // 禁用任何背景模糊效果
              // 强制覆盖所有内容
              overflow: 'hidden' // 防止内容溢出
            }}
          >
            {/* 紫色主题的按钮样式Loading */}
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: '3px solid rgba(114, 46, 209, 0.2)',
              borderTop: '3px solid #722ED1',
              animation: 'spin 1s linear infinite'
            }} />
            <div style={{
              color: '#722ED1',
              fontSize: '14px',
              fontWeight: '500',
              marginTop: '16px'
            }}>
              {language === 'en' ? 'Loading' : '加载中'}
            </div>
          </div>
        </div>
      </Card>

      {/* 删除确认对话框 */}
      <Modal
        title={language === 'en' ? 'Confirm Delete' : '确认删除'}
        open={deleteConfirmModalVisible}
        onOk={confirmDelete}
        onCancel={cancelDelete}
        okText={language === 'en' ? 'Confirm' : '确认'}
        cancelText={language === 'en' ? 'Cancel' : '取消'}
        confirmLoading={recordToDelete ? deleting[recordToDelete.id] : false}
      >
        <p>
          {language === 'en' 
            ? 'Are you sure you want to delete this report? This action cannot be undone.'
            : '确定要删除该报表记录吗？此操作不可恢复。'
          }
        </p>
      </Modal>

      {/* 文件预览窗体 */}
      <Modal
        title={`${language === 'en' ? 'Preview' : '预览'} - ${selectedReport?.reportName}`}
        open={previewModalVisible}
        onCancel={() => setPreviewModalVisible(false)}
        footer={null}
        width={1200}
        style={{ top: 20 }}
      >
        {previewData.length > 0 ? (
          <div style={{ maxHeight: '600px', overflow: 'auto' }}>
            <Table
              dataSource={previewData}
              columns={
                // 获取所有数据中出现的字段，保持原始顺序
                (() => {
                  const allKeys = new Set<string>();
                  previewData.forEach(row => {
                    Object.keys(row).forEach(key => allKeys.add(key));
                  });
                  
                  // 按照数据中字段出现的顺序来定义列
                  return Array.from(allKeys).map(key => ({
                    title: key,
                    dataIndex: key,
                    key: key,
                    width: 150,
                    ellipsis: true,
                    render: (text: string) => (
                      <Tooltip title={text}>
                        <span style={{ fontSize: '12px' }}>
                          {text && text.length > 20 ? `${text.substring(0, 20)}...` : text}
                        </span>
                      </Tooltip>
                    )
                  }));
                })()
              }
              size="small"
              scroll={{ x: 'max-content', y: 500 }}
              bordered
            />
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p>{language === 'en' ? 'No preview data available' : '暂无预览数据'}</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ReportManagement; 