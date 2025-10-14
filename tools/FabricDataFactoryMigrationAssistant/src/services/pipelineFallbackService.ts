import { fabricApiClient } from './fabricApiClient';

/**
 * Interface for pipeline information from Fabric API
 */
interface FabricPipelineInfo {
  id: string;
  displayName: string;
  description?: string;
  workspaceId: string;
  type: string;
  properties?: any;
}

/**
 * Interface for pipeline lookup result
 */
interface PipelineLookupResult {
  found: boolean;
  pipelineId?: string;
  displayName?: string;
  error?: string;
}

/**
 * Service to handle fallback pipeline lookup for InvokePipeline activities
 * Provides functionality to check if target pipelines are already deployed in Fabric
 */
export class PipelineFallbackService {
  private baseUrl = 'https://api.fabric.microsoft.com/v1';
  private pipelineCache = new Map<string, FabricPipelineInfo>();
  
  /**
   * Checks if a target pipeline exists in the specified workspace using the Fabric API
   * @param targetPipelineName The name of the pipeline to look for
   * @param workspaceId The workspace ID to search in
   * @param accessToken The access token for authentication
   * @returns Promise<PipelineLookupResult> Information about whether the pipeline was found
   */
  async checkPipelineExists(
    targetPipelineName: string,
    workspaceId: string,
    accessToken: string
  ): Promise<PipelineLookupResult> {
    const cacheKey = `${workspaceId}:${targetPipelineName}`;
    
    console.log(`Checking if pipeline '${targetPipelineName}' exists in workspace '${workspaceId}'`);
    
    // Check cache first
    if (this.pipelineCache.has(cacheKey)) {
      const cachedPipeline = this.pipelineCache.get(cacheKey)!;
      console.log(`Found cached pipeline '${targetPipelineName}' with ID '${cachedPipeline.id}'`);
      return {
        found: true,
        pipelineId: cachedPipeline.id,
        displayName: cachedPipeline.displayName
      };
    }

    try {
      // Get all pipelines in the workspace
      const allPipelines = await this.getAllPipelinesInWorkspace(workspaceId, accessToken);
      
      // Look for pipeline by name (case-insensitive match)
      const matchingPipeline = allPipelines.find(pipeline => 
        pipeline.displayName.toLowerCase() === targetPipelineName.toLowerCase()
      );
      
      if (matchingPipeline) {
        // Cache the result for future lookups
        this.pipelineCache.set(cacheKey, matchingPipeline);
        
        console.log(`Found existing pipeline '${targetPipelineName}' with ID '${matchingPipeline.id}'`);
        return {
          found: true,
          pipelineId: matchingPipeline.id,
          displayName: matchingPipeline.displayName
        };
      } else {
        console.log(`Pipeline '${targetPipelineName}' not found in workspace '${workspaceId}'`);
        console.log(`Available pipelines: [${allPipelines.map(p => p.displayName).join(', ')}]`);
        return {
          found: false,
          error: `Pipeline '${targetPipelineName}' not found in workspace`
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error checking pipeline existence';
      console.error(`Error checking pipeline existence for '${targetPipelineName}':`, {
        error: errorMessage,
        workspaceId,
        targetPipelineName
      });
      
      return {
        found: false,
        error: `Failed to check pipeline existence: ${errorMessage}`
      };
    }
  }

  /**
   * Gets a specific pipeline by ID from Fabric workspace
   * @param workspaceId The workspace ID
   * @param pipelineId The pipeline ID to retrieve
   * @param accessToken The access token for authentication
   * @returns Promise<FabricPipelineInfo | null> The pipeline information or null if not found
   */
  async getPipelineById(
    workspaceId: string,
    pipelineId: string,
    accessToken: string
  ): Promise<FabricPipelineInfo | null> {
    const endpoint = `${this.baseUrl}/workspaces/${workspaceId}/dataPipelines/${pipelineId}`;
    
    console.log(`Fetching pipeline by ID: ${pipelineId} from workspace: ${workspaceId}`);
    
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`Pipeline with ID '${pipelineId}' not found (404)`);
          return null;
        }
        
        const errorText = await response.text();
        throw new Error(`Failed to fetch pipeline ${pipelineId}: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const pipelineData = await response.json();
      
      const pipelineInfo: FabricPipelineInfo = {
        id: pipelineData.id,
        displayName: pipelineData.displayName,
        description: pipelineData.description,
        workspaceId: workspaceId,
        type: pipelineData.type || 'DataPipeline',
        properties: pipelineData.properties
      };
      
      console.log(`Successfully retrieved pipeline '${pipelineInfo.displayName}' (${pipelineId})`);
      return pipelineInfo;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error fetching pipeline by ID '${pipelineId}':`, {
        error: errorMessage,
        workspaceId,
        pipelineId,
        endpoint
      });
      
      throw error;
    }
  }

  /**
   * Gets all pipelines in a workspace
   * @param workspaceId The workspace ID
   * @param accessToken The access token for authentication
   * @returns Promise<FabricPipelineInfo[]> Array of pipeline information
   */
  private async getAllPipelinesInWorkspace(
    workspaceId: string,
    accessToken: string
  ): Promise<FabricPipelineInfo[]> {
    const endpoint = `${this.baseUrl}/workspaces/${workspaceId}/dataPipelines`;
    
    console.log(`Fetching all pipelines from workspace: ${workspaceId}`);
    
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch pipelines from workspace ${workspaceId}: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      const pipelines = data.value || [];
      
      console.log(`Found ${pipelines.length} pipelines in workspace '${workspaceId}'`);
      
      return pipelines.map((pipeline: any) => ({
        id: pipeline.id,
        displayName: pipeline.displayName,
        description: pipeline.description,
        workspaceId: workspaceId,
        type: pipeline.type || 'DataPipeline',
        properties: pipeline.properties
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error fetching pipelines from workspace '${workspaceId}':`, {
        error: errorMessage,
        workspaceId,
        endpoint
      });
      
      throw error;
    }
  }

  /**
   * Validates that a pipeline with specific properties exists
   * @param workspaceId The workspace ID containing the pipeline
   * @param pipelineId The pipeline ID to validate
   * @param accessToken The access token for authentication
   * @returns Promise<boolean> True if the pipeline exists and is valid
   */
  async validatePipelineExists(
    workspaceId: string,
    pipelineId: string,
    accessToken: string
  ): Promise<boolean> {
    try {
      const pipeline = await this.getPipelineById(workspaceId, pipelineId, accessToken);
      
      if (!pipeline) {
        console.log(`Pipeline validation failed: Pipeline '${pipelineId}' not found`);
        return false;
      }
      
      console.log(`Pipeline validation successful: Pipeline '${pipeline.displayName}' (${pipelineId}) exists`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Pipeline validation failed for '${pipelineId}':`, {
        error: errorMessage,
        workspaceId,
        pipelineId
      });
      
      return false;
    }
  }

  /**
   * Batch validates multiple pipeline IDs
   * @param workspaceId The workspace ID containing the pipelines
   * @param pipelineIds Array of pipeline IDs to validate
   * @param accessToken The access token for authentication
   * @returns Promise<Record<string, boolean>> Map of pipeline ID to validation result
   */
  async batchValidatePipelines(
    workspaceId: string,
    pipelineIds: string[],
    accessToken: string
  ): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    console.log(`Batch validating ${pipelineIds.length} pipelines in workspace '${workspaceId}'`);
    
    // Validate pipelines concurrently for better performance
    const validationPromises = pipelineIds.map(async (pipelineId) => {
      const isValid = await this.validatePipelineExists(workspaceId, pipelineId, accessToken);
      results[pipelineId] = isValid;
      return { pipelineId, isValid };
    });
    
    try {
      const validationResults = await Promise.all(validationPromises);
      
      const validCount = validationResults.filter(r => r.isValid).length;
      console.log(`Batch validation completed: ${validCount}/${pipelineIds.length} pipelines are valid`);
      
      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Batch pipeline validation failed:`, {
        error: errorMessage,
        workspaceId,
        pipelineIds,
        partialResults: results
      });
      
      throw error;
    }
  }

  /**
   * Attempts to resolve a pipeline reference using fallback lookup
   * @param targetPipelineName The name of the target pipeline
   * @param workspaceId The workspace ID to search in
   * @param accessToken The access token for authentication
   * @returns Promise<string | null> The pipeline ID if found, null otherwise
   */
  async resolvePipelineReference(
    targetPipelineName: string,
    workspaceId: string,
    accessToken: string
  ): Promise<string | null> {
    console.log(`Attempting to resolve pipeline reference for '${targetPipelineName}' using fallback lookup`);
    
    try {
      const lookupResult = await this.checkPipelineExists(targetPipelineName, workspaceId, accessToken);
      
      if (lookupResult.found && lookupResult.pipelineId) {
        console.log(`Successfully resolved pipeline reference: '${targetPipelineName}' -> '${lookupResult.pipelineId}'`);
        return lookupResult.pipelineId;
      } else {
        console.log(`Failed to resolve pipeline reference for '${targetPipelineName}': ${lookupResult.error || 'Pipeline not found'}`);
        return null;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error resolving pipeline reference for '${targetPipelineName}':`, {
        error: errorMessage,
        workspaceId,
        targetPipelineName
      });
      
      return null;
    }
  }

  /**
   * Clears the pipeline cache
   */
  clearCache(): void {
    console.log('Clearing pipeline lookup cache');
    this.pipelineCache.clear();
  }

  /**
   * Gets cache statistics for debugging
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.pipelineCache.size,
      keys: Array.from(this.pipelineCache.keys())
    };
  }
}

// Export singleton instance
export const pipelineFallbackService = new PipelineFallbackService();