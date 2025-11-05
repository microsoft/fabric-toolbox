import { SupportedFabricConnector, FabricConnectorParameter } from '../types';

/**
 * Sample supported connector types for testing
 */
export const sampleSupportedConnectors: SupportedFabricConnector[] = [
  {
    type: 'SQL',
    creationMethods: [
      {
        name: 'Sql',
        parameters: [
          {
            name: 'server',
            dataType: 'Text',
            required: true,
            allowedValues: null,
            description: 'SQL Server hostname or IP address'
          },
          {
            name: 'database',
            dataType: 'Text',
            required: false,
            allowedValues: null,
            description: 'Database name (optional)'
          },
          {
            name: 'port',
            dataType: 'Number',
            required: false,
            allowedValues: null,
            description: 'Port number (default: 1433)'
          }
        ]
      }
    ],
    supportedCredentialTypes: ['Basic', 'OAuth2', 'ServicePrincipal', 'WorkspaceIdentity'],
    supportedConnectionEncryptionTypes: ['NotEncrypted', 'Encrypted'],
    supportsSkipTestConnection: false
  },
  {
    type: 'RestService',
    creationMethods: [
      {
        name: 'RestService',
        parameters: [
          {
            name: 'baseUrl',
            dataType: 'Text',
            required: true,
            allowedValues: null,
            description: 'Base URL for the REST service'
          },
          {
            name: 'authenticationType',
            dataType: 'DropDown',
            required: false,
            allowedValues: ['Anonymous', 'Basic', 'OAuth2'],
            description: 'Authentication method'
          }
        ]
      }
    ],
    supportedCredentialTypes: ['Anonymous', 'Basic', 'OAuth2'],
    supportedConnectionEncryptionTypes: ['NotEncrypted'],
    supportsSkipTestConnection: true
  },
  {
    type: 'AzureBlobs',
    creationMethods: [
      {
        name: 'AzureBlobs',
        parameters: [
          {
            name: 'account',
            dataType: 'Text',
            required: true,
            allowedValues: null,
            description: 'Azure Storage account name'
          },
          {
            name: 'domain',
            dataType: 'Text',
            required: true,
            allowedValues: null,
            description: 'Azure Storage domain'
          }
        ]
      }
    ],
    supportedCredentialTypes: ['Key', 'OAuth2', 'WorkspaceIdentity'],
    supportedConnectionEncryptionTypes: ['NotEncrypted'],
    supportsSkipTestConnection: false
  },
  {
    type: 'Web',
    creationMethods: [
      {
        name: 'Web',
        parameters: [
          {
            name: 'url',
            dataType: 'Text',
            required: true,
            allowedValues: null,
            description: 'Web URL'
          }
        ]
      }
    ],
    supportedCredentialTypes: ['Anonymous', 'Basic', 'OAuth2'],
    supportedConnectionEncryptionTypes: ['NotEncrypted'],
    supportsSkipTestConnection: true
  },
  {
    type: 'SharePoint',
    creationMethods: [
      {
        name: 'SharePointList',
        parameters: [
          {
            name: 'sharePointSiteUrl',
            dataType: 'Text',
            required: true,
            allowedValues: null,
            description: 'SharePoint site URL'
          }
        ]
      }
    ],
    supportedCredentialTypes: ['Anonymous', 'OAuth2', 'ServicePrincipal', 'WorkspaceIdentity'],
    supportedConnectionEncryptionTypes: ['NotEncrypted'],
    supportsSkipTestConnection: false
  }
];

/**
 * Sample ADF linked service definitions for testing
 */
export const sampleADFLinkedServices = {
  sqlServer: {
    name: 'SqlServerLinkedService',
    type: 'linkedService',
    properties: {
      type: 'SqlServer',
      typeProperties: {
        server: 'localhost',
        database: 'TestDB',
        authenticationType: 'SQL',
        username: 'testuser'
      }
    }
  },
  
  restService: {
    name: 'RestLinkedService',
    type: 'linkedService',
    properties: {
      type: 'RestService',
      typeProperties: {
        url: 'https://api.example.com',
        enableServerCertificateValidation: true
      }
    }
  },
  
  azureBlob: {
    name: 'AzureBlobLinkedService',
    type: 'linkedService',
    properties: {
      type: 'AzureBlobStorage',
      typeProperties: {
        serviceUri: 'https://mystorageaccount.blob.core.windows.net'
      }
    }
  },
  
  sharePoint: {
    name: 'SharePointLinkedService',
    type: 'linkedService',
    properties: {
      type: 'SharePointOnlineList',
      typeProperties: {
        siteUrl: 'https://mycompany.sharepoint.com/sites/mysite'
      }
    }
  }
};

/**
 * Test utilities for connector service
 */
export const testUtils = {
  /**
   * Create a mock ADFComponent for testing
   */
  createMockADFComponent: (linkedServiceDef: any, overrides: any = {}) => ({
    name: linkedServiceDef.name,
    type: 'linkedService' as const,
    definition: linkedServiceDef,
    isSelected: true,
    compatibilityStatus: 'supported' as const,
    warnings: [],
    fabricTarget: {
      type: 'connector' as const,
      name: linkedServiceDef.name,
      ...overrides
    }
  }),

  /**
   * Validate that connection details match expected schema
   */
  validateConnectionDetails: (
    connectionDetails: Record<string, any>,
    expectedParameters: FabricConnectorParameter[]
  ): { valid: boolean; missing: string[]; extra: string[] } => {
    const expectedParamNames = expectedParameters.map(p => p.name);
    const actualParamNames = Object.keys(connectionDetails);
    
    const missing = expectedParameters
      .filter(p => p.required && !actualParamNames.includes(p.name))
      .map(p => p.name);
    
    const extra = actualParamNames.filter(name => !expectedParamNames.includes(name));
    
    return {
      valid: missing.length === 0,
      missing,
      extra
    };
  },

  /**
   * Create test authentication state
   */
  createTestAuthState: () => ({
    isAuthenticated: true,
    accessToken: 'test-access-token',
    user: {
      id: 'test-user-id',
      name: 'Test User',
      email: 'test@example.com',
      tenantId: 'test-tenant-id'
    },
    workspaceId: 'test-workspace-id',
    hasContributorAccess: true,
    tokenScopes: {
      connectionReadWrite: true,
      gatewayReadWrite: true,
      itemReadWrite: true,
      hasAllRequiredScopes: true,
      scopes: ['Connection.ReadWrite.All', 'Gateway.ReadWrite.All', 'Item.ReadWrite.All']
    }
  }),

  /**
   * Create test workspace info
   */
  createTestWorkspace: () => ({
    id: 'test-workspace-id',
    name: 'Test Workspace',
    description: 'Test workspace for connector configuration',
    type: 'Workspace',
    hasContributorAccess: true
  })
};

/**
 * Validation helpers for testing the enhanced mapping functionality
 */
export const validationHelpers = {
  /**
   * Check if all required connector configuration fields are present
   */
  validateConnectorConfiguration: (fabricTarget: any) => {
    const errors: string[] = [];
    
    if (!fabricTarget.connectorType) {
      errors.push('Missing connector type');
    }
    
    if (!fabricTarget.connectionDetails) {
      errors.push('Missing connection details');
    }
    
    if (!fabricTarget.privacyLevel) {
      errors.push('Missing privacy level');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  /**
   * Check if connection details match the connector schema
   */
  validateConnectionDetailsSchema: (
    connectorType: string,
    connectionDetails: Record<string, any>,
    supportedConnectors: SupportedFabricConnector[]
  ) => {
    const connector = supportedConnectors.find(c => c.type === connectorType);
    if (!connector) {
      return { isValid: false, errors: [`Connector type ${connectorType} not found`] };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if (connector.creationMethods.length > 0) {
      const method = connector.creationMethods[0];
      const requiredParams = method.parameters.filter(p => p.required);
      
      for (const param of requiredParams) {
        if (!connectionDetails[param.name]) {
          errors.push(`Missing required parameter: ${param.name}`);
        }
      }

      // Type validation
      for (const [key, value] of Object.entries(connectionDetails)) {
        const param = method.parameters.find(p => p.name === key);
        if (param && value !== undefined) {
          const isValidType = validationHelpers.isValidParameterType(value, param.dataType);
          if (!isValidType) {
            warnings.push(`Parameter ${key} may have invalid type for ${param.dataType}`);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  },

  /**
   * Validate parameter type
   */
  isValidParameterType: (value: any, expectedType: string): boolean => {
    switch (expectedType) {
      case 'Text':
      case 'Password':
        return typeof value === 'string';
      case 'Number':
        return typeof value === 'number' && !isNaN(value);
      case 'Boolean':
        return typeof value === 'boolean';
      case 'DropDown':
        return typeof value === 'string'; // Additional validation against allowedValues would be needed
      default:
        return true; // Unknown type, assume valid
    }
  }
};