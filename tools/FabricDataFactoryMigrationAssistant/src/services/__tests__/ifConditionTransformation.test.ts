import { describe, it, expect, beforeEach } from 'vitest';
import { PipelineTransformer } from '../pipelineTransformer';

describe('IfCondition Nested Activity Transformation', () => {
  let pipelineTransformer: PipelineTransformer;

  beforeEach(() => {
    pipelineTransformer = new PipelineTransformer();
  });

  it('should recursively transform nested GetMetadata activities inside IfCondition', () => {
    // Arrange: IfCondition with nested GetMetadata activity
    const pipeline = {
      name: 'TestPipeline',
      properties: {
        activities: [
          {
            name: 'If Condition1',
            type: 'IfCondition',
            typeProperties: {
              expression: {
                value: '@equals(1, 1)',
                type: 'Expression'
              },
              ifTrueActivities: [
                {
                  name: 'Get Metadata1',
                  type: 'GetMetadata',
                  typeProperties: {
                    dataset: {
                      referenceName: 'TestDataset',
                      type: 'DatasetReference',
                      parameters: {
                        p_Container: 'test-container',
                        p_Directory: 'test-dir',
                        p_FileName: 'test.parquet'
                      }
                    },
                    fieldList: ['exists', 'itemName']
                  }
                }
              ],
              ifFalseActivities: []
            }
          }
        ]
      }
    };

    const datasets = [
      {
        name: 'TestDataset',
        properties: {
          type: 'Parquet',
          linkedServiceName: {
            referenceName: 'AzureDataLakeStorage1',
            type: 'LinkedServiceReference'
          },
          parameters: {
            p_Container: { type: 'String' },
            p_Directory: { type: 'String' },
            p_FileName: { type: 'String' }
          },
          typeProperties: {
            location: {
              type: 'AzureBlobFSLocation',
              fileName: { value: '@dataset().p_FileName', type: 'Expression' },
              folderPath: { value: '@dataset().p_Directory', type: 'Expression' },
              fileSystem: { value: '@dataset().p_Container', type: 'Expression' }
            }
          }
        }
      }
    ];

    const connectionMappings = {
      TestDataset: 'connection-123-456'
    };

    const referenceMappings = {
      TestPipeline: {
        'TestPipeline_Get Metadata1_dataset': 'connection-123-456'
      }
    };

    // Act
    const result = pipelineTransformer.transformPipelineDefinition(
      pipeline,
      datasets,
      [],
      connectionMappings,
      referenceMappings
    );

    // Assert
    const ifCondition = result.properties.activities[0];
    expect(ifCondition.type).toBe('IfCondition');
    expect(ifCondition.typeProperties.ifTrueActivities).toHaveLength(1);

    const nestedGetMetadata = ifCondition.typeProperties.ifTrueActivities[0];
    
    // Verify transformation occurred
    expect(nestedGetMetadata.type).toBe('GetMetadata');
    expect(nestedGetMetadata.typeProperties.dataset).toBeUndefined();
    expect(nestedGetMetadata.typeProperties.datasetSettings).toBeDefined();
    expect(nestedGetMetadata.typeProperties.datasetSettings.type).toBe('Parquet');
    expect(nestedGetMetadata.externalReferences).toBeDefined();
    expect(nestedGetMetadata.externalReferences.connection).toBe('connection-123-456');
  });

  it('should recursively transform nested Lookup activities inside IfCondition', () => {
    // Arrange
    const pipeline = {
      name: 'TestPipeline',
      properties: {
        activities: [
          {
            name: 'If Condition1',
            type: 'IfCondition',
            typeProperties: {
              expression: {
                value: '@equals(1, 1)',
                type: 'Expression'
              },
              ifTrueActivities: [
                {
                  name: 'Lookup1',
                  type: 'Lookup',
                  typeProperties: {
                    dataset: {
                      referenceName: 'SqlDataset',
                      type: 'DatasetReference'
                    },
                    source: {
                      type: 'SqlSource',
                      sqlReaderQuery: 'SELECT * FROM Table1'
                    }
                  }
                }
              ],
              ifFalseActivities: []
            }
          }
        ]
      }
    };

    const datasets = [
      {
        name: 'SqlDataset',
        properties: {
          type: 'AzureSqlTable',
          linkedServiceName: {
            referenceName: 'AzureSqlDatabase1',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            schema: 'dbo',
            table: 'Table1'
          }
        }
      }
    ];

    const connectionMappings = {
      SqlDataset: 'sql-connection-789'
    };

    const referenceMappings = {
      TestPipeline: {
        'TestPipeline_Lookup1_dataset': 'sql-connection-789'
      }
    };

    // Act
    const result = pipelineTransformer.transformPipelineDefinition(
      pipeline,
      datasets,
      [],
      connectionMappings,
      referenceMappings
    );

    // Assert
    const ifCondition = result.properties.activities[0];
    const nestedLookup = ifCondition.typeProperties.ifTrueActivities[0];
    
    expect(nestedLookup.type).toBe('Lookup');
    expect(nestedLookup.typeProperties.dataset).toBeUndefined();
    expect(nestedLookup.typeProperties.datasetSettings).toBeDefined();
    expect(nestedLookup.externalReferences).toBeDefined();
    expect(nestedLookup.externalReferences.connection).toBe('sql-connection-789');
  });

  it('should recursively transform nested Copy activities inside IfCondition', () => {
    // Arrange
    const pipeline = {
      name: 'TestPipeline',
      properties: {
        activities: [
          {
            name: 'If Condition1',
            type: 'IfCondition',
            typeProperties: {
              expression: {
                value: '@equals(1, 1)',
                type: 'Expression'
              },
              ifTrueActivities: [
                {
                  name: 'Copy data1',
                  type: 'Copy',
                  typeProperties: {
                    source: {
                      type: 'ParquetSource'
                    },
                    sink: {
                      type: 'ParquetSink'
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
                }
              ],
              ifFalseActivities: []
            }
          }
        ]
      }
    };

    const datasets = [
      {
        name: 'SourceDataset',
        properties: {
          type: 'Parquet',
          linkedServiceName: {
            referenceName: 'ADLS1',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            location: {
              type: 'AzureBlobFSLocation',
              fileName: 'source.parquet',
              folderPath: 'input',
              fileSystem: 'container1'
            }
          }
        }
      },
      {
        name: 'SinkDataset',
        properties: {
          type: 'Parquet',
          linkedServiceName: {
            referenceName: 'ADLS2',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            location: {
              type: 'AzureBlobFSLocation',
              fileName: 'sink.parquet',
              folderPath: 'output',
              fileSystem: 'container2'
            }
          }
        }
      }
    ];

    const connectionMappings = {
      SourceDataset: 'source-connection-111',
      SinkDataset: 'sink-connection-222'
    };

    const referenceMappings = {
      TestPipeline: {
        'TestPipeline_Copy data1_source': 'source-connection-111',
        'TestPipeline_Copy data1_sink': 'sink-connection-222'
      }
    };

    // Act
    const result = pipelineTransformer.transformPipelineDefinition(
      pipeline,
      datasets,
      [],
      connectionMappings,
      referenceMappings
    );

    // Assert
    const ifCondition = result.properties.activities[0];
    const nestedCopy = ifCondition.typeProperties.ifTrueActivities[0];
    
    expect(nestedCopy.type).toBe('Copy');
    expect(nestedCopy.inputs).toBeUndefined();
    expect(nestedCopy.outputs).toBeUndefined();
    expect(nestedCopy.typeProperties.source.datasetSettings).toBeDefined();
    expect(nestedCopy.typeProperties.sink.datasetSettings).toBeDefined();
    expect(nestedCopy.externalReferences).toBeDefined();
  });

  it('should handle multiple nested activities in both ifTrue and ifFalse branches', () => {
    // Arrange
    const pipeline = {
      name: 'TestPipeline',
      properties: {
        activities: [
          {
            name: 'If Condition1',
            type: 'IfCondition',
            typeProperties: {
              expression: {
                value: '@equals(1, 1)',
                type: 'Expression'
              },
              ifTrueActivities: [
                {
                  name: 'GetMetadata1',
                  type: 'GetMetadata',
                  typeProperties: {
                    dataset: {
                      referenceName: 'Dataset1',
                      type: 'DatasetReference'
                    },
                    fieldList: ['exists']
                  }
                },
                {
                  name: 'Lookup1',
                  type: 'Lookup',
                  typeProperties: {
                    dataset: {
                      referenceName: 'Dataset2',
                      type: 'DatasetReference'
                    },
                    source: {
                      type: 'SqlSource',
                      sqlReaderQuery: 'SELECT 1'
                    }
                  }
                }
              ],
              ifFalseActivities: [
                {
                  name: 'GetMetadata2',
                  type: 'GetMetadata',
                  typeProperties: {
                    dataset: {
                      referenceName: 'Dataset3',
                      type: 'DatasetReference'
                    },
                    fieldList: ['exists']
                  }
                }
              ]
            }
          }
        ]
      }
    };

    const datasets = [
      {
        name: 'Dataset1',
        properties: {
          type: 'Parquet',
          linkedServiceName: { referenceName: 'ADLS1', type: 'LinkedServiceReference' },
          typeProperties: {
            location: { type: 'AzureBlobFSLocation', fileName: 'file1.parquet', folderPath: 'path1', fileSystem: 'fs1' }
          }
        }
      },
      {
        name: 'Dataset2',
        properties: {
          type: 'AzureSqlTable',
          linkedServiceName: { referenceName: 'SQL1', type: 'LinkedServiceReference' },
          typeProperties: { schema: 'dbo', table: 'Table1' }
        }
      },
      {
        name: 'Dataset3',
        properties: {
          type: 'Parquet',
          linkedServiceName: { referenceName: 'ADLS2', type: 'LinkedServiceReference' },
          typeProperties: {
            location: { type: 'AzureBlobFSLocation', fileName: 'file2.parquet', folderPath: 'path2', fileSystem: 'fs2' }
          }
        }
      }
    ];

    const connectionMappings = {
      Dataset1: 'conn-1',
      Dataset2: 'conn-2',
      Dataset3: 'conn-3'
    };

    const referenceMappings = {
      TestPipeline: {
        'TestPipeline_GetMetadata1_dataset': 'conn-1',
        'TestPipeline_Lookup1_dataset': 'conn-2',
        'TestPipeline_GetMetadata2_dataset': 'conn-3'
      }
    };

    // Act
    const result = pipelineTransformer.transformPipelineDefinition(
      pipeline,
      datasets,
      [],
      connectionMappings,
      referenceMappings
    );

    // Assert
    const ifCondition = result.properties.activities[0];
    
    expect(ifCondition.typeProperties.ifTrueActivities).toHaveLength(2);
    expect(ifCondition.typeProperties.ifFalseActivities).toHaveLength(1);

    // Verify ifTrue activities transformed
    const getMetadata1 = ifCondition.typeProperties.ifTrueActivities[0];
    expect(getMetadata1.typeProperties.datasetSettings).toBeDefined();
    expect(getMetadata1.externalReferences.connection).toBe('conn-1');

    const lookup1 = ifCondition.typeProperties.ifTrueActivities[1];
    expect(lookup1.typeProperties.datasetSettings).toBeDefined();
    expect(lookup1.externalReferences.connection).toBe('conn-2');

    // Verify ifFalse activities transformed
    const getMetadata2 = ifCondition.typeProperties.ifFalseActivities[0];
    expect(getMetadata2.typeProperties.datasetSettings).toBeDefined();
    expect(getMetadata2.externalReferences.connection).toBe('conn-3');
  });

  it('should handle deeply nested IfCondition activities (IfCondition inside IfCondition)', () => {
    // Arrange
    const pipeline = {
      name: 'TestPipeline',
      properties: {
        activities: [
          {
            name: 'Outer If Condition',
            type: 'IfCondition',
            typeProperties: {
              expression: {
                value: '@equals(1, 1)',
                type: 'Expression'
              },
              ifTrueActivities: [
                {
                  name: 'Inner If Condition',
                  type: 'IfCondition',
                  typeProperties: {
                    expression: {
                      value: '@equals(2, 2)',
                      type: 'Expression'
                    },
                    ifTrueActivities: [
                      {
                        name: 'Deep GetMetadata',
                        type: 'GetMetadata',
                        typeProperties: {
                          dataset: {
                            referenceName: 'DeepDataset',
                            type: 'DatasetReference'
                          },
                          fieldList: ['exists']
                        }
                      }
                    ],
                    ifFalseActivities: []
                  }
                }
              ],
              ifFalseActivities: []
            }
          }
        ]
      }
    };

    const datasets = [
      {
        name: 'DeepDataset',
        properties: {
          type: 'Parquet',
          linkedServiceName: { referenceName: 'ADLS1', type: 'LinkedServiceReference' },
          typeProperties: {
            location: { type: 'AzureBlobFSLocation', fileName: 'deep.parquet', folderPath: 'deep', fileSystem: 'deep-fs' }
          }
        }
      }
    ];

    const connectionMappings = {
      DeepDataset: 'deep-conn-999'
    };

    const referenceMappings = {
      TestPipeline: {
        'TestPipeline_Deep GetMetadata_dataset': 'deep-conn-999'
      }
    };

    // Act
    const result = pipelineTransformer.transformPipelineDefinition(
      pipeline,
      datasets,
      [],
      connectionMappings,
      referenceMappings
    );

    // Assert
    const outerIfCondition = result.properties.activities[0];
    const innerIfCondition = outerIfCondition.typeProperties.ifTrueActivities[0];
    const deepGetMetadata = innerIfCondition.typeProperties.ifTrueActivities[0];
    
    expect(deepGetMetadata.type).toBe('GetMetadata');
    expect(deepGetMetadata.typeProperties.datasetSettings).toBeDefined();
    expect(deepGetMetadata.externalReferences.connection).toBe('deep-conn-999');
  });

  it('should handle empty ifTrueActivities and ifFalseActivities arrays', () => {
    // Arrange
    const pipeline = {
      name: 'TestPipeline',
      properties: {
        activities: [
          {
            name: 'Empty If Condition',
            type: 'IfCondition',
            typeProperties: {
              expression: {
                value: '@equals(1, 1)',
                type: 'Expression'
              },
              ifTrueActivities: [],
              ifFalseActivities: []
            }
          }
        ]
      }
    };

    // Act
    const result = pipelineTransformer.transformPipelineDefinition(
      pipeline,
      [],
      [],
      {},
      {}
    );

    // Assert
    const ifCondition = result.properties.activities[0];
    expect(ifCondition.type).toBe('IfCondition');
    expect(ifCondition.typeProperties.ifTrueActivities).toEqual([]);
    expect(ifCondition.typeProperties.ifFalseActivities).toEqual([]);
  });
});
