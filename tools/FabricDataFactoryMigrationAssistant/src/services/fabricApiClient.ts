import { WorkspaceInfo, SupportedConnectionType, ApiError, DeploymentResult } from '../types';

export class FabricApiClient {
  public baseUrl = 'https://api.fabric.microsoft.com/v1';

  async getWorkspaces(accessToken: string): Promise<WorkspaceInfo[]> {
    const response = await fetch(`${this.baseUrl}/workspaces`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch workspaces: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const fabricWorkspaces = data.value || [];

    return fabricWorkspaces.map((workspace: any) => ({
      id: workspace.id,
      name: workspace.displayName,
      description: workspace.description,
      type: workspace.type,
      hasContributorAccess: true
    }));
  }

  async validateWorkspacePermissions(workspaceId: string, accessToken: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/workspaces/${workspaceId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  async getSupportedConnectionTypes(accessToken: string): Promise<SupportedConnectionType[]> {
    const endpoint = `${this.baseUrl}/connections/supportedConnectionTypes`;
    try {
      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn(`Failed to fetch supported connection types: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      return data.value || [];
    } catch (error) {
      console.warn('Error fetching supported connection types:', error);
      return [];
    }
  }

  // Mask sensitive data (extracted from original service)
  maskSensitiveData(data: any): any {
    if (!data || typeof data !== 'object') return data;

    const sensitiveKeys = [
      'password', 'secret', 'key', 'token', 'connectionString',
      'authorization', 'accesstoken', 'clientsecret'
    ];

    const maskValue = (obj: any): any => {
      if (Array.isArray(obj)) return obj.map(maskValue);
      if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          const lower = key.toLowerCase();
          if (sensitiveKeys.some(s => lower.includes(s))) {
            result[key] = typeof value === 'string' ? '***MASKED***' : '***';
          } else {
            result[key] = maskValue(value);
          }
        }
        return result;
      }
      return obj;
    };

    return maskValue(data);
  }

  // Provide a shared API error handler to create DeploymentResult objects
  async handleAPIError(
    response: Response,
    method: string,
    endpoint: string,
    payload: any,
    headers: Record<string, string>,
    componentName: string,
    componentType: string
  ): Promise<DeploymentResult> {
    let errorMessage = `${response.status} ${response.statusText}`;
    let detailedErrorMessage = errorMessage;
    let apiResponseBody: any = null;
    
    try {
      const errorData = await response.json();
      apiResponseBody = errorData;
      
      if (errorData.error) {
        const err = typeof errorData.error === 'string' ? errorData.error : errorData.error.message || JSON.stringify(errorData.error);
        detailedErrorMessage = `${errorMessage}: ${err}`;
      } else if (errorData.message) {
        detailedErrorMessage = `${errorMessage}: ${errorData.message}`;
      } else {
        detailedErrorMessage = `${errorMessage}: ${JSON.stringify(errorData)}`;
      }

      if (response.status === 403) {
        const lower = JSON.stringify(errorData).toLowerCase();
        if (lower.includes('insufficient') || lower.includes('scope')) {
          detailedErrorMessage = `${errorMessage}: Insufficient OAuth scopes. The access token does not have the required permissions (Connection.ReadWrite.All, Gateway.ReadWrite.All, or Item.ReadWrite.All).`;
        }
      }
    } catch {
      if (response.status === 403) {
        detailedErrorMessage = `${errorMessage}: Possible insufficient OAuth scopes. Please ensure your access token has Connection.ReadWrite.All, Gateway.ReadWrite.All, and Item.ReadWrite.All permissions.`;
      }
    }

    // Always include payload details in error message for better debugging
    const payloadSummary = this.createPayloadSummary(payload);
    const enhancedErrorMessage = `${detailedErrorMessage}\n\nRequest Details:\n- Method: ${method}\n- Endpoint: ${endpoint}\n- Payload Summary: ${payloadSummary}`;

    const apiError: ApiError = {
      status: response.status,
      statusText: response.statusText,
      method,
      endpoint,
      payload: this.maskSensitiveData(payload),
      headers: this.maskSensitiveData(headers)
    };

    return {
      componentName,
      componentType,
      status: 'failed',
      error: enhancedErrorMessage,
      errorMessage: enhancedErrorMessage,
      apiError,
      apiRequestDetails: {
        method,
        endpoint,
        payload: this.maskSensitiveData(payload),
        headers: this.maskSensitiveData(headers),
        responseBody: apiResponseBody ? this.maskSensitiveData(apiResponseBody) : undefined
      }
    } as DeploymentResult;
  }

  // Create a summary of the payload for error messages
  private createPayloadSummary(payload: any): string {
    if (!payload || typeof payload !== 'object') {
      return typeof payload;
    }

    const summary: string[] = [];
    
    if (payload.displayName) {
      summary.push(`displayName: "${payload.displayName}"`);
    }
    
    if (payload.connectivityType) {
      summary.push(`connectivityType: "${payload.connectivityType}"`);
    }
    
    if (payload.connectionDetails?.type) {
      summary.push(`connectionType: "${payload.connectionDetails.type}"`);
    }
    
    if (payload.credentialDetails?.credentialType) {
      summary.push(`credentialType: "${payload.credentialDetails.credentialType}"`);
    }
    
    if (payload.definition?.parts) {
      summary.push(`hasPipelineDefinition: true`);
      
      // Try to decode and analyze pipeline definition for debugging
      try {
        const parts = payload.definition.parts;
        if (parts && parts.length > 0 && parts[0].payload) {
          const decodedPayload = atob(parts[0].payload);
          const pipelineData = JSON.parse(decodedPayload);
          
          if (pipelineData.properties?.activities) {
            const activitiesCount = pipelineData.properties.activities.length;
            summary.push(`activitiesCount: ${activitiesCount}`);
            
            // Check for InvokePipeline activities with connection mapping issues
            const invokePipelineActivities = pipelineData.properties.activities.filter((activity: any) => 
              activity.type === 'InvokePipeline'
            );
            
            if (invokePipelineActivities.length > 0) {
              summary.push(`invokePipelineActivities: ${invokePipelineActivities.length}`);
              
              // Check for missing connection mappings
              const activitiesWithMissingConnections = invokePipelineActivities.filter((activity: any) => 
                !activity.externalReferences?.connection || 
                activity.externalReferences.connection === '00000000-0000-0000-0000-000000000000' ||
                activity.typeProperties?.pipelineId === '00000000-0000-0000-0000-000000000000' ||
                activity.typeProperties?.workspaceId === '00000000-0000-0000-0000-000000000000'
              );
              
              if (activitiesWithMissingConnections.length > 0) {
                summary.push(`invokePipelineActivitiesWithMissingMappings: ${activitiesWithMissingConnections.length}`);
                summary.push(`missingMappingActivities: [${activitiesWithMissingConnections.map((a: any) => a.name).join(', ')}]`);
              }
            }
          }
        }
      } catch (error) {
        // If we can't decode the pipeline, just note that we tried
        summary.push(`pipelineDecodingFailed: true`);
      }
    }
    
    // Add context information if available
    if (payload.componentName) {
      summary.push(`componentName: "${payload.componentName}"`);
    }
    
    if (payload.hasPipelineConnectionMappings !== undefined) {
      summary.push(`hasPipelineConnectionMappings: ${payload.hasPipelineConnectionMappings}`);
    }
    
    if (payload.deployedPipelineIdsCount !== undefined) {
      summary.push(`deployedPipelineIdsCount: ${payload.deployedPipelineIdsCount}`);
    }
    
    if (payload.workspaceId) {
      summary.push(`workspaceId: "${payload.workspaceId}"`);
    }

    const keys = Object.keys(payload);
    summary.push(`totalFields: ${keys.length}`);
    
    return summary.join(', ');
  }
}

export const fabricApiClient = new FabricApiClient();
