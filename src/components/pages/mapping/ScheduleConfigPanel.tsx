import React, { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, Warning, ArrowRight, Clock } from '@phosphor-icons/react';
import { ADFComponent, FabricTarget, ADFRecurrence } from '../../../types';
import { scheduleConversionService } from '../../../services/scheduleConversionService';

interface ScheduleConfigPanelProps {
  component: ADFComponent;
  fabricTarget: FabricTarget;
  onConfigChange: (config: Partial<FabricTarget['scheduleConfig']>) => void;
}

export function ScheduleConfigPanel({ component, fabricTarget, onConfigChange }: ScheduleConfigPanelProps) {
  const config = fabricTarget.scheduleConfig;

  // Calculate Fabric schedule configuration from ADF trigger
  const fabricScheduleInfo = useMemo(() => {
    if (!component.triggerMetadata?.recurrence && !component.definition?.properties?.typeProperties?.recurrence) {
      return null;
    }

    try {
      const adfRecurrence: ADFRecurrence = component.triggerMetadata?.recurrence 
        ? {
            frequency: component.triggerMetadata.recurrence.frequency as any,
            interval: component.triggerMetadata.recurrence.interval,
            startTime: component.triggerMetadata.recurrence.startTime || new Date().toISOString(),
            endTime: component.triggerMetadata.recurrence.endTime,
            timeZone: component.triggerMetadata.recurrence.timeZone || 'UTC',
            schedule: component.definition?.properties?.typeProperties?.recurrence?.schedule
          }
        : component.definition?.properties?.typeProperties?.recurrence;

      if (!adfRecurrence) return null;

      const fabricConfig = scheduleConversionService.convertADFToFabricSchedule(adfRecurrence);
      const summary = scheduleConversionService.getScheduleSummary(fabricConfig);
      
      return { config: fabricConfig, summary };
    } catch (error) {
      console.error('Failed to convert schedule:', error);
      return null;
    }
  }, [component]);

  if (!config) {
    return (
      <Alert>
        <Warning size={16} />
        <AlertDescription>
          Schedule configuration not initialized
        </AlertDescription>
      </Alert>
    );
  }

  const runtimeState = component.triggerMetadata?.runtimeState;

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">Schedule Configuration</h4>
        <Badge variant={config.enabled ? 'default' : 'secondary'} className={config.enabled ? 'bg-green-500' : ''}>
          {config.enabled ? 'Will Be Enabled' : 'Will Be Disabled'}
        </Badge>
      </div>

      {/* Source State Warning */}
      {runtimeState === 'Stopped' && (
        <Alert className="bg-warning/10 border-warning">
          <Info size={16} />
          <AlertDescription className="text-xs">
            <strong>Original Trigger State: Stopped</strong><br />
            The source trigger was disabled in ADF. Schedule will be created disabled by default.
          </AlertDescription>
        </Alert>
      )}

      {/* Fabric Schedule Type Information */}
      {fabricScheduleInfo && (
        <div className="space-y-2 p-3 border border-blue-200 rounded-md bg-blue-50">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-blue-600" />
            <span className="font-semibold text-sm text-gray-900">
              Fabric Schedule Type: {fabricScheduleInfo.summary.type}
            </span>
          </div>
          <p className="text-sm text-gray-800 font-medium">
            {fabricScheduleInfo.summary.description}
          </p>
          <div className="mt-2 space-y-1 pl-4 border-l-2 border-blue-300">
            {fabricScheduleInfo.summary.details.map((detail, idx) => (
              <p key={idx} className="text-xs text-gray-700">
                {detail}
              </p>
            ))}
          </div>
          
          {/* Additional type-specific info */}
          {fabricScheduleInfo.config.type === 'Cron' && (
            <Alert className="mt-2 bg-blue-50 border-blue-300">
              <Info size={14} />
              <AlertDescription className="text-xs text-gray-800">
                <strong>Cron Schedule:</strong> Executes periodically every {fabricScheduleInfo.config.interval} minutes
              </AlertDescription>
            </Alert>
          )}
          
          {fabricScheduleInfo.config.type === 'Daily' && (
            <Alert className="mt-2 bg-blue-50 border-blue-300">
              <Info size={14} />
              <AlertDescription className="text-xs text-gray-800">
                <strong>Daily Schedule:</strong> {fabricScheduleInfo.config.times.length} time slot{fabricScheduleInfo.config.times.length > 1 ? 's' : ''} per day
              </AlertDescription>
            </Alert>
          )}
          
          {fabricScheduleInfo.config.type === 'Weekly' && (
            <Alert className="mt-2 bg-blue-50 border-blue-300">
              <Info size={14} />
              <AlertDescription className="text-xs text-gray-800">
                <strong>Weekly Schedule:</strong> {fabricScheduleInfo.config.weekdays.length} day{fabricScheduleInfo.config.weekdays.length > 1 ? 's' : ''} × {fabricScheduleInfo.config.times.length} time slot{fabricScheduleInfo.config.times.length > 1 ? 's' : ''}
              </AlertDescription>
            </Alert>
          )}
          
          {fabricScheduleInfo.config.type === 'Monthly' && (
            <Alert className="mt-2 bg-blue-50 border-blue-300">
              <Info size={14} />
              <AlertDescription className="text-xs text-gray-800">
                <strong>Monthly Schedule:</strong> Repeats every {fabricScheduleInfo.config.recurrence} month{fabricScheduleInfo.config.recurrence > 1 ? 's' : ''}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Parameter Loss Warning - Global */}
      {component.triggerMetadata?.pipelineParameters && 
       component.triggerMetadata.pipelineParameters.some(p => Object.keys(p.parameters).length > 0) && (
        <Alert className="bg-warning/10 border-warning">
          <Warning size={16} />
          <AlertDescription className="text-sm">
            <strong>⚠️ Parameter Values Will Not Be Migrated</strong>
            <p className="mt-1 text-xs">
              This trigger passes parameters to pipelines, but <strong>Fabric Schedules do not support parameters</strong>.
              Parameter values shown below will be lost during migration.
            </p>
            <p className="mt-2 text-xs font-medium">
              💡 Workaround: Set default values for pipeline parameters in the Fabric pipeline definition, 
              or use Fabric Variable Libraries to provide runtime values.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Target Pipelines with Parameters */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Target Pipelines</Label>
        {config.targetPipelines.length === 0 ? (
          <Alert variant="destructive">
            <Warning size={16} />
            <AlertDescription className="text-xs">
              <strong>No target pipelines found!</strong><br />
              This trigger does not reference any pipelines. Schedule cannot be created.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {config.targetPipelines.map((tp, idx) => {
              const pipelineParams = component.triggerMetadata?.pipelineParameters?.find(
                p => p.pipelineName === tp.pipelineName
              );
              const hasParams = pipelineParams && Object.keys(pipelineParams.parameters).length > 0;
              
              return (
                <div key={idx} className="p-3 border rounded-md bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowRight size={14} className="text-accent" />
                    <span className="font-medium text-sm">{tp.pipelineName}</span>
                    {config.targetPipelines.length > 1 && (
                      <Badge variant="outline" className="text-xs">
                        Schedule {idx + 1}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Parameters Display */}
                  {hasParams && (
                    <div className="ml-6 mt-2 space-y-1">
                      <div className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                        <span>Parameters (will not be migrated):</span>
                        <Badge variant="outline" className="text-xs border-warning text-warning">
                          Not supported in Fabric
                        </Badge>
                      </div>
                      <div className="space-y-1 pl-2">
                        {Object.entries(pipelineParams.parameters).map(([key, value]) => (
                          <div key={key} className="flex items-start gap-2 text-xs opacity-70">
                            <code className="font-mono text-muted-foreground line-through">{key}:</code>
                            <code className="font-mono text-muted-foreground line-through">
                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </code>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            
            {config.targetPipelines.length > 1 && (
              <Alert className="mt-2">
                <Info size={14} />
                <AlertDescription className="text-xs">
                  One schedule will be created for each pipeline ({config.targetPipelines.length} total)
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </div>

      {/* Schedule Name Preview - Enhanced Display */}
      {config.targetPipelines.length > 0 && (
        <div className="space-y-3 p-3 border border-blue-200 dark:border-blue-800 rounded-md bg-blue-50 dark:bg-blue-950/30">
          <Label className="text-xs font-medium flex items-center gap-2">
            <Info size={14} className="text-blue-600 dark:text-blue-400" />
            Schedule Name{config.targetPipelines.length > 1 ? 's' : ''} (Preview)
          </Label>
          <div className="space-y-2">
            {config.targetPipelines.map((tp, idx) => (
              <div 
                key={idx} 
                className="flex items-center gap-2 p-2 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 rounded"
              >
                <code className="text-sm font-mono font-semibold text-blue-900 dark:text-blue-100 flex-1">
                  {component.name}_{tp.pipelineName}
                </code>
                {config.targetPipelines.length > 1 && (
                  <Badge variant="secondary" className="text-xs">
                    #{idx + 1}
                  </Badge>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            These names will be used when deploying to Fabric
          </p>
        </div>
      )}

      {/* Enable/Disable Schedule */}
      <div className="flex items-center justify-between space-x-2 p-3 border rounded-md bg-background">
        <div className="space-y-1">
          <Label htmlFor={`enabled-${component.name}`} className="text-sm font-medium">
            Enable Schedule After Deployment
          </Label>
          <p className="text-xs text-muted-foreground">
            {config.enabled 
              ? 'Schedule will be active immediately after deployment' 
              : 'Schedule will remain disabled until you enable it manually'}
          </p>
        </div>
        <Switch
          id={`enabled-${component.name}`}
          checked={config.enabled}
          onCheckedChange={(checked) => onConfigChange({ enabled: checked })}
        />
      </div>

      {/* Frequency */}
      <div className="space-y-2">
        <Label htmlFor={`frequency-${component.name}`} className="text-xs font-medium">
          Frequency
        </Label>
        <Select
          value={config.frequency}
          onValueChange={(value) => onConfigChange({ frequency: value as any })}
        >
          <SelectTrigger id={`frequency-${component.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Minute">Minute</SelectItem>
            <SelectItem value="Hour">Hour</SelectItem>
            <SelectItem value="Day">Day</SelectItem>
            <SelectItem value="Week">Week</SelectItem>
            <SelectItem value="Month">Month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Interval */}
      <div className="space-y-2">
        <Label htmlFor={`interval-${component.name}`} className="text-xs font-medium">
          Interval
        </Label>
        <Input
          id={`interval-${component.name}`}
          type="number"
          min="1"
          value={config.interval}
          onChange={(e) => onConfigChange({ interval: parseInt(e.target.value) || 1 })}
        />
        <p className="text-xs text-muted-foreground">
          Run every {config.interval} {config.frequency.toLowerCase()}(s)
        </p>
      </div>

      {/* Start Time */}
      <div className="space-y-2">
        <Label htmlFor={`startTime-${component.name}`} className="text-xs font-medium">
          Start Time (Optional)
        </Label>
        <Input
          id={`startTime-${component.name}`}
          type="datetime-local"
          value={config.startTime ? new Date(config.startTime).toISOString().slice(0, 16) : ''}
          onChange={(e) => onConfigChange({ 
            startTime: e.target.value ? new Date(e.target.value).toISOString() : undefined 
          })}
        />
      </div>

      {/* End Time */}
      <div className="space-y-2">
        <Label htmlFor={`endTime-${component.name}`} className="text-xs font-medium">
          End Time (Optional)
        </Label>
        <Input
          id={`endTime-${component.name}`}
          type="datetime-local"
          value={config.endTime ? new Date(config.endTime).toISOString().slice(0, 16) : ''}
          onChange={(e) => onConfigChange({ 
            endTime: e.target.value ? new Date(e.target.value).toISOString() : undefined 
          })}
        />
      </div>

      {/* Time Zone */}
      <div className="space-y-2">
        <Label htmlFor={`timeZone-${component.name}`} className="text-xs font-medium">
          Time Zone
        </Label>
        <Select
          value={config.timeZone || 'UTC'}
          onValueChange={(value) => onConfigChange({ timeZone: value })}
        >
          <SelectTrigger id={`timeZone-${component.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="UTC">UTC</SelectItem>
            <SelectItem value="Eastern Standard Time">Eastern (US & Canada)</SelectItem>
            <SelectItem value="Central Standard Time">Central (US & Canada)</SelectItem>
            <SelectItem value="Mountain Standard Time">Mountain (US & Canada)</SelectItem>
            <SelectItem value="Pacific Standard Time">Pacific (US & Canada)</SelectItem>
            <SelectItem value="GMT Standard Time">GMT (London)</SelectItem>
            <SelectItem value="Central Europe Standard Time">Central Europe</SelectItem>
            <SelectItem value="Tokyo Standard Time">Tokyo</SelectItem>
            <SelectItem value="AUS Eastern Standard Time">Sydney</SelectItem>
            <SelectItem value="India Standard Time">India</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Deployment Warning */}
      {!config.enabled && (
        <Alert className="bg-info/10 border-info">
          <Info size={16} />
          <AlertDescription className="text-xs">
            <strong>Safety Note:</strong> Schedule will be created in Fabric but will remain disabled until you enable it manually. This gives you time to test pipelines first.
          </AlertDescription>
        </Alert>
      )}

      {config.enabled && (
        <Alert className="bg-warning/10 border-warning">
          <Warning size={16} />
          <AlertDescription className="text-xs">
            <strong>Warning:</strong> Schedule will be active immediately after deployment. Make sure pipelines are tested and ready for automation.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
