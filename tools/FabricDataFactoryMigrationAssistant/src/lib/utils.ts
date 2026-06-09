import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Builds a standardized referenceId for activity-connection mappings
 * Format: pipelineName_activityName_location (using underscores)
 * 
 * This matches the format used by UnifiedActivityMappingService and ensures
 * consistency across the UI layer (ComponentMappingTableV2).
 * 
 * @param pipelineName - Name of the pipeline containing the activity
 * @param activityName - Name of the activity
 * @param location - Reference location (e.g., 'activity', 'source', 'sink', 'dataset', 'cluster', 'storage')
 * @returns Standardized referenceId string
 * 
 * @example
 * buildReferenceId('Pipeline1', 'CopyData', 'source') 
 * // Returns: 'Pipeline1_CopyData_source'
 */
export function buildReferenceId(
  pipelineName: string,
  activityName: string,
  location: string
): string {
  return `${pipelineName}_${activityName}_${location}`;
}

/**
 * Builds a legacy uniqueId for backward compatibility with deployment layer
 * Format: activityName_linkedServiceName_index (using underscores, no pipeline name)
 * 
 * This format is still used by pipelineConnectionMappings and the deployment
 * transformation services (PipelineConnectionTransformerService).
 * 
 * @param activityName - Name of the activity
 * @param linkedServiceName - Name of the LinkedService being referenced
 * @param index - Index of the reference (for activities with multiple references)
 * @returns Legacy uniqueId string
 * 
 * @example
 * buildLegacyUniqueId('CopyData', 'AzureBlobStorage', 0)
 * // Returns: 'CopyData_AzureBlobStorage_0'
 */
export function buildLegacyUniqueId(
  activityName: string,
  linkedServiceName: string,
  index: number
): string {
  return `${activityName}_${linkedServiceName}_${index}`;
}
