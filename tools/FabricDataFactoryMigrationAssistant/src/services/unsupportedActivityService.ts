import { adfParserService } from './adfParserService';

/**
 * Expandable list of activity types that cannot be migrated to Microsoft Fabric.
 * Activities with these types will be preserved as-is with state: "Inactive"
 * and onInactiveMarkAs: "Failed" to allow deployment without execution.
 *
 * To add new unsupported activity types, append to this array.
 */
export const UNSUPPORTED_ACTIVITY_TYPES: readonly string[] = [
  'SparkJob',
  'SynapseNotebook',
  'SqlPoolStoredProcedure',
  'ExecuteDataFlow',
] as const;

/**
 * Expandable list of dataset types that cannot be migrated to Microsoft Fabric.
 * Any activity referencing a dataset of these types will be preserved as-is
 * with state: "Inactive" and onInactiveMarkAs: "Failed".
 *
 * To add new unsupported dataset types, append to this array.
 */
export const UNSUPPORTED_DATASET_TYPES: readonly string[] = [
  'SqlPoolTable',
] as const;

/**
 * Result of an unsupported activity check
 */
export interface UnsupportedActivityCheckResult {
  isUnsupported: boolean;
  reason?: 'unsupportedActivityType' | 'unsupportedDatasetType';
  details?: string;
}

export class UnsupportedActivityService {
  /**
   * Checks whether an activity is unsupported due to its type or a dataset reference.
   *
   * Check order (fast path first):
   * 1. Activity type is in UNSUPPORTED_ACTIVITY_TYPES
   * 2. Any dataset reference resolves to a type in UNSUPPORTED_DATASET_TYPES
   *
   * @param activity The raw activity object from the ARM template or parsed definition
   * @returns UnsupportedActivityCheckResult indicating if and why the activity is unsupported
   */
  checkActivity(activity: any): UnsupportedActivityCheckResult {
    if (!activity || typeof activity !== 'object') {
      return { isUnsupported: false };
    }

    // Fast path: check activity type first before any dataset resolution
    if (this.isUnsupportedActivityType(activity.type)) {
      return {
        isUnsupported: true,
        reason: 'unsupportedActivityType',
        details: `Activity type "${activity.type}" is not supported in Microsoft Fabric`,
      };
    }

    // Slower path: resolve all dataset references and check their types
    const unsupportedDatasetResult = this.checkForUnsupportedDatasetReferences(activity);
    if (unsupportedDatasetResult.isUnsupported) {
      return unsupportedDatasetResult;
    }

    return { isUnsupported: false };
  }

  /**
   * Takes the original activity definition and returns a new object with
   * state: "Inactive" and onInactiveMarkAs: "Failed" added.
   * NO other transformations are applied — original activity is spread first,
   * then the two inactive properties are added (overriding any existing values).
   *
   * @param activity The raw activity object from the ARM template
   * @returns New activity object with inactive markers added, original properties preserved
   * @deprecated Use markAsFail() instead — Fabric validates typeProperties even on Inactive activities
   */
  markAsInactive(activity: any): any {
    return {
      ...activity,
      state: 'Inactive',
      onInactiveMarkAs: 'Failed',
    };
  }

  /**
   * Converts an unsupported Synapse activity to a Fabric-native "Fail" activity.
   *
   * Fabric validates typeProperties for every activity type — including Inactive ones.
   * Synapse-specific activities carry resource references (sqlPool, sparkPool, dataflow, etc.)
   * that Fabric rejects because the referenced Synapse resources do not exist in Fabric.
   * Converting to a Fail activity avoids all schema/reference validation since Fail
   * activities only require { message, errorCode } with no external references.
   *
   * Output shape:
   * {
   *   name:        <original name>,
   *   type:        "Fail",
   *   dependsOn:   <original dependsOn>,
   *   typeProperties: { message: <original type>, errorCode: "999" }
   * }
   *
   * @param activity The raw Synapse activity object
   * @returns Fabric-compatible Fail activity
   */
  markAsFail(activity: any): any {
    return {
      name: activity.name,
      type: 'Fail',
      dependsOn: activity.dependsOn || [],
      typeProperties: {
        message: activity.type,
        errorCode: '999',
      },
    };
  }

  /**
   * Checks if an activity type string is in the UNSUPPORTED_ACTIVITY_TYPES list.
   * Case-sensitive match (ADF/Synapse activity types are PascalCase).
   *
   * @param activityType The activity type string to check
   * @returns true if the type is unsupported
   */
  private isUnsupportedActivityType(activityType: string | undefined): boolean {
    if (!activityType || typeof activityType !== 'string') return false;
    return (UNSUPPORTED_ACTIVITY_TYPES as readonly string[]).includes(activityType);
  }

  /**
   * Checks if an activity references a dataset of an unsupported type.
   * Resolves dataset names from all known reference locations against
   * the parsed dataset definitions stored in adfParserService.
   *
   * Reference locations checked (exhaustive list):
   * 1. activity.inputs[]                           - Copy, Lookup, GetMetadata, Delete
   * 2. activity.outputs[]                          - Copy
   * 3. activity.typeProperties.source.dataset      - Copy source with inline dataset ref
   * 4. activity.typeProperties.sink.dataset        - Copy sink with inline dataset ref
   * 5. activity.typeProperties.dataset             - Lookup, GetMetadata, Delete
   *
   * @param activity The activity object to check
   * @returns UnsupportedActivityCheckResult
   */
  private checkForUnsupportedDatasetReferences(activity: any): UnsupportedActivityCheckResult {
    const datasetNames = this.collectAllDatasetNames(activity);

    for (const datasetName of datasetNames) {
      if (!datasetName) continue;

      const dataset = adfParserService.getDatasetByName(datasetName);
      if (!dataset) {
        // Dataset not found in parsed components — cannot determine type, skip
        // This is a warning only: a missing dataset would cause issues elsewhere too
        console.warn(
          `[UnsupportedActivityService] Dataset "${datasetName}" referenced by activity "${activity.name}" ` +
          `was not found in parsed components — cannot check for unsupported dataset type`
        );
        continue;
      }

      // Dataset type is stored at definition.properties.type
      // Confirmed from adfParserService parseDataFactoryResource:
      // definition = { properties: { type: dsProperties.type, ... } }
      const datasetType: string | undefined = dataset.definition?.properties?.type;

      if (datasetType && this.isUnsupportedDatasetType(datasetType)) {
        return {
          isUnsupported: true,
          reason: 'unsupportedDatasetType',
          details:
            `Activity "${activity.name}" references dataset "${datasetName}" ` +
            `of unsupported type "${datasetType}"`,
        };
      }
    }

    return { isUnsupported: false };
  }

  /**
   * Collects all dataset reference names from all known locations in an activity.
   * Returns a deduplicated Set converted to an Array of dataset name strings.
   * Only string values are included — nulls and undefineds are excluded.
   *
   * @param activity The activity object to scan
   * @returns Deduplicated array of dataset reference names found in the activity
   */
  private collectAllDatasetNames(activity: any): string[] {
    const names = new Set<string>();

    if (!activity || typeof activity !== 'object') {
      return [];
    }

    // Location 1: activity.inputs[] — standard ADF format for Copy, Lookup, GetMetadata, Delete
    // Format: [{ referenceName: "DatasetName", type: "DatasetReference" }]
    if (Array.isArray(activity.inputs)) {
      for (const input of activity.inputs) {
        const name = this.extractDatasetNameFromRef(input);
        if (name) names.add(name);
      }
    }

    // Location 2: activity.outputs[] — standard ADF format for Copy
    // Format: [{ referenceName: "DatasetName", type: "DatasetReference" }]
    if (Array.isArray(activity.outputs)) {
      for (const output of activity.outputs) {
        const name = this.extractDatasetNameFromRef(output);
        if (name) names.add(name);
      }
    }

    const typeProps = activity.typeProperties;
    if (typeProps && typeof typeProps === 'object') {
      // Location 3: activity.typeProperties.source.dataset.referenceName
      // Format: { source: { dataset: { referenceName: "DatasetName" } } }
      if (
        typeProps.source &&
        typeof typeProps.source === 'object' &&
        typeProps.source.dataset?.referenceName &&
        typeof typeProps.source.dataset.referenceName === 'string'
      ) {
        names.add(typeProps.source.dataset.referenceName);
      }

      // Location 4: activity.typeProperties.sink.dataset.referenceName
      // Format: { sink: { dataset: { referenceName: "DatasetName" } } }
      if (
        typeProps.sink &&
        typeof typeProps.sink === 'object' &&
        typeProps.sink.dataset?.referenceName &&
        typeof typeProps.sink.dataset.referenceName === 'string'
      ) {
        names.add(typeProps.sink.dataset.referenceName);
      }

      // Location 5: activity.typeProperties.dataset.referenceName
      // Format: { dataset: { referenceName: "DatasetName" } } (Lookup, GetMetadata, Delete)
      if (
        typeProps.dataset?.referenceName &&
        typeof typeProps.dataset.referenceName === 'string'
      ) {
        names.add(typeProps.dataset.referenceName);
      }
    }

    return Array.from(names);
  }

  /**
   * Extracts a dataset reference name from an input/output reference object.
   *
   * Handles these formats:
   * 1. { referenceName: "DatasetName", type: "DatasetReference" }  — standard ADF inputs/outputs
   * 2. { dataset: { referenceName: "DatasetName" } }               — nested dataset reference
   *
   * @param ref The reference object from inputs[] or outputs[]
   * @returns The dataset name string, or undefined if not found or not a string
   */
  private extractDatasetNameFromRef(ref: any): string | undefined {
    if (!ref || typeof ref !== 'object') return undefined;

    // Format 1: standard ADF — { referenceName: "...", type: "DatasetReference" }
    if (typeof ref.referenceName === 'string' && ref.referenceName.length > 0) {
      return ref.referenceName;
    }

    // Format 2: nested — { dataset: { referenceName: "..." } }
    if (ref.dataset && typeof ref.dataset.referenceName === 'string' && ref.dataset.referenceName.length > 0) {
      return ref.dataset.referenceName;
    }

    return undefined;
  }

  /**
   * Checks if a dataset type string is in the UNSUPPORTED_DATASET_TYPES list.
   * Case-sensitive match (ADF/Synapse dataset types are PascalCase).
   *
   * @param datasetType The dataset type string to check
   * @returns true if the dataset type is unsupported
   */
  private isUnsupportedDatasetType(datasetType: string): boolean {
    return (UNSUPPORTED_DATASET_TYPES as readonly string[]).includes(datasetType);
  }
}

export const unsupportedActivityService = new UnsupportedActivityService();
