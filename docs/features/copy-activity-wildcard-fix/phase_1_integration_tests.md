# Phase 1: Integration Testing - Nested Activities and Real-World Scenarios

**Estimated Time:** 1.5 hours  
**Dependencies:** Phase 0 completed (core wildcard fix implemented)

---

## Goal Statement

Verify the wildcard fix works correctly for nested Copy activities within container activities (ForEach, IfCondition, Switch, Until) and test the exact user-provided pipeline example to ensure real-world compatibility.

---

## Pre-Execution Verification

Before starting Phase 1, verify Phase 0 completed successfully:

```bash
# Check that Phase 0 tests pass
npm test -- __tests__/copyActivityTransformer.test.ts

# Expected: 7 tests passing

# Verify hasWildcardPaths method exists
grep -n "hasWildcardPaths" src/services/copyActivityTransformer.ts

# Expected: Should show method around line 204-218

# Verify wildcard fix sections exist
grep -c "WILDCARD FIX" src/services/copyActivityTransformer.ts

# Expected: 2 (one for source, one for sink)
```

**Checkpoints:**
- [ ] Phase 0 tests passing (7/7)
- [ ] `hasWildcardPaths` method exists
- [ ] Wildcard fix in `transformCopySource`
- [ ] Wildcard fix in `transformCopySink`

---

## Changes Overview

1. Create comprehensive integration test file
2. Test user-provided pipeline3 example
3. Test nested Copy activities in ForEach
4. Test nested Copy activities in IfCondition
5. Test nested Copy activities in Switch
6. Test nested Copy activities in Until
7. Test deeply nested scenarios
8. Create validation module for runtime checking

---

## CHANGE 1: Create Integration Test File

### File (NEW)
`src/services/__tests__/copyActivityWildcardIntegration.test.ts`

### Pre-Execution Verification

**Verify imports exist in codebase:**

```bash
# Verify pipelineTransformer export exists
grep -n "export const pipelineTransformer" src/services/pipelineTransformer.ts
# Expected: Should return the export line (actual line number may vary based on codebase version)

# Verify CopyActivityTransformer export exists (matches class declaration)
grep -n "^export class CopyActivityTransformer" src/services/copyActivityTransformer.ts
# Expected: Should show class export near top of file

# Verify pipelineTransformer has transformPipelineDefinition method
grep -n "transformPipelineDefinition" src/services/pipelineTransformer.ts
# Expected: Should show method definition (confirms API compatibility with tests)
```

### Content

```typescript
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

      vi.spyOn(adfParserService, 'getDatasetByName').mockReturnValue(dataset);
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

      vi.spyOn(adfParserService, 'getDatasetByName').mockReturnValue(dataset);
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

      vi.spyOn(adfParserService, 'getDatasetByName').mockReturnValue(dataset);
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

      vi.spyOn(adfParserService, 'getDatasetByName').mockReturnValue(dataset);
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

      vi.spyOn(adfParserService, 'getDatasetByName').mockReturnValue(dataset);
      
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

      vi.spyOn(adfParserService, 'getDatasetByName').mockReturnValue(dataset);
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

      vi.spyOn(adfParserService, 'getDatasetByName').mockReturnValue(dataset);
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
```

### Verification

```bash
# Verify test case count
grep -c "it('should" src/services/__tests__/copyActivityWildcardIntegration.test.ts
# Expected: 7

# Run the integration tests
npm test -- copyActivityWildcardIntegration.test.ts

# Expected: All 7 tests should pass
```

**Checkpoint:**
- [ ] Integration test file created
- [ ] User-provided pipeline3 example test present
- [ ] ForEach nested test present
- [ ] IfCondition (both branches) tests present
- [ ] Switch case test present
- [ ] Until loop test present
- [ ] Deeply nested test present

---

## CHANGE 2: Create Validation Module

### File (NEW)
`src/validation/copy-activity-wildcard-validation.ts`

**Note:** This follows the naming pattern of existing validation files like `copy-activity-fix-validation.ts`

### Pre-Execution Verification

```bash
# Verify validation directory exists
ls -la src/validation/
# Expected: Directory exists

# Check naming pattern (all files should use kebab-case)
ls src/validation/*.ts
# Expected: All files use kebab-case naming
```

### File (NEW)
`src/validation/copy-activity-wildcard-validation.ts`

**Note:** This follows the naming pattern of existing validation files (`copy-activity-fix-validation.ts`, `copy-activity-test-runner.ts`)

### Content

```typescript
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
```

### Verification

```bash
# Verify validation module was created
ls -la src/validation/copy-activity-wildcard-validation.ts

# Expected: File exists
```

**Checkpoint:**
- [ ] Validation module created
- [ ] WildcardValidationResult interface defined
- [ ] validateTransformedCopyActivity method present
- [ ] validatePipeline method present (recursive)
- [ ] generateReport method present
- [ ] runWildcardValidation function present

---

## Final Verification

### Run Integration Tests

```bash
# Run integration tests
npm test -- copyActivityWildcardIntegration.test.ts
```

**Expected Output:**
```
 ✓ src/services/__tests__/copyActivityWildcardIntegration.test.ts (7 tests)
   CopyActivityTransformer - Wildcard Integration Tests
     User-Provided Example: pipeline3
       ✓ should correctly transform the exact pipeline from user bug report
     Nested Copy Activities in ForEach
       ✓ should apply wildcard fix to Copy activity nested in ForEach
     Nested Copy Activities in IfCondition
       ✓ should apply wildcard fix to Copy activity in ifTrueActivities branch
       ✓ should apply wildcard fix to Copy activity in ifFalseActivities branch
     Nested Copy Activities in Switch
       ✓ should apply wildcard fix to Copy activities in Switch cases
     Nested Copy Activities in Until
       ✓ should apply wildcard fix to Copy activity nested in Until loop
     Deeply Nested Scenarios
       ✓ should apply wildcard fix to Copy activity in ForEach nested inside IfCondition

Test Files  1 passed (1)
     Tests  7 passed (7)
```

### Run All Tests

```bash
# Run all Copy activity tests
npm test -- copyActivity

# Expected: Phase 0 + Phase 1 tests all passing (14 total)
```

### Verify Git Changes

```bash
# Check what files were created
git status

# Expected:
# new file:   src/services/__tests__/copyActivityWildcardIntegration.test.ts
# new file:   src/validation/wildcard-copy-activity-validation.ts
```

---

## Acceptance Criteria

- [ ] Integration test file created with 7 test cases
- [ ] User-provided pipeline3 example test passes
- [ ] ForEach nested Copy activity test passes
- [ ] IfCondition ifTrueActivities test passes
- [ ] IfCondition ifFalseActivities test passes
- [ ] Switch cases test passes
- [ ] Until loop test passes
- [ ] Deeply nested (IfCondition > ForEach > Copy) test passes
- [ ] Validation module created
- [ ] Validation module exports WildcardValidationResult interface
- [ ] validateTransformedCopyActivity method works
- [ ] validatePipeline method recursively checks nested activities
- [ ] generateReport method produces readable output
- [ ] All 7 integration tests pass
- [ ] Combined Phase 0 + Phase 1 tests pass (14 total)
- [ ] No TypeScript compilation errors

---

## Rollback Instructions

If you need to undo Phase 1:

```bash
git checkout src/services/__tests__/copyActivityWildcardIntegration.test.ts
git checkout src/validation/copy-activity-wildcard-validation.ts

# Or if files are new and untracked:
rm src/services/__tests__/copyActivityWildcardIntegration.test.ts
rm src/validation/copy-activity-wildcard-validation.ts
```

---

## Next Steps

After Phase 1 completes successfully:
1. Proceed to **Phase 2: Edge Case Handling**
2. File: `phase_2_edge_cases.md`
3. **Note:** Phase 2 includes amendments for correct line numbers

---

**Phase 1 Status:** Ready for execution
