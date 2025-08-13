import React, { useEffect, useState } from 'react';
import { Card, Table, message, Pagination, Modal, Space, Button } from 'antd';
import { EyeOutlined, LinkOutlined } from '@ant-design/icons';
import { useLanguage } from '../contexts/LanguageContext';

const AppsFinder: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(true); // 初始状态设为true，显示Loading
  const [dataSource, setDataSource] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [appNameOptions, setAppNameOptions] = useState<string[]>([]);
  const [detailModal, setDetailModal] = useState<{ visible: boolean, record?: any }>({ visible: false });
  const [filterValues, setFilterValues] = useState({
    os: '',
    appId: '',
    appName: '',
    category: ''
  });
  
  // 平台选项数据
  const osOptions = [
    { label: 'App Store', value: 'App Store' },
    { label: 'Google Play', value: 'Google Play' },
  ];
  
  // 下拉菜单状态管理
  const [osSelectorVisible, setOsSelectorVisible] = useState(false);
  const [osDropdownPosition, setOsDropdownPosition] = useState({ top: 0, left: 0 });
  
  // App Name Filter 状态管理
  const [appNameSelectorVisible, setAppNameSelectorVisible] = useState(false);
  const [appNameDropdownPosition, setAppNameDropdownPosition] = useState({ top: 0, left: 0 });
  const [appNameSearchText, setAppNameSearchText] = useState<string>('');
  
  // App ID Filter 状态管理
  const [appIdSelectorVisible, setAppIdSelectorVisible] = useState(false);
  const [appIdDropdownPosition, setAppIdDropdownPosition] = useState({ top: 0, left: 0 });
  const [appIdSearchText, setAppIdSearchText] = useState<string>('');
  
  // Select Category 状态管理
  const [categorySelectorVisible, setCategorySelectorVisible] = useState(false);
  const [categoryDropdownPosition, setCategoryDropdownPosition] = useState({ top: 0, left: 0 });
  
  const { language } = useLanguage();

  // 过滤App Name选项
  const filteredAppNameOptions = appNameOptions.filter(name => 
    name.toLowerCase().includes(appNameSearchText.toLowerCase())
  );

  // 过滤App ID选项
  const filteredAppIdOptions = dataSource
    .map(item => item.appId)
    .filter((appId, index, arr) => appId && arr.indexOf(appId) === index) // 去重
    .filter(appId => 
      appId.toLowerCase().includes(appIdSearchText.toLowerCase())
    );

  // 全库App ID选项（用于App ID Filter下拉菜单）
  const [allAppIdOptions, setAllAppIdOptions] = useState<string[]>([]);
  
  // 过滤全库App ID选项
  const filteredAllAppIdOptions = allAppIdOptions.filter(appId => 
    appId.toLowerCase().includes(appIdSearchText.toLowerCase())
  );

  // 计算平台选择器下拉菜单位置
  const calculateOsDropdownPosition = () => {
    const osSelector = document.querySelector('[data-os-selector]') as HTMLElement;
    if (osSelector) {
      const rect = osSelector.getBoundingClientRect();
      setOsDropdownPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX
      });
    }
  };

  // 计算App Name Filter下拉菜单位置
  const calculateAppNameDropdownPosition = () => {
    const appNameSelector = document.querySelector('[data-appname-selector]') as HTMLElement;
    if (appNameSelector) {
      const rect = appNameSelector.getBoundingClientRect();
      setAppNameDropdownPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX
      });
    }
  };

  // 计算App ID Filter下拉菜单位置
  const calculateAppIdDropdownPosition = () => {
    const appIdSelector = document.querySelector('[data-appid-selector]') as HTMLElement;
    if (appIdSelector) {
      const rect = appIdSelector.getBoundingClientRect();
      setAppIdDropdownPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX
      });
    }
  };

  // 计算Select Category下拉菜单位置
  const calculateCategoryDropdownPosition = () => {
    const categorySelector = document.querySelector('[data-category-selector]') as HTMLElement;
    if (categorySelector) {
      const rect = categorySelector.getBoundingClientRect();
      setCategoryDropdownPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX
      });
    }
  };

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-os-selector]')) {
        setOsSelectorVisible(false);
      }
      if (!target.closest('[data-appname-selector]')) {
        setAppNameSelectorVisible(false);
      }
      if (!target.closest('[data-appid-selector]')) {
        setAppIdSelectorVisible(false);
      }
      if (!target.closest('[data-category-selector]')) {
        setCategorySelectorVisible(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchData = async (page = 1, pageSize = 10, filters: Record<string, any> = {}) => {
    setLoading(true);
    setTableLoading(true); // 开始加载时显示Loading
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (filters.os) params.append('os', filters.os);
      if (filters.category) params.append('category', filters.category);
      if (filters.appId) params.append('appId', filters.appId);
      if (filters.appName) params.append('appName', filters.appName);
      const res = await fetch(`/api/apps-finder?${params.toString()}`);
      const result = await res.json();
      setDataSource(Array.isArray(result.data) ? result.data : []);
      setTotal(result.total || 0);
    } catch (e) {
      setDataSource([]);
      setTotal(0);
      message.error('查询失败');
    }
    setLoading(false);
    setTableLoading(false); // 加载完成后隐藏Loading
  };

  // 初始化时加载所有类目和App Name选项
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch('/api/apps-finder/categories');
        const cats = await res.json();
        setCategoryOptions(Array.isArray(cats) ? cats : []);
      } catch {
        setCategoryOptions([]);
      }
    };

    const fetchAppNames = async () => {
      try {
        const res = await fetch('/api/apps-finder/app-names');
        const appNames = await res.json();
        setAppNameOptions(Array.isArray(appNames) ? appNames : []);
      } catch {
        setAppNameOptions([]);
      }
    };

    const fetchAllAppIds = async () => {
      try {
        const res = await fetch('/api/apps-finder/app-ids');
        const appIds = await res.json();
        setAllAppIdOptions(Array.isArray(appIds) ? appIds : []);
      } catch {
        setAllAppIdOptions([]);
      }
    };

    fetchCategories();
    fetchAppNames();
    fetchAllAppIds();
  }, []);

  // 页面滚动时自动关闭所有下拉菜单（但允许在下拉内容区域内滑动）
  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      // 只在主内容区滚动时关闭下拉，若滚动的是下拉菜单（ant-select-dropdown）则不关闭
      if (target && typeof target.closest === 'function' && target.closest('.ant-select-dropdown')) return;
      // 不再需要关闭下拉菜单，因为我们现在使用自定义按钮
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

  const handleQuery = (values: any) => {
    console.log('表单提交的值:', values);
    setFilters(values);
    setCurrentPage(1);
  };

  useEffect(() => {
      fetchData(currentPage, pageSize, filters);
  }, [currentPage, pageSize, filters]);

  const handleViewDetail = (record: any) => {
    setDetailModal({ visible: true, record });
  };

  const handleUrlJump = async (appId: string) => {
    if (!appId) {
      message.warning(language === 'zh' ? '应用ID为空' : 'App ID is empty');
      return;
    }
    
    try {
      // 通过后端接口获取URL
      const response = await fetch(`/api/apps-finder/url/${appId}`, {
        method: 'GET'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.url) {
          // 在新标签页中打开URL
          window.open(data.url, '_blank', 'noopener,noreferrer');
        } else {
          message.warning(language === 'zh' ? '暂无链接' : 'No link available');
        }
      } else if (response.status === 404) {
        message.warning(language === 'zh' ? '未找到对应的链接' : 'Link not found');
      } else if (response.status === 400) {
        message.warning(language === 'zh' ? '链接格式不正确' : 'Invalid link format');
      } else {
        message.error(language === 'zh' ? '获取链接失败' : 'Failed to get link');
      }
    } catch (error) {
      console.error('URL跳转错误:', error);
      message.error(language === 'zh' ? '跳转失败' : 'Redirect failed');
    }
  };

  const columns = [
    { 
      title: language === 'zh' ? '平台' : 'Platform', 
      dataIndex: 'os', 
      key: 'os', 
      width: 120, 
      align: 'center' as const,
      render: (text: string) => (
        <span style={{ 
          fontSize: '13px', 
          color: 'rgb(34, 13, 78)',
          fontWeight: 400
        }}>
          {text}
        </span>
      )
    },
    { 
      title: language === 'zh' ? '应用ID' : 'App ID', 
      dataIndex: 'appId', 
      key: 'appId', 
      width: 120, 
      align: 'center' as const,
      render: (text: string) => (
        <span style={{ 
          fontSize: '13px', 
          color: 'rgb(34, 13, 78)',
          fontWeight: 400,
          fontFamily: 'monospace'
        }}>
          {text}
        </span>
      )
    },
    { 
      title: language === 'zh' ? '应用名称' : 'App Name', 
      dataIndex: 'appName', 
      key: 'appName', 
      width: 300, 
      align: 'center' as const,
      render: (text: string) => (
        <span style={{ 
          fontSize: '13px', 
          color: 'rgb(34, 13, 78)',
          fontWeight: 400
        }}>
          {text}
        </span>
      )
    },
    { 
      title: language === 'zh' ? '类目' : 'Category', 
      dataIndex: 'category', 
      key: 'category', 
      width: 150, 
      align: 'center' as const,
      render: (text: string) => (
        <span style={{ 
          fontSize: '13px', 
          color: 'rgb(34, 13, 78)',
          fontWeight: 400
        }}>
          {text}
        </span>
      )
    },
    { 
      title: language === 'zh' ? '操作' : 'Actions', 
      key: 'actions', 
      width: 160, 
      align: 'center' as const, 
      render: (_: any, record: any) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EyeOutlined />}
            title={language === 'zh' ? '查看详情' : 'View Details'}
            style={{ 
              padding: '4px 8px',
              color: 'rgb(34, 13, 78)',
              fontSize: '13px'
            }}
            onClick={() => handleViewDetail(record)}
          />
          <Button
            type="link"
            icon={<LinkOutlined />}
            title={language === 'zh' ? '访问链接' : 'Visit Link'}
            style={{ 
              padding: '4px 8px',
              color: 'rgb(34, 13, 78)',
              fontSize: '13px'
            }}
            onClick={() => handleUrlJump(record.appId)}
            disabled={!record.appId}
          />
        </Space>
      ) 
    },
  ];

  return (
    <div style={{ 
      maxWidth: '1200px', 
      margin: '0 auto', 
      padding: '24px',
      fontFamily: '"Museo Sans", sans-serif',
      fontWeight: 300,
      fontSize: 13,
      lineHeight: '20px',
      letterSpacing: '0.0025em'
    }}>
      {/* 统一的卡片容器 */}
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '18px', fontWeight: 600 }}>
              {language === 'zh' ? '应用查找器' : 'Apps Finder'}
            </span>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {/* 平台选择器 - 使用自定义按钮样式 */}
                <div style={{ position: 'relative', zIndex: 9999 }} data-os-selector>
                  <button
                    onClick={() => {
                      if (!osSelectorVisible) {
                        calculateOsDropdownPosition();
                      }
                      setOsSelectorVisible(!osSelectorVisible);
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
                      {filterValues.os || (language === 'zh' ? '选择平台' : 'Select Platform')}
                    </span>
                    <svg 
                      width="12" 
                      height="12" 
                      viewBox="0 0 12 12" 
                      fill="none"
                      style={{
                        transform: osSelectorVisible ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease'
                      }}
                    >
                      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  
                  {/* 平台选择器下拉菜单 */}
                  {osSelectorVisible && (
                    <div
                      data-os-selector-dropdown
            style={{
                        position: 'fixed',
                        top: `${osDropdownPosition.top}px`,
                        left: `${osDropdownPosition.left}px`,
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
                        {/* 添加"Select Platform"选项 */}
                        <div
                          onClick={() => {
                            setFilterValues({ ...filterValues, os: '' });
                            setOsSelectorVisible(false);
                            handleQuery({ ...filterValues, os: '' });
                          }}
                          style={{
                            padding: '10px 16px',
                            cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
                            gap: '12px',
                            borderBottom: '1px solid #f8f8f8',
                            backgroundColor: filterValues.os === '' ? '#f6f8ff' : 'transparent',
                            transition: 'background-color 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (filterValues.os !== '') {
                              e.currentTarget.style.backgroundColor = '#fafafa';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (filterValues.os !== '') {
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
                              {language === 'zh' ? '选择平台' : 'Select Platform'}
                            </div>
                            <div style={{
                              fontSize: '11px',
                              color: '#666',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {language === 'zh' ? '显示所有平台' : 'Show all platforms'}
                            </div>
                          </div>
                        </div>
                        
                        {/* 平台选项列表 */}
                        {osOptions.map((option, index) => (
                          <div
                            key={option.value}
                            onClick={() => {
                              setFilterValues({ ...filterValues, os: option.value });
                              setOsSelectorVisible(false);
                              handleQuery({ ...filterValues, os: option.value });
                            }}
                            style={{
                              padding: '10px 16px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              borderBottom: index < osOptions.length - 1 ? '1px solid #f8f8f8' : 'none',
                              backgroundColor: filterValues.os === option.value ? '#f6f8ff' : 'transparent',
                              transition: 'background-color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              if (filterValues.os !== option.value) {
                                e.currentTarget.style.backgroundColor = '#fafafa';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (filterValues.os !== option.value) {
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
                
                {/* 类目选择器 - 使用自定义按钮样式 */}
                <div style={{ position: 'relative', zIndex: 9999 }} data-category-selector>
                  <button
                    onClick={() => {
                      if (!categorySelectorVisible) {
                        calculateCategoryDropdownPosition();
                      }
                      setCategorySelectorVisible(!categorySelectorVisible);
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
                      {filterValues.category || (language === 'zh' ? '选择类目' : 'Select Category')}
                    </span>
                    <svg 
                      width="12" 
                      height="12" 
                      viewBox="0 0 12 12" 
                      fill="none"
                      style={{
                        transform: categorySelectorVisible ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease'
                      }}
                    >
                      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  
                  {/* 类目选择器下拉菜单 */}
                  {categorySelectorVisible && (
                    <div
                      data-category-selector-dropdown
                      style={{
                        position: 'fixed',
                        top: `${categoryDropdownPosition.top}px`,
                        left: `${categoryDropdownPosition.left}px`,
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
                        {/* 添加"Select Category"选项 */}
                        <div
                          onClick={() => {
                            setFilterValues({ ...filterValues, category: '' });
                            setCategorySelectorVisible(false);
                            handleQuery({ ...filterValues, category: '' });
                          }}
                          style={{
                            padding: '10px 16px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            borderBottom: '1px solid #f8f8f8',
                            backgroundColor: filterValues.category === '' ? '#f6f8ff' : 'transparent',
                            transition: 'background-color 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (filterValues.category !== '') {
                              e.currentTarget.style.backgroundColor = '#fafafa';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (filterValues.category !== '') {
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
                              {language === 'zh' ? '选择类目' : 'Select Category'}
                            </div>
                            <div style={{
                              fontSize: '11px',
                              color: '#666',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {language === 'zh' ? '显示所有类目' : 'Show all categories'}
                            </div>
                          </div>
                        </div>
                        
                        {/* 类目选项列表 */}
                        {categoryOptions.map((category, index) => (
                          <div
                            key={category}
                            onClick={() => {
                              setFilterValues({ ...filterValues, category: category });
                              setCategorySelectorVisible(false);
                              handleQuery({ ...filterValues, category: category });
                            }}
                            style={{
                              padding: '10px 16px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              borderBottom: index < categoryOptions.length - 1 ? '1px solid #f8f8f8' : 'none',
                              backgroundColor: filterValues.category === category ? '#f6f8ff' : 'transparent',
                              transition: 'background-color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              if (filterValues.category !== category) {
                                e.currentTarget.style.backgroundColor = '#fafafa';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (filterValues.category !== category) {
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
                                {category}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* 应用ID输入框 - 使用自定义按钮样式 */}
                <div style={{ position: 'relative', zIndex: 9999 }} data-appid-selector>
                  <button
                    onClick={() => {
                      if (!appIdSelectorVisible) {
                        calculateAppIdDropdownPosition();
                        setAppIdSearchText(''); // 打开时清空搜索文本
                      }
                      setAppIdSelectorVisible(!appIdSelectorVisible);
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
                      {filterValues.appId || (language === 'zh' ? 'App ID Filter' : 'App ID Filter')}
                    </span>
                    <svg 
                      width="12" 
                      height="12" 
                      viewBox="0 0 12 12" 
                      fill="none"
                      style={{
                        transform: appIdSelectorVisible ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease'
                      }}
                    >
                      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  
                  {/* App ID Filter下拉菜单 */}
                  {appIdSelectorVisible && (
                    <div
                      data-appid-selector-dropdown
                      style={{
                        position: 'fixed',
                        top: `${appIdDropdownPosition.top}px`,
                        left: `${appIdDropdownPosition.left}px`,
                        zIndex: 99999,
                        background: 'rgb(255, 255, 255)',
                        color: 'rgb(34, 13, 78)',
                        boxShadow: 'rgba(3, 109, 235, 0.03) 0px 2px 4px, rgba(3, 109, 235, 0.02) 0px 4px 5px, rgba(3, 109, 235, 0.12) 0px 1px 10px',
                        borderRadius: '4px',
                        width: '200px',
                        maxHeight: '380px',
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
                      {/* 搜索框 */}
                      <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0' }}>
                        <input
                          type="text"
                          placeholder={language === 'zh' ? '输入应用ID...' : 'Enter App ID...'}
                          value={appIdSearchText}
                          onChange={(e) => setAppIdSearchText(e.target.value)}
                          style={{
                            WebkitFontSmoothing: 'antialiased',
                            textSizeAdjust: '100%',
                            outline: 0,
                            font: 'inherit',
                            border: '0px',
                            boxSizing: 'content-box',
                            background: 'none',
                            margin: '0px',
                            WebkitTapHighlightColor: 'transparent',
                            display: 'block',
                            minWidth: '0px',
                            animationName: 'mui-auto-fill-cancel',
                            animationDuration: '10ms',
                            textOverflow: 'ellipsis',
                            width: '100%',
                            height: 'auto',
                            padding: '6px 0px 6px 8px',
                            fontWeight: 300,
                            fontSize: '14px',
                            lineHeight: '18px',
                            letterSpacing: '0.005em',
                            fontFamily: '"Museo Sans", sans-serif',
                            color: 'rgb(34, 13, 78)'
                          }}
                        />
                      </div>
                      
                      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {/* 添加"Select App ID"选项 */}
                        <div
                          onClick={() => {
                            setFilterValues({ ...filterValues, appId: '' });
                            setAppIdSelectorVisible(false);
                            handleQuery({ ...filterValues, appId: '' });
                          }}
                          style={{
                            padding: '10px 16px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            borderBottom: '1px solid #f8f8f8',
                            backgroundColor: filterValues.appId === '' ? '#f6f8ff' : 'transparent',
                            transition: 'background-color 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (filterValues.appId !== '') {
                              e.currentTarget.style.backgroundColor = '#fafafa';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (filterValues.appId !== '') {
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
                              {language === 'zh' ? '选择应用ID' : 'Select App ID'}
                            </div>
                            <div style={{
                              fontSize: '11px',
                              color: '#666',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {language === 'zh' ? '显示所有应用ID' : 'Show all app IDs'}
                            </div>
                          </div>
                        </div>
                        
                        {/* App ID选项列表 */}
                        {filteredAllAppIdOptions.map((appId, index) => (
                          <div
                            key={appId}
                            onClick={() => {
                              setFilterValues({ ...filterValues, appId: appId });
                              setAppIdSelectorVisible(false);
                              handleQuery({ ...filterValues, appId: appId });
                            }}
                            style={{
                              padding: '10px 16px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              borderBottom: index < filteredAllAppIdOptions.length - 1 ? '1px solid #f8f8f8' : 'none',
                              backgroundColor: filterValues.appId === appId ? '#f6f8ff' : 'transparent',
                              transition: 'background-color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              if (filterValues.appId !== appId) {
                                e.currentTarget.style.backgroundColor = '#fafafa';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (filterValues.appId !== appId) {
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
                                {appId}
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {/* 无搜索结果提示 */}
                        {filteredAllAppIdOptions.length === 0 && appIdSearchText && (
                          <div style={{ 
                            padding: '16px', 
                            textAlign: 'center', 
                            color: '#666',
                            fontSize: '13px'
                          }}>
                            {language === 'zh' ? '未找到匹配的应用ID' : 'No matching app IDs found'}
                          </div>
                        )}
                        
                        {/* 无数据提示 */}
                        {filteredAllAppIdOptions.length === 0 && !appIdSearchText && (
                          <div style={{ 
                            padding: '16px', 
                            textAlign: 'center', 
                            color: '#666',
                            fontSize: '13px'
                          }}>
                            {language === 'zh' ? '暂无应用ID数据' : 'No app ID data available'}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* 应用名称选择器 - 使用自定义按钮样式 */}
                <div style={{ position: 'relative', zIndex: 9999 }} data-appname-selector>
                  <button
                    onClick={() => {
                      if (!appNameSelectorVisible) {
                        calculateAppNameDropdownPosition();
                        setAppNameSearchText(''); // 打开时清空搜索文本
                      }
                      setAppNameSelectorVisible(!appNameSelectorVisible);
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
                      {filterValues.appName || (language === 'zh' ? 'App Name Filter' : 'App Name Filter')}
                    </span>
                    <svg 
                      width="12" 
                      height="12" 
                      viewBox="0 0 12 12" 
                      fill="none"
                      style={{
                        transform: appNameSelectorVisible ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease'
                      }}
                    >
                      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  
                  {/* App Name Filter下拉菜单 */}
                  {appNameSelectorVisible && (
                    <div
                      data-appname-selector-dropdown
                      style={{
                        position: 'fixed',
                        top: `${appNameDropdownPosition.top}px`,
                        left: `${appNameDropdownPosition.left}px`,
                        zIndex: 99999,
                        background: 'rgb(255, 255, 255)',
                        color: 'rgb(34, 13, 78)',
                        boxShadow: 'rgba(3, 109, 235, 0.03) 0px 2px 4px, rgba(3, 109, 235, 0.02) 0px 4px 5px, rgba(3, 109, 235, 0.12) 0px 1px 10px',
                        borderRadius: '4px',
                        width: '200px',
                        maxHeight: '380px',
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
                      {/* 搜索框 */}
                      <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0' }}>
                        <input
                          type="text"
                          placeholder={language === 'zh' ? '输入应用名称...' : 'Enter App Name...'}
                          value={appNameSearchText}
                          onChange={(e) => setAppNameSearchText(e.target.value)}
                          style={{
                            WebkitFontSmoothing: 'antialiased',
                            textSizeAdjust: '100%',
                            outline: 0,
                            font: 'inherit',
                            border: '0px',
                            boxSizing: 'content-box',
                            background: 'none',
                            margin: '0px',
                            WebkitTapHighlightColor: 'transparent',
                            display: 'block',
                            minWidth: '0px',
                            animationName: 'mui-auto-fill-cancel',
                            animationDuration: '10ms',
                            textOverflow: 'ellipsis',
                            width: '100%',
                            height: 'auto',
                            padding: '6px 0px 6px 8px',
                            fontWeight: 300,
                            fontSize: '14px',
                            lineHeight: '18px',
                            letterSpacing: '0.005em',
                            fontFamily: '"Museo Sans", sans-serif',
                            color: 'rgb(34, 13, 78)'
                          }}
                        />
                      </div>
                      
                      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {/* 添加"Select App Name"选项 */}
                        <div
                          onClick={() => {
                            setFilterValues({ ...filterValues, appName: '' });
                            setAppNameSelectorVisible(false);
                            handleQuery({ ...filterValues, appName: '' });
                          }}
                          style={{
                            padding: '10px 16px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            borderBottom: '1px solid #f8f8f8',
                            backgroundColor: filterValues.appName === '' ? '#f6f8ff' : 'transparent',
                            transition: 'background-color 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (filterValues.appName !== '') {
                              e.currentTarget.style.backgroundColor = '#fafafa';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (filterValues.appName !== '') {
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
                              {language === 'zh' ? '选择应用名称' : 'Select App Name'}
                            </div>
                            <div style={{
                              fontSize: '11px',
                              color: '#666',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {language === 'zh' ? '显示所有应用' : 'Show all apps'}
                            </div>
                          </div>
                        </div>
                        
                        {/* App Name选项列表 */}
                        {filteredAppNameOptions.map((appName, index) => (
                          <div
                            key={appName}
                            onClick={() => {
                              setFilterValues({ ...filterValues, appName: appName });
                              setAppNameSelectorVisible(false);
                              handleQuery({ ...filterValues, appName: appName });
                            }}
                            style={{
                              padding: '10px 16px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              borderBottom: index < filteredAppNameOptions.length - 1 ? '1px solid #f8f8f8' : 'none',
                              backgroundColor: filterValues.appName === appName ? '#f6f8ff' : 'transparent',
                              transition: 'background-color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              if (filterValues.appName !== appName) {
                                e.currentTarget.style.backgroundColor = '#fafafa';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (filterValues.appName !== appName) {
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
                                {appName}
          </div>
                            </div>
                          </div>
                        ))}
                        
                        {/* 无搜索结果提示 */}
                        {filteredAppNameOptions.length === 0 && appNameSearchText && (
                          <div style={{ 
                            padding: '16px', 
                            textAlign: 'center', 
                            color: '#666',
                            fontSize: '13px'
                          }}>
                            {language === 'zh' ? '未找到匹配的应用名称' : 'No matching app names found'}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
        }
        style={{
          borderRadius: 4,
          border: '1px solid rgb(230, 233, 240)',
          background: 'rgb(255, 255, 255)'
        }}
        bodyStyle={{ padding: '24px' }}
      >
        {/* 数据表格区域 */}
        <div>
        <div style={{ position: 'relative' }}>
        <Table
          columns={columns}
          dataSource={dataSource}
          rowKey="appId"
          pagination={false}
            scroll={{ x: 'max-content' }}
            loading={false} // 禁用默认Loading，使用自定义Loading
            locale={{ 
              emptyText: (
                <div style={{ 
                  padding: '32px 0', 
                  color: 'rgb(34, 13, 78)',
                  fontSize: '14px'
                }}>
                  {language === 'zh' ? '暂无数据' : 'No Data'}
                </div>
              ) 
            }}
            style={{ 
              margin: '0 auto', 
              maxWidth: '100%',
              opacity: tableLoading ? 0 : 1, // Loading时隐藏表格，完成后显示
              transition: 'opacity 1s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 1s cubic-bezier(0.25, 0.46, 0.45, 0.94)', // 表格淡入动画：1秒
              transform: tableLoading ? 'translateY(15px) scale(0.98)' : 'translateY(0) scale(1)', // Loading时轻微下移和缩小，完成后回到原位
              transformOrigin: 'center top', // 从顶部中心开始变换
            }}
            bordered
            size="middle"
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
              {language === 'zh' ? '加载中' : 'Loading'}
            </div>
          </div>
        </div>
          
        {/* 分页器 - 只在表格数据加载完成后显示 */}
        {!tableLoading && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            marginTop: '24px',
            marginBottom: '8px'
          }}>
          <Pagination
            current={currentPage}
            pageSize={pageSize}
            total={total}
            onChange={page => setCurrentPage(page)}
            showSizeChanger={false}
              showQuickJumper={false}
              showTotal={(total, range) => 
                `${language === 'zh' ? '共' : 'Total'} ${total} ${language === 'zh' ? '个应用' : 'Apps'}`
              }
              size="default"
              locale={{
                items_per_page: language === 'zh' ? ' / 页' : ' / Page',
                jump_to: language === 'zh' ? '跳至' : 'Go to',
                jump_to_confirm: language === 'zh' ? '确定' : 'Go',
                page: language === 'zh' ? '页' : 'Page'
              }}
            />
          </div>
        )}
        </div>
      </Card>

      {/* 详情模态框 */}
      <Modal
        open={detailModal.visible}
        title={
          <span style={{ 
            fontSize: '16px', 
            fontWeight: 600,
            color: 'rgb(34, 13, 78)'
          }}>
            {language === 'zh' ? '应用描述' : 'App Description'}
          </span>
        }
        footer={null}
        onCancel={() => setDetailModal({ visible: false })}
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
        <div style={{ 
          whiteSpace: 'pre-wrap', 
          wordBreak: 'break-all', 
          fontSize: '14px', 
          color: 'rgb(34, 13, 78)',
          lineHeight: '1.6'
        }}>
          {detailModal.record?.description || (language === 'zh' ? '暂无描述' : 'No description')}
        </div>
      </Modal>

      {/* 自定义样式 */}
      <style>{`
        /* Card样式 - 使用更高优先级确保样式正确应用 */
        .ant-card.ant-card-bordered .ant-card-head {
          padding: 0 24px !important;
          border-bottom: 1px solid rgb(230, 233, 240) !important;
        }
        
        .ant-card.ant-card-bordered .ant-card-head-title {
          padding: 16px 0 !important;
        }
        
        .ant-card.ant-card-bordered .ant-card-body {
          padding: 24px !important;
        }
        
        /* 下拉菜单动画效果 */
        [data-os-selector-dropdown] {
          animation: dropdownFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        
        [data-appname-selector-dropdown] {
          animation: dropdownFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        
        [data-appid-selector-dropdown] {
          animation: dropdownFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        
        [data-category-selector-dropdown] {
          animation: dropdownFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
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
        
        /* 表格样式 */
        .ant-table-thead > tr > th {
          background-color: rgb(248, 249, 250) !important;
          border-bottom: 1px solid rgb(230, 233, 240) !important;
          color: rgb(34, 13, 78) !important;
          font-weight: 500 !important;
          font-size: 13px !important;
        }
        
        .ant-table-tbody > tr > td {
          border-bottom: 1px solid rgb(240, 240, 240) !important;
        }
        
        .ant-table-tbody > tr:hover > td {
          background-color: rgb(248, 249, 250) !important;
        }
        
        .ant-table {
          border: 1px solid rgb(230, 233, 240) !important;
          border-radius: 6px !important;
        }
        
        .ant-table-container {
          border-radius: 6px !important;
        }
        
        /* 分页样式 */
        .ant-pagination-item {
          border-radius: 4px !important;
          border: 1px solid rgb(230, 233, 240) !important;
          color: rgb(34, 13, 78) !important;
        }
        
        .ant-pagination-item:hover {
          border-color: rgb(114, 46, 209) !important;
          color: rgb(114, 46, 209) !important;
        }
        
        .ant-pagination-item-active {
          background-color: rgb(114, 46, 209) !important;
          border-color: rgb(114, 46, 209) !important;
          color: white !important;
        }
        
        .ant-pagination-item-active:hover {
          background-color: rgb(95, 38, 180) !important;
          border-color: rgb(95, 38, 180) !important;
        }
        
        /* 确保分页按钮内的所有文本元素在选中状态下都是白色 */
        .ant-pagination-item-active a,
        .ant-pagination-item-active span,
        .ant-pagination-item-active .ant-pagination-item-link {
          color: white !important;
        }
        
        .ant-pagination-item-active:hover a,
        .ant-pagination-item-active:hover span,
        .ant-pagination-item-active:hover .ant-pagination-item-link {
          color: white !important;
        }
        
        /* 分页按钮内的链接和文本样式 */
        .ant-pagination-item a,
        .ant-pagination-item span {
          color: inherit !important;
        }
        
        .ant-pagination-prev .ant-pagination-item-link,
        .ant-pagination-next .ant-pagination-item-link {
          border: 1px solid rgb(230, 233, 240) !important;
          color: rgb(34, 13, 78) !important;
        }
        
        .ant-pagination-prev:hover .ant-pagination-item-link,
        .ant-pagination-next:hover .ant-pagination-item-link {
          border-color: rgb(114, 46, 209) !important;
          color: rgb(114, 46, 209) !important;
        }
        
        /* 表单样式 */
        .ant-form-item-label > label {
          color: rgb(34, 13, 78) !important;
          font-weight: 500 !important;
        }
        
        .ant-select-selector {
          border-radius: 4px !important;
          border: 1px solid rgb(230, 233, 240) !important;
          transition: all 0.2s !important;
        }
        
        .ant-select-selector:hover {
          border-color: rgb(114, 46, 209) !important;
        }
        
        .ant-select-focused .ant-select-selector {
          border-color: rgb(114, 46, 209) !important;
          box-shadow: 0 0 0 2px rgba(114, 46, 209, 0.1) !important;
        }
        
        .ant-input {
          border-radius: 4px !important;
          border: 1px solid rgb(230, 233, 240) !important;
          transition: all 0.2s !important;
        }
        
        .ant-input:hover {
          border-color: rgb(114, 46, 209) !important;
        }
        
        .ant-input:focus {
          border-color: rgb(114, 46, 209) !important;
          box-shadow: 0 0 0 2px rgba(114, 46, 209, 0.1) !important;
        }

        /* 筛选器下拉弹层样式 - 与报表管理页面保持一致 */
        .ant-select-dropdown {
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
        
        /* 筛选器下拉选项样式 */
        .ant-select-dropdown .ant-select-item,
        .ant-select-dropdown .ant-select-item-option,
        .ant-select-dropdown .ant-select-item-option-content {
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
        
        /* 筛选器选项悬停状态 */
        .ant-select-dropdown .ant-select-item-option:hover {
          background-color: rgba(114, 46, 209, 0.04) !important;
          transform: none !important;
          margin: 0 !important;
          border-radius: 0 !important;
        }
        
        /* 筛选器选项激活状态 */
        .ant-select-dropdown .ant-select-item-option-active {
          border-radius: 0 !important;
          background-color: rgba(114, 46, 209, 0.08) !important;
          outline: none !important;
          box-shadow: none !important;
          margin: 0 !important;
        }
        
        /* 筛选器选项选中状态 */
        .ant-select-dropdown .ant-select-item-option-selected {
          border-radius: 0 !important;
          background-color: rgba(114, 46, 209, 0.12) !important;
          color: rgb(114, 46, 209) !important;
          outline: none !important;
          box-shadow: none !important;
          font-weight: 500 !important;
          margin: 0 !important;
        }
        
        /* 筛选器选项文本样式 */
        .ant-select-dropdown .ant-select-item-option-content {
          font-size: 13px !important;
          line-height: 20px !important;
          color: rgb(34, 13, 78) !important;
          font-weight: 400 !important;
          letter-spacing: 0.0025em !important;
        }
        
        /* 筛选器选中项文本样式 */
        .ant-select-dropdown .ant-select-item-option-selected .ant-select-item-option-content {
          font-weight: 500 !important;
          color: rgb(114, 46, 209) !important;
        }
        
        /* 完全清除Ant Design默认Loading样式 - 使用最高优先级 */
        .ant-table-loading .ant-table-loading-mask,
        .ant-table-loading .ant-table-loading-spinner,
        .ant-table-loading .ant-spin,
        .ant-table-loading .ant-spin-dot,
        .ant-table-loading .ant-spin-dot-item,
        .ant-table-loading .ant-spin-text,
        .ant-table-loading .ant-spin-container,
        .ant-table-loading .ant-spin-nested-loading,
        .ant-table-loading .ant-spin-spinning,
        .ant-table-loading .ant-spin-lg,
        .ant-table-loading .ant-spin-sm,
        .ant-table-loading .ant-spin-xs {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          position: absolute !important;
          z-index: -1 !important;
          clip: rect(0, 0, 0, 0) !important;
          clip-path: inset(50%) !important;
          width: 1px !important;
          height: 1px !important;
          margin: -1px !important;
          padding: 0 !important;
          border: 0 !important;
          overflow: hidden !important;
        }
        
        /* 清除Ant Design Loading的容器样式 */
        .ant-table-loading .ant-table-loading-mask {
          background: transparent !important;
          background-color: transparent !important;
          background-image: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          border: none !important;
          box-shadow: none !important;
          margin: 0 !important;
          padding: 0 !important;
          position: static !important;
          top: auto !important;
          left: auto !important;
          right: auto !important;
          bottom: auto !important;
          width: auto !important;
          height: auto !important;
          min-width: auto !important;
          min-height: auto !important;
          max-width: none !important;
          max-height: none !important;
          transform: none !important;
          transition: none !important;
          animation: none !important;
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
        .ant-table {
          will-change: opacity, transform; /* 优化动画性能 */
        }
        
        /* 额外清除Ant Design Loading样式 - 覆盖所有可能的变体 */
        .ant-table-loading .ant-table-loading-mask,
        .ant-table-loading .ant-table-loading-spinner,
        .ant-table-loading .ant-spin,
        .ant-table-loading .ant-spin-dot,
        .ant-table-loading .ant-spin-dot-item,
        .ant-table-loading .ant-spin-text,
        .ant-table-loading .ant-spin-container,
        .ant-table-loading .ant-spin-nested-loading,
        .ant-table-loading .ant-spin-spinning,
        .ant-table-loading .ant-spin-lg,
        .ant-table-loading .ant-spin-sm,
        .ant-table-loading .ant-spin-xs,
        /* 覆盖更多可能的Loading相关类名 */
        .ant-table-loading .ant-table-loading-indicator,
        .ant-table-loading .ant-table-loading-content,
        .ant-table-loading .ant-table-loading-wrapper,
        .ant-table-loading .ant-table-loading-overlay,
        .ant-table-loading .ant-table-loading-background,
        .ant-table-loading .ant-table-loading-border,
        .ant-table-loading .ant-table-loading-shadow,
        .ant-table-loading .ant-table-loading-blur,
        .ant-table-loading .ant-table-loading-fade,
        .ant-table-loading .ant-table-loading-scale,
        .ant-table-loading .ant-table-loading-rotate,
        .ant-table-loading .ant-table-loading-slide,
        .ant-table-loading .ant-table-loading-bounce,
        .ant-table-loading .ant-table-loading-pulse,
        .ant-table-loading .ant-table-loading-wave,
        .ant-table-loading .ant-table-loading-ripple,
        .ant-table-loading .ant-table-loading-shake,
        .ant-table-loading .ant-table-loading-tada,
        .ant-table-loading .ant-table-loading-jello,
        .ant-table-loading .ant-table-loading-hinge,
        .ant-table-loading .ant-table-loading-rollIn,
        .ant-table-loading .ant-table-loading-rollOut,
        .ant-table-loading .ant-table-loading-zoomIn,
        .ant-table-loading .ant-table-loading-zoomOut,
        .ant-table-loading .ant-table-loading-slideInUp,
        .ant-table-loading .ant-table-loading-slideInDown,
        .ant-table-loading .ant-table-loading-slideInLeft,
        .ant-table-loading .ant-table-loading-slideInRight,
        .ant-table-loading .ant-table-loading-slideOutUp,
        .ant-table-loading .ant-table-loading-slideOutDown,
        .ant-table-loading .ant-table-loading-slideOutLeft,
        .ant-table-loading .ant-table-loading-slideOutRight,
        .ant-table-loading .ant-table-loading-fadeIn,
        .ant-table-loading .ant-table-loading-fadeOut,
        .ant-table-loading .ant-table-loading-fadeInUp,
        .ant-table-loading .ant-table-loading-fadeInDown,
        .ant-table-loading .ant-table-loading-fadeInLeft,
        .ant-table-loading .ant-table-loading-fadeInRight,
        .ant-table-loading .ant-table-loading-fadeOutUp,
        .ant-table-loading .ant-table-loading-fadeOutDown,
        .ant-table-loading .ant-table-loading-fadeOutLeft,
        .ant-table-loading .ant-table-loading-fadeOutRight,
        .ant-table-loading .ant-table-loading-bounceIn,
        .ant-table-loading .ant-table-loading-bounceOut,
        .ant-table-loading .ant-table-loading-bounceInUp,
        .ant-table-loading .ant-table-loading-bounceInDown,
        .ant-table-loading .ant-table-loading-bounceInLeft,
        .ant-table-loading .ant-table-loading-bounceInRight,
        .ant-table-loading .ant-table-loading-bounceOutUp,
        .ant-table-loading .ant-table-loading-bounceOutDown,
        .ant-table-loading .ant-table-loading-bounceOutLeft,
        .ant-table-loading .ant-table-loading-bounceOutRight,
        .ant-table-loading .ant-table-loading-flip,
        .ant-table-loading .ant-table-loading-flipInX,
        .ant-table-loading .ant-table-loading-flipInY,
        .ant-table-loading .ant-table-loading-flipOutX,
        .ant-table-loading .ant-table-loading-flipOutY,
        .ant-table-loading .ant-table-loading-lightSpeedIn,
        .ant-table-loading .ant-table-loading-lightSpeedOut,
        .ant-table-loading .ant-table-loading-rotateIn,
        .ant-table-loading .ant-table-loading-rotateOut,
        .ant-table-loading .ant-table-loading-rotateInDownLeft,
        .ant-table-loading .ant-table-loading-rotateInDownRight,
        .ant-table-loading .ant-table-loading-rotateInUpLeft,
        .ant-table-loading .ant-table-loading-rotateInUpRight,
        .ant-table-loading .ant-table-loading-rotateOutDownLeft,
        .ant-table-loading .ant-table-loading-rotateOutDownRight,
        .ant-table-loading .ant-table-loading-rotateOutUpLeft,
        .ant-table-loading .ant-table-loading-rotateOutUpRight,
        .ant-table-loading .ant-table-loading-hinge,
        .ant-table-loading .ant-table-loading-jackInTheBox,
        .ant-table-loading .ant-table-loading-rollIn,
        .ant-table-loading .ant-table-loading-rollOut,
        .ant-table-loading .ant-table-loading-zoomIn,
        .ant-table-loading .ant-table-loading-zoomOut,
        .ant-table-loading .ant-table-loading-zoomInDown,
        .ant-table-loading .ant-table-loading-zoomInLeft,
        .ant-table-loading .ant-table-loading-zoomInRight,
        .ant-table-loading .ant-table-loading-zoomInUp,
        .ant-table-loading .ant-table-loading-zoomOutDown,
        .ant-table-loading .ant-table-loading-zoomOutLeft,
        .ant-table-loading .ant-table-loading-zoomOutRight,
        .ant-table-loading .ant-table-loading-zoomOutUp,
        .ant-table-loading .ant-table-loading-slideInDown,
        .ant-table-loading .ant-table-loading-slideInLeft,
        .ant-table-loading .ant-table-loading-slideInRight,
        .ant-table-loading .ant-table-loading-slideInUp,
        .ant-table-loading .ant-table-loading-slideOutDown,
        .ant-table-loading .ant-table-loading-slideOutLeft,
        .ant-table-loading .ant-table-loading-slideOutRight,
        .ant-table-loading .ant-table-loading-slideOutUp {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          position: absolute !important;
          z-index: -1 !important;
          clip: rect(0, 0, 0, 0) !important;
          clip-path: inset(50%) !important;
          width: 1px !important;
          height: 1px !important;
          margin: -1px !important;
          padding: 0 !important;
          border: 0 !important;
          overflow: hidden !important;
        }
        
        /* 表格行渐进式显示动画 */
        .ant-table .ant-table-tbody > tr {
          animation: fadeInRow 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
          animation-delay: calc(var(--row-index, 0) * 0.1s);
          opacity: 0;
          transform: translateY(20px) scale(0.95);
        }
        
        /* 强制清除所有可能的Ant Design Loading样式 - 使用最高优先级 */
        .ant-table-loading *,
        .ant-table-loading *::before,
        .ant-table-loading *::after {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          position: absolute !important;
          z-index: -9999 !important;
          clip: rect(0, 0, 0, 0) !important;
          clip-path: inset(50%) !important;
          width: 1px !important;
          height: 1px !important;
          margin: -1px !important;
          padding: 0 !important;
          border: 0 !important;
          overflow: hidden !important;
          background: transparent !important;
          background-color: transparent !important;
          background-image: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          box-shadow: none !important;
          transform: none !important;
          transition: none !important;
          animation: none !important;
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
      `}</style>
    </div>
  );
};

export default AppsFinder; 