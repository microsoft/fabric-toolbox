import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, ArrowRight, Download, ExternalLink, Search } from '@phosphor-icons/react';
import { useAppContext } from '../../../contexts/AppContext';
import { ExistingConnectionsService, ExistingFabricConnection } from '../../../services/existingConnectionsService';
import { ConnectionDeploymentService, ConnectionDeploymentPlan } from '../../../services/connectionDeploymentService';
import { LinkedServiceConnectionService } from '../../../services/linkedServiceConnectionService';
import { toast } from 'sonner';

export function EnhancedLinkedServiceConnectionPage() {
  const { state, dispatch } = useAppContext();
  const [existingConnections, setExistingConnections] = useState<ExistingFabricConnection[]>([]);
  const [filteredConnections, setFilteredConnections] = useState<ExistingFabricConnection[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoadingConnections, setIsLoadingConnections] = useState(false);
  const [deploymentPlan, setDeploymentPlan] = useState<ConnectionDeploymentPlan | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);

  // Load existing connections on component mount
  useEffect(() => {
    loadExistingConnections();
  }, [state.selectedWorkspace]);

  // Filter connections based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredConnections(existingConnections);
    } else {
      const filtered = ExistingConnectionsService.searchConnections(existingConnections, searchTerm);
      setFilteredConnections(filtered);
    }
  }, [existingConnections, searchTerm]);

  const loadExistingConnections = async () => {
    if (!state.auth.accessToken || !state.selectedWorkspace) {
      return;
    }

    setIsLoadingConnections(true);
    try {
      const connections = await ExistingConnectionsService.getExistingConnections(
        state.auth.accessToken,
        state.selectedWorkspace.id
      );
      setExistingConnections(connections);
    } catch (error) {
      console.error('Failed to load existing connections:', error);
      toast.error('Failed to load existing connections. You can still create new connections.');
    } finally {
      setIsLoadingConnections(false);
    }
  };

  const handleConnectionOptionChange = (linkedServiceName: string, option: 'existing' | 'new') => {
    const updatedLinkedServices = state.connectionMappings.linkedServices.map(ls =>
      ls.linkedServiceName === linkedServiceName
        ? { ...ls, connectionOption: option, selectedExistingConnectionId: undefined }
        : ls
    );

    dispatch({
      type: 'SET_CONNECTION_MAPPINGS',
      payload: {
        ...state.connectionMappings,
        linkedServices: updatedLinkedServices
      }
    });
  };

  const handleExistingConnectionSelect = (linkedServiceName: string, connectionId: string) => {
    const updatedLinkedServices = state.connectionMappings.linkedServices.map(ls =>
      ls.linkedServiceName === linkedServiceName
        ? { ...ls, selectedExistingConnectionId: connectionId, status: 'configured' }
        : ls
    );

    dispatch({
      type: 'SET_CONNECTION_MAPPINGS',
      payload: {
        ...state.connectionMappings,
        linkedServices: updatedLinkedServices
      }
    });
  };

  const handleNewConnectionUpdate = (linkedServiceName: string, updates: Partial<any>) => {
    const updatedLinkedServices = state.connectionMappings.linkedServices.map(ls =>
      ls.linkedServiceName === linkedServiceName
        ? { ...ls, ...updates, status: 'configured' }
        : ls
    );

    dispatch({
      type: 'SET_CONNECTION_MAPPINGS',
      payload: {
        ...state.connectionMappings,
        linkedServices: updatedLinkedServices
      }
    });
  };

  const generateDeploymentPlan = () => {
    if (!state.selectedWorkspace) return;

    const plan = ConnectionDeploymentService.generateDeploymentPlan(
      state.selectedWorkspace.id,
      state.connectionMappings.linkedServices
    );
    setDeploymentPlan(plan);
  };

  const downloadDeploymentPlan = () => {
    if (deploymentPlan) {
      ConnectionDeploymentService.downloadDeploymentPlan(deploymentPlan);
      toast.success('Deployment plan downloaded successfully');
    }
  };

  const deployConnections = async () => {
    if (!state.auth.accessToken || !state.selectedWorkspace) {
      toast.error('Authentication or workspace not available');
      return;
    }

    setIsDeploying(true);
    try {
      const results = await ConnectionDeploymentService.deployConnections(
        state.auth.accessToken,
        state.selectedWorkspace.id,
        state.connectionMappings.linkedServices
      );

      dispatch({ type: 'SET_CONNECTION_DEPLOYMENT_RESULTS', payload: results });

      const successCount = results.filter(r => r.status === 'success').length;
      const failureCount = results.filter(r => r.status === 'failed').length;

      if (failureCount > 0) {
        toast.error(`Deployment completed with ${failureCount} failures and ${successCount} successes`);
      } else {
        toast.success(`All ${successCount} connections deployed successfully`);
      }

      // Refresh existing connections to include newly created ones
      await loadExistingConnections();

    } catch (error) {
      console.error('Deployment failed:', error);
      toast.error('Connection deployment failed');
    } finally {
      setIsDeploying(false);
    }
  };

  const canProceed = () => {
    return state.connectionMappings.linkedServices.every(ls => 
      ls.connectionOption && 
      (ls.connectionOption === 'existing' ? ls.selectedExistingConnectionId : ls.status === 'configured')
    );
  };

  const handleNext = () => {
    if (canProceed()) {
      dispatch({ type: 'SET_STEP', payload: state.currentStep + 1 });
    }
  };

  const handlePrevious = () => {
    dispatch({ type: 'SET_STEP', payload: state.currentStep - 1 });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Configure LinkedService Connections</h1>
            <p className="text-muted-foreground mt-2">
              Map each Data Factory LinkedService to either an existing Fabric connection or configure a new one
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={generateDeploymentPlan} disabled={!canProceed()}>
              <Download className="w-4 h-4 mr-2" />
              Generate Plan
            </Button>
            {deploymentPlan && (
              <Button variant="outline" onClick={downloadDeploymentPlan}>
                <Download className="w-4 h-4 mr-2" />
                Download Plan
              </Button>
            )}
          </div>
        </div>

        {/* Existing Connections Overview */}
        {existingConnections.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Available Existing Connections
                <Badge variant="secondary">{existingConnections.length}</Badge>
              </CardTitle>
              <CardDescription>
                You have {existingConnections.length} existing connections in this workspace that can be reused
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search existing connections..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredConnections.slice(0, 6).map(connection => (
                    <div key={connection.id} className="p-3 border rounded-lg bg-card">
                      <div className="font-medium text-sm">{connection.displayName}</div>
                      <div className="text-xs text-muted-foreground">
                        {connection.connectionDetails.type} ({ExistingConnectionsService.formatConnectionForDisplay(connection).split('(')[1]?.replace(')', '')})
                      </div>
                    </div>
                  ))}
                  {filteredConnections.length > 6 && (
                    <div className="p-3 border rounded-lg bg-muted/50 flex items-center justify-center">
                      <span className="text-sm text-muted-foreground">
                        +{filteredConnections.length - 6} more...
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* LinkedServices Configuration */}
        <div className="space-y-6">
          {state.connectionMappings.linkedServices.map((linkedService, index) => (
            <Card key={linkedService.linkedServiceName} className="relative">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span>{linkedService.linkedServiceName}</span>
                    <Badge variant="outline">{linkedService.linkedServiceType}</Badge>
                    {linkedService.status === 'configured' && (
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        Configured
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {index + 1} of {state.connectionMappings.linkedServices.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Connection Option Selection */}
                <div className="space-y-4">
                  <Label className="text-base font-medium">Connection Strategy</Label>
                  <RadioGroup
                    value={linkedService.connectionOption || ''}
                    onValueChange={(value) => handleConnectionOptionChange(linkedService.linkedServiceName, value as 'existing' | 'new')}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="existing" id={`existing-${index}`} />
                      <Label htmlFor={`existing-${index}`}>
                        Map to Existing Connection
                        {existingConnections.length === 0 && (
                          <span className="text-muted-foreground text-sm ml-2">(No existing connections available)</span>
                        )}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="new" id={`new-${index}`} />
                      <Label htmlFor={`new-${index}`}>Configure New Connection</Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Existing Connection Selection */}
                {linkedService.connectionOption === 'existing' && (
                  <div className="space-y-4 p-4 border border-blue-200 rounded-lg bg-blue-50">
                    <div className="flex items-center gap-2">
                      <ExternalLink className="w-4 h-4 text-blue-600" />
                      <Label className="font-medium text-gray-900">Select Existing Connection</Label>
                    </div>
                    {isLoadingConnections ? (
                      <div className="text-center py-4">
                        <div className="text-sm text-muted-foreground">Loading connections...</div>
                      </div>
                    ) : existingConnections.length > 0 ? (
                      <Select
                        value={linkedService.selectedExistingConnectionId || ''}
                        onValueChange={(value) => handleExistingConnectionSelect(linkedService.linkedServiceName, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose an existing connection..." />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredConnections.map(connection => (
                            <SelectItem key={connection.id} value={connection.id}>
                              {ExistingConnectionsService.formatConnectionForDisplay(connection)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Alert>
                        <AlertDescription>
                          No existing connections found in this workspace. Please select "Configure New Connection" instead.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {/* New Connection Configuration */}
                {linkedService.connectionOption === 'new' && (
                  <div className="space-y-4 p-4 border border-green-200 rounded-lg bg-green-50">
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 text-green-600">+</span>
                      <Label className="font-medium text-gray-900">Configure New Connection</Label>
                    </div>
                    
                    {/* Simplified new connection form - you can expand this */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Connection Type</Label>
                        <Select
                          value={linkedService.selectedConnectionType || ''}
                          onValueChange={(value) => handleNewConnectionUpdate(linkedService.linkedServiceName, { selectedConnectionType: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select connection type..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SQL">SQL Server</SelectItem>
                            <SelectItem value="AzureDataLakeStorage">Azure Data Lake Storage</SelectItem>
                            <SelectItem value="AzureBlobStorage">Azure Blob Storage</SelectItem>
                            <SelectItem value="Web">Web/HTTP</SelectItem>
                            <SelectItem value="AzureFunction">Azure Function</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Connectivity Type</Label>
                        <Select
                          value={linkedService.selectedConnectivityType || ''}
                          onValueChange={(value) => handleNewConnectionUpdate(linkedService.linkedServiceName, { selectedConnectivityType: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select connectivity..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ShareableCloud">Cloud Connection</SelectItem>
                            <SelectItem value="OnPremisesGateway">On-Premises Gateway</SelectItem>
                            <SelectItem value="VirtualNetworkGateway">Virtual Network Gateway</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Basic connection parameters */}
                    <div className="space-y-3">
                      <Label>Connection Parameters</Label>
                      <Textarea
                        placeholder="Enter connection parameters as key=value pairs, one per line..."
                        className="min-h-20"
                        value={Object.entries(linkedService.connectionParameters || {}).map(([k, v]) => `${k}=${v}`).join('\n')}
                        onChange={(e) => {
                          const params: Record<string, any> = {};
                          e.target.value.split('\n').forEach(line => {
                            const [key, ...valueParts] = line.split('=');
                            if (key?.trim() && valueParts.length > 0) {
                              params[key.trim()] = valueParts.join('=').trim();
                            }
                          });
                          handleNewConnectionUpdate(linkedService.linkedServiceName, { connectionParameters: params });
                        }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Deployment Section */}
        {deploymentPlan && (
          <Card>
            <CardHeader>
              <CardTitle>Deployment Summary</CardTitle>
              <CardDescription>
                Review the planned connection operations before proceeding
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{deploymentPlan.summary.totalNew}</div>
                  <div className="text-sm text-gray-700">New Connections</div>
                </div>
                <div className="text-center p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{deploymentPlan.summary.totalExisting}</div>
                  <div className="text-sm text-gray-700">Existing Mappings</div>
                </div>
                <div className="text-center p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{deploymentPlan.summary.totalMappings}</div>
                  <div className="text-sm text-gray-700">Total Mappings</div>
                </div>
              </div>
              
              <Button 
                onClick={deployConnections} 
                disabled={isDeploying}
                className="w-full"
                size="lg"
              >
                {isDeploying ? 'Deploying Connections...' : 'Deploy Connections'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Connection Deployment Results */}
        {state.connectionDeploymentResults.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Deployment Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {state.connectionDeploymentResults.map((result, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        result.status === 'success' ? 'bg-green-500' : 
                        result.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                      }`} />
                      <span className="font-medium">{result.linkedServiceName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        result.status === 'success' ? 'default' : 
                        result.status === 'failed' ? 'destructive' : 'secondary'
                      }>
                        {result.status}
                      </Badge>
                      {result.errorMessage && (
                        <span className="text-sm text-red-600">{result.errorMessage}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-between">
          <Button variant="outline" onClick={handlePrevious}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          <Button 
            onClick={handleNext} 
            disabled={!canProceed()}
          >
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}