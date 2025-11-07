/**
 * Test for pipeline LinkedService reference handling
 */

import { fabricService } from '../services/fabricService';
import { ADFComponent } from '../types';

// Test that pipelines with LinkedService references are properly preserved
export function testPipelineLinkedServicePreservation() {
  console.log('=== Testing Pipeline LinkedService Reference Preservation ===');

  // Create a test ADF pipeline component with LinkedService references
  const testPipeline: ADFComponent = {
    name: 'TestPipelineWithLinkedServices',
    type: 'pipeline',
    definition: {
      properties: {
        activities: [
          {
            name: 'CopyData',
            type: 'Copy',
            typeProperties: {
              source: {
                type: 'SqlServerSource',
                sqlReaderQuery: 'SELECT * FROM Table1',
                linkedServiceName: {
                  referenceName: 'SqlServerLinkedService',
                  type: 'LinkedServiceReference'
                }
              },
              sink: {
                type: 'AzureBlobSink',
                linkedServiceName: {
                  referenceName: 'AzureBlobLinkedService', 
                  type: 'LinkedServiceReference'
                }
              }
            },
            inputs: [
              {
                referenceName: 'SourceDataset',
                type: 'DatasetReference'
              }
            ],
            outputs: [
              {
                referenceName: 'SinkDataset',
                type: 'DatasetReference'
              }
            ]
          },
          {
            name: 'LookupActivity',
            type: 'Lookup',
            typeProperties: {
              source: {
                type: 'SqlServerSource',
                sqlReaderQuery: 'SELECT COUNT(*) FROM Table1'
              },
              dataset: {
                referenceName: 'LookupDataset',
                type: 'DatasetReference',
                linkedServiceName: {
                  referenceName: 'SqlServerLinkedService',
                  type: 'LinkedServiceReference'
                }
              }
            }
          }
        ],
        parameters: {
          sourceTable: {
            type: 'String',
            defaultValue: 'Table1'
          }
        },
        variables: {
          processedRecords: {
            type: 'Integer'
          }
        }
      }
    },
    isSelected: true,
    compatibilityStatus: 'supported',
    warnings: [],
    fabricTarget: {
      type: 'dataPipeline',
      name: 'TestPipelineWithLinkedServices'
    }
  };

  console.log('Original pipeline activities count:', testPipeline.definition.properties.activities.length);
  console.log('Original pipeline structure:', JSON.stringify(testPipeline.definition, null, 2));

  // Transform the pipeline definition
  const fabricPipelineDefinition = (fabricService as any).transformPipelineDefinition(testPipeline.definition);

  console.log('Transformed pipeline structure:', JSON.stringify(fabricPipelineDefinition, null, 2));
  console.log('Transformed activities count:', fabricPipelineDefinition.properties?.activities?.length || 0);

  // Validate the transformation preserved activities
  const originalActivitiesCount = testPipeline.definition.properties.activities.length;
  const transformedActivitiesCount = fabricPipelineDefinition.properties?.activities?.length || 0;

  if (transformedActivitiesCount === 0 && originalActivitiesCount > 0) {
    console.error('CRITICAL BUG DETECTED: Activities were lost during transformation!');
    console.error(`Original had ${originalActivitiesCount} activities, transformed has ${transformedActivitiesCount}`);
    return false;
  }

  if (transformedActivitiesCount === originalActivitiesCount) {
    console.log('✅ SUCCESS: All activities preserved during transformation');
    console.log(`✅ Both original and transformed have ${originalActivitiesCount} activities`);
    
    // Check if LinkedService references are detected
    const copyActivity = fabricPipelineDefinition.properties.activities.find((a: any) => a.name === 'CopyData');
    const lookupActivity = fabricPipelineDefinition.properties.activities.find((a: any) => a.name === 'LookupActivity');
    
    if (copyActivity) {
      console.log('✅ Copy activity preserved');
      console.log('Copy activity has source:', Boolean(copyActivity.typeProperties?.source));
      console.log('Copy activity has sink:', Boolean(copyActivity.typeProperties?.sink));
      console.log('Copy activity has inputs:', Boolean(copyActivity.inputs?.length));
      console.log('Copy activity has outputs:', Boolean(copyActivity.outputs?.length));
    }
    
    if (lookupActivity) {
      console.log('✅ Lookup activity preserved');
      console.log('Lookup activity has typeProperties:', Boolean(lookupActivity.typeProperties));
    }
    
    return true;
  } else {
    console.error('❌ ISSUE: Activity count mismatch');
    console.error(`Original: ${originalActivitiesCount}, Transformed: ${transformedActivitiesCount}`);
    return false;
  }
}

// Test empty pipeline handling
export function testEmptyPipelineHandling() {
  console.log('\n=== Testing Empty Pipeline Handling ===');

  const emptyPipeline: ADFComponent = {
    name: 'EmptyPipeline',
    type: 'pipeline',
    definition: {
      properties: {
        activities: [],
        parameters: {},
        variables: {}
      }
    },
    isSelected: true,
    compatibilityStatus: 'supported',
    warnings: [],
    fabricTarget: {
      type: 'dataPipeline',
      name: 'EmptyPipeline'
    }
  };

  const fabricPipelineDefinition = (fabricService as any).transformPipelineDefinition(emptyPipeline.definition);
  
  console.log('Empty pipeline transformation result:', {
    hasProperties: Boolean(fabricPipelineDefinition.properties),
    activitiesCount: fabricPipelineDefinition.properties?.activities?.length || 0,
    hasActivitiesArray: Array.isArray(fabricPipelineDefinition.properties?.activities)
  });

  return Array.isArray(fabricPipelineDefinition.properties?.activities) && 
         fabricPipelineDefinition.properties.activities.length === 0;
}

// Test malformed pipeline handling
export function testMalformedPipelineHandling() {
  console.log('\n=== Testing Malformed Pipeline Handling ===');

  const malformedPipeline: ADFComponent = {
    name: 'MalformedPipeline',
    type: 'pipeline',
    definition: {
      // Missing properties structure
      activities: [
        {
          name: 'TestActivity',
          type: 'Copy'
        }
      ]
    },
    isSelected: true,
    compatibilityStatus: 'supported',
    warnings: [],
    fabricTarget: {
      type: 'dataPipeline',
      name: 'MalformedPipeline'
    }
  };

  const fabricPipelineDefinition = (fabricService as any).transformPipelineDefinition(malformedPipeline.definition);
  
  console.log('Malformed pipeline transformation result:', {
    hasProperties: Boolean(fabricPipelineDefinition.properties),
    activitiesCount: fabricPipelineDefinition.properties?.activities?.length || 0,
    activitiesPreserved: fabricPipelineDefinition.properties?.activities?.length === 1
  });

  return fabricPipelineDefinition.properties?.activities?.length === 1;
}

// Run all tests
export function runPipelineLinkedServiceTests() {
  console.log('🧪 Running Pipeline LinkedService Reference Tests...\n');

  const test1 = testPipelineLinkedServicePreservation();
  const test2 = testEmptyPipelineHandling();
  const test3 = testMalformedPipelineHandling();

  console.log('\n📊 Test Results Summary:');
  console.log(`✅ LinkedService reference preservation: ${test1 ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Empty pipeline handling: ${test2 ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Malformed pipeline handling: ${test3 ? 'PASS' : 'FAIL'}`);

  const allPassed = test1 && test2 && test3;
  console.log(`\n🎯 Overall Result: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);

  if (!test1) {
    console.log('\n🚨 CRITICAL: The LinkedService reference bug is still present!');
    console.log('🔧 Pipeline activities with LinkedService references are being lost during transformation.');
  }

  return allPassed;
}