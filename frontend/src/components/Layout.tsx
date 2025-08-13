import React, { useState } from 'react';
import { Layout as AntLayout, Menu, Button, theme, Dropdown } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DashboardOutlined,
  BarChartOutlined,
  SettingOutlined,
  TeamOutlined,
  FileTextOutlined,
  UserOutlined,
  HomeOutlined,
  GlobalOutlined,
  SearchOutlined,
  LogoutOutlined,
  ThunderboltOutlined, // 新增闪电图标
  ExportOutlined, // 新增推开门图标
  AppstoreOutlined, // 新增APP图标
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import type { MenuProps } from 'antd';
import { useLanguage } from '../contexts/LanguageContext';

const { Header, Sider, Content } = AntLayout;

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(true);
  const [hovered, setHovered] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { translations, setLanguage, language } = useLanguage();
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const menuItems = [
    {
      key: '/',
      icon: <SearchOutlined />,
      label: translations.menu.dataFetch,
    },
    {
      key: '/reports',
      icon: <FileTextOutlined />,
      label: translations.menu.reports,
    },
    {
      key: '/dashboard',
      icon: <BarChartOutlined />,
      label: translations.menu.dashboard,
    },
    {
      key: '/apps',
      icon: <AppstoreOutlined style={{ color: '#1677ff' }} />, // 蓝色APP图标
      label: 'Apps Finder',
    },
    {
      key: '/mindsdb',
      icon: <ThunderboltOutlined style={{ color: '#faad14' }} />, // MindsDB
      label: 'MindsDB',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: translations.menu.settings,
    },
  ];

  const languageItems: MenuProps['items'] = [
    {
      key: 'zh',
      label: '简体中文',
      disabled: true, // 禁用简体中文选项
      style: { color: '#999', cursor: 'not-allowed' }, // 禁用状态的样式
    },
    {
      key: 'en',
      label: 'English',
    },
  ];

  const handleLanguageChange: MenuProps['onClick'] = ({ key }) => {
    // 如果选择的是简体中文（已禁用），则不执行语言切换
    if (key === 'zh') {
      return;
    }
    setLanguage(key as 'zh' | 'en');
  };

  return (
    <AntLayout style={{ minHeight: '100vh', background: '#fff' }}>
      <Header style={{ 
        padding: '0 24px', 
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #f0f0f0',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        height: 64,
        width: '100%'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginLeft: 0,
          transition: 'margin-left 0.2s',
          position: 'relative',
          zIndex: 1002
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: '16px',
              width: 64,
              height: 64,
              marginLeft: -24,
              marginRight: 16,
              position: 'relative',
              zIndex: 1002
            }}
          />
          <span style={{ 
            fontSize: '18px', 
            fontWeight: 'bold',
            position: 'relative',
            zIndex: 1002
          }}>
            {translations.common.title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Button 
            type="text" 
            icon={<HomeOutlined />}
            onClick={() => navigate('/')}
            style={{ height: '64px', padding: '0 16px' }}
          >
            {translations.common.home}
          </Button>
          <Button 
            type="text" 
            icon={<UserOutlined />}
            onClick={() => navigate('/account')}
            style={{ height: '64px', padding: '0 16px' }}
          >
            {translations.common.account}
          </Button>
          <Dropdown menu={{ items: languageItems, onClick: handleLanguageChange }} placement="bottomRight">
            <Button 
              type="text" 
              icon={<GlobalOutlined />}
              style={{ height: '64px', padding: '0 16px' }}
            >
              {language === 'zh' ? '简体中文' : 'English'}
            </Button>
          </Dropdown>
        </div>
      </Header>
      <AntLayout style={{ marginTop: 64, background: '#fff' }}>
        <Sider 
          trigger={null} 
          collapsible 
          collapsed={collapsed} 
          theme="light"
          width={160}
          collapsedWidth={64}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            position: 'fixed',
            left: 0,
            top: 64,
            bottom: 0,
            overflow: 'auto',
            height: 'calc(100vh - 64px)',
            zIndex: 999,
            transition: 'all 0.2s',
            boxShadow: hovered ? '2px 0 8px rgba(0,0,0,0.15)' : 'none',
            background: '#fff'
          }}
        >
          <Menu
            theme="light"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{
              height: '100%',
              borderRight: 0,
              padding: '8px 0',
              background: 'transparent'
            }}
          />
          <div style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: '100%',
            padding: collapsed ? '8px 0' : '16px 0',
            display: 'flex',
            justifyContent: 'center',
            background: '#fff',
          }}>
          <Button
            type="text"
            icon={<ExportOutlined style={{ fontSize: 22, color: '#222', transition: 'color 0.2s' }} />}
            size="large"
            style={{
              width: collapsed ? 40 : 120,
              height: 40,
              borderRadius: 8,
              background: 'transparent',
              boxShadow: 'none',
              border: 'none',
              color: '#222',
              fontWeight: 600,
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s cubic-bezier(.4,1.2,.6,1)',
              cursor: 'pointer',
              padding: collapsed ? 0 : '0 16px',
              transform: 'scale(1)',
            }}
            title={translations.account.logout}
            onMouseEnter={e => {
              if (!collapsed) {
                e.currentTarget.querySelector('span')!.style.color = '#ff4d4f';
              }
              e.currentTarget.style.transform = 'scale(1.25)';
            }}
            onMouseLeave={e => {
              if (!collapsed) {
                e.currentTarget.querySelector('span')!.style.color = '#222';
              }
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onClick={() => {
              if (typeof window !== 'undefined') {
                const { logout } = require('../contexts/AuthContext');
                if (logout) logout();
              }
              window.location.href = '/login';
            }}
          >
            {!collapsed && <span style={{ marginLeft: 8, color: '#222', transition: 'color 0.2s' }}>{translations.account.logout}</span>}
          </Button>
        </div>
        </Sider>
        <Content
          style={{
            margin: 0,
            padding: '24px',
            background: '#fff',
            minHeight: 'calc(100vh - 64px)',
            marginLeft: 64,
            transition: 'margin-left 0.2s',
            position: 'relative',
            zIndex: 1
          }}
        >
          <div style={{ 
            background: '#fff',
            minHeight: '100%',
            padding: '0 16px',
            maxWidth: '1800px',
            margin: '0 auto',
            marginLeft: collapsed ? '0px' : '96px',
            transition: 'margin-left 0.2s'
          }}>
            {children}
          </div>
        </Content>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;
export type { LayoutProps };
