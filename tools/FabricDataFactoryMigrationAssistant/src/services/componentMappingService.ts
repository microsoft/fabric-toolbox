import { ADFComponent, FabricTarget } from '../types';

/**
 * Initialize FabricTarget with schedule configuration from trigger metadata
 * Default behavior: schedules are DISABLED by default for safety
 */
export function initializeScheduleTarget(component: ADFComponent): FabricTarget {
  if (component.type !== 'trigger' || !component.triggerMetadata) {
    throw new Error('Component must be a trigger with metadata');
  }

  const { triggerMetadata } = component;
  const pipelines = triggerMetadata.referencedPipelines || [];

  // Defensive check: if no pipelines found in metadata, try extracting from component definition
  if (pipelines.length === 0 && component.definition?.properties?.pipelines) {
    console.warn(`⚠️ No referencedPipelines in metadata for trigger "${component.name}", extracting from definition`);
    const rawPipelines = component.definition.properties.pipelines;
    pipelines.push(...(Array.isArray(rawPipelines) ? rawPipelines.map(p => 
      p.pipelineReference?.referenceName || p.pipelineName || p.name || 'unknown'
    ) : []));
  }

  // Map ADF frequency to Fabric frequency format
  const fabricFrequency = mapADFFrequencyToFabric(triggerMetadata.recurrence?.frequency || 'Day');

  return {
    type: 'schedule',
    name: `${component.name}_Schedules`,
    scheduleConfig: {
      enabled: false,  // ALWAYS DEFAULT TO FALSE for safety
      frequency: fabricFrequency,
      interval: triggerMetadata.recurrence?.interval || 1,
      startTime: triggerMetadata.recurrence?.startTime,
      endTime: triggerMetadata.recurrence?.endTime,
      timeZone: triggerMetadata.recurrence?.timeZone || 'UTC',
      targetPipelines: pipelines.map(p => ({ pipelineName: p }))
    }
  };
}

/**
 * Map ADF recurrence frequency to Fabric schedule frequency type
 * ADF uses: 'Minute' | 'Hour' | 'Day' | 'Week' | 'Month'
 * Fabric uses: 'Minute' | 'Hour' | 'Day' | 'Week' | 'Month' (same, but validates)
 */
function mapADFFrequencyToFabric(adfFreq: string): 'Minute' | 'Hour' | 'Day' | 'Week' | 'Month' {
  const validFrequencies: ('Minute' | 'Hour' | 'Day' | 'Week' | 'Month')[] = [
    'Minute',
    'Hour',
    'Day',
    'Week',
    'Month'
  ];

  // Check if it's already a valid Fabric frequency
  if (validFrequencies.includes(adfFreq as any)) {
    return adfFreq as 'Minute' | 'Hour' | 'Day' | 'Week' | 'Month';
  }

  // Default to 'Day' if unrecognized
  console.warn(`Unknown ADF frequency '${adfFreq}', defaulting to 'Day'`);
  return 'Day';
}

/**
 * Update schedule configuration for a trigger component
 */
export function updateScheduleConfig(
  component: ADFComponent,
  configUpdate: Partial<FabricTarget['scheduleConfig']>
): FabricTarget | undefined {
  if (!component.fabricTarget?.scheduleConfig) {
    console.error('Component does not have schedule configuration initialized');
    return undefined;
  }

  return {
    ...component.fabricTarget,
    scheduleConfig: {
      ...component.fabricTarget.scheduleConfig,
      ...configUpdate
    }
  };
}

/**
 * Validate schedule configuration before deployment
 */
export function validateScheduleConfig(scheduleConfig: FabricTarget['scheduleConfig']): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!scheduleConfig) {
    errors.push('Schedule configuration is missing');
    return { isValid: false, errors, warnings };
  }

  // Validate target pipelines
  if (!scheduleConfig.targetPipelines || scheduleConfig.targetPipelines.length === 0) {
    errors.push('At least one target pipeline must be specified');
  }

  // Validate interval
  if (scheduleConfig.interval < 1) {
    errors.push('Interval must be at least 1');
  }

  // Validate start/end time relationship
  if (scheduleConfig.startTime && scheduleConfig.endTime) {
    const startDate = new Date(scheduleConfig.startTime);
    const endDate = new Date(scheduleConfig.endTime);
    if (endDate <= startDate) {
      errors.push('End time must be after start time');
    }
  }

  // Warning for enabled schedules
  if (scheduleConfig.enabled) {
    warnings.push('Schedule will be active immediately after deployment. Ensure pipelines are tested.');
  }

  // Warning for multi-pipeline triggers
  if (scheduleConfig.targetPipelines.length > 1) {
    warnings.push(`This will create ${scheduleConfig.targetPipelines.length} separate schedules, one for each pipeline`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
