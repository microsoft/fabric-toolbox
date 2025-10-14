import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArtifactBreakdown } from '@/types/profiling';
import { 
  FlowArrow, 
  Database, 
  Link, 
  Clock, 
  GitBranch,
  MagnifyingGlass,
  Lightning,
  Folder
} from '@phosphor-icons/react';

interface ArtifactTablesProps {
  artifacts: ArtifactBreakdown;
}

export function ArtifactTables({ artifacts }: ArtifactTablesProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('pipelines');

  // Filter function
  const filterItems = <T extends { name: string }>(items: T[]): T[] => {
    if (!searchTerm) return items;
    return items.filter(item => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const getCompatibilityBadge = (status?: string) => {
    switch (status) {
      case 'supported':
        return <Badge variant="default" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">Supported</Badge>;
      case 'partiallySupported':
        return <Badge variant="default" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20">Partial</Badge>;
      case 'unsupported':
        return <Badge variant="destructive">Unsupported</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const filteredPipelines = filterItems(artifacts.pipelines);
  const filteredDatasets = filterItems(artifacts.datasets);
  const filteredLinkedServices = filterItems(artifacts.linkedServices);
  const filteredTriggers = filterItems(artifacts.triggers);
  const filteredDataflows = filterItems(artifacts.dataflows);

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <MagnifyingGlass 
              size={18} 
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" 
            />
            <Input
              type="text"
              placeholder="Search artifacts by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Different Artifact Types */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="pipelines" className="text-xs sm:text-sm">
            <FlowArrow size={16} className="mr-1" />
            <span className="hidden sm:inline">Pipelines</span>
            <span className="sm:hidden">P</span>
            <Badge variant="secondary" className="ml-1 text-xs">{filteredPipelines.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="datasets" className="text-xs sm:text-sm">
            <Database size={16} className="mr-1" />
            <span className="hidden sm:inline">Datasets</span>
            <span className="sm:hidden">D</span>
            <Badge variant="secondary" className="ml-1 text-xs">{filteredDatasets.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="linkedServices" className="text-xs sm:text-sm">
            <Link size={16} className="mr-1" />
            <span className="hidden sm:inline">Linked</span>
            <span className="sm:hidden">L</span>
            <Badge variant="secondary" className="ml-1 text-xs">{filteredLinkedServices.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="triggers" className="text-xs sm:text-sm">
            <Clock size={16} className="mr-1" />
            <span className="hidden sm:inline">Triggers</span>
            <span className="sm:hidden">T</span>
            <Badge variant="secondary" className="ml-1 text-xs">{filteredTriggers.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="dataflows" className="text-xs sm:text-sm">
            <GitBranch size={16} className="mr-1" />
            <span className="hidden sm:inline">Dataflows</span>
            <span className="sm:hidden">DF</span>
            <Badge variant="secondary" className="ml-1 text-xs">{filteredDataflows.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Pipelines Tab */}
        <TabsContent value="pipelines" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FlowArrow size={18} className="text-accent" />
                Pipelines ({filteredPipelines.length})
              </CardTitle>
              <CardDescription>
                ETL workflows and their complexity metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredPipelines.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No pipelines found
                  </div>
                ) : (
                  filteredPipelines.map((pipeline) => (
                    <div
                      key={pipeline.name}
                      className="p-3 border rounded-lg hover:bg-accent/5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate" title={pipeline.name}>
                            {pipeline.name}
                          </div>
                          {pipeline.folder && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <Folder size={12} />
                              {pipeline.folder}
                            </div>
                          )}
                        </div>
                        {pipeline.fabricMapping && getCompatibilityBadge(pipeline.fabricMapping.compatibilityStatus)}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="flex items-center gap-1">
                          <Lightning size={14} className="text-muted-foreground" />
                          <span className="text-muted-foreground">Activities:</span>
                          <span className="font-medium">{pipeline.activityCount}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock size={14} className="text-muted-foreground" />
                          <span className="text-muted-foreground">Triggers:</span>
                          <span className="font-medium">{pipeline.triggeredBy.length}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Database size={14} className="text-muted-foreground" />
                          <span className="text-muted-foreground">Datasets:</span>
                          <span className="font-medium">{pipeline.usesDatasets.length}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <FlowArrow size={14} className="text-muted-foreground" />
                          <span className="text-muted-foreground">Executes:</span>
                          <span className="font-medium">{pipeline.executesPipelines.length}</span>
                        </div>
                      </div>
                      {pipeline.triggeredBy.length > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          <span className="font-medium">Triggered by:</span> {pipeline.triggeredBy.join(', ')}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Datasets Tab */}
        <TabsContent value="datasets" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Database size={18} className="text-accent" />
                Datasets ({filteredDatasets.length})
              </CardTitle>
              <CardDescription>
                Data sources and sinks with usage statistics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredDatasets.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No datasets found
                  </div>
                ) : (
                  filteredDatasets.map((dataset) => (
                    <div
                      key={dataset.name}
                      className="p-3 border rounded-lg hover:bg-accent/5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate" title={dataset.name}>
                            {dataset.name}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Type: {dataset.type}
                          </div>
                        </div>
                        <Badge 
                          variant={dataset.usageCount > 5 ? "default" : "secondary"}
                          className={dataset.usageCount > 5 ? "bg-accent" : ""}
                        >
                          {dataset.usageCount} {dataset.usageCount === 1 ? 'use' : 'uses'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Linked Service:</span>{' '}
                          <span className="font-medium">{dataset.linkedService}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Used by:</span>{' '}
                          <span className="font-medium">
                            {dataset.usedByPipelines.length} {dataset.usedByPipelines.length === 1 ? 'pipeline' : 'pipelines'}
                          </span>
                        </div>
                      </div>
                      {dataset.fabricMapping && (
                        <div className="mt-2 text-xs p-2 bg-accent/5 rounded">
                          <span className="font-medium">Fabric:</span>{' '}
                          {dataset.fabricMapping.embeddedInActivity 
                            ? 'Will be embedded in activity configurations' 
                            : 'Separate connection required'}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Linked Services Tab */}
        <TabsContent value="linkedServices" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Link size={18} className="text-accent" />
                Linked Services ({filteredLinkedServices.length})
              </CardTitle>
              <CardDescription>
                Connection configurations and criticality scores
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredLinkedServices.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No linked services found
                  </div>
                ) : (
                  filteredLinkedServices
                    .sort((a, b) => b.usageScore - a.usageScore)
                    .map((ls) => {
                      const criticality = 
                        ls.usageScore > 10 ? 'high' : 
                        ls.usageScore > 5 ? 'medium' : 'low';
                      const criticalityColor = 
                        criticality === 'high' ? 'text-destructive' :
                        criticality === 'medium' ? 'text-warning' : 'text-muted-foreground';

                      return (
                        <div
                          key={ls.name}
                          className="p-3 border rounded-lg hover:bg-accent/5 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm truncate" title={ls.name}>
                                {ls.name}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Type: {ls.type}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={`${criticalityColor} capitalize`}>
                                {criticality}
                              </Badge>
                              <Badge variant="secondary">
                                Score: {ls.usageScore}
                              </Badge>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Datasets:</span>{' '}
                              <span className="font-medium">{ls.usedByDatasets.length}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Pipelines:</span>{' '}
                              <span className="font-medium">{ls.usedByPipelines.length}</span>
                            </div>
                          </div>
                          {ls.fabricMapping && (
                            <div className="mt-2 text-xs p-2 bg-accent/5 rounded flex items-center justify-between">
                              <div>
                                <span className="font-medium">Fabric Target:</span>{' '}
                                {ls.fabricMapping.targetType}
                              </div>
                              {ls.fabricMapping.requiresGateway && (
                                <Badge variant="outline" className="text-xs">
                                  Gateway Required
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Triggers Tab */}
        <TabsContent value="triggers" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock size={18} className="text-accent" />
                Triggers ({filteredTriggers.length})
              </CardTitle>
              <CardDescription>
                Schedule and event triggers with pipeline mappings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredTriggers.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No triggers found
                  </div>
                ) : (
                  filteredTriggers.map((trigger) => (
                    <div
                      key={trigger.name}
                      className="p-3 border rounded-lg hover:bg-accent/5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate" title={trigger.name}>
                            {trigger.name}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Type: {trigger.type}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={trigger.status === 'Started' ? 'default' : 'secondary'}>
                            {trigger.status}
                          </Badge>
                          {trigger.fabricMapping && (
                            <Badge variant="outline">
                              {trigger.fabricMapping.supportLevel}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {trigger.schedule && (
                        <div className="text-xs text-muted-foreground mb-2">
                          <span className="font-medium">Schedule:</span> {trigger.schedule}
                        </div>
                      )}
                      <div className="text-xs">
                        <span className="text-muted-foreground">Target Pipelines:</span>{' '}
                        <span className="font-medium">
                          {trigger.pipelines.length > 0 ? trigger.pipelines.join(', ') : 'None'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Dataflows Tab */}
        <TabsContent value="dataflows" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch size={18} className="text-accent" />
                Dataflows ({filteredDataflows.length})
              </CardTitle>
              <CardDescription>
                Mapping data flows requiring manual migration
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredDataflows.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  No dataflows found
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredDataflows.map((dataflow) => (
                    <div
                      key={dataflow.name}
                      className="p-3 border rounded-lg hover:bg-accent/5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="font-semibold text-sm truncate" title={dataflow.name}>
                          {dataflow.name}
                        </div>
                        {dataflow.fabricMapping?.requiresManualMigration && (
                          <Badge variant="destructive" className="text-xs">
                            Manual Migration
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Sources:</span>{' '}
                          <span className="font-medium">{dataflow.sourceCount}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Sinks:</span>{' '}
                          <span className="font-medium">{dataflow.sinkCount}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Transforms:</span>{' '}
                          <span className="font-medium">{dataflow.transformationCount}</span>
                        </div>
                      </div>
                      {dataflow.fabricMapping && (
                        <div className="mt-2 text-xs p-2 bg-accent/5 rounded">
                          <span className="font-medium">Fabric Target:</span>{' '}
                          {dataflow.fabricMapping.targetType}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
