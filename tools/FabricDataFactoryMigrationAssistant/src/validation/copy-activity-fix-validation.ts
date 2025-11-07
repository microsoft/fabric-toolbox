/**
 * Validation script to ensure Copy Activities don't include inputs/outputs arrays
 * in Fabric Pipeline definitions, which was the reported bug.
 */

import { copyActivityTransformer } from '../services/copyActivityTransformer';
import { adfParserService } from '../services/adfParserService';

// Sample ADF Copy Activity that should NOT have inputs/outputs in the Fabric output
const sampleADFCopyActivity = {
  "name": "Copy data1",
  "type": "Copy",
  "dependsOn": [],
  "policy": {
    "timeout": "0.12:00:00",
    "retry": 0,
    "retryIntervalInSeconds": 30,
    "secureOutput": false,
    "secureInput": false
  },
  "userProperties": [],
  "typeProperties": {
    "source": {
      "type": "AzureSqlSource",
      "queryTimeout": "02:00:00",
      "partitionOption": "None"
    },
    "sink": {
      "type": "ParquetSink",
      "storeSettings": {
        "type": "AzureBlobFSWriteSettings"
      },
      "formatSettings": {
        "type": "ParquetWriteSettings"
      }
    },
    "enableStaging": true,
    "stagingSettings": {
      "linkedServiceName": {
        "referenceName": "AzureDataLakeStorage1",
        "type": "LinkedServiceReference"
      },
      "path": "staging"
    },
    "parallelCopies": 13,
    "dataIntegrationUnits": 16,
    "translator": {
      "type": "TabularTranslator",
      "typeConversion": true,
      "typeConversionSettings": {
        "allowDataTruncation": true,
        "treatBooleanAsNumber": false
      }
    }
  },
  "inputs": [
    {
      "referenceName": "AzureSqlTable1",
      "type": "DatasetReference"
    }
  ],
  "outputs": [
    {
      "referenceName": "Parquet1",
      "type": "DatasetReference",
      "parameters": {
        "p_Directory": "migration",
        "p_FileName": "grocery.parquet"
      }
    }
  ]
};

// Sample datasets for testing
const sampleDatasets = [
  {
    "name": "AzureSqlTable1",
    "properties": {
      "linkedServiceName": {
        "referenceName": "AzureSqlDatabase1",
        "type": "LinkedServiceReference"
      },
      "annotations": [],
      "type": "AzureSqlTable",
      "schema": [],
      "typeProperties": {
        "schema": "dbo",
        "table": "grocery"
      }
    }
  },
  {
    "name": "Parquet1",
    "properties": {
      "linkedServiceName": {
        "referenceName": "AzureDataLakeStorage1",
        "type": "LinkedServiceReference"
      },
      "parameters": {
        "p_Directory": {
          "type": "string"
        },
        "p_FileName": {
          "type": "string"
        }
      },
      "annotations": [],
      "type": "Parquet",
      "typeProperties": {
        "location": {
          "type": "AzureBlobFSLocation",
          "fileName": {
            "value": "@dataset().p_FileName",
            "type": "Expression"
          },
          "folderPath": {
            "value": "@dataset().p_Directory", 
            "type": "Expression"
          },
          "fileSystem": "landingzone"
        },
        "compressionCodec": "snappy"
      },
      "schema": []
    }
  }
];

/**
 * Mock the ADF parser service to provide test datasets
 */
function setupTestData() {
  // Mock the getCopyActivityDatasetMappings method
  const originalMethod = adfParserService.getCopyActivityDatasetMappings;
  
  (adfParserService as any).getCopyActivityDatasetMappings = (activity: any) => {
    return {
      sourceDataset: {
        name: 'AzureSqlTable1',
        definition: sampleDatasets[0]
      },
      sinkDataset: {
        name: 'Parquet1',
        definition: sampleDatasets[1]
      },
      sourceParameters: {},
      sinkParameters: {
        p_Directory: 'migration',
        p_FileName: 'grocery.parquet'
      }
    };
  };

  return () => {
    // Restore original method
    (adfParserService as any).getCopyActivityDatasetMappings = originalMethod;
  };
}

/**
 * Run validation tests
 */
export function runCopyActivityValidation(): { success: boolean; errors: string[] } {
  const errors: string[] = [];
  
  console.log('🔧 Running Copy Activity Fix Validation...');
  
  const cleanup = setupTestData();
  
  try {
    // Test 1: Transform the copy activity
    console.log('📋 Test 1: Transforming Copy Activity...');
    const transformedActivity = copyActivityTransformer.transformCopyActivity(sampleADFCopyActivity);
    
    // Test 2: Verify inputs array is NOT present
    console.log('📋 Test 2: Verifying inputs array is removed...');
    if ('inputs' in transformedActivity) {
      errors.push('❌ FAIL: Transformed Copy activity still contains "inputs" array');
    } else {
      console.log('✅ PASS: "inputs" array correctly removed from Copy activity');
    }
    
    // Test 3: Verify outputs array is NOT present
    console.log('📋 Test 3: Verifying outputs array is removed...');
    if ('outputs' in transformedActivity) {
      errors.push('❌ FAIL: Transformed Copy activity still contains "outputs" array');
    } else {
      console.log('✅ PASS: "outputs" array correctly removed from Copy activity');
    }
    
    // Test 4: Verify _originalInputs is NOT present
    console.log('📋 Test 4: Verifying _originalInputs is removed...');
    if ('_originalInputs' in transformedActivity) {
      errors.push('❌ FAIL: Transformed Copy activity still contains "_originalInputs"');
    } else {
      console.log('✅ PASS: "_originalInputs" correctly removed from Copy activity');
    }
    
    // Test 5: Verify _originalOutputs is NOT present
    console.log('📋 Test 5: Verifying _originalOutputs is removed...');
    if ('_originalOutputs' in transformedActivity) {
      errors.push('❌ FAIL: Transformed Copy activity still contains "_originalOutputs"');
    } else {
      console.log('✅ PASS: "_originalOutputs" correctly removed from Copy activity');
    }
    
    // Test 6: Verify typeProperties is still present and properly structured
    console.log('📋 Test 6: Verifying typeProperties is preserved...');
    if (!transformedActivity.typeProperties) {
      errors.push('❌ FAIL: typeProperties is missing from transformed Copy activity');
    } else if (!transformedActivity.typeProperties.source || !transformedActivity.typeProperties.sink) {
      errors.push('❌ FAIL: typeProperties.source or typeProperties.sink is missing');
    } else {
      console.log('✅ PASS: typeProperties correctly preserved with source and sink');
    }
    
    // Test 7: Verify source has datasetSettings
    console.log('📋 Test 7: Verifying source has datasetSettings...');
    if (!transformedActivity.typeProperties?.source?.datasetSettings) {
      errors.push('❌ FAIL: source.datasetSettings is missing');
    } else {
      console.log('✅ PASS: source.datasetSettings correctly included');
    }
    
    // Test 8: Verify sink has datasetSettings
    console.log('📋 Test 8: Verifying sink has datasetSettings...');
    if (!transformedActivity.typeProperties?.sink?.datasetSettings) {
      errors.push('❌ FAIL: sink.datasetSettings is missing');
    } else {
      console.log('✅ PASS: sink.datasetSettings correctly included');
    }
    
    // Test 9: Verify activity retains core properties
    console.log('📋 Test 9: Verifying core activity properties...');
    const requiredProps = ['name', 'type', 'dependsOn', 'policy', 'userProperties'];
    for (const prop of requiredProps) {
      if (!(prop in transformedActivity)) {
        errors.push(`❌ FAIL: Required property "${prop}" is missing`);
      }
    }
    if (errors.length === 0 || !errors.some(e => e.includes('Required property'))) {
      console.log('✅ PASS: All core activity properties preserved');
    }
    
    // Test 10: Display the final structure for verification
    console.log('📋 Test 10: Final structure verification...');
    console.log('📄 Final Transformed Copy Activity Structure:');
    console.log('   - name:', transformedActivity.name);
    console.log('   - type:', transformedActivity.type);
    console.log('   - Has typeProperties:', !!transformedActivity.typeProperties);
    console.log('   - Has source:', !!transformedActivity.typeProperties?.source);
    console.log('   - Has sink:', !!transformedActivity.typeProperties?.sink);
    console.log('   - Has inputs array:', 'inputs' in transformedActivity);
    console.log('   - Has outputs array:', 'outputs' in transformedActivity);
    console.log('   - Has _originalInputs:', '_originalInputs' in transformedActivity);
    console.log('   - Has _originalOutputs:', '_originalOutputs' in transformedActivity);
    
    if (errors.length === 0) {
      console.log('🎉 ALL TESTS PASSED! Copy Activity bug fix is working correctly.');
      console.log('🎯 Fabric Pipeline Copy Activities will no longer include invalid inputs/outputs arrays.');
    } else {
      console.log(`❌ ${errors.length} test(s) failed. See errors above.`);
    }
    
  } catch (error) {
    errors.push(`❌ CRITICAL: Error during transformation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('💥 Critical error during validation:', error);
  } finally {
    cleanup();
  }
  
  return {
    success: errors.length === 0,
    errors
  };
}

// Export for use in other validation scripts
export { sampleADFCopyActivity, sampleDatasets };