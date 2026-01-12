import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ProfileMetrics } from '@/types/profiling';
import { 
  FlowArrow, 
  Database, 
  Link, 
  Clock, 
  Lightning, 
  TrendUp,
  GitBranch,
  Sparkle
} from '@phosphor-icons/react';

interface MetricsOverviewProps {
  metrics: ProfileMetrics;
}

export function MetricsOverview({ metrics }: MetricsOverviewProps) {
  const coreMetrics = [
    { 
      label: 'Pipelines', 
      value: metrics.totalPipelines, 
      icon: FlowArrow,
      description: 'Total pipelines in factory',
      fabricTarget: 'Data Pipelines',
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950'
    },
    { 
      label: 'Datasets', 
      value: metrics.totalDatasets, 
      icon: Database,
      description: 'Data source/sink definitions',
      fabricTarget: 'Embedded in Activities',
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-950'
    },
    { 
      label: 'Linked Services', 
      value: metrics.totalLinkedServices, 
      icon: Link,
      description: 'Connection configurations',
      fabricTarget: 'Connections & Gateways',
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-950'
    },
    { 
      label: 'Triggers', 
      value: metrics.totalTriggers, 
      icon: Clock,
      description: 'Schedule/event triggers',
      fabricTarget: 'Pipeline Schedules',
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-950'
    },
    { 
      label: 'Total Activities', 
      value: metrics.totalActivities, 
      icon: Lightning,
      description: 'Across all pipelines',
      fabricTarget: 'Activity Tasks',
      color: 'text-cyan-600 dark:text-cyan-400',
      bgColor: 'bg-cyan-50 dark:bg-cyan-950'
    },
    { 
      label: 'Avg Activities/Pipeline', 
      value: metrics.avgActivitiesPerPipeline.toFixed(1), 
      icon: TrendUp,
      description: 'Pipeline complexity indicator',
      fabricTarget: 'N/A',
      color: 'text-pink-600 dark:text-pink-400',
      bgColor: 'bg-pink-50 dark:bg-pink-950'
    }
  ];

  // Add optional metrics if they exist
  if (metrics.totalDataflows > 0) {
    coreMetrics.push({
      label: 'Dataflows',
      value: metrics.totalDataflows,
      icon: GitBranch,
      description: 'Mapping data flows',
      fabricTarget: 'Dataflow Gen2 (Manual)',
      color: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'bg-indigo-50 dark:bg-indigo-950'
    });
  }

  if (metrics.totalIntegrationRuntimes > 0) {
    coreMetrics.push({
      label: 'Integration Runtimes',
      value: metrics.totalIntegrationRuntimes,
      icon: Sparkle,
      description: 'Runtime configurations',
      fabricTarget: 'Gateways',
      color: 'text-violet-600 dark:text-violet-400',
      bgColor: 'bg-violet-50 dark:bg-violet-950'
    });
  }

  // Add Custom activity metrics if they exist
  if (metrics.customActivitiesCount > 0) {
    coreMetrics.push({
      label: 'Custom Activities',
      value: metrics.customActivitiesCount,
      icon: GitBranch,
      description: `${metrics.totalCustomActivityReferences} total connection refs`,
      fabricTarget: '3 LinkedService Locations',
      color: 'text-fuchsia-600 dark:text-fuchsia-400',
      bgColor: 'bg-fuchsia-50 dark:bg-fuchsia-950'
    });
  }

  return (
    <div className="space-y-4">
      {/* Core Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {coreMetrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label} className="hover:shadow-md transition-all hover:scale-[1.02]">
              <CardContent className="p-4">
                <div className={`flex items-start justify-between mb-2 ${metric.bgColor} -m-4 p-4 rounded-t-lg`}>
                  <Icon size={24} className={metric.color} weight="duotone" />
                </div>
                <div className="mt-2">
                  <div className="text-3xl font-bold text-accent mb-1">
                    {metric.value}
                  </div>
                  <div className="text-sm font-semibold text-foreground mb-1">
                    {metric.label}
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    {metric.description}
                  </div>
                  <div className="text-xs font-medium text-accent/70 flex items-center gap-1">
                    <span>→</span>
                    <span>{metric.fabricTarget}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Activity Type Breakdown */}
      {Object.keys(metrics.activitiesByType).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightning size={18} className="text-accent" />
              Activity Type Distribution
            </CardTitle>
            <CardDescription>
              Breakdown of {metrics.totalActivities} activities across all pipelines
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(metrics.activitiesByType)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => {
                  const percentage = ((count / metrics.totalActivities) * 100).toFixed(1);
                  return (
                    <div 
                      key={type} 
                      className="bg-muted/50 hover:bg-muted rounded-lg p-3 flex justify-between items-center transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" title={type}>
                          {type.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {percentage}% of total
                        </div>
                      </div>
                      <div className="text-lg font-bold text-accent ml-2">
                        {count}
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Most Complex Pipeline */}
      {metrics.maxActivitiesPipelineName && (
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-warning/10 rounded-lg">
                <Lightning size={24} className="text-warning" weight="duotone" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                  Most Complex Pipeline
                  {metrics.maxActivitiesPerPipeline > 15 && (
                    <span className="text-xs px-2 py-0.5 bg-warning/20 text-warning rounded-full">
                      High Complexity
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-mono text-foreground font-medium">
                    {metrics.maxActivitiesPipelineName}
                  </span>
                  {' '}contains{' '}
                  <span className="font-semibold text-warning">
                    {metrics.maxActivitiesPerPipeline}
                  </span>
                  {' '}activities
                  {metrics.maxActivitiesPerPipeline > 10 && (
                    <span className="text-xs ml-2 text-muted-foreground">
                      (may require extra attention during migration)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dependency Statistics */}
      {(metrics.pipelineDependencies > 0 || metrics.triggerPipelineMappings > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch size={18} className="text-accent" />
              Dependency Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {metrics.pipelineDependencies > 0 && (
                <div className="text-center p-3 bg-accent/5 rounded-lg">
                  <div className="text-2xl font-bold text-accent">
                    {metrics.pipelineDependencies}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Pipeline Dependencies
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    (Execute Pipeline activities)
                  </div>
                </div>
              )}
              {metrics.triggerPipelineMappings > 0 && (
                <div className="text-center p-3 bg-accent/5 rounded-lg">
                  <div className="text-2xl font-bold text-accent">
                    {metrics.triggerPipelineMappings}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Trigger Mappings
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    (Trigger → Pipeline connections)
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Custom Activity Statistics */}
      {metrics.customActivitiesCount > 0 && (
        <Card className="bg-fuchsia-50/50 dark:bg-fuchsia-950/20 border-fuchsia-200 dark:border-fuchsia-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch size={18} className="text-fuchsia-600 dark:text-fuchsia-400" />
              Custom Activity Connection Analysis
            </CardTitle>
            <CardDescription>
              Custom activities require special attention due to multiple LinkedService reference locations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-white dark:bg-slate-900 rounded-lg border border-fuchsia-200 dark:border-fuchsia-800">
                <div className="text-3xl font-bold text-fuchsia-600 dark:text-fuchsia-400">
                  {metrics.customActivitiesCount}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Custom Activities
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Total count in all pipelines
                </div>
              </div>
              
              <div className="text-center p-4 bg-white dark:bg-slate-900 rounded-lg border border-fuchsia-200 dark:border-fuchsia-800">
                <div className="text-3xl font-bold text-fuchsia-600 dark:text-fuchsia-400">
                  {metrics.totalCustomActivityReferences}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Total References
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Across all 3 locations
                </div>
              </div>
              
              <div className="text-center p-4 bg-white dark:bg-slate-900 rounded-lg border border-fuchsia-200 dark:border-fuchsia-800">
                <div className="text-3xl font-bold text-fuchsia-600 dark:text-fuchsia-400">
                  {metrics.customActivitiesWithMultipleReferences}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Multiple Refs
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Activities with 2+ references
                </div>
              </div>
            </div>
            
            {/* Info Box */}
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="text-xs text-amber-900 dark:text-amber-100">
                <strong>⚠️ Migration Note:</strong> Custom activities reference LinkedServices in up to 3 locations:
                <ul className="mt-1 ml-4 space-y-0.5">
                  <li className="text-blue-700 dark:text-blue-300">• <strong>Activity-level</strong> (linkedServiceName) - Required</li>
                  <li className="text-orange-700 dark:text-orange-300">• <strong>Resource</strong> (typeProperties.resourceLinkedService) - Optional</li>
                  <li className="text-purple-700 dark:text-purple-300">• <strong>Reference Objects</strong> (typeProperties.referenceObjects.linkedServices[]) - Optional</li>
                </ul>
                <div className="mt-2">
                  Each reference must be mapped to a Fabric Connection on the Mapping page.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
