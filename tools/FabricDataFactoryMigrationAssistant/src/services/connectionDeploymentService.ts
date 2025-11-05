/**
 * Connection Deployment Service
 * Handles both new connection creation and mapping to existing connections
 */

import type { 
  LinkedServiceConnection, 
  ConnectionDeploymentResult, 
  APIRequestDetails,
  ExistingFabricConnection 
} from '../types';
import { fabricConnectionsService } from './fabricConnectionsService';

export interface NewConnectionPlan {
  linkedServiceName: string;
  connectionType: string;
  connectivityType: 'ShareableCloud' | 'OnPremisesGateway' | 'VirtualNetworkGateway';
  endpoint: string;
  payload: Record<string, any>;
}

export interface ExistingConnectionMapping {
  linkedServiceName: string;
  existingConnectionId: string;
  existingConnectionName: string;
  connectionType: string;
}

export interface ConnectionDeploymentPlan {
  newConnections: NewConnectionPlan[];
  existingConnections: ExistingConnectionMapping[];
  summary: {
    totalNew: number;
    totalMappings: number;
    totalConnections: number;
  };
}

export class ConnectionDeploymentService {
  private static readonly FABRIC_BASE_URL = 'https://api.fabric.microsoft.com/v1';

  /**
   * Generate deployment plan for connections
   */
  static generateDeploymentPlan(linkedServices: LinkedServiceConnection[]): ConnectionDeploymentPlan {
    const newConnections: NewConnectionPlan[] = [];
    const existingConnections: ExistingConnectionMapping[] = [];

    linkedServices.forEach(linkedService => {
      if (linkedService.mappingMode === 'existing' && linkedService.existingConnectionId && linkedService.existingConnection) {
        // Mapping to existing connection
        existingConnections.push({
          linkedServiceName: linkedService.linkedServiceName,
          existingConnectionId: linkedService.existingConnectionId,
          existingConnectionName: linkedService.existingConnection.displayName,
          connectionType: linkedService.existingConnection.connectionDetails.type
        });
      } else if (linkedService.mappingMode === 'new' && linkedService.selectedConnectionType) {
        // Creating new connection
        const payload = fabricConnectionsService.buildConnectionPayload(linkedService);
        newConnections.push({
          linkedServiceName: linkedService.linkedServiceName,
          connectionType: linkedService.selectedConnectionType,
          connectivityType: linkedService.selectedConnectivityType || 'ShareableCloud',
          endpoint: `${this.FABRIC_BASE_URL}/connections`,
          payload: payload
        });
      }
    });

    return {
      newConnections,
      existingConnections,
      summary: {
        totalNew: newConnections.length,
        totalMappings: existingConnections.length,
        totalConnections: linkedServices.length
      }
    };
  }

  /**
   * Deploy new connections only (filtering for 'new' mapping mode)
   */
  static async deployNewConnections(
    linkedServices: LinkedServiceConnection[],
    accessToken: string,
    workspaceId: string
  ): Promise<ConnectionDeploymentResult[]> {
    const newConnections = linkedServices.filter(ls => ls.mappingMode === 'new');
    return this.deployConnections(accessToken, workspaceId, newConnections);
  }

  /**
   * Deploy connections to Fabric
   */
  static async deployConnections(
    accessToken: string,
    workspaceId: string,
    linkedServices: LinkedServiceConnection[]
  ): Promise<ConnectionDeploymentResult[]> {
    const results: ConnectionDeploymentResult[] = [];

    for (const linkedService of linkedServices) {
      try {
        if (linkedService.mappingMode === 'existing') {
          // Map to existing connection - no API call needed
          results.push({
            linkedServiceName: linkedService.linkedServiceName,
            status: 'success',
            fabricConnectionId: linkedService.existingConnectionId,
            apiRequestDetails: {
              method: 'MAPPING',
              endpoint: `existing-connection:${linkedService.existingConnectionId}`,
              payload: {
                action: 'Map to existing connection',
                linkedServiceName: linkedService.linkedServiceName,
                existingConnectionId: linkedService.existingConnectionId,
                existingConnectionName: linkedService.existingConnection?.displayName
              }
            }
          });
        } else {
          // Create new connection
          const connectionResult = await fabricConnectionsService.createConnection(
            accessToken,
            linkedService
          );

          if (connectionResult.success && connectionResult.connectionId) {
            results.push({
              linkedServiceName: linkedService.linkedServiceName,
              status: 'success',
              fabricConnectionId: connectionResult.connectionId,
              apiRequestDetails: connectionResult.apiRequestDetails
            });
          } else {
            results.push({
              linkedServiceName: linkedService.linkedServiceName,
              status: 'failed',
              errorMessage: connectionResult.error || 'Unknown error creating connection',
              apiRequestDetails: connectionResult.apiRequestDetails
            });
          }
        }
      } catch (error) {
        console.error(`Error deploying connection for ${linkedService.linkedServiceName}:`, error);
        results.push({
          linkedServiceName: linkedService.linkedServiceName,
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  /**
   * Generate downloadable deployment plan as JSON
   */
  static generateDeploymentPlanJson(linkedServices: LinkedServiceConnection[]): string {
    const plan = this.generateDeploymentPlan(linkedServices);
    
    const deploymentPlan = {
      metadata: {
        generatedAt: new Date().toISOString(),
        version: '1.0',
        totalConnections: plan.summary.totalConnections,
        totalNew: plan.summary.totalNew,
        totalMappings: plan.summary.totalMappings
      },
      deployment: {
        newConnections: plan.newConnections.map(conn => ({
          linkedServiceName: conn.linkedServiceName,
          connectionType: conn.connectionType,
          connectivityType: conn.connectivityType,
          apiCall: {
            method: 'POST',
            endpoint: conn.endpoint,
            payload: this.maskSensitiveData(conn.payload)
          }
        })),
        existingMappings: plan.existingConnections.map(mapping => ({
          linkedServiceName: mapping.linkedServiceName,
          existingConnectionId: mapping.existingConnectionId,
          existingConnectionName: mapping.existingConnectionName,
          connectionType: mapping.connectionType,
          action: 'Map to existing connection'
        }))
      }
    };

    return JSON.stringify(deploymentPlan, null, 2);
  }

  /**
   * Generate human-readable deployment plan
   */
  static generateHumanReadablePlan(linkedServices: LinkedServiceConnection[]): string {
    const plan = this.generateDeploymentPlan(linkedServices);
    const lines: string[] = [];

    lines.push('Fabric Connections Deployment Plan');
    lines.push('======================================');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Total LinkedServices: ${plan.summary.totalConnections}`);
    lines.push(`New Connections: ${plan.summary.totalNew}`);
    lines.push(`Existing Mappings: ${plan.summary.totalMappings}`);
    lines.push('');

    if (plan.newConnections.length > 0) {
      lines.push('NEW CONNECTIONS TO CREATE:');
      lines.push('------------------------');
      plan.newConnections.forEach((conn, index) => {
        lines.push(`${index + 1}. ${conn.linkedServiceName}`);
        lines.push(`   - Connection Type: ${conn.connectionType}`);
        lines.push(`   - Connectivity: ${conn.connectivityType}`);
        lines.push(`   - API Endpoint: POST ${conn.endpoint}`);
        lines.push('');
      });
    }

    if (plan.existingConnections.length > 0) {
      lines.push('EXISTING CONNECTION MAPPINGS:');
      lines.push('---------------------------');
      plan.existingConnections.forEach((mapping, index) => {
        lines.push(`${index + 1}. ${mapping.linkedServiceName}`);
        lines.push(`   - Maps to: ${mapping.existingConnectionName}`);
        lines.push(`   - Connection ID: ${mapping.existingConnectionId}`);
        lines.push(`   - Type: ${mapping.connectionType}`);
        lines.push('');
      });
    }

    return lines.join('\n');
  }

  /**
   * Mask sensitive data in payload for logging/display
   */
  private static maskSensitiveData(payload: any): any {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    const sensitiveFields = [
      'password', 'secret', 'key', 'token', 'connectionString',
      'servicePrincipalSecret', 'clientSecret', 'accessKey'
    ];

    const masked = JSON.parse(JSON.stringify(payload));

    const maskObject = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(maskObject);
      }
      
      if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
            result[key] = '***[MASKED]***';
          } else {
            result[key] = maskObject(value);
          }
        }
        return result;
      }
      
      return obj;
    };

    return maskObject(masked);
  }
}

// Export the service instance
export const connectionDeploymentService = ConnectionDeploymentService;