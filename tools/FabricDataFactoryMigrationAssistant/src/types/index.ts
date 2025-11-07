export interface AuthState {
  isAuthenticated: boolean;
  accessToken: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    tenantId: string;
  } | null;
  workspaceId: string | null;
  hasContributorAccess: boolean;
  tokenScopes?: {
    connectionReadWrite: boolean;
    gatewayReadWrite: boolean;
    itemReadWrite: boolean;
    hasAllRequiredScopes: boolean;
    scopes: string[];
  };
}

export interface TokenScopes {
  connectionReadWrite: boolean;
  gatewayReadWrite: boolean;
  itemReadWrite: boolean;
  hasAllRequiredScopes: boolean;
  scopes: string[];
}

export interface ServicePrincipalAuth {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface TenantConfig {
  tenantId: string;
  authority: string;
  isValid: boolean;
}

export interface InteractiveLoginConfig {
  tenantId: string;
  useTenantSpecific: boolean;
  applicationId: string;
}

// Re-export auth types
export * from './auth';

/**
 * Folder depth limits for Microsoft Fabric
 */
export const FABRIC_MAX_FOLDER_DEPTH = 10;
export const FABRIC_FOLDER_DEPTH_WARNING = 8;

/**
 * Folder information from ADF ARM template
 */
export interface ADFFolderInfo {
  /** Full folder path from root (e.g., "Folder002/SubFolder001") */
  path: string;
  /** Folder name (last segment of path) */
  name: string;
  /** Parent folder path (if nested) */
  parentPath?: string;
  /** Depth level (0 = root, 9 = max for Fabric) */
  depth: number;
  /** Path segments array */
  segments: string[];
  /** Original path before any flattening */
  originalPath: string;
  /** Whether this folder was flattened */
  isFlattened?: boolean;
  /** Flattening details if applied */
  flatteningApplied?: {
    originalDepth: number;
    newDepth: number;
    strategy: string;
  };
}

/**
 * Fabric folder representation
 */
export interface FabricFolder {
  /** Fabric-generated folder ID (after creation) */
  id?: string;
  /** Folder display name */
  displayName: string;
  /** Full path from root */
  path: string;
  /** Original ADF path (may differ if flattened) */
  originalPath?: string;
  /** Parent folder ID (for nested folders) */
  parentFolderId?: string;
  /** Deployment status */
  deploymentStatus?: 'pending' | 'creating' | 'created' | 'failed' | 'skipped';
  /** Error message if deployment failed */
  error?: string;
  /** Whether this folder was flattened due to depth limits */
  wasFlattened?: boolean;
  /** Depth level in hierarchy */
  depth: number;
}

/**
 * Folder hierarchy tree node for UI display
 */
export interface FolderTreeNode {
  name: string;
  path: string;
  depth: number;
  children: FolderTreeNode[];
  originalPath?: string;
  isFlattened?: boolean;
  folderId?: string;
  componentCount?: number;
}

/**
 * Folder deployment result
 */
export interface FolderDeploymentResult {
  path: string;
  displayName: string;
  folderId?: string;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  timestamp: string;
  wasFlattened?: boolean;
  originalPath?: string;
  depth?: number;
}

/**
 * Folder depth validation result
 */
export interface FolderDepthValidation {
  isValid: boolean;
  maxDepth: number;
  validFolders: ADFFolderInfo[];
  invalidFolders: ADFFolderInfo[];
  requiresFlattening: ADFFolderInfo[];
  summary: {
    totalFolders: number;
    validCount: number;
    invalidCount: number;
    maxDepthFound: number;
  };
}

/**
 * Folder flattening options
 */
export interface FolderFlatteningOptions {
  maxDepth?: number;
  separator?: string;
  preserveDepth?: number;
}

/**
 * Fabric folder representation
 */
export interface FabricFolder {
  /** Fabric-generated folder ID (after creation) */
  id?: string;
  /** Folder display name */
  displayName: string;
  /** Full path from root */
  path: string;
  /** Original ADF path (may differ if flattened) */
  originalPath?: string;
  /** Parent folder ID (for nested folders) */
  parentFolderId?: string;
  /** Deployment status */
  deploymentStatus?: 'pending' | 'creating' | 'created' | 'failed' | 'skipped';
  /** Error message if deployment failed */
  error?: string;
  /** Whether this folder was flattened due to depth limits */
  wasFlattened?: boolean;
  /** Depth level in hierarchy */
  depth: number;
}

export interface ADFComponent {
  name: string;
  type: 'pipeline' | 'dataset' | 'linkedService' | 'trigger' | 'globalParameter' | 'integrationRuntime' | 'mappingDataFlow' | 'customActivity' | 'managedIdentity';
  definition: Record<string, any>; // More specific than 'any'
  isSelected: boolean;
  compatibilityStatus: 'supported' | 'partiallySupported' | 'unsupported';
  warnings: string[];
  fabricTarget?: FabricTarget | undefined;
  /** NEW: Folder information for pipelines */
  folder?: ADFFolderInfo;
  /** NEW: Raw ARM template dependsOn array from resource definition */
  dependsOn?: string[];
  /** NEW: Parsed resource-level dependencies categorized by type */
  resourceDependencies?: {
    linkedServices: string[];
    pipelines: string[];
    datasets: string[];
    triggers: string[];
    dataflows: string[];
    other: string[];
  };
  /** NEW: Trigger-specific metadata */
  triggerMetadata?: {
    runtimeState: 'Started' | 'Stopped' | 'Unknown';
    type: string;
    recurrence?: {
      frequency: string;
      interval: number;
      startTime?: string;
      endTime?: string;
      timeZone?: string;
    };
    referencedPipelines: string[];  // Pipeline names this trigger activates
    // NEW: Pipeline parameters (for documentation - Fabric doesn't support schedule parameters)
    pipelineParameters?: Array<{
      pipelineName: string;
      parameters: Record<string, any>;
    }>;
  };
  /** NEW: For globalParameter type, stores detected references */
  globalParameterReferences?: GlobalParameterReference[];
  /** NEW: For linkedService type, tracks if it has parameters (not supported in Fabric) */
  parameterizedLinkedServiceInfo?: ParameterizedLinkedServiceInfo;
}

/**
 * Parameterized LinkedService Detection
 * Tracks LinkedServices that have parameters (not supported in Fabric connections)
 */
export interface ParameterizedLinkedServiceInfo {
  /** LinkedService name */
  linkedServiceName: string;
  /** LinkedService type (e.g., AzureBatch, HttpServer, etc.) */
  linkedServiceType: string;
  /** Parameter definitions from LinkedService */
  parameters: LinkedServiceParameter[];
  /** Datasets that reference this LinkedService */
  usedByDatasets: string[];
  /** Activities that use the datasets */
  usedByActivities: Array<{
    pipelineName: string;
    activityName: string;
    activityType: string;
  }>;
  /** Pipelines that contain affected activities */
  affectedPipelines: string[];
  /** Count of total usages */
  totalUsageCount: number;
  /** Warning message for user */
  warningMessage: string;
}

export interface LinkedServiceParameter {
  /** Parameter name */
  name: string;
  /** Parameter data type */
  type: string;
  /** Whether parameter has default value */
  hasDefaultValue?: boolean;
}

export interface FabricTarget {
  type: 'dataPipeline' | 'connector' | 'variable' | 'schedule' | 'notebook' | 'gateway' | 'workspaceIdentity';
  name: string;
  configuration?: Record<string, any> | undefined;
  
  // Schedule-specific configuration
  scheduleConfig?: {
    enabled: boolean;  // Default false - schedules deploy disabled for safety
    frequency: 'Minute' | 'Hour' | 'Day' | 'Week' | 'Month';
    interval: number;
    startTime?: string;
    endTime?: string;
    timeZone?: string;
    targetPipelines: Array<{
      pipelineName: string;
      pipelineId?: string;  // Will be populated during deployment
    }>;
  };
  
  gatewayType?: 'VirtualNetwork' | 'OnPremises' | undefined;
  connectVia?: string | undefined; // Reference to Integration Runtime for connections
  connectorType?: string | undefined;
  connectionDetails?: Record<string, any> | undefined;
  credentialType?: string | undefined;
  privacyLevel?: 'Public' | 'Organizational' | 'Private' | undefined;
}

export interface MigrationStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'inProgress' | 'completed' | 'failed';
  errorMessage?: string | undefined;
}

export interface APIRequestDetails {
  method: string;
  endpoint: string;
  payload: Record<string, any>;
  headers?: Record<string, string> | undefined;
}

export interface ApiError {
  status: number;
  statusText: string;
  method: string;
  endpoint: string;
  payload: any;
  headers: Record<string, string>;
}

export interface ComponentMapping {
  component: ADFComponent;
  fabricTarget?: FabricTarget | undefined;
  useExisting?: boolean | undefined;
  existingResourceId?: string | undefined;
}

export interface DeploymentResult {
  componentName: string;
  componentType: string;
  status: 'success' | 'failed' | 'skipped' | 'partial';
  fabricResourceId?: string | undefined;
  errorMessage?: string | undefined;
  apiRequestDetails?: APIRequestDetails | undefined;
  error?: string | undefined;
  note?: string | undefined;
  skipReason?: string | undefined;
  apiError?: ApiError | undefined;
  details?: string | undefined; // For multi-pipeline triggers, stores success/failure details per pipeline
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  description?: string | undefined;
  type: string;
  hasContributorAccess: boolean;
}

export interface AppState {
  currentStep: number;
  auth: AuthState;
  selectedWorkspace: WorkspaceInfo | null;
  availableWorkspaces: WorkspaceInfo[];
  uploadedFile: File | null;
  adfComponents: ADFComponent[];
  selectedComponents: ADFComponent[];
  adfProfile: import('./profiling').ADFProfile | null;
  connectionMappings: ConnectionMappingState;
  pipelineConnectionMappings: PipelineConnectionMappings;
  /** NEW: ReferenceId-based mappings for Custom activity transformation */
  pipelineReferenceMappings: PipelineReferenceMappings;
  /** NEW: Bridge between LinkedService mappings and Pipeline activities */
  linkedServiceConnectionBridge: LinkedServiceConnectionBridge;
  workspaceCredentials: WorkspaceCredentialState;
  deploymentResults: DeploymentResult[];
  connectionDeploymentResults: ConnectionDeploymentResult[];
  isLoading: boolean;
  error: string | null;
  /** NEW: Folder-related state */
  folderHierarchy: FolderTreeNode[];
  folderMappings: Record<string, string>; // path -> folderId
  folderDeploymentResults: FolderDeploymentResult[];
  /** NEW: Global parameter detection and configuration */
  globalParameterReferences: GlobalParameterReference[];
  variableLibraryConfig: VariableLibraryConfig | null;
  globalParameterConfigCompleted: boolean;
}

/**
 * Bridge mapping from LinkedService name to Fabric Connection details
 * Connects Configure Connections page mappings to Map Components page
 */
export interface LinkedServiceConnectionBridge {
  [linkedServiceName: string]: {
    originalName: string;           // Original ADF LinkedService name
    connectionId: string;            // Mapped Fabric Connection ID
    connectionDisplayName: string;   // Connection display name for UI
    connectionType: string;          // Connection type
    mappingSource: 'auto' | 'manual'; // How mapping was created
    timestamp: string;               // When mapping was created
  };
}

export type WizardStep = 
  | 'upload'
  | 'login'
  | 'workspace'
  | 'managed-identity'
  | 'connections'
  | 'deploy-connections'
  | 'validation'
  | 'global-parameters'
  | 'mapping'
  | 'deployment'
  | 'complete';

export interface ValidationRule {
  componentType: string;
  isSupported: boolean;
  warnings: string[];
  suggestions?: string[];
}

export interface ComponentSummary {
  total: number;
  supported: number;
  partiallySupported: number;
  unsupported: number;
  byType: Record<string, number>;
  // NEW: Parameterized LinkedServices
  parameterizedLinkedServicesCount?: number;
  parameterizedLinkedServicesPipelineCount?: number;
  parameterizedLinkedServicesNames?: string[];
}

export interface DeploymentPlan {
  workspaceId: string;
  workspaceName: string;
  timestamp: string;
  components: {
    pipelines: APICall[];
    connectors: APICall[];
    variables: APICall[];
    schedules: APICall[];
    notebooks: APICall[];
  };
  summary: {
    totalCalls: number;
    componentCounts: Record<string, number>;
  };
}

export interface APICall {
  componentName: string;
  method: string;
  endpoint: string;
  payload: Record<string, any>;
  notes?: string | undefined;
}

// LinkedService Connection Management Types
export interface LinkedServiceConnection {
  linkedServiceName: string;
  linkedServiceType: string;
  linkedServiceDefinition: Record<string, any>;
  mappingMode: 'existing' | 'new';
  existingConnectionId?: string;
  existingConnection?: ExistingFabricConnection;
  selectedConnectivityType: 'ShareableCloud' | 'OnPremisesGateway' | 'VirtualNetworkGateway' | null;
  selectedGatewayId?: string;
  selectedConnectionType?: string;
  connectionParameters: Record<string, any>;
  credentialType?: string;
  credentials: Record<string, any>;
  skipTestConnection: boolean;
  status: 'pending' | 'configured' | 'failed' | 'skipped';
  validationErrors: string[];
  skip?: boolean;
}

export interface FabricGateway {
  id: string;
  displayName: string;
  type: 'VirtualNetwork' | 'OnPremises';
  description?: string;
}

export interface SupportedConnectionType {
  type: string; // Changed from connectionType to match API response
  displayName?: string; // Made optional since API doesn't always provide this
  description?: string;
  creationMethods: ConnectionCreationMethod[];
  supportedCredentialTypes?: string[]; // Added from API response
  supportedConnectionEncryptionTypes?: string[]; // Added from API response
  supportsSkipTestConnection?: boolean; // Added from API response
  
  // Helper property for backwards compatibility in UI
  connectionType?: string; // Computed property for UI compatibility
}

export interface ConnectionCreationMethod {
  name: string;
  displayName?: string; // Made optional since API doesn't always provide this
  description?: string;
  parameters: ConnectionParameter[];
  credentialTypes?: CredentialType[]; // Made optional to handle API structure
  supportsSkipTestConnection?: boolean; // Made optional to handle API structure
}

export interface ConnectionParameter {
  name: string;
  displayName?: string; // Made optional since API doesn't always provide this
  type?: 'string' | 'number' | 'boolean'; // Made optional to handle API differences
  dataType?: 'Text' | 'Number' | 'Boolean' | 'Password' | string; // Added from API response
  required: boolean;
  description?: string;
  defaultValue?: any;
  allowedValues?: any[]; // Added from API response
}

export interface CredentialType {
  credentialType: string;
  displayName: string;
  fields: CredentialField[];
}

export interface CredentialField {
  name: string;
  displayName: string;
  type: 'string' | 'password' | 'number' | 'boolean';
  required: boolean;
  sensitive: boolean;
  description?: string;
}

export interface ConnectionMappingState {
  linkedServices: LinkedServiceConnection[];
  availableGateways: FabricGateway[];
  supportedConnectionTypes: SupportedConnectionType[];
  isLoading: boolean;
  error: string | null;
}

// Custom activity LinkedService reference location types
export type CustomActivityReferenceLocation = 
  | 'activity-level'       // linkedServiceName.referenceName
  | 'resource'             // typeProperties.resourceLinkedService.referenceName
  | 'reference-object';    // typeProperties.referenceObjects.linkedServices[i]

/**
 * Individual Custom activity LinkedService reference
 */
export interface CustomActivityLinkedServiceReference {
  /** Location of this reference in ADF definition */
  location: CustomActivityReferenceLocation;
  
  /** ADF LinkedService name */
  linkedServiceName: string;
  
  /** Selected Fabric connection ID (from UI mapping) */
  selectedConnectionId?: string;
  
  /** Whether this reference is required */
  isRequired: boolean;
  
  /** For reference-object location: array index */
  arrayIndex?: number;
  
  /** Unique identifier for this reference (for UI key) */
  referenceId: string;
}

/**
 * Complete Custom activity mapping information
 */
export interface CustomActivityMapping {
  /** Pipeline name containing this activity */
  pipelineName: string;
  
  /** Activity name */
  activityName: string;
  
  /** All LinkedService references in this activity */
  references: CustomActivityLinkedServiceReference[];
  
  /** Total count of references */
  totalReferences: number;
  
  /** Count of mapped references */
  mappedReferences: number;
  
  /** Whether all required references are mapped */
  isFullyMapped: boolean;
  
  /** Unique activity identifier */
  activityId: string;
}

// Pipeline connection mappings for activities to Fabric connections
export interface ActivityConnectionMapping {
  activityName: string;
  activityType: string;
  linkedServiceReference?: { name: string; type?: string };
  selectedConnectionId?: string;
  
  // For Custom activities with multiple references
  customActivityReferences?: CustomActivityLinkedServiceReference[];
}

export interface PipelineConnectionMappings {
  [pipelineName: string]: {
    [activityName: string]: ActivityConnectionMapping;
  };
}

/**
 * Improved pipeline connection mappings using referenceId as key
 * This fixes dropdown persistence issues when same LinkedService appears multiple times
 */
export interface PipelineReferenceMappings {
  [pipelineName: string]: {
    [referenceId: string]: string; // referenceId -> connectionId
  };
}

// ============================================================================
// UNIFIED ACTIVITY MAPPING TYPES (UI Modernization)
// ============================================================================

/**
 * Unified activity type enum for UI categorization
 */
export type ActivityTypeEnum = 
  | 'Copy'
  | 'Custom'
  | 'Lookup'
  | 'ExecutePipeline'
  | 'Web'
  | 'AzureFunctionActivity'
  | 'ForEach'
  | 'IfCondition'
  | 'Switch'
  | 'Until'
  | 'SqlServerStoredProcedure'
  | 'AzureDataExplorerCommand'
  | 'GetMetadata'
  | 'Delete'
  | 'SetVariable'
  | 'AppendVariable'
  | 'Wait'
  | 'Validation'
  | 'Filter'
  | 'WebHook'
  | 'ExecuteDataFlow'
  | 'DatabricksNotebook'
  | 'DatabricksSparkJar'
  | 'DatabricksSparkPython'
  | 'HDInsightSpark'
  | 'HDInsightHive'
  | 'SynapseNotebook'
  | 'SynapseSparkJob'
  | 'Script'
  | 'Other';

/**
 * Unified reference location extending Custom activity locations
 */
export type ActivityReferenceLocation =
  | 'activity-level'        // Standard linkedServiceName
  | 'dataset'               // Via dataset reference (Copy, Lookup)
  | 'resource'              // Custom: resourceLinkedService
  | 'reference-object'      // Custom: referenceObjects array
  | 'invoke-pipeline'       // ExecutePipeline
  | 'stored-procedure';     // StoredProcedure linkedService

/**
 * Unified activity reference for all activity types
 */
export interface ActivityReference {
  /** Unique identifier for this reference */
  referenceId: string;
  
  /** Location type of this reference */
  location: ActivityReferenceLocation;
  
  /** ADF LinkedService name */
  linkedServiceName: string;
  
  /** Friendly display name for UI */
  displayName?: string;
  
  /** Whether this reference is required for activity execution */
  isRequired: boolean;
  
  /** Flag for Custom activity references */
  isCustomActivity?: boolean;
  
  /** For reference-object arrays: array index */
  arrayIndex?: number;
  
  /** Selected Fabric connection ID (from UI mapping) */
  selectedConnectionId?: string;
  
  /** Validation errors for this reference */
  validationErrors?: string[];
  
  /** Dataset name (for dataset-based references) */
  datasetName?: string;
  
  /** Dataset type (for additional context) */
  datasetType?: string;
}

/**
 * Activity with all its LinkedService references
 */
export interface ActivityWithReferences {
  /** Unique activity identifier (pipeline_activityName) */
  activityId: string;
  
  /** Activity name from ADF */
  activityName: string;
  
  /** Unified activity type for UI grouping */
  activityType: ActivityTypeEnum;
  
  /** Original ADF activity type string */
  originalActivityType: string;
  
  /** Parent pipeline name */
  pipelineName: string;
  
  /** All LinkedService references for this activity */
  references: ActivityReference[];
  
  /** Total reference count */
  totalReferences: number;
  
  /** Count of mapped references */
  mappedReferences: number;
  
  /** Whether all required references are mapped */
  isFullyMapped: boolean;
  
  /** Whether this activity is nested in a container */
  isNested: boolean;
  
  /** Nesting path for display (e.g., "ForEach1 > IfCondition2") */
  nestingPath?: string;
  
  /** Activity description from ADF */
  description?: string;
  
  /** Validation warnings */
  warnings?: string[];
}

/**
 * Activity group for UI organization by type
 */
export interface ActivityGroup {
  /** Activity type for this group */
  type: ActivityTypeEnum;
  
  /** Display label for UI */
  label: string;
  
  /** Color hex code for UI theming */
  color: string;
  
  /** Lucide icon name */
  iconName: string;
  
  /** Activities in this group */
  activities: ActivityWithReferences[];
  
  /** Total reference count across all activities */
  totalReferences: number;
  
  /** Mapped reference count across all activities */
  mappedReferences: number;
  
  /** Percentage of references mapped (0-100) */
  mappingPercentage: number;
  
  /** Whether this group is expanded in UI */
  isExpanded: boolean;
}

/**
 * Pipeline summary with activity groupings
 */
export interface PipelineMappingSummary {
  /** Pipeline name */
  pipelineName: string;
  
  /** Folder path */
  folderPath?: string;
  
  /** Total activities (including nested) */
  totalActivities: number;
  
  /** Total LinkedService references across all activities */
  totalReferences: number;
  
  /** Mapped reference count */
  mappedReferences: number;
  
  /** Mapping percentage (0-100) */
  mappingPercentage: number;
  
  /** Activity groups organized by type */
  activityGroups: ActivityGroup[];
  
  /** Whether all required mappings are complete */
  isFullyMapped: boolean;
  
  /** Validation errors for this pipeline */
  validationErrors: string[];
}

export interface ConnectionDeploymentResult {
  linkedServiceName: string;
  status: 'success' | 'failed' | 'skipped';
  fabricConnectionId?: string;
  errorMessage?: string;
  skipReason?: string;
  apiRequestDetails?: APIRequestDetails;
}

// Additional types to fix compilation errors
export interface SupportedFabricConnector {
  type: string;
  displayName: string;
  description?: string;
  isSupported: boolean;
  parameters: FabricConnectorParameter[];
  credentialTypes: string[];
  creationMethods?: FabricConnectorCreationMethod[];
}

export interface FabricConnectorParameter {
  name: string;
  displayName: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  dataType?: 'Text' | 'Number' | 'Boolean' | 'Password' | string;
  required: boolean;
  description?: string;
  defaultValue?: any;
  allowedValues?: any[];
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  };
}

export interface FabricConnectorCreationMethod {
  name: string;
  displayName: string;
  description?: string;
  parameters: FabricConnectorParameter[];
  credentialTypes: CredentialType[];
  supportsSkipTestConnection: boolean;
}

export interface ConnectorValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface FabricWorkspace {
  id: string;
  displayName: string;
  description?: string;
  type: string;
  state: string;
  capacityId?: string;
}

// Enhanced TokenScopes with missing properties
export interface EnhancedTokenScopes extends TokenScopes {
  missingScopes?: string[];
  error?: string;
}

// Connector Skip Decision types
export interface ConnectorSkipDecision {
  shouldSkip: boolean;
  reason: string;
  severity: 'info' | 'warning' | 'error';
  verificationStatus?: 'verified' | 'unverified' | 'failed';
  alternatives?: string[];
}

// Existing Fabric Connection types
export interface ExistingFabricConnection {
  id: string;
  displayName: string;
  connectivityType: 'ShareableCloud' | 'OnPremisesGateway' | 'VirtualNetworkGateway';
  connectionDetails: {
    type: string;
    path?: string;
  };
  gatewayId?: string;
  description?: string;
  privacyLevel?: 'Public' | 'Organizational' | 'Private';
  credentialDetails?: {
    credentialType: string;
    singleSignOnType: string;
    connectionEncryption: string;
    skipTestConnection: boolean;
  };
}

export interface ExistingConnectionsResponse {
  value: ExistingFabricConnection[];
  continuationToken?: string;
  continuationUri?: string;
}

export interface ConnectionListFilters {
  connectivityType?: 'ShareableCloud' | 'OnPremisesGateway' | 'VirtualNetworkGateway';
  connectionType?: string;
  gatewayId?: string;
}

// Enhanced LinkedService Connection with existing connection mapping
export interface EnhancedLinkedServiceConnection extends LinkedServiceConnection {
  mappingMode: 'existing' | 'new';
  existingConnectionId?: string;
  existingConnection?: ExistingFabricConnection;
}

// Workspace Identity Management Types
export interface WorkspaceIdentityInfo {
  applicationId: string;
  servicePrincipalId: string;
}

export interface WorkspaceCredentialMapping {
  sourceName: string;
  sourceType: 'ManagedIdentity';
  targetApplicationId: string;
  status: 'pending' | 'configured' | 'failed';
  validationErrors: string[];
}

export interface WorkspaceCredentialState {
  credentials: WorkspaceCredentialMapping[];
  workspaceIdentity?: WorkspaceIdentityInfo;
  isLoading: boolean;
  error: string | null;
}

// ============================================================================
// FABRIC SCHEDULE TYPES (Based on Microsoft Fabric REST API Swagger Spec)
// https://github.com/microsoft/fabric-rest-api-specs
// ============================================================================

export type FabricScheduleType = 'Cron' | 'Daily' | 'Weekly' | 'Monthly';
export type DayOfWeek = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
export type WeekIndex = 'First' | 'Second' | 'Third' | 'Fourth' | 'Fifth';
export type OccurrenceType = 'DayOfMonth' | 'OrdinalWeekday';

/**
 * Base configuration for all Fabric schedule types
 */
export interface FabricScheduleConfigBase {
  type: FabricScheduleType;
  startDateTime: string; // ISO 8601 format: "YYYY-MM-DDTHH:mm:ssZ"
  endDateTime: string;   // ISO 8601 format: "YYYY-MM-DDTHH:mm:ssZ"
  localTimeZoneId: string; // Windows time zone ID (e.g., "Eastern Standard Time")
}

/**
 * Cron schedule - triggers a job periodically
 * Interval in minutes between executions
 */
export interface CronScheduleConfig extends FabricScheduleConfigBase {
  type: 'Cron';
  interval: number; // 1 to 5270400 minutes (10 years)
}

/**
 * Daily schedule - triggers a job at specific times each day
 */
export interface DailyScheduleConfig extends FabricScheduleConfigBase {
  type: 'Daily';
  times: string[]; // Array of time slots in "HH:mm" format, max 100 slots
}

/**
 * Weekly schedule - triggers a job on specific weekdays at specific times
 */
export interface WeeklyScheduleConfig extends FabricScheduleConfigBase {
  type: 'Weekly';
  times: string[];       // Array of time slots in "HH:mm" format, max 100 slots
  weekdays: DayOfWeek[]; // Array of weekdays, max 7 elements
}

/**
 * Day of Month occurrence - triggers on a specific date
 */
export interface DayOfMonthOccurrence {
  occurrenceType: 'DayOfMonth';
  dayOfMonth: number; // 1 to 31 (invalid dates like Feb 31 will be skipped)
}

/**
 * Ordinal Weekday occurrence - triggers on a specific week and day
 */
export interface OrdinalWeekdayOccurrence {
  occurrenceType: 'OrdinalWeekday';
  weekIndex: WeekIndex;
  weekday: DayOfWeek;
}

export type MonthlyOccurrence = DayOfMonthOccurrence | OrdinalWeekdayOccurrence;

/**
 * Monthly schedule - triggers a job on specific days of the month at specific times
 */
export interface MonthlyScheduleConfig extends FabricScheduleConfigBase {
  type: 'Monthly';
  recurrence: number;         // Monthly interval (1-12): 1 = every month, 2 = every 2 months, etc.
  occurrence: MonthlyOccurrence;
  times: string[];            // Array of time slots in "HH:mm" format, max 100 slots
}

/**
 * Discriminated union of all Fabric schedule configuration types
 */
export type FabricScheduleConfig = 
  | CronScheduleConfig 
  | DailyScheduleConfig 
  | WeeklyScheduleConfig 
  | MonthlyScheduleConfig;

// ============================================================================
// ADF/SYNAPSE SCHEDULE TYPES (Source Format)
// ============================================================================

/**
 * ADF nested schedule object for complex recurrence patterns
 */
export interface ADFScheduleDetail {
  minutes?: number[];    // Specific minutes (0-59)
  hours?: number[];      // Specific hours (0-23)
  weekDays?: string[];   // Full weekday names: ["Monday", "Tuesday", etc.]
  monthDays?: number[];  // Days of month (1-31)
  monthlyOccurrences?: Array<{
    day?: string;        // Weekday name
    occurrence?: number; // Week of month (1-5)
  }>;
}

/**
 * ADF trigger recurrence configuration
 */
export interface ADFRecurrence {
  frequency: 'Minute' | 'Hour' | 'Day' | 'Week' | 'Month';
  interval: number;
  startTime: string;
  endTime?: string;
  timeZone: string;
  schedule?: ADFScheduleDetail; // Present for complex Day/Week/Month schedules
}

// ============================================================================
// Global Parameter & Variable Library Types
// ============================================================================

/**
 * Represents a detected global parameter reference from ADF pipelines
 */
export interface GlobalParameterReference {
  /** Original parameter name from ADF (e.g., 'gp_MigrationTest') */
  name: string;
  
  /** Detected ADF data type */
  adfDataType: 'String' | 'Int' | 'Float' | 'Bool' | 'Array' | 'Object' | 'SecureString';
  
  /** Mapped Fabric data type */
  fabricDataType: 'String' | 'Integer' | 'Number' | 'Boolean';
  
  /** Default value (user-provided or empty) */
  defaultValue: string | number | boolean;
  
  /** Optional note/description for the variable */
  note?: string;
  
  /** List of pipeline names that reference this parameter */
  referencedByPipelines: string[];
  
  /** Is this a SecureString that needs manual configuration? */
  isSecure: boolean;
}

/**
 * Configuration for the Fabric Variable Library to be created
 */
export interface VariableLibraryConfig {
  /** Display name for the Variable Library */
  displayName: string;
  
  /** Optional description */
  description?: string;
  
  /** Folder ID (null = workspace root) */
  folderId?: string;
  
  /** Array of variable configurations */
  variables: GlobalParameterReference[];
  
  /** Fabric workspace ID where library will be deployed */
  workspaceId: string;
  
  /** Deployment status */
  deploymentStatus?: 'pending' | 'deploying' | 'success' | 'failed';
  
  /** Deployed Fabric item ID (after successful deployment) */
  fabricItemId?: string;
  
  /** Error message if deployment failed */
  deploymentError?: string;
}

/**
 * Variable Library definition parts for Fabric API
 */
export interface VariableLibraryDefinition {
  parts: VariableLibraryPart[];
}

export interface VariableLibraryPart {
  path: string;
  payload: string; // Base64 encoded
  payloadType: 'InlineBase64';
}

/**
 * Structure for variables.json (before encoding)
 */
export interface VariablesJsonSchema {
  $schema: string;
  variables: VariableDefinition[];
}

export interface VariableDefinition {
  name: string;
  note?: string;
  type: 'String' | 'Integer' | 'Number' | 'Boolean';
  value: string | number | boolean;
}

/**
 * Structure for settings.json (before encoding)
 */
export interface SettingsJsonSchema {
  $schema: string;
  valueSetsOrder: string[]; // Empty array for now
}

/**
 * Pipeline library variable reference (injected into transformed pipelines)
 */
export interface PipelineLibraryVariable {
  type: 'String' | 'Integer' | 'Number' | 'Boolean';
  variableName: string;
  libraryName: string;
}