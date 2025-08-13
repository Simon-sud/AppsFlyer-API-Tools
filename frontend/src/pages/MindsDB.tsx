import React, { useRef } from 'react';
import { Card, Row, Col, Typography } from 'antd';
import {
  ThunderboltOutlined,
  BulbOutlined,
  DeploymentUnitOutlined,
  DatabaseOutlined,
  RobotOutlined
} from '@ant-design/icons';

const { Title, Paragraph } = Typography;

const features = [
  {
    title: 'Natural language data queries',
    desc: 'Ask questions in natural language and receive precise answers.',
    icon: <BulbOutlined style={{ fontSize: 32, color: '#faad14' }} />,
    href: 'https://docs.mindsdb.com/mindsdb-respond',
  },
  {
    title: 'Actionable responses',
    desc: 'Drive decisions and automations directly from query results.',
    icon: <DeploymentUnitOutlined style={{ fontSize: 32, color: '#1677ff' }} />,
    href: 'https://docs.mindsdb.com/use-cases/predictive_analytics/overview',
  },
  {
    title: 'Agents',
    desc: 'Deploy agents specialized in answering questions over connected and unified data.',
    icon: <RobotOutlined style={{ fontSize: 32, color: '#722ed1' }} />,
    href: 'https://docs.mindsdb.com/mindsdb_sql/agents/agent',
  },
  {
    title: 'MCP API',
    desc: 'Connect to MindsDB through MCP (Model Context Protocol) for seamless interaction.',
    icon: <DatabaseOutlined style={{ fontSize: 32, color: '#52c41a' }} />,
    href: 'https://docs.mindsdb.com/mcp/overview',
  },
];

const MindsDB: React.FC = () => {
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <div style={{ margin: '0 auto', padding: '32px 0' }}>
      <Title level={2} style={{ textAlign: 'center', marginBottom: 16 }}>MindsDB Respond</Title>
      <Paragraph style={{ textAlign: 'center', fontSize: 18, marginBottom: 32 }}>
        MindsDB enables generating insightful and accurate responses from unified data using natural language.<br />
        Whether answering questions, powering applications, or enabling automations, responses are context-aware and grounded in real-time data.
      </Paragraph>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
        <button
          ref={btnRef}
          onClick={() => window.open('http://8.222.149.42:47334/', '_blank')}
          style={{
            padding: '0 32px',
            height: 44,
            border: 'none',
            borderRadius: 24,
            fontWeight: 700,
            fontSize: 18,
            color: '#fff',
            background: 'linear-gradient(90deg, #ff6a00 0%, #ee0979 50%, #00c3ff 100%, #ff6a00 100%)',
            backgroundSize: '200% 100%',
            backgroundPosition: '0% 50%',
            boxShadow: '0 2px 12px #f0f1f3',
            cursor: 'pointer',
            transition: 'background-position 0.5s cubic-bezier(.4,1.2,.6,1), box-shadow 0.2s',
            outline: 'none',
            position: 'relative',
            zIndex: 2,
            letterSpacing: 1,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.backgroundPosition = '60% 50%';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 24px #ff6a0033';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.backgroundPosition = '0% 50%';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 12px #f0f1f3';
          }}
        >
          Manage Console
        </button>
      </div>
      <Row gutter={[32, 32]} justify="center">
        {features.map(f => (
          <Col xs={24} sm={12} md={12} key={f.title}>
            <a
              href={f.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none', display: 'block' }}
            >
              <Card
                hoverable
                style={{
                  minHeight: 160,
                  borderRadius: 12,
                  boxShadow: '0 2px 12px #f0f1f3',
                  marginBottom: 16,
                  transition: 'transform 0.18s cubic-bezier(.4,1.2,.6,1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
                bodyStyle={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  padding: 24,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.transform = 'scale(1.15)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                }}
              >
                {f.icon}
                <Title level={4} style={{ margin: '16px 0 0 0' }}>{f.title}</Title>
                <Paragraph style={{ color: '#555', fontSize: 15, margin: 0 }}>{f.desc}</Paragraph>
              </Card>
            </a>
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default MindsDB; 