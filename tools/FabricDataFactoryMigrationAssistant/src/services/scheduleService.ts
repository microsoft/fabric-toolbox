import { ADFComponent, DeploymentResult } from '../types';
import { fabricApiClient } from './fabricApiClient';

export class ScheduleService {
  // Create a schedule in Fabric
  async createSchedule(component: ADFComponent, accessToken: string, workspaceId: string): Promise<DeploymentResult> {
    const endpoint = `${fabricApiClient.baseUrl}/workspaces/${workspaceId}/schedules`;
    const headers = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    try {
      const schedulePayload = {
        displayName: `${component.fabricTarget?.name || component.name}_Schedule`,
        description: `Migrated from ADF trigger: ${component.name}`,
        schedule: {
          frequency: component.definition?.recurrence?.frequency,
          interval: component.definition?.recurrence?.interval,
          startTime: component.definition?.recurrence?.startTime,
          endTime: component.definition?.recurrence?.endTime,
          timeZone: component.definition?.recurrence?.timeZone
        },
        pipelineName: component.fabricTarget?.name || component.name
      };

      const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(schedulePayload) });
      if (!response.ok) return await fabricApiClient.handleAPIError(response, 'POST', endpoint, schedulePayload, headers, component.name, component.type);
      const result = await response.json();
      return { componentName: component.name, componentType: component.type, status: 'success', fabricResourceId: result.id };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error creating schedule';
      return { componentName: component.name, componentType: component.type, status: 'failed', error: errorMessage };
    }
  }
}

export const scheduleService = new ScheduleService();
