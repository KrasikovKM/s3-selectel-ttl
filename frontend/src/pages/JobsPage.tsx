import React, { useEffect, useState, useCallback } from 'react'
import {
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
  Tooltip,
  Badge,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import { jobsApi, rulesApi, credentialsApi, JobRun, Rule, Credential } from '../api/client'

dayjs.extend(duration)

const { Title, Text } = Typography

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Б'
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} ГБ`
}

function formatDuration(start: string, end?: string): string {
  if (!end) return '—'
  const ms = dayjs(end).diff(dayjs(start))
  if (ms < 1000) return `${ms} мс`
  if (ms < 60000) return `${Math.round(ms / 1000)} сек`
  const mins = Math.floor(ms / 60000)
  const secs = Math.round((ms % 60000) / 1000)
  return `${mins} мин ${secs} сек`
}

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  success: { color: 'success', label: 'Успешно' },
  failed: { color: 'error', label: 'Ошибка' },
  running: { color: 'processing', label: 'Выполняется' },
}

const JobsPage: React.FC = () => {
  const [jobs, setJobs] = useState<JobRun[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(false)
  const [filterRuleId, setFilterRuleId] = useState<number | undefined>(undefined)
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined)
  const [currentPage, setCurrentPage] = useState(1)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    try {
      const data = await jobsApi.list({ rule_id: filterRuleId, limit: 500 })
      setJobs(data)
    } catch {
      message.error('Не удалось загрузить историю задач')
    } finally {
      setLoading(false)
    }
  }, [filterRuleId])

  const fetchMeta = useCallback(async () => {
    try {
      const [rulesData, credsData] = await Promise.all([rulesApi.list(), credentialsApi.list()])
      setRules(rulesData)
      setCredentials(credsData)
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchMeta()
  }, [fetchMeta])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  // Auto-refresh every 10 seconds if any job is "running"
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === 'running')
    if (!hasRunning) return
    const interval = setInterval(fetchJobs, 10000)
    return () => clearInterval(interval)
  }, [jobs, fetchJobs])

  const ruleById = (id: number): Rule | undefined => rules.find((r) => r.id === id)
  const credByRuleId = (ruleId: number): Credential | undefined => {
    const rule = ruleById(ruleId)
    if (!rule) return undefined
    return credentials.find((c) => c.id === rule.credential_id)
  }

  const filteredJobs = filterStatus
    ? jobs.filter((j) => j.status === filterStatus)
    : jobs

  const columns: ColumnsType<JobRun> = [
    {
      title: '#',
      dataIndex: 'id',
      key: 'id',
      width: 60,
      render: (id: number) => <Text type="secondary">#{id}</Text>,
    },
    {
      title: 'Правило',
      dataIndex: 'rule_id',
      key: 'rule_id',
      width: 160,
      render: (ruleId: number) => {
        const rule = ruleById(ruleId)
        return rule ? <Tag color="blue">{rule.name}</Tag> : <Tag>#{ruleId}</Tag>
      },
    },
    {
      title: 'Бакет',
      key: 'bucket',
      width: 140,
      render: (_, record) => {
        const cred = credByRuleId(record.rule_id)
        return cred ? (
          <Tag style={{ fontFamily: 'monospace' }}>{cred.bucket_name}</Tag>
        ) : (
          '—'
        )
      },
    },
    {
      title: 'Начало',
      dataIndex: 'started_at',
      key: 'started_at',
      width: 155,
      render: (dt: string) => dayjs(dt).format('DD.MM.YYYY HH:mm:ss'),
    },
    {
      title: 'Окончание',
      dataIndex: 'finished_at',
      key: 'finished_at',
      width: 155,
      render: (dt?: string) => (dt ? dayjs(dt).format('DD.MM.YYYY HH:mm:ss') : '—'),
    },
    {
      title: 'Длительность',
      key: 'duration',
      width: 120,
      render: (_, record) => formatDuration(record.started_at, record.finished_at),
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => {
        const info = STATUS_MAP[status] ?? { color: 'default', label: status }
        return <Badge status={info.color as any} text={info.label} />
      },
    },
    {
      title: 'Удалено файлов',
      dataIndex: 'files_deleted',
      key: 'files_deleted',
      width: 140,
      render: (n: number) => n.toLocaleString('ru-RU'),
    },
    {
      title: 'Размер',
      dataIndex: 'bytes_deleted',
      key: 'bytes_deleted',
      width: 110,
      render: (b: number) => formatBytes(b),
    },
    {
      title: 'Ошибка',
      dataIndex: 'error_message',
      key: 'error_message',
      ellipsis: true,
      render: (msg?: string) =>
        msg ? (
          <Tooltip title={msg} overlayStyle={{ maxWidth: 400 }}>
            <Text type="danger" style={{ cursor: 'pointer', fontSize: 12 }}>
              {msg.length > 60 ? msg.substring(0, 60) + '...' : msg}
            </Text>
          </Tooltip>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          История задач
        </Title>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Space>
          <Select
            placeholder="Все правила"
            allowClear
            style={{ width: 220 }}
            value={filterRuleId}
            onChange={(val) => {
              setFilterRuleId(val)
              setCurrentPage(1)
            }}
          >
            {rules.map((r) => (
              <Select.Option key={r.id} value={r.id}>
                {r.name}
              </Select.Option>
            ))}
          </Select>
          <Select
            placeholder="Все статусы"
            allowClear
            style={{ width: 180 }}
            value={filterStatus}
            onChange={(val) => {
              setFilterStatus(val)
              setCurrentPage(1)
            }}
          >
            <Select.Option value="success">Успешно</Select.Option>
            <Select.Option value="failed">Ошибка</Select.Option>
            <Select.Option value="running">Выполняется</Select.Option>
          </Select>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={filteredJobs}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1300 }}
        pagination={{
          current: currentPage,
          pageSize: 20,
          total: filteredJobs.length,
          onChange: setCurrentPage,
          showTotal: (total) => `Всего: ${total}`,
          showSizeChanger: false,
        }}
        bordered
        locale={{ emptyText: 'Нет записей в истории задач.' }}
        rowClassName={(record) => (record.status === 'running' ? 'job-row-running' : '')}
      />
    </div>
  )
}

export default JobsPage
