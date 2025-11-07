import { ADFComponent } from '../types';

/**
 * Pipeline reference interface for ExecutePipeline activities
 */
export interface PipelineReference {
  parentPipelineName: string;
  activityName: string;
  targetPipelineName: string;
  activityType: string;
  waitOnCompletion: boolean;
  parameters: Record<string, any>;
  connectionId?: string;
  isReferencedByOthers: boolean;
}

/**
 * Pipeline ordering information for deployment
 */
export interface PipelineDeploymentOrder {
  pipelineName: string;
  dependsOnPipelines: string[];
  level: number; // 0 = no dependencies, 1 = depends on level 0, etc.
  isReferencedByOthers: boolean;
}

/**
 * Service to handle ExecutePipeline activities and their transformation to InvokePipeline
 */
export class InvokePipelineService {
  private pipelineReferences: PipelineReference[] = [];
  private pipelineComponents: ADFComponent[] = [];

  /**
   * Parses all pipeline components to extract ExecutePipeline activity references
   */
  parseExecutePipelineActivities(components: ADFComponent[]): void {
    this.pipelineComponents = components.filter(comp => comp.type === 'pipeline');
    this.pipelineReferences = [];

    console.log(`Parsing ${this.pipelineComponents.length} pipeline components for ExecutePipeline activities`);

    for (const pipeline of this.pipelineComponents) {
      if (!pipeline.definition?.properties?.activities) continue;

      for (const activity of pipeline.definition.properties.activities) {
        if (activity.type === 'ExecutePipeline') {
          const reference = this.extractPipelineReference(pipeline.name, activity);
          if (reference) {
            this.pipelineReferences.push(reference);
            console.log(`Found ExecutePipeline activity: ${reference.parentPipelineName} -> ${reference.targetPipelineName}`);
          }
        }
      }
    }

    // Update isReferencedByOthers flag
    this.updateReferencedFlags();

    console.log(`Found ${this.pipelineReferences.length} ExecutePipeline activities`);
  }

  /**
   * Extracts pipeline reference information from an ExecutePipeline activity
   */
  private extractPipelineReference(parentPipelineName: string, activity: any): PipelineReference | null {
    if (!activity.typeProperties?.pipeline?.referenceName) {
      console.warn(`ExecutePipeline activity '${activity.name}' missing pipeline reference`);
      return null;
    }

    return {
      parentPipelineName,
      activityName: activity.name,
      targetPipelineName: activity.typeProperties.pipeline.referenceName,
      activityType: activity.type,
      waitOnCompletion: activity.typeProperties.waitOnCompletion !== false, // Default to true
      parameters: activity.typeProperties.parameters || {},
      isReferencedByOthers: false // Will be updated later
    };
  }

  /**
   * Updates the isReferencedByOthers flag for all pipeline references
   */
  private updateReferencedFlags(): void {
    const referencedPipelineNames = new Set(this.pipelineReferences.map(ref => ref.targetPipelineName));
    
    for (const reference of this.pipelineReferences) {
      reference.isReferencedByOthers = referencedPipelineNames.has(reference.parentPipelineName);
    }
  }

  /**
   * Determines deployment order for pipelines based on ExecutePipeline dependencies
   */
  calculateDeploymentOrder(): PipelineDeploymentOrder[] {
    const allPipelineNames = this.pipelineComponents.map(c => c.name);
    const deploymentOrder: PipelineDeploymentOrder[] = [];

    // Create deployment order entries for all pipelines
    for (const pipelineName of allPipelineNames) {
      const dependsOnPipelines = this.pipelineReferences
        .filter(ref => ref.parentPipelineName === pipelineName)
        .map(ref => ref.targetPipelineName);

      const isReferencedByOthers = this.pipelineReferences.some(ref => ref.targetPipelineName === pipelineName);

      deploymentOrder.push({
        pipelineName,
        dependsOnPipelines,
        level: 0, // Will be calculated
        isReferencedByOthers
      });
    }

    this.calculateDeploymentLevels(deploymentOrder);

    // Sort by level, then by name for consistent ordering
    return deploymentOrder.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.pipelineName.localeCompare(b.pipelineName);
    });
  }

  /**
   * Calculates deployment levels to ensure dependencies are deployed first
   */
  private calculateDeploymentLevels(deploymentOrder: PipelineDeploymentOrder[]): void {
    const pipelineMap = new Map<string, PipelineDeploymentOrder>();
    deploymentOrder.forEach(order => pipelineMap.set(order.pipelineName, order));

    const visited = new Set<string>();
    const visiting = new Set<string>();

    const calculateLevel = (pipelineName: string): number => {
      if (visiting.has(pipelineName)) {
        throw new Error(`Circular dependency detected involving pipeline '${pipelineName}'`);
      }
      
      if (visited.has(pipelineName)) {
        return pipelineMap.get(pipelineName)?.level || 0;
      }

      visiting.add(pipelineName);
      const pipeline = pipelineMap.get(pipelineName);
      
      if (!pipeline) {
        return 0;
      }

      let maxDependencyLevel = -1;
      for (const dependency of pipeline.dependsOnPipelines) {
        const depLevel = calculateLevel(dependency);
        maxDependencyLevel = Math.max(maxDependencyLevel, depLevel);
      }

      pipeline.level = maxDependencyLevel + 1;
      visiting.delete(pipelineName);
      visited.add(pipelineName);

      return pipeline.level;
    };

    // Calculate levels for all pipelines
    for (const pipeline of deploymentOrder) {
      if (!visited.has(pipeline.pipelineName)) {
        calculateLevel(pipeline.pipelineName);
      }
    }
  }

  /**
   * Transforms an ExecutePipeline activity to an InvokePipeline activity for Fabric
   */
  transformExecutePipelineToInvokePipeline(
    activity: any,
    targetPipelineId: string, 
    workspaceId: string,
    connectionId: string
  ): any {
    if (!activity || activity.type !== 'ExecutePipeline') {
      throw new Error('Invalid activity: Expected ExecutePipeline activity');
    }

    const transformedActivity = {
      name: activity.name,
      type: 'InvokePipeline',
      dependsOn: activity.dependsOn || [],
      policy: {
        timeout: activity.policy?.timeout || '0.12:00:00',
        retry: activity.policy?.retry || 0,
        retryIntervalInSeconds: activity.policy?.retryIntervalInSeconds || 30,
        secureOutput: activity.policy?.secureOutput || false,
        secureInput: activity.policy?.secureInput || false
      },
      userProperties: activity.userProperties || [],
      typeProperties: {
        waitOnCompletion: activity.typeProperties?.waitOnCompletion !== false, // Default to true
        operationType: 'InvokeFabricPipeline',
        pipelineId: targetPipelineId,
        workspaceId: workspaceId,
        parameters: activity.typeProperties?.parameters || {}
      },
      externalReferences: {
        connection: connectionId
      }
    };

    console.log(`Transformed ExecutePipeline '${activity.name}' to InvokePipeline`);
    return transformedActivity;
  }

  /**
   * Updates connection ID for a specific pipeline reference
   */
  updatePipelineReferenceConnection(parentPipeline: string, activityName: string, connectionId: string): void {
    const reference = this.pipelineReferences.find(ref => 
      ref.parentPipelineName === parentPipeline && ref.activityName === activityName
    );

    if (reference) {
      reference.connectionId = connectionId;
    } else {
      console.warn(`Pipeline reference not found: ${parentPipeline} -> ${activityName}`);
    }
  }

  /**
   * Validates that all referenced pipelines exist in the component list
   */
  validatePipelineReferences(): { isValid: boolean; missingPipelines: string[] } {
    const availablePipelineNames = new Set(this.pipelineComponents.map(c => c.name));
    const missingPipelines: string[] = [];

    for (const ref of this.pipelineReferences) {
      if (!availablePipelineNames.has(ref.targetPipelineName)) {
        missingPipelines.push(ref.targetPipelineName);
      }
    }

    if (missingPipelines.length > 0) {
      console.error('Missing pipeline references:', missingPipelines);
    }

    return {
      isValid: missingPipelines.length === 0,
      missingPipelines
    };
  }

  /**
   * Gets all pipeline references
   */
  getPipelineReferences(): PipelineReference[] {
    return this.pipelineReferences;
  }

  /**
   * Gets unique target pipeline names that are referenced by ExecutePipeline activities
   */
  getUniqueTargetPipelineNames(): string[] {
    const uniqueNames = new Set(this.pipelineReferences.map(ref => ref.targetPipelineName));
    return Array.from(uniqueNames);
  }

  /**
   * Gets pipelines that depend on a given pipeline
   */
  getPipelineDependents(pipelineName: string): PipelineReference[] {
    return this.pipelineReferences.filter(ref => ref.targetPipelineName === pipelineName);
  }

  /**
   * Gets all ExecutePipeline activities for a specific parent pipeline
   */
  getExecutePipelineActivitiesForPipeline(pipelineName: string): PipelineReference[] {
    return this.pipelineReferences.filter(ref => ref.parentPipelineName === pipelineName);
  }

  /**
   * Gets fabric data pipeline connections needed for ExecutePipeline activities
   */
  getFabricDataPipelineConnections(): Array<{
    parentPipeline: string;
    activityName: string;
    targetPipeline: string;
    displayName: string;
  }> {
    return this.pipelineReferences.map(ref => ({
      parentPipeline: ref.parentPipelineName,
      activityName: ref.activityName,
      targetPipeline: ref.targetPipelineName,
      displayName: `${ref.parentPipelineName} - ${ref.activityName} -> ${ref.targetPipelineName}`
    }));
  }

  /**
   * Clears all cached data
   */
  clear(): void {
    this.pipelineReferences = [];
    this.pipelineComponents = [];
  }
}

// Export singleton instance
export const invokePipelineService = new InvokePipelineService();