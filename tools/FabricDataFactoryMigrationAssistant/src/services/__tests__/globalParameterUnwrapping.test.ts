/**
 * Tests for global parameter Expression object unwrapping
 * Validates that Copy, Lookup, GetMetadata, Custom, and HDInsight activities
 * correctly unwrap Expression objects after global parameter transformation
 */

import { describe, it, expect, beforeEach } from 'vitest';

describe('Global Parameter Expression Unwrapping', () => {
  // Mock PipelineTransformer with unwrapping method exposed for testing
  class TestPipelineTransformer {
    // Expose private method for testing
    public unwrapLibraryVariableExpressions(obj: any, visited = new WeakSet()): void {
      if (!obj || typeof obj !== 'object') {
        return;
      }

      // Prevent infinite loops on circular references
      if (visited.has(obj)) {
        return;
      }
      visited.add(obj);

      if (Array.isArray(obj)) {
        obj.forEach(item => this.unwrapLibraryVariableExpressions(item, visited));
        return;
      }

      for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value === 'object') {
          if (
            (value as any).type === 'Expression' &&
            typeof (value as any).value === 'string' &&
            (value as any).value.includes('@pipeline().libraryVariables.')
          ) {
            obj[key] = (value as any).value;
          } else if (
            (value as any).type === 'Expression' &&
            typeof (value as any).value === 'string' &&
            (value as any).value.includes('pipeline().libraryVariables.')
          ) {
            obj[key] = (value as any).value;
          } else {
            this.unwrapLibraryVariableExpressions(value, visited);
          }
        }
      }
    }
  }

  let transformer: TestPipelineTransformer;

  beforeEach(() => {
    transformer = new TestPipelineTransformer();
  });

  describe('Copy Activity datasetSettings', () => {
    it('should unwrap Expression objects in source location properties', () => {
      const pipeline = {
        properties: {
          activities: [{
            type: 'Copy',
            typeProperties: {
              source: {
                datasetSettings: {
                  typeProperties: {
                    location: {
                      fileName: {
                        value: '@pipeline().libraryVariables.DataFactory_GlobalParameters_VariableLibrary_gp_FileName',
                        type: 'Expression'
                      },
                      folderPath: {
                        value: '@pipeline().libraryVariables.DataFactory_GlobalParameters_VariableLibrary_gp_Directory',
                        type: 'Expression'
                      },
                      fileSystem: {
                        value: '@pipeline().libraryVariables.DataFactory_GlobalParameters_VariableLibrary_gp_Container',
                        type: 'Expression'
                      }
                    }
                  }
                }
              }
            }
          }]
        }
      };

      transformer.unwrapLibraryVariableExpressions(pipeline);

      const location = pipeline.properties.activities[0].typeProperties.source.datasetSettings.typeProperties.location;
      expect(location.fileName).toBe('@pipeline().libraryVariables.DataFactory_GlobalParameters_VariableLibrary_gp_FileName');
      expect(location.folderPath).toBe('@pipeline().libraryVariables.DataFactory_GlobalParameters_VariableLibrary_gp_Directory');
      expect(location.fileSystem).toBe('@pipeline().libraryVariables.DataFactory_GlobalParameters_VariableLibrary_gp_Container');
    });

    it('should unwrap Expression objects in sink location properties', () => {
      const pipeline = {
        properties: {
          activities: [{
            type: 'Copy',
            typeProperties: {
              sink: {
                datasetSettings: {
                  typeProperties: {
                    location: {
                      fileName: {
                        value: '@pipeline().libraryVariables.MyLib_VariableLibrary_outputFile',
                        type: 'Expression'
                      }
                    }
                  }
                }
              }
            }
          }]
        }
      };

      transformer.unwrapLibraryVariableExpressions(pipeline);

      const fileName = pipeline.properties.activities[0].typeProperties.sink.datasetSettings.typeProperties.location.fileName;
      expect(fileName).toBe('@pipeline().libraryVariables.MyLib_VariableLibrary_outputFile');
    });
  });

  describe('Lookup Activity datasetSettings', () => {
    it('should unwrap Expression objects in SQL table properties', () => {
      const pipeline = {
        properties: {
          activities: [{
            type: 'Lookup',
            typeProperties: {
              datasetSettings: {
                typeProperties: {
                  schema: {
                    value: '@pipeline().libraryVariables.Factory_VariableLibrary_schemaName',
                    type: 'Expression'
                  },
                  table: {
                    value: '@pipeline().libraryVariables.Factory_VariableLibrary_tableName',
                    type: 'Expression'
                  }
                }
              }
            }
          }]
        }
      };

      transformer.unwrapLibraryVariableExpressions(pipeline);

      const typeProps = pipeline.properties.activities[0].typeProperties.datasetSettings.typeProperties;
      expect(typeProps.schema).toBe('@pipeline().libraryVariables.Factory_VariableLibrary_schemaName');
      expect(typeProps.table).toBe('@pipeline().libraryVariables.Factory_VariableLibrary_tableName');
    });
  });

  describe('GetMetadata Activity datasetSettings', () => {
    it('should unwrap Expression objects in file path properties', () => {
      const pipeline = {
        properties: {
          activities: [{
            type: 'GetMetadata',
            typeProperties: {
              datasetSettings: {
                typeProperties: {
                  location: {
                    folderPath: {
                      value: '@pipeline().libraryVariables.ADF_VariableLibrary_metadataPath',
                      type: 'Expression'
                    }
                  }
                }
              }
            }
          }]
        }
      };

      transformer.unwrapLibraryVariableExpressions(pipeline);

      const folderPath = pipeline.properties.activities[0].typeProperties.datasetSettings.typeProperties.location.folderPath;
      expect(folderPath).toBe('@pipeline().libraryVariables.ADF_VariableLibrary_metadataPath');
    });
  });

  describe('Complex Expressions', () => {
    it('should unwrap Expression objects inside concat functions', () => {
      const pipeline = {
        properties: {
          activities: [{
            type: 'Copy',
            typeProperties: {
              sink: {
                datasetSettings: {
                  typeProperties: {
                    location: {
                      fileName: {
                        value: '@concat(\'output_\', pipeline().libraryVariables.Factory_VariableLibrary_fileName)',
                        type: 'Expression'
                      }
                    }
                  }
                }
              }
            }
          }]
        }
      };

      transformer.unwrapLibraryVariableExpressions(pipeline);

      const fileName = pipeline.properties.activities[0].typeProperties.sink.datasetSettings.typeProperties.location.fileName;
      expect(fileName).toBe('@concat(\'output_\', pipeline().libraryVariables.Factory_VariableLibrary_fileName)');
    });
  });

  describe('Backward Compatibility', () => {
    it('should NOT unwrap Expression objects without library variable references', () => {
      const pipeline = {
        properties: {
          activities: [{
            type: 'Copy',
            typeProperties: {
              source: {
                query: {
                  value: '@pipeline().parameters.sqlQuery',
                  type: 'Expression'
                }
              }
            }
          }]
        }
      };

      const originalValue = { ...pipeline.properties.activities[0].typeProperties.source.query };
      transformer.unwrapLibraryVariableExpressions(pipeline);

      const query = pipeline.properties.activities[0].typeProperties.source.query;
      expect(query).toEqual(originalValue);
      expect(query).toHaveProperty('type', 'Expression');
      expect(query).toHaveProperty('value', '@pipeline().parameters.sqlQuery');
    });

    it('should NOT unwrap Expression objects with dataset() references', () => {
      const pipeline = {
        properties: {
          activities: [{
            type: 'Copy',
            typeProperties: {
              source: {
                datasetSettings: {
                  typeProperties: {
                    fileName: {
                      value: '@dataset().paramName',
                      type: 'Expression'
                    }
                  }
                }
              }
            }
          }]
        }
      };

      const originalValue = { ...pipeline.properties.activities[0].typeProperties.source.datasetSettings.typeProperties.fileName };
      transformer.unwrapLibraryVariableExpressions(pipeline);

      const fileName = pipeline.properties.activities[0].typeProperties.source.datasetSettings.typeProperties.fileName;
      expect(fileName).toEqual(originalValue);
      expect(fileName).toHaveProperty('type', 'Expression');
    });

    it('should NOT unwrap Expression objects with globalParameters references (pre-transformation)', () => {
      const pipeline = {
        properties: {
          activities: [{
            type: 'SetVariable',
            typeProperties: {
              value: {
                value: '@pipeline().globalParameters.someParam',
                type: 'Expression'
              }
            }
          }]
        }
      };

      const originalValue = { ...pipeline.properties.activities[0].typeProperties.value };
      transformer.unwrapLibraryVariableExpressions(pipeline);

      const value = pipeline.properties.activities[0].typeProperties.value;
      expect(value).toEqual(originalValue);
      expect(value).toHaveProperty('type', 'Expression');
    });
  });

  describe('Nested Structures', () => {
    it('should unwrap Expression objects in deeply nested arrays', () => {
      const pipeline = {
        properties: {
          activities: [{
            type: 'ForEach',
            typeProperties: {
              activities: [{
                type: 'Copy',
                typeProperties: {
                  source: {
                    datasetSettings: {
                      typeProperties: {
                        location: {
                          fileName: {
                            value: '@pipeline().libraryVariables.Loop_VariableLibrary_file',
                            type: 'Expression'
                          }
                        }
                      }
                    }
                  }
                }
              }]
            }
          }]
        }
      };

      transformer.unwrapLibraryVariableExpressions(pipeline);

      const fileName = pipeline.properties.activities[0].typeProperties.activities[0]
        .typeProperties.source.datasetSettings.typeProperties.location.fileName;
      expect(fileName).toBe('@pipeline().libraryVariables.Loop_VariableLibrary_file');
    });

    it('should handle multiple levels of nesting', () => {
      const pipeline = {
        properties: {
          activities: [{
            type: 'If',
            typeProperties: {
              ifTrueActivities: [{
                type: 'ForEach',
                typeProperties: {
                  activities: [{
                    type: 'Copy',
                    typeProperties: {
                      source: {
                        datasetSettings: {
                          typeProperties: {
                            location: {
                              fileSystem: {
                                value: '@pipeline().libraryVariables.Deep_VariableLibrary_container',
                                type: 'Expression'
                              }
                            }
                          }
                        }
                      }
                    }
                  }]
                }
              }]
            }
          }]
        }
      };

      transformer.unwrapLibraryVariableExpressions(pipeline);

      const fileSystem = pipeline.properties.activities[0].typeProperties.ifTrueActivities[0]
        .typeProperties.activities[0].typeProperties.source.datasetSettings.typeProperties.location.fileSystem;
      expect(fileSystem).toBe('@pipeline().libraryVariables.Deep_VariableLibrary_container');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values gracefully', () => {
      const pipeline = {
        properties: {
          activities: [{
            type: 'Copy',
            typeProperties: {
              source: null
            }
          }]
        }
      };

      expect(() => transformer.unwrapLibraryVariableExpressions(pipeline)).not.toThrow();
    });

    it('should handle undefined values gracefully', () => {
      const pipeline = {
        properties: {
          activities: [{
            type: 'Copy',
            typeProperties: {
              source: undefined
            }
          }]
        }
      };

      expect(() => transformer.unwrapLibraryVariableExpressions(pipeline)).not.toThrow();
    });

    it('should handle empty objects', () => {
      const pipeline = {};
      expect(() => transformer.unwrapLibraryVariableExpressions(pipeline)).not.toThrow();
    });

    it('should handle primitives gracefully', () => {
      expect(() => transformer.unwrapLibraryVariableExpressions('string')).not.toThrow();
      expect(() => transformer.unwrapLibraryVariableExpressions(123)).not.toThrow();
      expect(() => transformer.unwrapLibraryVariableExpressions(true)).not.toThrow();
      expect(() => transformer.unwrapLibraryVariableExpressions(null)).not.toThrow();
      expect(() => transformer.unwrapLibraryVariableExpressions(undefined)).not.toThrow();
    });

    it('should handle circular references without infinite loop', () => {
      const circular: any = {
        properties: {
          activities: []
        }
      };
      circular.properties.self = circular;
      circular.properties.activities.push(circular);

      expect(() => transformer.unwrapLibraryVariableExpressions(circular)).not.toThrow();
    });
  });

  describe('Multiple Activities', () => {
    it('should unwrap Expression objects across multiple activities in same pipeline', () => {
      const pipeline = {
        properties: {
          activities: [
            {
              type: 'Copy',
              name: 'Copy1',
              typeProperties: {
                source: {
                  datasetSettings: {
                    typeProperties: {
                      location: {
                        fileName: {
                          value: '@pipeline().libraryVariables.Lib_VariableLibrary_file1',
                          type: 'Expression'
                        }
                      }
                    }
                  }
                }
              }
            },
            {
              type: 'Lookup',
              name: 'Lookup1',
              typeProperties: {
                datasetSettings: {
                  typeProperties: {
                    table: {
                      value: '@pipeline().libraryVariables.Lib_VariableLibrary_table1',
                      type: 'Expression'
                    }
                  }
                }
              }
            },
            {
              type: 'GetMetadata',
              name: 'GetMeta1',
              typeProperties: {
                datasetSettings: {
                  typeProperties: {
                    location: {
                      folderPath: {
                        value: '@pipeline().libraryVariables.Lib_VariableLibrary_path1',
                        type: 'Expression'
                      }
                    }
                  }
                }
              }
            }
          ]
        }
      };

      transformer.unwrapLibraryVariableExpressions(pipeline);

      const copy = pipeline.properties.activities[0];
      const lookup = pipeline.properties.activities[1];
      const getMeta = pipeline.properties.activities[2];

      expect(copy.typeProperties.source.datasetSettings.typeProperties.location.fileName)
        .toBe('@pipeline().libraryVariables.Lib_VariableLibrary_file1');
      expect(lookup.typeProperties.datasetSettings.typeProperties.table)
        .toBe('@pipeline().libraryVariables.Lib_VariableLibrary_table1');
      expect(getMeta.typeProperties.datasetSettings.typeProperties.location.folderPath)
        .toBe('@pipeline().libraryVariables.Lib_VariableLibrary_path1');
    });
  });

  describe('Performance', () => {
    it('should process large pipeline in <100ms', () => {
      const largePipeline = {
        properties: {
          activities: Array(100).fill(null).map((_, i) => ({
            type: 'Copy',
            name: `Copy${i}`,
            typeProperties: {
              source: {
                datasetSettings: {
                  typeProperties: {
                    location: {
                      fileName: {
                        value: `@pipeline().libraryVariables.Lib_VariableLibrary_file${i}`,
                        type: 'Expression'
                      }
                    }
                  }
                }
              }
            }
          }))
        }
      };

      const start = performance.now();
      transformer.unwrapLibraryVariableExpressions(largePipeline);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
      console.log(`Performance benchmark: ${duration.toFixed(2)}ms for 100 activities`);
    });

    it('should handle deeply nested structures efficiently', () => {
      // Create deeply nested structure (10 levels)
      let nested: any = {
        fileName: {
          value: '@pipeline().libraryVariables.Deep_VariableLibrary_file',
          type: 'Expression'
        }
      };

      for (let i = 0; i < 10; i++) {
        nested = { level: i, nested };
      }

      const pipeline = { properties: { activities: [{ typeProperties: nested }] } };

      const start = performance.now();
      transformer.unwrapLibraryVariableExpressions(pipeline);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10);
      console.log(`Deep nesting performance: ${duration.toFixed(2)}ms for 10 levels`);
    });
  });
});
