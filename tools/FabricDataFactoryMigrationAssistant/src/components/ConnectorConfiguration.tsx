import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { 
  Info, 
  Warning, 
  CheckCircle, 
  XCircle, 
  Copy,
  Gear,
  Database,
  Globe,
  ArrowsCounterClockwise
} from '@phosphor-icons/react';
import { 
  ADFComponent, 
  FabricTarget, 
  SupportedFabricConnector, 
  FabricConnectorParameter,
  ConnectorValidationError
} from '../types';
import { connectorService } from '../services/connectorService';
import { fabricService } from '../services/fabricService';
import { useAppContext } from '../contexts/AppContext';

interface ConnectorConfigurationProps {
  component: ADFComponent;
  mappingIndex: number;
  onClose?: () => void;
}

interface FabricSupportedConnectionType {
  connectionType: string;
  displayName: string;
  description?: string;
  connectionDetailsSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  creationMethods?: string[];
}

export function ConnectorConfiguration({ 
  component, 
  mappingIndex, 
  onClose 
}: ConnectorConfigurationProps) {
  const { state, dispatch } = useAppContext();
  const [supportedConnectors, setSupportedConnectors] = useState<SupportedFabricConnector[]>([]);
  const [fabricSupportedTypes, setFabricSupportedTypes] = useState<FabricSupportedConnectionType[]>([]);
  const [validationErrors, setValidationErrors] = useState<ConnectorValidationError[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [isLoadingSupportedTypes, setIsLoadingSupportedTypes] = useState(false);
  const [userHasBeenPrompted, setUserHasBeenPrompted] = useState(false);

  // Initialize connector service and load supported types from API ONLY
  useEffect(() => {
    const initializeConnectorService = async () => {
      try {
        // CRITICAL: Only initialize with dynamic API data - no static fallbacks
        if (!state.auth.accessToken) {
          console.error('No access token available for connector initialization');
          setIsInitialized(true);
          return;
        }

        await connectorService.initialize(state.auth.accessToken);
        
        // Only proceed if we have dynamic data from API
        if (!connectorService.isInitialized()) {
          throw new Error('Connector service failed to initialize with API data');
        }
        
        const connectors = connectorService.getAllSupportedConnectorTypes();
        setSupportedConnectors(connectors);
        
        // Load real-time schema information from Fabric API
        await loadFabricSupportedTypes();
        
        setIsInitialized(true);
        
        // Initialize connector with API-based defaults if no connector type is set
        if (!component.fabricTarget?.connectorType && component.type === 'linkedService') {
          await initializeConnectorDefaults();
        }
      } catch (error) {
        console.error('CRITICAL: Failed to initialize connector service with API data:', error);
        // Don't proceed without API data - this is now a hard requirement
        setIsInitialized(true);
      }
    };

    initializeConnectorService();
  }, [component.name, component.type, state.auth.accessToken]);

  // Load supported connection types from Fabric API for dynamic schema information
  const loadFabricSupportedTypes = async () => {
    if (!state.auth.accessToken) return;
    
    setIsLoadingSupportedTypes(true);
    try {
      const supportedTypes = await fabricService.getSupportedConnectionTypes(state.auth.accessToken);
      setFabricSupportedTypes(supportedTypes);
      console.log(`Loaded ${supportedTypes.length} supported connection types from Fabric API`);
    } catch (error) {
      console.error('Failed to load Fabric supported connection types:', error);
    } finally {
      setIsLoadingSupportedTypes(false);
    }
  };

  // Generate dynamic parameters from Fabric API schema
  const getDynamicParametersFromSchema = (fabricConnector: FabricSupportedConnectionType): FabricConnectorParameter[] => {
    const parameters: FabricConnectorParameter[] = [];
    const schema = fabricConnector.connectionDetailsSchema;
    
    if (schema && schema.properties) {
      const requiredFields = schema.required || [];
      
      Object.entries(schema.properties).forEach(([fieldName, fieldSchema]) => {
        const field = fieldSchema as any;
        const parameter: FabricConnectorParameter = {
          name: fieldName,
          dataType: mapSchemaTypeToDataType(field.type || 'string'),
          required: requiredFields.includes(fieldName),
          allowedValues: field.enum || null,
          description: field.description
        };
        parameters.push(parameter);
      });
    }
    
    return parameters;
  };

  // Map JSON schema types to connector data types
  const mapSchemaTypeToDataType = (schemaType: string): 'Text' | 'Number' | 'Boolean' | 'Password' | 'DropDown' => {
    switch ((schemaType || '').toLowerCase()) {
      case 'integer':
      case 'number':
        return 'Number';
      case 'boolean':
        return 'Boolean';
      case 'password':
        return 'Password';
      default:
        return 'Text';
    }
  };

  // Build connection details from Fabric API schema
  const buildConnectionDetailsFromSchema = (
    adfDefinition: any,
    connectorType: string,
    fabricConnector?: FabricSupportedConnectionType
  ): Record<string, any> => {
    const connectionDetails: Record<string, any> = {};
    
    if (fabricConnector?.connectionDetailsSchema?.properties) {
      const typeProps = adfDefinition?.properties?.typeProperties || {};
      const schemaProps = fabricConnector.connectionDetailsSchema.properties;
      const requiredFields = fabricConnector.connectionDetailsSchema.required || [];
      
      // Map ADF properties to Fabric schema properties
      Object.entries(schemaProps).forEach(([fieldName, fieldSchema]) => {
        const field = fieldSchema as any;
        let value: any = undefined;
        
        // Try to extract value from ADF definition
        value = extractValueFromADF(fieldName, typeProps, field);
        
        // If no value found and it's required, set a default
        if (value === undefined && requiredFields.includes(fieldName)) {
          value = getDefaultValueForType(field.type || 'string');
        }
        
        if (value !== undefined) {
          connectionDetails[fieldName] = value;
        }
      });
    } else {
      // Fallback to connector service if no Fabric schema available
      return connectorService.buildDefaultConnectionDetails(adfDefinition, connectorType);
    }
    
    return connectionDetails;
  };

  // Extract value from ADF definition based on field name and type
  const extractValueFromADF = (fieldName: string, typeProps: any, fieldSchema: any): any => {
    // Direct mapping
    if (typeProps[fieldName] !== undefined) {
      return convertValue(typeProps[fieldName], fieldSchema.type);
    }
    
    // Common field mappings
    const fieldMappings: Record<string, string[]> = {
      server: ['server', 'serverName', 'host', 'hostName', 'dataSource'],
      database: ['database', 'databaseName', 'initialCatalog'],
      baseUrl: ['url', 'baseUrl', 'serviceUri', 'endpoint'],
      url: ['url', 'baseUrl', 'serviceUri', 'endpoint'],
      account: ['accountName', 'storageAccount', 'account'],
      domain: ['domain', 'endpoint', 'serviceEndpoint']
    };
    
    const possibleFields = fieldMappings[fieldName] || [fieldName];
    for (const possibleField of possibleFields) {
      if (typeProps[possibleField] !== undefined) {
        return convertValue(typeProps[possibleField], fieldSchema.type);
      }
    }
    
    return undefined;
  };

  // Convert value to expected type
  const convertValue = (value: any, expectedType: string): any => {
    if (value === undefined || value === null) return value;
    
    switch (expectedType) {
      case 'string':
        return String(value);
      case 'number':
      case 'integer':
        return typeof value === 'number' ? value : parseInt(String(value), 10) || 0;
      case 'boolean':
        return typeof value === 'boolean' ? value : String(value || '').toLowerCase() === 'true';
      default:
        return value;
    }
  };

  // Get default value for schema type
  const getDefaultValueForType = (schemaType: string): any => {
    switch (schemaType) {
      case 'string':
        return '';
      case 'number':
      case 'integer':
        return 0;
      case 'boolean':
        return false;
      default:
        return '';
    }
  };

  // Initialize connector with defaults from ADF linked service
  const initializeConnectorDefaults = async () => {
    if (!component.definition?.properties?.type) return;

    const adfType = component.definition.properties.type;
    const fabricConnectorType = getFabricConnectorType(adfType);
    const connectionDetails = connectorService.buildDefaultConnectionDetails(
      component.definition, 
      fabricConnectorType
    );

    const updatedTarget: FabricTarget = {
      type: 'connector', // Explicitly set type for linkedService
      name: component.fabricTarget?.name || component.name,
      ...component.fabricTarget,
      connectorType: fabricConnectorType,
      connectionDetails,
      credentialType: 'Basic', // Default credential type
      privacyLevel: 'Public' // Default privacy level
    };

    // Use the original index in the adfComponents array to ensure proper updates
    const originalIndex = state.adfComponents.findIndex(c => c.name === component.name && c.type === component.type);
    if (originalIndex >= 0) {
      dispatch({
        type: 'UPDATE_COMPONENT_TARGET',
        payload: { index: originalIndex, fabricTarget: updatedTarget }
      });
    } else {
      console.warn(`Could not find component ${component.name} in adfComponents array`);
    }
  };

  // Map ADF linked service type to Fabric connector type
  const getFabricConnectorType = (adfType: string): string => {
    const connectorTypeMap: Record<string, string> = {
      'RestService': 'RestService',
      'AzureBlobStorage': 'AzureBlobs',
      'AzureSqlDatabase': 'SQL',
      'SqlServer': 'SQL',
      'MySql': 'MySql',
      'PostgreSql': 'PostgreSQL',
      'SharePointOnlineList': 'SharePoint',
      'OData': 'OData',
      'HttpServer': 'Web',
      'WebSource': 'Web'
    };

    return connectorTypeMap[adfType] || 'Web'; // Default fallback
  };

  // Handle connector type change with user confirmation if there are unsaved changes
  const handleConnectorTypeChange = (newConnectorType: string) => {
    // Check if user has unsaved changes and prompt for confirmation
    if (unsavedChanges && !userHasBeenPrompted) {
      setUserHasBeenPrompted(true);
      const confirmed = window.confirm(
        'Changing the connector type will reset all connection details. Continue?'
      );
      if (!confirmed) {
        setUserHasBeenPrompted(false);
        return;
      }
    }

    // Find connector from both sources
    const connectorInfo = connectorService.getConnectorByType(newConnectorType);
    const fabricConnector = fabricSupportedTypes.find(t => t.connectionType === newConnectorType);
    
    // Convert ConnectorTypeInfo to SupportedFabricConnector if needed
    let connector: SupportedFabricConnector | undefined;
    
    if (connectorInfo) {
      connector = {
        type: connectorInfo.type,
        creationMethods: [{
          name: 'Default',
          parameters: getDynamicParametersFromSchema(fabricConnector || {
            connectionType: connectorInfo.type,
            displayName: connectorInfo.displayName || connectorInfo.type,
            connectionDetailsSchema: connectorInfo.connectionDetailsSchema || { type: 'object', properties: {} }
          })
        }],
        supportedCredentialTypes: connectorInfo.supportedCredentialTypes || ['Basic', 'OAuth2', 'ServicePrincipal', 'WorkspaceIdentity'],
        supportedConnectionEncryptionTypes: connectorInfo.supportedConnectionEncryptionTypes || ['NotEncrypted', 'Encrypted'],
        supportsSkipTestConnection: connectorInfo.supportsSkipTestConnection || false
      };
    } else if (fabricConnector) {
      // Create a connector object from Fabric API data if not found in static data
      connector = {
        type: fabricConnector.connectionType,
        creationMethods: [{
          name: 'Default',
          parameters: getDynamicParametersFromSchema(fabricConnector)
        }],
        supportedCredentialTypes: ['Basic', 'OAuth2', 'ServicePrincipal', 'WorkspaceIdentity'],
        supportedConnectionEncryptionTypes: ['NotEncrypted', 'Encrypted'],
        supportsSkipTestConnection: false
      };
    }
    
    if (!connector && !fabricConnector) {
      console.warn(`No connector configuration found for type: ${newConnectorType}`);
      return;
    }

    // Build new default connection details for the new connector type
    const newConnectionDetails = buildConnectionDetailsFromSchema(
      component.definition,
      newConnectorType,
      fabricConnector
    );

    // Preserve any existing values that match the new schema if user wants to
    const existingDetails = component.fabricTarget?.connectionDetails || {};
    const mergedDetails: Record<string, any> = { ...newConnectionDetails };

    // Try to preserve common field values
    if (connector && connector.creationMethods && connector.creationMethods.length > 0) {
      const allParams = connector.creationMethods[0].parameters || [];
      allParams.forEach(param => {
        if (existingDetails[param.name] !== undefined) {
          mergedDetails[param.name] = existingDetails[param.name];
        }
      });
    } else if (fabricConnector) {
      // Use schema properties for field matching
      const schemaProps = fabricConnector.connectionDetailsSchema?.properties || {};
      Object.keys(schemaProps).forEach(propName => {
        if (existingDetails[propName] !== undefined) {
          mergedDetails[propName] = existingDetails[propName];
        }
      });
    }

    const updatedConfig = {
      connectorType: newConnectorType,
      connectionDetails: mergedDetails
    };

    // Use the original index in the adfComponents array to ensure proper updates
    const originalIndex = state.adfComponents.findIndex(c => c.name === component.name && c.type === component.type);
    if (originalIndex >= 0) {
      dispatch({
        type: 'UPDATE_CONNECTOR_CONFIGURATION',
        payload: { index: originalIndex, updates: updatedConfig }
      });
    } else {
      console.warn(`Could not find component ${component.name} in adfComponents array for connector configuration update`);
    }

    setUnsavedChanges(true);
    setUserHasBeenPrompted(false);
    validateConfiguration(newConnectorType, mergedDetails);
  };

  // Handle connection detail field change
  const handleConnectionDetailChange = (fieldName: string, value: any) => {
    const currentDetails = component.fabricTarget?.connectionDetails || {};
    const updatedDetails = {
      ...currentDetails,
      [fieldName]: value
    };

    // Use the original index in the adfComponents array to ensure proper updates
    const originalIndex = state.adfComponents.findIndex(c => c.name === component.name && c.type === component.type);
    if (originalIndex >= 0) {
      dispatch({
        type: 'UPDATE_CONNECTION_DETAILS',
        payload: { index: originalIndex, connectionDetails: updatedDetails }
      });
    } else {
      console.warn(`Could not find component ${component.name} in adfComponents array for connection details update`);
    }

    setUnsavedChanges(true);
    validateConfiguration(
      component.fabricTarget?.connectorType || '',
      updatedDetails
    );
  };

  // Get all parameters for current connector (from both static and Fabric API sources)
  const getAllParametersForConnector = (connectorType: string): FabricConnectorParameter[] => {
    // First try to get from connector service (static data)
    const staticConnector = connectorService.getConnectorByType(connectorType);
    if (staticConnector) {
      return connectorService.getAllParameters(connectorType);
    }
    
    // Fallback to Fabric API schema
    const fabricConnector = fabricSupportedTypes.find(t => t.connectionType === connectorType);
    if (fabricConnector) {
      return getDynamicParametersFromSchema(fabricConnector);
    }
    
    return [];
  };

  // Get required parameters for current connector
  const getRequiredParametersForConnector = (connectorType: string): FabricConnectorParameter[] => {
    const allParams = getAllParametersForConnector(connectorType);
    return allParams.filter(param => param.required);
  };

  // Handle credential type change
  const handleCredentialTypeChange = (credentialType: string) => {
    // Use the original index in the adfComponents array to ensure proper updates
    const originalIndex = state.adfComponents.findIndex(c => c.name === component.name && c.type === component.type);
    if (originalIndex >= 0) {
      dispatch({
        type: 'UPDATE_CONNECTOR_CONFIGURATION',
        payload: { index: originalIndex, updates: { credentialType } }
      });
    } else {
      console.warn(`Could not find component ${component.name} in adfComponents array for credential type update`);
    }
    setUnsavedChanges(true);
  };

  // Handle privacy level change
  const handlePrivacyLevelChange = (privacyLevel: 'Public' | 'Organizational' | 'Private') => {
    // Use the original index in the adfComponents array to ensure proper updates
    const originalIndex = state.adfComponents.findIndex(c => c.name === component.name && c.type === component.type);
    if (originalIndex >= 0) {
      dispatch({
        type: 'UPDATE_CONNECTOR_CONFIGURATION',
        payload: { index: originalIndex, updates: { privacyLevel } }
      });
    } else {
      console.warn(`Could not find component ${component.name} in adfComponents array for privacy level update`);
    }
    setUnsavedChanges(true);
  };

  // Validate configuration with enhanced validation
  const validateConfiguration = (connectorType: string, connectionDetails: Record<string, any>) => {
    const errors: ConnectorValidationError[] = [];
    
    // Get validation from connector service if available
    const staticConnector = connectorService.getConnectorByType(connectorType);
    if (staticConnector) {
      const validation = connectorService.validateConnectionDetails(connectorType, connectionDetails);
      errors.push(
        ...validation.errors.map(error => ({ field: 'general', message: error, severity: 'error' as const })),
        ...validation.warnings.map(warning => ({ field: 'general', message: warning, severity: 'warning' as const }))
      );
    } else {
      // Validate against Fabric API schema
      const fabricConnector = fabricSupportedTypes.find(t => t.connectionType === connectorType);
      if (fabricConnector) {
        const fabricValidation = validateAgainstFabricSchema(fabricConnector, connectionDetails);
        errors.push(...fabricValidation);
      } else {
        errors.push({
          field: 'general',
          message: `Connector type ${connectorType} is not supported`,
          severity: 'error'
        });
      }
    }

    setValidationErrors(errors);
  };

  // Validate against Fabric API schema
  const validateAgainstFabricSchema = (
    fabricConnector: FabricSupportedConnectionType, 
    connectionDetails: Record<string, any>
  ): ConnectorValidationError[] => {
    const errors: ConnectorValidationError[] = [];
    const schema = fabricConnector.connectionDetailsSchema;
    
    if (schema && schema.required) {
      schema.required.forEach(requiredField => {
        if (!connectionDetails[requiredField] || connectionDetails[requiredField] === '') {
          errors.push({
            field: requiredField,
            message: `${requiredField} is required`,
            severity: 'error'
          });
        }
      });
    }
    
    // Validate field types if schema properties are available
    if (schema && schema.properties) {
      Object.entries(connectionDetails).forEach(([fieldName, value]) => {
        const fieldSchema = schema.properties[fieldName] as any;
        if (fieldSchema && fieldSchema.type && value !== undefined && value !== '') {
          const expectedType = fieldSchema.type;
          const actualType = typeof value;
          
          if (expectedType === 'number' && actualType !== 'number') {
            errors.push({
              field: fieldName,
              message: `${fieldName} should be a number`,
              severity: 'warning'
            });
          } else if (expectedType === 'boolean' && actualType !== 'boolean') {
            errors.push({
              field: fieldName,
              message: `${fieldName} should be a boolean`,
              severity: 'warning'
            });
          }
        }
      });
    }
    
    return errors;
  };

  // Refresh supported types from Fabric API
  const refreshSupportedTypes = async () => {
    await loadFabricSupportedTypes();
  };

  // Copy configuration to clipboard
  const copyConfiguration = () => {
    const config = {
      connectorType: component.fabricTarget?.connectorType,
      connectionDetails: component.fabricTarget?.connectionDetails,
      credentialType: component.fabricTarget?.credentialType,
      privacyLevel: component.fabricTarget?.privacyLevel
    };

    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
  };

  // Add ability to reset connection details to defaults
  const resetConnectionDetails = () => {
    if (!component.fabricTarget?.connectorType) return;
    
    const fabricConnector = fabricSupportedTypes.find(t => t.connectionType === component.fabricTarget?.connectorType);
    const newConnectionDetails = buildConnectionDetailsFromSchema(
      component.definition,
      component.fabricTarget.connectorType,
      fabricConnector
    );

    const originalIndex = state.adfComponents.findIndex(c => c.name === component.name && c.type === component.type);
    if (originalIndex >= 0) {
      dispatch({
        type: 'UPDATE_CONNECTION_DETAILS',
        payload: { index: originalIndex, connectionDetails: newConnectionDetails }
      });
    }

    setUnsavedChanges(true);
    validateConfiguration(component.fabricTarget.connectorType, newConnectionDetails);
  };

  // Add ability to clear all connection details
  const clearConnectionDetails = () => {
    const originalIndex = state.adfComponents.findIndex(c => c.name === component.name && c.type === component.type);
    if (originalIndex >= 0) {
      dispatch({
        type: 'UPDATE_CONNECTION_DETAILS',
        payload: { index: originalIndex, connectionDetails: {} }
      });
    }

    setUnsavedChanges(true);
    validateConfiguration(component.fabricTarget?.connectorType || '', {});
  };

  // Get the current connector type
  const currentConnectorType = component.fabricTarget?.connectorType || '';
  const currentConnector = connectorService.getConnectorByType(currentConnectorType);
  const connectionDetails = component.fabricTarget?.connectionDetails || {};
  const credentialType = component.fabricTarget?.credentialType || 'Basic';
  const privacyLevel = component.fabricTarget?.privacyLevel || 'Public';

  // Get parameters for current connector (from both static and API sources)
  const allParameters = getAllParametersForConnector(currentConnectorType);
  const requiredParameters = getRequiredParametersForConnector(currentConnectorType);

  // Get all available connector types (merge static and Fabric API types)
  const getAllAvailableConnectorTypes = (): Array<{ type: string; source: 'static' | 'fabric' | 'both'; displayName?: string }> => {
    const types = new Map<string, { type: string; source: 'static' | 'fabric' | 'both'; displayName?: string }>();
    
    // Add static connector types
    supportedConnectors.forEach(connector => {
      types.set(connector.type, { 
        type: connector.type, 
        source: 'static',
        displayName: connector.type
      });
    });
    
    // Add or update with Fabric API types
    fabricSupportedTypes.forEach(fabricType => {
      const existing = types.get(fabricType.connectionType);
      if (existing) {
        types.set(fabricType.connectionType, { 
          ...existing, 
          source: 'both',
          displayName: fabricType.displayName || existing.displayName
        });
      } else {
        types.set(fabricType.connectionType, { 
          type: fabricType.connectionType, 
          source: 'fabric',
          displayName: fabricType.displayName || fabricType.connectionType
        });
      }
    });
    
    return Array.from(types.values()).sort((a, b) => {
      const aName = a.displayName || a.type || '';
      const bName = b.displayName || b.type || '';
      return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
    });
  };

  const availableConnectorTypes = getAllAvailableConnectorTypes();

  // Check if configuration is valid
  const hasErrors = validationErrors.some(error => error.severity === 'error');
  const hasWarnings = validationErrors.some(error => error.severity === 'warning');

  if (!isInitialized) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Gear className="animate-spin" size={16} />
            <span>Loading connector configuration...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database size={20} />
              Connector Configuration
            </CardTitle>
            <CardDescription>
              Configure how this linked service will be created in Fabric
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {unsavedChanges && (
              <Badge variant="outline" className="text-warning">
                Unsaved Changes
              </Badge>
            )}
            {isLoadingSupportedTypes && (
              <Badge variant="outline" className="text-info">
                Loading Types...
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshSupportedTypes}
              title="Refresh supported connector types from Fabric API"
              disabled={isLoadingSupportedTypes}
            >
              <ArrowsCounterClockwise size={16} className={isLoadingSupportedTypes ? 'animate-spin' : ''} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyConfiguration}
              title="Copy configuration"
            >
              <Copy size={16} />
            </Button>
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Validation Status */}
        {validationErrors.length > 0 && (
          <Alert className={hasErrors ? "border-destructive" : "border-warning"}>
            <div className="flex items-start gap-2">
              {hasErrors ? (
                <XCircle size={16} className="text-destructive mt-0.5" />
              ) : (
                <Warning size={16} className="text-warning mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-medium">
                  {hasErrors ? 'Configuration Issues' : 'Configuration Warnings'}
                </div>
                <div className="space-y-1 text-sm">
                  {validationErrors.map((error, index) => (
                    <div key={index} className="flex items-center gap-1">
                      <span>•</span>
                      <span>{error.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Alert>
        )}

        {/* Basic Configuration */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="connector-type">Fabric Connector Type</Label>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{availableConnectorTypes.length} available</span>
                {fabricSupportedTypes.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {fabricSupportedTypes.length} from API
                  </Badge>
                )}
              </div>
            </div>
            <Select
              value={currentConnectorType}
              onValueChange={handleConnectorTypeChange}
            >
              <SelectTrigger id="connector-type">
                <SelectValue placeholder="Select connector type" />
              </SelectTrigger>
              <SelectContent>
                {availableConnectorTypes.map((connectorInfo) => (
                  <SelectItem key={connectorInfo.type} value={connectorInfo.type}>
                    <div className="flex items-center gap-2">
                      <span>{connectorInfo.displayName}</span>
                      <div className="flex items-center gap-1">
                        {connectorInfo.source === 'fabric' && (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-gray-900 border-blue-200">
                            API
                          </Badge>
                        )}
                        {connectorInfo.source === 'static' && (
                          <Badge variant="outline" className="text-xs bg-gray-50 text-gray-900 border-gray-200">
                            Static
                          </Badge>
                        )}
                        {connectorInfo.source === 'both' && (
                          <Badge variant="outline" className="text-xs bg-green-50 text-gray-900 border-green-200">
                            Verified
                          </Badge>
                        )}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentConnector && currentConnector.supportedCredentialTypes && (
              <div className="text-xs text-muted-foreground">
                Supports: {currentConnector.supportedCredentialTypes.join(', ')}
              </div>
            )}
            {!currentConnector && fabricSupportedTypes.find(t => t.connectionType === currentConnectorType) && (
              <div className="text-xs text-muted-foreground">
                Schema loaded from Fabric API
              </div>
            )}
          </div>

          {/* Connection Details */}
          {allParameters.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Label className="text-base font-medium">Connection Details</Label>
                <Badge variant="outline" className="text-xs">
                  {requiredParameters.length} required
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {allParameters.length - requiredParameters.length} optional
                </Badge>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetConnectionDetails}
                    title="Reset to source defaults"
                    disabled={!currentConnectorType}
                  >
                    <ArrowsCounterClockwise size={14} />
                    Reset
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearConnectionDetails}
                    title="Clear all values"
                    disabled={Object.keys(connectionDetails).length === 0}
                  >
                    <XCircle size={14} />
                    Clear
                  </Button>
                </div>
              </div>
              
              {/* Connection Details Help */}
              <Alert>
                <Info size={16} />
                <AlertDescription>
                  Configure the connection details for your {currentConnectorType} connector. 
                  Required fields are marked with a red badge and must be filled before deployment.
                  {currentConnectorType && fabricSupportedTypes.find(t => t.connectionType === currentConnectorType) && (
                    <span className="block mt-1 text-xs text-muted-foreground">
                      Schema loaded from Fabric API ensures compatibility.
                    </span>
                  )}
                </AlertDescription>
              </Alert>
              
              <div className="grid gap-4">
                {/* Required Parameters First */}
                {requiredParameters.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-xs">Required Fields</Badge>
                      <span className="text-sm text-muted-foreground">These fields must be completed</span>
                    </div>
                    {requiredParameters.map((param) => {
                      const fieldError = validationErrors.find(e => e.field === param.name);
                      const hasFieldError = fieldError && fieldError.severity === 'error';
                      const hasFieldWarning = fieldError && fieldError.severity === 'warning';
                      
                      return (
                        <div key={param.name} className="space-y-2 p-3 border border-destructive/20 rounded-lg bg-destructive/5">
                          <Label 
                            htmlFor={`param-${param.name}`}
                            className="flex items-center gap-2 font-medium"
                          >
                            {param.name}
                            <Badge variant="destructive" className="text-xs">
                              Required
                            </Badge>
                            {hasFieldError && (
                              <XCircle size={14} className="text-destructive" />
                            )}
                            {hasFieldWarning && (
                              <Warning size={14} className="text-warning" />
                            )}
                          </Label>
                          
                          {param.dataType === 'DropDown' && param.allowedValues ? (
                            <Select
                              value={connectionDetails[param.name] || ''}
                              onValueChange={(value) => handleConnectionDetailChange(param.name, value)}
                            >
                              <SelectTrigger 
                                id={`param-${param.name}`}
                                className={hasFieldError ? 'border-destructive' : hasFieldWarning ? 'border-warning' : ''}
                              >
                                <SelectValue placeholder={`Select ${param.name}`} />
                              </SelectTrigger>
                              <SelectContent>
                                {param.allowedValues.map((value) => (
                                  <SelectItem key={value} value={value}>
                                    {value}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : param.dataType === 'Boolean' ? (
                            <div className="flex items-center space-x-2">
                              <Switch
                                id={`param-${param.name}`}
                                checked={connectionDetails[param.name] || false}
                                onCheckedChange={(checked) => handleConnectionDetailChange(param.name, checked)}
                              />
                              <Label htmlFor={`param-${param.name}`} className="text-sm">
                                {connectionDetails[param.name] ? 'Enabled' : 'Disabled'}
                              </Label>
                            </div>
                          ) : param.dataType === 'Password' ? (
                            <Input
                              id={`param-${param.name}`}
                              type="password"
                              value={connectionDetails[param.name] || ''}
                              onChange={(e) => handleConnectionDetailChange(param.name, e.target.value)}
                              placeholder={`Enter ${param.name}`}
                              className={hasFieldError ? 'border-destructive' : hasFieldWarning ? 'border-warning' : ''}
                            />
                          ) : (
                            <Input
                              id={`param-${param.name}`}
                              type={param.dataType === 'Number' ? 'number' : 'text'}
                              value={connectionDetails[param.name] || ''}
                              onChange={(e) => {
                                const value = param.dataType === 'Number' 
                                  ? parseInt(e.target.value, 10) || 0
                                  : e.target.value;
                                handleConnectionDetailChange(param.name, value);
                              }}
                              placeholder={`Enter ${param.name}`}
                              className={hasFieldError ? 'border-destructive' : hasFieldWarning ? 'border-warning' : ''}
                            />
                          )}
                          
                          {param.description && (
                            <div className="text-xs text-muted-foreground">
                              {param.description}
                            </div>
                          )}
                          
                          {fieldError && (
                            <div className={`text-xs ${hasFieldError ? 'text-destructive' : 'text-warning'}`}>
                              {fieldError.message}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Optional Parameters */}
                {allParameters.filter(p => !p.required).length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">Optional Fields</Badge>
                      <span className="text-sm text-muted-foreground">These fields can be left empty</span>
                    </div>
                    {allParameters.filter(p => !p.required).map((param) => {
                      const fieldError = validationErrors.find(e => e.field === param.name);
                      const hasFieldError = fieldError && fieldError.severity === 'error';
                      const hasFieldWarning = fieldError && fieldError.severity === 'warning';
                      
                      return (
                        <div key={param.name} className="space-y-2">
                          <Label 
                            htmlFor={`param-${param.name}`}
                            className="flex items-center gap-2"
                          >
                            {param.name}
                            <Badge variant="outline" className="text-xs">
                              Optional
                            </Badge>
                            {hasFieldError && (
                              <XCircle size={14} className="text-destructive" />
                            )}
                            {hasFieldWarning && (
                              <Warning size={14} className="text-warning" />
                            )}
                          </Label>
                          
                          {param.dataType === 'DropDown' && param.allowedValues ? (
                            <Select
                              value={connectionDetails[param.name] || ''}
                              onValueChange={(value) => handleConnectionDetailChange(param.name, value)}
                            >
                              <SelectTrigger 
                                id={`param-${param.name}`}
                                className={hasFieldError ? 'border-destructive' : hasFieldWarning ? 'border-warning' : ''}
                              >
                                <SelectValue placeholder={`Select ${param.name} (optional)`} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">-- Leave Empty --</SelectItem>
                                {param.allowedValues.map((value) => (
                                  <SelectItem key={value} value={value}>
                                    {value}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : param.dataType === 'Boolean' ? (
                            <div className="flex items-center space-x-2">
                              <Switch
                                id={`param-${param.name}`}
                                checked={connectionDetails[param.name] || false}
                                onCheckedChange={(checked) => handleConnectionDetailChange(param.name, checked)}
                              />
                              <Label htmlFor={`param-${param.name}`} className="text-sm">
                                {connectionDetails[param.name] ? 'Enabled' : 'Disabled'}
                              </Label>
                            </div>
                          ) : param.dataType === 'Password' ? (
                            <Input
                              id={`param-${param.name}`}
                              type="password"
                              value={connectionDetails[param.name] || ''}
                              onChange={(e) => handleConnectionDetailChange(param.name, e.target.value)}
                              placeholder={`Enter ${param.name} (optional)`}
                              className={hasFieldError ? 'border-destructive' : hasFieldWarning ? 'border-warning' : ''}
                            />
                          ) : (
                            <Input
                              id={`param-${param.name}`}
                              type={param.dataType === 'Number' ? 'number' : 'text'}
                              value={connectionDetails[param.name] || ''}
                              onChange={(e) => {
                                const value = param.dataType === 'Number' 
                                  ? parseInt(e.target.value, 10) || 0
                                  : e.target.value;
                                handleConnectionDetailChange(param.name, value);
                              }}
                              placeholder={`Enter ${param.name} (optional)`}
                              className={hasFieldError ? 'border-destructive' : hasFieldWarning ? 'border-warning' : ''}
                            />
                          )}
                          
                          {param.description && (
                            <div className="text-xs text-muted-foreground">
                              {param.description}
                            </div>
                          )}
                          
                          {fieldError && (
                            <div className={`text-xs ${hasFieldError ? 'text-destructive' : 'text-warning'}`}>
                              {fieldError.message}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Advanced Configuration */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Advanced Settings</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <Gear size={16} />
                {showAdvanced ? 'Hide' : 'Show'} Advanced
              </Button>
            </div>

            {showAdvanced && (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                <div className="space-y-2">
                  <Label htmlFor="credential-type">Authentication Method</Label>
                  <Select
                    value={credentialType}
                    onValueChange={handleCredentialTypeChange}
                  >
                    <SelectTrigger id="credential-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currentConnector?.supportedCredentialTypes?.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      )) || (
                        <>
                          <SelectItem value="Basic">Basic</SelectItem>
                          <SelectItem value="OAuth2">OAuth2</SelectItem>
                          <SelectItem value="ServicePrincipal">Service Principal</SelectItem>
                          <SelectItem value="WorkspaceIdentity">Workspace Identity</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="privacy-level">Privacy Level</Label>
                  <Select
                    value={privacyLevel}
                    onValueChange={handlePrivacyLevelChange}
                  >
                    <SelectTrigger id="privacy-level">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Public">
                        <div className="flex items-center gap-2">
                          <Globe size={14} />
                          <span>Public</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="Organizational">
                        <div className="flex items-center gap-2">
                          <Database size={14} />
                          <span>Organizational</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="Private">
                        <div className="flex items-center gap-2">
                          <XCircle size={14} />
                          <span>Private</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Source Information */}
          <div className="p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <Info size={16} className="text-muted-foreground" />
              <span className="font-medium text-sm">Source: Data Factory</span>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>Type: {component.definition?.properties?.type || 'Unknown'}</div>
              {component.definition?.properties?.typeProperties && (
                <div>
                  Properties: {Object.keys(component.definition.properties.typeProperties).length} field(s)
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}