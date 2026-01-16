import { adfParserService } from '../services/adfParserService';

export interface WildcardValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  activityName: string;
  hasWildcardInSource: boolean;
  hasWildcardInSink: boolean;
  sourceFileSystemPresent: boolean;
  sinkFileSystemPresent: boolean;
}

export class WildcardCopyActivityValidator {
  static validateTransformedCopyActivity(
    transformedActivity: any,
    originalActivity: any
  ): WildcardValidationResult {
    const result: WildcardValidationResult = {
      success: true,
      errors: [],
      warnings: [],
      activityName: transformedActivity.name || 'unknown',
      hasWildcardInSource: false,
      hasWildcardInSink: false,
      sourceFileSystemPresent: false,
      sinkFileSystemPresent: false
    };

    if (!transformedActivity || transformedActivity.type !== 'Copy') {
      result.errors.push('Activity is not a Copy activity or is undefined');
      result.success = false;
      return result;
    }

    const originalSource = originalActivity?.typeProperties?.source;
    const originalSink = originalActivity?.typeProperties?.sink;

    if (originalSource?.storeSettings) {
      result.hasWildcardInSource = Boolean(
        originalSource.storeSettings.wildcardFolderPath ||
        originalSource.storeSettings.wildcardFileName
      );
    }

    if (originalSink?.storeSettings) {
      result.hasWildcardInSink = Boolean(
        originalSink.storeSettings.wildcardFolderPath ||
        originalSink.storeSettings.wildcardFileName
      );
    }

    const sourceDatasetSettings = transformedActivity.typeProperties?.source?.datasetSettings;
    if (!sourceDatasetSettings) {
      result.errors.push('Source datasetSettings is missing');
      result.success = false;
    } else {
      const sourceLocation = sourceDatasetSettings.typeProperties?.location;
      if (sourceLocation) {
        result.sourceFileSystemPresent = Boolean(
          sourceLocation.fileSystem || sourceLocation.container
        );

        if (result.hasWildcardInSource && !result.sourceFileSystemPresent) {
          result.errors.push(
            'Source has wildcard paths but fileSystem/container is missing in datasetSettings.typeProperties.location'
          );
          result.success = false;
        }
      } else if (result.hasWildcardInSource) {
        result.warnings.push(
          'Source has wildcard paths but location object is missing (may be SQL dataset)'
        );
      }
    }

    const sinkDatasetSettings = transformedActivity.typeProperties?.sink?.datasetSettings;
    if (!sinkDatasetSettings) {
      result.errors.push('Sink datasetSettings is missing');
      result.success = false;
    } else {
      const sinkLocation = sinkDatasetSettings.typeProperties?.location;
      if (sinkLocation) {
        result.sinkFileSystemPresent = Boolean(
          sinkLocation.fileSystem || sinkLocation.container
        );

        if (result.hasWildcardInSink && !result.sinkFileSystemPresent) {
          result.errors.push(
            'Sink has wildcard paths but fileSystem/container is missing in datasetSettings.typeProperties.location'
          );
          result.success = false;
        }
      } else if (result.hasWildcardInSink) {
        result.warnings.push(
          'Sink has wildcard paths but location object is missing (may be SQL dataset)'
        );
      }
    }

    if (transformedActivity.inputs) {
      result.errors.push('Transformed Copy activity still has inputs array');
      result.success = false;
    }

    if (transformedActivity.outputs) {
      result.errors.push('Transformed Copy activity still has outputs array');
      result.success = false;
    }

    return result;
  }

  static validatePipeline(
    transformedPipeline: any,
    originalPipeline: any
  ): WildcardValidationResult[] {
    const results: WildcardValidationResult[] = [];

    const transformedActivities = transformedPipeline.properties?.activities || [];
    const originalActivities = originalPipeline.properties?.activities || [];

    const validateActivitiesRecursive = (
      transformedList: any[],
      originalList: any[]
    ): void => {
      for (let i = 0; i < transformedList.length; i++) {
        const transformed = transformedList[i];
        const original = originalList[i];

        if (transformed.type === 'Copy' && original?.type === 'Copy') {
          const result = this.validateTransformedCopyActivity(transformed, original);
          results.push(result);
        }

        const transformedTypeProps = transformed.typeProperties;
        const originalTypeProps = original?.typeProperties;

        if (transformedTypeProps && originalTypeProps) {
          if (transformed.type === 'ForEach' && transformedTypeProps.activities) {
            validateActivitiesRecursive(
              transformedTypeProps.activities,
              originalTypeProps.activities || []
            );
          }

          if (transformed.type === 'IfCondition') {
            if (transformedTypeProps.ifTrueActivities) {
              validateActivitiesRecursive(
                transformedTypeProps.ifTrueActivities,
                originalTypeProps.ifTrueActivities || []
              );
            }
            if (transformedTypeProps.ifFalseActivities) {
              validateActivitiesRecursive(
                transformedTypeProps.ifFalseActivities,
                originalTypeProps.ifFalseActivities || []
              );
            }
          }

          if (transformed.type === 'Switch' && transformedTypeProps.cases) {
            transformedTypeProps.cases.forEach((transformedCase: any, idx: number) => {
              const originalCase = originalTypeProps.cases?.[idx];
              if (transformedCase.activities && originalCase?.activities) {
                validateActivitiesRecursive(
                  transformedCase.activities,
                  originalCase.activities
                );
              }
            });
            if (transformedTypeProps.defaultActivities && originalTypeProps.defaultActivities) {
              validateActivitiesRecursive(
                transformedTypeProps.defaultActivities,
                originalTypeProps.defaultActivities
              );
            }
          }

          if (transformed.type === 'Until' && transformedTypeProps.activities) {
            validateActivitiesRecursive(
              transformedTypeProps.activities,
              originalTypeProps.activities || []
            );
          }
        }
      }
    };

    validateActivitiesRecursive(transformedActivities, originalActivities);

    return results;
  }

  static generateReport(results: WildcardValidationResult[]): string {
    const lines: string[] = [];
    
    lines.push('='.repeat(80));
    lines.push('WILDCARD COPY ACTIVITY VALIDATION REPORT');
    lines.push('='.repeat(80));
    lines.push('');

    const totalActivities = results.length;
    const successCount = results.filter(r => r.success).length;
    const failureCount = totalActivities - successCount;

    lines.push(`Total Copy Activities: ${totalActivities}`);
    lines.push(`✅ Passed: ${successCount}`);
    lines.push(`❌ Failed: ${failureCount}`);
    lines.push('');

    if (failureCount > 0) {
      lines.push('FAILURES:');
      lines.push('-'.repeat(80));
      results.filter(r => !r.success).forEach(result => {
        lines.push(`\n❌ Activity: ${result.activityName}`);
        lines.push(`   Wildcard in Source: ${result.hasWildcardInSource}`);
        lines.push(`   Wildcard in Sink: ${result.hasWildcardInSink}`);
        lines.push(`   Source FileSystem Present: ${result.sourceFileSystemPresent}`);
        lines.push(`   Sink FileSystem Present: ${result.sinkFileSystemPresent}`);
        
        if (result.errors.length > 0) {
          lines.push('   Errors:');
          result.errors.forEach(err => lines.push(`     - ${err}`));
        }
        
        if (result.warnings.length > 0) {
          lines.push('   Warnings:');
          result.warnings.forEach(warn => lines.push(`     - ${warn}`));
        }
      });
      lines.push('');
    }

    const wildcardActivities = results.filter(
      r => r.hasWildcardInSource || r.hasWildcardInSink
    );
    
    if (wildcardActivities.length > 0) {
      lines.push('WILDCARD ACTIVITIES:');
      lines.push('-'.repeat(80));
      wildcardActivities.forEach(result => {
        const status = result.success ? '✅' : '❌';
        lines.push(`${status} ${result.activityName}`);
        lines.push(`   Source: wildcard=${result.hasWildcardInSource}, fileSystem=${result.sourceFileSystemPresent}`);
        lines.push(`   Sink: wildcard=${result.hasWildcardInSink}, fileSystem=${result.sinkFileSystemPresent}`);
      });
      lines.push('');
    }

    lines.push('='.repeat(80));
    
    return lines.join('\n');
  }
}

export function runWildcardValidation(): { success: boolean; errors: string[] } {
  const errors: string[] = [];
  
  console.log('🔧 Running Wildcard Copy Activity Validation...\n');
  
  try {
    if (typeof WildcardCopyActivityValidator.validateTransformedCopyActivity !== 'function') {
      errors.push('validateTransformedCopyActivity method not found');
    }
    
    if (typeof WildcardCopyActivityValidator.validatePipeline !== 'function') {
      errors.push('validatePipeline method not found');
    }
    
    if (typeof WildcardCopyActivityValidator.generateReport !== 'function') {
      errors.push('generateReport method not found');
    }
    
    if (errors.length === 0) {
      console.log('✅ Wildcard validation module loaded successfully');
      return { success: true, errors: [] };
    } else {
      console.error('❌ Wildcard validation module has errors:', errors);
      return { success: false, errors };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`Validation error: ${errorMsg}`);
    console.error('❌ Validation failed:', errorMsg);
    return { success: false, errors };
  }
}
