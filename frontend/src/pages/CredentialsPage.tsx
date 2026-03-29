import React, { useEffect, useState } from 'react'
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  message,
  Tooltip,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { credentialsApi, Credential, CredentialCreate } from '../api/client'

const { Title } = Typography

const CredentialsPage: React.FC = () => {
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<number | null>(null)
  const [form] = Form.useForm<CredentialCreate>()

  const fetchCredentials = async () => {
    setLoading(true)
    try {
      const data = await credentialsApi.list()
      setCredentials(data)
    } catch {
      message.error('Не удалось загрузить список подключений')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCredentials()
  }, [])

  const handleCreate = async (values: CredentialCreate) => {
    setSaving(true)
    try {
      await credentialsApi.create(values)
      message.success('Подключение добавлено')
      setModalOpen(false)
      form.resetFields()
      fetchCredentials()
    } catch {
      message.error('Не удалось создать подключение')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await credentialsApi.delete(id)
      message.success('Подключение удалено')
      fetchCredentials()
    } catch {
      message.error('Не удалось удалить подключение')
    }
  }

  const handleTest = async (id: number) => {
    setTestingId(id)
    try {
      const result = await credentialsApi.test(id)
      if (result.success) {
        message.success(result.message)
      } else {
        message.error(result.message)
      }
    } catch {
      message.error('Ошибка при проверке подключения')
    } finally {
      setTestingId(null)
    }
  }

  const columns: ColumnsType<Credential> = [
    {
      title: 'Название',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: 'Endpoint',
      dataIndex: 'endpoint_url',
      key: 'endpoint_url',
      ellipsis: true,
      render: (url: string) => (
        <Tooltip title={url}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{url}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Ключ доступа',
      dataIndex: 'access_key',
      key: 'access_key',
      width: 200,
      render: (key: string) => (
        <Tag style={{ fontFamily: 'monospace' }}>
          {key.length > 16 ? key.substring(0, 8) + '...' + key.substring(key.length - 4) : key}
        </Tag>
      ),
    },
    {
      title: 'Бакет',
      dataIndex: 'bucket_name',
      key: 'bucket_name',
      width: 160,
      render: (bucket: string) => (
        <Tag color="blue" style={{ fontFamily: 'monospace' }}>
          {bucket}
        </Tag>
      ),
    },
    {
      title: 'Добавлено',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (dt: string) => dayjs(dt).format('DD.MM.YYYY HH:mm'),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space>
          <Button
            icon={<ApiOutlined />}
            size="small"
            loading={testingId === record.id}
            onClick={() => handleTest(record.id)}
          >
            Проверить
          </Button>
          <Popconfirm
            title="Удалить подключение?"
            description="Все связанные правила TTL также будут удалены."
            okText="Да, удалить"
            cancelText="Отмена"
            okType="danger"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          Подключения S3
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalOpen(true)}
        >
          Добавить подключение
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={credentials}
        rowKey="id"
        loading={loading}
        pagination={false}
        bordered
        locale={{ emptyText: 'Нет подключений. Добавьте первое подключение S3.' }}
      />

      <Modal
        title="Новое подключение S3"
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          form.resetFields()
        }}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText="Добавить"
        cancelText="Отмена"
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            label="Название"
            name="name"
            rules={[{ required: true, message: 'Введите название' }]}
          >
            <Input placeholder="Мой бакет Selectel" />
          </Form.Item>
          <Form.Item
            label="Endpoint URL"
            name="endpoint_url"
            rules={[
              { required: true, message: 'Введите endpoint URL' },
              { type: 'url', message: 'Введите корректный URL' },
            ]}
          >
            <Input placeholder="https://s3.selcdn.ru" />
          </Form.Item>
          <Form.Item
            label="Ключ доступа (Access Key)"
            name="access_key"
            rules={[{ required: true, message: 'Введите ключ доступа' }]}
          >
            <Input placeholder="Ваш access key" />
          </Form.Item>
          <Form.Item
            label="Секретный ключ (Secret Key)"
            name="secret_key"
            rules={[{ required: true, message: 'Введите секретный ключ' }]}
          >
            <Input.Password placeholder="Ваш secret key" />
          </Form.Item>
          <Form.Item
            label="Название бакета"
            name="bucket_name"
            rules={[{ required: true, message: 'Введите название бакета' }]}
          >
            <Input placeholder="my-bucket" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default CredentialsPage
