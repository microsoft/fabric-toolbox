import { ADFComponent, DeploymentResult, ADFRecurrence } from '../types';
import { fabricApiClient } from './fabricApiClient';
import { scheduleConversionService } from './scheduleConversionService';

export class ScheduleService {
  /**
   * Create a schedule in Fabric for a specific pipeline
   * Uses correct Fabric API endpoint: /workspaces/{workspaceId}/items/{pipelineItemId}/jobs/Pipeline/schedules
   * Supports all Fabric schedule types: Cron, Daily, Weekly, Monthly
   * 
   * @param component - The ADF trigger component
   * @param accessToken - Fabric API access token
   * @param workspaceId - Target Fabric workspace ID
   * @param pipelineId - The Fabric pipeline item ID to attach the schedule to
   * @param pipelineName - The pipeline name (for display/logging)
   * @returns DeploymentResult with success/failure status
   */
  async createSchedule(
    component: ADFComponent, 
    accessToken: string, 
    workspaceId: string,
    pipelineId: string,
    pipelineName: string
  ): Promise<DeploymentResult> {
    // Correct Fabric API endpoint with jobType='Pipeline'
    const endpoint = `${fabricApiClient.baseUrl}/workspaces/${workspaceId}/items/${pipelineId}/jobs/Pipeline/schedules`;
    const headers = { 
      'Authorization': `Bearer ${accessToken}`, 
      'Content-Type': 'application/json' 
    };

    try {
      // Get enabled state from scheduleConfig (defaults to false for safety)
      const enabled = component.fabricTarget?.scheduleConfig?.enabled ?? false;
      
      // Extract ADF recurrence data
      let adfRecurrence: ADFRecurrence;
      
      // First try to get from triggerMetadata (parsed structure)
      if (component.triggerMetadata?.recurrence) {
        const meta = component.triggerMetadata.recurrence;
        adfRecurrence = {
          frequency: meta.frequency as any,
          interval: meta.interval,
          startTime: meta.startTime || new Date().toISOString(),
          endTime: meta.endTime,
          timeZone: meta.timeZone || 'UTC',
          schedule: component.definition?.properties?.typeProperties?.recurrence?.schedule
        };
      } 
      // Fallback to raw definition
      else {
        const rawRecurrence = component.definition?.properties?.typeProperties?.recurrence;
        if (!rawRecurrence) {
          return { 
            componentName: component.name, 
            componentType: component.type, 
            status: 'failed', 
            error: 'No recurrence data found in trigger definition or metadata' 
          };
        }
        adfRecurrence = rawRecurrence;
      }

      console.log(`[SCHEDULE CREATE] Processing trigger '${component.name}' for pipeline '${pipelineName}':`, {
        frequency: adfRecurrence.frequency,
        interval: adfRecurrence.interval,
        hasScheduleObject: Boolean(adfRecurrence.schedule),
        enabled
      });

      // Convert ADF recurrence to appropriate Fabric schedule configuration
      const fabricScheduleConfig = scheduleConversionService.convertADFToFabricSchedule(adfRecurrence);
      
      // Build final payload
      const schedulePayload = {
        enabled: enabled,
        configuration: fabricScheduleConfig
      };

      console.log(`[SCHEDULE CREATE] Creating ${fabricScheduleConfig.type} schedule (enabled=${enabled}) for pipeline '${pipelineName}':`, {
        trigger: component.name,
        pipeline: pipelineName,
        pipelineId,
        enabled,
        schedulePayload
      });

      const response = await fetch(endpoint, { 
        method: 'POST', 
        headers, 
        body: JSON.stringify(schedulePayload) 
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorBody: any;
        try {
          errorBody = JSON.parse(errorText);
        } catch {
          errorBody = errorText;
        }
        
        console.error(`[SCHEDULE CREATE ERROR] Failed to create schedule:`, {
          status: response.status,
          statusText: response.statusText,
          error: errorBody,
          payload: schedulePayload,
          endpoint
        });

        return await fabricApiClient.handleAPIError(
          response, 
          'POST', 
          endpoint, 
          schedulePayload, 
          headers, 
          `${component.name} -> ${pipelineName}`, 
          component.type
        );
      }

      const result = await response.json();
      console.log(`[SCHEDULE CREATE SUCCESS] Schedule created:`, {
        scheduleId: result.id,
        scheduleType: fabricScheduleConfig.type,
        trigger: component.name,
        pipeline: pipelineName,
        enabled,
        result
      });

      const scheduleDescription = scheduleConversionService.getScheduleDescription(fabricScheduleConfig);

      return { 
        componentName: `${component.name} -> ${pipelineName}`, 
        componentType: component.type, 
        status: 'success', 
        fabricResourceId: result.id,
        note: `${fabricScheduleConfig.type} schedule created ${enabled ? 'ENABLED' : 'DISABLED'}: ${scheduleDescription}`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error creating schedule';
      console.error(`[SCHEDULE CREATE EXCEPTION]`, {
        trigger: component.name,
        pipeline: pipelineName,
        error
      });
      return { 
        componentName: `${component.name} -> ${pipelineName}`, 
        componentType: component.type, 
        status: 'failed', 
        error: errorMessage 
      };
    }
  }
}

export const scheduleService = new ScheduleService();

