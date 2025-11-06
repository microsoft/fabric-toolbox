import {
  ActivityTypeEnum,
  ActivityReferenceLocation,
  ActivityReference,
  ActivityWithReferences,
  ActivityGroup,
  PipelineMappingSummary,
  ADFComponent,
  CustomActivityLinkedServiceReference
} from '../types';

/**
 * Color palette for activity types (Tailwind colors)
 */
const ACTIVITY_TYPE_COLORS: Record<ActivityTypeEnum, { color: string; iconName: string; label: string }> = {
  'Copy': { color: '#10b981', iconName: 'Copy', label: 'Copy Activities' },
  'Custom': { color: '#a855f7', iconName: 'Boxes', label: 'Custom Activities' },
  'Lookup': { color: '#3b82f6', iconName: 'Search', label: 'Lookup Activities' },
  'ExecutePipeline': { color: '#f97316', iconName: 'Play', label: 'Execute Pipeline' },
  'Web': { color: '#06b6d4', iconName: 'Globe', label: 'Web/REST Activities' },
  'AzureFunctionActivity': { color: '#06b6d4', iconName: 'Zap', label: 'Azure Functions' },
  'ForEach': { color: '#6366f1', iconName: 'Repeat', label: 'ForEach Loops' },
  'IfCondition': { color: '#6366f1', iconName: 'GitBranch', label: 'If Conditions' },
  'Switch': { color: '#6366f1', iconName: 'GitMerge', label: 'Switch Activities' },
  'Until': { color: '#6366f1', iconName: 'RotateCw', label: 'Until Loops' },
  'SqlServerStoredProcedure': { color: '#8b5cf6', iconName: 'Database', label: 'Stored Procedures' },
  'AzureDataExplorerCommand': { color: '#8b5cf6', iconName: 'Terminal', label: 'Data Explorer' },
  'GetMetadata': { color: '#3b82f6', iconName: 'Info', label: 'Get Metadata' },
  'Delete': { color: '#ef4444', iconName: 'Trash2', label: 'Delete Activities' },
  'SetVariable': { color: '#10b981', iconName: 'Variable', label: 'Set Variables' },
  'AppendVariable': { color: '#10b981', iconName: 'Plus', label: 'Append Variables' },
  'Wait': { color: '#6b7280', iconName: 'Clock', label: 'Wait Activities' },
  'Validation': { color: '#3b82f6', iconName: 'CheckCircle', label: 'Validations' },
  'Filter': { color: '#3b82f6', iconName: 'Filter', label: 'Filter Activities' },
  'WebHook': { color: '#06b6d4', iconName: 'Webhook', label: 'WebHooks' },
  'ExecuteDataFlow': { color: '#f97316', iconName: 'Workflow', label: 'Data Flows' },
  'DatabricksNotebook': { color: '#f97316', iconName: 'FileCode', label: 'Databricks Notebooks' },
  'DatabricksSparkJar': { color: '#f97316', iconName: 'Package', label: 'Databricks Spark JAR' },
  'DatabricksSparkPython': { color: '#f97316', iconName: 'Code', label: 'Databricks Spark Python' },
  'HDInsightSpark': { color: '#f97316', iconName: 'Flame', label: 'HDInsight Spark' },
  'HDInsightHive': { color: '#f97316', iconName: 'Database', label: 'HDInsight Hive' },
  'SynapseNotebook': { color: '#f97316', iconName: 'FileCode', label: 'Synapse Notebooks' },
  'SynapseSparkJob': { color: '#f97316', iconName: 'Zap', label: 'Synapse Spark Jobs' },
  'Script': { color: '#8b5cf6', iconName: 'FileText', label: 'Script Activities' },
  'Other': { color: '#6b7280', iconName: 'Box', label: 'Other Activities' }
};

/**
 * Unified Activity Mapping Service
 * Handles all activity types with a consistent interface
 */
export class UnifiedActivityMappingService {
  /**
   * Get activity type enum from ADF activity
   */
  getActivityType(activity: any): ActivityTypeEnum {
    const type = activity.type as string;
    
    // Direct mappings
    const typeMap: Record<string, ActivityTypeEnum> = {
      'Copy': 'Copy',
      'Custom': 'Custom',
      'Lookup': 'Lookup',
      'ExecutePipeline': 'ExecutePipeline',
      'WebActivity': 'Web',
      'AzureFunctionActivity': 'AzureFunctionActivity',
      'ForEach': 'ForEach',
      'IfCondition': 'IfCondition',
      'Switch': 'Switch',
      'Until': 'Until',
      'SqlServerStoredProcedure': 'SqlServerStoredProcedure',
      'AzureDataExplorerCommand': 'AzureDataExplorerCommand',
      'GetMetadata': 'GetMetadata',
      'Delete': 'Delete',
      'SetVariable': 'SetVariable',
      'AppendVariable': 'AppendVariable',
      'Wait': 'Wait',
      'Validation': 'Validation',
      'Filter': 'Filter',
      'WebHook': 'WebHook',
      'ExecuteDataFlow': 'ExecuteDataFlow',
      'DatabricksNotebook': 'DatabricksNotebook',
      'DatabricksSparkJar': 'DatabricksSparkJar',
      'DatabricksSparkPython': 'DatabricksSparkPython',
      'HDInsightSpark': 'HDInsightSpark',
      'HDInsightHive': 'HDInsightHive',
      'SynapseNotebook': 'SynapseNotebook',
      'SynapseSparkJob': 'SynapseSparkJob',
      'Script': 'Script'
    };

    return typeMap[type] || 'Other';
  }

  /**
   * Get color configuration for activity type
   */
  getActivityTypeConfig(type: ActivityTypeEnum): { color: string; iconName: string; label: string } {
    return ACTIVITY_TYPE_COLORS[type];
  }

  /**
   * Recursively extract all activities from a pipeline (including nested)
   * Handles ForEach, IfCondition, Switch, Until container activities
   */
  extractAllActivities(pipeline: ADFComponent): any[] {
    const topLevelActivities = pipeline.definition?.properties?.activities || [];
    const allActivities: any[] = [];

    const traverse = (activityList: any[], nestingPath: string[] = []) => {
      activityList.forEach((activity: any) => {
        // Add nesting path to activity
        const activityWithPath = {
          ...activity,
          _nestingPath: nestingPath.length > 0 ? nestingPath.join(' > ') : undefined,
          _isNested: nestingPath.length > 0
        };
        allActivities.push(activityWithPath);

        // Check for nested activities in container types
        if (activity.type === 'ForEach' && activity.typeProperties?.activities) {
          traverse(activity.typeProperties.activities, [...nestingPath, activity.name]);
        } else if (activity.type === 'IfCondition') {
          if (activity.typeProperties?.ifTrueActivities) {
            traverse(activity.typeProperties.ifTrueActivities, [...nestingPath, activity.name, 'True']);
          }
          if (activity.typeProperties?.ifFalseActivities) {
            traverse(activity.typeProperties.ifFalseActivities, [...nestingPath, activity.name, 'False']);
          }
        } else if (activity.type === 'Switch') {
          const cases = activity.typeProperties?.cases || [];
          cases.forEach((caseItem: any, index: number) => {
            if (caseItem.activities) {
              traverse(caseItem.activities, [...nestingPath, activity.name, `Case ${index + 1}`]);
            }
          });
          if (activity.typeProperties?.defaultActivities) {
            traverse(activity.typeProperties.defaultActivities, [...nestingPath, activity.name, 'Default']);
          }
        } else if (activity.type === 'Until' && activity.typeProperties?.activities) {
          traverse(activity.typeProperties.activities, [...nestingPath, activity.name]);
        }
      });
    };

    traverse(topLevelActivities);
    return allActivities;
  }

  /**
   * Extract all LinkedService references from an activity
   */
  extractActivityReferences(
    pipelineName: string,
    activity: any,
    datasets: ADFComponent[],
    existingMappings?: Record<string, string>
  ): ActivityReference[] {
    const references: ActivityReference[] = [];
    const activityType = this.getActivityType(activity);

    // Handle Custom activities with 3 reference locations
    if (activityType === 'Custom') {
      // 1. Activity-level LinkedService
      if (activity.linkedServiceName?.referenceName) {
        const linkedServiceName = activity.linkedServiceName.referenceName;
        const referenceId = `${pipelineName}_${activity.name}_activity`;
        references.push({
          referenceId,
          location: 'activity-level',
          linkedServiceName,
          displayName: 'Activity-level LinkedService',
          isRequired: true,
          isCustomActivity: true,
          // Try referenceId first, then fallback to linkedServiceName for backwards compatibility
          selectedConnectionId: existingMappings?.[referenceId] || existingMappings?.[linkedServiceName]
        });
      }

      // 2. Resource LinkedService
      if (activity.typeProperties?.resourceLinkedService?.referenceName) {
        const linkedServiceName = activity.typeProperties.resourceLinkedService.referenceName;
        const referenceId = `${pipelineName}_${activity.name}_resource`;
        references.push({
          referenceId,
          location: 'resource',
          linkedServiceName,
          displayName: 'Resource LinkedService',
          isRequired: false,
          isCustomActivity: true,
          // Try referenceId first, then fallback to linkedServiceName for backwards compatibility
          selectedConnectionId: existingMappings?.[referenceId] || existingMappings?.[linkedServiceName]
        });
      }

      // 3. Reference Objects LinkedServices
      const referenceLinkedServices = activity.typeProperties?.referenceObjects?.linkedServices || [];
      referenceLinkedServices.forEach((ls: any, index: number) => {
        if (ls.referenceName) {
          const referenceId = `${pipelineName}_${activity.name}_refobj_${index}`;
          references.push({
            referenceId,
            location: 'reference-object',
            linkedServiceName: ls.referenceName,
            displayName: `Reference Object ${index + 1}`,
            isRequired: false,
            isCustomActivity: true,
            arrayIndex: index,
            // Try referenceId first, then fallback to linkedServiceName for backwards compatibility
            selectedConnectionId: existingMappings?.[referenceId] || existingMappings?.[ls.referenceName]
          });
        }
      });

      return references;
    }

    // Handle Copy activities (source and sink datasets)
    if (activityType === 'Copy') {
      // Source dataset
      const sourceDatasetRef = activity.inputs?.[0]?.referenceName;
      if (sourceDatasetRef) {
        const sourceDataset = datasets.find(d => d.name === sourceDatasetRef);
        const sourceLinkedService = sourceDataset?.definition?.properties?.linkedServiceName?.referenceName;
        
        if (sourceLinkedService) {
          const referenceId = `${pipelineName}_${activity.name}_source`;
          references.push({
            referenceId,
            location: 'dataset',
            linkedServiceName: sourceLinkedService,
            displayName: 'Source',
            isRequired: true,
            datasetName: sourceDatasetRef,
            datasetType: sourceDataset?.definition?.properties?.type,
            // Try referenceId first, then fallback to linkedServiceName for backwards compatibility
            selectedConnectionId: existingMappings?.[referenceId] || existingMappings?.[sourceLinkedService]
          });
        }
      }

      // Sink dataset
      const sinkDatasetRef = activity.outputs?.[0]?.referenceName;
      if (sinkDatasetRef) {
        const sinkDataset = datasets.find(d => d.name === sinkDatasetRef);
        const sinkLinkedService = sinkDataset?.definition?.properties?.linkedServiceName?.referenceName;
        
        if (sinkLinkedService) {
          const referenceId = `${pipelineName}_${activity.name}_sink`;
          references.push({
            referenceId,
            location: 'dataset',
            linkedServiceName: sinkLinkedService,
            displayName: 'Sink',
            isRequired: true,
            datasetName: sinkDatasetRef,
            datasetType: sinkDataset?.definition?.properties?.type,
            // Try referenceId first, then fallback to linkedServiceName for backwards compatibility
            selectedConnectionId: existingMappings?.[referenceId] || existingMappings?.[sinkLinkedService]
          });
        }
      }

      return references;
    }

    // Handle Lookup activities (single dataset)
    if (activityType === 'Lookup') {
      const datasetRef = activity.typeProperties?.dataset?.referenceName;
      if (datasetRef) {
        const dataset = datasets.find(d => d.name === datasetRef);
        const linkedService = dataset?.definition?.properties?.linkedServiceName?.referenceName;
        
        if (linkedService) {
          const referenceId = `${pipelineName}_${activity.name}_dataset`;
          references.push({
            referenceId,
            location: 'dataset',
            linkedServiceName: linkedService,
            displayName: 'Dataset',
            isRequired: true,
            datasetName: datasetRef,
            datasetType: dataset?.definition?.properties?.type,
            // Try referenceId first, then fallback to linkedServiceName for backwards compatibility
            selectedConnectionId: existingMappings?.[referenceId] || existingMappings?.[linkedService]
          });
        }
      }

      return references;
    }

    // Handle GetMetadata activities (single dataset)
    if (activityType === 'GetMetadata') {
      const datasetRef = activity.typeProperties?.dataset?.referenceName;
      if (datasetRef) {
        const dataset = datasets.find(d => d.name === datasetRef);
        const linkedService = dataset?.definition?.properties?.linkedServiceName?.referenceName;
        
        if (linkedService) {
          const referenceId = `${pipelineName}_${activity.name}_dataset`;
          references.push({
            referenceId,
            location: 'dataset',
            linkedServiceName: linkedService,
            displayName: 'Dataset',
            isRequired: true,
            datasetName: datasetRef,
            datasetType: dataset?.definition?.properties?.type,
            // Try referenceId first, then fallback to linkedServiceName for backwards compatibility
            selectedConnectionId: existingMappings?.[referenceId] || existingMappings?.[linkedService]
          });
        }
      }

      return references;
    }

    // Handle Delete activities (single dataset)
    if (activityType === 'Delete') {
      const datasetRef = activity.typeProperties?.dataset?.referenceName;
      if (datasetRef) {
        const dataset = datasets.find(d => d.name === datasetRef);
        const linkedService = dataset?.definition?.properties?.linkedServiceName?.referenceName;
        
        if (linkedService) {
          const referenceId = `${pipelineName}_${activity.name}_dataset`;
          references.push({
            referenceId,
            location: 'dataset',
            linkedServiceName: linkedService,
            displayName: 'Dataset',
            isRequired: true,
            datasetName: datasetRef,
            datasetType: dataset?.definition?.properties?.type,
            // Try referenceId first, then fallback to linkedServiceName for backwards compatibility
            selectedConnectionId: existingMappings?.[referenceId] || existingMappings?.[linkedService]
          });
        }
      }

      return references;
    }

    // Handle Stored Procedure activities (activity-level linkedService)
    if (activityType === 'SqlServerStoredProcedure') {
      if (activity.linkedServiceName?.referenceName) {
        const linkedServiceName = activity.linkedServiceName.referenceName;
        const referenceId = `${pipelineName}_${activity.name}_activity`;
        references.push({
          referenceId,
          location: 'stored-procedure',
          linkedServiceName,
          displayName: 'Database Connection',
          isRequired: true,
          // Try referenceId first, then fallback to linkedServiceName for backwards compatibility
          selectedConnectionId: existingMappings?.[referenceId] || existingMappings?.[linkedServiceName]
        });
      }

      return references;
    }

    // Handle Web activities (activity-level linkedService, optional)
    if (activityType === 'Web' || activityType === 'WebHook') {
      if (activity.linkedServiceName?.referenceName) {
        const linkedServiceName = activity.linkedServiceName.referenceName;
        const referenceId = `${pipelineName}_${activity.name}_activity`;
        references.push({
          referenceId,
          location: 'activity-level',
          linkedServiceName,
          displayName: 'Web Service',
          isRequired: false, // Web activities can use URL without linkedService
          // Try referenceId first, then fallback to linkedServiceName for backwards compatibility
          selectedConnectionId: existingMappings?.[referenceId] || existingMappings?.[linkedServiceName]
        });
      }

      return references;
    }

    // Handle other activities with activity-level linkedService
    if (activity.linkedServiceName?.referenceName) {
      const linkedServiceName = activity.linkedServiceName.referenceName;
      const referenceId = `${pipelineName}_${activity.name}_activity`;
      references.push({
        referenceId,
        location: 'activity-level',
        linkedServiceName,
        displayName: 'LinkedService',
        isRequired: true,
        // Try referenceId first, then fallback to linkedServiceName for backwards compatibility
        selectedConnectionId: existingMappings?.[referenceId] || existingMappings?.[linkedServiceName]
      });
    }

    return references;
  }

  /**
   * Extract all activities with their references from a pipeline
   */
  extractActivitiesWithReferences(
    pipeline: ADFComponent,
    datasets: ADFComponent[],
    existingMappings?: Record<string, Record<string, string>>
  ): ActivityWithReferences[] {
    const allActivities = this.extractAllActivities(pipeline);
    const pipelineName = pipeline.name;
    const pipelineMappings = existingMappings?.[pipelineName] || {};

    return allActivities.map(activity => {
      const activityType = this.getActivityType(activity);
      const references = this.extractActivityReferences(
        pipelineName,
        activity,
        datasets,
        pipelineMappings
      );

      const mappedReferences = references.filter(r => r.selectedConnectionId).length;
      const requiredReferences = references.filter(r => r.isRequired);
      const isFullyMapped = requiredReferences.every(r => r.selectedConnectionId);

      return {
        activityId: `${pipelineName}_${activity.name}`,
        activityName: activity.name,
        activityType,
        originalActivityType: activity.type,
        pipelineName,
        references,
        totalReferences: references.length,
        mappedReferences,
        isFullyMapped,
        isNested: activity._isNested || false,
        nestingPath: activity._nestingPath,
        description: activity.description
      };
    })
    // Filter out activities with no references - they don't need mapping
    .filter(activity => activity.totalReferences > 0);
  }

  /**
   * Group activities by type for UI organization
   */
  groupActivitiesByType(activities: ActivityWithReferences[]): ActivityGroup[] {
    // Group by activity type
    const groupedMap = new Map<ActivityTypeEnum, ActivityWithReferences[]>();
    
    activities.forEach(activity => {
      const existing = groupedMap.get(activity.activityType) || [];
      existing.push(activity);
      groupedMap.set(activity.activityType, existing);
    });

    // Convert to ActivityGroup array
    const groups: ActivityGroup[] = [];
    groupedMap.forEach((groupActivities, type) => {
      const config = this.getActivityTypeConfig(type);
      const totalReferences = groupActivities.reduce((sum, a) => sum + a.totalReferences, 0);
      const mappedReferences = groupActivities.reduce((sum, a) => sum + a.mappedReferences, 0);
      const mappingPercentage = totalReferences > 0 ? (mappedReferences / totalReferences) * 100 : 100;

      groups.push({
        type,
        label: config.label,
        color: config.color,
        iconName: config.iconName,
        activities: groupActivities,
        totalReferences,
        mappedReferences,
        mappingPercentage,
        isExpanded: false // Default collapsed
      });
    });

    // Sort groups by activity count (descending)
    groups.sort((a, b) => b.activities.length - a.activities.length);

    // Filter out empty groups (double safety)
    return groups.filter(g => g.activities.length > 0 && g.totalReferences > 0);
  }

  /**
   * Create pipeline mapping summary
   */
  createPipelineSummary(
    pipeline: ADFComponent,
    datasets: ADFComponent[],
    existingMappings?: Record<string, Record<string, string>>
  ): PipelineMappingSummary {
    const activities = this.extractActivitiesWithReferences(pipeline, datasets, existingMappings);
    const activityGroups = this.groupActivitiesByType(activities);

    const totalReferences = activities.reduce((sum, a) => sum + a.totalReferences, 0);
    const mappedReferences = activities.reduce((sum, a) => sum + a.mappedReferences, 0);
    const mappingPercentage = totalReferences > 0 ? (mappedReferences / totalReferences) * 100 : 100;

    const requiredActivities = activities.filter(a => a.references.some(r => r.isRequired));
    const isFullyMapped = requiredActivities.every(a => a.isFullyMapped);

    const validationErrors: string[] = [];
    activities.forEach(activity => {
      if (!activity.isFullyMapped && activity.references.some(r => r.isRequired)) {
        validationErrors.push(
          `Activity "${activity.activityName}" has unmapped required references`
        );
      }
    });

    return {
      pipelineName: pipeline.name,
      folderPath: pipeline.folder?.path,
      totalActivities: activities.length,
      totalReferences,
      mappedReferences,
      mappingPercentage,
      activityGroups,
      isFullyMapped,
      validationErrors
    };
  }

  /**
   * Update a specific reference mapping
   */
  updateReferenceMapping(
    activity: ActivityWithReferences,
    referenceId: string,
    connectionId: string
  ): ActivityWithReferences {
    const updatedReferences = activity.references.map(ref => 
      ref.referenceId === referenceId
        ? { ...ref, selectedConnectionId: connectionId }
        : ref
    );

    const mappedReferences = updatedReferences.filter(r => r.selectedConnectionId).length;
    const requiredReferences = updatedReferences.filter(r => r.isRequired);
    const isFullyMapped = requiredReferences.every(r => r.selectedConnectionId);

    return {
      ...activity,
      references: updatedReferences,
      mappedReferences,
      isFullyMapped
    };
  }

  /**
   * Validate all mappings
   */
  validateMappings(activities: ActivityWithReferences[]): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    activities.forEach(activity => {
      const requiredRefs = activity.references.filter(r => r.isRequired);
      const unmappedRequired = requiredRefs.filter(r => !r.selectedConnectionId);

      if (unmappedRequired.length > 0) {
        errors.push(
          `${activity.activityName}: ${unmappedRequired.length} required reference(s) not mapped`
        );
      }

      const optionalRefs = activity.references.filter(r => !r.isRequired);
      const unmappedOptional = optionalRefs.filter(r => !r.selectedConnectionId);

      if (unmappedOptional.length > 0) {
        warnings.push(
          `${activity.activityName}: ${unmappedOptional.length} optional reference(s) not mapped`
        );
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// Export singleton instance
export const unifiedActivityMappingService = new UnifiedActivityMappingService();
