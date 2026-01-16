import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CopyActivityTransformer } from '../copyActivityTransformer';
import { pipelineTransformer } from '../pipelineTransformer';
import { adfParserService } from '../adfParserService';

describe('CopyActivityTransformer - Wildcard Integration Tests', () => {
  let copyTransformer: CopyActivityTransformer;

  beforeEach(() => {
    copyTransformer = new CopyActivityTransformer();
    vi.clearAllMocks();
  });

  describe('User-Provided Example: pipeline3', () => {
    it('should correctly transform the exact pipeline from user bug report', () => {
      const pipeline = {
        name: 'pipeline3',
        properties: {
          activities: [
            {
              name: 'Copy data1_copy1',
              type: 'Copy',
              dependsOn: [],
              policy: {
                timeout: '0.12:00:00',
                retry: 0,
                retryIntervalInSeconds: 30,
                secureOutput: false,
                secureInput: false
              },
              userProperties: [],
              typeProperties: {
                source: {
                  type: 'JsonSource',
                  storeSettings: {
                    type: 'AzureBlobFSReadSettings',
                    recursive: true,
                    wildcardFolderPath: {
                      value: '@pipeline().globalParameters.gp_Directory',
                      type: 'Expression'
                    },
                    wildcardFileName: '*json',
                    enablePartitionDiscovery: false
                  },
                  formatSettings: {
                    type: 'JsonReadSettings'
                  }
                },
                sink: {
                  type: 'JsonSink',
                  storeSettings: {
                    type: 'AzureBlobFSWriteSettings'
                  },
                  formatSettings: {
                    type: 'JsonWriteSettings'
                  }
                },
                enableStaging: true,
                stagingSettings: {
                  linkedServiceName: {
                    referenceName: 'AzureDataLakeStorage1',
                    type: 'LinkedServiceReference'
                  },
                  path: 'staging'
                },
                parallelCopies: 13,
                dataIntegrationUnits: 32
              },
              inputs: [
                {
                  referenceName: 'Json1',
                  type: 'DatasetReference',
                  parameters: {
                    p_container: {
                      value: '@pipeline().globalParameters.gp_Container',
                      type: 'Expression'
                    },
                    p_directory: {
                      value: '@pipeline().globalParameters.gp_Directory',
                      type: 'Expression'
                    },
                    p_fileName: '*.json'
                  }
                }
              ],
              outputs: [
                {
                  referenceName: 'Json1',
                  type: 'DatasetReference',
                  parameters: {
                    p_container: 'landingzone',
                    p_directory: 'test',
                    p_fileName: 'newjson.json'
                  }
                }
              ]
            }
          ],
          annotations: []
        }
      };

      const dataset = {
        name: 'Json1',
        definition: {
          properties: {
            type: 'Json',
            linkedServiceName: {
              referenceName: 'AzureDataLakeStorage1',
              type: 'LinkedServiceReference'
            },
            parameters: {
              p_container: { type: 'string' },
              p_directory: { type: 'string' },
              p_fileName: { type: 'string' }
            },
            typeProperties: {
              location: {
                type: 'AzureBlobFSLocation',
                fileName: {
                  value: '@dataset().p_fileName',
                  type: 'Expression'
                },
                folderPath: {
                  value: '@dataset().p_directory',
                  type: 'Expression'
                },
                fileSystem: {
                  value: '@dataset().p_container',
                  type: 'Expression'
                }
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getDatasetByName').mockReturnValue(dataset as any);
      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        sourceDataset: dataset,
        sinkDataset: dataset,
        sourceParameters: {
          p_container: {
            value: '@pipeline().globalParameters.gp_Container',
            type: 'Expression'
          },
          p_directory: {
            value: '@pipeline().globalParameters.gp_Directory',
            type: 'Expression'
          },
          p_fileName: '*.json'
        },
        sinkParameters: {
          p_container: 'landingzone',
          p_directory: 'test',
          p_fileName: 'newjson.json'
        }
      });

      const result = pipelineTransformer.transformPipelineDefinition(
        pipeline,
        {},
        'pipeline3'
      );

      const transformedActivity = result.properties.activities[0];

      expect(transformedActivity.name).toBe('Copy data1_copy1');
      expect(transformedActivity.type).toBe('Copy');
      expect(transformedActivity.inputs).toBeUndefined();
      expect(transformedActivity.outputs).toBeUndefined();

      expect(transformedActivity.typeProperties.source.datasetSettings).toBeDefined();
      expect(transformedActivity.typeProperties.source.datasetSettings.type).toBe('Json');
      expect(transformedActivity.typeProperties.source.datasetSettings.typeProperties).toBeDefined();
      expect(transformedActivity.typeProperties.source.datasetSettings.typeProperties.location).toBeDefined();

      expect(transformedActivity.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBeDefined();
      expect(transformedActivity.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('@pipeline().globalParameters.gp_Container');

      expect(transformedActivity.typeProperties.sink.datasetSettings).toBeDefined();
      expect(transformedActivity.typeProperties.sink.datasetSettings.type).toBe('Json');
      expect(transformedActivity.typeProperties.sink.datasetSettings.typeProperties).toBeDefined();
      expect(transformedActivity.typeProperties.sink.datasetSettings.typeProperties.location).toBeDefined();
      expect(transformedActivity.typeProperties.sink.datasetSettings.typeProperties.location.fileSystem).toBe('landingzone');

      expect(transformedActivity.typeProperties.source.storeSettings).toBeDefined();
      expect(transformedActivity.typeProperties.source.storeSettings.wildcardFolderPath).toBeDefined();
      expect(transformedActivity.typeProperties.source.storeSettings.wildcardFileName).toBe('*json');

      expect(transformedActivity.typeProperties.enableStaging).toBe(true);
      expect(transformedActivity.typeProperties.parallelCopies).toBe(13);
      expect(transformedActivity.typeProperties.dataIntegrationUnits).toBe(32);
    });
  });

  describe('Nested Copy Activities in ForEach', () => {
    it('should apply wildcard fix to Copy activity nested in ForEach', () => {
      const pipeline = {
        name: 'NestedForEachPipeline',
        properties: {
          activities: [
            {
              name: 'ForEach1',
              type: 'ForEach',
              typeProperties: {
                items: {
                  value: '@pipeline().parameters.FileList',
                  type: 'Expression'
                },
                isSequential: false,
                activities: [
                  {
                    name: 'Copy data1',
                    type: 'Copy',
                    typeProperties: {
                      source: {
                        type: 'ParquetSource',
                        storeSettings: {
                          type: 'AzureBlobFSReadSettings',
                          wildcardFolderPath: '@item().folderPath',
                          wildcardFileName: '*.parquet'
                        }
                      },
                      sink: {
                        type: 'ParquetSink',
                        storeSettings: {
                          type: 'AzureBlobFSWriteSettings'
                        }
                      }
                    },
                    inputs: [
                      {
                        referenceName: 'ParquetDataset',
                        type: 'DatasetReference',
                        parameters: {
                          Container: 'raw'
                        }
                      }
                    ],
                    outputs: [
                      {
                        referenceName: 'ParquetDataset',
                        type: 'DatasetReference',
                        parameters: {
                          Container: 'processed'
                        }
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      };

      const dataset = {
        name: 'ParquetDataset',
        definition: {
          properties: {
            type: 'Parquet',
            linkedServiceName: {
              referenceName: 'ADLS1',
              type: 'LinkedServiceReference'
            },
            parameters: {
              Container: { type: 'string' }
            },
            typeProperties: {
              location: {
                type: 'AzureBlobFSLocation',
                fileSystem: {
                  value: '@dataset().Container',
                  type: 'Expression'
                }
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getDatasetByName').mockReturnValue(dataset as any);
      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        sourceDataset: dataset,
        sinkDataset: dataset,
        sourceParameters: {
          Container: 'raw'
        },
        sinkParameters: {
          Container: 'processed'
        }
      });

      const result = pipelineTransformer.transformPipelineDefinition(
        pipeline,
        {},
        'NestedForEachPipeline'
      );

      const forEachActivity = result.properties.activities[0];
      const nestedCopyActivity = forEachActivity.typeProperties.activities[0];

      expect(nestedCopyActivity.type).toBe('Copy');
      expect(nestedCopyActivity.inputs).toBeUndefined();
      expect(nestedCopyActivity.outputs).toBeUndefined();

      expect(nestedCopyActivity.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('raw');
      expect(nestedCopyActivity.typeProperties.sink.datasetSettings.typeProperties.location.fileSystem).toBe('processed');
    });
  });

  describe('Nested Copy Activities in IfCondition', () => {
    it('should apply wildcard fix to Copy activity in ifTrueActivities branch', () => {
      const pipeline = {
        name: 'IfConditionPipeline',
        properties: {
          activities: [
            {
              name: 'If Condition1',
              type: 'IfCondition',
              typeProperties: {
                expression: {
                  value: '@equals(pipeline().parameters.Mode, \'wildcard\')',
                  type: 'Expression'
                },
                ifTrueActivities: [
                  {
                    name: 'Copy with wildcard',
                    type: 'Copy',
                    typeProperties: {
                      source: {
                        type: 'DelimitedTextSource',
                        storeSettings: {
                          type: 'AzureBlobFSReadSettings',
                          wildcardFolderPath: 'input/*',
                          wildcardFileName: '*.csv'
                        }
                      },
                      sink: {
                        type: 'DelimitedTextSink',
                        storeSettings: {
                          type: 'AzureBlobFSWriteSettings'
                        }
                      }
                    },
                    inputs: [
                      {
                        referenceName: 'CsvDataset',
                        type: 'DatasetReference',
                        parameters: {
                          FileSystem: 'source-container'
                        }
                      }
                    ],
                    outputs: [
                      {
                        referenceName: 'CsvDataset',
                        type: 'DatasetReference',
                        parameters: {
                          FileSystem: 'dest-container'
                        }
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

      const dataset = {
        name: 'CsvDataset',
        definition: {
          properties: {
            type: 'DelimitedText',
            linkedServiceName: {
              referenceName: 'ADLS1',
              type: 'LinkedServiceReference'
            },
            parameters: {
              FileSystem: { type: 'string' }
            },
            typeProperties: {
              location: {
                type: 'AzureBlobFSLocation',
                fileSystem: {
                  value: '@dataset().FileSystem',
                  type: 'Expression'
                }
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getDatasetByName').mockReturnValue(dataset as any);
      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        sourceDataset: dataset,
        sinkDataset: dataset,
        sourceParameters: {
          FileSystem: 'source-container'
        },
        sinkParameters: {
          FileSystem: 'dest-container'
        }
      });

      const result = pipelineTransformer.transformPipelineDefinition(
        pipeline,
        {},
        'IfConditionPipeline'
      );

      const ifConditionActivity = result.properties.activities[0];
      const nestedCopyActivity = ifConditionActivity.typeProperties.ifTrueActivities[0];

      expect(nestedCopyActivity.type).toBe('Copy');
      expect(nestedCopyActivity.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('source-container');
      expect(nestedCopyActivity.typeProperties.sink.datasetSettings.typeProperties.location.fileSystem).toBe('dest-container');
    });

    it('should apply wildcard fix to Copy activity in ifFalseActivities branch', () => {
      const pipeline = {
        name: 'IfConditionPipeline2',
        properties: {
          activities: [
            {
              name: 'If Condition1',
              type: 'IfCondition',
              typeProperties: {
                expression: {
                  value: '@equals(1, 2)',
                  type: 'Expression'
                },
                ifTrueActivities: [],
                ifFalseActivities: [
                  {
                    name: 'Copy fallback',
                    type: 'Copy',
                    typeProperties: {
                      source: {
                        type: 'JsonSource',
                        storeSettings: {
                          type: 'AzureBlobFSReadSettings',
                          wildcardFileName: '*.json'
                        }
                      },
                      sink: {
                        type: 'JsonSink',
                        storeSettings: {
                          type: 'AzureBlobFSWriteSettings'
                        }
                      }
                    },
                    inputs: [
                      {
                        referenceName: 'JsonDataset',
                        type: 'DatasetReference',
                        parameters: {
                          Container: 'backup'
                        }
                      }
                    ],
                    outputs: [
                      {
                        referenceName: 'JsonDataset',
                        type: 'DatasetReference',
                        parameters: {
                          Container: 'archive'
                        }
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      };

      const dataset = {
        name: 'JsonDataset',
        definition: {
          properties: {
            type: 'Json',
            linkedServiceName: {
              referenceName: 'ADLS1',
              type: 'LinkedServiceReference'
            },
            parameters: {
              Container: { type: 'string' }
            },
            typeProperties: {
              location: {
                type: 'AzureBlobFSLocation',
                fileSystem: {
                  value: '@dataset().Container',
                  type: 'Expression'
                }
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getDatasetByName').mockReturnValue(dataset as any);
      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        sourceDataset: dataset,
        sinkDataset: dataset,
        sourceParameters: {
          Container: 'backup'
        },
        sinkParameters: {
          Container: 'archive'
        }
      });

      const result = pipelineTransformer.transformPipelineDefinition(
        pipeline,
        {},
        'IfConditionPipeline2'
      );

      const ifConditionActivity = result.properties.activities[0];
      const nestedCopyActivity = ifConditionActivity.typeProperties.ifFalseActivities[0];

      expect(nestedCopyActivity.type).toBe('Copy');
      expect(nestedCopyActivity.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('backup');
    });
  });

  describe('Nested Copy Activities in Switch', () => {
    it('should apply wildcard fix to Copy activities in Switch cases', () => {
      const pipeline = {
        name: 'SwitchPipeline',
        properties: {
          activities: [
            {
              name: 'Switch1',
              type: 'Switch',
              typeProperties: {
                on: {
                  value: '@pipeline().parameters.Environment',
                  type: 'Expression'
                },
                cases: [
                  {
                    value: 'dev',
                    activities: [
                      {
                        name: 'Copy dev',
                        type: 'Copy',
                        typeProperties: {
                          source: {
                            type: 'ParquetSource',
                            storeSettings: {
                              type: 'AzureBlobFSReadSettings',
                              wildcardFolderPath: 'dev/*',
                              wildcardFileName: '*.parquet'
                            }
                          },
                          sink: {
                            type: 'ParquetSink',
                            storeSettings: {
                              type: 'AzureBlobFSWriteSettings'
                            }
                          }
                        },
                        inputs: [
                          {
                            referenceName: 'ParquetDS',
                            type: 'DatasetReference',
                            parameters: {
                              FS: 'dev-container'
                            }
                          }
                        ],
                        outputs: [
                          {
                            referenceName: 'ParquetDS',
                            type: 'DatasetReference',
                            parameters: {
                              FS: 'dev-output'
                            }
                          }
                        ]
                      }
                    ]
                  },
                  {
                    value: 'prod',
                    activities: [
                      {
                        name: 'Copy prod',
                        type: 'Copy',
                        typeProperties: {
                          source: {
                            type: 'ParquetSource',
                            storeSettings: {
                              type: 'AzureBlobFSReadSettings',
                              wildcardFileName: '*.parquet'
                            }
                          },
                          sink: {
                            type: 'ParquetSink',
                            storeSettings: {
                              type: 'AzureBlobFSWriteSettings'
                            }
                          }
                        },
                        inputs: [
                          {
                            referenceName: 'ParquetDS',
                            type: 'DatasetReference',
                            parameters: {
                              FS: 'prod-container'
                            }
                          }
                        ],
                        outputs: [
                          {
                            referenceName: 'ParquetDS',
                            type: 'DatasetReference',
                            parameters: {
                              FS: 'prod-output'
                            }
                          }
                        ]
                      }
                    ]
                  }
                ],
                defaultActivities: []
              }
            }
          ]
        }
      };

      const dataset = {
        name: 'ParquetDS',
        definition: {
          properties: {
            type: 'Parquet',
            linkedServiceName: {
              referenceName: 'ADLS1',
              type: 'LinkedServiceReference'
            },
            parameters: {
              FS: { type: 'string' }
            },
            typeProperties: {
              location: {
                type: 'AzureBlobFSLocation',
                fileSystem: {
                  value: '@dataset().FS',
                  type: 'Expression'
                }
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getDatasetByName').mockReturnValue(dataset as any);
      
      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings')
        .mockReturnValueOnce({
          sourceDataset: dataset,
          sinkDataset: dataset,
          sourceParameters: { FS: 'dev-container' },
          sinkParameters: { FS: 'dev-output' }
        })
        .mockReturnValueOnce({
          sourceDataset: dataset,
          sinkDataset: dataset,
          sourceParameters: { FS: 'prod-container' },
          sinkParameters: { FS: 'prod-output' }
        });

      const result = pipelineTransformer.transformPipelineDefinition(
        pipeline,
        {},
        'SwitchPipeline'
      );

      const switchActivity = result.properties.activities[0];
      const devCopyActivity = switchActivity.typeProperties.cases[0].activities[0];
      const prodCopyActivity = switchActivity.typeProperties.cases[1].activities[0];

      expect(devCopyActivity.type).toBe('Copy');
      expect(devCopyActivity.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('dev-container');

      expect(prodCopyActivity.type).toBe('Copy');
      expect(prodCopyActivity.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('prod-container');
    });
  });

  describe('Nested Copy Activities in Until', () => {
    it('should apply wildcard fix to Copy activity nested in Until loop', () => {
      const pipeline = {
        name: 'UntilPipeline',
        properties: {
          activities: [
            {
              name: 'Until1',
              type: 'Until',
              typeProperties: {
                expression: {
                  value: '@equals(variables(\'done\'), true)',
                  type: 'Expression'
                },
                timeout: '0.12:00:00',
                activities: [
                  {
                    name: 'Copy incremental',
                    type: 'Copy',
                    typeProperties: {
                      source: {
                        type: 'DelimitedTextSource',
                        storeSettings: {
                          type: 'AzureBlobFSReadSettings',
                          wildcardFolderPath: '@variables(\'currentFolder\')',
                          wildcardFileName: '*.csv'
                        }
                      },
                      sink: {
                        type: 'DelimitedTextSink',
                        storeSettings: {
                          type: 'AzureBlobFSWriteSettings'
                        }
                      }
                    },
                    inputs: [
                      {
                        referenceName: 'CsvDS',
                        type: 'DatasetReference',
                        parameters: {
                          ContainerName: 'incremental'
                        }
                      }
                    ],
                    outputs: [
                      {
                        referenceName: 'CsvDS',
                        type: 'DatasetReference',
                        parameters: {
                          ContainerName: 'processed'
                        }
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      };

      const dataset = {
        name: 'CsvDS',
        definition: {
          properties: {
            type: 'DelimitedText',
            linkedServiceName: {
              referenceName: 'ADLS1',
              type: 'LinkedServiceReference'
            },
            parameters: {
              ContainerName: { type: 'string' }
            },
            typeProperties: {
              location: {
                type: 'AzureBlobFSLocation',
                fileSystem: {
                  value: '@dataset().ContainerName',
                  type: 'Expression'
                }
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getDatasetByName').mockReturnValue(dataset as any);
      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        sourceDataset: dataset,
        sinkDataset: dataset,
        sourceParameters: {
          ContainerName: 'incremental'
        },
        sinkParameters: {
          ContainerName: 'processed'
        }
      });

      const result = pipelineTransformer.transformPipelineDefinition(
        pipeline,
        {},
        'UntilPipeline'
      );

      const untilActivity = result.properties.activities[0];
      const nestedCopyActivity = untilActivity.typeProperties.activities[0];

      expect(nestedCopyActivity.type).toBe('Copy');
      expect(nestedCopyActivity.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('incremental');
      expect(nestedCopyActivity.typeProperties.sink.datasetSettings.typeProperties.location.fileSystem).toBe('processed');
    });
  });

  describe('Deeply Nested Scenarios', () => {
    it('should apply wildcard fix to Copy activity in ForEach nested inside IfCondition', () => {
      const pipeline = {
        name: 'DeeplyNestedPipeline',
        properties: {
          activities: [
            {
              name: 'If Condition1',
              type: 'IfCondition',
              typeProperties: {
                expression: {
                  value: '@pipeline().parameters.ProcessBatch',
                  type: 'Expression'
                },
                ifTrueActivities: [
                  {
                    name: 'ForEach Files',
                    type: 'ForEach',
                    typeProperties: {
                      items: {
                        value: '@pipeline().parameters.Files',
                        type: 'Expression'
                      },
                      activities: [
                        {
                          name: 'Copy each file',
                          type: 'Copy',
                          typeProperties: {
                            source: {
                              type: 'JsonSource',
                              storeSettings: {
                                type: 'AzureBlobFSReadSettings',
                                wildcardFileName: '@item().pattern'
                              }
                            },
                            sink: {
                              type: 'JsonSink',
                              storeSettings: {
                                type: 'AzureBlobFSWriteSettings'
                              }
                            }
                          },
                          inputs: [
                            {
                              referenceName: 'JsonDS',
                              type: 'DatasetReference',
                              parameters: {
                                Container: '@item().container'
                              }
                            }
                          ],
                          outputs: [
                            {
                              referenceName: 'JsonDS',
                              type: 'DatasetReference',
                              parameters: {
                                Container: 'output'
                              }
                            }
                          ]
                        }
                      ]
                    }
                  }
                ],
                ifFalseActivities: []
              }
            }
          ]
        }
      };

      const dataset = {
        name: 'JsonDS',
        definition: {
          properties: {
            type: 'Json',
            linkedServiceName: {
              referenceName: 'ADLS1',
              type: 'LinkedServiceReference'
            },
            parameters: {
              Container: { type: 'string' }
            },
            typeProperties: {
              location: {
                type: 'AzureBlobFSLocation',
                fileSystem: {
                  value: '@dataset().Container',
                  type: 'Expression'
                }
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getDatasetByName').mockReturnValue(dataset as any);
      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        sourceDataset: dataset,
        sinkDataset: dataset,
        sourceParameters: {
          Container: '@item().container'
        },
        sinkParameters: {
          Container: 'output'
        }
      });

      const result = pipelineTransformer.transformPipelineDefinition(
        pipeline,
        {},
        'DeeplyNestedPipeline'
      );

      const ifConditionActivity = result.properties.activities[0];
      const forEachActivity = ifConditionActivity.typeProperties.ifTrueActivities[0];
      const deeplyNestedCopyActivity = forEachActivity.typeProperties.activities[0];

      expect(deeplyNestedCopyActivity.type).toBe('Copy');
      expect(deeplyNestedCopyActivity.typeProperties.source.datasetSettings).toBeDefined();
      expect(deeplyNestedCopyActivity.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('@item().container');
      expect(deeplyNestedCopyActivity.typeProperties.sink.datasetSettings.typeProperties.location.fileSystem).toBe('output');
    });
  });
});

