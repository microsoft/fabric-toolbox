import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  CheckCircle, 
  XCircle, 
  Warning, 
  Download, 
  Play, 
  CircleNotch,
  CaretDown, 
  CaretRight,
  Shield
} from '@phosphor-icons/react';
import { useAppContext } from '../../contexts/AppContext';
import { connectionDeploymentService } from '../../services/connectionDeploymentService';
import { workspaceIdentityService } from '../../services/workspaceIdentityService';
import { toast } from 'sonner';
import type { LinkedServiceConnection, ConnectionDeploymentResult, WorkspaceIdentityInfo } from '../../types';

interface DeployConnectionsPageProps {}

export function DeployConnectionsPage({}: DeployConnectionsPageProps) {
  const { state, dispatch } = useAppContext();
  
  // Component state
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentProgress, setDeploymentProgress] = useState(0);
  const [currentDeployment, setCurrentDeployment] = useState<string>('');
  const [deploymentLog, setDeploymentLog] = useState<string[]>([]);
  const [showFullLog, setShowFullLog] = useState(false);
  const [deploymentStarted, setDeploymentStarted] = useState(false);
  
  // Workspace Identity state
  const [workspaceIdentityStatus, setWorkspaceIdentityStatus] = useState<'idle' | 'checking' | 'creating' | 'ready' | 'error'>('idle');
  const [workspaceIdentity, setWorkspaceIdentity] = useState<WorkspaceIdentityInfo | null>(null);
  const [workspaceIdentityError, setWorkspaceIdentityError] = useState<string | null>(null);

  // Derive deploy candidates (exclude skipped)
  const deployableConnections = (state.connectionMappings?.linkedServices || [])
    .filter(ls => ls?.mappingMode === 'new' && !ls.skip);

  // Collections & derived lists
  const linkedServices = state.connectionMappings?.linkedServices || [];
  const existingMappings = linkedServices.filter(ls => ls?.mappingMode === 'existing' && !ls.skip);
  const deploymentResults = state.connectionDeploymentResults || [];
  const hasNewConnections = deployableConnections.length > 0; // single authoritative declaration
  const allDeployableConfigured = deployableConnections.every(ls => ls.status === 'configured');
  // (Removed unused canProceed / allConfigured / duplicate hasNewConnections / undefined newConnections)

  // Check if we need workspace identity for any connections with WorkspaceIdentity credential type
  const needsWorkspaceIdentity = deployableConnections.some(connection => connection.credentialType === 'WorkspaceIdentity');
  
  // Add log entry
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDeploymentLog(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  // Ensure workspace identity exists if needed
  const ensureWorkspaceIdentity = async (): Promise<WorkspaceIdentityInfo | null> => {
    if (!needsWorkspaceIdentity || !state.selectedWorkspace) {
      return null; // No workspace identity needed
    }

    setWorkspaceIdentityStatus('checking');
    setWorkspaceIdentityError(null);
    addLog('Checking workspace identity...');

    try {
      const identity = await workspaceIdentityService.ensureWorkspaceIdentity(state.selectedWorkspace.id);
      setWorkspaceIdentity(identity);
      setWorkspaceIdentityStatus('ready');
      addLog(`✓ Workspace identity ready: ${identity.applicationId}`);
      return identity;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setWorkspaceIdentityError(errorMessage);
      setWorkspaceIdentityStatus('error');
      addLog(`✗ Failed to ensure workspace identity: ${errorMessage}`);
      throw error;
    }
  };

  // Check workspace identity on component mount if needed
  useEffect(() => {
    if (needsWorkspaceIdentity && workspaceIdentityStatus === 'idle' && state.selectedWorkspace) {
      ensureWorkspaceIdentity().catch(() => {
        // Error handling already done in ensureWorkspaceIdentity
      });
    }
  }, [needsWorkspaceIdentity, state.selectedWorkspace]);

  // Deploy connections
  const handleDeploy = async () => {
    if (!state.auth.accessToken || !state.selectedWorkspace) {
      toast.error('Authentication or workspace not available');
      return;
    }

    if (!allDeployableConfigured) {
      toast.error('All deployable (non-skipped) connections must be configured before deployment');
      return;
    }

    setIsDeploying(true);
    setDeploymentStarted(true);
    setDeploymentProgress(0);
    setDeploymentLog([]);
    addLog(`Starting deployment of ${deployableConnections.length} connections`);
    addLog(`Workspace: ${state.selectedWorkspace.name}`);

    try {
      // Ensure workspace identity if needed before deploying connections
      if (needsWorkspaceIdentity) {
        addLog('Ensuring workspace identity for WorkspaceIdentity connections...');
        await ensureWorkspaceIdentity();
      }

      const results = await connectionDeploymentService.deployNewConnections(
        deployableConnections,
        state.auth.accessToken,
        state.selectedWorkspace.id
      );

      // Update progress as deployment progresses
      let completed = 0;
      // Simulated progress interval (optional visual feedback)
      const intervalId = setInterval(() => {
        if (completed < deployableConnections.length) {
          completed++;
          setDeploymentProgress((completed / deployableConnections.length) * 100);
          setCurrentDeployment(deployableConnections[completed - 1]?.linkedServiceName || '');
          addLog(`Deployed connection ${completed} of ${deployableConnections.length}`);
        } else {
          clearInterval(intervalId);
          setDeploymentProgress(100);
          setCurrentDeployment('');
        }
      }, 1000);

      // Store results
      dispatch({ type: 'SET_CONNECTION_DEPLOYMENT_RESULTS', payload: results });
      addLog('Deployment completed');
      
      if (results.some(r => r.status === 'success')) {
        toast.success('Connection deployment completed');
      }
      if (results.some(r => r.status === 'failed')) {
        toast.error('Some connections failed to deploy');
      }
    } catch (error) {
      console.error('Deployment failed:', error);
      addLog(`Deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      toast.error('Deployment failed');
    } finally {
      setIsDeploying(false);
      setDeploymentProgress(100);
    }
  };

  // Generate deployment plan
  const generateDeploymentPlan = () => {
    try {
      const plan = connectionDeploymentService.generateDeploymentPlanJson(deployableConnections);
      const blob = new Blob([plan], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fabric-connections-deployment-plan-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Deployment plan downloaded');
    } catch (error) {
      console.error('Failed to generate deployment plan:', error);
      toast.error('Failed to generate deployment plan');
    }
  };

  // Download deployment log
  const downloadLog = () => {
    const logContent = [
      '=== FABRIC CONNECTIONS DEPLOYMENT LOG ===',
      `Deployment Date: ${new Date().toISOString()}`,
      `Workspace: ${state.selectedWorkspace?.name || 'Unknown'}`,
      '',
      '=== DEPLOYMENT RESULTS ===',
      ...deploymentResults.map(result => 
        `${result.linkedServiceName}: ${result.status.toUpperCase()}` +
        (result.fabricConnectionId ? ` (ID: ${result.fabricConnectionId})` : '') +
        (result.errorMessage ? ` - Error: ${result.errorMessage}` : '')
      ),
      '',
      '=== DEPLOYMENT LOG ===',
      ...deploymentLog
    ].join('\n');

    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fabric-connections-deployment-log-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Deployment log downloaded');
  };

  // Navigation functions
  const goNext = () => {
    dispatch({ type: 'SET_CURRENT_STEP', payload: 6 }); // Go to Validation page (step 6)
  };

  const goPrevious = () => {
    dispatch({ type: 'SET_CURRENT_STEP', payload: 4 }); // Go back to LinkedService Configuration (step 4)
  };

  // Get status icon for deployment results
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'skipped':
        return <Warning className="h-5 w-5 text-yellow-600" />;
      default:
        return <Warning className="h-5 w-5 text-gray-600" />;
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Deploy Fabric Connections</h1>
        <p className="text-muted-foreground">
          Deploy newly configured connections to Microsoft Fabric workspace
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">New Connections</CardTitle>
            <CardDescription>To be created in Fabric</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{deployableConnections.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Existing Mappings</CardTitle>
            <CardDescription>Mapped to existing connections</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">{existingMappings.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total LinkedServices</CardTitle>
            <CardDescription>All configured services</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{linkedServices.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Workspace Identity Status */}
      {needsWorkspaceIdentity && (
        <Card className="mb-6 border-info bg-info/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield size={16} className="text-info" />
              Workspace Identity Required
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Some connections use WorkspaceIdentity authentication and require a workspace managed identity.
              </p>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {workspaceIdentityStatus === 'idle' && (
                    <>
                      <div className="w-2 h-2 bg-muted rounded-full" />
                      <span className="text-sm text-muted-foreground">Not checked</span>
                    </>
                  )}
                  {workspaceIdentityStatus === 'checking' && (
                    <>
                      <div className="w-2 h-2 bg-warning rounded-full animate-pulse" />
                      <span className="text-sm text-warning">Checking workspace identity...</span>
                    </>
                  )}
                  {workspaceIdentityStatus === 'creating' && (
                    <>
                      <div className="w-2 h-2 bg-warning rounded-full animate-pulse" />
                      <span className="text-sm text-warning">Creating workspace identity...</span>
                    </>
                  )}
                  {workspaceIdentityStatus === 'ready' && workspaceIdentity && (
                    <>
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-sm text-green-700">Ready</span>
                    </>
                  )}
                  {workspaceIdentityStatus === 'error' && (
                    <>
                      <div className="w-2 h-2 bg-destructive rounded-full" />
                      <span className="text-sm text-destructive">Error</span>
                    </>
                  )}
                </div>
                
                {workspaceIdentity && (
                  <div className="text-xs text-muted-foreground font-mono">
                    {workspaceIdentity.applicationId.slice(0, 8)}...
                  </div>
                )}
              </div>

              {workspaceIdentityError && (
                <Alert className="border-destructive bg-destructive/5">
                  <Warning size={16} />
                  <AlertDescription className="text-sm">
                    {workspaceIdentityError}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* New Connections Summary */}
      {hasNewConnections && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>New Connections to Deploy</CardTitle>
            <CardDescription>
              These connections will be created in your Fabric workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {deployableConnections.map((connection, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{connection.linkedServiceName}</div>
                    <div className="text-sm text-muted-foreground">
                      {connection.selectedConnectionType} • {connection.selectedConnectivityType}
                      {connection.selectedGatewayId && (
                        <span> • Gateway: {connection.selectedGatewayId}</span>
                      )}
                    </div>
                  </div>
                  <Badge variant={connection.status === 'configured' ? 'default' : 'secondary'}>
                    {connection.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Mappings Summary */}
      {existingMappings.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Existing Connection Mappings</CardTitle>
            <CardDescription>
              These LinkedServices are mapped to existing Fabric connections
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {existingMappings.map((connection, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg bg-green-50">
                  <div className="flex-1">
                    <div className="font-medium">{connection.linkedServiceName}</div>
                    <div className="text-sm text-muted-foreground">
                      Mapped to: {connection.existingConnection?.displayName || 'Unknown Connection'}
                      <span className="ml-2">({connection.existingConnection?.connectionDetails.type})</span>
                    </div>
                  </div>
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deployment Actions */}
      {hasNewConnections && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Deployment Actions</CardTitle>
            <CardDescription>
              Deploy new connections or download deployment plan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                onClick={generateDeploymentPlan}
                variant="outline"
                className="flex-1"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Deployment Plan
              </Button>

              <Button
                onClick={handleDeploy}
                disabled={!allDeployableConfigured || isDeploying}
                className="flex-1"
              >
                {isDeploying ? (
                  <CircleNotch className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {isDeploying ? 'Deploying...' : 'Deploy Connections'}
              </Button>
            </div>
            {!allDeployableConfigured && (
              <Alert className="mt-4">
                <Warning className="h-4 w-4" />
                <AlertDescription>
                  All deployable (non-skipped) connections must be configured before deployment.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Deployment Progress */}
      {isDeploying && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Deployment Progress</CardTitle>
            <CardDescription>
              Creating connections in Fabric workspace: {currentDeployment}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={deploymentProgress} className="mb-4" />
            <div className="text-sm text-muted-foreground">
              {Math.round(deploymentProgress)}% Complete
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deployment Results */}
      {deploymentResults.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Deployment Results</CardTitle>
            <CardDescription>
              Results of connection deployment to Fabric
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {deploymentResults.map((result, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3 flex-1">
                    {getStatusIcon(result.status)}
                    <div>
                      <div className="font-medium">{result.linkedServiceName}</div>
                      {result.fabricConnectionId && (
                        <div className="text-sm text-muted-foreground">
                          Connection ID: {result.fabricConnectionId}
                        </div>
                      )}
                      {result.errorMessage && (
                        <div className="text-sm text-red-600">
                          {result.errorMessage}
                        </div>
                      )}
                    </div>
                  </div>
                  <Badge variant={
                    result.status === 'success' ? 'default' : 
                    result.status === 'failed' ? 'destructive' : 'secondary'
                  }>
                    {result.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deployment Log */}
      {deploymentLog.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <Collapsible open={showFullLog} onOpenChange={setShowFullLog}>
              <CollapsibleTrigger className="flex items-center justify-between w-full">
                <div>
                  <CardTitle>Deployment Log</CardTitle>
                  <CardDescription>
                    Detailed log of deployment process
                  </CardDescription>
                </div>
                {showFullLog ? (
                  <CaretDown className="h-4 w-4" />
                ) : (
                  <CaretRight className="h-4 w-4" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                <div className="bg-gray-50 p-4 rounded-lg max-h-60 overflow-y-auto">
                  <pre className="text-sm">
                    {deploymentLog.join('\n')}
                  </pre>
                </div>
                <Button
                  onClick={downloadLog}
                  variant="outline"
                  size="sm"
                  className="mt-2"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Log
                </Button>
              </CollapsibleContent>
            </Collapsible>
          </CardHeader>
        </Card>
      )}

      {/* No New Connections Message */}
      {!hasNewConnections && (
        <Card className="mb-6">
          <CardContent className="p-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No New Connections to Deploy</h3>
            <p className="text-muted-foreground">
              All LinkedServices are mapped to existing Fabric connections. 
              No deployment is needed.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button onClick={goPrevious} variant="outline">
          Previous: Configure Connections
        </Button>

        <Button 
          onClick={goNext}
          disabled={hasNewConnections && (deploymentResults.length === 0 && !deploymentStarted)}
        >
          Next: Validate Components
        </Button>
      </div>
    </div>
  );
}