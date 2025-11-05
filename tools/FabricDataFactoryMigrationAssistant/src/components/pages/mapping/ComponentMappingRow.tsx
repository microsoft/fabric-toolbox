import React, { useState } from 'react';
import { 
  CaretDown, 
  CaretRight, 
  Warning, 
  CheckCircle,
  ArrowRight,
  Info
} from '@phosphor-icons/react';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Alert, AlertDescription } from '../../ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import type { ADFComponent, FabricTarget } from '../../../types';
import type { ActivityLinkedServiceReference } from '../../../services/pipelineActivityAnalysisService';
import { ExistingConnectionsService } from '../../../services/existingConnectionsService';
import { ScheduleConfigPanel } from './ScheduleConfigPanel';

interface ComponentMappingRowProps {
  component: ADFComponent & { mappingIndex: number; mappingStatus?: any };
  isSelected: boolean;
  onToggle: () => void;
  onTargetTypeChange: (index: number, value: string) => void;
  onTargetNameChange: (index: number, value: string) => void;
  onTargetConfigChange?: (index: number, updatedTarget: FabricTarget) => void;
  onActivityConnectionMapping?: (pipelineName: string, uniqueId: string, connectionId: string, mappingInfo: any) => void;
  getPipelineActivityReferences?: (component: ADFComponent) => ActivityLinkedServiceReference[];
  pipelineConnectionMappings?: any;
  existingConnections?: any[];
  loadingConnections?: boolean;
  autoSelectedMappings?: string[];
  showCheckbox?: boolean;
}

const TARGET_TYPE_OPTIONS: Record<string, Array<{ value: FabricTarget['type']; label: string }>> = {
  pipeline: [{ value: 'dataPipeline', label: 'Data Pipeline' }],
  linkedService: [
    { value: 'connector', label: 'Connector' },
    { value: 'gateway', label: 'Data Gateway Connection' }
  ],
  globalParameter: [{ value: 'variable', label: 'Variable Library Entry' }],
  trigger: [{ value: 'schedule', label: 'Pipeline Schedule' }],
  integrationRuntime: [{ value: 'gateway', label: 'Fabric Gateway' }],
  customActivity: [
    { value: 'notebook', label: 'Fabric Notebook' },
    { value: 'dataPipeline', label: 'Data Pipeline Activity' }
  ]
};

export function ComponentMappingRow({
  component,
  isSelected,
  onToggle,
  onTargetTypeChange,
  onTargetNameChange,
  onTargetConfigChange,
  onActivityConnectionMapping,
  getPipelineActivityReferences,
  pipelineConnectionMappings = {},
  existingConnections = [],
  loadingConnections = false,
  autoSelectedMappings = [],
  showCheckbox = true
}: ComponentMappingRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasTarget = component.fabricTarget?.type && component.fabricTarget?.name;
  const warnings = component.warnings || [];
  const isPipeline = component.type === 'pipeline';
  const isTrigger = component.type === 'trigger';
  
  const mappingStatus = component.mappingStatus || {
    required: 0,
    completed: 0,
    percentage: 100,
    hasAutoMapped: false,
    hasManual: false
  };

  const getTargetTypeOptions = (sourceType: string) => {
    return TARGET_TYPE_OPTIONS[sourceType] || TARGET_TYPE_OPTIONS.pipeline;
  };

  const getStatusBadge = () => {
    if (!hasTarget) {
      return <Badge variant="outline" className="text-xs">Not Configured</Badge>;
    }
    if (isPipeline && mappingStatus.required > 0) {
      const isComplete = mappingStatus.percentage === 100;
      const hasNone = mappingStatus.completed === 0;
      const variant = isComplete ? 'default' : hasNone ? 'destructive' : 'outline';
      
      return (
        <Badge variant={variant} className="text-xs flex items-center gap-1">
          {isComplete ? (
            <CheckCircle size={12} weight="fill" />
          ) : (
            <Warning size={12} weight="fill" />
          )}
          {mappingStatus.completed}/{mappingStatus.required} mapped
        </Badge>
      );
    }
    return <Badge variant="default" className="text-xs bg-success text-success-foreground">Configured</Badge>;
  };

  const handleTargetTypeChange = (value: string) => {
    onTargetTypeChange(component.mappingIndex, value);
  };

  const handleTargetNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onTargetNameChange(component.mappingIndex, e.target.value);
  };

  const buildActivityUniqueId = (reference: ActivityLinkedServiceReference, index: number) => {
    const linkedServiceKey = reference.linkedServiceName || reference.datasetLinkedServiceName || 'Unknown';
    return `${reference.activityName}_${linkedServiceKey}_${index}`;
  };

  const renderConnectionOptions = (reference: ActivityLinkedServiceReference, uniqueId: string) => {
    const isInvokePipeline = reference.referenceLocation === 'invokePipeline';
    const filteredConnectionOptions = existingConnections.filter(connection =>
      isInvokePipeline
        ? connection.connectionDetails?.type === 'FabricDataPipelines'
        : connection.connectionDetails?.type !== 'FabricDataPipelines'
    );

    if (filteredConnectionOptions.length === 0) {
      return (
        <SelectItem value="" disabled>
          {loadingConnections
            ? 'Loading Fabric connections...'
            : isInvokePipeline
            ? 'No FabricDataPipelines connections available'
            : 'No Fabric connections available'}
        </SelectItem>
      );
    }

    return filteredConnectionOptions.map(connection => (
      <SelectItem key={`${uniqueId}-${connection.id}`} value={connection.id}>
        <div className="flex flex-col text-left">
          <span className="font-medium">{connection.displayName}</span>
          <span className="text-xs text-muted-foreground">
            {connection.connectionDetails?.type} • {ExistingConnectionsService.formatConnectivityType(connection.connectivityType)}
          </span>
        </div>
      </SelectItem>
    ));
  };

  const renderPipelineActivities = () => {
    if (!isPipeline || !getPipelineActivityReferences) return null;

    const references = getPipelineActivityReferences(component);
    if (references.length === 0) {
      return (
        <Alert>
          <Info size={16} />
          <AlertDescription className="text-sm">
            No LinkedService references detected for this pipeline.
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <div className="space-y-3">
        <div className="text-sm font-medium">Pipeline Activities & LinkedService Mappings</div>
        {references.map((reference, index) => {
          const uniqueId = buildActivityUniqueId(reference, index);
          const currentMapping = pipelineConnectionMappings[component.name]?.[uniqueId];
          const selectedConnectionId = currentMapping?.selectedConnectionId || '';
          const isMissing = !selectedConnectionId;
          const isInvokePipeline = reference.referenceLocation === 'invokePipeline';
          
          const linkedServiceLabel = isInvokePipeline
            ? `InvokePipeline → ${reference.targetPipelineName || 'Unknown'}`
            : reference.linkedServiceName || reference.datasetLinkedServiceName || 'LinkedService';

          const isAutoMapped = autoSelectedMappings.some(autoText =>
            autoText.startsWith(`${component.name}.${reference.activityName} →`)
          );

          return (
            <div
              key={uniqueId}
              className={`rounded border p-3 ${
                isMissing ? 'border-warning bg-warning/5' : 'bg-background'
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {reference.activityName}
                    {isMissing && (
                      <Badge variant="outline" className="border-warning text-xs text-warning">
                        Mapping required
                      </Badge>
                    )}
                    {isInvokePipeline && (
                      <Badge variant="outline" className="border-info text-xs text-info">
                        InvokePipeline
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {reference.activityType} activity • {linkedServiceLabel}
                  </div>
                </div>
                <ArrowRight size={16} className="mt-1 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <Label className="text-xs font-medium">
                    {isInvokePipeline ? 'FabricDataPipelines Connection' : 'Fabric Connection'}
                  </Label>
                  <Select
                    key={`${uniqueId}-select`}
                    value={selectedConnectionId}
                    onValueChange={(value) => {
                      if (onActivityConnectionMapping) {
                        onActivityConnectionMapping(
                          component.name,
                          uniqueId,
                          value,
                          {
                            activityName: reference.activityName,
                            activityType: reference.activityType,
                            linkedServiceReference: reference.linkedServiceName
                              ? { name: reference.linkedServiceName, type: reference.linkedServiceType }
                              : undefined,
                            selectedConnectionId: value
                          }
                        );
                      }
                    }}
                    disabled={loadingConnections}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue
                        placeholder={
                          loadingConnections
                            ? 'Loading Fabric connections...'
                            : 'Select Fabric connection'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {renderConnectionOptions(reference, uniqueId)}
                    </SelectContent>
                  </Select>
                  {selectedConnectionId && (
                    <div className="mt-1 flex items-center gap-2 text-xs text-accent">
                      <CheckCircle size={12} weight="fill" />
                      Mapped to{' '}
                      {existingConnections.find(conn => conn.id === selectedConnectionId)?.displayName ||
                        selectedConnectionId}
                      {isAutoMapped && (
                        <Badge
                          variant="outline"
                          className="h-4 px-1 text-xs text-accent border-accent/30 bg-accent/10"
                        >
                          Auto-applied from previous step
                        </Badge>
                      )}
                    </div>
                  )}
                  {isMissing && (
                    <div className="mt-1 text-xs text-warning">
                      Select a Fabric connection to keep this activity active after migration.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <tr className={`border-b hover:bg-muted/50 transition-colors ${isExpanded ? 'bg-muted/30' : ''}`}>
        {showCheckbox && (
          <td className="p-3">
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggle}
              aria-label={`Select ${component.name}`}
            />
          </td>
        )}
        <td className="p-3">
          <div className="flex items-center gap-2">
            {isPipeline && mappingStatus.required > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-6 w-6 p-0"
              >
                {isExpanded ? <CaretDown size={14} /> : <CaretRight size={14} />}
              </Button>
            )}
            <span className="font-medium">{component.name}</span>
          </div>
        </td>
        <td className="p-3">
          <Badge variant="outline" className="text-xs capitalize">
            {component.type.replace(/([A-Z])/g, ' $1').trim()}
          </Badge>
        </td>
        <td className="p-3">
          <Select
            value={component.fabricTarget?.type || ''}
            onValueChange={handleTargetTypeChange}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {getTargetTypeOptions(component.type).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
        <td className="p-3">
          <Input
            value={component.fabricTarget?.name || component.name}
            onChange={handleTargetNameChange}
            placeholder="Enter name"
            className="max-w-xs"
          />
        </td>
        <td className="p-3">
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            {mappingStatus.hasAutoMapped && (
              <Badge variant="outline" className="text-xs border-accent text-accent">
                Auto
              </Badge>
            )}
          </div>
        </td>
        <td className="p-3">
          {warnings.length > 0 ? (
            <Badge variant="outline" className="border-warning text-warning text-xs">
              <Warning size={14} className="mr-1" />
              {warnings.length}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="p-3 text-right">
          {(isPipeline && mappingStatus.required > 0) || isTrigger ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? 'Hide' : 'Show'} Details
            </Button>
          ) : null}
        </td>
      </tr>
      {isExpanded && isPipeline && mappingStatus.required > 0 && (
        <tr>
          <td colSpan={showCheckbox ? 8 : 7} className="p-4 bg-muted/30">
            <div className="space-y-3">
              {warnings.length > 0 && (
                <Alert className="mb-3">
                  <Warning size={16} />
                  <AlertDescription>
                    <div className="space-y-1 text-sm">
                      {warnings.map((warning, idx) => (
                        <div key={idx}>• {warning}</div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              {renderPipelineActivities()}
            </div>
          </td>
        </tr>
      )}
      {isExpanded && isTrigger && component.fabricTarget?.scheduleConfig && onTargetConfigChange && (
        <tr>
          <td colSpan={showCheckbox ? 8 : 7} className="p-4 bg-muted/30">
            <ScheduleConfigPanel
              component={component}
              fabricTarget={component.fabricTarget}
              onConfigChange={(configUpdate) => {
                const updatedTarget: FabricTarget = {
                  ...component.fabricTarget!,
                  scheduleConfig: {
                    ...component.fabricTarget!.scheduleConfig!,
                    ...configUpdate
                  }
                };
                onTargetConfigChange(component.mappingIndex, updatedTarget);
              }}
            />
          </td>
        </tr>
      )}
    </>
  );
}
