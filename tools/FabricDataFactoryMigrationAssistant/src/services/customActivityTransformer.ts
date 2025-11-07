import { connectionService } from './connectionService';
import { PipelineConnectionMappings, LinkedServiceConnectionBridge } from '../types';

/**
 * Specialized transformer for Custom activities
 * Handles 3 distinct LinkedService reference locations:
 * 1. linkedServiceName.referenceName → externalReferences.connection
 * 2. typeProperties.resourceLinkedService.referenceName → typeProperties.externalReferences.connection
 * 3. typeProperties.referenceObjects.linkedServices[] → typeProperties.extendedProperties.referenceObjects (JSON stringified)
 */
export class CustomActivityTransformer {
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
   * Transforms an ADF Custom activity to Fabric format
   * @param activity The ADF Custom activity
   * @param pipelineName Pipeline name (for connection mapping lookup)
   * @param connectionMappings User-selected connection mappings from UI (OLD format - backward compatibility)
   * @returns Transformed Fabric Custom activity
   */
  transformCustomActivity(
    activity: any,
    pipelineName: string,
    connectionMappings?: PipelineConnectionMappings
  ): any {
    if (!activity || activity.type !== 'Custom') {
      console.warn('transformCustomActivity called on non-Custom activity');
      return activity;
    }

    console.log(`Transforming Custom activity: ${activity.name} in pipeline: ${pipelineName}`);

    // Get Custom activity connection mappings from user selections
    const activityMappings = connectionMappings?.[pipelineName]?.[activity.name];
    const customReferences = activityMappings?.customActivityReferences || [];

    // Extract connection IDs for each location
    const activityLevelConnectionId = this.getConnectionIdForLocation(
      pipelineName,
      customReferences,
      'activity-level',
      activity.linkedServiceName?.referenceName
    );

    const resourceConnectionId = this.getConnectionIdForLocation(
      pipelineName,
      customReferences,
      'resource',
      activity.typeProperties?.resourceLinkedService?.referenceName
    );

    // Build transformed typeProperties
    const transformedTypeProperties = this.transformCustomTypeProperties(
      pipelineName,
      activity.typeProperties,
      resourceConnectionId,
      customReferences
    );

    // Build transformed activity
    const transformedActivity: any = {
      name: activity.name,
      type: 'Custom',
      dependsOn: activity.dependsOn || [],
      policy: activity.policy || {
        timeout: '0.12:00:00',
        retry: 0,
        retryIntervalInSeconds: 30,
        secureOutput: false,
        secureInput: false
      },
      userProperties: activity.userProperties || [],
      typeProperties: transformedTypeProperties
    };

    // Add activity-level externalReferences if connection exists
    if (activityLevelConnectionId) {
      transformedActivity.externalReferences = {
        connection: activityLevelConnectionId
      };
      console.log(`Custom activity ${activity.name}: Activity-level connection = ${activityLevelConnectionId}`);
    }

    return transformedActivity;
  }

  /**
   * Gets connection ID for a specific reference location with 4-tier fallback system
   * 
   * Priority 1: NEW referenceMappings[pipelineName][referenceId] (from ComponentMappingTableV2)
   * Priority 2: OLD customActivityReferences array (backward compatibility)
   * Priority 3: linkedServiceBridge (from Configure Connections page)
   * Priority 4: connectionService (deployed connections registry)
   */
  private getConnectionIdForLocation(
    pipelineName: string,
    customReferences: any[],
    location: string,
    linkedServiceName?: string,
    arrayIndex?: number
  ): string | undefined {
    if (!linkedServiceName) return undefined;

    // Construct referenceId based on location
    let referenceId: string;
    if (location === 'activity-level') {
      referenceId = `linkedService_${linkedServiceName}`;
    } else if (location === 'resource') {
      referenceId = `resource_${linkedServiceName}`;
    } else if (location === 'reference-object') {
      referenceId = `referenceObject_${arrayIndex}_${linkedServiceName}`;
    } else {
      console.warn(`Unknown Custom activity reference location: ${location}`);
      return undefined;
    }

    // PRIORITY 1: Try NEW referenceMappings (referenceId-based)
    const referenceMapping = this.referenceMappings?.[pipelineName]?.[referenceId];
    if (referenceMapping) {
      console.log(`✓ Custom activity [P1-NEW] ${location} connection found via referenceMappings: ${linkedServiceName} → ${referenceMapping}`);
      return referenceMapping;
    }

    // PRIORITY 2: Try OLD customActivityReferences (backward compatibility)
    const reference = customReferences.find(ref => {
      if (ref.location !== location) return false;
      if (ref.linkedServiceName !== linkedServiceName) return false;
      if (location === 'reference-object' && ref.arrayIndex !== arrayIndex) return false;
      return true;
    });

    const connectionId = reference?.selectedConnectionId;
    if (connectionId) {
      console.log(`✓ Custom activity [P2-OLD] ${location} connection found via customActivityReferences: ${linkedServiceName} → ${connectionId}`);
      return connectionId;
    }

    // PRIORITY 3: Try linkedServiceBridge (from Configure Connections)
    const bridgeConnection = this.linkedServiceBridge?.[linkedServiceName];
    if (bridgeConnection?.connectionId) {
      console.log(`✓ Custom activity [P3-BRIDGE] ${location} connection found via linkedServiceBridge: ${linkedServiceName} → ${bridgeConnection.connectionId}`);
      return bridgeConnection.connectionId;
    }

    // PRIORITY 4: Fallback to connection service (deployed connections registry)
    const fallbackId = connectionService.mapLinkedServiceToConnection(linkedServiceName);
    if (fallbackId) {
      console.warn(`⚠ Custom activity [P4-FALLBACK] ${location} using connection service for ${linkedServiceName}: ${fallbackId}`);
      return fallbackId;
    }

    console.warn(`✗ No connection mapping found for Custom activity LinkedService: ${linkedServiceName} at location: ${location} (referenceId: ${referenceId})`);
    return undefined;
  }

  /**
   * Transforms typeProperties for Custom activity
   */
  private transformCustomTypeProperties(
    pipelineName: string,
    typeProperties: any,
    resourceConnectionId: string | undefined,
    customReferences: any[]
  ): any {
    if (!typeProperties) return {};

    // Start with base properties
    const transformed: any = {
      command: typeProperties.command,
      folderPath: typeProperties.folderPath,
      retentionTimeInDays: typeProperties.retentionTimeInDays
    };

    // Handle referenceObjects → extendedProperties (JSON stringified)
    const referenceObjectsLinkedServices = typeProperties.referenceObjects?.linkedServices || [];
    if (referenceObjectsLinkedServices.length > 0 || typeProperties.referenceObjects?.datasets) {
      const referenceObjectsPayload = {
        linkedServices: referenceObjectsLinkedServices,
        datasets: typeProperties.referenceObjects?.datasets || []
      };

      transformed.extendedProperties = {
        referenceObjects: JSON.stringify(referenceObjectsPayload)
      };
      
      console.log(`Custom activity: Stringified ${referenceObjectsLinkedServices.length} reference objects to extendedProperties`);
    }

    // Handle resource LinkedService → typeProperties.externalReferences.connection
    if (resourceConnectionId) {
      transformed.externalReferences = {
        connection: resourceConnectionId
      };
      console.log(`Custom activity: Resource connection = ${resourceConnectionId}`);
    }

    // Copy any other unknown properties
    const knownProperties = [
      'command', 'folderPath', 'retentionTimeInDays',
      'resourceLinkedService', 'referenceObjects'
    ];

    for (const [key, value] of Object.entries(typeProperties)) {
      if (!knownProperties.includes(key) && value !== undefined) {
        transformed[key] = value;
      }
    }

    return transformed;
  }

  /**
   * Checks if Custom activity references a failed connector
   */
  activityReferencesFailedConnector(activity: any): boolean {
    if (!activity || activity.type !== 'Custom') return false;

    const linkedServiceNames: string[] = [];

    // Collect all LinkedService names
    if (activity.linkedServiceName?.referenceName) {
      linkedServiceNames.push(activity.linkedServiceName.referenceName);
    }

    if (activity.typeProperties?.resourceLinkedService?.referenceName) {
      linkedServiceNames.push(activity.typeProperties.resourceLinkedService.referenceName);
    }

    const referenceLinkedServices = activity.typeProperties?.referenceObjects?.linkedServices || [];
    referenceLinkedServices.forEach((ls: any) => {
      if (ls.referenceName) linkedServiceNames.push(ls.referenceName);
    });

    // Check against failed connectors
    const failedConnectors = connectionService.getFailedConnectors();
    const hasFailedConnector = linkedServiceNames.some(name => failedConnectors.has(name));

    if (hasFailedConnector) {
      console.warn(`Custom activity ${activity.name} references failed connector(s):`, 
        linkedServiceNames.filter(name => failedConnectors.has(name))
      );
    }

    return hasFailedConnector;
  }
}

export const customActivityTransformer = new CustomActivityTransformer();
