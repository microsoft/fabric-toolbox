import { 
  CustomActivityMapping, 
  CustomActivityLinkedServiceReference,
  CustomActivityReferenceLocation 
} from '../types';

/**
 * Service for extracting and managing Custom activity LinkedService mappings
 * Handles the 3 distinct reference locations in Custom activities:
 * 1. linkedServiceName.referenceName (activity-level)
 * 2. typeProperties.resourceLinkedService.referenceName (resource)
 * 3. typeProperties.referenceObjects.linkedServices[] (reference-object array)
 */
export class CustomActivityMappingService {
  /**
   * Extracts all LinkedService references from a Custom activity
   * @param pipelineName Pipeline containing the activity
   * @param activity The Custom activity
   * @param existingMappings Optional existing connection mappings
   * @returns CustomActivityMapping with all references
   */
  extractCustomActivityMapping(
    pipelineName: string,
    activity: any,
    existingMappings?: Record<string, string>
  ): CustomActivityMapping {
    if (!activity || activity.type !== 'Custom') {
      throw new Error(`Activity ${activity?.name} is not a Custom activity`);
    }

    const references: CustomActivityLinkedServiceReference[] = [];

    // 1. Extract activity-level LinkedService (linkedServiceName.referenceName)
    if (activity.linkedServiceName?.referenceName) {
      const linkedServiceName = activity.linkedServiceName.referenceName;
      references.push({
        location: 'activity-level',
        linkedServiceName,
        selectedConnectionId: existingMappings?.[linkedServiceName],
        isRequired: true, // Activity-level is typically required for execution
        referenceId: `${pipelineName}_${activity.name}_activity`
      });
    }

    // 2. Extract resource LinkedService (typeProperties.resourceLinkedService.referenceName)
    if (activity.typeProperties?.resourceLinkedService?.referenceName) {
      const linkedServiceName = activity.typeProperties.resourceLinkedService.referenceName;
      references.push({
        location: 'resource',
        linkedServiceName,
        selectedConnectionId: existingMappings?.[linkedServiceName],
        isRequired: false, // Resource might be optional
        referenceId: `${pipelineName}_${activity.name}_resource`
      });
    }

    // 3. Extract reference objects LinkedServices (typeProperties.referenceObjects.linkedServices[])
    const referenceLinkedServices = activity.typeProperties?.referenceObjects?.linkedServices || [];
    referenceLinkedServices.forEach((ls: any, index: number) => {
      if (ls.referenceName) {
        references.push({
          location: 'reference-object',
          linkedServiceName: ls.referenceName,
          selectedConnectionId: existingMappings?.[ls.referenceName],
          isRequired: false, // Reference objects are typically optional
          arrayIndex: index,
          referenceId: `${pipelineName}_${activity.name}_refobj_${index}`
        });
      }
    });

    const mappedReferences = references.filter(r => r.selectedConnectionId).length;

    return {
      pipelineName,
      activityName: activity.name,
      references,
      totalReferences: references.length,
      mappedReferences,
      isFullyMapped: this.checkIfFullyMapped(references),
      activityId: `${pipelineName}_${activity.name}`
    };
  }

  /**
   * Checks if all required references are mapped
   */
  private checkIfFullyMapped(references: CustomActivityLinkedServiceReference[]): boolean {
    return references
      .filter(r => r.isRequired)
      .every(r => !!r.selectedConnectionId);
  }

  /**
   * Updates a specific reference mapping
   */
  updateReferenceMapping(
    mapping: CustomActivityMapping,
    referenceId: string,
    connectionId: string
  ): CustomActivityMapping {
    const updatedReferences = mapping.references.map(ref =>
      ref.referenceId === referenceId
        ? { ...ref, selectedConnectionId: connectionId }
        : ref
    );

    const mappedReferences = updatedReferences.filter(r => r.selectedConnectionId).length;

    return {
      ...mapping,
      references: updatedReferences,
      mappedReferences,
      isFullyMapped: this.checkIfFullyMapped(updatedReferences)
    };
  }

  /**
   * Gets all unique LinkedService names from references
   */
  getUniqueLinkedServices(mapping: CustomActivityMapping): string[] {
    return [...new Set(mapping.references.map(r => r.linkedServiceName))];
  }

  /**
   * Converts Custom activity mapping to connection mappings format for deployment
   */
  toConnectionMappings(mapping: CustomActivityMapping): Record<string, string> {
    const connectionMappings: Record<string, string> = {};
    
    mapping.references.forEach(ref => {
      if (ref.selectedConnectionId) {
        connectionMappings[ref.linkedServiceName] = ref.selectedConnectionId;
      }
    });

    return connectionMappings;
  }

  /**
   * Validates that all required Custom activity references are mapped
   */
  validateMapping(mapping: CustomActivityMapping): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    mapping.references.forEach(ref => {
      if (ref.isRequired && !ref.selectedConnectionId) {
        const locationLabel = this.getLocationLabel(ref.location, ref.arrayIndex);
        errors.push(
          `${mapping.activityName}: ${locationLabel} LinkedService "${ref.linkedServiceName}" must be mapped`
        );
      } else if (!ref.isRequired && !ref.selectedConnectionId) {
        const locationLabel = this.getLocationLabel(ref.location, ref.arrayIndex);
        warnings.push(
          `${mapping.activityName}: ${locationLabel} LinkedService "${ref.linkedServiceName}" is not mapped (optional)`
        );
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Gets human-readable location label
   */
  private getLocationLabel(location: CustomActivityReferenceLocation, arrayIndex?: number): string {
    switch (location) {
      case 'activity-level':
        return 'Activity-level';
      case 'resource':
        return 'Resource';
      case 'reference-object':
        return arrayIndex !== undefined ? `Reference Object #${arrayIndex + 1}` : 'Reference Object';
      default:
        return 'Unknown';
    }
  }
}

export const customActivityMappingService = new CustomActivityMappingService();
