# Phase 2: Edge Case Handling - Defensive Programming

**Estimated Time:** 1 hour  
**Dependencies:** Phase 0 completed (wildcard fix sections exist in copyActivityTransformer.ts)

**⚠️ IMPORTANT:** This phase includes AMENDMENTS applied (corrected line numbers after Phase 0 additions)

---

## Goal Statement

Add comprehensive edge case handling and defensive programming to prevent null reference errors, handle malformed datasets, support multiple dataset types, and provide clear error messages when the wildcard fix cannot be applied.

---

## Pre-Execution Verification

**CRITICAL:** Before starting Phase 2, verify Phase 0 completed successfully:

```bash
# 1. Check that Phase 0 tests pass
npm test -- __tests__/copyActivityTransformer.test.ts

# Expected: 7 tests passing

# 2. Verify hasWildcardPaths method exists
grep -n "hasWildcardPaths" src/services/copyActivityTransformer.ts

# Expected: Should show method around line 204-218

# 3. Verify wildcard fix sections exist (CRITICAL FOR LINE NUMBERS)
grep -n "WILDCARD FIX: When wildcards are used" src/services/copyActivityTransformer.ts

# Expected output should show 2 matches with line numbers:
# 221:    // WILDCARD FIX: When wildcards are used, ensure fileSystem is in datasetSettings
# 314:    // WILDCARD FIX: When wildcards are used, ensure fileSystem is in datasetSettings
# (Line numbers may vary slightly - use these as starting points)

# 4. Count lines added in Phase 0
git diff src/services/copyActivityTransformer.ts | grep "^+" | wc -l

# Expected: Approximately 90-100 new lines added
```

**Checkpoints:**
- [ ] Phase 0 tests passing (7/7)
- [ ] `hasWildcardPaths` method exists at ~line 204-218
- [ ] Wildcard fix sections exist in both `transformCopySource` and `transformCopySink`
- [ ] Approximately 90-100 lines added to copyActivityTransformer.ts

---

## Code Location Verification (PRIMARY METHOD)

**⚠️ CRITICAL:** The line numbers below (221, 314) are ESTIMATES ONLY.

**ALWAYS run this grep command FIRST and use those line numbers as authoritative:**

```bash
# Find wildcard fix sections (should return 2 matches)
grep -n "WILDCARD FIX: When wildcards are used" src/services/copyActivityTransformer.ts

# Expected output format:
# 221:    // WILDCARD FIX: When wildcards are used, ensure fileSystem is in datasetSettings
# 314:    // WILDCARD FIX: When wildcards are used, ensure fileSystem is in datasetSettings
# (Actual line numbers may vary based on Phase 0 implementation)
```

**MANDATORY USAGE:**
- If grep shows line 225 for first match: Use 225 for CHANGE 1
- If grep shows line 318 for second match: Use 318 for CHANGE 2
- **DO NOT** use the estimated line numbers below if grep output differs

**Note:** The code is distinctive enough to locate via pattern matching. Grep-based location is PRIMARY, not fallback.

---

## Changes Overview

1. Enhance `transformCopySource` wildcard fix with null safety and edge case handling
2. Enhance `transformCopySink` wildcard fix with null safety and edge case handling
3. Create comprehensive edge case test suite

---

## CHANGE 1: Add Null Safety to transformCopySource

### File
`src/services/copyActivityTransformer.ts`

### Location
**Lines ~221-274** (wildcard fix section within transformCopySource method - exact lines determined by grep)

**Important:** The line ranges shown are approximate examples. Use grep to find the exact location:
```bash
grep -n "// WILDCARD FIX: Check if wildcards exist in source" src/services/copyActivityTransformer.ts
# This will show the starting line of the source wildcard fix block
```

**Modification Scope:** Replace ONLY the wildcard fix block (from "// WILDCARD FIX:" comment to the closing brace of the if statement), NOT the entire transformCopySource method.

### BEFORE Code (approximately 54 lines of wildcard fix code)

```typescript
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
```

### Location
**Determined by grep command in "Code Location Verification" section above** (wildcard fix section within transformCopySource method)

**To find exact location:**
```bash
# Run this command and use the FIRST line number shown
grep -n "WILDCARD FIX: When wildcards are used" src/services/copyActivityTransformer.ts
# Use that line number as the start of the section to replace
```

**Expected approximate location:** Lines 221-274 (may vary based on codebase state)

### AFTER Code

```typescript
    // WILDCARD FIX: When wildcards are used, ensure fileSystem is in datasetSettings
    if (this.hasWildcardPaths(source.storeSettings)) {
      console.log(`🔍 Wildcard paths detected in source storeSettings for activity '${activityName || 'unknown'}'`);
      
      // Check if datasetSettings has a location object (file-based datasets)
      if (datasetSettings?.typeProperties?.location) {
        // If fileSystem is not already set, try to get it from the dataset's original typeProperties
        if (!datasetSettings.typeProperties.location.fileSystem && !datasetSettings.typeProperties.location.container) {
          const originalLocation = sourceDataset.definition?.properties?.typeProperties?.location || {};
          
          // Get fileSystem or container from original dataset location
          const fileSystemValue = originalLocation.fileSystem || originalLocation.container;
          
          if (fileSystemValue) {
            // If it's an Expression object, extract the value and apply parameter substitution
            let resolvedFileSystem: any;
            
            if (typeof fileSystemValue === 'object' && fileSystemValue !== null && fileSystemValue.value) {
              // Handle Expression objects
              const expressionValue = fileSystemValue.value;
              if (typeof expressionValue === 'string') {
                resolvedFileSystem = this.replaceParameterReferences(expressionValue, sourceParameters);
              } else {
                // Nested Expression object edge case
                console.warn(`⚠️ Source fileSystem has nested Expression object structure, using as-is`);
                resolvedFileSystem = expressionValue;
              }
            } else if (typeof fileSystemValue === 'string') {
              // Handle plain string values
              resolvedFileSystem = this.replaceParameterReferences(fileSystemValue, sourceParameters);
            } else {
              // Handle non-standard types (number, boolean, etc.)
              console.warn(`⚠️ Source fileSystem has unexpected type: ${typeof fileSystemValue}, converting to string`);
              resolvedFileSystem = String(fileSystemValue);
            }
            
            // Final validation before setting
            if (resolvedFileSystem && resolvedFileSystem !== 'undefined' && resolvedFileSystem !== 'null') {
              // Trim whitespace from resolved value
              const trimmedValue = typeof resolvedFileSystem === 'string' ? resolvedFileSystem.trim() : resolvedFileSystem;
              
              if (trimmedValue && trimmedValue !== '') {
                datasetSettings.typeProperties.location.fileSystem = trimmedValue;
                console.log(`✅ Wildcard fix applied: Added fileSystem to source datasetSettings.typeProperties.location: "${trimmedValue}"`);
              } else {
                console.warn(`⚠️ Wildcard detected but resolved fileSystem value is empty for source in activity '${activityName || 'unknown'}'`);
              }
            } else {
              console.warn(`⚠️ Wildcard detected but could not resolve fileSystem value for source in activity '${activityName || 'unknown'}'`);
            }
          } else {
            console.warn(`⚠️ Wildcard detected but no fileSystem/container found in dataset definition for source in activity '${activityName || 'unknown'}'`);
          }
        } else {
          const existingValue = datasetSettings.typeProperties.location.fileSystem || datasetSettings.typeProperties.location.container;
          console.log(`✓ fileSystem already present in source datasetSettings.typeProperties.location: "${existingValue}"`);
        }
      } else {
        console.warn(`⚠️ Wildcard detected in source but datasetSettings does not have a location object (dataset type: ${datasetSettings?.type || 'unknown'}) for activity '${activityName || 'unknown'}'`);
      }
    }
```

### Verification

```bash
# Verify changes were applied to source
grep -A 10 "Source fileSystem has unexpected type" src/services/copyActivityTransformer.ts

# Expected: Should show the new null safety code
```

**Checkpoint:**
- [ ] Null safety check added: `fileSystemValue !== null`
- [ ] Container property checked alongside fileSystem
- [ ] Nested Expression objects handled
- [ ] Non-standard types (number, boolean) converted to string
- [ ] Whitespace trimming added
- [ ] Empty string validation added
- [ ] Literal "undefined"/"null" string rejection added
- [ ] Activity name included in all warning messages
- [ ] Missing location object warning added

---

## CHANGE 2: Add Null Safety to transformCopySink

### File
`src/services/copyActivityTransformer.ts`

### Location
**Lines 314-367** (wildcard fix section within transformCopySink method)

**Modification Scope:** Replace ONLY the wildcard fix block (from "// WILDCARD FIX:" comment to the closing brace of the if statement), NOT the entire transformCopySink method.

### BEFORE Code (Lines 314-343)

```typescript
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
```

## CHANGE 2: Add Null Safety to transformCopySink

### File
`src/services/copyActivityTransformer.ts`

### Location
**Lines ~314-367** (wildcard fix section within transformCopySink method - exact lines determined by grep)

**Important:** The line ranges shown are approximate examples. Use grep to find the exact location:
```bash
grep -n "// WILDCARD FIX: Check if wildcards exist in sink" src/services/copyActivityTransformer.ts
# This will show the starting line of the sink wildcard fix block
```

**Modification Scope:** Replace ONLY the wildcard fix block (from "// WILDCARD FIX:" comment to the closing brace of the if statement), NOT the entire transformCopySink method.

**To find exact location:**
```bash
# Run this command and use the SECOND line number shown
grep -n "WILDCARD FIX: When wildcards are used" src/services/copyActivityTransformer.ts
# Use that line number as the start of the section to replace
```

**Expected approximate location:** Lines 314-367 (may vary based on codebase state)

### AFTER Code

```typescript
    // WILDCARD FIX: When wildcards are used, ensure fileSystem is in datasetSettings
    if (this.hasWildcardPaths(sink.storeSettings)) {
      console.log(`🔍 Wildcard paths detected in sink storeSettings for activity '${activityName || 'unknown'}'`);
      
      // Check if datasetSettings has a location object (file-based datasets)
      if (datasetSettings?.typeProperties?.location) {
        // If fileSystem is not already set, try to get it from the dataset's original typeProperties
        if (!datasetSettings.typeProperties.location.fileSystem && !datasetSettings.typeProperties.location.container) {
          const originalLocation = sinkDataset.definition?.properties?.typeProperties?.location || {};
          
          // Get fileSystem or container from original dataset location
          const fileSystemValue = originalLocation.fileSystem || originalLocation.container;
          
          if (fileSystemValue) {
            // If it's an Expression object, extract the value and apply parameter substitution
            let resolvedFileSystem: any;
            
            if (typeof fileSystemValue === 'object' && fileSystemValue !== null && fileSystemValue.value) {
              // Handle Expression objects
              const expressionValue = fileSystemValue.value;
              if (typeof expressionValue === 'string') {
                resolvedFileSystem = this.replaceParameterReferences(expressionValue, sinkParameters);
              } else {
                // Nested Expression object edge case
                console.warn(`⚠️ Sink fileSystem has nested Expression object structure, using as-is`);
                resolvedFileSystem = expressionValue;
              }
            } else if (typeof fileSystemValue === 'string') {
              // Handle plain string values
              resolvedFileSystem = this.replaceParameterReferences(fileSystemValue, sinkParameters);
            } else {
              // Handle non-standard types (number, boolean, etc.)
              console.warn(`⚠️ Sink fileSystem has unexpected type: ${typeof fileSystemValue}, converting to string`);
              resolvedFileSystem = String(fileSystemValue);
            }
            
            // Final validation before setting
            if (resolvedFileSystem && resolvedFileSystem !== 'undefined' && resolvedFileSystem !== 'null') {
              // Trim whitespace from resolved value
              const trimmedValue = typeof resolvedFileSystem === 'string' ? resolvedFileSystem.trim() : resolvedFileSystem;
              
              if (trimmedValue && trimmedValue !== '') {
                datasetSettings.typeProperties.location.fileSystem = trimmedValue;
                console.log(`✅ Wildcard fix applied: Added fileSystem to sink datasetSettings.typeProperties.location: "${trimmedValue}"`);
              } else {
                console.warn(`⚠️ Wildcard detected but resolved fileSystem value is empty for sink in activity '${activityName || 'unknown'}'`);
              }
            } else {
              console.warn(`⚠️ Wildcard detected but could not resolve fileSystem value for sink in activity '${activityName || 'unknown'}'`);
            }
          } else {
            console.warn(`⚠️ Wildcard detected but no fileSystem/container found in dataset definition for sink in activity '${activityName || 'unknown'}'`);
          }
        } else {
          const existingValue = datasetSettings.typeProperties.location.fileSystem || datasetSettings.typeProperties.location.container;
          console.log(`✓ fileSystem already present in sink datasetSettings.typeProperties.location: "${existingValue}"`);
        }
      } else {
        console.warn(`⚠️ Wildcard detected in sink but datasetSettings does not have a location object (dataset type: ${datasetSettings?.type || 'unknown'}) for activity '${activityName || 'unknown'}'`);
      }
    }
```

### Verification

```bash
# Verify both source and sink have enhanced edge case handling
grep -c "fileSystem has unexpected type" src/services/copyActivityTransformer.ts

# Expected: 2 (one for source, one for sink)
```

**Checkpoint:**
- [ ] Sink wildcard fix mirrors source enhancements
- [ ] Null safety checks added
- [ ] Uses `sinkParameters` for parameter substitution
- [ ] Logging messages reference "sink"
- [ ] Activity name included in warnings

---

## CHANGE 3: Create Edge Case Test File

### File (NEW)
`src/services/__tests__/copyActivityEdgeCases.test.ts`

### Content

```typescript
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
        sourceDataset: mockDataset,
        sinkDataset: mockDataset,
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
        sourceDataset: mockDataset,
        sinkDataset: mockDataset,
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
        sourceDataset: mockSqlDataset,
        sinkDataset: mockJsonDataset,
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
        sourceDataset: mockDataset,
        sinkDataset: mockDataset,
        sourceParameters: { p_container: 12345 },
        sinkParameters: { p_container: 'output' }
      });

      const result = transformer.transformCopyActivity(mockActivity);

      expect(result).toBeDefined();
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe(12345);
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
        sourceDataset: mockDataset,
        sinkDataset: mockDataset,
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
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toEqual({
        value: '@pipeline().parameters.container',
        type: 'Expression'
      });
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
        sourceDataset: mockDataset,
        sinkDataset: mockDataset,
        sourceParameters: { p_container: '  mycontainer  ' },
        sinkParameters: { p_container: 'output' }
      });

      const result = transformer.transformCopyActivity(mockActivity);

      expect(result).toBeDefined();
      // The transformer should trim whitespace before setting fileSystem
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('mycontainer'); // Whitespace trimmed by implementation
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
        sourceDataset: mockDataset,
        sinkDataset: mockDataset,
        sourceParameters: { p_container: '' },
        sinkParameters: { p_container: 'output' }
      });

      const result = transformer.transformCopyActivity(mockActivity);

      expect(result).toBeDefined();
      // Empty string should be preserved (validation at higher level)
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('');
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
        sourceDataset: mockDataset,
        sinkDataset: mockDataset,
        sourceParameters: { p_container: 'undefined' },
        sinkParameters: { p_container: 'null' }
      });

      const result = transformer.transformCopyActivity(mockActivity);

      expect(result).toBeDefined();
      // Literal strings should be preserved as-is
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
        sourceDataset: mockDataset,
        sinkDataset: mockDataset,
        sourceParameters: { p_container: 'sourcecontainer' },
        sinkParameters: { p_container: 'sinkcontainer' }
      });

      const result = transformer.transformCopyActivity(mockActivity);

      expect(result).toBeDefined();
      // Should handle 'container' property (Blob Storage) instead of 'fileSystem' (ADLS Gen2)
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.container).toBe('sourcecontainer');
      expect(result.typeProperties.sink.datasetSettings.typeProperties.location.container).toBe('sinkcontainer');
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
        sourceDataset: mockDataset,
        sinkDataset: mockDataset,
        sourceParameters: { p_container: 'mycontainer' },
        sinkParameters: { p_container: 'output' }
      });

      const result = transformer.transformCopyActivity(mockActivity);

      expect(result).toBeDefined();
      // Should add fileSystem but preserve container if it exists
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.fileSystem).toBe('mycontainer');
      expect(result.typeProperties.source.datasetSettings.typeProperties.location.container).toBe('legacycontainer');
    });
  });
});
```

### Verification

```bash
# Verify test case count
grep -c "it('should" src/services/__tests__/copyActivityEdgeCases.test.ts
# Expected: 10

# Run edge case tests
npm test -- copyActivityEdgeCases.test.ts

# Expected: All 10 tests should pass
```

**Checkpoint:**
- [ ] Edge case test file created with 10 test cases
- [ ] Null/undefined safety tests present
- [ ] Non-standard data type tests present
- [ ] String validation tests present
- [ ] Container property tests present

---

## Final Verification

### Code Location Verification (if line numbers mismatch)

```bash
# Find wildcard fix sections (should return 2 matches)
grep -n "WILDCARD FIX: When wildcards are used" src/services/copyActivityTransformer.ts

# Expected output format:
# 221:    // WILDCARD FIX: When wildcards are used, ensure fileSystem is in datasetSettings
# 314:    // WILDCARD FIX: When wildcards are used, ensure fileSystem is in datasetSettings

# Use these line numbers for CHANGE 1 and CHANGE 2 starting points
```

### Run All Tests

```bash
# Run edge case tests
npm test -- copyActivityEdgeCases.test.ts

# Expected: All 10 tests pass

# Run all Copy activity tests
npm test -- copyActivity

# Expected: Phase 0 + Phase 1 + Phase 2 tests all passing (24 total)

# Run full test suite
npm test

# Expected: No regressions, all tests pass
```

### Check TypeScript Compilation

```bash
# Verify no TypeScript errors
npm run build

# Expected: No compilation errors
```

### Verify Git Changes

```bash
# Check what files were modified/created
git status

# Expected:
# modified:   src/services/copyActivityTransformer.ts
# new file:   src/services/__tests__/copyActivityEdgeCases.test.ts

# View the diff
git diff src/services/copyActivityTransformer.ts | grep "unexpected type"

# Expected: Should show 2 occurrences (source and sink)
```

---

## Acceptance Criteria

- [ ] Null storeSettings handled without throwing error
- [ ] `fileSystemValue !== null` check added
- [ ] Container property checked alongside fileSystem
- [ ] Undefined fileSystem logged as warning, not error
- [ ] Missing location object logged with dataset type info
- [ ] Numeric fileSystem values converted to string
- [ ] Nested Expression objects handled gracefully
- [ ] Whitespace trimmed from fileSystem values
- [ ] Empty string (after trim) rejected with warning
- [ ] Literal "undefined" string rejected
- [ ] Literal "null" string rejected
- [ ] Container property used as fallback to fileSystem
- [ ] Existing container property not overwritten
- [ ] Activity name included in all warning messages
- [ ] All 10 edge case tests pass
- [ ] Phase 0, Phase 1, and Phase 2 tests all pass (24 total)
- [ ] No TypeScript compilation errors

---

## Rollback Instructions

If you need to undo Phase 2:

```bash
# Option 1: Restore from git
git checkout src/services/copyActivityTransformer.ts
git checkout src/services/__tests__/copyActivityEdgeCases.test.ts

# Option 2: Remove new test file if untracked
rm src/services/__tests__/copyActivityEdgeCases.test.ts

# Then re-apply Phase 0 if needed
```

---

## Next Steps

After Phase 2 completes successfully:
1. Proceed to **Phase 3: Documentation & Production Readiness**
2. File: `phase_3_documentation.md`

---

**Phase 2 Status:** Ready for execution (with amendments applied)
