import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, ArrowUpRight, Download, ArrowCounterClockwise } from '@phosphor-icons/react';
import { WizardLayout } from '../WizardLayout';
import { useAppContext } from '../../contexts/AppContext';

export function CompletePage() {
  const { state, dispatch } = useAppContext();

  const successfulDeployments = state.deploymentResults.filter(r => r.status === 'success');
  const failedDeployments = state.deploymentResults.filter(r => r.status === 'failed');
  const totalAttempted = state.deploymentResults.length;

  const startNewMigration = () => {
    dispatch({ type: 'RESET_STATE' });
    dispatch({ type: 'SET_CURRENT_STEP', payload: 0 });
  };

  const downloadReport = () => {
    const report = {
      migrationDate: new Date().toISOString(),
      user: state.auth.user,
      workspace: {
        id: state.selectedWorkspace?.id,
        name: state.selectedWorkspace?.name
      },
      sourceFile: state.uploadedFile?.name,
      summary: {
        totalComponents: state.adfComponents.length,
        selectedForMigration: state.selectedComponents.length,
        successfullyMigrated: successfulDeployments.length,
        failed: failedDeployments.length
      },
      results: state.deploymentResults,
      components: state.adfComponents
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adf-fabric-migration-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const successRate = totalAttempted > 0 ? (successfulDeployments.length / totalAttempted) * 100 : 0;

  return (
    <WizardLayout
      title="Migration Complete"
      description="Your Data Factory to Fabric migration has finished"
      showNavigation={false}
    >
      <div className="space-y-6">
        {/* Success Header */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <CheckCircle size={64} className="mx-auto text-accent" />
              <div>
                <h2 className="text-2xl font-semibold text-foreground mb-2">
                  Migration Completed Successfully
                </h2>
                <p className="text-muted-foreground">
                  {successfulDeployments.length} of {totalAttempted} components were successfully migrated to Microsoft Fabric
                </p>
              </div>
              
              <div className="flex justify-center gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-accent">{successfulDeployments.length}</div>
                  <div className="text-sm text-muted-foreground">Successful</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-destructive">{failedDeployments.length}</div>
                  <div className="text-sm text-muted-foreground">Failed</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">{Math.round(successRate)}%</div>
                  <div className="text-sm text-muted-foreground">Success Rate</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Migration Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Migration Summary</CardTitle>
            <CardDescription>
              Review what was migrated from {state.uploadedFile?.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Successful Migrations */}
            {successfulDeployments.length > 0 && (
              <div>
                <h4 className="font-medium mb-3 text-accent">Successfully Migrated</h4>
                <div className="space-y-2">
                  {successfulDeployments.map((result, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between p-3 bg-accent/5 border border-accent/20 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle size={16} className="text-accent" />
                        <div>
                          <div className="font-medium">{result.componentName}</div>
                          <div className="text-sm text-muted-foreground capitalize">
                            {result.componentType.replace(/([A-Z])/g, ' $1').trim()}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="bg-accent">Created</Badge>
                        <Button variant="ghost" size="sm">
                          <ArrowUpRight size={14} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Failed Migrations */}
            {failedDeployments.length > 0 && (
              <div>
                <h4 className="font-medium mb-3 text-destructive">Migration Failures</h4>
                <div className="space-y-2">
                  {failedDeployments.map((result, index) => (
                    <div 
                      key={index}
                      className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <div className="font-medium">{result.componentName}</div>
                          <div className="text-sm text-muted-foreground capitalize mb-1">
                            {result.componentType.replace(/([A-Z])/g, ' $1').trim()}
                          </div>
                          <div className="text-sm text-destructive">
                            {result.errorMessage}
                          </div>
                        </div>
                        <Badge variant="destructive">Failed</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Next Steps */}
        <Card>
          <CardHeader>
            <CardTitle>Recommended Next Steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <div className="font-medium text-foreground min-w-0">1.</div>
                <div>
                  <strong>Access Your Fabric Workspace:</strong> Navigate to your Microsoft Fabric workspace to view the migrated resources.
                </div>
              </div>
              <div className="flex gap-3">
                <div className="font-medium text-foreground min-w-0">2.</div>
                <div>
                  <strong>Configure Connections:</strong> Update connection strings, credentials, and authentication settings for your connectors.
                </div>
              </div>
              <div className="flex gap-3">
                <div className="font-medium text-foreground min-w-0">3.</div>
                <div>
                  <strong>Test Pipeline Execution:</strong> Run test executions to validate that pipelines work correctly in the Fabric environment.
                </div>
              </div>
              <div className="flex gap-3">
                <div className="font-medium text-foreground min-w-0">4.</div>
                <div>
                  <strong>Set Up Monitoring:</strong> Configure monitoring and alerting for your migrated pipelines.
                </div>
              </div>
              {failedDeployments.length > 0 && (
                <div className="flex gap-3">
                  <div className="font-medium text-foreground min-w-0">5.</div>
                  <div>
                    <strong>Address Failed Items:</strong> Review and manually migrate the {failedDeployments.length} failed component(s).
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Migration Report */}
        <Card>
          <CardHeader>
            <CardTitle>Migration Documentation</CardTitle>
            <CardDescription>
              Download reports and documentation for your records
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Button variant="outline" onClick={downloadReport} className="h-auto p-4">
                <div className="text-center">
                  <Download size={24} className="mx-auto mb-2" />
                  <div className="font-medium">Migration Report</div>
                  <div className="text-sm text-muted-foreground">
                    Complete JSON report with all details
                  </div>
                </div>
              </Button>
              
              <Button 
                variant="outline" 
                onClick={() => window.open('https://docs.microsoft.com/fabric', '_blank')}
                className="h-auto p-4"
              >
                <div className="text-center">
                  <ArrowUpRight size={24} className="mx-auto mb-2" />
                  <div className="font-medium">Fabric Documentation</div>
                  <div className="text-sm text-muted-foreground">
                    Learn more about Microsoft Fabric
                  </div>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-center gap-4">
              <Button variant="outline" onClick={startNewMigration}>
                <ArrowCounterClockwise size={16} className="mr-2" />
                Start New Migration
              </Button>
              
              <Button 
                onClick={() => window.open('https://app.fabric.microsoft.com', '_blank')}
              >
                <ArrowUpRight size={16} className="mr-2" />
                Open Fabric Workspace
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </WizardLayout>
  );
}