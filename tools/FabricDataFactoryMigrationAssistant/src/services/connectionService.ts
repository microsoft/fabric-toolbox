import { ADFComponent, DeploymentResult, SupportedConnectionType } from '../types';
import { fabricApiClient } from './fabricApiClient';
import { gatewayService } from './gatewayService';

export class ConnectionService {
  private supportedConnectionTypes: Map<string, SupportedConnectionType> = new Map();
  private failedConnectors: Set<string> = new Set();
  private connectionMapping: Map<string, string> = new Map(); // LinkedService name -> Fabric connection ID

  clear() {
    this.supportedConnectionTypes.clear();
    this.failedConnectors.clear();
    this.connectionMapping.clear();
  }

  getFailedConnectors(): Set<string> {
    return this.failedConnectors;
  }

  setConnectionMapping(connectionResults: { linkedServiceName: string; status: string; fabricConnectionId?: string }[]) {
    this.connectionMapping.clear();
    connectionResults.forEach(result => {
      if (result.status === 'success' && result.fabricConnectionId) {
        this.connectionMapping.set(result.linkedServiceName, result.fabricConnectionId);
        console.log(`Mapped LinkedService ${result.linkedServiceName} to Fabric connection ${result.fabricConnectionId}`);
      }
    });
  }

  mapLinkedServiceToConnection(linkedServiceName?: string): string | undefined {
    if (!linkedServiceName) return undefined;
    const connectionId = this.connectionMapping.get(linkedServiceName);
    if (connectionId) {
      console.log(`Mapped LinkedService ${linkedServiceName} to connection ${connectionId}`);
      return connectionId;
    }
    console.warn(`No connection mapping found for LinkedService: ${linkedServiceName}`);
    return undefined;
  }

  async loadSupportedConnectionTypes(accessToken: string) {
    const types = await fabricApiClient.getSupportedConnectionTypes(accessToken);
    this.supportedConnectionTypes.clear();
    types.forEach(t => {
      const key = (t as any).type || (t as any).connectionType;
      if (key) this.supportedConnectionTypes.set(key, t);
    });
    return types;
  }

  private validateConnectionDetails(
    connectorType: string,
    connectionDetails: Record<string, any>
  ): { isValid: boolean; errors: string[] } {
    const supportedType = this.supportedConnectionTypes.get(connectorType);
    if (!supportedType) {
      return { isValid: false, errors: [`Connector type ${connectorType} is not supported`] };
    }

    const errors: string[] = [];
    // The repo's SupportedConnectionType exposes creationMethods with parameters
    const creationMethod = (supportedType as any).creationMethods?.[0];
    const parameters = creationMethod?.parameters || [];

    // Check required parameters
    for (const param of parameters) {
      if (param.required && connectionDetails[param.name] === undefined) {
        errors.push(`Missing required field: ${param.name}`);
      }
    }

    // Basic type checking if parameter types are provided
    for (const param of parameters) {
      const expected = (param as any).type || (param as any).dataType;
      if (expected && connectionDetails[param.name] !== undefined) {
        const actualType = typeof connectionDetails[param.name];
        // Normalize expected basic types to JS typeof where possible
        const normalized = expected === 'string' || expected === 'Text' ? 'string' : expected === 'number' || expected === 'Number' ? 'number' : expected === 'boolean' || expected === 'Boolean' ? 'boolean' : null;
        if (normalized && normalized !== actualType) {
          errors.push(`Field ${param.name} should be of type ${normalized}, got ${actualType}`);
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  private buildConnectionDetails(adfLinkedService: any, connectorType: string): Record<string, any> {
    const supportedType = this.supportedConnectionTypes.get(connectorType);
    const connectionDetails: Record<string, any> = {};
    const typeProps = adfLinkedService?.properties?.typeProperties || {};

    // Map common fields using heuristics (same as before)
    const serverValue = typeProps.server || typeProps.serverName || typeProps.host || typeProps.url;
    if (serverValue) { connectionDetails.server = serverValue; }

    const dbValue = typeProps.database || typeProps.databaseName;
    if (dbValue) { connectionDetails.database = dbValue; }

    if (typeProps.connectionString) connectionDetails.connectionString = typeProps.connectionString;
    const serviceUri = typeProps.serviceUri || typeProps.endpoint || typeProps.url;
    if (serviceUri) connectionDetails.serviceUri = serviceUri;

    if (typeProps.authenticationType) connectionDetails.authenticationType = typeProps.authenticationType;
    if (typeProps.username || typeProps.userId) connectionDetails.username = typeProps.username || typeProps.userId;
    if (typeProps.port) connectionDetails.port = typeof typeProps.port === 'string' ? parseInt(typeProps.port, 10) : typeProps.port;

    // If we have supportedType definition, attempt to populate required parameters using creationMethods
    if (supportedType) {
      const creationMethod = (supportedType as any).creationMethods?.[0];
      const parameters = creationMethod?.parameters || [];
      for (const param of parameters) {
        const name = param.name;
        if (!connectionDetails[name]) {
          const candidate = typeProps[name] || typeProps[name.toLowerCase()] || typeProps[name.replace(/([A-Z])/g, '_$1').toLowerCase()];
          if (candidate !== undefined) connectionDetails[name] = candidate;
          else if (param.required) {
            // Set sensible defaults for required types
            if ((param as any).type === 'string' || (param as any).dataType === 'Text') connectionDetails[name] = '';
            else if ((param as any).type === 'number' || (param as any).dataType === 'Number') connectionDetails[name] = 0;
            else if ((param as any).type === 'boolean' || (param as any).dataType === 'Boolean') connectionDetails[name] = false;
          }
        }
      }
    }

    return connectionDetails;
  }

  // Public accessor to build connection details from an ADF linked service
  public getConnectionDetails(adfLinkedService: any, connectorType: string): Record<string, any> {
    return this.buildConnectionDetails(adfLinkedService, connectorType);
  }

  private transformConnectionDetails(definition: any): Record<string, any> {
    if (!definition) return {};

    const connectionDetails: Record<string, any> = {};
    const typeProps = definition.properties?.typeProperties || {};

    if (typeProps.connectionString) connectionDetails.connectionString = typeProps.connectionString;
    if (typeProps.serviceUri) connectionDetails.serviceUri = typeProps.serviceUri;
    if (typeProps.url) connectionDetails.serverName = typeProps.url;
    if (typeProps.databaseName) connectionDetails.databaseName = typeProps.databaseName;

    return connectionDetails;
  }

  private getConnectorType(adfType?: string): string {
    const connectorTypeMap: Record<string, string> = {
      'AzureBlobStorage': 'AzureBlobStorage',
      'AzureBlobFS': 'AzureDataLakeStorage',
      'AzureDataLakeStore': 'AzureDataLakeStorage',
      'AzureDataLakeStoreGen2': 'AzureDataLakeStorage',
      'AzureSqlDatabase': 'AzureSqlDatabase',
      'AzureSqlMI': 'AzureSqlDatabase',
      'SqlServer': 'SqlServer',
      'AzureSqlDW': 'AzureSynapseAnalytics',
      'SharePointOnlineList': 'SharePointOnlineList',
      'Office365': 'Office365',
      'CosmosDb': 'AzureCosmosDB',
      'AzureTableStorage': 'AzureTableStorage',
      'AzureFileStorage': 'AzureFileStorage',
      'Rest': 'REST',
      'OData': 'OData',
      'Http': 'HTTP',
      'FileServer': 'FileSystem',
      'Ftp': 'FTP',
      'Sftp': 'SFTP'
    };

    return connectorTypeMap[adfType || ''] || 'Generic';
  }

  private determineConnectionType(component: ADFComponent, connectVia?: string): string {
    if (!connectVia) return 'CloudConnection';
    const gateway = gatewayService.getCreatedGateway(connectVia);
    if (!gateway) {
      console.warn(`Gateway ${connectVia} not found, defaulting to CloudConnection`);
      return 'CloudConnection';
    }

    return gateway.gatewayType === 'VirtualNetwork' ? 'VirtualNetworkGatewayConnection' : 'OnPremisesConnection';
  }

  // Public wrapper for connection type determination used by FabricService
  public determineConnectionTypePublic(component: ADFComponent, connectVia?: string): string {
    return this.determineConnectionType(component, connectVia);
  }

  private createConnectionPayload(
    component: ADFComponent,
    connectionType: string,
    connectVia?: string,
    fabricConnectorType?: string,
    connectionDetails?: Record<string, any>
  ) {
    const basePayload: any = {
      displayName: component.fabricTarget?.name || component.name,
      description: `Migrated from ADF linked service: ${component.name}`,
      connectorType: fabricConnectorType || this.getConnectorType(component.definition?.properties?.type)
    };

    const finalConnectionDetails = connectionDetails || this.transformConnectionDetails(component.definition);

    switch (connectionType) {
      case 'CloudConnection':
        return { ...basePayload, connectionDetails: finalConnectionDetails, privacyLevel: 'Public' };
      case 'OnPremisesConnection': {
        const onPremGateway = connectVia ? gatewayService.getCreatedGateway(connectVia) : null;
        return { ...basePayload, connectionDetails: finalConnectionDetails, gatewayId: onPremGateway?.fabricId || '', privacyLevel: 'Organizational' };
      }
      case 'VirtualNetworkGatewayConnection': {
        const vnetGateway = connectVia ? gatewayService.getCreatedGateway(connectVia) : null;
        return { ...basePayload, connectionDetails: finalConnectionDetails, virtualNetworkGatewayId: vnetGateway?.fabricId || '', privacyLevel: 'Private' };
      }
      default:
        return { ...basePayload, connectionDetails: finalConnectionDetails, privacyLevel: 'Public' };
    }
  }

  // Public accessor used by plan generation to preview connection payloads
  public getConnectionPayload(
    component: ADFComponent,
    connectionType: string,
    connectVia?: string,
    fabricConnectorType?: string,
    connectionDetails?: Record<string, any>
  ) {
    return this.createConnectionPayload(component, connectionType, connectVia, fabricConnectorType, connectionDetails);
  }

  // Create a connector in Fabric
  async createConnector(component: ADFComponent, accessToken: string, workspaceId: string): Promise<DeploymentResult> {
    const endpoint = `${fabricApiClient.baseUrl}/connections`;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

    try {
      const connectVia = component.fabricTarget?.connectVia;
      const adfConnectorType = component.definition?.properties?.type;
      const fabricConnectorType = this.getConnectorType(adfConnectorType);

      if (!this.supportedConnectionTypes.has(fabricConnectorType) && this.supportedConnectionTypes.size > 0) {
        return {
          componentName: component.name,
          componentType: component.type,
          status: 'skipped',
          note: `Connector type ${fabricConnectorType} is not supported by Fabric`
        };
      }

      const connectionDetails = this.buildConnectionDetails(component.definition, fabricConnectorType);
      const validation = this.validateConnectionDetails(fabricConnectorType, connectionDetails);
      if (!validation.isValid) {
        console.warn(`Validation failed for connector ${component.name}:`, validation.errors);
      }

      const connectionType = this.determineConnectionType(component, connectVia);
      const connectorPayload = this.createConnectionPayload(component, connectionType, connectVia, fabricConnectorType, connectionDetails);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(connectorPayload)
      });

      if (!response.ok) {
        return await fabricApiClient.handleAPIError(response, 'POST', endpoint, connectorPayload, headers, component.name, component.type);
      }

      const result = await response.json();
      return {
        componentName: component.name,
        componentType: component.type,
        status: 'success',
        fabricResourceId: result.id,
        note: `${connectionType} connection created successfully using ${fabricConnectorType} connector`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error creating connector';
      return { componentName: component.name, componentType: component.type, status: 'failed', error: errorMessage };
    }
  }
}

export const connectionService = new ConnectionService();
