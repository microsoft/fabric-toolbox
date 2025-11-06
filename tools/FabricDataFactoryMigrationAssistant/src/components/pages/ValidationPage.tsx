import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Warning, Info, FolderOpen, TreeStructure } from '@phosphor-icons/react';
import { WizardLayout } from '../WizardLayout';
import { NavigationDebug } from '../NavigationDebug';
import { useAppContext } from '../../contexts/AppContext';
import { ADFComponent } from '../../types';
import { ComponentTable } from './validation/ComponentTable';
import { 
  extractAllFolders, 
  validateFolderDepth, 
  getFolderStatistics,
  applyFolderFlattening
} from '../../services/folderAnalysisService';

export function ValidationPage() {
  const { state, dispatch } = useAppContext();

  const handleComponentToggle = (index: number, checked: boolean) => {
    dispatch({
      type: 'UPDATE_COMPONENT_SELECTION',
      payload: { index, isSelected: checked }
    });
  };

  const handleBulkToggle = (indices: number[], isSelected: boolean) => {
    dispatch({
      type: 'BULK_UPDATE_COMPONENT_SELECTION',
      payload: { indices, isSelected }
    });
  };

  // Analyze folder structure
  const folderAnalysis = useMemo(() => {
    const pipelines = (state.adfComponents || []).filter(c => c.type === 'pipeline');
    const folders = extractAllFolders(pipelines);
    const validation = validateFolderDepth(folders);
    const stats = getFolderStatistics(folders);
    const flattenedFolders = applyFolderFlattening(folders);
    
    return {
      folders,
      validation,
      stats,
      flattenedFolders,
      pipelinesWithFolders: pipelines.filter(p => p.folder).length,
      pipelinesWithoutFolders: pipelines.filter(p => !p.folder).length
    };
  }, [state.adfComponents]);

  const componentsByType = (state.adfComponents || []).reduce((acc, component, index) => {
    if (!component || !component.type) {
      return acc;
    }
    // Filter out linkedService, dataset, and managedIdentity components as they are handled separately
    // LinkedServices are configured in a separate stage
    // Datasets are embedded within pipeline activities in Fabric and don't need separate migration
    // ManagedIdentity is handled in workspace identity configuration
    if (component.type === 'linkedService' || component.type === 'dataset' || component.type === 'managedIdentity') {
      return acc;
    }
    if (!acc[component.type]) {
      acc[component.type] = [];
    }
    acc[component.type]?.push({ ...component, originalIndex: index });
    return acc;
  }, {} as Record<string, Array<ADFComponent & { originalIndex: number }>>);

  const selectedCount = (state.selectedComponents || []).filter(c => c?.type !== 'linkedService' && c?.type !== 'dataset' && c?.type !== 'managedIdentity').length;
  const totalCount = (state.adfComponents || []).filter(c => c?.type !== 'linkedService' && c?.type !== 'dataset' && c?.type !== 'managedIdentity').length;

  return (
    <WizardLayout
      title="Validate Compatibility"
      description="Review Data Factory components for Fabric compatibility and select items to migrate. LinkedServices are configured separately in the previous step."
    >
      <div className="space-y-6">
        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Migration Summary</CardTitle>
            <CardDescription>
              {selectedCount} of {totalCount} components selected for migration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-accent/10 rounded-lg">
                <div className="text-2xl font-bold text-accent">{selectedCount}</div>
                <div className="text-sm text-muted-foreground">Selected</div>
              </div>
              <div className="p-4 bg-warning/10 rounded-lg">
                <div className="text-2xl font-bold" style={{ color: 'var(--warning)' }}>
                  {(state.adfComponents || []).filter(c => c?.compatibilityStatus === 'partiallySupported' && c?.type !== 'linkedService' && c?.type !== 'dataset' && c?.type !== 'managedIdentity').length}
                </div>
                <div className="text-sm text-muted-foreground">Need Attention</div>
              </div>
              <div className="p-4 bg-destructive/10 rounded-lg">
                <div className="text-2xl font-bold text-destructive">
                  {(state.adfComponents || []).filter(c => c?.compatibilityStatus === 'unsupported' && c?.type !== 'linkedService' && c?.type !== 'dataset' && c?.type !== 'managedIdentity').length}
                </div>
                <div className="text-sm text-muted-foreground">Excluded</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Folder Structure Analysis */}
        {folderAnalysis.folders.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen size={20} />
                Folder Structure Analysis
              </CardTitle>
              <CardDescription>
                Analysis of folder organization and depth limits
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Folder Statistics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <div className="text-2xl font-bold text-primary">
                      {folderAnalysis.stats.totalFolders}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Folders</div>
                  </div>
                  <div className="p-3 bg-accent/10 rounded-lg">
                    <div className="text-2xl font-bold text-accent">
                      {folderAnalysis.stats.maxDepth}
                    </div>
                    <div className="text-xs text-muted-foreground">Max Depth</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">
                      {folderAnalysis.pipelinesWithFolders}
                    </div>
                    <div className="text-xs text-muted-foreground">In Folders</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">
                      {folderAnalysis.pipelinesWithoutFolders}
                    </div>
                    <div className="text-xs text-muted-foreground">Root Level</div>
                  </div>
                </div>

                {/* Depth Validation Alert */}
                {!folderAnalysis.validation.isValid && (
                  <Alert variant="destructive">
                    <Warning size={16} />
                    <AlertDescription>
                      <strong>Folder Depth Limit Exceeded:</strong> {folderAnalysis.validation.requiresFlattening.length} folder(s) 
                      exceed Fabric's 10-level depth limit and will be automatically flattened during deployment.
                      <div className="mt-2 space-y-1">
                        {folderAnalysis.validation.requiresFlattening.slice(0, 3).map(folder => {
                          const flattened = folderAnalysis.flattenedFolders.find(f => f.originalPath === folder.originalPath);
                          return (
                            <div key={folder.path} className="text-xs font-mono bg-background/50 p-2 rounded">
                              <div className="text-destructive">Original: {folder.path} (depth: {folder.depth})</div>
                              {flattened && (
                                <div className="text-accent">Flattened: {flattened.path} (depth: {flattened.depth})</div>
                              )}
                            </div>
                          );
                        })}
                        {folderAnalysis.validation.requiresFlattening.length > 3 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            ...and {folderAnalysis.validation.requiresFlattening.length - 3} more
                          </div>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Success Alert */}
                {folderAnalysis.validation.isValid && (
                  <Alert>
                    <TreeStructure size={16} />
                    <AlertDescription>
                      <strong>Folder Structure Valid:</strong> All folders are within Fabric's 10-level depth limit and can be migrated as-is.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Important Notices */}
        <div className="space-y-3">
          <Alert>
            <Info size={16} />
            <AlertDescription>
              <strong>Mapping Data Flows:</strong> Not directly supported in Fabric Data Factory. 
              Consider using Fabric Dataflow Gen2 for similar ETL functionality.
            </AlertDescription>
          </Alert>
          
          <Alert>
            <Warning size={16} />
            <AlertDescription>
              <strong>Integration Runtimes:</strong> Self-hosted IRs will become On-Premises Data Gateways, 
              while Managed IRs will use Virtual Network Gateways in Fabric. Manual configuration required.
            </AlertDescription>
          </Alert>

          <Alert>
            <Info size={16} />
            <AlertDescription>
              <strong>Datasets:</strong> Will be embedded within pipeline activities in Fabric Data Factory. 
              No separate dataset resources will be created.
            </AlertDescription>
          </Alert>
        </div>

        {/* Components by Type */}
        <div className="space-y-6">
          {Object.entries(componentsByType).map(([type, components]) => {
            const typeComponents = components as Array<ADFComponent & { originalIndex: number }>;
            const supportedCount = typeComponents.filter(c => c.compatibilityStatus === 'supported').length;
            const partialCount = typeComponents.filter(c => c.compatibilityStatus === 'partiallySupported').length;
            const unsupportedCount = typeComponents.filter(c => c.compatibilityStatus === 'unsupported').length;
            const warningsCount = typeComponents.filter(c => c.warnings && c.warnings.length > 0).length;
            const selectedInType = typeComponents.filter(c => c.isSelected).length;

            return (
              <Card key={type}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="capitalize">
                        {type.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <Badge variant="outline">{typeComponents.length}</Badge>
                    </div>
                    <div className="flex gap-2 text-sm font-normal">
                      <Badge variant="outline">
                        {typeComponents.length} total
                      </Badge>
                      <Badge variant="default" className="bg-accent">
                        {selectedInType} selected
                      </Badge>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Stats Bar */}
                  <div className="grid grid-cols-4 gap-4 mb-6 text-center">
                    <div className="p-3 bg-accent/10 rounded-lg">
                      <div className="text-2xl font-bold text-accent">
                        {supportedCount}
                      </div>
                      <div className="text-xs text-muted-foreground">Supported</div>
                    </div>
                    <div className="p-3 bg-warning/10 rounded-lg">
                      <div className="text-2xl font-bold text-warning">
                        {partialCount}
                      </div>
                      <div className="text-xs text-muted-foreground">Need Attention</div>
                    </div>
                    <div className="p-3 bg-destructive/10 rounded-lg">
                      <div className="text-2xl font-bold text-destructive">
                        {unsupportedCount}
                      </div>
                      <div className="text-xs text-muted-foreground">Unsupported</div>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="text-2xl font-bold">
                        {warningsCount}
                      </div>
                      <div className="text-xs text-muted-foreground">With Warnings</div>
                    </div>
                  </div>

                  {/* Component Table */}
                  <ComponentTable
                    type={type}
                    components={typeComponents}
                    onToggle={handleComponentToggle}
                    onToggleAll={handleBulkToggle}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Migration Guidance */}
        <Card>
          <CardHeader>
            <CardTitle>Migration Guidance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <h4 className="font-medium">Fully Supported Components</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Pipelines → Data Pipelines</li>
                  <li>• Global Parameters → Variable Library</li>
                  <li>• Schedule Triggers → Pipeline Schedules</li>
                  <li>• Integration Runtimes → Fabric Gateways</li>
                </ul>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium">Manual Configuration Required</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Self-hosted IR → On-Premises Data Gateway</li>
                  <li>• Managed IR → Virtual Network Gateway</li>
                  <li>• Mapping Data Flows → Dataflow Gen2</li>
                  <li>• Custom Activities → Fabric Notebooks</li>
                  <li>• Datasets → Embedded in pipeline activities</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Navigation Debug */}
        <NavigationDebug />
      </div>
    </WizardLayout>
  );
}