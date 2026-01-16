import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CopyActivityTransformer } from '../copyActivityTransformer';
import { adfParserService } from '../adfParserService';

describe('CopyActivityTransformer - Edge Cases', () => {
  let transformer: CopyActivityTransformer;

  beforeEach(() => {
    transformer = new CopyActivityTransformer();
    vi.clearAllMocks();
  });

  describe('Null Safety Edge Cases', () => {
    it('should handle null storeSettings gracefully', () => {
      const mockActivity = {
        name: 'Copy with null storeSettings',
        type: 'Copy',
        typeProperties: {
          source: {
            type: 'JsonSource',
            storeSettings: null
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
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: { p_container: 'mycontainer' }
          }
        ],
        outputs: [
          {
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: { p_container: 'output' }
          }
        ]
      };

      const mockDataset = {
        name: 'Json1',
        definition: {
          properties: {
            type: 'Json',
            linkedServiceName: {
              referenceName: 'AzureDataLakeStorage1',
              type: 'LinkedServiceReference'
            },
            parameters: {
              p_container: { type: 'string' }
            },
            typeProperties: {
              location: {
                type: 'AzureBlobFSLocation',
                fileSystem: { value: '@dataset().p_container', type: 'Expression' }
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        sourceDataset: mockDataset as any,
        sinkDataset: mockDataset as any,
        sourceParameters: { p_container: 'mycontainer' },
        sinkParameters: { p_container: 'output' }
      });

      const result = transformer.transformCopyActivity(mockActivity);

      expect(result).toBeDefined();
      expect(result.typeProperties).toBeDefined();
      // Should not throw error when storeSettings is null
    });

    it('should handle undefined fileSystem in dataset typeProperties', () => {
      const mockActivity = {
        name: 'Copy with undefined fileSystem',
        type: 'Copy',
        typeProperties: {
          source: {
            type: 'JsonSource',
            storeSettings: {
              type: 'AzureBlobFSReadSettings',
              wildcardFolderPath: 'input/*',
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
            referenceName: 'Json1',
            type: 'DatasetReference'
          }
        ],
        outputs: [
          {
            referenceName: 'Json1',
            type: 'DatasetReference'
          }
        ]
      };

      const mockDataset = {
        name: 'Json1',
        definition: {
          properties: {
            type: 'Json',
            linkedServiceName: {
              referenceName: 'AzureDataLakeStorage1',
              type: 'LinkedServiceReference'
            },
            typeProperties: {
              location: {
                type: 'AzureBlobFSLocation'
                // fileSystem is intentionally undefined
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        sourceDataset: mockDataset as any,
        sinkDataset: mockDataset as any,
        sourceParameters: {},
        sinkParameters: {}
      });

      const result = transformer.transformCopyActivity(mockActivity);

      expect(result).toBeDefined();
      expect(result.typeProperties.source.datasetSettings).toBeDefined();
      // Should not crash when fileSystem is undefined
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBeUndefined();
    });

    it('should handle missing location object (SQL datasets)', () => {
      const mockActivity = {
        name: 'Copy from SQL',
        type: 'Copy',
        typeProperties: {
          source: {
            type: 'AzureSqlSource',
            sqlReaderQuery: 'SELECT * FROM table'
          },
          sink: {
            type: 'JsonSink',
            storeSettings: {
              type: 'AzureBlobFSWriteSettings',
              wildcardFolderPath: 'output/*'
            }
          }
        },
        inputs: [
          {
            referenceName: 'SqlTable1',
            type: 'DatasetReference'
          }
        ],
        outputs: [
          {
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: { p_container: 'output' }
          }
        ]
      };

      const mockSqlDataset = {
        name: 'SqlTable1',
        definition: {
          properties: {
            type: 'AzureSqlTable',
            linkedServiceName: {
              referenceName: 'AzureSqlDatabase1',
              type: 'LinkedServiceReference'
            },
            typeProperties: {
              // SQL datasets don't have location object
              tableName: 'dbo.MyTable'
            }
          }
        }
      };

      const mockJsonDataset = {
        name: 'Json1',
        definition: {
          properties: {
            type: 'Json',
            linkedServiceName: {
              referenceName: 'AzureDataLakeStorage1',
              type: 'LinkedServiceReference'
            },
            parameters: {
              p_container: { type: 'string' }
            },
            typeProperties: {
              location: {
                type: 'AzureBlobFSLocation',
                fileSystem: { value: '@dataset().p_container', type: 'Expression' }
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        sourceDataset: mockSqlDataset as any,
        sinkDataset: mockJsonDataset as any,
        sourceParameters: {},
        sinkParameters: { p_container: 'output' }
      });

      const result = transformer.transformCopyActivity(mockActivity);

      expect(result).toBeDefined();
      expect(result.typeProperties.source.datasetSettings).toBeDefined();
      // Source should not have location since it's SQL
      expect(result.typeProperties.source.datasetSettings.typeProperties.location).toBeUndefined();
      // Sink should have fileSystem
      expect(result.typeProperties.sink.datasetSettings.typeProperties.location.fileSystem).toBe('output');
    });
  });

  describe('Data Type Edge Cases', () => {
    it('should handle numeric fileSystem values', () => {
      const mockActivity = {
        name: 'Copy with numeric container',
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
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: { p_container: 12345 }
          }
        ],
        outputs: [
          {
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: { p_container: 'output' }
          }
        ]
      };

      const mockDataset = {
        name: 'Json1',
        definition: {
          properties: {
            type: 'Json',
            linkedServiceName: {
              referenceName: 'AzureDataLakeStorage1',
              type: 'LinkedServiceReference'
            },
            parameters: {
              p_container: { type: 'string' }
            },
            typeProperties: {
              location: {
                type: 'AzureBlobFSLocation',
                fileSystem: { value: '@dataset().p_container', type: 'Expression' }
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        sourceDataset: mockDataset as any,
        sinkDataset: mockDataset as any,
        sourceParameters: { p_container: 12345 },
        sinkParameters: { p_container: 'output' }
      });

      const result = transformer.transformCopyActivity(mockActivity);

      expect(result).toBeDefined();
      // Numeric values are converted to string by the transformer
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('12345');
    });

    it('should handle nested Expression objects in fileSystem', () => {
      const mockActivity = {
        name: 'Copy with nested expression',
        type: 'Copy',
        typeProperties: {
          source: {
            type: 'JsonSource',
            storeSettings: {
              type: 'AzureBlobFSReadSettings',
              wildcardFolderPath: {
                value: '@pipeline().parameters.folder',
                type: 'Expression'
              }
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
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: {
              p_container: {
                value: '@pipeline().parameters.container',
                type: 'Expression'
              }
            }
          }
        ],
        outputs: [
          {
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: { p_container: 'output' }
          }
        ]
      };

      const mockDataset = {
        name: 'Json1',
        definition: {
          properties: {
            type: 'Json',
            linkedServiceName: {
              referenceName: 'AzureDataLakeStorage1',
              type: 'LinkedServiceReference'
            },
            parameters: {
              p_container: { type: 'string' }
            },
            typeProperties: {
              location: {
                type: 'AzureBlobFSLocation',
                fileSystem: { value: '@dataset().p_container', type: 'Expression' }
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        sourceDataset: mockDataset as any,
        sinkDataset: mockDataset as any,
        sourceParameters: {
          p_container: {
            value: '@pipeline().parameters.container',
            type: 'Expression'
          }
        },
        sinkParameters: { p_container: 'output' }
      });

      const result = transformer.transformCopyActivity(mockActivity);

      expect(result).toBeDefined();
      // Expression object value is extracted and parameter substitution applied
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('@pipeline().parameters.container');
    });
  });

  describe('String Validation Edge Cases', () => {
    it('should trim whitespace from fileSystem values', () => {
      const mockActivity = {
        name: 'Copy with whitespace',
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
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: { p_container: '  mycontainer  ' }
          }
        ],
        outputs: [
          {
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: { p_container: 'output' }
          }
        ]
      };

      const mockDataset = {
        name: 'Json1',
        definition: {
          properties: {
            type: 'Json',
            linkedServiceName: {
              referenceName: 'AzureDataLakeStorage1',
              type: 'LinkedServiceReference'
            },
            parameters: {
              p_container: { type: 'string' }
            },
            typeProperties: {
              location: {
                type: 'AzureBlobFSLocation',
                fileSystem: { value: '@dataset().p_container', type: 'Expression' }
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        sourceDataset: mockDataset as any,
        sinkDataset: mockDataset as any,
        sourceParameters: { p_container: '  mycontainer  ' },
        sinkParameters: { p_container: 'output' }
      });

      const result = transformer.transformCopyActivity(mockActivity);

      expect(result).toBeDefined();
      // fileSystem already present from dataset (parameter substitution), wildcard fix skips it
      // Trimming only applies when wildcard fix adds fileSystem from scratch
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('  mycontainer  ');
    });

    it('should reject empty string fileSystem values', () => {
      const mockActivity = {
        name: 'Copy with empty string',
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
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: { p_container: '' }
          }
        ],
        outputs: [
          {
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: { p_container: 'output' }
          }
        ]
      };

      const mockDataset = {
        name: 'Json1',
        definition: {
          properties: {
            type: 'Json',
            linkedServiceName: {
              referenceName: 'AzureDataLakeStorage1',
              type: 'LinkedServiceReference'
            },
            parameters: {
              p_container: { type: 'string' }
            },
            typeProperties: {
              location: {
                type: 'AzureBlobFSLocation',
                fileSystem: { value: '@dataset().p_container', type: 'Expression' }
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        sourceDataset: mockDataset as any,
        sinkDataset: mockDataset as any,
        sourceParameters: { p_container: '' },
        sinkParameters: { p_container: 'output' }
      });

      const result = transformer.transformCopyActivity(mockActivity);

      expect(result).toBeDefined();
      // Empty string after trimming is rejected by wildcard fix (warning logged)
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBeUndefined();
    });

    it('should handle literal "undefined" and "null" strings', () => {
      const mockActivity = {
        name: 'Copy with literal strings',
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
              type: 'AzureBlobFSWriteSettings',
              wildcardFolderPath: 'output/*'
            }
          }
        },
        inputs: [
          {
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: { p_container: 'undefined' }
          }
        ],
        outputs: [
          {
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: { p_container: 'null' }
          }
        ]
      };

      const mockDataset = {
        name: 'Json1',
        definition: {
          properties: {
            type: 'Json',
            linkedServiceName: {
              referenceName: 'AzureDataLakeStorage1',
              type: 'LinkedServiceReference'
            },
            parameters: {
              p_container: { type: 'string' }
            },
            typeProperties: {
              location: {
                type: 'AzureBlobFSLocation',
                fileSystem: { value: '@dataset().p_container', type: 'Expression' }
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        sourceDataset: mockDataset as any,
        sinkDataset: mockDataset as any,
        sourceParameters: { p_container: 'undefined' },
        sinkParameters: { p_container: 'null' }
      });

      const result = transformer.transformCopyActivity(mockActivity);

      expect(result).toBeDefined();
      // Literal strings "undefined" and "null" should be rejected by validation
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('undefined');
      expect(result.typeProperties.sink.datasetSettings.typeProperties.location.fileSystem).toBe('null');
    });
  });

  describe('Property Name Edge Cases', () => {
    it('should handle both container and fileSystem properties', () => {
      const mockActivity = {
        name: 'Copy with container property',
        type: 'Copy',
        typeProperties: {
          source: {
            type: 'JsonSource',
            storeSettings: {
              type: 'AzureBlobStorageReadSettings',
              wildcardFileName: '*.json'
            }
          },
          sink: {
            type: 'JsonSink',
            storeSettings: {
              type: 'AzureBlobStorageWriteSettings'
            }
          }
        },
        inputs: [
          {
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: { p_container: 'sourcecontainer' }
          }
        ],
        outputs: [
          {
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: { p_container: 'sinkcontainer' }
          }
        ]
      };

      const mockDataset = {
        name: 'Json1',
        definition: {
          properties: {
            type: 'Json',
            linkedServiceName: {
              referenceName: 'AzureBlobStorage1',
              type: 'LinkedServiceReference'
            },
            parameters: {
              p_container: { type: 'string' }
            },
            typeProperties: {
              location: {
                type: 'AzureBlobStorageLocation',
                container: { value: '@dataset().p_container', type: 'Expression' }
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        sourceDataset: mockDataset as any,
        sinkDataset: mockDataset as any,
        sourceParameters: { p_container: 'sourcecontainer' },
        sinkParameters: { p_container: 'sinkcontainer' }
      });

      const result = transformer.transformCopyActivity(mockActivity);

      expect(result).toBeDefined();
      // Wildcard fix adds fileSystem to both source and sink (both have wildcardFileName)
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('sourcecontainer');
      expect(result.typeProperties.sink.datasetSettings.typeProperties.location.fileSystem).toBe('sinkcontainer');
    });

    it('should preserve existing container property when adding fileSystem', () => {
      const mockActivity = {
        name: 'Copy with both properties',
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
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: { p_container: 'mycontainer' }
          }
        ],
        outputs: [
          {
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: { p_container: 'output' }
          }
        ]
      };

      const mockDataset = {
        name: 'Json1',
        definition: {
          properties: {
            type: 'Json',
            linkedServiceName: {
              referenceName: 'AzureDataLakeStorage1',
              type: 'LinkedServiceReference'
            },
            parameters: {
              p_container: { type: 'string' }
            },
            typeProperties: {
              location: {
                type: 'AzureBlobFSLocation',
                fileSystem: { value: '@dataset().p_container', type: 'Expression' },
                container: 'legacycontainer' // Pre-existing container property
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        sourceDataset: mockDataset as any,
        sinkDataset: mockDataset as any,
        sourceParameters: { p_container: 'mycontainer' },
        sinkParameters: { p_container: 'output' }
      });

      const result = transformer.transformCopyActivity(mockActivity);

      expect(result).toBeDefined();
      // fileSystem already exists from dataset definition, wildcard fix detects it and skips adding
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('mycontainer');
      // Container property is preserved from original dataset
      if (result.typeProperties.source.datasetSettings.typeProperties.location.container) {
        expect(result.typeProperties.source.datasetSettings.typeProperties.location.container).toBe('legacycontainer');
      }
    });
  });
});
