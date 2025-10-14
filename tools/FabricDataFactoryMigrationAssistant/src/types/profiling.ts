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
}

export interface ActivitySummary {
  name: string;
  type: string;
  description?: string;
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
    connectorType?: string;
    requiresGateway: boolean;
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
