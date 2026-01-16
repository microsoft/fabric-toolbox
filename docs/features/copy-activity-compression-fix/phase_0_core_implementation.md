# Phase 0: Core Implementation - Compression Property Support

## Working Directory
All commands in this phase assume you're in the **project root directory**:
```
C:\Users\seanmirabile\OneDrive - Microsoft\Documents\git_repos\PipelineToFabricUpgrader\
```

Verify your location before starting:
```powershell
Get-Location
# Should show: C:\Users\seanmirabile\OneDrive - Microsoft\Documents\git_repos\PipelineToFabricUpgrader
```

---

## Goal

Add compression property support to 4 dataset building methods in `CopyActivityTransformer` to preserve ADF compression settings during Fabric transformation.

**What This Fixes:**
- ADF datasets with `typeProperties.compression` lose this property during transformation
- Fabric Copy Activities fail at runtime when processing compressed files
- Missing compression settings cause incorrect data processing

**Implementation Approach:**
- Add compression property check to 4 methods following existing pattern
- Each method gets identical 4-line insertion
- Pattern matches existing optional property handling (e.g., `encodingName`)

---

## Estimated Time

**Implementation:** 10 minutes  
**Verification:** 5 minutes  
**Total:** 15 minutes

---

## Changes Required

### File: `src/services/copyActivityTransformer.ts`

You will make 4 independent insertions to this file. Each insertion adds compression property support to a different dataset building method.

---

### Change 1: buildDelimitedTextDatasetProperties()

**Location:** Insert after line 945, before line 947

**Context:**
- Line 943: `if (typeProperties.quoteChar !== undefined) {`
- Line 944: `result.quoteChar = typeProperties.quoteChar;`
- Line 945: `}`
- Line 946: (blank line)
- Line 947: `return result;`

**BEFORE (lines 943-948):**
```typescript
    if (typeProperties.quoteChar !== undefined) {
      result.quoteChar = typeProperties.quoteChar;
    }
    
    return result;
  }
```

**AFTER (lines 943-952):**
```typescript
    if (typeProperties.quoteChar !== undefined) {
      result.quoteChar = typeProperties.quoteChar;
    }

    // Add compression object only if it exists
    if (typeProperties.compression !== undefined) {
      result.compression = typeProperties.compression;
    }
    
    return result;
  }
```

**Code to Insert (after line 945):**
```typescript

    // Add compression object only if it exists
    if (typeProperties.compression !== undefined) {
      result.compression = typeProperties.compression;
    }
```

---

### Change 2: buildParquetDatasetProperties()

**Location:** Insert after line 987, before line 989

**Context:**
- Line 985: `if (typeProperties.compressionCodec !== undefined) {`
- Line 986: `result.compressionCodec = typeProperties.compressionCodec;`
- Line 987: `}`
- Line 988: (blank line)
- Line 989: `return result;`

**BEFORE (lines 985-990):**
```typescript
    // Add compression codec only if it exists
    if (typeProperties.compressionCodec !== undefined) {
      result.compressionCodec = typeProperties.compressionCodec;
    }
    
    return result;
  }
```

**AFTER (lines 985-994):**
```typescript
    // Add compression codec only if it exists
    if (typeProperties.compressionCodec !== undefined) {
      result.compressionCodec = typeProperties.compressionCodec;
    }

    // Add compression object only if it exists
    if (typeProperties.compression !== undefined) {
      result.compression = typeProperties.compression;
    }
    
    return result;
  }
```

**Code to Insert (after line 987):**
```typescript

    // Add compression object only if it exists
    if (typeProperties.compression !== undefined) {
      result.compression = typeProperties.compression;
    }
```

---

### Change 3: buildJsonDatasetProperties()

**Location:** Insert after line 1027, before line 1029

**Context:**
- Line 1025: `if (typeProperties.encodingName !== undefined) {`
- Line 1026: `result.encodingName = typeProperties.encodingName;`
- Line 1027: `}`
- Line 1028: (blank line)
- Line 1029: `return result;`

**BEFORE (lines 1025-1030):**
```typescript
    // Add encoding name only if it exists
    if (typeProperties.encodingName !== undefined) {
      result.encodingName = typeProperties.encodingName;
    }
    
    return result;
  }
```

**AFTER (lines 1025-1034):**
```typescript
    // Add encoding name only if it exists
    if (typeProperties.encodingName !== undefined) {
      result.encodingName = typeProperties.encodingName;
    }

    // Add compression object only if it exists
    if (typeProperties.compression !== undefined) {
      result.compression = typeProperties.compression;
    }
    
    return result;
  }
```

**Code to Insert (after line 1027):**
```typescript

    // Add compression object only if it exists
    if (typeProperties.compression !== undefined) {
      result.compression = typeProperties.compression;
    }
```

---

### Change 4: buildBlobDatasetProperties()

**Location:** Insert after line 1066, before line 1068

**Context:**
- Line 1064: `if (Object.keys(locationResult).length > 0) {`
- Line 1065: `result.location = locationResult;`
- Line 1066: `}`
- Line 1067: (blank line)
- Line 1068: `return result;`

**BEFORE (lines 1062-1069):**
```typescript
    
    // Only add location if it has properties
    if (Object.keys(locationResult).length > 0) {
      result.location = locationResult;
    }
    
    return result;
  }
```

**AFTER (lines 1062-1073):**
```typescript
    
    // Only add location if it has properties
    if (Object.keys(locationResult).length > 0) {
      result.location = locationResult;
    }

    // Add compression object only if it exists
    if (typeProperties.compression !== undefined) {
      result.compression = typeProperties.compression;
    }
    
    return result;
  }
```

**Code to Insert (after line 1066):**
```typescript

    // Add compression object only if it exists
    if (typeProperties.compression !== undefined) {
      result.compression = typeProperties.compression;
    }
```

---

## Implementation Summary

**Total Changes:**
- 1 file modified: `src/services/copyActivityTransformer.ts`
- 4 methods updated
- 16 lines added (4 lines × 4 methods)
- 0 lines removed

**Pattern Applied:**
Each method receives identical insertion:
1. Blank line (for spacing)
2. Comment: `// Add compression object only if it exists`
3. Conditional check: `if (typeProperties.compression !== undefined) {`
4. Property assignment: `result.compression = typeProperties.compression;`
5. Closing brace: `}`

---

## Verification

### Step 1: Verify TypeScript Compilation

```powershell
npm run build
```

**Expected Output:**
```
> pipeline-to-fabric-upgrader@1.0.0 build
> tsc

[No errors - build completes successfully]
```

**If build fails:**
- Check that all 4 insertions were made correctly
- Verify no syntax errors (missing braces, semicolons)
- Ensure proper indentation (TypeScript is sensitive to formatting)

---

### Step 2: Verify Changes with Git Diff

```powershell
git diff src/services/copyActivityTransformer.ts
```

**Expected Output:**
- Shows 16 lines added (marked with `+`)
- Shows 4 separate hunks (one per method)
- No lines removed (no `-` marks)
- Each hunk shows the compression check pattern

**Sample Git Diff Output:**
```diff
@@ -777,6 +777,10 @@ export class CopyActivityTransformer {
     if (typeProperties.quoteChar !== undefined) {
       result.quoteChar = typeProperties.quoteChar;
     }
+    
+    // Add compression object only if it exists
+    if (typeProperties.compression !== undefined) {
+      result.compression = typeProperties.compression;
+    }
 
     return result;
   }
```

---

### Step 3: Verify Pattern Consistency

```powershell
# Search for all occurrences of the new compression check
Select-String -Path "src\services\copyActivityTransformer.ts" -Pattern "typeProperties.compression"
```

**Expected Output:**
Should find exactly 4 matches (one per method):
```
src\services\copyActivityTransformer.ts:782:    if (typeProperties.compression !== undefined) {
src\services\copyActivityTransformer.ts:824:    if (typeProperties.compression !== undefined) {
src\services\copyActivityTransformer.ts:864:    if (typeProperties.compression !== undefined) {
src\services\copyActivityTransformer.ts:904:    if (typeProperties.compression !== undefined) {
```

---

### Step 4: Verify File Status

```powershell
git status
```

**Expected Output:**
```
On branch main
Changes not staged for commit:
  modified:   src/services/copyActivityTransformer.ts
```

---

## Acceptance Criteria

Before proceeding to Phase 1, verify:

- [ ] TypeScript compilation succeeds with no errors
- [ ] Git diff shows exactly 16 lines added across 4 methods
- [ ] All 4 methods contain the compression property check
- [ ] Pattern matches existing optional property handling (e.g., `encodingName`)
- [ ] No unintended changes to other parts of the file
- [ ] File compiles without warnings
- [ ] Git status shows only `copyActivityTransformer.ts` as modified

---

## COMMIT

```powershell
# Stage the modified file
git add src/services/copyActivityTransformer.ts

# Commit with detailed conventional message
git commit -m "fix(services): preserve compression property in Copy Activity dataset transformers

- Add compression object support to buildDelimitedTextDatasetProperties
- Add compression object support to buildParquetDatasetProperties
- Add compression object support to buildJsonDatasetProperties
- Add compression object support to buildBlobDatasetProperties
- Fixes issue where ADF datasets with compression lost this property during Fabric transformation
- Follows existing pattern used for optional properties (e.g., encodingName)
- Part of Phase 0: Core Implementation - Compression Property Support"

# Verify commit
git log -1 --pretty=format:"%s%n%n%b"
```

**Expected Commit Output:**
```
fix(services): preserve compression property in Copy Activity dataset transformers

- Add compression object support to buildDelimitedTextDatasetProperties
- Add compression object support to buildParquetDatasetProperties
- Add compression object support to buildJsonDatasetProperties
- Add compression object support to buildBlobDatasetProperties
- Fixes issue where ADF datasets with compression lost this property during Fabric transformation
- Follows existing pattern used for optional properties (e.g., encodingName)
- Part of Phase 0: Core Implementation - Compression Property Support
```

---

## Rollback

If you need to undo this phase:

```powershell
# Revert the changes
git checkout HEAD -- src/services/copyActivityTransformer.ts

# Verify revert
git diff src/services/copyActivityTransformer.ts
# Should show no differences

# Confirm TypeScript still compiles
npm run build
# Should succeed

# Verify clean state
git status
# Should show: nothing to commit, working tree clean
```

---

## Edge Cases Handled

This implementation handles these scenarios:

1. **compression property is undefined:** Property not added to result ✓
2. **compression property is null:** Explicitly copied as null ✓
3. **compression property is empty object `{}`:** Copied as-is ✓
4. **compression property has unexpected structure:** Copied as-is (validation happens upstream) ✓
5. **typeProperties is undefined:** Safe (method already checks `typeProperties || {}`) ✓

---

## Expected Behavior After Fix

### Scenario 1: Dataset WITH Compression
```typescript
// Input (ADF Dataset)
{
  typeProperties: {
    location: { ... },
    compression: {
      type: "gzip",
      level: "Optimal"
    }
  }
}

// Output (Fabric datasetSettings)
{
  typeProperties: {
    location: { ... },
    compression: {
      type: "gzip",
      level: "Optimal"
    }  // ✅ Preserved
  }
}
```

### Scenario 2: Dataset WITHOUT Compression
```typescript
// Input (ADF Dataset)
{
  typeProperties: {
    location: { ... }
    // No compression property
  }
}

// Output (Fabric datasetSettings)
{
  typeProperties: {
    location: { ... }
    // ✅ No compression property added (backwards compatible)
  }
}
```

---

## ⚠️ PATH TROUBLESHOOTING

If you see errors like:
- `Cannot find path 'C:\...\PipelineToFabricUpgrader\src\src\...'` (doubled path)
- Path not found errors for verification commands
- "File not found" when running git commands

**SOLUTION: You are in the wrong directory.**

1. Check your current directory:
```powershell
Get-Location
```

2. Navigate to project root:
```powershell
cd "C:\Users\seanmirabile\OneDrive - Microsoft\Documents\git_repos\PipelineToFabricUpgrader"
```

3. Verify you're in the correct location:
```powershell
# Should list: src/, docs/, package.json, etc.
Get-ChildItem -Directory | Select-Object Name
```

4. Re-run the failed command.

---

## Next Steps

After completing this phase and verifying all acceptance criteria:

1. Confirm TypeScript compilation succeeds
2. Review git diff to ensure changes are correct
3. Commit the changes using the command above
4. Proceed to [Phase 1: Test Coverage](phase_1_test_coverage.md)

---

## Phase Complete

✅ Phase 0 implementation is complete when:
- All 4 methods have compression property support
- TypeScript compiles without errors
- Changes are committed with conventional commit message
- Ready to add test coverage in Phase 1
