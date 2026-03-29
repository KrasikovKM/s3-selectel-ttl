import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
})

// ---- Types ----

export interface Credential {
  id: number
  name: string
  endpoint_url: string
  access_key: string
  bucket_name: string
  created_at: string
  masked_secret_key: string
}

export interface CredentialCreate {
  name: string
  endpoint_url: string
  access_key: string
  secret_key: string
  bucket_name: string
}

export interface Rule {
  id: number
  credential_id: number
  name: string
  prefix: string
  ttl_days: number
  is_active: boolean
  cron_schedule: string
  created_at: string
  last_run?: string
  last_run_status?: string
  next_run?: string
}

export interface RuleCreate {
  credential_id: number
  name: string
  prefix: string
  ttl_days: number
  is_active: boolean
  cron_schedule: string
}

export interface RuleUpdate {
  credential_id?: number
  name?: string
  prefix?: string
  ttl_days?: number
  is_active?: boolean
  cron_schedule?: string
}

export interface JobRun {
  id: number
  rule_id: number
  started_at: string
  finished_at?: string
  status: 'running' | 'success' | 'failed'
  files_deleted: number
  bytes_deleted: number
  error_message?: string
}

export interface PreviewFile {
  key: string
  size: number
  last_modified: string
  age_days: number
}

export interface PreviewResult {
  files_count: number
  total_bytes: number
  files: PreviewFile[]
}

export interface TestResult {
  success: boolean
  message: string
}

// ---- Credentials API ----

export const credentialsApi = {
  list: (): Promise<Credential[]> =>
    api.get('/credentials/').then((r) => r.data),

  create: (data: CredentialCreate): Promise<Credential> =>
    api.post('/credentials/', data).then((r) => r.data),

  delete: (id: number): Promise<void> =>
    api.delete(`/credentials/${id}`).then((r) => r.data),

  test: (id: number): Promise<TestResult> =>
    api.post(`/credentials/${id}/test`).then((r) => r.data),
}

// ---- Rules API ----

export const rulesApi = {
  list: (): Promise<Rule[]> =>
    api.get('/rules/').then((r) => r.data),

  create: (data: RuleCreate): Promise<Rule> =>
    api.post('/rules/', data).then((r) => r.data),

  update: (id: number, data: RuleUpdate): Promise<Rule> =>
    api.put(`/rules/${id}`, data).then((r) => r.data),

  delete: (id: number): Promise<void> =>
    api.delete(`/rules/${id}`).then((r) => r.data),

  runNow: (id: number): Promise<{ success: boolean; message: string }> =>
    api.post(`/rules/${id}/run`).then((r) => r.data),

  preview: (id: number): Promise<PreviewResult> =>
    api.post(`/rules/${id}/preview`).then((r) => r.data),
}

// ---- Jobs API ----

export const jobsApi = {
  list: (params?: { rule_id?: number; limit?: number }): Promise<JobRun[]> =>
    api.get('/jobs/', { params }).then((r) => r.data),

  get: (id: number): Promise<JobRun> =>
    api.get(`/jobs/${id}`).then((r) => r.data),
}

export default api
