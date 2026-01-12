import { authService } from './authService';

export interface WorkspaceIdentityInfo {
  applicationId: string;
  servicePrincipalId: string;
}

export interface WorkspaceDetails {
  id: string;
  displayName: string;
  description?: string;
  type: string;
  domainId?: string;
  capacityId?: string;
  capacityAssignmentProgress?: string;
  workspaceIdentity?: WorkspaceIdentityInfo;
  capacityRegion?: string;
  oneLakeEndpoints?: {
    blobEndpoint: string;
    dfsEndpoint: string;
  };
}

export interface WorkspaceCredentialMapping {
  sourceName: string;
  sourceType: 'ManagedIdentity';
  targetApplicationId: string;
  status: 'pending' | 'configured' | 'failed';
  validationErrors: string[];
}

class WorkspaceIdentityService {
  /**
   * Get workspace details including workspace identity information
   * @param workspaceId The workspace ID
   * @returns Promise<WorkspaceDetails>
   */
  async getWorkspaceDetails(workspaceId: string): Promise<WorkspaceDetails> {
    try {
      console.log(`Fetching workspace details for workspace: ${workspaceId}`);
      
      // Get access token from auth service
      const authState = authService.loadAuthState();
      if (!authState?.accessToken) {
        throw new Error('No access token available');
      }

      const response = await fetch(`https://api.fabric.microsoft.com/v1/workspaces/${workspaceId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authState.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const workspaceDetails: WorkspaceDetails = await response.json();
      console.log('Workspace details response:', workspaceDetails);

      if (workspaceDetails.workspaceIdentity) {
        console.log(`✅ Found existing workspace identity:`, {
          applicationId: workspaceDetails.workspaceIdentity.applicationId,
          servicePrincipalId: workspaceDetails.workspaceIdentity.servicePrincipalId
        });
      } else {
        console.log('ℹ️ No workspace identity found for this workspace');
      }

      return workspaceDetails;
    } catch (error) {
      console.error('Error fetching workspace details:', error);
      throw new Error(`Failed to fetch workspace details: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a new Fabric Workspace Identity
   * @param workspaceId The workspace ID
   * @returns Promise<WorkspaceIdentityInfo>
   */
  async createWorkspaceIdentity(workspaceId: string): Promise<WorkspaceIdentityInfo> {
    try {
      console.log(`Creating workspace identity for workspace: ${workspaceId}`);

      // Get access token from auth service
      const authState = authService.loadAuthState();
      if (!authState?.accessToken) {
        throw new Error('No access token available');
      }

      const response = await fetch(`https://api.fabric.microsoft.com/v1/workspaces/${workspaceId}/provisionIdentity`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      // Handle 202 Accepted - provisioning in progress
      if (response.status === 202) {
        console.log('✅ Workspace identity provisioning accepted (202), fetching current state...');
        
        // Wait a moment for provisioning to potentially complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Fetch the current workspace state to get the identity
        const workspaceDetails = await this.getWorkspaceDetails(workspaceId);
        
        if (workspaceDetails.workspaceIdentity) {
          console.log('✅ Successfully retrieved provisioned workspace identity:', {
            applicationId: workspaceDetails.workspaceIdentity.applicationId,
            servicePrincipalId: workspaceDetails.workspaceIdentity.servicePrincipalId
          });
          return workspaceDetails.workspaceIdentity;
        } else {
          // Identity is still being provisioned, poll for completion
          return await this.pollForWorkspaceIdentity(workspaceId);
        }
      }

      // Handle immediate success (200)
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }

      const workspaceIdentity: WorkspaceIdentityInfo = await response.json();

      console.log('✅ Successfully created workspace identity:', {
        applicationId: workspaceIdentity.applicationId,
        servicePrincipalId: workspaceIdentity.servicePrincipalId
      });

      return workspaceIdentity;
    } catch (error) {
      console.error('Error creating workspace identity:', error);
      throw new Error(`Failed to create workspace identity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Poll for workspace identity completion after 202 response
   * @param workspaceId The workspace ID
   * @returns Promise<WorkspaceIdentityInfo>
   */
  private async pollForWorkspaceIdentity(workspaceId: string): Promise<WorkspaceIdentityInfo> {
    const maxAttempts = 10;
    const pollInterval = 2000; // 2 seconds

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`Polling for workspace identity completion (attempt ${attempt}/${maxAttempts})...`);
      
      try {
        const workspaceDetails = await this.getWorkspaceDetails(workspaceId);
        
        if (workspaceDetails.workspaceIdentity) {
          console.log('✅ Workspace identity provisioning completed:', {
            applicationId: workspaceDetails.workspaceIdentity.applicationId,
            servicePrincipalId: workspaceDetails.workspaceIdentity.servicePrincipalId
          });
          return workspaceDetails.workspaceIdentity;
        }
        
        if (attempt < maxAttempts) {
          console.log(`Identity still provisioning, waiting ${pollInterval}ms before next attempt...`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
      } catch (error) {
        console.warn(`Error polling for workspace identity (attempt ${attempt}):`, error);
        
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
      }
    }

    throw new Error('Workspace identity provisioning timed out. The identity may still be provisioning in the background.');
  }

  /**
   * Check if workspace identity exists and create if needed
   * @param workspaceId The workspace ID
   * @returns Promise<WorkspaceIdentityInfo>
   */
  async ensureWorkspaceIdentity(workspaceId: string): Promise<WorkspaceIdentityInfo> {
    try {
      // First check if workspace identity already exists
      const workspaceDetails = await this.getWorkspaceDetails(workspaceId);
      
      if (workspaceDetails.workspaceIdentity) {
        console.log('✅ Workspace identity already exists, using existing identity');
        return workspaceDetails.workspaceIdentity;
      }

      // Create new workspace identity if one doesn't exist
      console.log('ℹ️ No workspace identity found, creating new identity');
      return await this.createWorkspaceIdentity(workspaceId);
    } catch (error) {
      console.error('Error ensuring workspace identity:', error);
      throw error;
    }
  }

  /**
   * Process ARM template credentials and identify workspace identities
   * @param armTemplateComponents The parsed ARM template components
   * @returns Array of workspace credential mappings
   */
  processWorkspaceCredentials(armTemplateComponents: any[]): WorkspaceCredentialMapping[] {
    const workspaceCredentials: WorkspaceCredentialMapping[] = [];

    try {
      console.log('Processing ARM template for workspace credentials...');
      console.log(`Processing ${armTemplateComponents.length} ARM template components`);

      for (const component of armTemplateComponents) {
        if (!component || !component.name) continue;

        console.log(`Checking component: ${component.name}, type: ${component.type}`);

        // Check for managedIdentity component type (mapped from Microsoft.Synapse/workspaces/credentials with ManagedIdentity type)
        if (component.type === 'managedIdentity') {
          console.log(`✅ Found ManagedIdentity credential: ${component.name}`);
          
          workspaceCredentials.push({
            sourceName: component.name,
            sourceType: 'ManagedIdentity',
            targetApplicationId: '', // Will be set when workspace identity is created/retrieved
            status: 'pending',
            validationErrors: []
          });
          continue;
        }

        // Check for globalParameter credentials that are of ManagedIdentity type
        if (component.type === 'globalParameter' && 
            component.definition?.type === 'credential' &&
            component.definition?.properties?.type === 'ManagedIdentity') {
          
          console.log(`✅ Found ADF ManagedIdentity credential: ${component.name}`);
          
          workspaceCredentials.push({
            sourceName: component.name,
            sourceType: 'ManagedIdentity',
            targetApplicationId: '', // Will be set when workspace identity is created/retrieved
            status: 'pending',
            validationErrors: []
          });
        }
      }

      console.log(`✅ Found ${workspaceCredentials.length} workspace identity mappings`);
      return workspaceCredentials;

    } catch (error) {
      console.error('❌ Error processing workspace credentials:', error);
      throw new Error(`Failed to process workspace credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update workspace credential mappings with the actual workspace identity
   * @param mappings The workspace credential mappings
   * @param workspaceIdentity The workspace identity information
   * @returns Updated mappings
   */
  updateCredentialMappings(
    mappings: WorkspaceCredentialMapping[], 
    workspaceIdentity: WorkspaceIdentityInfo
  ): WorkspaceCredentialMapping[] {
    return mappings.map(mapping => ({
      ...mapping,
      targetApplicationId: workspaceIdentity.applicationId,
      status: 'configured' as const
    }));
  }

  /**
   * Validate workspace identity configuration
   * @param workspaceId The workspace ID
   * @returns Promise<boolean>
   */
  async validateWorkspaceIdentity(workspaceId: string): Promise<boolean> {
    try {
      const workspaceDetails = await this.getWorkspaceDetails(workspaceId);
      
      if (!workspaceDetails.workspaceIdentity) {
        console.warn('No workspace identity found for validation');
        return false;
      }

      // Basic validation - check if applicationId and servicePrincipalId are present
      const isValid = !!(
        workspaceDetails.workspaceIdentity.applicationId && 
        workspaceDetails.workspaceIdentity.servicePrincipalId
      );

      console.log(`Workspace identity validation result: ${isValid ? 'VALID' : 'INVALID'}`);
      return isValid;

    } catch (error) {
      console.error('Error validating workspace identity:', error);
      return false;
    }
  }
}

export const workspaceIdentityService = new WorkspaceIdentityService();