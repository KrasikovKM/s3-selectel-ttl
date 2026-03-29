import React, { useState } from 'react'
import { Button, Card, Form, Input, Typography } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import api from '../api/client'

const { Title, Text } = Typography

interface LoginPageProps {
  onLogin: (password: string) => void
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (values: { password: string }) => {
    setLoading(true)
    setError('')
    try {
      await api.post('/login', { password: values.password })
      onLogin(values.password)
    } catch {
      setError('Неверный пароль')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f2f5',
      }}
    >
      <Card style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <LockOutlined style={{ fontSize: 40, color: '#1890ff', marginBottom: 12 }} />
          <Title level={4} style={{ margin: 0 }}>
            S3 TTL Manager
          </Title>
          <Text type="secondary">Введите пароль для доступа</Text>
        </div>
        <Form onFinish={handleSubmit} layout="vertical">
          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Введите пароль' }]}
            validateStatus={error ? 'error' : undefined}
            help={error || undefined}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Пароль"
              size="large"
              autoFocus
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              Войти
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default LoginPage
