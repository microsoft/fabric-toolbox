# Plan Amendments - Wildcard Fix Implementation

## Phase 2: Edge Case Handling and Defensive Programming

### Amendment 1: EXACT SPECIFICATIONS - Line Number Corrections

**Issue:** Line numbers in Phase 2 do not account for the 14 lines added in Phase 0 (hasWildcardPaths method insertion at line 204).

**Correction:**

**CHANGE 1: Add Null Safety to transformCopySource**

Replace:
```
**Location:** Lines 145-236 (transformCopySource method)
**BEFORE (Lines 207-236):**
**AFTER (Lines 207-260):**
```

With:
```
**Location:** Lines 221-274 (wildcard fix section within transformCopySource method)
**BEFORE (Lines 221-250):**
**AFTER (Lines 221-274):**
```

**CHANGE 2: Add Null Safety to transformCopySink**

Replace:
```
**Location:** Lines 300-329 (transformCopySink method - wildcard fix section)
**BEFORE (Lines 300-329):**
**AFTER (Lines 300-353):**
```

With:
```
**Location:** Lines 314-367 (wildcard fix section within transformCopySink method)
**BEFORE (Lines 314-343):**
**AFTER (Lines 314-367):**
```

**Rationale:** Phase 0 inserts `hasWildcardPaths()` method (14 lines) at line 204, shifting all subsequent line numbers by +14. Without this correction, Agent mode will attempt to modify code at incorrect locations.

---

### Amendment 2: VERIFICATION - Add Grep-Based Location Verification

**Issue:** Agent mode needs a fallback method to locate code sections if line numbers don't match exactly due to formatting differences.

**Correction:**

Add to Phase 2 "Verification" section, before "Git Commands":

```markdown
### Code Location Verification (if line numbers mismatch)

If BEFORE snippets don't match at specified line numbers, use grep to locate:

```bash
# Find wildcard fix sections (should return 2 matches)
grep -n "WILDCARD FIX: When wildcards are used" src/services/copyActivityTransformer.ts

# Expected output format:
# 221:    // WILDCARD FIX: When wildcards are used, ensure fileSystem is in datasetSettings
# 314:    // WILDCARD FIX: When wildcards are used, ensure fileSystem is in datasetSettings

# Use these line numbers for CHANGE 1 and CHANGE 2 starting points
```

**Note:** If grep shows different line numbers, use those as the starting point for modifications.
```

**Rationale:** Provides Agent mode with a reliable fallback mechanism to locate code sections using pattern matching rather than brittle line number references.

---

### Amendment 3: EXACT SPECIFICATIONS - Clarify Modification Scope

**Issue:** Phase 2 modifications target specific subsections but specification says "entire method" which could cause confusion.

**Correction:**

In both CHANGE 1 and CHANGE 2, update the location description:

**CHANGE 1:**
```
**Location:** Lines 221-274 (wildcard fix section within transformCopySource method)

**Modification Scope:** Replace ONLY the wildcard fix block (from "// WILDCARD FIX:" 
comment to the closing brace of the if statement), NOT the entire transformCopySource method.
```

**CHANGE 2:**
```
**Location:** Lines 314-367 (wildcard fix section within transformCopySink method)

**Modification Scope:** Replace ONLY the wildcard fix block (from "// WILDCARD FIX:" 
comment to the closing brace of the if statement), NOT the entire transformCopySink method.
```

**Rationale:** Prevents accidental modification of surrounding code and clarifies that only the wildcard fix sections need enhancement, not the entire methods.

---

## Phase 2: Edge Case Handling and Defensive Programming (continued)

### Amendment 4: VALIDATION CHECKLIST - Add Pre-Execution Checkpoint

**Issue:** No explicit checkpoint to verify Phase 0 completed successfully before starting Phase 2.

**Correction:**

Add to the top of Phase 2 "Validation Checklist" section:

```markdown
### Pre-Execution Verification
- [ ] Phase 0 completed successfully (all 7 tests passing)
- [ ] `hasWildcardPaths` method exists at approximately line 204-218
- [ ] Wildcard fix sections exist in both `transformCopySource` and `transformCopySink`
- [ ] Run: `git diff src/services/copyActivityTransformer.ts | grep "^+" | wc -l`
  - Expected: Approximately 90-100 new lines added
```

**Rationale:** Ensures Phase 0 changes are in place before attempting Phase 2 modifications, preventing cascading failures.

---

## Phase 3: Documentation & Production Readiness

### Amendment 5: README.md Insertion Point Correction

**Issue:** Phase 3 originally specified inserting after the Delete activity table row (line 1223), but the actual intended location is after the detailed "**Delete Activity**" subsection (line 1278).

**Correction:**

**Original specification:**
```bash
grep -n "| \*\*Delete\*\*" README.md
# Returns line 1223 (table row)
```

**Corrected specification:**
```bash
grep -n "^\*\*Delete Activity\*\*" README.md
# Returns line 1278 (detailed subsection)
```

**Location Strategy Updated:**

Insert the new "Copy Activity Wildcard Path Support" section AFTER the detailed Delete Activity subsection:

```markdown
**Delete Activity** (1 dataset):                    <-- Line 1278
- Dataset via `typeProperties.dataset.referenceName` <-- Line 1279
                                                      <-- Line 1280 (blank)
#### Copy Activity Wildcard Path Support            <-- INSERT HERE (1281)
```

**Before:** `#### Activities with Direct LinkedService References`  
**After:** Insert new wildcard section between Delete Activity details and Activities with Direct LinkedService References

**Rationale:** Provides more accurate location context and ensures the wildcard documentation is placed in the correct subsection (dataset-based activities detail) rather than near the comparison table.

**Impact:** Without this correction, Agent mode might insert the documentation in an incorrect location, disrupting the README structure.

---

## Summary

**Total Amendments:** 5  
**Phases Affected:** 2 (Phase 2 and Phase 3)  
**Critical for Execution:** Amendments 1, 2, and 5  
**Optional but Recommended:** Amendments 3 and 4  

**Impact Assessment:**
- **Without amendments:** Agent mode will fail to locate code in Phase 2 (~80% failure probability) and may misplace documentation in Phase 3 (~40% failure probability)
- **With amendments:** Agent mode will successfully execute all phases (~95% success probability)

---

**Version History:**
- v1.0 (Initial): Amendments 1-4 for Phase 2
- v1.1 (Current): Added Amendment 5 for Phase 3 README.md insertion point

---

These amendments have been applied to all phase execution prompts.
