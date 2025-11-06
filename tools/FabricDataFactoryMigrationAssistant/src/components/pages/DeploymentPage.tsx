import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Play, 
  Download, 
  ArrowUpRight,
  Warning,
  FileText
} from '@phosphor-icons/react';
import { WizardLayout } from '../WizardLayout';
import { WorkspaceDisplay } from '../WorkspaceDisplay';
import { ApiErrorDetails } from '../ApiErrorDetails';
import { FolderDeploymentResults } from './deployment/FolderDeploymentResults';
import { useAppContext } from '../../contexts/AppContext';
import { fabricService } from '../../services/fabricService';
import { DeploymentResult, MigrationStep } from '../../types';
import { toast } from 'sonner';

export function DeploymentPage() {
  const { state, dispatch } = useAppContext();
  const [isDeploying, setIsDeploying] = useState(false);
  const [currentStep, setCurrentStep] = useState<MigrationStep | null>(null);
  const [progress, setProgress] = useState(0);
  const [deploymentLog, setDeploymentLog] = useState<string[]>([]);

  // NOTE: This page now only handles Data Factory component deployment.
  // Connection deployment is handled by the separate DeployConnectionsPage component.

  const startDeployment = async () => {
    if (!state.auth.accessToken || !state.selectedWorkspace?.id) {
      return;
    }

    setIsDeploying(true);
    setProgress(0);
    setDeploymentLog(['Starting Data Factory component deployment...', 'Deploying: Variables → Pipelines → Schedules']);
    dispatch({ type: 'SET_DEPLOYMENT_RESULTS', payload: [] });

    try {
      // Deploy Components (excluding connections which are handled separately)
      setDeploymentLog(prev => [...prev, '🏗️ Deploying Data Factory components...']);
      
      // Filter out linkedServices and integrationRuntimes as they are handled in the DeployConnectionsPage
      const nonConnectionComponents = (state.selectedComponents || []).filter(component => 
        component.type !== 'linkedService' && component.type !== 'integrationRuntime'
      );
      
      // Convert components to ComponentMapping for deployment
      const componentMappings = nonConnectionComponents.map(component => ({
        component,
        fabricTarget: component?.fabricTarget,
        useExisting: false
      })).filter(mapping => mapping.component && mapping.fabricTarget);

      const results = await fabricService.deployComponents(
        componentMappings,
        state.auth.accessToken!,
        state.selectedWorkspace.id,
        (progress) => {
          setProgress((progress.current / progress.total) * 100);
          setCurrentStep({
            id: `deploy-components`,
            title: 'Deploying Data Factory Components',
            description: progress.status,
            status: 'inProgress'
          });
          setDeploymentLog(prev => [...prev, progress.status]);
        },
        // Connection results are handled by separate deployment flow
        [],
        // Pipeline connection mappings for activity transformation (OLD format - backward compatibility)
        state.pipelineConnectionMappings || {},
        // Pipeline reference mappings for Custom activity transformation (NEW referenceId-based)
        state.pipelineReferenceMappings || {},
        // LinkedService bridge for Custom activity fallback
        state.linkedServiceConnectionBridge || {},
        // Variable Library configuration for global parameter transformation
        state.variableLibraryConfig || undefined
      );

      // Process all results
      (results || []).forEach(result => {
        if (result) {
          dispatch({ type: 'ADD_DEPLOYMENT_RESULT', payload: result });
          
          // Show specific error toast for failed deployments
          if (result.status === 'failed') {
            toast.error(`Failed to create ${result.componentName}`, {
              description: result.error || result.errorMessage,
              duration: 8000,
            });
          }
        }
      });

      // Get and dispatch folder deployment results
      const folderResults = fabricService.getLastFolderDeploymentResults();
      if (folderResults.length > 0) {
        dispatch({ type: 'SET_FOLDER_DEPLOYMENT_RESULTS', payload: folderResults });
        console.log('Stored folder deployment results in state:', {
          totalFolders: folderResults.length,
          successful: folderResults.filter(r => r.status === 'success').length
        });
      }

      setProgress(100);
      setDeploymentLog(prev => [...prev, '🎉 Deployment completed!']);
      
      setCurrentStep({
        id: 'deployment-complete',
        title: 'Deployment Complete',
        description: 'All components have been processed',
        status: 'completed'
      });

      // Calculate totals for success message
      const totalComponents = (results || []).length;

      toast.success('Deployment completed', {
        description: `Processed ${totalComponents} components`
      });

      setDeploymentLog(prev => [...prev, 'Data Factory component deployment completed!']);
    } catch (error) {
      const errorMessage = `Deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      setDeploymentLog(prev => [...prev, errorMessage]);
    } finally {
      setIsDeploying(false);
      setCurrentStep(null);
    }
  };

  const downloadDeploymentPlan = () => {
    if (!state.selectedWorkspace?.id || !state.selectedWorkspace?.name) {
      toast.error('No workspace selected');
      return;
    }

    try {
      // Filter out linkedServices and integrationRuntimes as they are handled in the DeployConnectionsPage
      const nonConnectionComponents = (state.selectedComponents || []).filter(component => 
        component.type !== 'linkedService' && component.type !== 'integrationRuntime'
      );
      
      // Convert ADFComponent[] to ComponentMapping[]
      const componentMappings = nonConnectionComponents.map(component => ({
        component,
        fabricTarget: component?.fabricTarget,
        useExisting: false
      })).filter(mapping => mapping.component && mapping.fabricTarget);

      const plan = fabricService.generateDeploymentPlan(
        componentMappings,
        state.selectedWorkspace.id,
        state.auth.accessToken!,
        state.pipelineConnectionMappings
      );

      const blob = new Blob([plan], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fabric-adf-components-deployment-plan-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Data Factory components deployment plan downloaded successfully');
    } catch (error) {
      console.error('Error generating deployment plan:', error);
      toast.error('Failed to generate deployment plan');
    }
  };

  const downloadLog = () => {
    const logContent = (deploymentLog || []).join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adf-fabric-migration-log-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const successfulDeployments = (state.deploymentResults || []).filter(r => r && r.status === 'success');
  const failedDeployments = (state.deploymentResults || []).filter(r => r && r.status === 'failed');
  const skippedDeployments = (state.deploymentResults || []).filter(r => r && r.status === 'skipped');

  const hasStartedDeployment = (state.deploymentResults || []).length > 0 || isDeploying;

  return (
    <WizardLayout
      title="Deploy to Fabric"
      description="Execute the migration by creating resources in Microsoft Fabric"
      showNavigation={!isDeploying}
    >
      <div className="space-y-6">
        {/* Workspace Info */}
        <WorkspaceDisplay />
        
        {/* Pre-deployment Summary */}
        {!hasStartedDeployment && (
          <Card>
            <CardHeader>
              <CardTitle>Ready for Deployment</CardTitle>
              <CardDescription>
                {(() => {
                  const nonConnectionComponents = (state.selectedComponents || []).filter(component => 
                    component.type !== 'linkedService' && component.type !== 'integrationRuntime'
                  );
                  return `${nonConnectionComponents.length} Data Factory components will be migrated to your Fabric workspace (connections are deployed separately)`;
                })()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-primary/10 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {(() => {
                      const nonConnectionComponents = (state.selectedComponents || []).filter(component => 
                        component.type !== 'linkedService' && component.type !== 'integrationRuntime'
                      );
                      return nonConnectionComponents.length;
                    })()}
                  </div>
                  <div className="text-sm text-muted-foreground">Components</div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-foreground">
                    {state.auth.user?.name?.split(' ')[0] || 'User'}
                  </div>
                  <div className="text-sm text-muted-foreground">Target User</div>
                </div>
                <div className="p-4 bg-accent/10 rounded-lg">
                  <div className="text-2xl font-bold text-accent">Fabric</div>
                  <div className="text-sm text-muted-foreground">Platform</div>
                </div>
              </div>

              <Alert>
                <Warning size={16} />
                <AlertDescription>
                  This operation will create new resources in your Fabric workspace. 
                  Make sure you have the necessary permissions and that resource names don't conflict with existing items.
                </AlertDescription>
              </Alert>

              {/* Deployment Plan Download */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button 
                  variant="outline"
                  onClick={downloadDeploymentPlan}
                  className="flex-1"
                  disabled={(() => {
                    const nonConnectionComponents = (state.selectedComponents || []).filter(component => 
                      component.type !== 'linkedService' && component.type !== 'integrationRuntime'
                    );
                    return nonConnectionComponents.length === 0;
                  })()}
                >
                  <FileText size={16} className="mr-2" />
                  Download Deployment Plan
                </Button>
                <Button 
                  onClick={startDeployment}
                  size="lg" 
                  className="flex-1"
                  disabled={(() => {
                    const nonConnectionComponents = (state.selectedComponents || []).filter(component => 
                      component.type !== 'linkedService' && component.type !== 'integrationRuntime'
                    );
                    return nonConnectionComponents.length === 0;
                  })()}
                >
                  <Play size={20} className="mr-2" />
                  Start Migration Deployment
                </Button>
              </div>

              {/* Deployment Plan Info */}
              <div className="p-3 bg-muted rounded-lg">
                <h4 className="font-medium mb-1">About the Deployment Plan</h4>
                <p className="text-sm text-muted-foreground">
                  The deployment plan contains a detailed preview of all Fabric REST API calls that will be executed during migration. 
                  It includes endpoints, payloads, and component mappings based on your configuration choices. 
                  Sensitive information is masked for security.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Deployment Progress */}
        {isDeploying && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock size={20} className="animate-spin" />
                Deployment in Progress
              </CardTitle>
              <CardDescription>
                Creating resources in Microsoft Fabric workspace
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={progress} className="h-3" />
              <div className="text-center text-sm text-muted-foreground">
                {Math.round(progress)}% Complete
              </div>
              
              {currentStep && (
                <div className="p-3 bg-muted rounded-lg">
                  <div className="font-medium">{currentStep.title}</div>
                  <div className="text-sm text-muted-foreground">{currentStep.description}</div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Folder Deployment Results */}
        {(state.folderDeploymentResults || []).length > 0 && (
          <FolderDeploymentResults results={state.folderDeploymentResults} />
        )}

        {/* Deployment Results */}
        {(state.deploymentResults || []).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Deployment Results
                <Button variant="outline" size="sm" onClick={downloadLog}>
                  <Download size={16} className="mr-2" />
                  Download Log
                </Button>
              </CardTitle>
              <CardDescription>
                Summary of migration deployment status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Component Results Summary */}
              <div className="space-y-3">
                <h4 className="font-medium">Data Factory Components</h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 bg-accent/10 rounded-lg">
                    <div className="text-xl font-bold text-accent">{successfulDeployments.length}</div>
                    <div className="text-xs text-muted-foreground">Successful</div>
                  </div>
                  <div className="p-3 bg-destructive/10 rounded-lg">
                    <div className="text-xl font-bold text-destructive">{failedDeployments.length}</div>
                    <div className="text-xs text-muted-foreground">Failed</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-xl font-bold text-foreground">{skippedDeployments.length}</div>
                    <div className="text-xs text-muted-foreground">Skipped</div>
                  </div>
                </div>
              </div>

              {/* Individual Component Results */}
              <div className="space-y-2">
                {(state.deploymentResults || []).map((result, index) => (
                  <div 
                    key={index}
                    className="border rounded-lg"
                  >
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        {result.status === 'success' && (
                          <CheckCircle size={20} className="text-accent" />
                        )}
                        {result.status === 'failed' && (
                          <XCircle size={20} className="text-destructive" />
                        )}
                        {result.status === 'skipped' && (
                          <Clock size={20} className="text-muted-foreground" />
                        )}
                        
                        <div>
                          <div className="font-medium">{result.componentName}</div>
                          <div className="text-sm text-muted-foreground capitalize">
                            {result.componentType.replace(/([A-Z])/g, ' $1').trim()}
                          </div>
                          {result.status === 'skipped' && (result.note || result.skipReason) && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Reason: {result.skipReason || result.note}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {result.status === 'success' && (
                          <Badge variant="default" className="bg-accent">Success</Badge>
                        )}
                        {result.status === 'failed' && (
                          <Badge variant="destructive">Failed</Badge>
                        )}
                        {result.status === 'skipped' && (
                          <Badge variant="outline">Skipped</Badge>
                        )}
                        
                        {result.fabricResourceId && (
                          <Button variant="ghost" size="sm">
                            <ArrowUpRight size={14} />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {/* Show additional note for pipelines with inactive activities */}
                    {result.status === 'success' && result.note && result.note.includes('inactive') && (
                      <div className="px-3 pb-3">
                        <Alert>
                          <Warning size={16} />
                          <AlertDescription>
                            {result.note}
                          </AlertDescription>
                        </Alert>
                      </div>
                    )}
                    
                    {/* Error Details - Expandable */}
                    {result.status === 'failed' && (result.error || result.errorMessage) && (
                      <div className="px-3 pb-3">
                        <ApiErrorDetails
                          errorMessage={result.error || result.errorMessage || 'Unknown error'}
                          apiRequestDetails={result.apiRequestDetails}
                          componentName={result.componentName}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Pipelines with Inactive Activities Summary */}
              {(() => {
                const summary = fabricService.getDeploymentSummary(state.deploymentResults);
                if (summary.pipelinesWithInactiveActivities.length > 0) {
                  return (
                    <Alert>
                      <Warning size={16} />
                      <AlertDescription>
                        <div className="space-y-2">
                          <div className="font-medium">
                            Pipelines with Inactive Activities
                          </div>
                          <div className="text-sm">
                            The following pipelines have activities that were marked as inactive due to failed connector creation:
                          </div>
                          <ul className="text-sm space-y-1 mt-2">
                            {summary.pipelinesWithInactiveActivities.map((pipeline, index) => (
                              <li key={index} className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {pipeline.inactiveCount} inactive
                                </Badge>
                                <span className="font-medium">{pipeline.name}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="text-sm mt-2 p-2 bg-muted rounded border-l-2 border-warning">
                            <strong>Note:</strong> Inactive activities are marked with state: "Inactive" and onInactiveMarkAs: "Succeeded" so the pipeline can still execute successfully. 
                            You'll need to manually fix the failed connectors and reactivate these activities.
                          </div>
                        </div>
                      </AlertDescription>
                    </Alert>
                  );
                }
                return null;
              })()}

              {/* Error Details */}
              {failedDeployments.length > 0 && (
                <Alert variant="destructive">
                  <XCircle size={16} />
                  <AlertDescription>
                    <div className="space-y-3">
                      <div className="font-medium">Deployment Failures:</div>
                      {failedDeployments.map((failure, index) => (
                        <div key={index} className="text-sm space-y-1">
                          <div className="font-medium">• {failure.componentName}:</div>
                          <div className="pl-4 text-sm bg-destructive/5 p-2 rounded border-l-2 border-destructive/20">
                            {failure.error || failure.errorMessage}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Post-deployment Actions */}
        {state.deploymentResults.length > 0 && !isDeploying && (
          <Card>
            <CardHeader>
              <CardTitle>Next Steps</CardTitle>
              <CardDescription>
                Complete your migration with these configuration steps
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 text-sm">
                <div className="flex gap-3">
                  <div className="font-medium text-foreground min-w-0">1.</div>
                  <div>
                    <strong>Verify Pipelines:</strong> Check that all migrated pipelines have the correct activities and parameters.
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="font-medium text-foreground min-w-0">2.</div>
                  <div>
                    <strong>Test Executions:</strong> Run test executions of migrated pipelines to verify functionality.
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="font-medium text-foreground min-w-0">3.</div>
                  <div>
                    <strong>Configure Connections:</strong> Ensure all pipeline activities use the correct Fabric connections for data access.
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="font-medium text-foreground min-w-0">4.</div>
                  <div>
                    <strong>Handle Unsupported Features:</strong> Recreate mapping data flows using Fabric Dataflow Gen2 if needed.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Deployment Log */}
        {deploymentLog.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Deployment Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted p-4 rounded-lg max-h-64 overflow-y-auto">
                <div className="font-mono text-sm space-y-1">
                  {deploymentLog.map((line, index) => (
                    <div key={index} className="text-muted-foreground">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </WizardLayout>
  );
}