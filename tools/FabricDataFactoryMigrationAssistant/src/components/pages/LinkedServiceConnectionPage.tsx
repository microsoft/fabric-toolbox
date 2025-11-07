import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Copy, CaretDown, CaretRight, Warning, CheckCircle, Clock, Download, MagnifyingGlass } from '@phosphor-icons/react';
import { useAppContext } from '../../contexts/AppContext';
import { linkedServiceConnectionService } from '../../services/linkedServiceConnectionService';
import { ExistingConnectionsService } from '../../services/existingConnectionsService';
import { toast } from 'sonner';
import { NavigationDebug } from '../NavigationDebug';
import type { 
  LinkedServiceConnection, 
  FabricGateway, 
  SupportedConnectionType, 
  ConnectionCreationMethod,
  CredentialType,
  ExistingFabricConnection
} from '../../types';
import './LinkedServiceConnectionPage.css';

interface ConnectionConfigurationProps {
  linkedService: LinkedServiceConnection;
  index: number;
  availableGateways: FabricGateway[];
  supportedConnectionTypes: SupportedConnectionType[];
  isLoading: boolean;
  onUpdate: (index: number, update: Partial<LinkedServiceConnection>) => void;
  onFetchConnectionTypes: (connectivityType: 'ShareableCloud' | 'OnPremisesGateway' | 'VirtualNetworkGateway', gatewayId?: string) => Promise<void>;
}

function ConnectionConfiguration({
  linkedService,
  index,
  availableGateways,
  supportedConnectionTypes,
  isLoading,
  onUpdate,
  onFetchConnectionTypes
}: ConnectionConfigurationProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedCreationMethod, setSelectedCreationMethod] = useState<ConnectionCreationMethod | null>(null);
  const [selectedCredentialType, setSelectedCredentialType] = useState<CredentialType | null>(null);
  const [existingConnections, setExistingConnections] = useState<ExistingFabricConnection[]>([]);
  const [loadingExistingConnections, setLoadingExistingConnections] = useState(false);
  const [existingConnectionsError, setExistingConnectionsError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { state } = useAppContext();

  // Find the selected connection type details
  const selectedConnectionTypeDetails = (supportedConnectionTypes || []).find(
    ct => ct && ct.type === linkedService.selectedConnectionType
  );

  // Filter gateways by selected connectivity type
  const filteredGateways = (availableGateways || []).filter(gateway => {
    if (!gateway) return false;
    if (linkedService.selectedConnectivityType === 'OnPremisesGateway') {
      return gateway.type === 'OnPremises';
    } else if (linkedService.selectedConnectivityType === 'VirtualNetworkGateway') {
      return gateway.type === 'VirtualNetwork';
    }
    return false;
  });

  // Load existing connections when expanded
  useEffect(() => {
    if (isExpanded && state.auth.accessToken && existingConnections.length === 0 && !loadingExistingConnections) {
      fetchExistingConnections();
    }
  }, [isExpanded, state.auth.accessToken]);

  // Auto-match existing connections by name when existing connections are loaded
  useEffect(() => {
    if (existingConnections.length > 0 && !linkedService.mappingMode) {
      // Check for FabricDataPipelines connections specifically
      if (linkedService.linkedServiceType === 'FabricDataPipelines') {
        // Look for existing FabricDataPipelines connections
        const fabricDataPipelinesConnection = existingConnections.find(
          conn => conn.connectionDetails.type === 'FabricDataPipelines'
        );

        if (fabricDataPipelinesConnection) {
          // Auto-select existing FabricDataPipelines connection if found
          onUpdate(index, {
            mappingMode: 'existing',
            existingConnectionId: fabricDataPipelinesConnection.id,
            existingConnection: fabricDataPipelinesConnection,
            // Clear new connection fields
            selectedConnectivityType: null,
            selectedGatewayId: undefined,
            selectedConnectionType: undefined,
            connectionParameters: {},
            credentials: {},
            credentialType: undefined
          });
          
          // Show toast notification about auto-matching
          toast.success(`Auto-matched to existing FabricDataPipelines connection: ${fabricDataPipelinesConnection.displayName}`);
        } else {
          // Default to new connection mode if no FabricDataPipelines connection found
          onUpdate(index, {
            mappingMode: 'new'
          });
        }
      } else {
        // For regular LinkedServices, check if there's an existing connection with the same name
        const matchingConnection = existingConnections.find(
          conn => conn.displayName === linkedService.linkedServiceName
        );

        if (matchingConnection) {
          // Auto-select existing connection if found
          onUpdate(index, {
            mappingMode: 'existing',
            existingConnectionId: matchingConnection.id,
            existingConnection: matchingConnection,
            // Clear new connection fields
            selectedConnectivityType: null,
            selectedGatewayId: undefined,
            selectedConnectionType: undefined,
            connectionParameters: {},
            credentials: {},
            credentialType: undefined
          });
          
          // Show toast notification about auto-matching
          toast.success(`Auto-matched to existing connection: ${matchingConnection.displayName}`);
        } else {
          // Default to new connection mode if no match found
          onUpdate(index, {
            mappingMode: 'new'
          });
        }
      }
    }
  }, [existingConnections, linkedService.linkedServiceName, linkedService.linkedServiceType, linkedService.mappingMode, index, onUpdate]);

  // Auto-initialize FabricDataPipelines connections
  useEffect(() => {
    if (linkedService.linkedServiceType === 'FabricDataPipelines' && 
        linkedService.mappingMode === 'new' &&
        !linkedService.selectedConnectivityType) {
      // Auto-configure FabricDataPipelines to use cloud connectivity
      console.log(`Auto-configuring FabricDataPipelines connection ${linkedService.linkedServiceName}...`);
      
      onUpdate(index, {
        selectedConnectivityType: 'ShareableCloud',
        selectedConnectionType: 'FabricDataPipelines',
        credentialType: 'WorkspaceIdentity',
        connectionParameters: {},
        credentials: {}
      });

      // Fetch connection types for FabricDataPipelines
      if (state.auth.accessToken) {
        onFetchConnectionTypes('ShareableCloud').catch(error => {
          console.error('Failed to fetch FabricDataPipelines connection types:', error);
        });
      }
    }
  }, [
    linkedService.linkedServiceType, 
    linkedService.mappingMode, 
    linkedService.selectedConnectivityType,
    state.auth.accessToken,
    index,
    onUpdate,
    onFetchConnectionTypes
  ]);

  const fetchExistingConnections = async () => {
    if (!state.auth.accessToken) return;

    setLoadingExistingConnections(true);
    setExistingConnectionsError(null);

    try {
      const connections = await ExistingConnectionsService.getExistingConnections(state.auth.accessToken);
      setExistingConnections(connections);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch existing connections';
      setExistingConnectionsError(errorMessage);
      console.error('Error fetching existing connections:', error);
    } finally {
      setLoadingExistingConnections(false);
    }
  };

  const handleMappingModeChange = (mode: 'existing' | 'new') => {
    if (mode === 'existing') {
      onUpdate(index, { 
        mappingMode: mode,
        // Clear new connection fields when switching to existing
        selectedConnectivityType: null,
        selectedGatewayId: undefined,
        selectedConnectionType: undefined,
        connectionParameters: {},
        credentials: {},
        credentialType: undefined,
        existingConnectionId: undefined,
        existingConnection: undefined
      });
    } else {
      onUpdate(index, { 
        mappingMode: mode,
        // Clear existing connection fields when switching to new
        existingConnectionId: undefined,
        existingConnection: undefined
      });
    }
  };

  const handleExistingConnectionChange = (connectionId: string) => {
    const selectedConnection = existingConnections.find(conn => conn.id === connectionId);
    onUpdate(index, { 
      existingConnectionId: connectionId,
      existingConnection: selectedConnection
    });
  };

  // Filter existing connections based on search
  const filteredExistingConnections = useMemo(() => {
    if (!searchTerm.trim()) return existingConnections;
    
    const term = searchTerm.toLowerCase();
    return existingConnections.filter(conn =>
      conn.displayName.toLowerCase().includes(term) ||
      conn.connectionDetails.type.toLowerCase().includes(term) ||
      (conn.description && conn.description.toLowerCase().includes(term))
    );
  }, [existingConnections, searchTerm]);
  useEffect(() => {
    if (!selectedConnectionTypeDetails) {
      if (selectedCreationMethod !== null) setSelectedCreationMethod(null);
      return;
    }
    const firstMethod = selectedConnectionTypeDetails.creationMethods?.[0] || null;
    if (firstMethod?.name === selectedCreationMethod?.name) return; // guard to avoid loops
    setSelectedCreationMethod(firstMethod);
  }, [selectedConnectionTypeDetails]); // replaced previous effect body

  // Update credential type when creation method changes
  useEffect(() => {
    if (selectedCreationMethod && (selectedCreationMethod.credentialTypes || []).length > 0) {
      const firstCredentialType = (selectedCreationMethod.credentialTypes || [])[0] || null;
      setSelectedCredentialType(firstCredentialType);
      
      // Only update if the credential type has actually changed
      if (firstCredentialType?.credentialType !== linkedService.credentialType) {
        onUpdate(index, { credentialType: firstCredentialType?.credentialType });
      }
    } else {
      setSelectedCredentialType(null);
      if (linkedService.credentialType !== undefined) {
        onUpdate(index, { credentialType: undefined });
      }
    }
  }, [selectedCreationMethod?.name]); // Only depend on the method name to prevent infinite loop

  // Auto-map parameters when creation method is selected
  useEffect(() => {
    if (
      selectedCreationMethod &&
      selectedConnectionTypeDetails &&
      linkedService.mappingMode === 'new'
    ) {
      const autoMappedParams = linkedServiceConnectionService.autoMapConnectionParameters(
        linkedService,
        selectedConnectionTypeDetails,
        selectedCreationMethod.name
      );
      const hasChanges = Object.keys(autoMappedParams).some(
        key => autoMappedParams[key] !== linkedService.connectionParameters[key]
      );
      if (hasChanges) {
        onUpdate(index, { connectionParameters: autoMappedParams });
      }
    }
  }, [
    selectedCreationMethod?.name,
    selectedConnectionTypeDetails?.type,
    linkedService.mappingMode
  ]); // tightened dependencies & added mappingMode guard

  const handleConnectivityTypeChange = async (value: string) => {
    const connectivityType = value as 'ShareableCloud' | 'OnPremisesGateway' | 'VirtualNetworkGateway';
    onUpdate(index, { 
      selectedConnectivityType: connectivityType,
      selectedGatewayId: undefined,
      selectedConnectionType: undefined,
      connectionParameters: {},
      credentials: {}
    });

    // Clear previous connection types first to show loading state
    if (connectivityType === 'ShareableCloud') {
      // For cloud connections, fetch without gateway ID immediately
      try {
        console.log(`Fetching cloud connection types for ${linkedService.linkedServiceName}...`);
        await onFetchConnectionTypes(connectivityType);
      } catch (error) {
        console.error('Failed to fetch cloud connection types:', error);
      }
    } else {
      // For gateway connections, clear connection types until gateway is selected
      // The supported types will be fetched when gateway is selected
    }
  };

  const handleGatewayChange = async (gatewayId: string) => {
    onUpdate(index, { selectedGatewayId: gatewayId });

    // Fetch supported connection types for the selected gateway
    if (linkedService.selectedConnectivityType && linkedService.selectedConnectivityType !== 'ShareableCloud') {
      await onFetchConnectionTypes(linkedService.selectedConnectivityType, gatewayId);
    }
  };

  const handleConnectionTypeChange = (connectionType: string) => {
    onUpdate(index, { 
      selectedConnectionType: connectionType,
      connectionParameters: {},
      credentials: {}
    });
  };

  const handleParameterChange = (paramName: string, value: any) => {
    const updatedParams = { ...linkedService.connectionParameters, [paramName]: value };
    onUpdate(index, { connectionParameters: updatedParams });
  };

  const handleCredentialChange = (fieldName: string, value: any) => {
    const updatedCredentials = { ...linkedService.credentials, [fieldName]: value };
    onUpdate(index, { credentials: updatedCredentials });
  };

  const validateConfiguration = (): string[] => {
    const errors: string[] = [];

    if (!linkedService.mappingMode) {
      errors.push('Connection mapping mode is required');
      return errors;
    }

    if (linkedService.mappingMode === 'existing') {
      if (!linkedService.existingConnectionId) {
        errors.push('Please select an existing connection');
      }
      return errors;
    }

    // Validation for new connections
    if (!linkedService.selectedConnectivityType) {
      errors.push('Connectivity type is required');
    }

    if (linkedService.selectedConnectivityType !== 'ShareableCloud' && !linkedService.selectedGatewayId) {
      errors.push('Gateway selection is required for this connectivity type');
    }

    if (!linkedService.selectedConnectionType) {
      errors.push('Connection type is required');
    }

    if (selectedCreationMethod) {
      const paramErrors = linkedServiceConnectionService.validateConnectionParameters(
        linkedService.connectionParameters,
        selectedCreationMethod
      );
      errors.push(...paramErrors);
    }

    if (selectedCredentialType) {
      const credentialErrors = linkedServiceConnectionService.validateCredentials(
        linkedService.credentials,
        linkedService.credentialType || ''
      );
      errors.push(...(credentialErrors || []));
    }

    return errors;
  };

  // Calculate validation status and use memoization to prevent recalculation
  const validationErrors = useMemo(() => {
    return validateConfiguration() || [];
  }, [
    linkedService.mappingMode,
    linkedService.existingConnectionId,
    linkedService.selectedConnectivityType,
    linkedService.selectedConnectionType,
    linkedService.selectedGatewayId,
    linkedService.connectionParameters,
    linkedService.credentials,
    selectedCreationMethod?.name,
    selectedCredentialType?.credentialType
  ]);

  const isValid = validationErrors.length === 0;

  // Update status based on validation with useCallback to prevent infinite loop
  const updateStatus = useCallback(() => {
    if (linkedService.skip) return; // do not overwrite skipped status
    let newStatus: 'pending' | 'configured' | 'failed' | 'skipped' = 'pending';
    if (linkedService.mappingMode === 'existing') {
      newStatus = linkedService.existingConnectionId ? 'configured' : 'pending';
    } else if (linkedService.mappingMode === 'new') {
      newStatus = linkedService.selectedConnectivityType &&
                  linkedService.selectedConnectionType &&
                  isValid ? 'configured' : 'pending';
    }
    if (linkedService.status !== newStatus) {
      onUpdate(index, { status: newStatus, validationErrors });
    }
  }, [
    linkedService.skip,
    linkedService.mappingMode,
    linkedService.existingConnectionId,
    linkedService.selectedConnectivityType,
    linkedService.selectedConnectionType,
    linkedService.status,
    isValid,
    validationErrors,
    index,
    onUpdate
  ]);

  // Update status when validation state changes
  useEffect(() => {
    updateStatus();
  }, [updateStatus]);

  const getStatusIcon = () => {
    if (linkedService.skip || linkedService.status === 'skipped') {
      return <Clock className="h-4 w-4 text-gray-400" />;
    }
    switch (linkedService.status) {
      case 'configured':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <Warning className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getStatusBadge = () => {
    if (linkedService.skip || linkedService.status === 'skipped') {
      return <Badge variant="outline" className="text-gray-500 border-gray-300">Skipped</Badge>;
    }
    switch (linkedService.status) {
      case 'configured':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">Configured</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  // Top-level skip toggle handler
  const toggleSkip = (checked: boolean) => {
    if (checked) {
      onUpdate(index, { skip: true, status: 'skipped', validationErrors: [] });
      setIsExpanded(false);
    } else {
      onUpdate(index, { skip: false, status: 'pending' });
      // status will be recalculated by effect
    }
  };

  return (
    <Card className={`w-full ls-cardShell ${isExpanded ? 'ls-cardShell--expanded' : ''} ${linkedService.skip ? 'opacity-60' : ''}`}>
      <Collapsible open={isExpanded && !linkedService.skip} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getStatusIcon()}
                  <div>
                    <CardTitle className="text-lg">{linkedService.linkedServiceName}</CardTitle>
                    <CardDescription>
                      Type: {linkedService.linkedServiceType} • {getStatusBadge()}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <label className="flex items-center gap-1 text-xs select-none">
                    <input
                      type="checkbox"
                      checked={!!linkedService.skip}
                      onChange={e => toggleSkip(e.target.checked)}
                    />
                    Skip
                  </label>
                  {!linkedService.skip && (isExpanded ? <CaretDown className="h-4 w-4" /> : <CaretRight className="h-4 w-4" />)}
                </div>
              </div>
              {linkedService.skip && (
                <div className="text-xs text-gray-500">
                  This LinkedService is marked as skipped and will be excluded from validation & deployment.
                </div>
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        {!linkedService.skip && (
          <CollapsibleContent>
            <CardContent className="pt-0">
              {/* Validation Errors */}
              {validationErrors && validationErrors.length > 0 && (
                <Alert className="mb-4">
                  <Warning className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      {(validationErrors || []).map((error, idx) => (
                        <div key={idx}>• {error}</div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-6">
                {/* Connection Mapping Mode Selection */}
                <div className="space-y-4">
                  <div>
                    <Label className="text-base font-medium">Connection Mapping *</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Choose how to handle this LinkedService connection
                    </p>
                  </div>
                  
                  <RadioGroup
                    value={linkedService.mappingMode || ''}
                    onValueChange={handleMappingModeChange}
                    className="grid grid-cols-1 gap-4"
                  >
                    <div className="flex items-center space-x-2 p-3 border rounded-lg">
                      <RadioGroupItem value="existing" id={`existing-${index}`} />
                      <div className="flex-1">
                        <Label htmlFor={`existing-${index}`} className="text-sm font-medium">
                          Map to Existing Connection
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Use an existing Fabric connection from your workspace
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2 p-3 border rounded-lg">
                      <RadioGroupItem value="new" id={`new-${index}`} />
                      <div className="flex-1">
                        <Label htmlFor={`new-${index}`} className="text-sm font-medium">
                          Configure New Connection
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Create a new Fabric connection during migration
                        </p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                {/* Existing Connection Selection */}
                {linkedService.mappingMode === 'existing' && (
                  <div className="space-y-4">
                    <Separator />
                    <div>
                      <Label className="text-sm font-medium">Select Existing Connection *</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Choose from existing connections in your workspace
                      </p>
                    </div>

                    {loadingExistingConnections ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                        <span className="ml-2 text-sm text-muted-foreground">Loading existing connections...</span>
                      </div>
                    ) : existingConnectionsError ? (
                      <Alert>
                        <Warning className="h-4 w-4" />
                        <AlertDescription>
                          Failed to load existing connections: {existingConnectionsError}
                        </AlertDescription>
                      </Alert>
                    ) : existingConnections.length === 0 ? (
                      <Alert>
                        <Warning className="h-4 w-4" />
                        <AlertDescription>
                          No existing connections found in your workspace. Please create a connection first or choose "Configure New Connection".
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <div className="space-y-3">
                        {/* Search existing connections */}
                        <div className="relative">
                          <MagnifyingGlass className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search existing connections..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9"
                          />
                        </div>

                        {/* Existing connections dropdown */}
                        <SearchableSelect
                          options={filteredExistingConnections.map(conn => ({
                            value: conn.id,
                            label: ExistingConnectionsService.formatConnectionForDisplay(conn),
                            searchText: `${conn.displayName} ${conn.connectionDetails.type} ${ExistingConnectionsService.formatConnectionForDisplay(conn)}`.toLowerCase()
                          }))}
                          value={linkedService.existingConnectionId || ''}
                          onValueChange={handleExistingConnectionChange}
                          placeholder="Select an existing connection"
                          searchPlaceholder="Search connections..."
                          emptyMessage="No matching connections found"
                          disabled={filteredExistingConnections.length === 0}
                        />

                        {/* Display selected connection details */}
                        {linkedService.existingConnection && (
                          <div className="mt-3 p-3 bg-muted rounded-lg">
                            <div className="text-sm">
                              <div className="font-medium">{linkedService.existingConnection.displayName}</div>
                              <div className="text-muted-foreground">
                                Type: {linkedService.existingConnection.connectionDetails.type} • 
                                Connectivity: {linkedService.existingConnection.connectivityType}
                              </div>
                              {linkedService.existingConnection.description && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {linkedService.existingConnection.description}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* New Connection Configuration */}
                {linkedService.mappingMode === 'new' && (
                  <div className="space-y-6">
                    <Separator />
                    <div>
                      <Label className="text-sm font-medium">New Connection Configuration</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Configure a new Fabric connection for this LinkedService
                      </p>
                    </div>

                    {/* Connectivity Type Selection */}
                    <div className="space-y-2">
                      <Label htmlFor={`connectivity-${index}`}>Connectivity Type *</Label>
                      <Select 
                        value={linkedService.selectedConnectivityType || ''} 
                        onValueChange={handleConnectivityTypeChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select connectivity type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ShareableCloud">Cloud Connection</SelectItem>
                          <SelectItem value="OnPremisesGateway">On-Premises Gateway Connection</SelectItem>
                          <SelectItem value="VirtualNetworkGateway">Virtual Network Gateway Connection</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Gateway Selection */}
                    {(linkedService.selectedConnectivityType === 'OnPremisesGateway' || 
                      linkedService.selectedConnectivityType === 'VirtualNetworkGateway') && (
                      <div className="space-y-2">
                        <Label htmlFor={`gateway-${index}`}>Gateway *</Label>
                        {filteredGateways.length > 0 ? (
                          <Select 
                            value={linkedService.selectedGatewayId || ''} 
                            onValueChange={handleGatewayChange}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select gateway" />
                            </SelectTrigger>
                            <SelectContent>
                              {filteredGateways.map(gateway => (
                                <SelectItem key={gateway.id} value={gateway.id}>
                                  {gateway.displayName} ({gateway.type})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Alert>
                            <Warning className="h-4 w-4" />
                            <AlertDescription>
                              No {linkedService.selectedConnectivityType === 'OnPremisesGateway' ? 'on-premises' : 'virtual network'} gateways available.
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    )}

                    {/* Connection Type Selection */}
                    {linkedService.selectedConnectivityType && 
                     (linkedService.selectedConnectivityType === 'ShareableCloud' || 
                      linkedService.selectedGatewayId) && (
                      <div className="space-y-2">
                        <Label htmlFor={`connection-type-${index}`}>Connection Type *</Label>
                        
                        {supportedConnectionTypes && supportedConnectionTypes.length > 0 ? (
                          <SearchableSelect
                            options={supportedConnectionTypes.map(type => ({
                              value: type.type,
                              label: type.displayName || type.type,
                              searchText: `${type.displayName || type.type} ${type.type}`.toLowerCase()
                            }))}
                            value={linkedService.selectedConnectionType || ''}
                            onValueChange={handleConnectionTypeChange}
                            placeholder="Select connection type"
                            searchPlaceholder="Search connection types..."
                            emptyMessage="No connection types found"
                            disabled={isLoading}
                          />
                        ) : (
                          <Alert>
                            <Warning className="h-4 w-4" />
                            <AlertDescription>
                              {isLoading ? 
                                'Loading connection types...' : 
                                linkedService.selectedConnectivityType === 'ShareableCloud' ?
                                  'No cloud connection types available. Please check API permissions.' :
                                  'No connection types available for the selected gateway. Please verify the gateway supports this connection type.'
                            }
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    )}

                    {/* Connection Parameters */}
                    {linkedService.selectedConnectivityType && 
                     linkedService.selectedConnectionType && 
                     selectedCreationMethod && (
                      <div className="space-y-4">
                        <Separator />
                        <div>
                          <h4 className="text-sm font-medium mb-3">Connection Parameters</h4>
                          <div className="space-y-4">
                            {selectedCreationMethod.parameters.map(param => (
                              <div key={param.name} className="space-y-2">
                                <Label htmlFor={`param-${index}-${param.name}`}>
                                  {param.displayName} {param.required && <span className="text-red-500">*</span>}
                                </Label>
                                {param.type === 'boolean' ? (
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`param-${index}-${param.name}`}
                                      checked={linkedService.connectionParameters[param.name] || false}
                                      onCheckedChange={(checked) => handleParameterChange(param.name, checked)}
                                    />
                                    <Label htmlFor={`param-${index}-${param.name}`} className="text-sm font-normal">
                                      {param.description || 'Enable this option'}
                                    </Label>
                                  </div>
                                ) : (
                                  <div>
                                    <Input
                                      id={`param-${index}-${param.name}`}
                                      type={param.type === 'number' ? 'number' : 'text'}
                                      value={linkedService.connectionParameters[param.name] || ''}
                                      onChange={(e) => {
                                        const value = param.type === 'number' ? 
                                          parseFloat(e.target.value) : e.target.value;
                                        handleParameterChange(param.name, value);
                                      }}
                                      placeholder={param.description}
                                      className="w-full"
                                    />
                                    {param.description && (
                                      <p className="text-xs text-gray-500 mt-1">{param.description}</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Authentication Method Selection */}
                    {linkedService.selectedConnectivityType && 
                     linkedService.selectedConnectionType && 
                     selectedConnectionTypeDetails && (
                      <div className="space-y-4">
                        <Separator />
                        <div>
                          <h4 className="text-sm font-medium mb-3">Authentication Method</h4>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor={`auth-method-${index}`}>Authentication Method *</Label>
                              <Select 
                                value={linkedService.credentialType || ''} 
                                onValueChange={(value) => {
                                  onUpdate(index, { 
                                    credentialType: value,
                                    credentials: {} // Reset credentials when changing auth method
                                  });
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select authentication method" />
                                </SelectTrigger>
                                <SelectContent>
                                  {(selectedConnectionTypeDetails.supportedCredentialTypes || []).map(credType => (
                                    <SelectItem key={credType} value={credType}>
                                      {credType.replace(/([A-Z])/g, ' $1').trim()}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Credential Configuration */}
                    {linkedService.credentialType && (
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-sm font-medium mb-3">Credentials</h4>
                          <div className="space-y-4">
                            {linkedService.credentialType === 'Anonymous' && (
                              <div className="text-sm text-muted-foreground">
                                No credentials required for anonymous authentication.
                              </div>
                            )}
                            
                            {linkedService.credentialType === 'Basic' && (
                              <>
                                <div className="space-y-2">
                                  <Label htmlFor={`username-${index}`}>
                                    Username <span className="text-red-500">*</span>
                                  </Label>
                                  <Input
                                    id={`username-${index}`}
                                    type="text"
                                    value={linkedService.credentials.username || ''}
                                    onChange={(e) => handleCredentialChange('username', e.target.value)}
                                    placeholder="Enter username"
                                    className="w-full"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`password-${index}`}>
                                    Password <span className="text-red-500">*</span>
                                  </Label>
                                  <Input
                                    id={`password-${index}`}
                                    type="password"
                                    value={linkedService.credentials.password || ''}
                                    onChange={(e) => handleCredentialChange('password', e.target.value)}
                                    placeholder="Enter password"
                                    className="w-full"
                                  />
                                </div>
                              </>
                            )}

                            {linkedService.credentialType === 'ServicePrincipal' && (
                              <>
                                <div className="space-y-2">
                                  <Label htmlFor={`sp-client-id-${index}`}>
                                    Client (Application) ID <span className="text-red-500">*</span>
                                  </Label>
                                  <Input
                                    id={`sp-client-id-${index}`}
                                    type="text"
                                    value={linkedService.credentials.servicePrincipalClientId || ''}
                                    onChange={(e) => handleCredentialChange('servicePrincipalClientId', e.target.value)}
                                    placeholder="Enter client ID (GUID)"
                                    className="w-full"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`sp-client-secret-${index}`}>
                                    Client Secret <span className="text-red-500">*</span>
                                  </Label>
                                  <Input
                                    id={`sp-client-secret-${index}`}
                                    type="password"
                                    value={linkedService.credentials.servicePrincipalSecret || ''}
                                    onChange={(e) => handleCredentialChange('servicePrincipalSecret', e.target.value)}
                                    placeholder="Enter client secret"
                                    className="w-full"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`sp-tenant-id-${index}`}>
                                    Tenant ID <span className="text-red-500">*</span>
                                  </Label>
                                  <Input
                                    id={`sp-tenant-id-${index}`}
                                    type="text"
                                    value={linkedService.credentials.tenantId || ''}
                                    onChange={(e) => handleCredentialChange('tenantId', e.target.value)}
                                    placeholder="Enter tenant ID (GUID)"
                                    className="w-full"
                                  />
                                </div>
                              </>
                            )}

                            {linkedService.credentialType === 'WorkspaceIdentity' && (
                              <div className="text-sm text-muted-foreground">
                                The workspace identity will be used for authentication. No additional credentials required.
                              </div>
                            )}

                            {linkedService.credentialType === 'OAuth2' && (
                              <>
                                <div className="space-y-2">
                                  <Label htmlFor={`oauth-client-id-${index}`}>
                                    Client ID <span className="text-red-500">*</span>
                                  </Label>
                                  <Input
                                    id={`oauth-client-id-${index}`}
                                    type="text"
                                    value={linkedService.credentials.clientId || ''}
                                    onChange={(e) => handleCredentialChange('clientId', e.target.value)}
                                    placeholder="Enter OAuth2 client ID"
                                    className="w-full"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`oauth-client-secret-${index}`}>
                                    Client Secret <span className="text-red-500">*</span>
                                  </Label>
                                  <Input
                                    id={`oauth-client-secret-${index}`}
                                    type="password"
                                    value={linkedService.credentials.clientSecret || ''}
                                    onChange={(e) => handleCredentialChange('clientSecret', e.target.value)}
                                    placeholder="Enter OAuth2 client secret"
                                    className="w-full"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`oauth-tenant-id-${index}`}>
                                    Tenant ID
                                  </Label>
                                  <Input
                                    id={`oauth-tenant-id-${index}`}
                                    type="text"
                                    value={linkedService.credentials.tenantId || ''}
                                    onChange={(e) => handleCredentialChange('tenantId', e.target.value)}
                                    placeholder="Enter tenant ID (optional)"
                                    className="w-full"
                                  />
                                </div>
                              </>
                            )}

                            {linkedService.credentialType === 'Key' && (
                              <div className="space-y-2">
                                <Label htmlFor={`key-${index}`}>
                                  Key <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  id={`key-${index}`}
                                  type="password"
                                  value={linkedService.credentials.key || ''}
                                  onChange={(e) => handleCredentialChange('key', e.target.value)}
                                  placeholder="Enter API key or access key"
                                  className="w-full"
                                />
                              </div>
                            )}

                            {linkedService.credentialType === 'SharedAccessSignature' && (
                              <div className="space-y-2">
                                <Label htmlFor={`sas-token-${index}`}>
                                  SAS Token <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  id={`sas-token-${index}`}
                                  type="password"
                                  value={linkedService.credentials.token || ''}
                                  onChange={(e) => handleCredentialChange('token', e.target.value)}
                                  placeholder="Enter SAS token (starting with ?sv=...)"
                                  className="w-full"
                                />
                                <p className="text-xs text-gray-500">
                                  Enter the full SAS token including all query parameters
                                </p>
                              </div>
                            )}

                            {linkedService.credentialType === 'Windows' && (
                              <>
                                <div className="space-y-2">
                                  <Label htmlFor={`win-username-${index}`}>
                                    Username <span className="text-red-500">*</span>
                                  </Label>
                                  <Input
                                    id={`win-username-${index}`}
                                    type="text"
                                    value={linkedService.credentials.username || ''}
                                    onChange={(e) => handleCredentialChange('username', e.target.value)}
                                    placeholder="Enter as DOMAIN\username or user@domain"
                                    className="w-full"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`win-password-${index}`}>
                                    Password <span className="text-red-500">*</span>
                                  </Label>
                                  <Input
                                    id={`win-password-${index}`}
                                    type="password"
                                    value={linkedService.credentials.password || ''}
                                    onChange={(e) => handleCredentialChange('password', e.target.value)}
                                    placeholder="Enter Windows account password"
                                    className="w-full"
                                  />
                                </div>
                              </>
                            )}

                            {linkedService.credentialType === 'WindowsWithoutImpersonation' && (
                              <div className="text-sm text-muted-foreground">
                                The gateway's service account will be used for authentication. No additional credentials required.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Skip Test Connection */}
                    {linkedService.selectedConnectivityType && 
                     linkedService.selectedConnectionType && 
                     selectedConnectionTypeDetails?.supportsSkipTestConnection && (
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`skip-test-${index}`}
                            checked={linkedService.skipTestConnection}
                            onCheckedChange={(checked) => onUpdate(index, { skipTestConnection: !!checked })}
                          />
                          <Label htmlFor={`skip-test-${index}`}>Skip Test Connection</Label>
                        </div>
                        <p className="text-xs text-gray-500">
                          Check this option to bypass connection testing during creation
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        )}
      </Collapsible>
    </Card>
  );
}

export function LinkedServiceConnectionPage() {
  // TEMP safeguard: eliminate "Cannot find name 'payload'" if a stray {payload} remains in JSX.
  // TODO: Search this file for any accidental standalone "payload" usage and remove it, then delete this line.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const payload: unknown = undefined;

  const { state, dispatch } = useAppContext();
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI / filtering state
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [visibleCount, setVisibleCount] = useState(40);
  const [statusFilter, setStatusFilter] = useState<'all' | 'configured' | 'pending' | 'failed' | 'skipped'>('all'); // added 'skipped'

  // Initialize LinkedServices from ADF components
  useEffect(() => {
    const initializeLinkedServices = async () => {
      setIsInitializing(true);
      try {
        // Extract LinkedServices from ADF components
        const linkedServices = linkedServiceConnectionService.extractLinkedServices(state.adfComponents);
        
        // Initialize connection mappings
        dispatch({
          type: 'SET_CONNECTION_MAPPINGS',
          payload: {
            linkedServices,
            availableGateways: [],
            supportedConnectionTypes: [],
            isLoading: false,
            error: null
          }
        });

        // Fetch both gateways and existing connections for auto-matching
        if (state.auth.accessToken) {
          await Promise.all([
            fetchGateways(),
            fetchExistingConnectionsForAutoMatch(linkedServices)
          ]);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize LinkedServices';
        setError(errorMessage);
        console.error('Error initializing LinkedServices:', err);
      } finally {
        setIsInitializing(false);
      }
    };

    if (state.adfComponents && state.adfComponents.length > 0) {
      initializeLinkedServices();
    }
  }, [state.adfComponents, state.auth.accessToken]); // Removed dispatch to prevent infinite loop

  const fetchGateways = async () => {
    if (!state.auth.accessToken) return;

    try {
      setIsLoading(true);
      const gateways = await linkedServiceConnectionService.fetchGateways(state.auth.accessToken);
      dispatch({ type: 'SET_AVAILABLE_GATEWAYS', payload: gateways });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch gateways';
      console.error('Failed to fetch gateways:', err);
      
      // Show API error details to user
      setError(`Gateway API Error: ${errorMessage}`);
      
      // Don't throw here as gateways might not be required for all connections
      dispatch({ type: 'SET_AVAILABLE_GATEWAYS', payload: [] });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchExistingConnectionsForAutoMatch = async (linkedServices: LinkedServiceConnection[]) => {
    if (!state.auth.accessToken || linkedServices.length === 0) return;

    try {
      setIsLoading(true);
      const existingConnections = await ExistingConnectionsService.getExistingConnections(state.auth.accessToken);
      
      // Auto-match LinkedServices to existing connections by name
      const updatedLinkedServices = linkedServices.map(ls => {
        // Check for FabricDataPipelines connections specifically
        if (ls.linkedServiceType === 'FabricDataPipelines') {
          // Look for existing FabricDataPipelines connections
          const fabricDataPipelinesConnection = existingConnections.find(
            conn => conn.connectionDetails.type === 'FabricDataPipelines'
          );

          if (fabricDataPipelinesConnection) {
            console.log(`Auto-matched FabricDataPipelines connection ${ls.linkedServiceName} to existing connection ${fabricDataPipelinesConnection.displayName}`);
            return {
              ...ls,
              mappingMode: 'existing' as const,
              existingConnectionId: fabricDataPipelinesConnection.id,
              existingConnection: fabricDataPipelinesConnection,
              status: 'configured' as const
            };
          } else {
            console.log(`No existing FabricDataPipelines connection found for ${ls.linkedServiceName}, defaulting to new connection mode`);
            return {
              ...ls,
              mappingMode: 'new' as const,
              status: 'pending' as const
            };
          }
        } else {
          // For regular LinkedServices, match by display name
          const matchingConnection = existingConnections.find(
            conn => conn.displayName === ls.linkedServiceName
          );

          if (matchingConnection) {
            console.log(`Auto-matched ${ls.linkedServiceName} to existing connection ${matchingConnection.displayName}`);
            return {
              ...ls,
              mappingMode: 'existing' as const,
              existingConnectionId: matchingConnection.id,
              existingConnection: matchingConnection,
              status: 'configured' as const
            };
          } else {
            return {
              ...ls,
              mappingMode: 'new' as const,
              status: 'pending' as const
            };
          }
        }
      });

      // Update the state with auto-matched connections
      dispatch({
        type: 'SET_CONNECTION_MAPPINGS',
        payload: {
          linkedServices: updatedLinkedServices,
          availableGateways: state.connectionMappings?.availableGateways || [],
          supportedConnectionTypes: state.connectionMappings?.supportedConnectionTypes || [],
          isLoading: false,
          error: null
        }
      });

      // Show summary of auto-matched connections
      const autoMatchedCount = updatedLinkedServices.filter(ls => ls.mappingMode === 'existing').length;
      if (autoMatchedCount > 0) {
        toast.success(`Auto-matched ${autoMatchedCount} LinkedService${autoMatchedCount > 1 ? 's' : ''} to existing connections`);
      }

    } catch (err) {
      console.error('Failed to fetch existing connections for auto-matching:', err);
      // Don't throw error here as this is just for convenience
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSupportedConnectionTypes = async (gatewayId?: string) => {
    if (!state.auth.accessToken) return;

    try {
      setIsLoading(true);
      const connectionTypes = await linkedServiceConnectionService.fetchSupportedConnectionTypes(
        state.auth.accessToken,
        gatewayId
      );
      
      console.log('Fetched connection types:', connectionTypes); // Debug log
      
      dispatch({ type: 'SET_SUPPORTED_CONNECTION_TYPES', payload: connectionTypes });
      
      // Clear any previous errors if successful
      if (connectionTypes && connectionTypes.length > 0) {
        setError(null);
      } else {
        setError('No supported connection types returned from API');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch supported connection types';
      console.error('Failed to fetch supported connection types:', err);
      
      // Show detailed API error to user
      setError(`Connection Types API Error: ${errorMessage}. Please check your authentication and permissions.`);
      
      // Set empty array to prevent undefined errors
      dispatch({ type: 'SET_SUPPORTED_CONNECTION_TYPES', payload: [] });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSupportedConnectionTypesForConnectivity = async (
    connectivityType: 'ShareableCloud' | 'OnPremisesGateway' | 'VirtualNetworkGateway',
    gatewayId?: string
  ) => {
    if (!state.auth.accessToken) return;

    try {
      setIsLoading(true);
      
      // For cloud connections, no gateway ID
      // For gateway connections, use the provided gateway ID
      const actualGatewayId = connectivityType === 'ShareableCloud' ? undefined : gatewayId;
      
      const connectionTypes = await linkedServiceConnectionService.fetchSupportedConnectionTypes(
        state.auth.accessToken,
        actualGatewayId
      );
      
      console.log(`Fetched connection types for ${connectivityType}:`, connectionTypes);
      
      dispatch({ type: 'SET_SUPPORTED_CONNECTION_TYPES', payload: connectionTypes });
      
      if (connectionTypes && connectionTypes.length > 0) {
        setError(null);
      } else {
        setError(`No supported connection types available for ${connectivityType} connectivity`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch supported connection types';
      console.error('Failed to fetch supported connection types:', err);
      
      setError(`Connection Types API Error: ${errorMessage}`);
      dispatch({ type: 'SET_SUPPORTED_CONNECTION_TYPES', payload: [] });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkedServiceUpdate = (index: number, update: Partial<LinkedServiceConnection>) => {
    dispatch({ type: 'UPDATE_LINKED_SERVICE', payload: { index, update } });
  };

  // Get current linked services from state
  const linkedServices = state.connectionMappings?.linkedServices || [];

  // Derive type options
  const typeOptions = useMemo(
    () => Array.from(new Set(linkedServices.map(ls => ls.linkedServiceType).filter(Boolean))),
    [linkedServices]
  );

  // Filtered list (includes skip awareness in status)
  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return linkedServices.filter(ls => {
      const name = (ls.linkedServiceName || '').toLowerCase();
      const type = (ls.linkedServiceType || '').toLowerCase();
      const matchesSearch = !term || name.includes(term) || type.includes(term);
      const matchesType = typeFilter === 'all' || ls.linkedServiceType === typeFilter;
      const normalizedStatus = ls.skip ? 'skipped' : ls.status;
      const matchesStatus = statusFilter === 'all' || normalizedStatus === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [linkedServices, search, typeFilter, statusFilter]);

  const originalTotalCount = linkedServices.length;
  const filteredCount = filtered.length;
  const totalCount = originalTotalCount; // ensure defined for UI references

  // Pagination slice
  const visible = filtered.slice(0, visibleCount);
  const canLoadMore = visibleCount < filtered.length;

  // Progress (replace previous configuredCount / progressPercentage block)
  // OLD:
  // const configuredCount = linkedServices.filter(ls => ls && (ls.status === 'configured' || ls.skip)).length;
  // const progressPercentage = originalTotalCount > 0 ? (configuredCount / originalTotalCount) * 100 : 100;

  // NEW granular status counts
  const configuredCount = linkedServices.filter(ls => ls && ls.status === 'configured' && !ls.skip).length;
  const failedCount = linkedServices.filter(ls => ls && ls.status === 'failed' && !ls.skip).length;
  const skippedCount = linkedServices.filter(ls => ls && (ls.skip || ls.status === 'skipped')).length;
  const pendingCount = linkedServices.filter(ls =>
    ls &&
    !ls.skip &&
    ls.status === 'pending'
  ).length;

  const effectiveTotal = totalCount || 0;
  const pct = (n: number) => effectiveTotal === 0 ? 0 : (n / effectiveTotal) * 100;

  const configuredPct = pct(configuredCount);
  const pendingPct = pct(pendingCount);
  const failedPct = pct(failedCount);
  const skippedPct = pct(skippedCount);

  // Skip-all helpers
  const filteredIds = useMemo(() => new Set(filtered.map(ls => ls.linkedServiceName)), [filtered]);
  const filteredSkippedCount = filtered.filter(ls => ls.skip).length;
  const allFilteredSkipped = filtered.length > 0 && filteredSkippedCount === filtered.length;
  const someFilteredSkipped = filteredSkippedCount > 0 && !allFilteredSkipped;

  const applySkipToFiltered = (skip: boolean) => {
    if (filtered.length === 0) return;
    const updated: LinkedServiceConnection[] = linkedServices.map(ls =>
      filteredIds.has(ls.linkedServiceName)
        ? {
            ...ls,
            skip,
            status: deriveStatusAfterSkip(ls, skip)
          }
        : ls
    );
    dispatch({ type: 'SET_LINKED_SERVICES', payload: updated });
  };

  // Helper to keep status literal typing when toggling skip
  const deriveStatusAfterSkip = useCallback(
    (ls: LinkedServiceConnection, skipFlag: boolean): LinkedServiceConnection['status'] => {
      if (skipFlag) return 'skipped';
      // If previously skipped, revert to pending so normal validation can recalc
      if (ls.status === 'skipped') return 'pending';
      return (ls.status || 'pending');
    },
    []
  );

  const canProceed = () => {
    if (linkedServices.length === 0) return true;
    return linkedServices.every(ls => ls.skip || ls.status === 'configured');
  };

  // ADD missing navigation handlers
  const handleNext = () => {
    if (canProceed()) {
      dispatch({ type: 'SET_CURRENT_STEP', payload: state.currentStep + 1 });
    }
  };

  const handleBack = () => {
    dispatch({ type: 'SET_CURRENT_STEP', payload: Math.max(0, state.currentStep - 1) });
  };

  const handleDownloadPlan = () => {
    try {
      const included = linkedServices.filter(ls => !ls.skip);
      const plan = linkedServiceConnectionService.generateConnectionDeploymentPlan(included);
      const blob = new Blob([plan], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fabric-connections-deployment-plan.json';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Deployment plan downloaded successfully');
    } catch (err) {
      console.error('Error generating deployment plan:', err);
      toast.error('Failed to generate deployment plan');
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground">Initializing LinkedService connections...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold">Configure LinkedService Connections</h1>
              <p className="text-muted-foreground mt-2">
                Set up Fabric connections for your Data Factory LinkedServices
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" onClick={handleDownloadPlan} disabled={configuredCount === 0}>
                <Download className="h-4 w-4 mr-2" />
                Download Plan
              </Button>
            </div>
          </div>

          {/* Progress */}
          {totalCount > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Configuration Progress</span>
                <span>{configuredCount} configured of {totalCount}</span>
              </div>
              <div className="h-3 w-full rounded bg-gray-200 overflow-hidden flex">
                {configuredPct > 0 && (
                  <div
                    className="bg-green-600 h-full"
                    style={{ width: `${configuredPct}%` }}
                    title={`Configured: ${configuredCount}`}
                  />
                )}
                {pendingPct > 0 && (
                  <div
                    className="bg-yellow-400 h-full"
                    style={{ width: `${pendingPct}%` }}
                    title={`Pending: ${pendingCount}`}
                  />
                )}
                {failedPct > 0 && (
                  <div
                    className="bg-red-500 h-full"
                    style={{ width: `${failedPct}%` }}
                    title={`Failed: ${failedCount}`}
                  />
                )}
                {skippedPct > 0 && (
                  <div
                    className="bg-gray-400 h-full"
                    style={{ width: `${skippedPct}%` }}
                    title={`Skipped: ${skippedCount}`}
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm bg-green-600" /> Configured {configuredCount}
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm bg-yellow-400" /> Pending {pendingCount}
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm bg-red-500" /> Failed {failedCount}
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm bg-gray-400" /> Skipped {skippedCount}
                </span>
                <span className="flex items-center gap-1 text-gray-500">
                  Total {totalCount}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <Alert className="mb-6">
            <Warning className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* LinkedServices Configuration */}
        {originalTotalCount === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No LinkedServices found in the uploaded ARM template.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                You can proceed to the next step.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Toolbar always visible when there are any LinkedServices */}
            <div className="ls-toolbar">
              <input
                className="ls-search"
                placeholder="Search connections..."
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setVisibleCount(40);
                }}
              />
              <select
                className="ls-filter"
                value={typeFilter}
                onChange={e => {
                  setTypeFilter(e.target.value);
                  setVisibleCount(40);
                }}
              >
                <option value="all">All types ({originalTotalCount})</option>
                {typeOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <select
                className="ls-filter"
                value={statusFilter}
                onChange={e => {
                  setStatusFilter(e.target.value as any);
                  setVisibleCount(40);
                }}
              >
                <option value="all">All statuses</option>
                <option value="configured">Configured</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
                <option value="skipped">Skipped</option>
              </select>
              <label className="flex items-center gap-1 text-xs select-none">
                <input
                  type="checkbox"
                  ref={el => {
                    if (el) el.indeterminate = someFilteredSkipped;
                  }}
                  checked={allFilteredSkipped}
                  onChange={e => applySkipToFiltered(e.target.checked)}
                  disabled={filtered.length === 0}
                />
                Skip All (filtered)
              </label>
              <div className="ls-count">
                {filteredCount > 0
                  ? `Showing ${visible.length} of ${filteredCount} (Total: ${originalTotalCount})`
                  : `0 of ${originalTotalCount} match`}
              </div>
              {filteredCount === 0 && (
                <button
                  type="button"
                  className="ls-loadMoreBtn"
                  onClick={() => {
                    setSearch('');
                    setTypeFilter('all');
                    setStatusFilter('all');
                    setVisibleCount(40);
                  }}
                >
                  Reset Filters
                </button>
              )}
            </div>

            <ScrollArea className="h-[calc(100vh-300px)]">
              <div className="space-y-4 pr-4">
                {filteredCount === 0 ? (
                  <div className="ls-empty">
                    No linked services match the current search / filters.
                  </div>
                ) : (
                  visible.map(linkedService => {
                    const originalIndex = linkedServices.findIndex(
                      ls => ls.linkedServiceName === linkedService.linkedServiceName
                    );
                    if (originalIndex === -1) return null;
                    return (
                      <ConnectionConfiguration
                        key={linkedService.linkedServiceName}
                        linkedService={linkedService}
                        index={originalIndex}
                        availableGateways={state.connectionMappings?.availableGateways || []}
                        supportedConnectionTypes={state.connectionMappings?.supportedConnectionTypes || []}
                        isLoading={isLoading}
                        onUpdate={handleLinkedServiceUpdate}
                        onFetchConnectionTypes={fetchSupportedConnectionTypesForConnectivity}
                      />
                    );
                  })
                )}
              </div>
            </ScrollArea>

            {filteredCount > 0 && canLoadMore && (
              <div className="ls-loadMoreRow">
                <button
                  className="ls-loadMoreBtn"
                  onClick={() => setVisibleCount(c => c + 40)}
                >
                  Load more ({filtered.length - visible.length} remaining)
                </button>
              </div>
            )}
          </div>
        )}

        {/* Navigation Debug */}
        <NavigationDebug 
          customConditions={[
            {
              label: 'LinkedServices Initialized',
              condition: !isInitializing,
              description: 'LinkedService initialization must be complete'
            },
            {
              label: 'Connection Data Loaded',
              condition: !isLoading,
              description: 'Connection types and gateways must finish loading'
            },
            {
              label: 'No Critical Errors',
              condition: !error,
              description: 'All API calls must complete successfully'
            }
          ]}
        />

        {/* Navigation */}
        <div className="flex justify-between items-center mt-8 pt-6 border-t">
          <Button variant="outline" onClick={handleBack}>
            Back
          </Button>
          
          <div className="flex items-center space-x-4">
            {!canProceed() && totalCount > 0 && (
              <div className="text-sm text-muted-foreground max-w-md">
                <p>Complete all LinkedService configurations to proceed</p>
                <p className="text-xs mt-1">
                  {configuredCount} of {totalCount} LinkedServices are configured
                </p>
              </div>
            )}
            <Button 
              onClick={handleNext} 
              disabled={!canProceed()}
              className="min-w-[200px]"
            >
              Continue to Deploy Connections
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}