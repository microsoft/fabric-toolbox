/**
 * Service for managing Fabric connections and their creation
 */

import type { 
  LinkedServiceConnection, 
  ExistingFabricConnection,
  APIRequestDetails 
} from '../types';

export interface FabricConnectionResult {
  success: boolean;
  connectionId?: string;
  error?: string;
  apiRequestDetails?: APIRequestDetails;
}

export interface FabricConnectionsResponse {
  value: ExistingFabricConnection[];
  continuationToken?: string;
  continuationUri?: string;
}

export class FabricConnectionsService {
  private readonly baseUrl = 'https://api.fabric.microsoft.com/v1';

  /**
   * Create a new Fabric connection
   */
  async createConnection(
    accessToken: string,
    linkedService: LinkedServiceConnection
  ): Promise<FabricConnectionResult> {
    try {
      const payload = this.buildConnectionPayload(linkedService);
      
      const response = await fetch(`${this.baseUrl}/connections`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseData = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to create connection: ${response.status} ${response.statusText}`,
          apiRequestDetails: {
            method: 'POST',
            endpoint: `${this.baseUrl}/connections`,
            payload: this.maskSensitiveData(payload)
          }
        };
      }

      return {
        success: true,
        connectionId: responseData.id,
        apiRequestDetails: {
          method: 'POST',
          endpoint: `${this.baseUrl}/connections`,
          payload: this.maskSensitiveData(payload)
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        apiRequestDetails: {
          method: 'POST',
          endpoint: `${this.baseUrl}/connections`,
          payload: {}
        }
      };
    }
  }

  /**
   * Build connection payload for Fabric API
   */
  buildConnectionPayload(linkedService: LinkedServiceConnection): any {
    const payload: any = {
      displayName: linkedService.linkedServiceName,
      description: `Migrated from ADF LinkedService: ${linkedService.linkedServiceName}`,
      connectivityType: linkedService.selectedConnectivityType || 'ShareableCloud'
    };

    // Add gateway ID if using gateway
    if (linkedService.selectedGatewayId && 
        linkedService.selectedConnectivityType !== 'ShareableCloud') {
      payload.gatewayId = linkedService.selectedGatewayId;
    }

    // Build connection details
    payload.connectionDetails = {
      type: linkedService.selectedConnectionType,
      creationMethod: linkedService.selectedConnectionType, // Default to same as type
      parameters: []
    };

    // Add parameters with dataType
    Object.entries(linkedService.connectionParameters || {}).forEach(([name, value]) => {
      payload.connectionDetails.parameters.push({
        dataType: 'Text', // Default dataType, should be from metadata
        name,
        value: String(value)
      });
    });

    // Build credential details
    payload.credentialDetails = {
      singleSignOnType: 'None',
      connectionEncryption: 'NotEncrypted'
    };

    // Build credentials based on type
    if (linkedService.credentialType) {
      payload.credentialDetails.credentials = this.buildCredentials(
        linkedService.credentialType,
        linkedService.credentials || {}
      );
    }

    // Add skip test connection if supported
    if (linkedService.skipTestConnection) {
      payload.credentialDetails.skipTestConnection = true;
    }

    // Set privacy level
    payload.privacyLevel = 'Organizational';

    return payload;
  }

  /**
   * Build credentials object based on credential type
   */
  private buildCredentials(credentialType: string, credentials: Record<string, any>): any {
    const credentialsObj: any = {
      credentialType
    };

    switch (credentialType) {
      case 'Anonymous':
        // No additional properties needed
        break;

      case 'Basic':
        credentialsObj.username = credentials.username || '';
        credentialsObj.password = credentials.password || '';
        break;

      case 'ServicePrincipal':
        credentialsObj.servicePrincipalClientId = credentials.servicePrincipalClientId || '';
        credentialsObj.servicePrincipalSecret = credentials.servicePrincipalSecret || '';
        credentialsObj.tenantId = credentials.tenantId || '';
        break;

      case 'OAuth2':
        credentialsObj.clientId = credentials.clientId || '';
        credentialsObj.clientSecret = credentials.clientSecret || '';
        if (credentials.tenantId) {
          credentialsObj.tenantId = credentials.tenantId;
        }
        break;

      case 'Key':
        credentialsObj.key = credentials.key || '';
        break;

      case 'SharedAccessSignature':
        credentialsObj.token = credentials.token || '';
        break;

      case 'Windows':
        credentialsObj.username = credentials.username || '';
        credentialsObj.password = credentials.password || '';
        break;

      case 'WorkspaceIdentity':
      case 'WindowsWithoutImpersonation':
        // No additional properties needed
        break;

      default:
        console.warn(`Unknown credential type: ${credentialType}`);
        break;
    }

    return credentialsObj;
  }

  /**
   * Mask sensitive data for logging/display
   */
  private maskSensitiveData(payload: any): any {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    const masked = JSON.parse(JSON.stringify(payload));
    
    if (masked.credentialDetails?.credentials) {
      const creds = masked.credentialDetails.credentials;
      if (creds.password) creds.password = '***[MASKED]***';
      if (creds.servicePrincipalSecret) creds.servicePrincipalSecret = '***[MASKED]***';
      if (creds.clientSecret) creds.clientSecret = '***[MASKED]***';
      if (creds.key) creds.key = '***[MASKED]***';
      if (creds.token) creds.token = '***[MASKED]***';
    }

    return masked;
  }
}

// Export singleton instance
export const fabricConnectionsService = new FabricConnectionsService();