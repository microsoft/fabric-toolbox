import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bug, CheckCircle, XCircle, CaretDown, CaretRight, Info } from '@phosphor-icons/react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useWizardNavigation, useAppContext } from '../contexts/AppContext';

interface NavigationDebugProps {
  /** Custom conditions to display beyond the default navigation check */
  customConditions?: Array<{
    label: string;
    condition: boolean;
    description: string;
  }>;
  /** Override the step name for debugging */
  stepOverride?: string;
}

export function NavigationDebug({ customConditions = [], stepOverride }: NavigationDebugProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { state } = useAppContext();
  const { currentStepName, canGoNext } = useWizardNavigation();
  
  const stepName = stepOverride || currentStepName;

  // Get detailed navigation conditions based on current step
  const getNavigationConditions = () => {
    const conditions: Array<{ label: string; condition: boolean; description: string }> = [];
    
    switch (stepName) {
      case 'login':
        conditions.push({
          label: 'User Authenticated',
          condition: state.auth?.isAuthenticated || false,
          description: 'User must be successfully authenticated with Microsoft identity'
        });
        break;
        
      case 'workspace':
        conditions.push({
          label: 'Workspace Selected',
          condition: state.selectedWorkspace !== null,
          description: 'A Fabric workspace must be selected'
        });
        conditions.push({
          label: 'Contributor Access',
          condition: state.selectedWorkspace?.hasContributorAccess === true,
          description: 'Selected workspace must have Contributor or higher permissions'
        });
        break;
        
      case 'upload':
        conditions.push({
          label: 'File Uploaded',
          condition: state.uploadedFile !== null,
          description: 'ARM template JSON file must be uploaded'
        });
        conditions.push({
          label: 'Components Parsed',
          condition: (state.adfComponents?.length || 0) > 0,
          description: 'ARM template must contain valid Data Factory components'
        });
        break;
        
      case 'connections':
        const linkedServices = state.connectionMappings?.linkedServices || [];
        conditions.push({
          label: 'LinkedServices Found',
          condition: linkedServices.length > 0,
          description: `Found ${linkedServices.length} LinkedService(s) requiring configuration`
        });
        conditions.push({
          label: 'All LinkedServices Configured',
          condition: linkedServices.length === 0 || linkedServices.every(ls => ls?.status === 'configured'),
          description: 'All LinkedServices must be mapped to existing or new connections'
        });
        break;
        
      case 'deploy-connections':
        const newConnections = (state.connectionMappings?.linkedServices || []).filter(ls => ls.mappingMode === 'new');
        conditions.push({
          label: 'New Connections to Deploy',
          condition: newConnections.length > 0,
          description: `${newConnections.length} new connection(s) need to be deployed`
        });
        conditions.push({
          label: 'Deployment Started/Completed',
          condition: newConnections.length === 0 || (state.connectionDeploymentResults?.length || 0) > 0,
          description: 'Connection deployment must be initiated or completed'
        });
        break;
        
      case 'validation':
        const validatableComponents = (state.selectedComponents || []).filter(c => c?.type !== 'linkedService' && c?.type !== 'dataset');
        conditions.push({
          label: 'Components Available',
          condition: validatableComponents.length > 0,
          description: `${validatableComponents.length} component(s) available for migration (excluding LinkedServices and Datasets)`
        });
        break;
        
      case 'global-parameters':
        const hasGlobalParams = (state.globalParameterReferences?.length || 0) > 0;
        const isConfigCompleted = state.globalParameterConfigCompleted === true;
        
        conditions.push({
          label: 'Global Parameters Handled',
          condition: !hasGlobalParams || isConfigCompleted,
          description: hasGlobalParams 
            ? 'Variable Library must be deployed or skipped' 
            : 'No global parameters detected (auto-skip)'
        });
        break;
        
      case 'mapping':
        const componentsNeedingTargets = (state.selectedComponents || []).filter(c => c?.type !== 'linkedService' && c?.type !== 'dataset');
        const allHaveTargets = componentsNeedingTargets.every(c => c?.fabricTarget);
        
        conditions.push({
          label: 'Components Have Targets',
          condition: allHaveTargets,
          description: `All ${componentsNeedingTargets.length} component(s) must have Fabric targets configured`
        });
        
        // Check pipeline connection mappings
        let allMappingsComplete = true;
        let totalMappingsRequired = 0;
        let completedMappings = 0;
        
        (state.selectedComponents || []).forEach(component => {
          if (component?.type === 'pipeline') {
            // This is a simplified check - in reality we'd need to import the service
            // For debugging purposes, we'll check if pipeline connection mappings exist
            const pipelineMappings = state.pipelineConnectionMappings?.[component.name] || {};
            const mappingCount = Object.keys(pipelineMappings).length;
            const completedMappingCount = Object.values(pipelineMappings).filter(m => m?.selectedConnectionId).length;
            
            totalMappingsRequired += mappingCount;
            completedMappings += completedMappingCount;
            
            if (mappingCount > 0 && completedMappingCount < mappingCount) {
              allMappingsComplete = false;
            }
          }
        });
        
        conditions.push({
          label: 'Pipeline Connection Mappings',
          condition: allMappingsComplete,
          description: `${completedMappings}/${totalMappingsRequired} pipeline activity connection mappings completed`
        });
        break;
        
      case 'deployment':
        conditions.push({
          label: 'Deployment Results Available',
          condition: (state.deploymentResults?.length || 0) > 0 || (state.connectionDeploymentResults?.length || 0) > 0,
          description: 'At least one deployment result must be available'
        });
        break;
        
      default:
        conditions.push({
          label: 'Unknown Step',
          condition: false,
          description: 'Navigation conditions not defined for this step'
        });
    }
    
    return conditions;
  };

  const navigationConditions = getNavigationConditions();
  const allConditions = [...navigationConditions, ...customConditions];
  const allConditionsMet = allConditions.every(c => c.condition);
  const actualCanGoNext = canGoNext;

  // Show warning if there's a mismatch between our analysis and actual navigation state
  const hasMismatch = allConditionsMet !== actualCanGoNext;

  return (
    <Card className="mt-6 border-dashed border-2 border-muted-foreground/30 bg-muted/10">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bug size={20} className="text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">Navigation Debug</CardTitle>
                  <CardDescription className="text-sm">
                    Step: {stepName} • Navigation {actualCanGoNext ? 'Enabled' : 'Disabled'}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={actualCanGoNext ? 'default' : 'secondary'}>
                  {actualCanGoNext ? 'Can Proceed' : 'Blocked'}
                </Badge>
                {isExpanded ? <CaretDown size={16} /> : <CaretRight size={16} />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            {hasMismatch && (
              <Alert className="mb-4 border-warning bg-warning/5">
                <Info size={16} />
                <AlertDescription>
                  <strong>Debug Mismatch:</strong> Our condition analysis ({allConditionsMet ? 'should allow' : 'should block'}) doesn't match actual navigation state ({actualCanGoNext ? 'can proceed' : 'blocked'}). This may indicate a logic issue.
                </AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-3">
              <div className="text-sm font-medium text-foreground mb-2">
                Navigation Conditions ({allConditions.filter(c => c.condition).length}/{allConditions.length} met)
              </div>
              
              {allConditions.map((condition, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-background rounded-lg border">
                  <div className="mt-0.5">
                    {condition.condition ? (
                      <CheckCircle size={16} className="text-green-600" />
                    ) : (
                      <XCircle size={16} className="text-red-600" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-foreground">
                        {condition.label}
                      </span>
                      <Badge 
                        variant={condition.condition ? 'default' : 'destructive'}
                        className="text-xs"
                      >
                        {condition.condition ? 'Met' : 'Required'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {condition.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <div className="text-xs text-muted-foreground">
                <strong>Current State:</strong> Step {state.currentStep + 1} ({stepName}) • 
                Auth: {state.auth?.isAuthenticated ? 'Yes' : 'No'} • 
                Workspace: {state.selectedWorkspace ? 'Selected' : 'None'} • 
                Components: {state.adfComponents?.length || 0} • 
                Selected: {state.selectedComponents?.length || 0}
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}