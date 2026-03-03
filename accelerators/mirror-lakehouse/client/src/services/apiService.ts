import axios, { AxiosInstance, AxiosResponse } from 'axios'
import { getAccessToken } from './authService'

// API base configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api'

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 60 seconds timeout
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add authentication token
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await getAccessToken()
      config.headers.Authorization = `Bearer ${token}`
    } catch (error) {
      console.warn('Failed to get access token:', error)
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - redirect to login
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// API response types
export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface ApiError {
  error: string
  message: string
  timestamp: string
  details?: any[]
}

// Workspace types
export interface Workspace {
  id: string
  name: string
  description?: string
  type: string
  state: string
  isReadOnly: boolean
  isOnDedicatedCapacity: boolean
  capacityId?: string
  defaultDatasetStorageFormat?: string
  createdDateTime: string
  modifiedDateTime: string
}

export interface WorkspacesResponse {
  workspaces: Workspace[]
  count: number
}

export interface WorkspaceSearchResponse extends WorkspacesResponse {
  query: string
  totalCount: number
}

// Lakehouse types
export interface Lakehouse {
  id: string
  name: string
  description?: string
  type: string
  workspaceId: string
  createdDate: string
  modifiedDate: string
  createdBy: string
  modifiedBy: string
}

export interface LakehousesResponse {
  lakehouses: Lakehouse[]
  count: number
  workspaceId?: string
}

export interface CreateLakehouseResponse {
  lakehouse: Lakehouse
}

export interface LakehouseSearchResponse extends LakehousesResponse {
  query: string
  totalCount: number
}

// Table types
export interface TableColumn {
  name: string
  type: string
  nullable: boolean
  precision?: number
  scale?: number
  maxLength?: number
}

export interface Table {
  name: string
  type: string
  format: string
  location: string
  createdDate: string
  modifiedDate: string
  size: number
  rowCount: number
  columns?: TableColumn[]
}

export interface TablesResponse {
  tables: Table[]
  count: number
  lakehouseId: string
  includeColumns: boolean
}

// Schema types
export interface Schema {
  name: string
  description?: string
  createdDate: string
  modifiedDate: string
  tableCount: number
}

export interface SchemasResponse {
  schemas: Schema[]
  count: number
  lakehouseId: string
}

// Shortcut types
export interface ShortcutTarget {
  type: string
  connectionId?: string
  location: string
  subpath: string
}

export interface Shortcut {
  name: string
  path: string
  target: ShortcutTarget
  createdDate: string
  modifiedDate: string
}

export interface ShortcutsResponse {
  shortcuts: Shortcut[]
  count: number
  lakehouseId: string
}

// Mirror job types
export interface MirrorJobResult {
  schemaName: string
  destinationShortcutName?: string
  usedFallbackName?: boolean
  createdAt?: string
  error?: string
  reason?: string
}

export interface MirrorJobResults {
  created: MirrorJobResult[]
  failed: MirrorJobResult[]
  skipped: MirrorJobResult[]
}

export interface MirrorJob {
  id: string
  status: 'initiated' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  message: string
  createdAt: string
  completedAt?: string
  userId: string
  source: {
    lakehouseId: string
    workspaceId: string
  }
  destination: {
    lakehouseId: string
    workspaceId: string
  }
  totalSchemas?: number
  results: MirrorJobResults
  error?: string
}

export interface MirrorJobsResponse {
  jobs: MirrorJob[]
  count: number
}

export interface CreateMirrorJobRequest {
  sourceLakehouseId: string
  destinationLakehouseId: string
  sourceWorkspaceId: string
  destinationWorkspaceId: string
  schemas?: string[]
  excludeSchemas?: string[]
  overwriteExisting?: boolean
  includeAllViews?: boolean
  selectedViews?: string[]
  includeAllStoredProcedures?: boolean
  selectedStoredProcedures?: string[]
}

export interface CreateMirrorJobResponse {
  jobId: string
  status: string
  message: string
  statusUrl: string
}

export interface ProgrammableObject {
  schemaName: string
  name: string
  fullName: string
}

export interface ProgrammableObjectsResponse {
  sourceLakehouseId: string
  sourceWorkspaceId: string
  views: ProgrammableObject[]
  storedProcedures: ProgrammableObject[]
  count: {
    views: number
    storedProcedures: number
  }
}

// Validation types
export interface ValidationJob {
  id: string
  type: 'validation'
  status: 'initiated' | 'running' | 'completed' | 'failed'
  progress: number
  message: string
  createdAt: string
  completedAt?: string
  userId: string
  name: string
  source: {
    lakehouseId: string
    workspaceId: string
  }
  destination: {
    lakehouseId: string
    workspaceId: string
  }
  results?: {
    summary: {
      totalComparisons: number
      schemasMatched: number
      tablesMatched: number
      shortcutsMatched: number
      totalDifferences: number
      validationScore: number
    }
    differences: Array<{
      type: string
      name: string
      difference: string
      description: string
    }>
    sourceMetadata: {
      schemas: number
      tables: number
      shortcuts: number
    }
    destinationMetadata: {
      schemas: number
      tables: number
      shortcuts: number
    }
    comparisonStats: any
  }
  error?: string
}

export interface ValidationResults {
  summary: ValidationSummary
  differences: ValidationDifferences
  sourceMetadata?: LakehouseMetadata
  destinationMetadata?: LakehouseMetadata
}

export interface ValidationSummary {
  totalDifferences: number
  isIdentical: boolean
  missingInDestination: number
  extraInDestination: number
  modifiedTables: number
  schemaComparison: ComparisonStats
  tableComparison: ComparisonStats
  shortcutComparison: ComparisonStats
}

export interface ComparisonStats {
  matching: number
  missing: number
  extra: number
  different?: number
}

export interface ValidationDifferences {
  schemas: ComparisonResults<Schema>
  tables: TableComparisonResults
  shortcuts: ComparisonResults<Shortcut>
}

export interface ComparisonResults<T> {
  missingInDestination: T[]
  extraInDestination: T[]
  matching: T[] | string[]
}

export interface TableComparisonResults extends ComparisonResults<Table> {
  different: TableDifference[]
}

export interface TableDifference {
  name: string
  differences: PropertyDifference[]
}

export interface PropertyDifference {
  property: string
  source: any
  destination: any
  details?: any
}

export interface LakehouseMetadata {
  schemaCount: number
  tableCount: number
  shortcutCount: number
  schemas: Schema[]
  tables: {
    name: string
    type: string
    size: number
    rowCount: number
    columnCount: number
  }[]
}

export interface CreateValidationJobRequest {
  sourceLakehouseId: string
  destinationLakehouseId: string
  sourceWorkspaceId: string
  destinationWorkspaceId: string
  name?: string
}

export interface CreateValidationJobResponse {
  jobId: string
  status: string
  message: string
  statusUrl: string
}

// User types
export interface UserProfile {
  id: string
  email: string
  name: string
  tenantId: string
  roles: string[]
  scopes: string[]
  profile?: {
    displayName: string
    givenName: string
    surname: string
    jobTitle?: string
    officeLocation?: string
    department?: string
  }
}

// Auth API endpoints
export const authApi = {
  getMe: (): Promise<AxiosResponse<UserProfile>> => 
    apiClient.get('/auth/me'),
  
  getConfig: (): Promise<AxiosResponse<any>> => 
    apiClient.get('/auth/config'),
}

// Workspace API endpoints
export const workspaceApi = {
  getAll: (): Promise<AxiosResponse<WorkspacesResponse>> => 
    apiClient.get('/workspaces'),
  
  search: (query: string, limit?: number): Promise<AxiosResponse<WorkspaceSearchResponse>> => 
    apiClient.get('/workspaces/search', { params: { q: query, limit } }),
  
  getById: (id: string): Promise<AxiosResponse<Workspace>> => 
    apiClient.get(`/workspaces/${id}`),
  
  getLakehouses: (id: string): Promise<AxiosResponse<LakehousesResponse>> => 
    apiClient.get(`/workspaces/${id}/lakehouses`),

  createLakehouse: (workspaceId: string, name: string): Promise<AxiosResponse<CreateLakehouseResponse>> =>
    apiClient.post(`/workspaces/${workspaceId}/lakehouses`, { name }),
}

// Lakehouse API endpoints
export const lakehouseApi = {
  getById: (id: string): Promise<AxiosResponse<Lakehouse>> => 
    apiClient.get(`/lakehouses/${id}`),
  
  getTables: (id: string, includeColumns?: boolean): Promise<AxiosResponse<TablesResponse>> => 
    apiClient.get(`/lakehouses/${id}/tables`, { params: { includeColumns } }),
  
  getSchemas: (id: string): Promise<AxiosResponse<SchemasResponse>> => 
    apiClient.get(`/lakehouses/${id}/schemas`),
  
  getShortcuts: (id: string): Promise<AxiosResponse<ShortcutsResponse>> => 
    apiClient.get(`/lakehouses/${id}/shortcuts`),
  
  search: (query: string, workspaceId?: string, limit?: number): Promise<AxiosResponse<LakehouseSearchResponse>> => 
    apiClient.get('/lakehouses/search', { params: { q: query, workspaceId, limit } }),
}

// Mirror API endpoints
export const mirrorApi = {
  createSchemaShortcuts: (request: CreateMirrorJobRequest): Promise<AxiosResponse<CreateMirrorJobResponse>> => 
    apiClient.post('/mirror/schema-shortcuts', request),

  getProgrammableObjects: (
    sourceLakehouseId: string,
    sourceWorkspaceId: string
  ): Promise<AxiosResponse<ProgrammableObjectsResponse>> =>
    apiClient.get('/mirror/programmable-objects', {
      params: {
        sourceLakehouseId,
        sourceWorkspaceId,
      }
    }),
  
  getJobStatus: (jobId: string): Promise<AxiosResponse<MirrorJob>> => 
    apiClient.get(`/mirror/jobs/${jobId}`),
  
  getAllJobs: (): Promise<AxiosResponse<MirrorJobsResponse>> => 
    apiClient.get('/mirror/jobs'),
  
  getDashboardStats: (): Promise<AxiosResponse<DashboardStats>> => 
    apiClient.get('/mirror/dashboard-stats'),
  
  cancelJob: (jobId: string): Promise<AxiosResponse<{ message: string }>> => 
    apiClient.delete(`/mirror/jobs/${jobId}`),
}

// Validation API endpoints
export const validationApi = {
  createValidation: (request: CreateValidationJobRequest): Promise<AxiosResponse<CreateValidationJobResponse>> => 
    apiClient.post('/mirror/validate', request),
  
  getJobStatus: (jobId: string): Promise<AxiosResponse<ValidationJob>> => 
    apiClient.get(`/mirror/jobs/${jobId}`),
  
  getReport: (jobId: string): Promise<AxiosResponse<ValidationResults>> => 
    apiClient.get(`/mirror/jobs/${jobId}`),
  
  getAllJobs: (): Promise<AxiosResponse<{ jobs: ValidationJob[]; count: number }>> => 
    apiClient.get('/mirror/jobs'),
}

// Dashboard types
export interface DashboardStats {
  mirrorJobs: {
    total: number
    completed: number
    failed: number
    running: number
    recent: number
  }
  statistics: {
    recentJobs: number
    recentJobsChange: string
    successRate: string
    successRateChange: string
    avgDuration: string
    avgDurationChange: string
  }
  recentActivity: Array<{
    id: string
    status: string
    createdAt: string
    source: any
    destination: any
    type: string
  }>
}

export default apiClient