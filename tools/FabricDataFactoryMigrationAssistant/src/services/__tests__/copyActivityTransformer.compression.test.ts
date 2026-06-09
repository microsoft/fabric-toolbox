import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CopyActivityTransformer } from '../copyActivityTransformer';
import * as adfParserService from '../adfParserService';

describe('CopyActivityTransformer - Compression Property Support', () => {
  let transformer: CopyActivityTransformer;

  beforeEach(() => {
    transformer = new CopyActivityTransformer();
    vi.clearAllMocks();
  });

  describe('JSON Dataset with Compression', () => {
    it('should preserve compression object in JSON dataset typeProperties', () => {
      // Arrange
      const activity = {
        name: 'CopyActivity1',
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
              type: 'AzureBlobFSWriteSettings'
            }
          }
        }
      };

      const sourceDataset = {
        name: 'SourceDataset',
        properties: {
          type: 'Json',
          linkedServiceName: {
            referenceName: 'AzureDataLakeStorage1',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            location: {
              type: 'AzureBlobFSLocation',
              fileName: 'data.json',
              folderPath: 'input',
              fileSystem: 'container1'
            },
            encodingName: 'UTF-8',
            compression: {
              type: 'gzip',
              level: 'Optimal'
            }
          }
        }
      };

      const sinkDataset = {
        name: 'SinkDataset',
        properties: {
          type: 'Json',
          linkedServiceName: {
            referenceName: 'AzureDataLakeStorage2',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            location: {
              type: 'AzureBlobFSLocation',
              fileName: 'output.json',
              folderPath: 'output',
              fileSystem: 'container2'
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        source: {
          datasetComponent: sourceDataset,
          connectionId: 'conn-source'
        },
        sink: {
          datasetComponent: sinkDataset,
          connectionId: 'conn-sink'
        }
      });

      // Act
      const result = transformer.transformCopyActivity(activity, {}, []);

      // Assert
      expect(result.typeProperties.source.datasetSettings.typeProperties.compression).toEqual({
        type: 'gzip',
        level: 'Optimal'
      });
      expect(result.typeProperties.source.datasetSettings.typeProperties.encodingName).toBe('UTF-8');
    });

    it('should not add compression property if it does not exist in JSON dataset', () => {
      // Arrange
      const activity = {
        name: 'CopyActivity1',
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
              type: 'AzureBlobFSWriteSettings'
            }
          }
        }
      };

      const sourceDataset = {
        name: 'SourceDataset',
        properties: {
          type: 'Json',
          linkedServiceName: {
            referenceName: 'AzureDataLakeStorage1',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            location: {
              type: 'AzureBlobFSLocation',
              fileName: 'data.json',
              folderPath: 'input',
              fileSystem: 'container1'
            },
            encodingName: 'UTF-8'
          }
        }
      };

      const sinkDataset = {
        name: 'SinkDataset',
        properties: {
          type: 'Json',
          linkedServiceName: {
            referenceName: 'AzureDataLakeStorage2',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            location: {
              type: 'AzureBlobFSLocation',
              fileName: 'output.json',
              folderPath: 'output',
              fileSystem: 'container2'
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        source: {
          datasetComponent: sourceDataset,
          connectionId: 'conn-source'
        },
        sink: {
          datasetComponent: sinkDataset,
          connectionId: 'conn-sink'
        }
      });

      // Act
      const result = transformer.transformCopyActivity(activity, {}, []);

      // Assert
      expect(result.typeProperties.source.datasetSettings.typeProperties.compression).toBeUndefined();
      expect(result.typeProperties.source.datasetSettings.typeProperties.encodingName).toBe('UTF-8');
    });
  });

  describe('Parquet Dataset with Compression', () => {
    it('should preserve compression object in Parquet dataset typeProperties', () => {
      // Arrange
      const activity = {
        name: 'CopyActivity1',
        type: 'Copy',
        typeProperties: {
          source: {
            type: 'ParquetSource',
            storeSettings: {
              type: 'AzureBlobFSReadSettings'
            }
          },
          sink: {
            type: 'ParquetSink',
            storeSettings: {
              type: 'AzureBlobFSWriteSettings'
            }
          }
        }
      };

      const sourceDataset = {
        name: 'SourceDataset',
        properties: {
          type: 'Parquet',
          linkedServiceName: {
            referenceName: 'AzureDataLakeStorage1',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            location: {
              type: 'AzureBlobFSLocation',
              fileName: 'data.parquet',
              folderPath: 'input',
              fileSystem: 'container1'
            },
            compressionCodec: 'snappy',
            compression: {
              type: 'snappy',
              level: 'Fastest'
            }
          }
        }
      };

      const sinkDataset = {
        name: 'SinkDataset',
        properties: {
          type: 'Parquet',
          linkedServiceName: {
            referenceName: 'AzureDataLakeStorage2',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            location: {
              type: 'AzureBlobFSLocation',
              fileName: 'output.parquet',
              folderPath: 'output',
              fileSystem: 'container2'
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        source: {
          datasetComponent: sourceDataset,
          connectionId: 'conn-source'
        },
        sink: {
          datasetComponent: sinkDataset,
          connectionId: 'conn-sink'
        }
      });

      // Act
      const result = transformer.transformCopyActivity(activity, {}, []);

      // Assert
      expect(result.typeProperties.source.datasetSettings.typeProperties.compression).toEqual({
        type: 'snappy',
        level: 'Fastest'
      });
      expect(result.typeProperties.source.datasetSettings.typeProperties.compressionCodec).toBe('snappy');
    });

    it('should handle Parquet dataset with compressionCodec but no compression object', () => {
      // Arrange
      const activity = {
        name: 'CopyActivity1',
        type: 'Copy',
        typeProperties: {
          source: {
            type: 'ParquetSource',
            storeSettings: {
              type: 'AzureBlobFSReadSettings'
            }
          },
          sink: {
            type: 'ParquetSink',
            storeSettings: {
              type: 'AzureBlobFSWriteSettings'
            }
          }
        }
      };

      const sourceDataset = {
        name: 'SourceDataset',
        properties: {
          type: 'Parquet',
          linkedServiceName: {
            referenceName: 'AzureDataLakeStorage1',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            location: {
              type: 'AzureBlobFSLocation',
              fileName: 'data.parquet',
              folderPath: 'input',
              fileSystem: 'container1'
            },
            compressionCodec: 'gzip'
          }
        }
      };

      const sinkDataset = {
        name: 'SinkDataset',
        properties: {
          type: 'Parquet',
          linkedServiceName: {
            referenceName: 'AzureDataLakeStorage2',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            location: {
              type: 'AzureBlobFSLocation',
              fileName: 'output.parquet',
              folderPath: 'output',
              fileSystem: 'container2'
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        source: {
          datasetComponent: sourceDataset,
          connectionId: 'conn-source'
        },
        sink: {
          datasetComponent: sinkDataset,
          connectionId: 'conn-sink'
        }
      });

      // Act
      const result = transformer.transformCopyActivity(activity, {}, []);

      // Assert
      expect(result.typeProperties.source.datasetSettings.typeProperties.compression).toBeUndefined();
      expect(result.typeProperties.source.datasetSettings.typeProperties.compressionCodec).toBe('gzip');
    });
  });

  describe('DelimitedText Dataset with Compression', () => {
    it('should preserve compression object in DelimitedText dataset typeProperties', () => {
      // Arrange
      const activity = {
        name: 'CopyActivity1',
        type: 'Copy',
        typeProperties: {
          source: {
            type: 'DelimitedTextSource',
            storeSettings: {
              type: 'AzureBlobStorageReadSettings'
            }
          },
          sink: {
            type: 'DelimitedTextSink',
            storeSettings: {
              type: 'AzureBlobStorageWriteSettings'
            }
          }
        }
      };

      const sourceDataset = {
        name: 'SourceDataset',
        properties: {
          type: 'DelimitedText',
          linkedServiceName: {
            referenceName: 'AzureBlobStorage1',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            location: {
              type: 'AzureBlobStorageLocation',
              fileName: 'data.csv',
              folderPath: 'input',
              container: 'container1'
            },
            columnDelimiter: ',',
            escapeChar: '\\',
            firstRowAsHeader: true,
            quoteChar: '"',
            compression: {
              type: 'bzip2',
              level: 'Optimal'
            }
          }
        }
      };

      const sinkDataset = {
        name: 'SinkDataset',
        properties: {
          type: 'DelimitedText',
          linkedServiceName: {
            referenceName: 'AzureBlobStorage2',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            location: {
              type: 'AzureBlobStorageLocation',
              fileName: 'output.csv',
              folderPath: 'output',
              container: 'container2'
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        source: {
          datasetComponent: sourceDataset,
          connectionId: 'conn-source'
        },
        sink: {
          datasetComponent: sinkDataset,
          connectionId: 'conn-sink'
        }
      });

      // Act
      const result = transformer.transformCopyActivity(activity, {}, []);

      // Assert
      expect(result.typeProperties.source.datasetSettings.typeProperties.compression).toEqual({
        type: 'bzip2',
        level: 'Optimal'
      });
      expect(result.typeProperties.source.datasetSettings.typeProperties.columnDelimiter).toBe(',');
      expect(result.typeProperties.source.datasetSettings.typeProperties.firstRowAsHeader).toBe(true);
    });

    it('should handle null compression in DelimitedText dataset', () => {
      // Arrange
      const activity = {
        name: 'CopyActivity1',
        type: 'Copy',
        typeProperties: {
          source: {
            type: 'DelimitedTextSource',
            storeSettings: {
              type: 'AzureBlobStorageReadSettings'
            }
          },
          sink: {
            type: 'DelimitedTextSink',
            storeSettings: {
              type: 'AzureBlobStorageWriteSettings'
            }
          }
        }
      };

      const sourceDataset = {
        name: 'SourceDataset',
        properties: {
          type: 'DelimitedText',
          linkedServiceName: {
            referenceName: 'AzureBlobStorage1',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            location: {
              type: 'AzureBlobStorageLocation',
              fileName: 'data.csv',
              folderPath: 'input',
              container: 'container1'
            },
            columnDelimiter: ',',
            compression: null
          }
        }
      };

      const sinkDataset = {
        name: 'SinkDataset',
        properties: {
          type: 'DelimitedText',
          linkedServiceName: {
            referenceName: 'AzureBlobStorage2',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            location: {
              type: 'AzureBlobStorageLocation',
              fileName: 'output.csv',
              folderPath: 'output',
              container: 'container2'
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        source: {
          datasetComponent: sourceDataset,
          connectionId: 'conn-source'
        },
        sink: {
          datasetComponent: sinkDataset,
          connectionId: 'conn-sink'
        }
      });

      // Act
      const result = transformer.transformCopyActivity(activity, {}, []);

      // Assert
      expect(result.typeProperties.source.datasetSettings.typeProperties.compression).toBeNull();
    });
  });

  describe('Blob Dataset with Compression', () => {
    it('should preserve compression object in Blob dataset typeProperties', () => {
      // Arrange
      const activity = {
        name: 'CopyActivity1',
        type: 'Copy',
        typeProperties: {
          source: {
            type: 'BlobSource',
            storeSettings: {
              type: 'AzureBlobStorageReadSettings'
            }
          },
          sink: {
            type: 'BlobSink',
            storeSettings: {
              type: 'AzureBlobStorageWriteSettings'
            }
          }
        }
      };

      const sourceDataset = {
        name: 'SourceDataset',
        properties: {
          type: 'AzureBlob',
          linkedServiceName: {
            referenceName: 'AzureBlobStorage1',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            location: {
              type: 'AzureBlobStorageLocation',
              fileName: 'data.bin',
              folderPath: 'input',
              container: 'container1'
            },
            compression: {
              type: 'deflate',
              level: 'Fastest'
            }
          }
        }
      };

      const sinkDataset = {
        name: 'SinkDataset',
        properties: {
          type: 'AzureBlob',
          linkedServiceName: {
            referenceName: 'AzureBlobStorage2',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            location: {
              type: 'AzureBlobStorageLocation',
              fileName: 'output.bin',
              folderPath: 'output',
              container: 'container2'
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        source: {
          datasetComponent: sourceDataset,
          connectionId: 'conn-source'
        },
        sink: {
          datasetComponent: sinkDataset,
          connectionId: 'conn-sink'
        }
      });

      // Act
      const result = transformer.transformCopyActivity(activity, {}, []);

      // Assert
      expect(result.typeProperties.source.datasetSettings.typeProperties.compression).toEqual({
        type: 'deflate',
        level: 'Fastest'
      });
    });
  });

  describe('Mixed Scenarios', () => {
    it('should handle source with compression and sink without compression', () => {
      // Arrange
      const activity = {
        name: 'CopyActivity1',
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
              type: 'AzureBlobFSWriteSettings'
            }
          }
        }
      };

      const sourceDataset = {
        name: 'SourceDataset',
        properties: {
          type: 'Json',
          linkedServiceName: {
            referenceName: 'AzureDataLakeStorage1',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            location: {
              type: 'AzureBlobFSLocation',
              fileName: 'data.json',
              folderPath: 'input',
              fileSystem: 'container1'
            },
            compression: {
              type: 'gzip',
              level: 'Optimal'
            }
          }
        }
      };

      const sinkDataset = {
        name: 'SinkDataset',
        properties: {
          type: 'Json',
          linkedServiceName: {
            referenceName: 'AzureDataLakeStorage2',
            type: 'LinkedServiceReference'
          },
          typeProperties: {
            location: {
              type: 'AzureBlobFSLocation',
              fileName: 'output.json',
              folderPath: 'output',
              fileSystem: 'container2'
            }
          }
        }
      };

      vi.spyOn(adfParserService, 'getCopyActivityDatasetMappings').mockReturnValue({
        source: {
          datasetComponent: sourceDataset,
          connectionId: 'conn-source'
        },
        sink: {
          datasetComponent: sinkDataset,
          connectionId: 'conn-sink'
        }
      });

      // Act
      const result = transformer.transformCopyActivity(activity, {}, []);

      // Assert
      expect(result.typeProperties.source.datasetSettings.typeProperties.compression).toEqual({
        type: 'gzip',
        level: 'Optimal'
      });
      expect(result.typeProperties.sink.datasetSettings.typeProperties.compression).toBeUndefined();
    });
  });
});
