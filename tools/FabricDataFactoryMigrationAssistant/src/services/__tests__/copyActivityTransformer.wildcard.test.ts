import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CopyActivityTransformer } from '../copyActivityTransformer';
import { adfParserService } from '../adfParserService';

describe('CopyActivityTransformer - Wildcard Path FileSystem Fix', () => {
  let transformer: CopyActivityTransformer;

  beforeEach(() => {
    transformer = new CopyActivityTransformer();
    vi.clearAllMocks();
  });

  describe('Wildcard Path Detection', () => {
    it('should detect wildcardFolderPath in source storeSettings', () => {
      const mockActivity = {
        name: 'Copy data1',
        type: 'Copy',
        typeProperties: {
          source: {
            type: 'JsonSource',
            storeSettings: {
              type: 'AzureBlobFSReadSettings',
              recursive: true,
              wildcardFolderPath: '@pipeline().globalParameters.gp_Directory',
              wildcardFileName: '*json',
              enablePartitionDiscovery: false
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
              p_container: '@pipeline().globalParameters.gp_Container',
              p_directory: '@pipeline().globalParameters.gp_Directory',
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
              p_container: { type: 'string' },
              p_directory: { type: 'string' },
              p_fileName: { type: 'string' }
            },
            typeProperties: {
              location: {
                type: 'AzureBlobFSLocation',
                fileName: { value: '@dataset().p_fileName', type: 'Expression' },
                folderPath: { value: '@dataset().p_directory', type: 'Expression' },
                fileSystem: { value: '@dataset().p_container', type: 'Expression' }
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        source: {
          datasetComponent: mockDataset,
          connectionId: 'test-connection'
        },
        sink: {
          datasetComponent: mockDataset,
          connectionId: 'test-connection'
        }
      });

      const result = transformer.transformCopyActivity(mockActivity, {}, []);

      expect(result.typeProperties.source.datasetSettings).toBeDefined();
      expect(result.typeProperties.source.datasetSettings.typeProperties).toBeDefined();
      expect(result.typeProperties.source.datasetSettings.typeProperties.location).toBeDefined();
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBeDefined();
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('@pipeline().globalParameters.gp_Container');
    });

    it('should detect wildcardFileName in source storeSettings', () => {
      const mockActivity = {
        name: 'Copy data2',
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
            referenceName: 'Parquet1',
            type: 'DatasetReference',
            parameters: {
              p_container: 'raw'
            }
          }
        ],
        outputs: [
          {
            referenceName: 'Parquet1',
            type: 'DatasetReference',
            parameters: {
              p_container: 'processed'
            }
          }
        ]
      };

      const mockDataset = {
        name: 'Parquet1',
        definition: {
          properties: {
            type: 'Parquet',
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
        source: {
          datasetComponent: mockDataset,
          connectionId: 'test-connection'
        },
        sink: {
          datasetComponent: mockDataset,
          connectionId: 'test-connection'
        }
      });

      const result = transformer.transformCopyActivity(mockActivity, {}, []);

      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('raw');
    });

    it('should handle hardcoded fileSystem in dataset', () => {
      const mockActivity = {
        name: 'Copy data3',
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
                type: 'AzureBlobFSLocation',
                fileSystem: 'mycontainer'
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        source: {
          datasetComponent: mockDataset,
          connectionId: 'test-connection'
        },
        sink: {
          datasetComponent: mockDataset,
          connectionId: 'test-connection'
        }
      });

      const result = transformer.transformCopyActivity(mockActivity, {}, []);

      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('mycontainer');
    });

    it('should not add fileSystem when no wildcards are present', () => {
      const mockActivity = {
        name: 'Copy data4',
        type: 'Copy',
        typeProperties: {
          source: {
            type: 'JsonSource',
            storeSettings: {
              type: 'AzureBlobFSReadSettings',
              recursive: true
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
              p_container: 'mycontainer',
              p_directory: 'mydir',
              p_fileName: 'file.json'
            }
          }
        ],
        outputs: [
          {
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: {
              p_container: 'output',
              p_directory: 'results',
              p_fileName: 'output.json'
            }
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
              p_container: { type: 'string' },
              p_directory: { type: 'string' },
              p_fileName: { type: 'string' }
            },
            typeProperties: {
              location: {
                type: 'AzureBlobFSLocation',
                fileName: { value: '@dataset().p_fileName', type: 'Expression' },
                folderPath: { value: '@dataset().p_directory', type: 'Expression' },
                fileSystem: { value: '@dataset().p_container', type: 'Expression' }
              }
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        source: {
          datasetComponent: mockDataset,
          connectionId: 'test-connection'
        },
        sink: {
          datasetComponent: mockDataset,
          connectionId: 'test-connection'
        }
      });

      const result = transformer.transformCopyActivity(mockActivity, {}, []);

      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('mycontainer');
    });

    it('should handle global parameter expressions in fileSystem', () => {
      const mockActivity = {
        name: 'Copy data5',
        type: 'Copy',
        typeProperties: {
          source: {
            type: 'JsonSource',
            storeSettings: {
              type: 'AzureBlobFSReadSettings',
              wildcardFolderPath: { value: '@pipeline().globalParameters.gp_Directory', type: 'Expression' },
              wildcardFileName: '*json'
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
              p_container: { value: '@pipeline().globalParameters.gp_Container', type: 'Expression' }
            }
          }
        ],
        outputs: [
          {
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: {
              p_container: 'output'
            }
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
        source: {
          datasetComponent: mockDataset,
          connectionId: 'test-connection'
        },
        sink: {
          datasetComponent: mockDataset,
          connectionId: 'test-connection'
        }
      });

      const result = transformer.transformCopyActivity(mockActivity, {}, []);

      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('@pipeline().globalParameters.gp_Container');
    });

    it('should handle wildcards in sink storeSettings', () => {
      const mockActivity = {
        name: 'Copy data6',
        type: 'Copy',
        typeProperties: {
          source: {
            type: 'JsonSource',
            storeSettings: {
              type: 'AzureBlobFSReadSettings'
            }
          },
          sink: {
            type: 'JsonSink',
            storeSettings: {
              type: 'AzureBlobFSWriteSettings',
              wildcardFolderPath: 'archive/*',
              wildcardFileName: '*.json'
            }
          }
        },
        inputs: [
          {
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: {
              p_container: 'source'
            }
          }
        ],
        outputs: [
          {
            referenceName: 'Json1',
            type: 'DatasetReference',
            parameters: {
              p_container: 'destination'
            }
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
        source: {
          datasetComponent: mockDataset,
          connectionId: 'test-connection'
        },
        sink: {
          datasetComponent: mockDataset,
          connectionId: 'test-connection'
        }
      });

      const result = transformer.transformCopyActivity(mockActivity, {}, []);

      expect(result.typeProperties.sink.datasetSettings.typeProperties.location.fileSystem).toBe('destination');
    });

    it('should handle container property instead of fileSystem', () => {
      const mockActivity = {
        name: 'Copy data7',
        type: 'Copy',
        typeProperties: {
          source: {
            type: 'DelimitedTextSource',
            storeSettings: {
              type: 'AzureBlobStorageReadSettings',
              wildcardFileName: '*.csv'
            }
          },
          sink: {
            type: 'DelimitedTextSink',
            storeSettings: {
              type: 'AzureBlobStorageWriteSettings'
            }
          }
        },
        inputs: [
          {
            referenceName: 'DelimitedText1',
            type: 'DatasetReference',
            parameters: {
              p_container: 'rawdata'
            }
          }
        ],
        outputs: [
          {
            referenceName: 'DelimitedText1',
            type: 'DatasetReference',
            parameters: {
              p_container: 'processed'
            }
          }
        ]
      };

      const mockDataset = {
        name: 'DelimitedText1',
        definition: {
          properties: {
            type: 'DelimitedText',
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
        source: {
          datasetComponent: mockDataset,
          connectionId: 'test-connection'
        },
        sink: {
          datasetComponent: mockDataset,
          connectionId: 'test-connection'
        }
      });

      const result = transformer.transformCopyActivity(mockActivity, {}, []);

      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('rawdata');
    });
  });
});


