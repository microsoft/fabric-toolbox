# Quick Execution Guide - Nested ExecutePipeline Fix

## Pre-Flight Checklist

Before starting Phase 0, verify:

```powershell
# 1. You're in the correct directory
Get-Location
# Should show: C:\Users\seanmirabile\OneDrive - Microsoft\Documents\git_repos\PipelineToFabricUpgrader

# 2. Git status is clean (no uncommitted changes)
git status
# Should show: nothing to commit, working tree clean

# 3. TypeScript compiles successfully
npm run build

# 4. All existing tests pass
npm test
```

---

## Execution Order

### Phase 0: Add Recursive Activity Parsing Method
**File:** [phase_0_recursive_parsing.md](./phase_0_recursive_parsing.md)  
**Time:** 15 minutes  
**What it does:** Adds new `parseActivitiesRecursively()` private method

**Quick Steps:**
1. Open `phase_0_recursive_parsing.md`
2. Follow instructions to add the recursive method
3. Run verification commands
4. Commit changes

---

### Phase 1: Integrate Recursive Parsing in Public Method
**File:** [phase_1_integrate_recursive.md](./phase_1_integrate_recursive.md)  
**Time:** 5 minutes  
**What it does:** Updates `parseExecutePipelineActivities()` to use recursive method

**Quick Steps:**
1. Open `phase_1_integrate_recursive.md`
2. Follow instructions to refactor public method
3. Run verification commands
4. Commit changes

---

### Phase 2: Testing & Validation
**File:** [phase_2_testing.md](./phase_2_testing.md)  
**Time:** 10 minutes  
**What it does:** Creates comprehensive test suite with 9 test cases

**Quick Steps:**
1. Open `phase_2_testing.md`
2. Follow instructions to create test file
3. Run tests to verify all pass
4. Commit changes

---

## Post-Execution Verification

After completing all phases:

```powershell
# 1. Verify all 3 commits exist
git log --oneline -3

# 2. Run all tests
npm test

# 3. Run specific nested ExecutePipeline tests
npm test -- invokePipelineService.test.ts

# 4. Build the project
npm run build
```

Expected results:
- ✅ 3 commits with "feat(invoke-pipeline)" and "test(invoke-pipeline)"
- ✅ All tests pass (9 new tests + existing tests)
- ✅ TypeScript compiles without errors
- ✅ No linting issues

---

## Common Issues & Solutions

### Issue: "Cannot find path" errors
**Solution:** You're in the wrong directory. Navigate to project root:
```powershell
cd "C:\Users\seanmirabile\OneDrive - Microsoft\Documents\git_repos\PipelineToFabricUpgrader"
```

### Issue: TypeScript compilation errors
**Solution:** Check that you copied the code exactly as shown in the phase file, including all braces and syntax.

### Issue: Tests fail after Phase 0 or 1
**Solution:** This is expected. Tests are added in Phase 2. Complete all phases before running tests.

### Issue: Merge conflicts
**Solution:** Ensure `git status` is clean before starting. If conflicts occur, rollback and start fresh:
```powershell
git reset --hard HEAD~[N]  # N = number of phases completed
```

---

## Rollback Procedures

### Rollback specific phase:
```powershell
# Rollback Phase 2 only (keep Phases 0 and 1)
git reset --hard HEAD~1

# Rollback Phases 1 and 2 (keep Phase 0)
git reset --hard HEAD~2
```

### Rollback all phases:
```powershell
git reset --hard HEAD~3
```

### Verify rollback:
```powershell
git log --oneline -3
git status
```

---

## Time Tracking

| Phase | Estimated | Actual | Notes |
|-------|-----------|--------|-------|
| Phase 0 | 15 min | ___ min | |
| Phase 1 | 5 min | ___ min | |
| Phase 2 | 10 min | ___ min | |
| **Total** | **30 min** | **___ min** | |

---

## Success Indicators

After completion, you should see:

**Console output when parsing pipelines:**
```
Parsing 2 pipeline components for ExecutePipeline activities (including nested)
Scanning pipeline 'ParentPipeline' with 1 top-level activities
Scanning 1 nested activities in ForEach 'Loop' at path: Loop
Found ExecutePipeline activity at path: Loop → Execute Child (ParentPipeline → ChildPipeline)
Found 1 ExecutePipeline activities (including nested)
```

**Test output:**
```
✓ src/services/__tests__/invokePipelineService.test.ts (9)
  ✓ InvokePipelineService - Nested ExecutePipeline Detection (9)
```

**Git history:**
```
ghi9012 test(invoke-pipeline): add comprehensive nested ExecutePipeline tests
def5678 feat(invoke-pipeline): integrate recursive parsing in public method
abc1234 feat(invoke-pipeline): add recursive activity parsing method
```

---

## Support

If you encounter issues:
1. Check the troubleshooting section in the specific phase file
2. Verify working directory is correct
3. Ensure previous phases completed successfully
4. Review git status and TypeScript errors
5. Consult the main [README.md](./README.md) for detailed information
