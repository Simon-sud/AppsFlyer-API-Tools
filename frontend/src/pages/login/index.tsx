import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Checkbox, message, Row, Col } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useAuth } from '../../contexts/AuthContext';
import { axiosInstance } from '../../services/api';

// 定义响应数据类型
interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    role: string;
    apiToken?: string;
    appId?: string;
    appName?: string;
  };
  message?: string;
}

// 动画效果
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

// 激光雨动画
const laserRain = keyframes`
  0% { 
    transform: translateY(-100px) translateX(0px) rotate(0deg); 
    opacity: 0; 
  }
  10% { 
    opacity: 1; 
  }
  90% { 
    opacity: 1; 
  }
  100% { 
    transform: translateY(100vh) translateX(100px) rotate(360deg); 
    opacity: 0; 
  }
`;

const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 20px rgba(255, 255, 255, 0.3); }
  50% { box-shadow: 0 0 40px rgba(255, 255, 255, 0.6); }
`;

const LoginContainer = styled.div<{ timeTheme: string }>`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  background: ${props => {
    switch (props.timeTheme) {
      case 'morning':
        return 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 25%, #fecfef 75%, #ff9a9e 100%)';
      case 'noon':
        return 'linear-gradient(135deg, #a8edea 0%, #fed6e3 25%, #fed6e3 75%, #a8edea 100%)';
      case 'afternoon':
        return 'linear-gradient(135deg, #667eea 0%, #764ba2 25%, #764ba2 75%, #667eea 100%)';
      case 'evening':
        return 'linear-gradient(135deg, #f093fb 0%, #f5576c 25%, #f5576c 75%, #f093fb 100%)';
      case 'night':
        return 'linear-gradient(135deg, #4facfe 0%, #00f2fe 25%, #00f2fe 75%, #4facfe 100%)';
      default:
        return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
  }};
`;



const Title = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: #1a237e;
  margin-bottom: 32px;
  text-align: center;
`;

const FormContainer = styled.div`
  .ant-form-item { margin-bottom: 24px; }
  .ant-input-affix-wrapper { border-radius: 8px; height: 48px; font-size: 16px; }
  .ant-input { font-size: 16px; }
  .ant-btn {
    height: 48px; font-size: 18px; border-radius: 8px;
    background: #0866ff; border: none; font-weight: 500;
  }
  .ant-btn:hover { background: #005ae0; }

  /* 去除浏览器自动填充的高亮背景 */
  input:-webkit-autofill,
  input:-webkit-autofill:focus,
  input:-webkit-autofill:hover,
  input:-webkit-autofill:active {
    -webkit-box-shadow: 0 0 0 1000px #fff inset !important;
    box-shadow: 0 0 0 1000px #fff inset !important;
    -webkit-text-fill-color: #2d2d2d !important;
    caret-color: #2d2d2d !important;
    transition: background-color 5000s ease-in-out 0s;
  }
`;

const BottomText = styled.div`
  margin-top: 32px;
  text-align: center;
  color: #2d2d2d;
  font-size: 16px;
`;

const LinkText = styled.a`
  color: #0866ff;
  font-weight: 500;
  margin-left: 8px;
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

const ForgotLink = styled.a`
  color: #0866ff;
  float: right;
  font-size: 15px;
  font-weight: 500;
  margin-top: 2px;
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

// 激光雨组件
const LaserBeam = styled.div<{ delay: number; left: number; timeTheme: string }>`
  position: absolute;
  width: 2px;
  height: 100px;
  background: ${props => {
    switch (props.timeTheme) {
      case 'morning':
        return 'linear-gradient(to bottom, rgba(255, 154, 158, 0.8), rgba(254, 207, 239, 0.4))';
      case 'noon':
        return 'linear-gradient(to bottom, rgba(168, 237, 234, 0.8), rgba(254, 214, 227, 0.4))';
      case 'afternoon':
        return 'linear-gradient(to bottom, rgba(102, 126, 234, 0.8), rgba(118, 75, 162, 0.4))';
      case 'evening':
        return 'linear-gradient(to bottom, rgba(240, 147, 251, 0.8), rgba(245, 87, 108, 0.4))';
      case 'night':
        return 'linear-gradient(to bottom, rgba(79, 172, 254, 0.8), rgba(0, 242, 254, 0.4))';
      default:
        return 'linear-gradient(to bottom, rgba(102, 126, 234, 0.8), rgba(118, 75, 162, 0.4))';
    }
  }};
  box-shadow: ${props => {
    switch (props.timeTheme) {
      case 'morning':
        return '0 0 10px rgba(255, 154, 158, 0.6), 0 0 20px rgba(255, 154, 158, 0.3)';
      case 'noon':
        return '0 0 10px rgba(168, 237, 234, 0.6), 0 0 20px rgba(168, 237, 234, 0.3)';
      case 'afternoon':
        return '0 0 10px rgba(102, 126, 234, 0.6), 0 0 20px rgba(102, 126, 234, 0.3)';
      case 'evening':
        return '0 0 10px rgba(240, 147, 251, 0.6), 0 0 20px rgba(240, 147, 251, 0.3)';
      case 'night':
        return '0 0 10px rgba(79, 172, 254, 0.6), 0 0 20px rgba(79, 172, 254, 0.3)';
      default:
        return '0 0 10px rgba(102, 126, 234, 0.6), 0 0 20px rgba(102, 126, 234, 0.3)';
    }
  }};
  left: ${props => props.left}%;
  animation: ${laserRain} ${props => 3 + props.delay * 0.5}s linear infinite;
  animation-delay: ${props => props.delay}s;
  transform-origin: center bottom;
`;

// 增强的登录框样式
const LoginBox = styled.div<{ timeTheme: string }>`
  width: 420px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  padding: 40px 32px 24px 32px;
  animation: ${fadeIn} 0.7s, ${pulseGlow} 3s ease-in-out infinite;
  position: relative;
  z-index: 10;
`;

const RecoveryError = styled.div`
  color: #e53935;
  font-size: 15px;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
`;

const RecoveryButton = styled(Button)<{disabled?: boolean}>`
  width: 100%;
  height: 48px;
  font-size: 18px;
  border-radius: 8px;
  background: ${({disabled}) => (disabled ? '#f5f6fa' : '#0866ff')} !important;
  color: ${({disabled}) => (disabled ? '#b0b3b8' : '#fff')} !important;
  border: none;
  font-weight: 500;
  margin-top: 16px;
  cursor: ${({disabled}) => (disabled ? 'not-allowed' : 'pointer')};
  transition: background 0.2s;
  &:hover {
    background: ${({disabled}) => (disabled ? '#f5f6fa' : '#005ae0')} !important;
    color: ${({disabled}) => (disabled ? '#b0b3b8' : '#fff')} !important;
  }
`;

const BackLink = styled.a`
  display: flex;
  align-items: center;
  color: #0866ff;
  font-size: 15px;
  font-weight: 500;
  margin-bottom: 24px;
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

interface LoginFormValues {
  email: string;
  password: string;
  remember?: boolean;
}

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryTouched, setRecoveryTouched] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [timeTheme, setTimeTheme] = useState('afternoon');
  const navigate = useNavigate();
  const [form] = Form.useForm<LoginFormValues>();
  const { login } = useAuth();

  // 根据时间设置主题
  useEffect(() => {
    const updateTimeTheme = () => {
      const now = new Date();
      const hour = now.getHours();
      
      if (hour >= 6 && hour < 12) {
        setTimeTheme('morning'); // 暖阳色调
      } else if (hour >= 12 && hour < 15) {
        setTimeTheme('noon'); // 绿色调
      } else if (hour >= 15 && hour < 18) {
        setTimeTheme('afternoon'); // 蓝调
      } else if (hour >= 18 && hour < 22) {
        setTimeTheme('evening'); // 晚霞色调
      } else {
        setTimeTheme('night'); // 夜晚色调
      }
    };

    updateTimeTheme();
    const interval = setInterval(updateTimeTheme, 60000); // 每分钟更新一次

    return () => clearInterval(interval);
  }, []);

  // 自动填充逻辑
  React.useEffect(() => {
    const remembered = localStorage.getItem('rememberMe');
    if (remembered === 'true') {
      const rememberedEmail = localStorage.getItem('rememberedEmail') || '';
      const rememberedPassword = localStorage.getItem('rememberedPassword') || '';
      form.setFieldsValue({
        email: rememberedEmail,
        password: rememberedPassword,
        remember: true,
      });
    }
  }, [form]);

  // 邮箱格式校验
  const isEmailFormat = (email: string) => /^[\w-.]+@[\w-]+\.[a-zA-Z]{2,}$/.test(email);
  // 是否包含@smartlead
  const isSmartleadEmail = (email: string) => email.includes('@smartlead');
  // 是否为有效邮箱
  const isValidSmartleadEmail = (email: string) => isEmailFormat(email) && isSmartleadEmail(email);

  const onFinish = async (values: LoginFormValues) => {
    setLoading(true);
    setLoginError('');
    try {
      console.log('开始登录请求');
      const response = await axiosInstance.post<LoginResponse>('/api/auth/login', {
        email: values.email,
        password: values.password,
      });

      console.log('登录响应:', response.data);

      if (response.status === 200 && response.data.token) {
        const user = {
          username: values.email.split('@')[0],
          email: values.email,
          role: response.data.user.role,
          lastLogin: new Date().toISOString(),
          id: response.data.user.id || values.email,
          accountType: response.data.user.role,
          accountId: response.data.user.id || values.email,
          accountName: values.email.split('@')[0],
          apiToken: response.data.user.apiToken,
          appId: response.data.user.appId,
          appName: response.data.user.appName,
        };

        const now = Date.now();
        const token = response.data.token;

        // 无论是否记住登录，都先保存到 localStorage
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userProfile', JSON.stringify(user));
        localStorage.setItem('loginTime', now.toString());
        localStorage.setItem('token', token);

        // 如果选择记住登录，则保存额外的信息
        if (values.remember) {
          localStorage.setItem('rememberMe', 'true');
          localStorage.setItem('rememberedEmail', values.email);
        } else {
          localStorage.removeItem('rememberMe');
          localStorage.removeItem('rememberedEmail');
        }

        // 清除 sessionStorage 中的数据
          sessionStorage.removeItem('isLoggedIn');
          sessionStorage.removeItem('userProfile');
          sessionStorage.removeItem('loginTime');
          sessionStorage.removeItem('token');

        // 设置 axios 默认请求头
        axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;

        // 使用 AuthContext 的 login 方法
        login(user);

        message.success('登录成功');
        navigate('/');
      } else {
        setLoginError(response.data.message || '登录失败');
        return;
      }
    } catch (error: any) {
      console.error('登录失败:', error);
      if (error.response?.data?.message) {
        setLoginError(error.response.data.message);
      } else if (error.code === 'ERR_NETWORK') {
        setLoginError('网络连接错误，请检查后端服务是否正常运行');
      } else {
        setLoginError('登录失败，请稍后重试');
      }
      return;
    } finally {
      setLoading(false);
    }
  };

  // 清除登录错误提示
  const handleLoginInputChange = () => {
    if (loginError) setLoginError('');
  };

  // 找回密码表单提交
  const handleRecovery = () => {
    if (!isValidSmartleadEmail(recoveryEmail)) {
      return;
    }
    setRecoveryError('');
    const subject = encodeURIComponent('Password Reset Request');
    const body = encodeURIComponent(`Hi, I need to reset my password. My account email is: ${recoveryEmail}`);
    const mailtoUrl = `mailto:simon@smartlead.tech?subject=${subject}&body=${body}`;
    window.location.href = mailtoUrl;
  };

  // 邮箱输入变化
  const handleRecoveryEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setRecoveryEmail(value);
    setRecoveryTouched(true);
    if (!isEmailFormat(value)) {
      setRecoveryError('Please check your email format.');
    } else if (!isSmartleadEmail(value)) {
      setRecoveryError('Email is not allowed.');
    } else {
      setRecoveryError('');
    }
  };

  // 恢复到登录
  const handleBackToLogin = () => {
    setShowRecovery(false);
    setRecoveryEmail('');
    setRecoveryError('');
    setRecoveryTouched(false);
  };

  return (
    <LoginContainer timeTheme={timeTheme}>
      {/* 激光雨效果 */}
      <LaserBeam delay={0} left={5} timeTheme={timeTheme} />
      <LaserBeam delay={1.5} left={15} timeTheme={timeTheme} />
      <LaserBeam delay={3} left={25} timeTheme={timeTheme} />
      <LaserBeam delay={0.5} left={35} timeTheme={timeTheme} />
      <LaserBeam delay={2} left={45} timeTheme={timeTheme} />
      <LaserBeam delay={3.5} left={55} timeTheme={timeTheme} />
      <LaserBeam delay={1} left={65} timeTheme={timeTheme} />
      <LaserBeam delay={2.5} left={75} timeTheme={timeTheme} />
      <LaserBeam delay={0.8} left={85} timeTheme={timeTheme} />
      <LaserBeam delay={1.8} left={95} timeTheme={timeTheme} />
      
      <LoginBox timeTheme={timeTheme}>
        <Title>{showRecovery ? 'Get Password' : 'AF WORKBENCH LOGIN'}</Title>
        {showRecovery ? (
          <>
            <BackLink onClick={handleBackToLogin}><ArrowLeftOutlined style={{marginRight: 6}} />Back to login</BackLink>
            <FormContainer>
              <Form layout="vertical">
                <Form.Item
                  name="recoveryEmail"
                  label="Email"
                  validateStatus={recoveryError && recoveryTouched ? 'error' : ''}
                  help={recoveryError && recoveryTouched ? (
                    <RecoveryError><MailOutlined /> {recoveryError}</RecoveryError>
                  ) : null}
                >
                  <Input
                    placeholder="Enter your email address"
                    size="large"
                    value={recoveryEmail}
                    onChange={handleRecoveryEmailChange}
                    onBlur={() => setRecoveryTouched(true)}
                    autoFocus
                  />
                </Form.Item>
                <RecoveryButton
                  type="primary"
                  disabled={!isValidSmartleadEmail(recoveryEmail)}
                  onClick={handleRecovery}
                  block
                >
                  Send
                </RecoveryButton>
              </Form>
            </FormContainer>
          </>
        ) : (
          <>
            <FormContainer>
              <Form
                form={form}
                name="login"
                onFinish={onFinish}
                autoComplete="off"
                layout="vertical"
              >
                <Form.Item
                  name="email"
                  label="Email"
                  validateStatus={loginError ? 'error' : ''}
                  rules={[
                    { required: true, message: 'Please enter your email address' },
                    { type: 'email', message: 'Please enter a valid email address' }
                  ]}
                >
                  <Input
                    prefix={<UserOutlined />}
                    placeholder="Enter your email address"
                    size="large"
                    onChange={handleLoginInputChange}
                  />
                </Form.Item>

                <Form.Item
                  name="password"
                  label="Password"
                  validateStatus={loginError ? 'error' : ''}
                  rules={[
                    { required: true, message: 'Please enter your password' },
                    { min: 6, message: 'Password must be at least 6 characters' }
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined />}
                    placeholder="Enter password"
                    size="large"
                    onChange={handleLoginInputChange}
                  />
                </Form.Item>

                {loginError && (
                  <div style={{ color: '#e53935', marginBottom: 16, fontSize: 15, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MailOutlined /> {loginError}
                  </div>
                )}

                <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                  <Col>
                    <Form.Item name="remember" valuePropName="checked" noStyle>
                      <Checkbox style={{ fontSize: 15, color: '#2d2d2d' }}>Remember me</Checkbox>
                    </Form.Item>
                  </Col>
                  <Col>
                    <ForgotLink onClick={() => setShowRecovery(true)}>Forgot password?</ForgotLink>
                  </Col>
                </Row>

                <Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={loading}
                    block
                    size="large"
                  >
                    Login
                  </Button>
                </Form.Item>
              </Form>
            </FormContainer>
          </>
        )}
      </LoginBox>
    </LoginContainer>
  );
};

export default Login; 