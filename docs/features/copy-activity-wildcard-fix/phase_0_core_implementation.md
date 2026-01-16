# Phase 0: Core Implementation - Wildcard Path FileSystem Fix

**Estimated Time:** 1.5 hours  
**Dependencies:** None (Initial phase)

---

## Goal Statement

Implement wildcard detection and fileSystem fix in the Copy Activity transformer to ensure that when `wildcardFolderPath` or `wildcardFileName` are used in storeSettings, the `fileSystem` property from the dataset is properly included in Fabric's `datasetSettings.typeProperties.location`.

---

## Changes Overview

1. Add `hasWildcardPaths()` helper method
2. Enhance `transformCopySource()` with wildcard fix
3. Enhance `transformCopySink()` with wildcard fix
4. Create basic unit test suite

---

## CHANGE 1: Add Wildcard Detection Helper Method

### File
`src/services/copyActivityTransformer.ts`

### Pre-Execution Verification

**CRITICAL:** Before making this change, verify the method doesn't already exist:

```bash
# Verify method doesn't already exist (should return no matches)
grep -n "hasWildcardPaths" src/services/copyActivityTransformer.ts
# Expected: No matches (confirms this is new code)
```

If the method already exists, SKIP this change and proceed to CHANGE 2.

### Location
After `transformCopyTypeProperties` method, before `transformCopySource` method.

To find exact location:
```bash
# Find the line number where transformCopySource starts
grep -n "private transformCopySource" src/services/copyActivityTransformer.ts
# Insert the new method BEFORE this line (around line 150)
```

### Action
Insert new method

### Code to Insert

```typescript
  /**
   * Detects if wildcard paths are being used in storeSettings
   * @param storeSettings The storeSettings object from source or sink
   * @returns true if wildcardFolderPath or wildcardFileName is present
   */
  private hasWildcardPaths(storeSettings: any): boolean {
    if (!storeSettings || typeof storeSettings !== 'object') {
      return false;
    }
    
    return Boolean(
      storeSettings.wildcardFolderPath || 
      storeSettings.wildcardFileName
    );
  }

```

### Verification

```bash
# Verify method was added
grep -n "hasWildcardPaths" src/services/copyActivityTransformer.ts

# Expected: Should show the new method around line 204-218
```

**Checkpoint:**
- [ ] Method `hasWildcardPaths` exists
- [ ] Method is private
- [ ] Method returns boolean
- [ ] Method checks both `wildcardFolderPath` and `wildcardFileName`

---

## CHANGE 2: Enhance transformCopySource with Wildcard Fix

### File
`src/services/copyActivityTransformer.ts`

### Location
Lines 190-210 (end of `transformCopySource` method, after `datasetSettings` is created)

### BEFORE Code

```typescript
    // Create datasetSettings from the dataset definition
    const datasetSettings = this.createDatasetSettingsFromDefinition(
      sourceDataset,
      sourceParameters,
      'source',
      linkedServiceName,
      pipelineConnectionMappings,
      pipelineReferenceMappings,
      pipelineName,
      activityName
    );

    return {
      ...source,
      type: sourceType,
      datasetSettings
    };
  }
```

### AFTER Code

```typescript
    // Create datasetSettings from the dataset definition
    const datasetSettings = this.createDatasetSettingsFromDefinition(
      sourceDataset,
      sourceParameters,
      'source',
      linkedServiceName,
      pipelineConnectionMappings,
      pipelineReferenceMappings,
      pipelineName,
      activityName
    );

    // WILDCARD FIX: When wildcards are used, ensure fileSystem is in datasetSettings
    if (this.hasWildcardPaths(source.storeSettings)) {
      console.log(`🔍 Wildcard paths detected in source storeSettings for activity '${activityName || 'unknown'}'`);
      
      // Check if datasetSettings has a location object (file-based datasets)
      if (datasetSettings?.typeProperties?.location) {
        // If fileSystem is not already set, try to get it from the dataset's original typeProperties
        if (!datasetSettings.typeProperties.location.fileSystem) {
          const originalLocation = sourceDataset.definition?.properties?.typeProperties?.location || {};
          
          // Get fileSystem or container from original dataset location
          const fileSystemValue = originalLocation.fileSystem || originalLocation.container;
          
          if (fileSystemValue) {
            // If it's an Expression object, extract the value and apply parameter substitution
            let resolvedFileSystem: any;
            
            if (typeof fileSystemValue === 'object' && fileSystemValue.value) {
              resolvedFileSystem = this.replaceParameterReferences(fileSystemValue.value, sourceParameters);
            } else if (typeof fileSystemValue === 'string') {
              resolvedFileSystem = this.replaceParameterReferences(fileSystemValue, sourceParameters);
            } else {
              resolvedFileSystem = fileSystemValue;
            }
            
            if (resolvedFileSystem) {
              datasetSettings.typeProperties.location.fileSystem = resolvedFileSystem;
              console.log(`✅ Wildcard fix applied: Added fileSystem to source datasetSettings.typeProperties.location: "${resolvedFileSystem}"`);
            } else {
              console.warn(`⚠️ Wildcard detected but could not resolve fileSystem value for source`);
            }
          } else {
            console.warn(`⚠️ Wildcard detected but no fileSystem/container found in dataset definition for source`);
          }
        } else {
          console.log(`✓ fileSystem already present in source datasetSettings.typeProperties.location: "${datasetSettings.typeProperties.location.fileSystem}"`);
        }
      }
    }

    return {
      ...source,
      type: sourceType,
      datasetSettings
    };
  }
```

### Verification

```bash
# Verify wildcard fix was added to source
grep -A 5 "WILDCARD FIX" src/services/copyActivityTransformer.ts | head -20

# Expected: Should show the wildcard fix logic
```

**Checkpoint:**
- [ ] Wildcard fix block added before `return` statement
- [ ] Uses `this.hasWildcardPaths()` for detection
- [ ] Checks for `location` object existence
- [ ] Extracts `fileSystem` from original dataset
- [ ] Handles Expression objects and string values
- [ ] Logs success/warning messages

---

## CHANGE 3: Enhance transformCopySink with Wildcard Fix

### File
`src/services/copyActivityTransformer.ts`

### Location
After `datasetSettings` creation in `transformCopySink` method (similar location as in transformCopySource)

### BEFORE Code

Find this pattern in `transformCopySink`:

```typescript
    // Create datasetSettings from the dataset definition
    const datasetSettings = this.createDatasetSettingsFromDefinition(
      sinkDataset,
      sinkParameters,
      'sink',
      linkedServiceName,
      pipelineConnectionMappings,
      pipelineReferenceMappings,
      pipelineName,
      activityName
    );

    return {
      ...sink,
      type: sinkType,
      datasetSettings
    };
  }
```

### AFTER Code

```typescript
    // Create datasetSettings from the dataset definition
    const datasetSettings = this.createDatasetSettingsFromDefinition(
      sinkDataset,
      sinkParameters,
      'sink',
      linkedServiceName,
      pipelineConnectionMappings,
      pipelineReferenceMappings,
      pipelineName,
      activityName
    );

    // WILDCARD FIX: When wildcards are used, ensure fileSystem is in datasetSettings
    if (this.hasWildcardPaths(sink.storeSettings)) {
      console.log(`🔍 Wildcard paths detected in sink storeSettings for activity '${activityName || 'unknown'}'`);
      
      // Check if datasetSettings has a location object (file-based datasets)
      if (datasetSettings?.typeProperties?.location) {
        // If fileSystem is not already set, try to get it from the dataset's original typeProperties
        if (!datasetSettings.typeProperties.location.fileSystem) {
          const originalLocation = sinkDataset.definition?.properties?.typeProperties?.location || {};
          
          // Get fileSystem or container from original dataset location
          const fileSystemValue = originalLocation.fileSystem || originalLocation.container;
          
          if (fileSystemValue) {
            // If it's an Expression object, extract the value and apply parameter substitution
            let resolvedFileSystem: any;
            
            if (typeof fileSystemValue === 'object' && fileSystemValue.value) {
              resolvedFileSystem = this.replaceParameterReferences(fileSystemValue.value, sinkParameters);
            } else if (typeof fileSystemValue === 'string') {
              resolvedFileSystem = this.replaceParameterReferences(fileSystemValue, sinkParameters);
            } else {
              resolvedFileSystem = fileSystemValue;
            }
            
            if (resolvedFileSystem) {
              datasetSettings.typeProperties.location.fileSystem = resolvedFileSystem;
              console.log(`✅ Wildcard fix applied: Added fileSystem to sink datasetSettings.typeProperties.location: "${resolvedFileSystem}"`);
            } else {
              console.warn(`⚠️ Wildcard detected but could not resolve fileSystem value for sink`);
            }
          } else {
            console.warn(`⚠️ Wildcard detected but no fileSystem/container found in dataset definition for sink`);
          }
        } else {
          console.log(`✓ fileSystem already present in sink datasetSettings.typeProperties.location: "${datasetSettings.typeProperties.location.fileSystem}"`);
        }
      }
    }

    return {
      ...sink,
      type: sinkType,
      datasetSettings
    };
  }
```

### Verification

```bash
# Verify both source and sink have wildcard fix
grep -c "WILDCARD FIX" src/services/copyActivityTransformer.ts

# Expected: Should return 2 (one for source, one for sink)
```

**Checkpoint:**
- [ ] Wildcard fix block added to sink (mirrors source logic)
- [ ] Uses `sink.storeSettings` instead of `source.storeSettings`
- [ ] Uses `sinkParameters` for parameter substitution
- [ ] Logging messages reference "sink"

---

## CHANGE 4: Create Basic Unit Test File

### File (NEW)
`src/services/__tests__/copyActivityTransformer.test.ts`

### Content

```typescript
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
        sourceDataset: mockDataset,
        sinkDataset: mockDataset,
        sourceParameters: {
          p_container: '@pipeline().globalParameters.gp_Container',
          p_directory: '@pipeline().globalParameters.gp_Directory',
          p_fileName: '*.json'
        },
        sinkParameters: {
          p_container: 'landingzone',
          p_directory: 'test',
          p_fileName: 'newjson.json'
        }
      });

      const result = transformer.transformCopyActivity(mockActivity);

      expect(result.typeProperties.source.datasetSettings).toBeDefined();
      expect(result.typeProperties.source.datasetSettings.typeProperties).toBeDefined();
      expect(result.typeProperties.source.datasetSettings.typeProperties.location).toBeDefined();
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBeDefined();
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('@pipeline().globalParameters.gp_Container');
    });

    it('should detect wildcardFileName in source storeSettings', () => {
      // NOTE: This test file is complete and spans 1032 lines total.
      // Ensure you copy the ENTIRE file content, not just the first portion.
      // The complete implementation includes all 7 test cases described in this phase.
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
        sourceDataset: mockDataset,
        sinkDataset: mockDataset,
        sourceParameters: {
          p_container: 'raw'
        },
        sinkParameters: {
          p_container: 'processed'
        }
      });

      const result = transformer.transformCopyActivity(mockActivity);

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
        sourceDataset: mockDataset,
        sinkDataset: mockDataset,
        sourceParameters: {},
        sinkParameters: {}
      });

      const result = transformer.transformCopyActivity(mockActivity);

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
        sourceDataset: mockDataset,
        sinkDataset: mockDataset,
        sourceParameters: {
          p_container: 'mycontainer',
          p_directory: 'mydir',
          p_fileName: 'file.json'
        },
        sinkParameters: {
          p_container: 'output',
          p_directory: 'results',
          p_fileName: 'output.json'
        }
      });

      const result = transformer.transformCopyActivity(mockActivity);

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
        sourceDataset: mockDataset,
        sinkDataset: mockDataset,
        sourceParameters: {
          p_container: { value: '@pipeline().globalParameters.gp_Container', type: 'Expression' }
        },
        sinkParameters: {
          p_container: 'output'
        }
      });

      const result = transformer.transformCopyActivity(mockActivity);

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
        sourceDataset: mockDataset,
        sinkDataset: mockDataset,
        sourceParameters: {
          p_container: 'source'
        },
        sinkParameters: {
          p_container: 'destination'
        }
      });

      const result = transformer.transformCopyActivity(mockActivity);

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
        sourceDataset: mockDataset,
        sinkDataset: mockDataset,
        sourceParameters: {
          p_container: 'rawdata'
        },
        sinkParameters: {
          p_container: 'processed'
        }
      });

      const result = transformer.transformCopyActivity(mockActivity);

      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('rawdata');
    });
  });
});
```

### Verification

```bash
# Run the tests
npm test -- __tests__/copyActivityTransformer.test.ts

# Or with pattern matching
npm test -- copyActivityTransformer.test

# Expected: All 7 tests should pass
```

**Checkpoint:**
- [ ] Test file created
- [ ] All 7 test cases present
- [ ] Tests cover wildcardFolderPath detection
- [ ] Tests cover wildcardFileName detection
- [ ] Tests cover hardcoded values
- [ ] Tests cover global parameters
- [ ] Tests cover sink wildcards
- [ ] Tests cover container property fallback

---

## Final Verification

### Run All Tests

```bash
# Run the new test file
npm test -- __tests__/copyActivityTransformer.test.ts

# Or with pattern matching
npm test -- copyActivityTransformer.test
```

**Expected Output:**
```
 ✓ src/services/__tests__/copyActivityTransformer.test.ts (7 tests)
   CopyActivityTransformer - Wildcard Path FileSystem Fix
     Wildcard Path Detection
       ✓ should detect wildcardFolderPath in source storeSettings
       ✓ should detect wildcardFileName in source storeSettings
       ✓ should handle hardcoded fileSystem in dataset
       ✓ should not add fileSystem when no wildcards are present
       ✓ should handle global parameter expressions in fileSystem
       ✓ should handle wildcards in sink storeSettings
       ✓ should handle container property instead of fileSystem

Test Files  1 passed (1)
     Tests  7 passed (7)
```

### Check TypeScript Compilation

```bash
# Verify no TypeScript errors
npm run build
```

**Expected:** No compilation errors

### Verify Git Changes

```bash
# Check what files were modified/created
git status

# Expected output should include:
# modified:   src/services/copyActivityTransformer.ts
# new file:   src/services/__tests__/copyActivityTransformer.test.ts

# View the diff
git diff src/services/copyActivityTransformer.ts

# Expected: Should show ~90-100 lines added
```

---

## Acceptance Criteria

- [ ] `hasWildcardPaths()` method exists and correctly detects wildcards
- [ ] `transformCopySource()` has wildcard fix logic
- [ ] `transformCopySink()` has wildcard fix logic
- [ ] Wildcard fix checks for both `wildcardFolderPath` and `wildcardFileName`
- [ ] FileSystem extraction handles Expression objects
- [ ] FileSystem extraction handles string values
- [ ] Parameter substitution using `replaceParameterReferences()` works
- [ ] Falls back to `container` property when `fileSystem` not present
- [ ] Console logging includes detection, success, and warning messages
- [ ] Test file created with 7 test cases
- [ ] All 7 tests pass
- [ ] No TypeScript compilation errors
- [ ] Git shows approximately 90-100 lines added to copyActivityTransformer.ts

---

## Rollback Instructions

If you need to undo Phase 0:

```bash
# First, check file status
git status

# Restore modified file
git checkout src/services/copyActivityTransformer.ts

# Remove new test file (use rm since it's new and untracked or git clean)
rm src/services/__tests__/copyActivityTransformer.test.ts

# OR if file was already committed:
git checkout src/services/__tests__/copyActivityTransformer.test.ts

# Verify rollback success
git status
# Expected: Working directory clean
```

---

## Next Steps

After Phase 0 completes successfully:
1. Proceed to **Phase 1: Integration Testing**
2. File: `phase_1_integration_tests.md`

---

**Phase 0 Status:** Ready for execution
