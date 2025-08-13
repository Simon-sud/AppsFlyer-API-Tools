import React, { useState, useEffect } from 'react';
import { Layout, Menu, Card, Button, Upload, message, Typography, Select, Modal, Table, Spin } from 'antd';
import * as XLSX from 'xlsx';
import {
  BgColorsOutlined, DatabaseOutlined, UploadOutlined, KeyOutlined, DeleteOutlined
} from '@ant-design/icons';
import { useLanguage } from '../contexts/LanguageContext';
import AppsFinder from './AppsFinder';
import { useAuth } from '../contexts/AuthContext';
import { useUser } from '../contexts/UserContext';
import { useAccount } from '../contexts/AccountContext';
import { axiosInstance } from '../services/api';

const { Sider, Content } = Layout;
const { Title } = Typography;

const UploadPanel: React.FC = () => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const props = {
    name: 'file',
    accept: '.xlsx,.xls,.csv',
    showUploadList: false,
    customRequest: async (options: any) => {
      setUploading(true);
      setTimeout(() => {
        setUploading(false);
        setFileName(options.file.name);
        message.success('上传成功（仅前端演示，需后端API对接）');
      }, 1200);
    },
    beforeUpload: (file: File) => {
      const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.type === 'application/vnd.ms-excel' ||
        file.name.endsWith('.csv');
      if (!isExcel) {
        message.error('只支持Excel或CSV文件');
      }
      return isExcel;
    },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, padding: '32px 0' }}>
      <Title level={4} style={{ textAlign: 'center', marginBottom: 0 }}>数据库导入（上传Excel/CSV）</Title>
      <Upload {...props}>
        <Button type="primary" icon={<UploadOutlined />} loading={uploading} style={{ minWidth: 120 }}>
          {uploading ? '上传中...' : '上传文件'}
        </Button>
      </Upload>
      {fileName && <div style={{ color: '#52c41a', fontWeight: 500 }}>已上传：{fileName}</div>}
    </div>
  );
};

const AccountRefreshRule: React.FC<{ userKey: string }> = ({ userKey }) => {
  const [hovered, setHovered] = useState(false);
  const key = `accountRefreshRule_${userKey}`;
  const [value, setValue] = useState(() => localStorage.getItem(key) || '5MIN');
  const handleChange = (val: string) => {
    setValue(val);
    localStorage.setItem(key, val);
  };
  return (
    <div
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: 6,
        width: '100%',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        padding: '0 32px',
        background: '#fff',
        transition: 'transform 0.18s cubic-bezier(.4,1.2,.6,1)',
        transform: hovered ? 'scale(1.01)' : 'scale(1)',
        zIndex: 1,
        marginBottom: 16,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ fontSize: 18, fontWeight: 500, color: '#222' }}>Account Refresh Rule</span>
      <Select
        dropdownClassName="af-form"
        value={value}
        onChange={handleChange}
        style={{ width: 120, borderRadius: 12, height: 40 }}
        options={[
          { value: '5MIN', label: '5MIN' },
          { value: '10MIN', label: '10MIN' },
          { value: '15MIN', label: '15MIN' },
        ]}
      />
    </div>
  );
};

const AppsFinderSetting: React.FC = () => {
  const [hovered, setHovered] = useState(false);
  const { userProfile } = useUser();
  const isSuperAdmin = userProfile?.role === 'Super Admin';
  const [modalOpen, setModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [errorList, setErrorList] = useState<string[]>([]);

  // 允许的字段
  const requiredFields = ['app_id', 'os', 'app_name', 'developer', 'category', 'description', 'url'];
  // 字段映射
  const fieldMap: Record<string, string> = {
    'os': 'os',
    'app id': 'app_id', 'appid': 'app_id', 'app_id': 'app_id',
    'app name': 'app_name', 'appname': 'app_name', 'app_name': 'app_name',
    'developer': 'developer',
    'category': 'category',
    'description': 'description',
    'url': 'url', 'link': 'url',
  };
  function cleanHeader(header: string) {
    return header.replace(/[\s\u3000\uFEFF\xa0]+/g, '').toLowerCase();
  }
  // 新增：用于显示原始和清洗后的字段
  const [rawFields, setRawFields] = useState<string[]>([]);
  const [normalizedFields, setNormalizedFields] = useState<string[]>([]);

  // 新增：上传区域 hover 状态
  const [uploadHover, setUploadHover] = useState(false);

  // 解析文件
  const handleFile = (file: File) => {
    setUploading(true);
    setPreviewData([]);
    setColumns([]);
    setErrorMsg('');
    setErrorList([]);
    setRawFields([]);
    setNormalizedFields([]);
    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, any>[];
        // 记录原始字段
        const firstRow = (jsonData[0] || {}) as Record<string, any>;
        const rawKeys = Object.keys(firstRow);
        setRawFields(rawKeys);
        // 清洗并标准化字段
        const normalizedData = jsonData.map((row: Record<string, any>) => {
          const newRow: Record<string, any> = {};
          Object.keys(row).forEach(k => {
            const stdKey = fieldMap[cleanHeader(k)];
            if (stdKey) {
              newRow[stdKey] = row[k];
            }
          });
          return newRow;
        });
        // 记录清洗后的字段
        const normKeys = Object.keys((normalizedData[0] || {}) as Record<string, any>);
        setNormalizedFields(normKeys);
        // 控制台输出调试
        console.log('首行原始数据:', firstRow);
        console.log('首行清洗后数据:', normalizedData[0]);
        console.log('所有原始字段:', rawKeys);
        console.log('所有清洗后字段:', normKeys);
        // 字段校验
        const missing = requiredFields.filter(f => !normKeys.includes(f));
        if (missing.length > 0) {
          const msg = '缺少字段: ' + missing.join(',');
          setErrorMsg(msg);
          setErrorList([]);
          message.error(msg);
          setUploading(false);
          setPreviewData([]);
          setColumns([]);
          return false;
        }
        setPreviewData(normalizedData);
        setColumns(
          requiredFields.map(f => ({
            title: f,
            dataIndex: f,
            key: f,
            align: 'center',
            width: f === 'description' ? 480 : 120
          }))
        );
        setErrorMsg('');
        setErrorList([]);
        message.success('解析成功，可预览并上传');
      } catch (err) {
        const msg = '文件解析失败';
        setErrorMsg(msg);
        setErrorList([err instanceof Error ? err.message : String(err)]);
        message.error(msg);
        console.error('文件解析异常:', err);
        setPreviewData([]);
        setColumns([]);
      }
      setUploading(false);
    };
    reader.readAsArrayBuffer(file);
    return false; // 阻止Upload自动上传
  };

  // 上传到后端
  const handleUpload = async () => {
    setUploading(true);
    setErrorMsg('');
    setErrorList([]);
    try {
      const res = await fetch('/api/apps-finder/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(previewData),
      });
      let result: any = {};
      try {
        result = await res.json();
      } catch (jsonErr) {
        setErrorMsg('后端返回内容无法解析');
        setErrorList([jsonErr instanceof Error ? jsonErr.message : String(jsonErr)]);
        message.error('后端返回内容无法解析');
        console.error('后端返回内容无法解析:', jsonErr);
        setUploading(false);
        return;
      }
      if (res.ok && result.success) {
        message.success(`上传成功，插入${result.inserted}条记录`);
        setModalOpen(false);
        setPreviewData([]);
        setColumns([]);
        setErrorMsg('');
        setErrorList([]);
      } else {
        const msg = result.message || '上传失败';
        setErrorMsg(msg);
        setErrorList(result.errors || []);
        message.error(msg);
        if (result.errors && result.errors.length) {
          // 详细错误弹窗
          Modal.error({
            title: '详细错误',
            content: (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {result.errors.map((err: string, idx: number) => (
                  <div key={idx} style={{ color: '#d4380d', marginBottom: 4 }}>{err}</div>
                ))}
              </div>
            ),
            width: 500,
          });
        }
      }
    } catch (e) {
      const msg = '上传失败，网络或服务器异常';
      setErrorMsg(msg);
      setErrorList([e instanceof Error ? e.message : String(e)]);
      message.error(msg);
      console.error('上传异常:', e);
    }
    setUploading(false);
  };

  return (
    <div
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: 6,
        width: '100%',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        padding: '0 32px',
        background: '#fff',
        transition: 'transform 0.18s cubic-bezier(.4,1.2,.6,1)',
        transform: hovered ? 'scale(1.01)' : 'scale(1)',
        zIndex: 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ fontSize: 18, fontWeight: 500, color: '#222' }}>Apps Finder</span>
      <Button
        disabled={!isSuperAdmin}
        style={{
          borderRadius: 6,
          border: '1px solid #e0e0e0',
          background: isSuperAdmin ? '#fff' : '#f5f5f5',
          color: isSuperAdmin ? '#222' : '#ccc',
          fontWeight: 500,
          minWidth: 120,
          height: 40,
          fontSize: 16,
          boxShadow: 'none',
          transition: 'background 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          cursor: isSuperAdmin ? 'pointer' : 'not-allowed',
        }}
        onClick={() => setModalOpen(true)}
        onMouseEnter={e => {
          if (isSuperAdmin) {
            (e.currentTarget as HTMLButtonElement).style.background = '#f5f5f5';
          }
        }}
        onMouseLeave={e => {
          if (isSuperAdmin) {
            (e.currentTarget as HTMLButtonElement).style.background = '#fff';
          }
        }}
      >
        Manage
      </Button>
      <Modal
        open={modalOpen}
        title="Apps Finder Upload"
        onCancel={() => { setModalOpen(false); setPreviewData([]); setColumns([]); setErrorMsg(''); setErrorList([]); }}
        footer={null}
        width={800}
        destroyOnClose={false} // 保证状态不被重置
      >
        <div
          onMouseEnter={() => setUploadHover(true)}
          onMouseLeave={() => setUploadHover(false)}
        >
          <Upload.Dragger
            accept=".xlsx,.xls,.csv"
            showUploadList={false}
            beforeUpload={handleFile}
            disabled={uploading}
            style={{
              marginBottom: 24,
              borderColor: uploadHover ? '#52c41a' : undefined,
              boxShadow: uploadHover
                ? '0 0 0 3px rgba(82,196,26,0.18), 0 0 12px 2px rgba(82,196,26,0.18) inset'
                : undefined,
              transition: 'box-shadow 0.2s, border-color 0.2s',
            }}
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined style={{ fontSize: 32 }} />
            </p>
            <p className="ant-upload-text">
              {uploading ? '正在解析文件...' : '点击或拖拽上传Excel文件'}
            </p>
          </Upload.Dragger>
        </div>
        {uploading && <div style={{ color: '#faad14', marginBottom: 8 }}>正在解析文件...</div>}
        {errorMsg && (
          <div style={{ color: '#d4380d', marginBottom: 12, fontWeight: 500, textAlign: 'center' }}>
            错误：{errorMsg}
            {errorList.length > 0 && (
              <div style={{ maxHeight: 120, overflowY: 'auto', marginTop: 4, textAlign: 'center' }}>
                {errorList.map((err, idx) => (
                  <div key={idx} style={{ color: '#d4380d', fontSize: 13 }}>{err}</div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* 新增：显示原始字段和清洗后字段 */}
        {!errorMsg && rawFields.length > 0 && (
          <div style={{
            marginBottom: 12,
            color: '#389e8a',
            fontSize: 15,
            textAlign: 'center',
            fontWeight: 500
          }}>
            数据解析成功
          </div>
        )}
        {previewData.length > 0 && (
          <>
            <Table
              columns={columns}
              dataSource={previewData}
              rowKey={(_, idx) => String(idx)}
              size="small"
              pagination={{ pageSize: 2, showSizeChanger: false }}
              scroll={{ x: 800, y: 300 }}
              style={{ marginBottom: 64, maxHeight: 340, paddingBottom: 24 }}
            />
            <Button type="primary" block onClick={handleUpload} loading={uploading} disabled={uploading}>
              上传到数据库
            </Button>
          </>
        )}
      </Modal>
    </div>
  );
};

// 新增 FilesCleanSetting 组件
const FilesCleanSetting: React.FC = () => {
  const [hovered, setHovered] = useState(false);
  const { userProfile } = useUser();
  const isSuperAdmin = userProfile?.role === 'Super Admin';
  const [cleaning, setCleaning] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<any>(null);

  const handleCleanup = async () => {
    setCleaning(true);
    try {
      const response = await axiosInstance.post('/api/cleanup-orphaned-files');
      const data = response.data as { status: string; message: string; stats?: any };
      if (data.status === 'success') {
        // 构建详细的消息
        let detailMessage = 'Files cleanup completed successfully';
        if (data.stats) {
          detailMessage = `Files cleanup completed successfully. Database referenced files: ${data.stats.valid_files_count}, Total files: ${data.stats.total_files}, Deleted: ${data.stats.deleted_files}, Retained: ${data.stats.retained_files}`;
        }
        message.success(detailMessage);
        setCleanupResult({
          status: 'success',
          message: data.message,
          stats: data.stats
        });
      } else {
        message.error(data.message || 'Cleanup failed');
        setCleanupResult({
          status: 'error',
          message: data.message
        });
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message || 'Cleanup failed';
      message.error(errorMsg);
      setCleanupResult({
        status: 'error',
        message: errorMsg
      });
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: 6,
        width: '100%',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        padding: '0 32px',
        background: '#fff',
        transition: 'transform 0.18s cubic-bezier(.4,1.2,.6,1)',
        transform: hovered ? 'scale(1.01)' : 'scale(1)',
        zIndex: 1,
        marginBottom: 16,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ fontSize: 18, fontWeight: 500, color: '#222' }}>
        Files Clean
      </span>
      <Button
        disabled={!isSuperAdmin}
        loading={cleaning}
        icon={<DeleteOutlined />}
        style={{
          borderRadius: 6,
          border: '1px solid #e0e0e0',
          background: isSuperAdmin ? '#fff' : '#f5f5f5',
          color: isSuperAdmin ? '#222' : '#ccc',
          fontWeight: 500,
          minWidth: 120,
          height: 40,
          fontSize: 16,
          boxShadow: 'none',
          transition: 'background 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          cursor: isSuperAdmin ? 'pointer' : 'not-allowed',
        }}
        onClick={handleCleanup}
        onMouseEnter={e => {
          if (isSuperAdmin) {
            (e.currentTarget as HTMLButtonElement).style.background = '#f5f5f5';
          }
        }}
        onMouseLeave={e => {
          if (isSuperAdmin) {
            (e.currentTarget as HTMLButtonElement).style.background = '#fff';
          }
        }}
      >
        Clean Up
      </Button>
    </div>
  );
};

// 新增 FrameThemeSelector 组件
const FrameThemeSelector: React.FC = () => {
  const [hovered, setHovered] = useState(false);
  const [value, setValue] = useState(() => localStorage.getItem('frameTheme') || 'Default');
  const handleChange = (val: string) => {
    setValue(val);
    localStorage.setItem('frameTheme', val);
  };
  return (
    <div
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: 6,
        width: '100%',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        padding: '0 32px',
        background: '#fff',
        transition: 'transform 0.18s cubic-bezier(.4,1.2,.6,1)',
        transform: hovered ? 'scale(1.01)' : 'scale(1)',
        zIndex: 1,
        marginBottom: 16,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ fontSize: 18, fontWeight: 500, color: '#222' }}>Frame</span>
      <Select
        dropdownClassName="af-form"
        value={value}
        onChange={handleChange}
        style={{ width: 120, borderRadius: 6, height: 40 }}
        options={[
          { value: 'Default', label: 'Default' },
          { value: 'Dark', label: 'Dark' },
        ]}
      />
    </div>
  );
};

// 新增 AppsflyerTokenValidateSelector 组件
const AppsflyerTokenValidateSelector: React.FC = () => {
  const [hovered, setHovered] = useState(false);
  const [value, setValue] = useState(() => localStorage.getItem('appsflyerTokenValidate') || 'ON');
  const handleChange = (val: string) => {
    setValue(val);
    localStorage.setItem('appsflyerTokenValidate', val);
  };
  return (
    <div
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: 6,
        width: '100%',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        padding: '0 32px',
        background: '#fff',
        transition: 'transform 0.18s cubic-bezier(.4,1.2,.6,1)',
        transform: hovered ? 'scale(1.01)' : 'scale(1)',
        zIndex: 1,
        marginBottom: 16,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ fontSize: 18, fontWeight: 500, color: '#222' }}>Aggregate Mode</span>
      <Select
        dropdownClassName="af-form"
        value={value}
        onChange={handleChange}
        style={{ width: 120, borderRadius: 6, height: 40 }}
        options={[
          { value: 'ON', label: 'ON' },
          { value: 'OFF', label: 'OFF' },
        ]}
      />
    </div>
  );
};

// 新增 ConfigurationOrderSetting 组件
const ConfigurationOrderSetting: React.FC = () => {
  const [hovered, setHovered] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [accountConfigs, setAccountConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [autoScrollInterval, setAutoScrollInterval] = useState<NodeJS.Timeout | null>(null);
  const { currentUser } = useAuth();
  const { userProfile } = useUser();
  const { refreshAccountConfigs } = useAccount();

  // 获取账户配置
  const fetchAccountConfigs = async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get('/api/auth/account-configs');
      if (response.status === 200) {
        const data = response.data as { configs?: any[] };
        setAccountConfigs(data.configs || []);
      }
    } catch (error) {
      console.error('获取账户配置失败:', error);
      message.error('获取账户配置失败');
    } finally {
      setLoading(false);
    }
  };

  // 打开弹窗时加载数据
  const handleOpenModal = () => {
    setModalVisible(true);
    fetchAccountConfigs();
  };

  // 自动滚动逻辑
  const startAutoScroll = (direction: 'up' | 'down', speed: number = 15) => {
    // 如果已经有滚动间隔，先停止
    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
    }
    
    const interval = setInterval(() => {
      const container = document.querySelector('.ant-modal-body') as HTMLElement;
      if (container) {
        const scrollAmount = direction === 'up' ? -speed : speed;
        const newScrollTop = container.scrollTop + scrollAmount;
        
        // 确保滚动不会超出边界
        if (direction === 'up' && newScrollTop >= 0) {
          container.scrollTop = newScrollTop;
        } else if (direction === 'down' && newScrollTop <= container.scrollHeight - container.clientHeight) {
          container.scrollTop = newScrollTop;
        }
      }
    }, 16); // 使用16ms间隔，约60fps，更流畅
    
    setAutoScrollInterval(interval);
    console.log('开始自动滚动', { direction, speed });
  };

  const stopAutoScroll = () => {
    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
      setAutoScrollInterval(null);
      console.log('停止自动滚动');
    }
  };

  // 检查是否需要自动滚动
  const checkAutoScroll = (clientY: number) => {
    const container = document.querySelector('.ant-modal-body') as HTMLElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const topThreshold = 60; // 顶部边界阈值
    const bottomThreshold = 60; // 底部边界阈值
    const topEdge = rect.top;
    const bottomEdge = rect.bottom;
    
    // 计算距离边界的距离
    const distanceFromTop = clientY - topEdge;
    const distanceFromBottom = bottomEdge - clientY;
    
    // 检查是否在顶部边界
    if (distanceFromTop < topThreshold) {
      const intensity = Math.max(1, (topThreshold - distanceFromTop) / topThreshold * 3);
      startAutoScroll('up', intensity);
      console.log('顶部滚动触发', { clientY, topEdge, distanceFromTop, intensity });
    } 
    // 检查是否在底部边界
    else if (distanceFromBottom < bottomThreshold) {
      const intensity = Math.max(1, (bottomThreshold - distanceFromBottom) / bottomThreshold * 3);
      startAutoScroll('down', intensity);
      console.log('底部滚动触发', { clientY, bottomEdge, distanceFromBottom, intensity });
    } 
    // 不在边界区域，停止滚动
    else {
      stopAutoScroll();
      console.log('停止滚动', { clientY, topEdge, bottomEdge });
    }
  };

  // 添加全局拖拽事件监听
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (draggedIndex !== null) {
        console.log('全局dragover事件', { clientY: e.clientY, draggedIndex });
        checkAutoScroll(e.clientY);
      }
    };

    const handleDragMove = (e: DragEvent) => {
      if (draggedIndex !== null) {
        console.log('全局drag事件', { clientY: e.clientY, draggedIndex });
        checkAutoScroll(e.clientY);
      }
    };

    const handleDragEnd = () => {
      console.log('拖拽结束');
      setDraggedIndex(null);
      stopAutoScroll();
    };

    if (modalVisible) {
      document.addEventListener('dragover', handleDragOver);
      document.addEventListener('drag', handleDragMove);
      document.addEventListener('dragend', handleDragEnd);
      console.log('拖拽事件监听器已添加');
    }

    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drag', handleDragMove);
      document.removeEventListener('dragend', handleDragEnd);
      stopAutoScroll();
    };
  }, [modalVisible, draggedIndex]);

  return (
    <>
      <style>
        {`
          @keyframes glow {
            0% { box-shadow: 0 0 10px #1890ff, 0 0 20px #40a9ff, 0 0 30px #69c0ff; }
            100% { box-shadow: 0 0 15px #1890ff, 0 0 25px #40a9ff, 0 0 35px #69c0ff, 0 0 45px #91d5ff; }
          }
          @keyframes shimmer {
            0% { left: -100%; }
            100% { left: 100%; }
          }
        `}
      </style>
      <div
        style={{
          border: '1px solid #e0e0e0',
          borderRadius: 6,
          width: '100%',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
          padding: '0 32px',
          background: '#fff',
          transition: 'transform 0.18s cubic-bezier(.4,1.2,.6,1)',
          transform: hovered ? 'scale(1.01)' : 'scale(1)',
          zIndex: 1,
          marginBottom: 16,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span style={{ fontSize: 18, fontWeight: 500, color: '#222' }}>
          Configuration Order
        </span>
        <Button
          style={{
            borderRadius: 6,
            border: '1px solid #e0e0e0',
            background: '#fff',
            color: '#222',
            fontWeight: 500,
            minWidth: 120,
            height: 40,
            fontSize: 16,
            boxShadow: 'none',
            transition: 'background 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
          onClick={handleOpenModal}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#f5f5f5';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#fff';
          }}
        >
          Change
        </Button>
      </div>

      <Modal
        title="Configuration Order"
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setSaveLoading(false);
        }}
        styles={{
          body: {
            position: 'relative',
          }
        }}
        footer={[
          <Button 
            key="save" 
            type="primary" 
            loading={saveLoading}
            onClick={async () => {
              setSaveLoading(true);
              try {
                // 构建排序数据
                const configOrders = accountConfigs.map((config, index) => ({
                  id: config.id,
                  sort_order: index
                }));
                
                // 调用后端API保存排序
                const response = await axiosInstance.put('/api/auth/account-configs/order', {
                  config_orders: configOrders
                });
                
                if (response.status === 200) {
                  message.success('Configuration order updated successfully');
                  
                  // 清除AccountContext的缓存并强制刷新
                  try {
                    // 清除本地缓存
                    const userKey = currentUser?.id || '';
                    const CACHE_KEY = `accountConfigs_${userKey}`;
                    const CACHE_TIME_KEY = `accountConfigsTime_${userKey}`;
                    localStorage.removeItem(CACHE_KEY);
                    localStorage.removeItem(CACHE_TIME_KEY);
                    
                    // 强制刷新Account配置
                    await refreshAccountConfigs(true);
                    console.log('Account配置缓存已刷新');
                  } catch (refreshError) {
                    console.warn('刷新Account配置缓存失败:', refreshError);
                  }
                  
                  setModalVisible(false);
                } else {
                  message.error('Failed to update configuration order');
                }
              } catch (error) {
                console.error('保存排序失败:', error);
                message.error('Failed to update configuration order');
              } finally {
                setSaveLoading(false);
              }
            }}
          >
            Save
          </Button>,
          <Button 
            key="cancel" 
            onClick={() => {
              setModalVisible(false);
              setSaveLoading(false);
            }}
          >
            Cancel
          </Button>
        ]}
        width={600}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
          </div>
        ) : (
          <div style={{ 
            maxHeight: '400px', 
            overflowY: 'auto',
            padding: '8px 8px', // 增加内边距为hover效果提供更多空间
          }}>
            {accountConfigs.map((config, index) => (
              <React.Fragment key={config.id}>
                {/* 发光标记线 */}
                {dropIndex === index && draggedIndex !== null && draggedIndex !== index && (
                  <div
                    style={{
                      height: '3px',
                      background: 'linear-gradient(90deg, #1890ff, #40a9ff, #69c0ff, #91d5ff)',
                      borderRadius: '2px',
                      margin: '8px 0',
                      boxShadow: '0 0 10px #1890ff, 0 0 20px #40a9ff, 0 0 30px #69c0ff',
                      animation: 'glow 1.5s ease-in-out infinite alternate',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: '-100%',
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                        animation: 'shimmer 2s infinite',
                      }}
                    />
                  </div>
                )}
                                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 16px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '4px',
                    marginBottom: '10px', // 减少底部间距
                    marginLeft: '6px', // 增加左边距
                    marginRight: '6px', // 增加右边距
                    background: '#fff',
                    cursor: 'move',
                    userSelect: 'none',
                    opacity: draggedIndex === index ? 0.7 : 1,
                    transform: draggedIndex === index ? 'scale(1.03) rotate(1deg)' : 'scale(1)',
                    transition: 'opacity 0.2s, transform 0.2s, box-shadow 0.2s',
                    boxShadow: draggedIndex === index ? '0 3px 10px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.1)',
                    zIndex: draggedIndex === index ? 1000 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (draggedIndex === null) {
                      e.currentTarget.style.transform = 'scale(1.02)';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
                      e.currentTarget.style.zIndex = '5';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (draggedIndex === null) {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                      e.currentTarget.style.zIndex = '1';
                    }
                  }}
                draggable
                onDragStart={(e) => {
                  setDraggedIndex(index);
                  e.dataTransfer.setData('text/plain', index.toString());
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={(e) => {
                  setDraggedIndex(null);
                  setDropIndex(null);
                  stopAutoScroll();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  checkAutoScroll(e.clientY);
                  setDropIndex(index);
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  checkAutoScroll(e.clientY);
                }}
                onDragLeave={(e) => {
                  // 只有当鼠标真正离开元素时才清除标记
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX;
                  const y = e.clientY;
                  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                    setDropIndex(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  stopAutoScroll();
                  setDropIndex(null);
                  const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                  const toIndex = index;
                  
                  if (fromIndex !== toIndex) {
                    const items = Array.from(accountConfigs);
                    const [reorderedItem] = items.splice(fromIndex, 1);
                    items.splice(toIndex, 0, reorderedItem);
                    setAccountConfigs(items);
                  }
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, color: '#222' }}>
                    {config.account_name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                    {config.account_type}
                  </div>
                </div>
                <div style={{ 
                  width: '20px', 
                  height: '20px', 
                  background: '#f0f0f0', 
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  color: '#666'
                }}>
                  ⋮⋮
                </div>
              </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
};

const Settings: React.FC = () => {
  const { language } = useLanguage();
  const { currentUser } = useAuth();
  const userKey = currentUser?.id || '';
  const [selectedKey, setSelectedKey] = useState('theme');

  const menuItems = [
    {
      key: 'theme',
      icon: <BgColorsOutlined />,
      label: language === 'en' ? 'Appearance/Theme' : '外观/主题',
    },
    {
      key: 'import',
      icon: <DatabaseOutlined />,
      label: language === 'en' ? 'Data Settings' : '数据设置',
    },
    {
      key: 'token',
      icon: <KeyOutlined />,
      label: language === 'en' ? 'Token Management' : 'Token管理',
    },
  ];

  return (
    <Layout style={{ background: '#fff', minHeight: 600, borderRadius: 12 }}>
      <Sider width={220} style={{ background: '#fff', borderRight: 'none', paddingTop: 0, minHeight: 600, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={e => setSelectedKey(e.key)}
          style={{ height: '100%', borderRight: 0, fontSize: 16, fontWeight: 500, userSelect: 'none' }}
          items={menuItems}
        />
      </Sider>
      <Content style={{ padding: '0 48px 0 0', minHeight: 600, height: '100%', marginLeft: 40 }}>
        <Card
          style={{
            height: 400,
            minHeight: 400,
            maxHeight: 400,
            borderRadius: 8,
            background: '#fff',
            boxShadow: '0 4px 24px 0 rgba(0,0,0,0.10), 0 1.5px 6px 0 rgba(0,0,0,0.06)',
            margin: 0,
            overflow: 'hidden',
          }}
          bodyStyle={{ height: '100%' }}
        >
          {selectedKey === 'import' && (
            <div style={{ width: '100%' }}>
              <AccountRefreshRule userKey={userKey} />
              <FilesCleanSetting />
              <AppsFinderSetting />
            </div>
          )}
          {selectedKey === 'theme' && (
            <div style={{ width: '100%' }}>
              <FrameThemeSelector />
            </div>
          )}
          {selectedKey === 'token' && (
            <div style={{ width: '100%' }}>
              <AppsflyerTokenValidateSelector />
              <ConfigurationOrderSetting />
            </div>
          )}
        </Card>
      </Content>
    </Layout>
  );
};

export default Settings; 