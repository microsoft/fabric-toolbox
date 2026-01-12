/**
 * Service for managing Fabric connections and their creation
 */

import type { 
  LinkedServiceConnection, 
  ExistingFabricConnection,
  APIRequestDetails,
  SupportedConnectionType
} from '../types';

export interface FabricConnectionResult {
  success: boolean;
  connectionId?: string;
  connectionName?: string;  // NEW: Display name from Fabric API
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
    linkedService: LinkedServiceConnection,
    supportedConnectionTypes?: SupportedConnectionType[]
  ): Promise<FabricConnectionResult> {
    try {
      // Find creation method name from supportedConnectionTypes
      let creationMethodName: string | undefined;
      
      if (supportedConnectionTypes && linkedService.selectedConnectionType) {
        const connectionType = supportedConnectionTypes.find(
          ct => ct.type === linkedService.selectedConnectionType
        );
        creationMethodName = connectionType?.creationMethods?.[0]?.name;
      }
      
      const payload = this.buildConnectionPayload(linkedService, creationMethodName);
      
      // NEW: Validate parameters against schema BEFORE API call
      if (supportedConnectionTypes && linkedService.selectedConnectionType) {
        const connectionType = supportedConnectionTypes.find(
          ct => ct.type === linkedService.selectedConnectionType
        );
        
        if (connectionType?.creationMethods && connectionType.creationMethods.length > 0) {
          const creationMethod = connectionType.creationMethods[0];
          if (creationMethod?.parameters && payload.connectionDetails?.parameters) {
            // Convert parameters array to Record for validation
            const parametersRecord: Record<string, any> = {};
            payload.connectionDetails.parameters.forEach((p: any) => {
              parametersRecord[p.name] = p.value;
            });
            
            const validationErrors = this.validatePayloadParameters(
              parametersRecord,
              creationMethod.parameters
            );
            
            if (validationErrors.length > 0) {
              console.error(`❌ Parameter validation failed for ${payload.displayName}:`, validationErrors);
              return {
                success: false,
                error: 'Parameter validation failed',
                errorDetails: validationErrors,
                apiRequestDetails: {
                  method: 'POST',
                  endpoint: `${this.baseUrl}/connections`,
                  payload: this.maskSensitiveData(payload),
                  headers: { 'Authorization': 'Bearer [REDACTED]', 'Content-Type': 'application/json' },
                  validationErrors: validationErrors  // NEW: Capture validation errors
                }
              };
            } else {
              console.log(`✓ Parameter validation passed for ${payload.displayName}`);
            }
          }
        }
      }
      
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

      // Capture connection name from API response
      const connectionName = responseData.displayName || payload.displayName || 'Unknown';

      console.log(`✓ Fabric API returned connection:`, {
        id: responseData.id,
        displayName: responseData.displayName,
        payloadName: payload.displayName,
        capturedName: connectionName,
        hasDisplayName: !!responseData.displayName
      });

      return {
        success: true,
        connectionId: responseData.id,
        connectionName: connectionName,  // NEW: Captured from API response
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
   * Validates connection payload parameters against schema
   * Returns array of validation error messages (empty if valid)
   */
  private validatePayloadParameters(
    parameters: Record<string, any>,
    schemaParameters: Array<{ name: string; required?: boolean }>
  ): string[] {
    const errors: string[] = [];
    const schemaParamNames = new Set(schemaParameters.map(p => p.name));
    
    // Check for unexpected parameters (not in schema)
    Object.keys(parameters).forEach(paramName => {
      if (!schemaParamNames.has(paramName)) {
        errors.push(`Unexpected parameter '${paramName}' not in schema`);
      }
    });
    
    // Check for missing or empty required parameters
    schemaParameters.forEach(schemaParam => {
      if (schemaParam.required && (!parameters[schemaParam.name] || 
          (typeof parameters[schemaParam.name] === 'string' && parameters[schemaParam.name].trim() === ''))) {
        errors.push(`Required parameter '${schemaParam.name}' is missing or empty`);
      }
    });
    
    return errors;
  }

  /**
   * Build connection payload for Fabric API
   */
  buildConnectionPayload(
    linkedService: LinkedServiceConnection,
    creationMethodName?: string
  ): any {
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
      creationMethod: creationMethodName || linkedService.selectedConnectionType,
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

    // FabricDataPipelines should have empty parameters array
    if (linkedService.selectedConnectionType === 'FabricDataPipelines' && 
        payload.connectionDetails.parameters.length > 0) {
      console.warn('[Payload] FabricDataPipelines should not have connection parameters, clearing:', 
        payload.connectionDetails.parameters);
      payload.connectionDetails.parameters = [];
    }

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
    // Early return for credential types that don't need additional properties
    if (credentialType === 'WorkspaceIdentity' || credentialType === 'WindowsWithoutImpersonation') {
      console.log('[Credentials] Using credential type without additional properties:', credentialType);
      return { credentialType };
    }

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