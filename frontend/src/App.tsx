import React, { useState } from 'react'
import { Layout, Menu, Typography } from 'antd'
import { DatabaseOutlined, FieldTimeOutlined, HistoryOutlined } from '@ant-design/icons'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import CredentialsPage from './pages/CredentialsPage'
import RulesPage from './pages/RulesPage'
import JobsPage from './pages/JobsPage'
import LoginPage from './pages/LoginPage'

const { Sider, Content } = Layout
const { Title } = Typography

const App: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => sessionStorage.getItem('auth_password') !== null
  )

  if (!isAuthenticated) {
    return (
      <LoginPage
        onLogin={(password) => {
          sessionStorage.setItem('auth_password', password)
          setIsAuthenticated(true)
        }}
      />
    )
  }

  const selectedKey = () => {
    if (location.pathname.startsWith('/credentials')) return 'credentials'
    if (location.pathname.startsWith('/rules')) return 'rules'
    if (location.pathname.startsWith('/jobs')) return 'jobs'
    return 'credentials'
  }

  const menuItems = [
    {
      key: 'credentials',
      icon: <DatabaseOutlined />,
      label: 'Подключения',
      onClick: () => navigate('/credentials'),
    },
    {
      key: 'rules',
      icon: <FieldTimeOutlined />,
      label: 'Правила TTL',
      onClick: () => navigate('/rules'),
    },
    {
      key: 'jobs',
      icon: <HistoryOutlined />,
      label: 'История задач',
      onClick: () => navigate('/jobs'),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        theme="dark"
        style={{ position: 'fixed', height: '100vh', left: 0, top: 0, bottom: 0, zIndex: 100 }}
      >
        <div
          style={{
            padding: collapsed ? '16px 8px' : '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            marginBottom: 8,
          }}
        >
          {!collapsed && (
            <Title
              level={5}
              style={{ color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}
            >
              S3 TTL Manager
            </Title>
          )}
          {collapsed && (
            <FieldTimeOutlined style={{ color: '#1890ff', fontSize: 20 }} />
          )}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey()]}
          items={menuItems}
        />
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 220, transition: 'margin-left 0.2s' }}>
        <Content
          style={{
            padding: 24,
            minHeight: '100vh',
            background: '#f0f2f5',
          }}
        >
          <Routes>
            <Route path="/" element={<Navigate to="/credentials" replace />} />
            <Route path="/credentials" element={<CredentialsPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/jobs" element={<JobsPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
