import { connectionService } from './connectionService';
import { PipelineConnectionMappings, LinkedServiceConnectionBridge } from '../types';

/**
 * Specialized transformer for HDInsight activities
 * Consolidates 5 ADF HDInsight types into 1 Fabric AzureHDInsight type:
 * - HDInsightHive → AzureHDInsight (hdiActivityType: "Hive")
 * - HDInsightPig → AzureHDInsight (hdiActivityType: "Pig")
 * - HDInsightMapReduce → AzureHDInsight (hdiActivityType: "MapReduce")
 * - HDInsightSpark → AzureHDInsight (hdiActivityType: "Spark")
 * - HDInsightStreaming → AzureHDInsight (hdiActivityType: "Streaming")
 * 
 * Handles dual connection mapping:
 * 1. Cluster connection: linkedServiceName.referenceName → externalReferences.connection
 * 2. Storage connection: scriptLinkedService/fileLinkedService → typeProperties.externalReferences.connection
 */
export class HDInsightActivityTransformer {
  private referenceMappings?: Record<string, Record<string, string>>;
  private linkedServiceBridge?: LinkedServiceConnectionBridge;

  /**
   * Set reference mappings (NEW referenceId-based mappings)
   */
  setReferenceMappings(mappings: Record<string, Record<string, string>>) {
    this.referenceMappings = mappings;
  }

  /**
   * Set LinkedService bridge (from Configure Connections page)
   */
  setLinkedServiceBridge(bridge: LinkedServiceConnectionBridge) {
    this.linkedServiceBridge = bridge;
  }

  /**
   * Transforms an ADF HDInsight* activity to Fabric AzureHDInsight format
   * @param activity The ADF HDInsight activity
   * @param pipelineName Pipeline name (for connection mapping lookup)
   * @param connectionMappings User-selected connection mappings from UI
   * @returns Transformed Fabric AzureHDInsight activity
   */
  transformHDInsightActivity(
    activity: any,
    pipelineName: string,
    connectionMappings?: PipelineConnectionMappings
  ): any {
    const hdinsightTypes = ['HDInsightHive', 'HDInsightPig', 'HDInsightMapReduce', 'HDInsightSpark', 'HDInsightStreaming'];
    
    if (!activity || !hdinsightTypes.includes(activity.type)) {
      console.warn(`transformHDInsightActivity called on non-HDInsight activity: ${activity?.type}`);
      return activity;
    }

    console.log(`Transforming HDInsight activity: ${activity.name} (${activity.type}) in pipeline: ${pipelineName}`);

    // Determine hdiActivityType (remove "HDInsight" prefix)
    const hdiActivityType = this.getHDIActivityType(activity.type);

    // Extract cluster connection (activity-level linkedServiceName)
    const clusterConnectionId = this.getConnectionIdForLinkedService(
      pipelineName,
      activity.linkedServiceName?.referenceName,
      'cluster'
    );

    // Transform typeProperties based on subtype
    const transformedTypeProperties = this.transformTypePropertiesBySubtype(
      pipelineName,
      activity.type,
      activity.typeProperties,
      connectionMappings
    );

    // Build transformed activity
    const transformedActivity: any = {
      name: activity.name,
      type: 'AzureHDInsight',
      dependsOn: activity.dependsOn || [],
      policy: activity.policy || {
        timeout: '0.12:00:00',
        retry: 0,
        retryIntervalInSeconds: 30,
        secureOutput: false,
        secureInput: false
      },
      userProperties: activity.userProperties || [],
      typeProperties: {
        hdiActivityType,
        ...transformedTypeProperties
      }
    };

    // Add cluster connection if exists
    if (clusterConnectionId) {
      transformedActivity.externalReferences = {
        connection: clusterConnectionId
      };
      console.log(`HDInsight activity ${activity.name}: Cluster connection = ${clusterConnectionId}`);
    } else {
      console.warn(`HDInsight activity ${activity.name}: No cluster connection found for ${activity.linkedServiceName?.referenceName}`);
    }

    return transformedActivity;
  }

  /**
   * Maps ADF HDInsight type to Fabric hdiActivityType
   */
  private getHDIActivityType(adfType: string): string {
    const typeMap: Record<string, string> = {
      'HDInsightHive': 'Hive',
      'HDInsightPig': 'Pig',
      'HDInsightMapReduce': 'MapReduce',
      'HDInsightSpark': 'Spark',
      'HDInsightStreaming': 'Streaming'
    };

    return typeMap[adfType] || adfType;
  }

  /**
   * Gets connection ID for a LinkedService with 4-tier fallback system
   * 
   * Priority 1: NEW referenceMappings[pipelineName][referenceId]
   * Priority 2: OLD activityMappings (backward compatibility)
   * Priority 3: linkedServiceBridge (from Configure Connections page)
   * Priority 4: connectionService (deployed connections registry)
   */
  private getConnectionIdForLinkedService(
    pipelineName: string,
    linkedServiceName?: string,
    location: 'cluster' | 'storage' = 'cluster'
  ): string | undefined {
    if (!linkedServiceName) return undefined;

    // Construct referenceId
    const referenceId = `linkedService_${linkedServiceName}`;

    // PRIORITY 1: Try NEW referenceMappings (referenceId-based)
    const referenceMapping = this.referenceMappings?.[pipelineName]?.[referenceId];
    if (referenceMapping) {
      console.log(`✓ HDInsight [P1-NEW] ${location} connection found via referenceMappings: ${linkedServiceName} → ${referenceMapping}`);
      return referenceMapping;
    }

    // PRIORITY 2: Try linkedServiceBridge (from Configure Connections)
    const bridgeConnection = this.linkedServiceBridge?.[linkedServiceName];
    if (bridgeConnection?.connectionId) {
      console.log(`✓ HDInsight [P2-BRIDGE] ${location} connection found via linkedServiceBridge: ${linkedServiceName} → ${bridgeConnection.connectionId}`);
      return bridgeConnection.connectionId;
    }

    // PRIORITY 3: Fallback to connection service (deployed connections registry)
    const fallbackId = connectionService.mapLinkedServiceToConnection(linkedServiceName);
    if (fallbackId) {
      console.warn(`⚠ HDInsight [P3-FALLBACK] ${location} using connection service for ${linkedServiceName}: ${fallbackId}`);
      return fallbackId;
    }

    console.warn(`✗ No connection mapping found for HDInsight LinkedService: ${linkedServiceName} (location: ${location}, referenceId: ${referenceId})`);
    return undefined;
  }

  /**
   * Transforms typeProperties based on HDInsight subtype
   */
  private transformTypePropertiesBySubtype(
    pipelineName: string,
    adfType: string,
    typeProperties: any,
    connectionMappings?: PipelineConnectionMappings
  ): any {
    if (!typeProperties) return {};

    switch (adfType) {
      case 'HDInsightHive':
        return this.transformHiveProperties(pipelineName, typeProperties);
      
      case 'HDInsightPig':
        return this.transformPigProperties(pipelineName, typeProperties);
      
      case 'HDInsightMapReduce':
        return this.transformMapReduceProperties(pipelineName, typeProperties);
      
      case 'HDInsightSpark':
        return this.transformSparkProperties(pipelineName, typeProperties);
      
      case 'HDInsightStreaming':
        return this.transformStreamingProperties(pipelineName, typeProperties);
      
      default:
        console.warn(`Unknown HDInsight type: ${adfType}`);
        return typeProperties;
    }
  }

  /**
   * Transform Hive-specific properties
   */
  private transformHiveProperties(pipelineName: string, typeProps: any): any {
    const transformed: any = {};

    // Script settings
    if (typeProps.scriptPath) {
      transformed.scriptSettings = {
        scriptPath: typeProps.scriptPath
      };

      // Handle storage connection for script
      const storageConnectionId = this.getConnectionIdForLinkedService(
        pipelineName,
        typeProps.scriptLinkedService?.referenceName,
        'storage'
      );

      if (storageConnectionId) {
        transformed.scriptSettings.externalReferences = {
          connection: storageConnectionId
        };
        console.log(`Hive activity: Script storage connection = ${storageConnectionId}`);
      }
    }

    // Pass-through properties
    if (typeProps.defines) transformed.defines = typeProps.defines;
    if (typeProps.variables) transformed.variables = typeProps.variables;
    if (typeProps.arguments) transformed.arguments = typeProps.arguments;
    if (typeProps.getDebugInfo) transformed.getDebugInfo = typeProps.getDebugInfo;
    if (typeProps.queryTimeout) transformed.queryTimeout = typeProps.queryTimeout;

    return transformed;
  }

  /**
   * Transform Pig-specific properties
   */
  private transformPigProperties(pipelineName: string, typeProps: any): any {
    const transformed: any = {};

    // Script settings
    if (typeProps.scriptPath) {
      transformed.scriptSettings = {
        scriptPath: typeProps.scriptPath
      };

      // Handle storage connection for script
      const storageConnectionId = this.getConnectionIdForLinkedService(
        pipelineName,
        typeProps.scriptLinkedService?.referenceName,
        'storage'
      );

      if (storageConnectionId) {
        transformed.scriptSettings.externalReferences = {
          connection: storageConnectionId
        };
        console.log(`Pig activity: Script storage connection = ${storageConnectionId}`);
      }
    }

    // Pass-through properties
    if (typeProps.defines) transformed.defines = typeProps.defines;
    if (typeProps.arguments) transformed.arguments = typeProps.arguments;
    if (typeProps.getDebugInfo) transformed.getDebugInfo = typeProps.getDebugInfo;

    return transformed;
  }

  /**
   * Transform MapReduce-specific properties
   */
  private transformMapReduceProperties(pipelineName: string, typeProps: any): any {
    const transformed: any = {};

    // JAR settings
    if (typeProps.jarFilePath || typeProps.className) {
      transformed.jarSettings = {};
      
      if (typeProps.jarFilePath) transformed.jarSettings.jarFilePath = typeProps.jarFilePath;
      if (typeProps.jarLibs) transformed.jarSettings.jarLibs = typeProps.jarLibs;

      // Handle storage connection for JAR
      const storageConnectionId = this.getConnectionIdForLinkedService(
        pipelineName,
        typeProps.jarLinkedService?.referenceName,
        'storage'
      );

      if (storageConnectionId) {
        transformed.jarSettings.externalReferences = {
          connection: storageConnectionId
        };
        console.log(`MapReduce activity: JAR storage connection = ${storageConnectionId}`);
      }
    }

    // Pass-through properties
    if (typeProps.className) transformed.className = typeProps.className;
    if (typeProps.arguments) transformed.arguments = typeProps.arguments;
    if (typeProps.getDebugInfo) transformed.getDebugInfo = typeProps.getDebugInfo;

    return transformed;
  }

  /**
   * Transform Spark-specific properties
   */
  private transformSparkProperties(pipelineName: string, typeProps: any): any {
    const transformed: any = {};

    // Spark can have script or JAR
    if (typeProps.rootPath || typeProps.entryFilePath) {
      // Script-based Spark
      if (typeProps.entryFilePath) transformed.entryFilePath = typeProps.entryFilePath;
      if (typeProps.rootPath) transformed.rootPath = typeProps.rootPath;
    }

    // Handle storage connection
    const storageConnectionId = this.getConnectionIdForLinkedService(
      pipelineName,
      typeProps.sparkJobLinkedService?.referenceName,
      'storage'
    );

    if (storageConnectionId) {
      transformed.externalReferences = {
        connection: storageConnectionId
      };
      console.log(`Spark activity: Job storage connection = ${storageConnectionId}`);
    }

    // Pass-through properties
    if (typeProps.className) transformed.className = typeProps.className;
    if (typeProps.proxyUser) transformed.proxyUser = typeProps.proxyUser;
    if (typeProps.arguments) transformed.arguments = typeProps.arguments;
    if (typeProps.sparkConfig) transformed.sparkConfig = typeProps.sparkConfig;
    if (typeProps.getDebugInfo) transformed.getDebugInfo = typeProps.getDebugInfo;

    return transformed;
  }

  /**
   * Transform Streaming-specific properties
   */
  private transformStreamingProperties(pipelineName: string, typeProps: any): any {
    const transformed: any = {};

    // Required properties
    if (typeProps.mapper) transformed.mapper = typeProps.mapper;
    if (typeProps.reducer) transformed.reducer = typeProps.reducer;
    if (typeProps.combiner) transformed.combiner = typeProps.combiner;

    // File settings
    if (typeProps.input || typeProps.output || typeProps.filePaths) {
      transformed.fileSettings = {};
      
      if (typeProps.filePaths) transformed.fileSettings.filePaths = typeProps.filePaths;
      if (typeProps.input) transformed.fileSettings.input = typeProps.input;
      if (typeProps.output) transformed.fileSettings.output = typeProps.output;

      // Handle storage connection for files
      const storageConnectionId = this.getConnectionIdForLinkedService(
        pipelineName,
        typeProps.fileLinkedService?.referenceName,
        'storage'
      );

      if (storageConnectionId) {
        transformed.fileSettings.externalReferences = {
          connection: storageConnectionId
        };
        console.log(`Streaming activity: File storage connection = ${storageConnectionId}`);
      }
    }

    // Pass-through properties
    if (typeProps.arguments) transformed.arguments = typeProps.arguments;
    if (typeProps.defines) transformed.defines = typeProps.defines;
    if (typeProps.getDebugInfo) transformed.getDebugInfo = typeProps.getDebugInfo;

    return transformed;
  }

  /**
   * Checks if HDInsight activity references a failed connector
   */
  activityReferencesFailedConnector(activity: any): boolean {
    const hdinsightTypes = ['HDInsightHive', 'HDInsightPig', 'HDInsightMapReduce', 'HDInsightSpark', 'HDInsightStreaming'];
    if (!activity || !hdinsightTypes.includes(activity.type)) return false;

    const linkedServiceNames: string[] = [];

    // Collect cluster LinkedService
    if (activity.linkedServiceName?.referenceName) {
      linkedServiceNames.push(activity.linkedServiceName.referenceName);
    }

    // Collect storage LinkedServices based on type
    const typeProps = activity.typeProperties || {};
    
    if (typeProps.scriptLinkedService?.referenceName) {
      linkedServiceNames.push(typeProps.scriptLinkedService.referenceName);
    }
    
    if (typeProps.jarLinkedService?.referenceName) {
      linkedServiceNames.push(typeProps.jarLinkedService.referenceName);
    }
    
    if (typeProps.sparkJobLinkedService?.referenceName) {
      linkedServiceNames.push(typeProps.sparkJobLinkedService.referenceName);
    }
    
    if (typeProps.fileLinkedService?.referenceName) {
      linkedServiceNames.push(typeProps.fileLinkedService.referenceName);
    }

    // Check against failed connectors
    const failedConnectors = connectionService.getFailedConnectors();
    const hasFailedConnector = linkedServiceNames.some(name => failedConnectors.has(name));

    if (hasFailedConnector) {
      console.warn(`HDInsight activity ${activity.name} references failed connector(s):`, 
        linkedServiceNames.filter(name => failedConnectors.has(name))
      );
    }

    return hasFailedConnector;
  }
}

export const hdinsightActivityTransformer = new HDInsightActivityTransformer();
