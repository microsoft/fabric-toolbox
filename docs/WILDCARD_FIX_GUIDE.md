# Copy Activity Wildcard Path FileSystem Fix - Troubleshooting Guide

**Version:** 1.0  
**Date:** January 2026  
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Root Cause Analysis](#root-cause-analysis)
3. [Resolution Process](#resolution-process)
4. [Verification](#verification)
5. [Troubleshooting Scenarios](#troubleshooting-scenarios)
6. [Edge Cases Handled](#edge-cases-handled)
7. [Testing](#testing)
8. [Production Deployment](#production-deployment)
9. [Known Limitations](#known-limitations)
10. [Support & Version History](#support--version-history)

---

## Overview

### Problem Description

When transforming Azure Data Factory (ADF) or Synapse pipelines to Microsoft Fabric, Copy activities using wildcard paths (`wildcardFolderPath` or `wildcardFileName`) fail at runtime with errors like:

```
Error: The fileSystem property is required but was not found in datasetSettings.typeProperties.location
```

This occurs because:
- **In ADF/Synapse**: The `fileSystem` (container) property comes from the **dataset definition** and is not required in the activity's `storeSettings`
- **In Fabric**: The `fileSystem` property must be explicitly present in the **activity's `datasetSettings.typeProperties.location`** for wildcard operations to work

### Solution

The transformation tool now automatically:
1. Detects wildcard paths in Copy activity `storeSettings`
2. Extracts the `fileSystem` property from the source dataset definition
3. Performs parameter substitution (e.g., `@dataset().p_container` → actual value)
4. Adds the resolved `fileSystem` to the Fabric `datasetSettings.typeProperties.location`

**Result:** Wildcard Copy activities transform correctly and run successfully in Fabric.

---

## Root Cause Analysis

### ADF/Synapse Structure

```json
{
  "name": "Copy data1",
  "type": "Copy",
  "typeProperties": {
    "source": {
      "type": "JsonSource",
      "storeSettings": {
        "type": "AzureBlobFSReadSettings",
        "wildcardFolderPath": "@pipeline().parameters.folder",
        "wildcardFileName": "*.json"
        // ❌ NO fileSystem here
      }
    }
  },
  "inputs": [{
    "referenceName": "Json1",
    "parameters": { "p_container": "mycontainer" }
  }]
}
```

**Dataset Definition (separate):**
```json
{
  "name": "Json1",
  "properties": {
    "type": "Json",
    "typeProperties": {
      "location": {
        "type": "AzureBlobFSLocation",
        "fileSystem": { "value": "@dataset().p_container", "type": "Expression" }
        // ✅ fileSystem is HERE in dataset
      }
    }
  }
}
```

### Fabric Requirement

```json
{
  "name": "Copy data1",
  "type": "Copy",
  "typeProperties": {
    "source": {
      "type": "JsonSource",
      "storeSettings": {
        "type": "AzureBlobFSReadSettings",
        "wildcardFolderPath": "@pipeline().parameters.folder",
        "wildcardFileName": "*.json"
      },
      "datasetSettings": {
        "type": "Json",
        "typeProperties": {
          "location": {
            "type": "AzureBlobFSLocation",
            "fileSystem": "mycontainer"  // ✅ MUST be present for wildcards
          }
        }
      }
    }
  }
}
```

### Why the Issue Occurred

1. **Original transformation logic** copied `storeSettings` directly without considering dataset properties
2. **Wildcard operations** in Fabric require explicit `fileSystem` in the activity's `datasetSettings`
3. **Parameter expressions** in dataset definitions were not being resolved and propagated to the activity

---

## Resolution Process

The fix follows a 5-step process for each Copy activity:

### Step 1: Wildcard Detection

```typescript
private hasWildcardPaths(storeSettings: any): boolean {
  return !!(storeSettings?.wildcardFolderPath || storeSettings?.wildcardFileName);
}
```

**Triggers when:**
- `wildcardFolderPath` is present (e.g., `"input/*"`, `"@variables('path')"`)
- `wildcardFileName` is present (e.g., `"*.json"`, `"data_*.csv"`)

### Step 2: Check Existing FileSystem

```typescript
if (!datasetSettings.typeProperties.location.fileSystem && 
    !datasetSettings.typeProperties.location.container) {
  // Proceed with fix
}
```

**Skips fix if:**
- `fileSystem` already present in `datasetSettings.typeProperties.location`
- `container` property exists (Blob Storage fallback)

### Step 3: Extract from Dataset

```typescript
const fileSystemValue = dataset.properties?.typeProperties?.location?.fileSystem;
```

**Supports:**
- Hardcoded strings: `"mycontainer"`
- Expression objects: `{ "value": "@dataset().p_container", "type": "Expression" }`
- Nested parameters: `{ "value": "@pipeline().globalParameters.gp_Container", "type": "Expression" }`

### Step 4: Parameter Substitution

```typescript
let resolvedFileSystem = this.replaceParameterReferences(
  fileSystemValue,
  parameterValues
);
```

**Resolves:**
- Dataset parameters: `@dataset().p_container` → actual parameter value
- Pipeline parameters: `@pipeline().parameters.container` → preserved as-is
- Global parameters: `@pipeline().globalParameters.gp_Container` → preserved as-is

### Step 5: Add to DatasetSettings

```typescript
datasetSettings.typeProperties.location.fileSystem = resolvedFileSystem;
console.log(`✓ Added fileSystem to datasetSettings: "${resolvedFileSystem}"`);
```

**Result:**
- `fileSystem` property added to `datasetSettings.typeProperties.location`
- Console log confirms the fix was applied
- Activity is now Fabric-compatible

---

## Verification

### Console Logging

When the transformation runs, you'll see console logs indicating wildcard detection and fix application:

**Wildcard Detected:**
```
🔍 Wildcard paths detected in source storeSettings for activity 'Copy data1'
```

**FileSystem Already Present:**
```
✓ fileSystem already present in source datasetSettings.typeProperties.location: "mycontainer"
```

**FileSystem Added:**
```
✓ Added fileSystem to source datasetSettings: "mycontainer"
```

**Warning (No FileSystem Found):**
```
⚠️ Wildcard detected but no fileSystem/container found in dataset definition for source in activity 'Copy data1'
```

### Using the Validation Tool

The validation module (`src/validation/copy-activity-wildcard-validation.ts`) can verify transformed pipelines:

```typescript
import { runWildcardValidation } from './validation/copy-activity-wildcard-validation';

// After transformation
const validationResult = runWildcardValidation(transformedPipeline);

if (validationResult.hasIssues) {
  console.error('Validation issues found:');
  validationResult.copyActivitiesWithIssues.forEach(activity => {
    console.error(`- ${activity.activityName}: ${activity.issue}`);
  });
} else {
  console.log('✓ All wildcard Copy activities have fileSystem property');
}
```

**Validation Report:**
```json
{
  "pipelineName": "pipeline3",
  "totalCopyActivities": 5,
  "copyActivitiesWithWildcards": 3,
  "copyActivitiesWithIssues": 0,
  "hasIssues": false,
  "copyActivitiesWithIssues": []
}
```

---

## Troubleshooting Scenarios

### Scenario 1: FileSystem Not Added Despite Wildcards

**Symptoms:**
- Wildcard detected message appears in console
- Warning: "no fileSystem/container found in dataset definition"
- Transformed activity missing `fileSystem` in `datasetSettings`

**Root Cause:**
Dataset definition has no `fileSystem` or `container` property in `typeProperties.location`

**Resolution:**
1. Check the source dataset definition:
   ```bash
   # Find dataset in ADF export
   grep -A 20 "\"name\": \"YourDatasetName\"" ARMTemplateForFactory.json
   ```

2. Verify dataset has location property:
   ```json
   "typeProperties": {
     "location": {
       "type": "AzureBlobFSLocation",
       "fileSystem": "mycontainer"  // ← Must be present
     }
   }
   ```

3. If dataset has no `fileSystem`, add it to the ADF dataset definition before export

**Example Fix:**
```json
// Before (dataset missing fileSystem)
{
  "name": "Json1",
  "typeProperties": {
    "location": {
      "type": "AzureBlobFSLocation"
      // ❌ Missing fileSystem
    }
  }
}

// After (add fileSystem)
{
  "name": "Json1",
  "typeProperties": {
    "location": {
      "type": "AzureBlobFSLocation",
      "fileSystem": "mycontainer"  // ✅ Added
    }
  }
}
```

---

### Scenario 2: Parameter Not Resolved

**Symptoms:**
- Console shows: `@dataset().p_container` instead of actual value
- FileSystem in `datasetSettings` is an expression, not a resolved value

**Root Cause:**
Activity inputs missing parameter values, or parameter name mismatch

**Resolution:**
1. Check activity's `inputs` array for parameter values:
   ```json
   "inputs": [{
     "referenceName": "Json1",
     "parameters": {
       "p_container": "mycontainer"  // ← Must match dataset parameter name
     }
   }]
   ```

2. Verify dataset parameter name matches:
   ```json
   // Dataset definition
   "parameters": {
     "p_container": {  // ← Must match inputs parameter
       "type": "string"
     }
   }
   ```

3. If parameter name mismatches, update activity inputs or dataset parameter name

**Example Fix:**
```json
// Activity inputs (parameter name: containerName)
"inputs": [{
  "parameters": {
    "containerName": "mycontainer"  // ❌ Mismatch
  }
}]

// Dataset definition (parameter name: p_container)
"parameters": {
  "p_container": { "type": "string" }  // ❌ Mismatch
}

// Fixed: Match parameter names
"inputs": [{
  "parameters": {
    "p_container": "mycontainer"  // ✅ Matches dataset
  }
}]
```

---

### Scenario 3: Global Parameters Not Preserved

**Symptoms:**
- Global parameter expression resolved to literal "undefined" or empty string
- Expected: `@pipeline().globalParameters.gp_Container` preserved
- Actual: `fileSystem` is empty or missing

**Root Cause:**
Global parameters are not in the activity's parameter values map

**Expected Behavior:**
Global parameters should be preserved as-is (not resolved) because they're evaluated at runtime in Fabric

**Resolution:**
This is **correct behavior**. Global parameters like `@pipeline().globalParameters.gp_Container` should remain as expressions in the transformed pipeline.

**Example (Correct):**
```json
// Original dataset fileSystem
"fileSystem": {
  "value": "@pipeline().globalParameters.gp_Container",
  "type": "Expression"
}

// Transformed datasetSettings (expression preserved)
"datasetSettings": {
  "typeProperties": {
    "location": {
      "fileSystem": "@pipeline().globalParameters.gp_Container"  // ✅ Preserved
    }
  }
}
```

**Verification:**
```bash
# Check console logs
# Should show: Replaced parameter in Expression fileSystem: "@dataset().p_container" -> "@pipeline().globalParameters.gp_Container"
```

---

### Scenario 4: Nested Activities Not Fixed

**Symptoms:**
- Top-level Copy activities work fine
- Copy activities inside ForEach, IfCondition, Switch, or Until fail with missing `fileSystem`

**Root Cause:**
Transformation logic not recursing into nested activity containers

**Resolution:**
Ensure you're using the **PipelineTransformer** service, which handles nested activities:

```typescript
import { pipelineTransformer } from './services/pipelineTransformer';

// ✅ Use this (handles nesting)
const transformedPipeline = pipelineTransformer.transformPipelineDefinition(
  adfPipeline,
  connectionMappings
);

// ❌ Don't use this directly for pipelines with nesting
const copyActivity = copyActivityTransformer.transformCopyActivity(activity);
```

**Nested Activity Types Supported:**
- ForEach: `typeProperties.activities[]`
- IfCondition: `typeProperties.ifTrueActivities[]`, `typeProperties.ifFalseActivities[]`
- Switch: `typeProperties.cases[].activities[]`, `typeProperties.defaultActivities[]`
- Until: `typeProperties.activities[]`

**Verification:**
```bash
# Check integration test results
npm test -- copyActivityWildcardIntegration.test.ts

# Expected: All 7 tests passing (including nested scenarios)
```

---

### Scenario 5: Container vs FileSystem Property

**Symptoms:**
- Dataset uses `container` property (Blob Storage) instead of `fileSystem` (ADLS Gen2)
- Warning: "no fileSystem/container found"
- Fix not applied

**Root Cause:**
Some Azure storage types use different property names:
- **ADLS Gen2**: `fileSystem`
- **Blob Storage**: `container`

**Resolution:**
The fix now checks both properties. If neither is found, you may need to update the dataset definition.

**Edge Case Handling:**
```typescript
// Check both fileSystem and container
const fileSystemValue = 
  dataset.properties?.typeProperties?.location?.fileSystem ||
  dataset.properties?.typeProperties?.location?.container;
```

**Example (Blob Storage):**
```json
// Blob Storage dataset
{
  "typeProperties": {
    "location": {
      "type": "AzureBlobStorageLocation",
      "container": "myblob"  // ✅ Will be used as fileSystem
    }
  }
}

// Transformed (container copied to fileSystem)
"datasetSettings": {
  "typeProperties": {
    "location": {
      "fileSystem": "myblob"  // ✅ Populated from container
    }
  }
}
```

---

## Edge Cases Handled

The wildcard fix handles the following edge cases:

### 1. Null Safety
- ✅ Null `storeSettings` objects
- ✅ Undefined `fileSystem` properties
- ✅ Missing `location` objects (SQL datasets)
- ✅ Graceful degradation with warning messages

### 2. Data Type Validation
- ✅ Numeric values: `12345` → `"12345"` (converted to string)
- ✅ Nested Expression objects: `{ value: "...", type: "Expression" }` → extracted string
- ✅ Boolean values: `true` → `"true"` (converted to string)
- ✅ Type checking prevents runtime errors

### 3. String Validation
- ✅ Whitespace trimming: `"  container  "` → `"container"`
- ✅ Empty string rejection (logs warning, sets undefined)
- ✅ Literal `"undefined"` string detection and rejection
- ✅ Literal `"null"` string detection and rejection

### 4. Property Name Variants
- ✅ Both `fileSystem` and `container` properties supported
- ✅ Container property used as fallback when fileSystem missing
- ✅ Blob Storage datasets with `container` property
- ✅ ADLS Gen2 datasets with `fileSystem` property

### 5. Parameter Types
- ✅ Hardcoded strings: `"mycontainer"`
- ✅ Dataset parameters: `@dataset().p_container`
- ✅ Pipeline parameters: `@pipeline().parameters.container`
- ✅ Global parameters: `@pipeline().globalParameters.gp_Container`
- ✅ Variables: `@variables('containerName')`

### 6. Activity Nesting
- ✅ ForEach activity: `typeProperties.activities[]`
- ✅ IfCondition activity: `ifTrueActivities[]`, `ifFalseActivities[]`
- ✅ Switch activity: `cases[].activities[]`, `defaultActivities[]`
- ✅ Until activity: `typeProperties.activities[]`
- ✅ Deeply nested: ForEach inside IfCondition, etc.

---

## Testing

### Unit Tests (Phase 0)

**File:** `src/services/__tests__/copyActivityTransformer.test.ts`

**Status:** 7 tests (deferred, use integration tests instead)

### Integration Tests (Phase 1)

**File:** `src/services/__tests__/copyActivityWildcardIntegration.test.ts`

**Run Tests:**
```bash
npm test -- copyActivityWildcardIntegration.test.ts
```

**Expected Output:**
```
✓ src/services/__tests__/copyActivityWildcardIntegration.test.ts (7 tests)
  ✓ User-Provided Example: pipeline3
  ✓ Nested Copy Activities in ForEach
  ✓ Nested Copy Activities in IfCondition (ifTrueActivities)
  ✓ Nested Copy Activities in IfCondition (ifFalseActivities)
  ✓ Nested Copy Activities in Switch
  ✓ Nested Copy Activities in Until
  ✓ Deeply Nested Scenarios

Test Files  1 passed (1)
Tests  7 passed (7)
```

### Edge Case Tests (Phase 2)

**File:** `src/services/__tests__/copyActivityEdgeCases.test.ts`

**Run Tests:**
```bash
npm test -- copyActivityEdgeCases.test.ts
```

**Expected Output:**
```
✓ src/services/__tests__/copyActivityEdgeCases.test.ts (10 tests)
  ✓ Null Safety Edge Cases (3 tests)
  ✓ Data Type Edge Cases (2 tests)
  ✓ String Validation Edge Cases (3 tests)
  ✓ Property Name Edge Cases (2 tests)

Test Files  1 passed (1)
Tests  10 passed (10)
```

### Manual Testing with Real Pipelines

1. **Export ADF pipeline** with wildcard Copy activities
2. **Run transformation** with console logging enabled
3. **Verify console output** shows wildcard detection
4. **Inspect transformed JSON** for `fileSystem` in `datasetSettings`
5. **Deploy to Fabric** and test execution
6. **Confirm success** - wildcard Copy should run without errors

**Example Console Output:**
```
Transforming Copy activity: Copy data1
🔍 Wildcard paths detected in source storeSettings for activity 'Copy data1'
Replaced parameter in Expression fileSystem: "@dataset().p_container" -> "mycontainer"
✓ Added fileSystem to source datasetSettings: "mycontainer"
```

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] All 17 tests passing (7 integration + 10 edge cases)
- [ ] No TypeScript compilation errors
- [ ] Code reviewed by team
- [ ] Documentation complete (README, this guide)
- [ ] Manual testing with real pipeline data completed
- [ ] At least one user-provided pipeline tested successfully

### Deployment Steps

1. **Create feature branch** (if not already done):
   ```bash
   git checkout -b feature/copy-activity-wildcard-fix
   ```

2. **Commit all changes**:
   ```bash
   git add .
   git commit -m "feat: Add Copy Activity wildcard path fileSystem fix

   - Implement wildcard detection and fileSystem fix
   - Add comprehensive test coverage (17 tests)
   - Add edge case handling and null safety
   - Create troubleshooting guide and documentation
   
   Fixes: Copy Activity runtime failures when wildcards are used"
   ```

3. **Push to remote**:
   ```bash
   git push origin feature/copy-activity-wildcard-fix
   ```

4. **Create Pull Request** with:
   - Summary of changes
   - Link to test results
   - Reference to user bug report
   - Screenshots of console logging (if available)

5. **After PR approval and merge**:
   - Monitor production logs for wildcard detection messages
   - Verify transformed pipelines deploy successfully to Fabric
   - Confirm wildcard Copy activities execute without errors

### Rollback Plan

If issues arise in production:

1. **Identify the issue**:
   - Check console logs for errors
   - Review transformed pipeline JSON
   - Verify fileSystem values are correct

2. **Quick fix options**:
   - If fileSystem values incorrect: Update dataset definitions
   - If transformation failing: Revert to previous version

3. **Rollback command**:
   ```bash
   # Revert the merge commit
   git revert <merge-commit-sha>
   git push origin main
   ```

### Post-Deployment Monitoring

**Monitor for 7 days:**
- Console logs for wildcard detection messages
- Fabric pipeline deployment success rate
- Fabric pipeline execution success rate for wildcard Copy activities
- User feedback on transformation accuracy

**Success Criteria:**
- ✅ All wildcard Copy activities deploy without errors
- ✅ All wildcard Copy activities execute successfully in Fabric
- ✅ No user reports of missing `fileSystem` errors
- ✅ Console logs show consistent wildcard detection

---

## Known Limitations

### 1. Whitespace Trimming

**Limitation:** Whitespace trimming only applies when the wildcard fix adds `fileSystem` from scratch. If `fileSystem` is already present from dataset parameter substitution, whitespace is preserved.

**Example:**
```typescript
// Dataset parameter value: "  mycontainer  " (with spaces)
// If fileSystem already in dataset: preserved as "  mycontainer  "
// If wildcard fix adds it: trimmed to "mycontainer"
```

**Impact:** Minimal - Fabric accepts fileSystem values with leading/trailing spaces

**Workaround:** Trim values in ADF dataset parameter definitions

### 2. SQL Datasets

**Limitation:** SQL datasets (AzureSqlTable, SqlServerTable) have no `location` object. Wildcard fix skips these with a warning.

**Example:**
```
⚠️ Wildcard detected but dataset has no location object (dataset type: AzureSqlTable) for source in activity 'Copy from SQL'
```

**Impact:** None - SQL datasets don't support wildcard paths (file storage only)

**Workaround:** Not needed - this is expected behavior

### 3. Blob Storage Container Property

**Limitation:** Some transformations may require both `fileSystem` and `container` properties for Blob Storage datasets. Currently, only one is set.

**Example:**
```json
// Blob Storage might need both
"location": {
  "type": "AzureBlobStorageLocation",
  "fileSystem": "mycontainer",  // ← Added by fix
  "container": "mycontainer"     // ← May also be needed
}
```

**Impact:** Low - Most Blob Storage scenarios work with just `fileSystem`

**Workaround:** If issues occur, manually add `container` property in post-processing

### 4. Complex Expression Evaluation

**Limitation:** The fix does not evaluate complex expressions like concatenations, functions, or conditional logic.

**Example:**
```json
// Not evaluated
"fileSystem": "@concat('container-', pipeline().parameters.env)"

// Preserved as-is (correct behavior)
```

**Impact:** None - Complex expressions should remain as-is for runtime evaluation

**Workaround:** Not needed - this is expected behavior

---

## Support & Version History

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial release with wildcard fix, edge case handling, and comprehensive documentation |

### Getting Help

**Documentation:**
- [README.md](../README.md) - Main project documentation
- [WILDCARD_FIX_GUIDE.md](docs/WILDCARD_FIX_GUIDE.md) - This guide
- [PHASE_2_COMPLETE.md](docs/features/copy-activity-wildcard-fix/PHASE_2_COMPLETE.md) - Implementation details

**Testing:**
- Run tests: `npm test -- copyActivity`
- Check console logs for wildcard detection messages
- Use validation module for automated checks

**Reporting Issues:**
1. Check [Troubleshooting Scenarios](#troubleshooting-scenarios) first
2. Verify console logs for error messages
3. Collect sample pipeline JSON (sanitized)
4. Create GitHub issue with:
   - Problem description
   - Console logs
   - Expected vs actual behavior
   - Sample pipeline (if possible)

### Contact

For questions or issues related to the wildcard fix:
- **GitHub Issues:** [PipelineToFabricUpgrader Issues](https://github.com/Mirabile-S/PipelineToFabricUpgrader/issues)
- **Documentation:** This guide and README.md
- **Tests:** Run integration and edge case tests for verification

---

**Document Version:** 1.0  
**Last Updated:** January 13, 2026  
**Status:** Production Ready
