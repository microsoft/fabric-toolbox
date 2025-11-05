import { 
  LinkedServiceConnection, 
  ConnectionCreationMethod,
  CredentialType,
  CredentialField,
  ConnectionDeploymentResult,
  APIRequestDetails,
  FabricGateway,
  SupportedConnectionType
} from '../types';

interface FabricGatewaysResponse {
  value: FabricGateway[];
}

interface FabricSupportedConnectionTypesResponse {
  value: SupportedConnectionType[];
}

// Credential types for the Fabric API
interface AnonymousCredentials {
  credentialType: 'Anonymous';
}

interface BasicCredentials {
  credentialType: 'Basic';
  username: string;
  password: string;
}

interface OAuth2Credentials {
  credentialType: 'OAuth2';
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
}

interface ServicePrincipalCredentials {
  credentialType: 'ServicePrincipal';
  servicePrincipalClientId: string;
  servicePrincipalSecret: string;
  tenantId: string;
}

interface WorkspaceIdentityCredentials {
  credentialType: 'WorkspaceIdentity';
}

interface KeyCredentials {
  credentialType: 'Key';
  key: string;
}

interface SharedAccessSignatureCredentials {
  credentialType: 'SharedAccessSignature';
  token: string;
}

interface WindowsCredentials {
  credentialType: 'Windows';
  username: string;
  password: string;
}

interface WindowsWithoutImpersonationCredentials {
  credentialType: 'WindowsWithoutImpersonation';
}

type FabricCredentials = 
  | AnonymousCredentials 
  | BasicCredentials 
  | OAuth2Credentials 
  | ServicePrincipalCredentials 
  | WorkspaceIdentityCredentials 
  | KeyCredentials 
  | SharedAccessSignatureCredentials 
  | WindowsCredentials 
  | WindowsWithoutImpersonationCredentials;

interface CreateConnectionRequest {
  displayName: string;
  description?: string;
  connectivityType: 'ShareableCloud' | 'OnPremisesGateway' | 'VirtualNetworkGateway';
  connectionDetails: {
    type: string;
    creationMethod: string;
    parameters: Array<{ name: string; value: any; dataType: string }>;
  };
  credentialDetails: {
    singleSignOnType: 'None' | 'AAD' | string;
    connectionEncryption: 'NotEncrypted' | 'Encrypted';
    credentials: FabricCredentials;
  };
  privacyLevel?: 'Public' | 'Organizational' | 'Private';
  gatewayId?: string;
  virtualNetworkGatewayId?: string;
  skipTestConnection?: boolean;
}

class LinkedServiceConnectionService {
  private baseUrl = 'https://api.fabric.microsoft.com/v1';

  /**
   * Get available gateways from Fabric API
   */
  async getAvailableGateways(accessToken: string): Promise<FabricGateway[]> {
    try {
      const response = await fetch(`${this.baseUrl}/gateways`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn(`Failed to fetch gateways: ${response.status} ${response.statusText}`);
        return [];
      }

      const data: FabricGatewaysResponse = await response.json();
      return data.value || [];
    } catch (error) {
      console.error('Error fetching gateways:', error);
      return [];
    }
  }

  /**
   * Get supported connection types, optionally filtered by gateway
   */
  async getSupportedConnectionTypes(
    accessToken: string, 
    gatewayId?: string
  ): Promise<SupportedConnectionType[]> {
    try {
      let endpoint = `${this.baseUrl}/connections/supportedConnectionTypes?showAllCreationMethods=true`;
      if (gatewayId) {
        endpoint += `&gatewayId=${encodeURIComponent(gatewayId)}`;
      }

      console.log('Fetching supported connection types from:', endpoint); // Debug log

      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Failed to fetch supported connection types: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`API Error ${response.status}: ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
      }

      const data: FabricSupportedConnectionTypesResponse = await response.json();
      console.log('Raw API response:', data); // Debug log
      
      // Transform API response to match expected interface
      const transformedTypes = (data.value || []).map(apiType => {
        const transformed: SupportedConnectionType = {
          type: apiType.type,
          displayName: apiType.displayName || apiType.type, // Use type as fallback for displayName
          description: apiType.description,
          creationMethods: (apiType.creationMethods || []).map(method => ({
            name: method.name,
            displayName: method.displayName || method.name,
            description: method.description,
            parameters: (method.parameters || []).map(param => ({
              name: param.name,
              displayName: param.displayName || param.name,
              type: this.mapDataTypeToType(param.dataType),
              dataType: param.dataType,
              required: param.required,
              description: param.description,
              defaultValue: param.defaultValue,
              allowedValues: param.allowedValues
            })),
            credentialTypes: this.transformCredentialTypes(apiType.supportedCredentialTypes || []),
            supportsSkipTestConnection: apiType.supportsSkipTestConnection || false
          })),
          supportedCredentialTypes: apiType.supportedCredentialTypes,
          supportedConnectionEncryptionTypes: apiType.supportedConnectionEncryptionTypes,
          supportsSkipTestConnection: apiType.supportsSkipTestConnection,
          // Add backwards compatibility property
          connectionType: apiType.type
        };
        return transformed;
      });
      
      // Always add FabricDataPipelines connection type for ExecutePipeline activities
      // This ensures it's available even if not returned by the API
      const hasFabricDataPipelines = transformedTypes.some(type => type.type === 'FabricDataPipelines');
      if (!hasFabricDataPipelines) {
        const fabricDataPipelinesType: SupportedConnectionType = {
          type: 'FabricDataPipelines',
          displayName: 'Fabric Data Pipelines',
          description: 'Connection for executing other Fabric Data Pipelines',
          creationMethods: [{
            name: 'FabricDataPipelines.Actions',
            displayName: 'Fabric Data Pipelines Actions',
            description: 'Execute Fabric Data Pipeline activities',
            parameters: [],
            credentialTypes: this.transformCredentialTypes(['OAuth2', 'ServicePrincipal', 'WorkspaceIdentity']),
            supportsSkipTestConnection: false
          }],
          supportedCredentialTypes: ['OAuth2', 'ServicePrincipal', 'WorkspaceIdentity'],
          supportedConnectionEncryptionTypes: ['NotEncrypted'],
          supportsSkipTestConnection: false,
          connectionType: 'FabricDataPipelines'
        };
        transformedTypes.push(fabricDataPipelinesType);
        console.log('Added FabricDataPipelines connection type for ExecutePipeline activities');
      }
      
      console.log('Transformed connection types:', transformedTypes); // Debug log
      
      return transformedTypes;
    } catch (error) {
      console.error('Error fetching supported connection types:', error);
      throw error; // Re-throw to allow caller to handle
    }
  }

  /**
   * Map API dataType to our type system
   */
  private mapDataTypeToType(dataType?: string): 'string' | 'number' | 'boolean' {
    if (!dataType) return 'string';
    
    switch (dataType.toLowerCase()) {
      case 'number':
      case 'int':
      case 'integer':
        return 'number';
      case 'boolean':
      case 'bool':
        return 'boolean';
      default:
        return 'string';
    }
  }

  /**
   * Transform credential types from API response
   */
  private transformCredentialTypes(supportedTypes: string[]): CredentialType[] {
    return supportedTypes.map(type => ({
      credentialType: type,
      displayName: type.replace(/([A-Z])/g, ' $1').trim(), // Convert camelCase to readable text
      fields: this.getCredentialFieldsForType(type)
    }));
  }

  /**
   * Get credential fields for a specific credential type
   */
  private getCredentialFieldsForType(credentialType: string): CredentialField[] {
    switch (credentialType) {
      case 'Basic':
        return [
          {
            name: 'username',
            displayName: 'Username',
            type: 'string',
            required: true,
            sensitive: false,
            description: 'Username for authentication'
          },
          {
            name: 'password',
            displayName: 'Password',
            type: 'password',
            required: true,
            sensitive: true,
            description: 'Password for authentication'
          }
        ];
      case 'OAuth2':
        return [
          {
            name: 'clientId',
            displayName: 'Client ID',
            type: 'string',
            required: true,
            sensitive: false,
            description: 'OAuth2 client identifier'
          },
          {
            name: 'clientSecret',
            displayName: 'Client Secret',
            type: 'password',
            required: true,
            sensitive: true,
            description: 'OAuth2 client secret'
          },
          {
            name: 'tenantId',
            displayName: 'Tenant ID',
            type: 'string',
            required: false,
            sensitive: false,
            description: 'Azure AD tenant identifier'
          }
        ];
      case 'ServicePrincipal':
        return [
          {
            name: 'servicePrincipalId',
            displayName: 'Service Principal ID',
            type: 'string',
            required: true,
            sensitive: false,
            description: 'Service principal application ID'
          },
          {
            name: 'servicePrincipalKey',
            displayName: 'Service Principal Key',
            type: 'password',
            required: true,
            sensitive: true,
            description: 'Service principal secret key'
          },
          {
            name: 'tenantId',
            displayName: 'Tenant ID',
            type: 'string',
            required: true,
            sensitive: false,
            description: 'Azure AD tenant identifier'
          }
        ];
      case 'WorkspaceIdentity':
        return []; // Workspace identity doesn't require additional fields
      default:
        return [
          {
            name: 'credentials',
            displayName: 'Credentials',
            type: 'string',
            required: true,
            sensitive: true,
            description: `Credentials for ${credentialType} authentication`
          }
        ];
    }
  }

  /**
   * Create a connection in Fabric
   */
  async createConnection(
    linkedService: LinkedServiceConnection,
    supportedConnectionTypes: SupportedConnectionType[],
    accessToken: string
  ): Promise<ConnectionDeploymentResult> {
    const endpoint = `${this.baseUrl}/connections`;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

    try {
      // Find the selected connection type details to get parameter schema
      const connectionTypeDetails = supportedConnectionTypes.find(
        ct => ct.type === linkedService.selectedConnectionType
      );

      // Find the creation method to get parameter dataType information
      const creationMethod = connectionTypeDetails?.creationMethods?.[0]; // Use first creation method as default
      
      // Build parameters with correct dataType from schema
      const parameters = this.buildParametersWithDataType(
        linkedService.connectionParameters, 
        creationMethod
      );

      // Build the connection request payload
      const connectionRequest: CreateConnectionRequest = {
        displayName: linkedService.linkedServiceName,
        description: `Migrated from ADF LinkedService: ${linkedService.linkedServiceName}`,
        connectivityType: linkedService.selectedConnectivityType || 'ShareableCloud',
        connectionDetails: {
          type: linkedService.selectedConnectionType || 'Generic',
          creationMethod: linkedService.selectedConnectionType || 'Generic',
          parameters
        },
        credentialDetails: {
          singleSignOnType: 'None',
          connectionEncryption: 'NotEncrypted',
          credentials: this.buildCredentials(linkedService.credentialType || 'Basic', linkedService.credentials)
        },
        privacyLevel: this.getPrivacyLevel(linkedService.selectedConnectivityType)
      };

      // Only include skipTestConnection if it's supported and enabled
      if (linkedService.skipTestConnection) {
        connectionRequest.skipTestConnection = true;
      }

      // Add gateway IDs if applicable
      if (linkedService.selectedConnectivityType === 'OnPremisesGateway' && linkedService.selectedGatewayId) {
        connectionRequest.gatewayId = linkedService.selectedGatewayId;
      } else if (linkedService.selectedConnectivityType === 'VirtualNetworkGateway' && linkedService.selectedGatewayId) {
        connectionRequest.virtualNetworkGatewayId = linkedService.selectedGatewayId;
      }

      // Validate payload for masked values before sending
      this.validatePayloadHasNoMaskedValues(connectionRequest);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(connectionRequest)
      });

      const apiRequestDetails: APIRequestDetails = {
        method: 'POST',
        endpoint,
        payload: this.maskSensitiveData(connectionRequest),
        headers: this.maskSensitiveData(headers)
      };

      if (!response.ok) {
        let errorMessage = `${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            const errorDetail = typeof errorData.error === 'string' 
              ? errorData.error 
              : errorData.error.message || JSON.stringify(errorData.error);
            errorMessage = `${errorMessage}: ${errorDetail}`;
          }
        } catch {
          // If we can't parse the error response, use the status text
        }

        return {
          linkedServiceName: linkedService.linkedServiceName,
          status: 'failed',
          errorMessage,
          apiRequestDetails
        };
      }

      const result = await response.json();
      
      return {
        linkedServiceName: linkedService.linkedServiceName,
        status: 'success',
        fabricConnectionId: result.id,
        apiRequestDetails
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error creating connection';
      
      return {
        linkedServiceName: linkedService.linkedServiceName,
        status: 'failed',
        errorMessage,
        apiRequestDetails: {
          method: 'POST',
          endpoint,
          payload: this.maskSensitiveData(linkedService),
          headers: this.maskSensitiveData(headers)
        }
      };
    }
  }

  /**
   * Build parameters with correct dataType from creation method schema
   */
  private buildParametersWithDataType(
    connectionParameters: Record<string, any>,
    creationMethod?: ConnectionCreationMethod
  ): Array<{ name: string; value: any; dataType: string }> {
    const parameters: Array<{ name: string; value: any; dataType: string }> = [];

    // Use the creation method's parameter schema if available
    if (creationMethod?.parameters) {
      // Process parameters based on the schema
      for (const schemaParam of creationMethod.parameters) {
        const value = connectionParameters[schemaParam.name];
        if (value !== undefined) {
          parameters.push({
            name: schemaParam.name,
            value,
            dataType: schemaParam.dataType || 'Text' // Use API-provided dataType or default to 'Text'
          });
        }
      }
    } else {
      // Fallback: process all connection parameters with default dataType
      for (const [name, value] of Object.entries(connectionParameters)) {
        parameters.push({
          name,
          value,
          dataType: this.inferDataTypeFromValue(value)
        });
      }
    }

    return parameters;
  }

  /**
   * Infer dataType from parameter value when schema is not available
   */
  private inferDataTypeFromValue(value: any): string {
    if (typeof value === 'boolean') {
      return 'Boolean';
    } else if (typeof value === 'number') {
      return 'Number';
    } else if (typeof value === 'string') {
      // Check if it might be a password field
      const lowerValue = value.toLowerCase();
      if (lowerValue.includes('password') || lowerValue.includes('secret') || lowerValue.includes('key')) {
        return 'Password';
      }
      return 'Text';
    } else {
      return 'Text'; // Default fallback
    }
  }
  private buildCredentials(credentialType: string, credentialsData: Record<string, any>): FabricCredentials {
    // Validate no masked values are in the payload
    const maskedSentinels = ['***MASKED***', '***'];
    const validateCredentialsData = (data: any): void => {
      if (typeof data === 'string' && maskedSentinels.includes(data)) {
        throw new Error('Masked credentials detected in payload - this should never happen');
      }
      if (data && typeof data === 'object') {
        Object.values(data).forEach(validateCredentialsData);
      }
    };
    
    validateCredentialsData(credentialsData);

    switch (credentialType) {
      case 'Anonymous':
        return { credentialType: 'Anonymous' };
        
      case 'Basic':
        return {
          credentialType: 'Basic',
          username: credentialsData.username || '',
          password: credentialsData.password || ''
        };
        
      case 'OAuth2':
        return {
          credentialType: 'OAuth2',
          clientId: credentialsData.clientId,
          clientSecret: credentialsData.clientSecret,
          tenantId: credentialsData.tenantId
        };
        
      case 'ServicePrincipal':
        return {
          credentialType: 'ServicePrincipal',
          servicePrincipalClientId: credentialsData.servicePrincipalClientId || credentialsData.clientId || '',
          servicePrincipalSecret: credentialsData.servicePrincipalSecret || credentialsData.clientSecret || '',
          tenantId: credentialsData.tenantId || ''
        };
        
      case 'WorkspaceIdentity':
        return { credentialType: 'WorkspaceIdentity' };
        
      case 'Key':
        return {
          credentialType: 'Key',
          key: credentialsData.key || ''
        };
        
      case 'SharedAccessSignature':
        return {
          credentialType: 'SharedAccessSignature',
          token: credentialsData.token || ''
        };
        
      case 'Windows':
        return {
          credentialType: 'Windows',
          username: credentialsData.username || '',
          password: credentialsData.password || ''
        };
        
      case 'WindowsWithoutImpersonation':
        return { credentialType: 'WindowsWithoutImpersonation' };
        
      default:
        // Fallback to Basic for unknown types
        console.warn(`Unknown credential type ${credentialType}, defaulting to Basic`);
        return {
          credentialType: 'Basic',
          username: credentialsData.username || '',
          password: credentialsData.password || ''
        };
    }
  }

  /**
   * Validate that no masked values are present in the payload before sending
   */
  private validatePayloadHasNoMaskedValues(payload: any): void {
    const maskedSentinels = ['***MASKED***', '***'];
    
    const checkForMaskedValues = (obj: any, path: string = ''): void => {
      if (typeof obj === 'string' && maskedSentinels.includes(obj)) {
        throw new Error(`Masked value found at ${path}: ${obj}. This indicates a bug in credential processing.`);
      }
      
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          checkForMaskedValues(item, `${path}[${index}]`);
        });
      } else if (obj && typeof obj === 'object') {
        Object.entries(obj).forEach(([key, value]) => {
          checkForMaskedValues(value, path ? `${path}.${key}` : key);
        });
      }
    };
    
    checkForMaskedValues(payload);
  }
  private getPrivacyLevel(connectivityType?: string | null): 'Public' | 'Organizational' | 'Private' {
    switch (connectivityType) {
      case 'ShareableCloud':
        return 'Public';
      case 'OnPremisesGateway':
        return 'Organizational';
      case 'VirtualNetworkGateway':
        return 'Private';
      default:
        return 'Public';
    }
  }

  /**
   * Extract LinkedServices from ADF components
   */
  extractLinkedServices(adfComponents: any[]): LinkedServiceConnection[] {
    // Get regular LinkedServices
    const regularLinkedServices = adfComponents
      .filter(component => component.type === 'linkedService')
      .map(component => ({
        linkedServiceName: component.name,
        linkedServiceType: component.definition?.properties?.type || 'Unknown',
        linkedServiceDefinition: component.definition || {},
        mappingMode: 'new' as const,
        existingConnectionId: undefined,
        existingConnection: undefined,
        selectedConnectivityType: null,
        selectedGatewayId: undefined,
        selectedConnectionType: undefined,
        connectionParameters: {},
        credentialType: undefined,
        credentials: {},
        skipTestConnection: false,
        status: 'pending' as const,
        validationErrors: []
      }));

    // Get FabricDataPipelines connections for ExecutePipeline activities
    const executePipelineConnections: LinkedServiceConnection[] = [];
    
    adfComponents
      .filter(component => component.type === 'pipeline')
      .forEach(pipeline => {
        const activities = pipeline.definition?.properties?.activities || [];
        activities.forEach((activity: any) => {
          if (activity.type === 'ExecutePipeline') {
            const targetPipelineName = activity.typeProperties?.pipeline?.referenceName;
            if (targetPipelineName) {
              // Create a FabricDataPipelines connection for this ExecutePipeline activity
              const connectionName = `${pipeline.name}_${activity.name}_FabricDataPipeline`;
              executePipelineConnections.push({
                linkedServiceName: connectionName,
                linkedServiceType: 'FabricDataPipelines',
                linkedServiceDefinition: {
                  type: 'FabricDataPipelines',
                  parentPipeline: pipeline.name,
                  activityName: activity.name,
                  targetPipelineName: targetPipelineName,
                  waitOnCompletion: activity.typeProperties?.waitOnCompletion !== false,
                  parameters: activity.typeProperties?.parameters || {}
                },
                mappingMode: 'new' as const,
                existingConnectionId: undefined,
                existingConnection: undefined,
                selectedConnectivityType: 'ShareableCloud' as const, // FabricDataPipelines is always cloud
                selectedGatewayId: undefined,
                selectedConnectionType: 'FabricDataPipelines',
                connectionParameters: {},
                credentialType: 'WorkspaceIdentity', // FabricDataPipelines uses workspace identity
                credentials: {},
                skipTestConnection: false,
                status: 'pending' as const,
                validationErrors: []
              });
            }
          }
        });
      });

    console.log(`Found ${regularLinkedServices.length} regular LinkedServices and ${executePipelineConnections.length} FabricDataPipelines connections`);
    
    return [...regularLinkedServices, ...executePipelineConnections];
  }

  /**
   * Auto-map connection parameters from ADF LinkedService definition
   */
  autoMapConnectionParameters(
    linkedServiceConnection: LinkedServiceConnection,
    connectionTypeDetails: SupportedConnectionType,
    creationMethodName: string
  ): Record<string, any> {
    const parameters: Record<string, any> = {};
    const typeProps = linkedServiceConnection.linkedServiceDefinition?.properties?.typeProperties || {};

    // Find the creation method
    const creationMethod = connectionTypeDetails.creationMethods?.find(m => m.name === creationMethodName);
    
    // Map parameters based on creation method requirements
    if (creationMethod?.parameters) {
      for (const param of creationMethod.parameters) {
        // Try to map from ADF type properties
        const value = typeProps[param.name] || 
                     typeProps[param.name.toLowerCase()] ||
                     this.findSimilarProperty(typeProps, param.name);
        
        if (value !== undefined) {
          parameters[param.name] = value;
        } else if (param.defaultValue !== undefined) {
          parameters[param.name] = param.defaultValue;
        }
      }
    }

    // Common parameter mappings
    if (typeProps.server) parameters.server = typeProps.server;
    if (typeProps.serverName) parameters.serverName = typeProps.serverName;
    if (typeProps.host) parameters.host = typeProps.host;
    if (typeProps.database) parameters.database = typeProps.database;
    if (typeProps.databaseName) parameters.databaseName = typeProps.databaseName;
    if (typeProps.connectionString) parameters.connectionString = typeProps.connectionString;
    if (typeProps.serviceUri) parameters.serviceUri = typeProps.serviceUri;
    if (typeProps.endpoint) parameters.endpoint = typeProps.endpoint;
    if (typeProps.url) parameters.url = typeProps.url;
    if (typeProps.port) parameters.port = typeProps.port;
    if (typeProps.username) parameters.username = typeProps.username;
    if (typeProps.userId) parameters.userId = typeProps.userId;

    return parameters;
  }

  /**
   * Find similar property in type properties (case-insensitive and pattern matching)
   */
  private findSimilarProperty(typeProps: Record<string, any>, targetName: string): any {
    const lowerTarget = targetName.toLowerCase();
    
    // Direct match
    if (typeProps[lowerTarget]) return typeProps[lowerTarget];
    
    // Pattern matching for common variations
    const patterns = [
      { pattern: /server/i, alternatives: ['host', 'hostname', 'serverName'] },
      { pattern: /database/i, alternatives: ['db', 'databaseName', 'catalog'] },
      { pattern: /user/i, alternatives: ['username', 'userId', 'user'] },
      { pattern: /port/i, alternatives: ['portNumber', 'tcpPort'] }
    ];
    
    for (const { pattern, alternatives } of patterns) {
      if (pattern.test(targetName)) {
        for (const alt of alternatives) {
          if (typeProps[alt]) return typeProps[alt];
        }
      }
    }
    
    return undefined;
  }

  /**
   * Validate connection parameters
   */
  validateConnectionParameters(
    parameters: Record<string, any>,
    creationMethod: ConnectionCreationMethod
  ): string[] {
    const errors: string[] = [];

    // Validate based on creation method requirements
    if (creationMethod.parameters) {
      for (const param of creationMethod.parameters) {
        if (param.required && (!parameters[param.name] || 
          (typeof parameters[param.name] === 'string' && parameters[param.name].trim() === ''))) {
          errors.push(`${param.displayName || param.name} is required`);
        }
      }
    }

    return errors;
  }

  /**
   * Validate credentials based on credential type
   */
  validateCredentials(
    credentials: Record<string, any>,
    credentialType: string
  ): string[] {
    const errors: string[] = [];

    switch (credentialType) {
      case 'Anonymous':
      case 'WorkspaceIdentity':
      case 'WindowsWithoutImpersonation':
        // No validation needed for these types
        break;
        
      case 'Basic':
      case 'Windows':
        if (!credentials.username) {
          errors.push('Username is required');
        }
        if (!credentials.password) {
          errors.push('Password is required');
        }
        break;
        
      case 'ServicePrincipal':
        if (!credentials.servicePrincipalClientId) {
          errors.push('Service Principal Client ID is required');
        }
        if (!credentials.servicePrincipalSecret) {
          errors.push('Service Principal Secret is required');
        }
        if (!credentials.tenantId) {
          errors.push('Tenant ID is required');
        }
        break;
        
      case 'OAuth2':
        if (!credentials.clientId) {
          errors.push('OAuth2 Client ID is required');
        }
        if (!credentials.clientSecret) {
          errors.push('OAuth2 Client Secret is required');
        }
        break;
        
      case 'Key':
        if (!credentials.key) {
          errors.push('Key is required');
        }
        break;
        
      case 'SharedAccessSignature':
        if (!credentials.token) {
          errors.push('SAS Token is required');
        }
        break;
        
      default:
        errors.push(`Unknown credential type: ${credentialType}`);
    }

    return errors;
  }

  /**
   * Fetch gateways (alias for getAvailableGateways)
   */
  async fetchGateways(accessToken: string): Promise<FabricGateway[]> {
    return this.getAvailableGateways(accessToken);
  }

  /**
   * Fetch supported connection types (alias for getSupportedConnectionTypes)
   */
  async fetchSupportedConnectionTypes(
    accessToken: string,
    gatewayId?: string
  ): Promise<SupportedConnectionType[]> {
    return this.getSupportedConnectionTypes(accessToken, gatewayId);
  }

  /**
   * Generate deployment plan for connections
   */
  generateConnectionDeploymentPlan(
    linkedServices: LinkedServiceConnection[]
  ): string {
    const plan = {
      timestamp: new Date().toISOString(),
      connectionCount: linkedServices.length,
      connections: linkedServices.map(ls => ({
        linkedServiceName: ls.linkedServiceName,
        connectivityType: ls.selectedConnectivityType,
        connectionType: ls.selectedConnectionType,
        gatewayId: ls.selectedGatewayId,
        hasCredentials: Object.keys(ls.credentials).length > 0,
        skipTestConnection: ls.skipTestConnection,
        apiCall: {
          method: 'POST',
          endpoint: `${this.baseUrl}/connections`,
          payload: {
            displayName: ls.linkedServiceName,
            description: `Migrated from ADF LinkedService: ${ls.linkedServiceName}`,
            connectivityType: ls.selectedConnectivityType,
            connectionDetails: {
              type: ls.selectedConnectionType,
              creationMethod: ls.selectedConnectionType,
              parameters: Object.entries(ls.connectionParameters).map(([name, value]) => ({
                name,
                value: typeof value === 'string' && value.includes('password') ? '***MASKED***' : value,
                dataType: this.inferDataTypeFromValue(value) // Include dataType with fallback inference
              }))
            },
            credentialDetails: {
              singleSignOnType: 'None',
              connectionEncryption: 'NotEncrypted',
              credentials: this.maskSensitiveData(this.buildCredentials(ls.credentialType || 'Basic', ls.credentials))
            },
            privacyLevel: this.getPrivacyLevel(ls.selectedConnectivityType),
            ...(ls.skipTestConnection && { skipTestConnection: true }),
            ...(ls.selectedConnectivityType === 'OnPremisesGateway' && ls.selectedGatewayId && { gatewayId: ls.selectedGatewayId }),
            ...(ls.selectedConnectivityType === 'VirtualNetworkGateway' && ls.selectedGatewayId && { virtualNetworkGatewayId: ls.selectedGatewayId })
          }
        }
      }))
    };

    return JSON.stringify(plan, null, 2);
  }

  /**
   * Mask sensitive data for logging/display
   */
  private maskSensitiveData(data: any): any {
    if (!data || typeof data !== 'object') return data;

    const masked = { ...data };
    const sensitiveKeys = [
      'password', 'secret', 'key', 'token', 'connectionString',
      'Authorization', 'accessToken', 'clientSecret', 'credentials'
    ];

    const maskValue = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(maskValue);
      }
      if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          const lowerKey = key.toLowerCase();
          if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive.toLowerCase()))) {
            result[key] = typeof value === 'string' ? '***MASKED***' : '***';
          } else {
            result[key] = maskValue(value);
          }
        }
        return result;
      }
      return obj;
    };

    return maskValue(masked);
  }

  /**
   * Validate connection configuration
   */
  validateConnection(linkedService: LinkedServiceConnection): string[] {
    const errors: string[] = [];

    if (!linkedService.selectedConnectivityType) {
      errors.push('Connectivity type must be selected');
    }

    if (!linkedService.selectedConnectionType) {
      errors.push('Connection type must be selected');
    }

    if (linkedService.selectedConnectivityType !== 'ShareableCloud' && !linkedService.selectedGatewayId) {
      errors.push('Gateway must be selected for on-premises or virtual network connections');
    }

    if (!linkedService.credentialType) {
      errors.push('Credential type must be selected');
    }

    // Validate required connection parameters
    const requiredParams = ['server', 'database']; // This would be dynamic based on connection type
    for (const param of requiredParams) {
      if (!linkedService.connectionParameters[param]) {
        errors.push(`Required parameter ${param} is missing`);
      }
    }

    return errors;
  }
}

export const linkedServiceConnectionService = new LinkedServiceConnectionService();