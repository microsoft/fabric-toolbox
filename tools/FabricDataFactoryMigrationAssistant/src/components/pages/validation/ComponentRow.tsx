import React, { useState } from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CaretRight, 
  CaretDown, 
  Warning, 
  CheckCircle, 
  XCircle,
  FolderOpen,
  Folder,
  ArrowRight,
  Info
} from '@phosphor-icons/react';
import { ADFComponent } from '../../../types';

interface ComponentRowProps {
  component: ADFComponent & { originalIndex: number };
  onToggle: (index: number, isSelected: boolean) => void;
  componentType?: string;
}

export function ComponentRow({ component, onToggle, componentType }: ComponentRowProps) {
  const [expanded, setExpanded] = useState(false);

  const getStatusBadge = (status: ADFComponent['compatibilityStatus']) => {
    switch (status) {
      case 'supported':
        return (
          <Badge variant="default" className="bg-accent">
            <CheckCircle size={14} className="mr-1" />
            Supported
          </Badge>
        );
      case 'partiallySupported':
        return (
          <Badge variant="outline" className="border-warning text-warning">
            <Warning size={14} className="mr-1" />
            Needs Attention
          </Badge>
        );
      case 'unsupported':
        return (
          <Badge variant="destructive">
            <XCircle size={14} className="mr-1" />
            Unsupported
          </Badge>
        );
    }
  };

  return (
    <>
      <TableRow className="hover:bg-muted/50">
        {/* Checkbox */}
        <TableCell>
          <Checkbox
            checked={component.isSelected}
            disabled={component.compatibilityStatus === 'unsupported'}
            onCheckedChange={(checked) =>
              onToggle(component.originalIndex, checked as boolean)
            }
          />
        </TableCell>

        {/* Name with expand button */}
        <TableCell>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <CaretDown size={16} /> : <CaretRight size={16} />}
            </Button>
            <span className="font-medium truncate">{component.name}</span>
          </div>
        </TableCell>

        {/* Folder Path - Only for pipelines */}
        {componentType === 'pipeline' && (
          <TableCell>
            {component.folder?.path ? (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <FolderOpen size={14} />
                <span className="truncate" title={component.folder.path}>
                  {component.folder.path}
                </span>
                {component.folder.isFlattened && (
                  <Badge variant="outline" className="ml-1 text-xs">
                    Flattened
                  </Badge>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1 text-sm text-muted-foreground/50">
                <Folder size={14} />
                <span>Root</span>
              </div>
            )}
          </TableCell>
        )}

        {/* Status Badge */}
        <TableCell>
          {getStatusBadge(component.compatibilityStatus)}
        </TableCell>

        {/* Warning Count */}
        <TableCell>
          {component.warnings && component.warnings.length > 0 && (
            <Badge variant="outline" className="gap-1">
              <Warning size={14} />
              {component.warnings.length}
            </Badge>
          )}
        </TableCell>

        {/* Quick Actions */}
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Hide' : 'Details'}
          </Button>
        </TableCell>
      </TableRow>

      {/* Expandable Details Row */}
      {expanded && (
        <TableRow>
          <TableCell colSpan={componentType === 'pipeline' ? 6 : 5} className="bg-muted/30">
            <div className="py-3 space-y-3">
              {/* Warnings */}
              {component.warnings && component.warnings.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Warning size={16} className="text-warning" />
                    Warnings
                  </h4>
                  <div className="space-y-1 pl-6">
                    {component.warnings.map((warning, index) => (
                      <div
                        key={index}
                        className="text-sm text-warning flex items-start gap-2"
                      >
                        <span className="text-warning">•</span>
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fabric Target */}
              {component.fabricTarget && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Fabric Target</h4>
                  <div className="pl-6 text-sm text-muted-foreground">
                    <div>
                      <span className="font-medium">Type:</span>{' '}
                      {component.fabricTarget.type}
                    </div>
                    <div>
                      <span className="font-medium">Name:</span>{' '}
                      {component.fabricTarget.name}
                    </div>
                  </div>
                </div>
              )}

              {/* Trigger-Specific Details */}
              {component.type === 'trigger' && component.triggerMetadata && (
                <div className="space-y-3">
                  {/* Runtime State */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Runtime State</h4>
                    <div className="pl-6 flex items-center gap-2">
                      <Badge 
                        variant={component.triggerMetadata.runtimeState === 'Started' ? 'default' : 'secondary'}
                        className={component.triggerMetadata.runtimeState === 'Started' ? 'bg-green-500' : 'bg-gray-500'}
                      >
                        {component.triggerMetadata.runtimeState}
                      </Badge>
                      {component.triggerMetadata.runtimeState === 'Stopped' && (
                        <span className="text-xs text-muted-foreground">
                          (Trigger is currently disabled in ADF)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Trigger Type */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Trigger Type</h4>
                    <div className="pl-6 text-sm text-muted-foreground">
                      {component.triggerMetadata.type}
                    </div>
                  </div>

                  {/* Referenced Pipelines */}
                  {component.triggerMetadata.referencedPipelines.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Activates Pipelines</h4>
                      <div className="pl-6 space-y-1">
                        {component.triggerMetadata.referencedPipelines.map((pipeline, idx) => (
                          <div key={idx} className="text-sm text-muted-foreground flex items-center gap-2">
                            <ArrowRight size={14} className="text-accent" />
                            <span className="font-medium">{pipeline}</span>
                          </div>
                        ))}
                      </div>
                      {component.triggerMetadata.referencedPipelines.length > 1 && (
                        <div className="pl-6 mt-2">
                          <Badge variant="outline" className="gap-1">
                            <Info size={12} />
                            Multi-pipeline trigger - {component.triggerMetadata.referencedPipelines.length} schedules will be created
                          </Badge>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recurrence Schedule */}
                  {component.triggerMetadata.recurrence && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Schedule Configuration</h4>
                      <div className="pl-6 space-y-1 text-sm">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          <div>
                            <span className="font-medium text-muted-foreground">Frequency:</span>{' '}
                            <span className="text-foreground">{component.triggerMetadata.recurrence.frequency}</span>
                          </div>
                          <div>
                            <span className="font-medium text-muted-foreground">Interval:</span>{' '}
                            <span className="text-foreground">{component.triggerMetadata.recurrence.interval}</span>
                          </div>
                          {component.triggerMetadata.recurrence.startTime && (
                            <div className="col-span-2">
                              <span className="font-medium text-muted-foreground">Start Time:</span>{' '}
                              <span className="text-foreground">
                                {new Date(component.triggerMetadata.recurrence.startTime).toLocaleString()}
                              </span>
                            </div>
                          )}
                          {component.triggerMetadata.recurrence.endTime && (
                            <div className="col-span-2">
                              <span className="font-medium text-muted-foreground">End Time:</span>{' '}
                              <span className="text-foreground">
                                {new Date(component.triggerMetadata.recurrence.endTime).toLocaleString()}
                              </span>
                            </div>
                          )}
                          <div className="col-span-2">
                            <span className="font-medium text-muted-foreground">Time Zone:</span>{' '}
                            <span className="text-foreground">{component.triggerMetadata.recurrence.timeZone || 'UTC'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Parameter Warning for Triggers */}
                  {component.triggerMetadata.pipelineParameters && 
                   component.triggerMetadata.pipelineParameters.some(p => Object.keys(p.parameters).length > 0) && (
                    <div className="mt-3">
                      <Alert className="bg-warning/10 border-warning">
                        <Warning size={16} />
                        <AlertDescription className="text-sm">
                          <strong>⚠️ Trigger Parameters Detected</strong>
                          <p className="mt-1 text-xs">
                            This trigger passes parameters to pipelines. Fabric Schedules do not support parameters,
                            so these values will be lost during migration.
                          </p>
                          <div className="mt-2 space-y-1">
                            {component.triggerMetadata.pipelineParameters.map((pp, idx) => {
                              const paramCount = Object.keys(pp.parameters).length;
                              if (paramCount === 0) return null;
                              return (
                                <div key={idx} className="text-xs">
                                  <strong>{pp.pipelineName}:</strong> {paramCount} parameter{paramCount !== 1 ? 's' : ''}
                                </div>
                              );
                            })}
                          </div>
                          <p className="mt-2 text-xs font-medium">
                            💡 Workaround: Set default values in Fabric pipeline definitions or use Variable Libraries.
                          </p>
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}
                </div>
              )}

              {/* Component Type */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Component Type</h4>
                <div className="pl-6 text-sm text-muted-foreground">
                  {component.type}
                </div>
              </div>

              {/* Migration Notes */}
              {component.compatibilityStatus === 'partiallySupported' && (
                <div className="mt-3 p-3 bg-warning/10 border border-warning/20 rounded-md">
                  <p className="text-sm text-warning">
                    <strong>Note:</strong> This component is partially supported. 
                    Manual configuration may be required after migration.
                  </p>
                </div>
              )}

              {component.compatibilityStatus === 'unsupported' && (
                <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <p className="text-sm text-destructive">
                    <strong>Note:</strong> This component is not supported for automatic migration. 
                    Consider alternative approaches in Fabric.
                  </p>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
