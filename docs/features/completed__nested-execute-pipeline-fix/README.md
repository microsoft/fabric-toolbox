# Nested ExecutePipeline Detection Bug Fix

## Overview

This feature fixes a critical bug where ExecutePipeline activities nested inside container activities (ForEach, IfCondition, Switch, Until) are not detected during pipeline dependency analysis. This causes parent pipelines to deploy before their child pipeline dependencies, resulting in deployment failures.

**Problem:** The `parseExecutePipelineActivities()` method only scans top-level activities, missing nested ExecutePipeline references.

**Solution:** Implement recursive activity traversal to detect all ExecutePipeline activities regardless of nesting level.

## Impact

- **Users Affected:** Anyone migrating ADF/Synapse pipelines with nested ExecutePipeline activities
- **Severity:** Critical - blocks migration of common orchestration patterns
- **Files Modified:** 1 production file, 1 new test file

## Phase Execution Order

### Phase 0: Add Recursive Activity Parsing Method
**Estimated Time:** 15 minutes  
**Dependencies:** None  
**Justification:** Creates the recursive parsing infrastructure needed by Phase 1. Must be completed first to establish the method that Phase 1 will call.

[📄 Phase 0 Instructions](./phase_0_recursive_parsing.md)

### Phase 1: Integrate Recursive Parsing in Public Method
**Estimated Time:** 5 minutes  
**Dependencies:** Phase 0 must be complete  
**Justification:** Refactors the public API to use the recursive method. Depends on Phase 0's `parseActivitiesRecursively()` method existing.

[📄 Phase 1 Instructions](./phase_1_integrate_recursive.md)

### Phase 2: Testing & Validation
**Estimated Time:** 10 minutes  
**Dependencies:** Phases 0 and 1 must be complete  
**Justification:** Validates the fix works correctly with comprehensive test coverage. Requires both previous phases to be integrated.

[📄 Phase 2 Instructions](./phase_2_testing.md)

## Total Estimated Time

**30 minutes** (Phase 0: 15 min + Phase 1: 5 min + Phase 2: 10 min)

## Working Directory Requirements

All phases assume you're working from the **project root directory**:

```
C:\Users\seanmirabile\OneDrive - Microsoft\Documents\git_repos\PipelineToFabricUpgrader\
```

Before starting any phase, verify your location:
```powershell
Get-Location
# Should output: C:\Users\seanmirabile\OneDrive - Microsoft\Documents\git_repos\PipelineToFabricUpgrader
```

If you're in the wrong directory:
```powershell
cd "C:\Users\seanmirabile\OneDrive - Microsoft\Documents\git_repos\PipelineToFabricUpgrader"
```

## Rollback Strategy

### Full Rollback (All Phases)
```powershell
# From project root
git reset --hard HEAD~3
```

### Partial Rollback
```powershell
# Rollback Phase 2 only (keep Phases 0 and 1)
git reset --hard HEAD~1

# Rollback Phases 1 and 2 (keep Phase 0)
git reset --hard HEAD~2
```

### Verify Rollback
```powershell
# Check git history
git log --oneline -5

# Verify file state
git diff HEAD src\services\invokePipelineService.ts
```

## Verification After All Phases

After completing all phases, verify the complete implementation:

```powershell
# 1. Check all commits are present
git log --oneline -3
# Should show 3 commits with "feat(invoke-pipeline)" and "test(invoke-pipeline)"

# 2. Verify TypeScript compilation
npm run build

# 3. Run all tests
npm test

# 4. Run specific nested ExecutePipeline tests
npm test -- invokePipelineService.test.ts

# 5. Check for linting issues
npm run lint -- src\services\invokePipelineService.ts
```

## Success Criteria

- [ ] All 3 phases completed without errors
- [ ] TypeScript compiles successfully
- [ ] All 9 new tests pass
- [ ] No existing tests broken
- [ ] Console logs show nested activity detection
- [ ] Deployment order calculation is correct (child before parent)
- [ ] 3 commits created with conventional commit messages

## Risk Assessment

**Risk Level:** Low ✅

- Single file modification (plus tests)
- Follows proven patterns in codebase
- No breaking changes
- Fully backwards compatible
- Easy rollback via git

## Related Documentation

- [Investigation Report](../../../DEPLOYMENT.md) - Original bug investigation
- [Activity Transformer Guide](../../../ACTIVITY_TRANSFORMER_GUIDE.md) - Activity transformation patterns
- [Synapse Support](../../../SYNAPSE_SUPPORT.md) - ADF/Synapse migration details

## Support

If you encounter issues during execution:

1. Check the troubleshooting section in each phase file
2. Verify working directory is correct (project root)
3. Ensure previous phases completed successfully
4. Check git status for uncommitted changes: `git status`
5. Review TypeScript errors: `npx tsc --noEmit`
