# Copy Activity Wildcard Path FileSystem Fix

## Feature Overview

**Problem:** When ADF/Synapse Copy Activities use wildcard paths (`wildcardFolderPath` or `wildcardFileName`), the transformation to Fabric fails at runtime because the `fileSystem` property is missing from `datasetSettings.typeProperties.location`.

**Solution:** Automatically detect wildcard usage and ensure the `fileSystem` property from the dataset is properly included in the Fabric `datasetSettings` object.

**Impact:**
- ✅ Fixes runtime failures in Fabric for Copy Activities with wildcard paths
- ✅ Supports nested activities (ForEach, IfCondition, Switch, Until)
- ✅ Handles all parameter types (hardcoded, parameterized, global parameters)
- ✅ Backward compatible with existing transformations

---

## Phase Execution Order

Execute phases sequentially in the following order:

### Phase 0: Core Implementation (1.5 hours)
**File:** [phase_0_core_implementation.md](phase_0_core_implementation.md)

**Goal:** Implement wildcard detection and fileSystem fix in `CopyActivityTransformer`

**Deliverables:**
- `hasWildcardPaths()` helper method
- Enhanced `transformCopySource()` with wildcard fix
- Enhanced `transformCopySink()` with wildcard fix
- Basic unit tests (7 test cases)

**Dependencies:** None (initial phase)

**Justification:** Must implement core logic before testing or hardening

---

### Phase 1: Integration Testing (1.5 hours)
**File:** [phase_1_integration_tests.md](phase_1_integration_tests.md)

**Goal:** Verify wildcard fix works for nested activities and real-world scenarios

**Deliverables:**
- Integration test suite for nested activities
- User-provided pipeline3 example test (exact reproduction)
- Validation module with report generation

**Dependencies:** Phase 0 core implementation

**Justification:** Must verify fix works in complex, nested scenarios before production

---

### Phase 2: Edge Case Handling (1 hour)
**File:** [phase_2_edge_cases.md](phase_2_edge_cases.md)

**Goal:** Add defensive programming and edge case handling

**Deliverables:**
- Null/undefined safety checks
- Non-standard data type handling
- String validation (whitespace, empty strings)
- Edge case test suite (10 test cases)

**Dependencies:** Phase 0 implementation (modifies wildcard fix sections)

**Justification:** Must harden implementation before documentation/production

**⚠️ IMPORTANT:** This phase includes amendments for correct line numbers after Phase 0 changes.

---

### Phase 3: Documentation & Production Readiness (1 hour)
**File:** [phase_3_documentation.md](phase_3_documentation.md)

**Goal:** Create comprehensive documentation and deployment checklist

**Deliverables:**
- README.md updates with wildcard fix section
- Enhanced code documentation (JSDoc)
- WILDCARD_FIX_GUIDE.md troubleshooting guide
- Production deployment checklist

**Dependencies:** All previous phases (documents complete feature)

**Justification:** Documentation ensures maintainability and troubleshooting capability

---

## Total Estimated Time

**Development:** 5 hours  
**Testing:** Included in each phase  
**Documentation:** Included in Phase 3  

**Total:** 5 hours (can be completed in one work day)

---

## Rollback Strategy

### Per-Phase Rollback

Each phase can be rolled back independently:

```bash
# Rollback Phase 0
# First, check file status
git status src/services/__tests__/copyActivityTransformer.test.ts

# If file is new/untracked:
rm src/services/__tests__/copyActivityTransformer.test.ts

# If file is modified/committed:
git checkout src/services/__tests__/copyActivityTransformer.test.ts

# Always restore modified files:
git checkout src/services/copyActivityTransformer.ts

# Rollback Phase 1
# Check status of new files
git status src/services/__tests__/copyActivityWildcardIntegration.test.ts
git status src/validation/wildcard-copy-activity-validation.ts

# If files are new/untracked:
rm src/services/__tests__/copyActivityWildcardIntegration.test.ts
rm src/validation/wildcard-copy-activity-validation.ts

# If files are modified/committed:
git checkout src/services/__tests__/copyActivityWildcardIntegration.test.ts
git checkout src/validation/wildcard-copy-activity-validation.ts

# Rollback Phase 2
# Check file status
git status src/services/__tests__/copyActivityEdgeCases.test.ts

# If test file is new/untracked:
rm src/services/__tests__/copyActivityEdgeCases.test.ts

# If test file is modified/committed:
git checkout src/services/__tests__/copyActivityEdgeCases.test.ts

# Always restore modified transformer:
git checkout src/services/copyActivityTransformer.ts

# Rollback Phase 3
# Check status of new guide file
git status docs/WILDCARD_FIX_GUIDE.md

# If guide is new/untracked:
rm docs/WILDCARD_FIX_GUIDE.md

# If guide is modified/committed:
git checkout docs/WILDCARD_FIX_GUIDE.md

# Restore modified files:
git checkout README.md
git checkout src/services/copyActivityTransformer.ts
```

### Complete Rollback

To rollback all changes:

```bash
# First check status of all files
git status

# Remove new untracked files (if not yet committed)
rm -f src/services/__tests__/copyActivityTransformer.test.ts
rm -f src/services/__tests__/copyActivityWildcardIntegration.test.ts
rm -f src/services/__tests__/copyActivityEdgeCases.test.ts
rm -f src/validation/wildcard-copy-activity-validation.ts
rm -f docs/WILDCARD_FIX_GUIDE.md

# Restore all modified files
git checkout src/services/copyActivityTransformer.ts
git checkout README.md

# Verify rollback success
git status
# Expected: Working directory clean
```

Or use git reset:

```bash
# Reset to before implementation started
git reset --hard HEAD~[number_of_commits]

# Note: Only use if changes are on a feature branch
```

---

## Validation & Testing

### Unit Tests
```bash
npm test -- __tests__/copyActivityTransformer.test.ts
```

### Integration Tests
```bash
npm test -- __tests__/copyActivityWildcardIntegration.test.ts
```

### Edge Case Tests
```bash
npm test -- __tests__/copyActivityEdgeCases.test.ts
```

### Full Test Suite
```bash
npm test
```

### Expected Test Coverage
- **Total Test Cases:** 24
- **Unit Tests:** 7
- **Integration Tests:** 7
- **Edge Case Tests:** 10

---

## Amendments Applied

This implementation includes all validated amendments. See [AMENDMENTS.md](AMENDMENTS.md) for details.

**Critical Amendments:**
- ✅ Amendment 1: Line number corrections for Phase 2 (accounting for Phase 0 additions)
- ✅ Amendment 2: Grep-based code location verification as fallback
- ✅ Amendment 3: Clarified modification scope for Phase 2 changes
- ✅ Amendment 4: Added pre-execution checkpoints
- ✅ Amendment 5: README.md insertion point correction for Phase 3

---

## Production Deployment Checklist

Before deploying to production:

- [ ] All phases completed successfully
- [ ] All 24 tests passing
- [ ] No TypeScript compilation errors
- [ ] Code review completed
- [ ] Documentation reviewed
- [ ] Rollback strategy tested
- [ ] Console logging verified in dev environment
- [ ] At least one real-world pipeline tested with wildcards

---

## Support & Troubleshooting

After implementation, refer to:
- **Troubleshooting Guide:** `docs/WILDCARD_FIX_GUIDE.md`
- **README Section:** Activity Support → Copy Activity Wildcard Path Support
- **Code Documentation:** JSDoc comments in `src/services/copyActivityTransformer.ts`

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | Jan 2026 | Initial implementation with 4 phases |

---

## Quick Start

```bash
# 1. Execute Phase 0
# Copy content from phase_0_core_implementation.md and execute

# 2. Verify Phase 0
npm test -- __tests__/copyActivityTransformer.test.ts

# 3. Execute Phase 1
# Copy content from phase_1_integration_tests.md and execute

# 4. Verify Phase 1
npm test -- __tests__/copyActivityWildcardIntegration.test.ts

# 5. Execute Phase 2 (includes amendments)
# Copy content from phase_2_edge_cases.md and execute

# 6. Verify Phase 2
npm test -- __tests__/copyActivityEdgeCases.test.ts

# 7. Execute Phase 3
# Copy content from phase_3_documentation.md and execute

# 8. Final verification
npm test
```

---

**Status:** ✅ Ready for execution  
**Validation:** ✅ Passed with amendments applied  
**Confidence:** 95%
