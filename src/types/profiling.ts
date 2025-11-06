/**
 * ADF ARM Template Profiling Types
 * 
 * These types support comprehensive analysis and visualization of Azure Data Factory
 * ARM templates, including metrics extraction, dependency mapping, and Fabric migration insights.
 */

export interface ADFProfile {
  metadata: ProfileMetadata;
  metrics: ProfileMetrics;
  artifacts: ArtifactBreakdown;
  dependencies: DependencyGraph;
  insights: ProfileInsight[];
}

export interface ProfileMetadata {
  fileName: string;
  fileSize: number;
  parsedAt: Date;
  templateVersion?: string;
  factoryName?: string;
}

export interface ProfileMetrics {
  // Core counts
  totalPipelines: number;
  totalDatasets: number;
  totalLinkedServices: number;
  totalTriggers: number;
  totalDataflows: number;
  totalIntegrationRuntimes: number;
  totalGlobalParameters: number;
  
  // Activity breakdown
  totalActivities: number;
  activitiesByType: Record<string, number>;
  avgActivitiesPerPipeline: number;
  maxActivitiesPerPipeline: number;
  maxActivitiesPipelineName: string;
  
  // NEW: Parameterized LinkedService statistics
  parameterizedLinkedServicesCount: number;
  totalParameterizedLinkedServiceParameters: number;
  
  // Custom activity statistics
  customActivitiesCount: number;
  totalCustomActivityReferences: number; // Total LinkedService references across all Custom activities
  customActivitiesWithMultipleReferences: number; // Count of Custom activities with 2+ references
  
  // Dependencies
  pipelineDependencies: number; // Execute Pipeline activities
  triggerPipelineMappings: number;
  
  // Usage statistics
  datasetsPerLinkedService: Record<string, number>;
  pipelinesPerDataset: Record<string, number>;
  pipelinesPerTrigger: Record<string, string[]>;
  triggersPerPipeline: Record<string, string[]>;
}

export interface ArtifactBreakdown {
  pipelines: PipelineArtifact[];
  datasets: DatasetArtifact[];
  linkedServices: LinkedServiceArtifact[];
  triggers: TriggerArtifact[];
  dataflows: DataflowArtifact[];
  parameterizedLinkedServices: ParameterizedLinkedServiceSummary[]; // NEW
  globalParameters?: GlobalParameterArtifact[]; // NEW: Global parameters detected
}

export interface PipelineArtifact {
  name: string;
  activityCount: number;
  activities: ActivitySummary[];
  parameterCount: number;
  triggeredBy: string[];
  usesDatasets: string[];
  executesPipelines: string[];
  folder?: string | null;
  fabricMapping?: {
    targetType: 'dataPipeline';
    compatibilityStatus: 'supported' | 'partiallySupported' | 'unsupported';
    migrationNotes: string[];
  };
  // NEW: Direct linked service references from activities
  usesLinkedServices?: string[];
  // NEW: Pipeline dependencies from resource-level dependsOn
  dependsOnPipelines?: string[];
  // NEW: Linked service dependencies from resource-level dependsOn
  dependsOnLinkedServices?: string[];
  // NEW: Dataflow dependencies from resource-level dependsOn
  dependsOnDataflows?: string[];
}

export interface ActivitySummary {
  name: string;
  type: string;
  description?: string;
  // Custom activity metadata
  isCustomActivity?: boolean;
  customActivityReferences?: {
    activityLevel?: string;
    resource?: string;
    referenceObjects?: string[];
  };
}

export interface DatasetArtifact {
  name: string;
  type: string;
  linkedService: string;
  usedByPipelines: string[];
  usageCount: number;
  fabricMapping?: {
    embeddedInActivity: boolean;
    requiresConnection: boolean;
  };
}

export interface LinkedServiceArtifact {
  name: string;
  type: string;
  usedByDatasets: string[];
  usedByPipelines: string[]; // Indirect usage through datasets
  usageScore: number; // Criticality score based on usage
  fabricMapping?: {
    targetType: 'connector' | 'gateway' | 'workspaceIdentity';
    connectorType: string;
    requiresGateway: boolean;
  };
  // NEW: Parameterized LinkedService detection
  hasParameters?: boolean;
  parameterCount?: number;
  parameterNames?: string[];
  affectedPipelinesCount?: number;
}

/**
 * Parameterized LinkedService summary for profiling
 */
export interface ParameterizedLinkedServiceSummary {
  /** LinkedService name */
  name: string;
  /** LinkedService type */
  type: string;
  /** Number of parameters */
  parameterCount: number;
  /** Parameter names */
  parameters: string[];
  /** Pipeline names affected by this LinkedService */
  affectedPipelines: string[];
  /** Number of affected pipelines */
  affectedPipelinesCount: number;
}

/**
 * Global Parameter artifact for profiling and export
 * Represents a detected global parameter in ADF/Synapse
 */
export interface GlobalParameterArtifact {
  /** Parameter name */
  name: string;
  /** Data type (String, Int, Float, Bool, Array, Object, SecureString) */
  dataType: string;
  /** Default value from ARM template (if available) */
  defaultValue?: any;
  /** Pipelines that reference this parameter */
  usedByPipelines?: string[];
  /** Number of times this parameter is referenced */
  referenceCount?: number;
  /** Fabric mapping details */
  fabricMapping?: {
    /** Target Variable Library name */
    variableLibraryName: string;
    /** Transformed expression format */
    transformedExpression: string;
  };
}

export interface TriggerArtifact {
  name: string;
  type: 'ScheduleTrigger' | 'TumblingWindowTrigger' | 'BlobEventsTrigger' | 'CustomEventsTrigger' | 'RerunTumblingWindowTrigger' | string;
  status: 'Started' | 'Stopped' | 'Unknown';
  pipelines: string[];
  dependsOnPipelines?: string[];  // NEW: Resource-level dependencies
  schedule?: string;
  recurrence?: {
    frequency: string;
    interval: number;
    startTime?: string;
    endTime?: string;
  };
  fabricMapping?: {
    targetType: 'schedule' | 'manual';
    supportLevel: 'full' | 'partial' | 'unsupported';
  };
}

export interface DataflowArtifact {
  name: string;
  sourceCount: number;
  sinkCount: number;
  transformationCount: number;
  fabricMapping?: {
    targetType: 'dataflowGen2' | 'notebook';
    requiresManualMigration: boolean;
  };
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  type: 'pipeline' | 'dataset' | 'linkedService' | 'trigger' | 'dataflow';
  label: string;
  metadata: {
    activityCount?: number;
    usageCount?: number;
    status?: string;
    folder?: string;
  };
  fabricTarget?: string;
  criticality: 'high' | 'medium' | 'low';
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'triggers' | 'uses' | 'references' | 'executes' | 'dependsOn';  // Added 'dependsOn'
  label?: string;
}

export interface ProfileInsight {
  id: string;
  icon: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  metric?: number;
  recommendation?: string;
}
