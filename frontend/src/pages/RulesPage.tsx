import React, { useEffect, useState, useCallback } from 'react'
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
  Tooltip,
  Badge,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { rulesApi, credentialsApi, Credential, Rule, RuleCreate, RuleUpdate, PreviewResult } from '../api/client'

const { Title, Text } = Typography

const CRON_PRESETS = [
  { label: 'Каждый час', value: '0 * * * *' },
  { label: 'Каждые 6 часов', value: '0 */6 * * *' },
  { label: 'Каждые 12 часов', value: '0 */12 * * *' },
  { label: 'Ежедневно в 2:00', value: '0 2 * * *' },
  { label: 'Еженедельно (воскресенье)', value: '0 2 * * 0' },
  { label: 'Ежемесячно 1-го числа', value: '0 2 1 * *' },
  { label: 'Свой вариант', value: '__custom__' },
]

function cronLabel(cron: string): string {
  const preset = CRON_PRESETS.find((p) => p.value === cron)
  if (preset && preset.value !== '__custom__') return preset.label
  return cron
}

function statusColor(status?: string): string {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'running') return 'processing'
  return 'default'
}

function statusLabel(status?: string): string {
  if (status === 'success') return 'Успешно'
  if (status === 'failed') return 'Ошибка'
  if (status === 'running') return 'Выполняется'
  return '—'
}

interface RuleFormValues {
  name: string
  credential_id: number
  prefix: string
  ttl_days: number
  cron_preset: string
  cron_custom: string
  is_active: boolean
}

const RulesPage: React.FC = () => {
  const [rules, setRules] = useState<Rule[]>([])
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<Rule | null>(null)
  const [saving, setSaving] = useState(false)
  const [runningId, setRunningId] = useState<number | null>(null)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const [previewRuleName, setPreviewRuleName] = useState('')
  const [cronPreset, setCronPreset] = useState('0 2 * * *')
  const [form] = Form.useForm<RuleFormValues>()

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [rulesData, credsData] = await Promise.all([rulesApi.list(), credentialsApi.list()])
      setRules(rulesData)
      setCredentials(credsData)
    } catch {
      message.error('Не удалось загрузить данные')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 30000)
    return () => clearInterval(interval)
  }, [fetchAll])

  const credentialName = (id: number) => {
    const c = credentials.find((c) => c.id === id)
    return c ? c.name : `#${id}`
  }

  const openCreateModal = () => {
    setEditingRule(null)
    form.resetFields()
    form.setFieldsValue({ is_active: true, cron_preset: '0 2 * * *' })
    setCronPreset('0 2 * * *')
    setModalOpen(true)
  }

  const openEditModal = (rule: Rule) => {
    setEditingRule(rule)
    const presetMatch = CRON_PRESETS.find(
      (p) => p.value === rule.cron_schedule && p.value !== '__custom__'
    )
    const preset = presetMatch ? rule.cron_schedule : '__custom__'
    setCronPreset(preset)
    form.setFieldsValue({
      name: rule.name,
      credential_id: rule.credential_id,
      prefix: rule.prefix,
      ttl_days: rule.ttl_days,
      is_active: rule.is_active,
      cron_preset: preset,
      cron_custom: preset === '__custom__' ? rule.cron_schedule : '',
    })
    setModalOpen(true)
  }

  const handleSubmit = async (values: RuleFormValues) => {
    const finalCron =
      values.cron_preset === '__custom__' ? values.cron_custom : values.cron_preset

    const payload: RuleCreate = {
      name: values.name,
      credential_id: values.credential_id,
      prefix: values.prefix || '',
      ttl_days: values.ttl_days,
      is_active: values.is_active ?? true,
      cron_schedule: finalCron,
    }

    setSaving(true)
    try {
      if (editingRule) {
        const updatePayload: RuleUpdate = { ...payload }
        await rulesApi.update(editingRule.id, updatePayload)
        message.success('Правило обновлено')
      } else {
        await rulesApi.create(payload)
        message.success('Правило создано')
      }
      setModalOpen(false)
      form.resetFields()
      fetchAll()
    } catch {
      message.error('Не удалось сохранить правило')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await rulesApi.delete(id)
      message.success('Правило удалено')
      fetchAll()
    } catch {
      message.error('Не удалось удалить правило')
    }
  }

  const handleToggleActive = async (rule: Rule, checked: boolean) => {
    try {
      await rulesApi.update(rule.id, { is_active: checked })
      message.success(checked ? 'Правило активировано' : 'Правило отключено')
      fetchAll()
    } catch {
      message.error('Не удалось изменить статус правила')
    }
  }

  const handleRunNow = async (id: number) => {
    setRunningId(id)
    try {
      await rulesApi.runNow(id)
      message.success('Задача запущена в фоновом режиме')
      setTimeout(fetchAll, 2000)
    } catch {
      message.error('Не удалось запустить задачу')
    } finally {
      setRunningId(null)
    }
  }

  const handlePreview = async (rule: Rule) => {
    setPreviewRuleName(rule.name)
    setPreviewResult(null)
    setPreviewModalOpen(true)
    setPreviewLoading(true)
    try {
      const result = await rulesApi.preview(rule.id)
      setPreviewResult(result)
    } catch {
      message.error('Не удалось получить предпросмотр')
      setPreviewModalOpen(false)
    } finally {
      setPreviewLoading(false)
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} Б`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} ГБ`
  }

  const columns: ColumnsType<Rule> = [
    {
      title: 'Название',
      dataIndex: 'name',
      key: 'name',
      width: 160,
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: 'Подключение',
      dataIndex: 'credential_id',
      key: 'credential_id',
      width: 140,
      render: (id: number) => <Tag color="blue">{credentialName(id)}</Tag>,
    },
    {
      title: 'Папка/Префикс',
      dataIndex: 'prefix',
      key: 'prefix',
      width: 140,
      render: (prefix: string) => (
        <Tag style={{ fontFamily: 'monospace' }}>{prefix || '/'}</Tag>
      ),
    },
    {
      title: 'TTL',
      dataIndex: 'ttl_days',
      key: 'ttl_days',
      width: 90,
      render: (days: number) => `${days} дн.`,
    },
    {
      title: 'Расписание',
      dataIndex: 'cron_schedule',
      key: 'cron_schedule',
      width: 160,
      render: (cron: string) => (
        <Tooltip title={cron}>
          <span>{cronLabel(cron)}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Активно',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 90,
      render: (active: boolean, record) => (
        <Switch
          checked={active}
          size="small"
          onChange={(checked) => handleToggleActive(record, checked)}
        />
      ),
    },
    {
      title: 'Последний запуск',
      dataIndex: 'last_run',
      key: 'last_run',
      width: 150,
      render: (dt?: string) => dt ? dayjs(dt).format('DD.MM.YYYY HH:mm') : '—',
    },
    {
      title: 'Следующий запуск',
      dataIndex: 'next_run',
      key: 'next_run',
      width: 150,
      render: (dt?: string) => dt ? dayjs(dt).format('DD.MM.YYYY HH:mm') : '—',
    },
    {
      title: 'Статус',
      dataIndex: 'last_run_status',
      key: 'last_run_status',
      width: 120,
      render: (status?: string) => (
        <Badge
          status={statusColor(status) as any}
          text={statusLabel(status)}
        />
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space>
          <Tooltip title="Редактировать">
            <Button
              icon={<EditOutlined />}
              size="small"
              onClick={() => openEditModal(record)}
            />
          </Tooltip>
          <Tooltip title="Предпросмотр файлов к удалению">
            <Button
              icon={<EyeOutlined />}
              size="small"
              onClick={() => handlePreview(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Запустить задачу сейчас?"
            description="Немедленно запустить очистку по этому правилу."
            okText="Запустить"
            cancelText="Отмена"
            onConfirm={() => handleRunNow(record.id)}
          >
            <Tooltip title="Запустить сейчас">
              <Button
                icon={<PlayCircleOutlined />}
                size="small"
                type="primary"
                loading={runningId === record.id}
              />
            </Tooltip>
          </Popconfirm>
          <Popconfirm
            title="Удалить правило?"
            description="Задача будет остановлена и история очищена."
            okText="Удалить"
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

  const previewColumns: ColumnsType<PreviewResult['files'][0]> = [
    {
      title: 'Файл',
      dataIndex: 'key',
      key: 'key',
      ellipsis: true,
      render: (key: string) => (
        <Tooltip title={key}>
          <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{key}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Размер',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (size: number) => formatBytes(size),
    },
    {
      title: 'Возраст (дн.)',
      dataIndex: 'age_days',
      key: 'age_days',
      width: 110,
      render: (days: number) => `${days} дн.`,
    },
    {
      title: 'Изменён',
      dataIndex: 'last_modified',
      key: 'last_modified',
      width: 150,
      render: (dt: string) => dayjs(dt).format('DD.MM.YYYY HH:mm'),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          Правила TTL
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          Добавить правило
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={rules}
        rowKey="id"
        loading={loading}
        pagination={false}
        bordered
        scroll={{ x: 1400 }}
        locale={{ emptyText: 'Нет правил. Добавьте первое правило TTL.' }}
      />

      {/* Create/Edit Modal */}
      <Modal
        title={editingRule ? 'Редактировать правило' : 'Новое правило TTL'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          form.resetFields()
          setEditingRule(null)
        }}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText={editingRule ? 'Сохранить' : 'Создать'}
        cancelText="Отмена"
        destroyOnClose
        width={560}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          style={{ marginTop: 16 }}
          initialValues={{ is_active: true, cron_preset: '0 2 * * *' }}
        >
          <Form.Item
            label="Название"
            name="name"
            rules={[{ required: true, message: 'Введите название' }]}
          >
            <Input placeholder="Очистка старых загрузок" />
          </Form.Item>
          <Form.Item
            label="Подключение"
            name="credential_id"
            rules={[{ required: true, message: 'Выберите подключение' }]}
          >
            <Select placeholder="Выберите S3-подключение">
              {credentials.map((c) => (
                <Select.Option key={c.id} value={c.id}>
                  {c.name} ({c.bucket_name})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            label="Папка / Префикс"
            name="prefix"
            help="Оставьте пустым для обработки всего бакета"
          >
            <Input placeholder="uploads/images/" />
          </Form.Item>
          <Form.Item
            label="Срок хранения (дней)"
            name="ttl_days"
            rules={[{ required: true, message: 'Введите срок хранения' }]}
          >
            <InputNumber
              min={1}
              max={36500}
              placeholder="30"
              style={{ width: '100%' }}
              addonAfter="дн."
            />
          </Form.Item>
          <Form.Item
            label="Расписание"
            name="cron_preset"
            rules={[{ required: true, message: 'Выберите расписание' }]}
          >
            <Select
              onChange={(val) => setCronPreset(val)}
              options={CRON_PRESETS.map((p) => ({ label: p.label, value: p.value }))}
            />
          </Form.Item>
          {cronPreset === '__custom__' && (
            <Form.Item
              label="Cron-выражение"
              name="cron_custom"
              rules={[
                { required: true, message: 'Введите cron-выражение' },
                {
                  validator: (_, value) => {
                    if (!value) return Promise.resolve()
                    const parts = value.trim().split(/\s+/)
                    if (parts.length !== 5) {
                      return Promise.reject('Cron должен содержать 5 полей (мин час день месяц день_нед)')
                    }
                    return Promise.resolve()
                  },
                },
              ]}
              help="Формат: минуты часы дни месяц день_недели"
            >
              <Input placeholder="0 3 * * 1" />
            </Form.Item>
          )}
          <Form.Item label="Активно" name="is_active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Preview Modal */}
      <Modal
        title={`Предпросмотр: ${previewRuleName}`}
        open={previewModalOpen}
        onCancel={() => setPreviewModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setPreviewModalOpen(false)}>
            Закрыть
          </Button>,
        ]}
        width={800}
        destroyOnClose
      >
        {previewLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>Загрузка...</div>
        ) : previewResult ? (
          <div>
            <div style={{ marginBottom: 12 }}>
              <Space>
                <Tag color="orange">
                  Файлов к удалению: {previewResult.files_count}
                </Tag>
                <Tag color="red">
                  Общий размер: {
                    previewResult.total_bytes < 1024 * 1024
                      ? `${(previewResult.total_bytes / 1024).toFixed(1)} КБ`
                      : previewResult.total_bytes < 1024 * 1024 * 1024
                      ? `${(previewResult.total_bytes / 1024 / 1024).toFixed(1)} МБ`
                      : `${(previewResult.total_bytes / 1024 / 1024 / 1024).toFixed(2)} ГБ`
                  }
                </Tag>
                {previewResult.files_count > 100 && (
                  <Tag color="gold">Показаны первые 100 файлов</Tag>
                )}
              </Space>
            </div>
            <Table
              columns={previewColumns}
              dataSource={previewResult.files}
              rowKey="key"
              size="small"
              pagination={{ pageSize: 20, showSizeChanger: false }}
              scroll={{ y: 400 }}
              locale={{ emptyText: 'Нет файлов для удаления по данному правилу.' }}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

export default RulesPage
