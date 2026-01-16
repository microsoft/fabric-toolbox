# Phase 1: Integrate Recursive Parsing in Public Method

## Working Directory

All commands in this phase assume you're in the **project root directory**:

```
C:\Users\seanmirabile\OneDrive - Microsoft\Documents\git_repos\PipelineToFabricUpgrader\
```

Verify your location before starting:
```powershell
Get-Location
```

If you're in the wrong directory, navigate to project root:
```powershell
cd "C:\Users\seanmirabile\OneDrive - Microsoft\Documents\git_repos\PipelineToFabricUpgrader"
```

---

## Goal

Refactor the `parseExecutePipelineActivities()` public method to call the new recursive parsing method (from Phase 0) instead of only scanning top-level activities, and enhance logging to indicate nested activity support.

**Estimated Time:** 5 minutes

**Dependencies:** 
- ✅ Phase 0 must be complete
- ✅ Method `parseActivitiesRecursively()` must exist in `invokePipelineService.ts`

---

## Changes Required

### File: `src/services/invokePipelineService.ts`

**Location:** Lines 35-60 (the public `parseExecutePipelineActivities` method)

**Alternative Search Pattern:** Find the method that starts with `parseExecutePipelineActivities(components: ADFComponent[]): void {` and ends with console.log showing "ExecutePipeline activities" count

#### BEFORE (Lines 35-60):

```typescript
  /**
   * Parses all pipeline components to extract ExecutePipeline activity references
   */
  parseExecutePipelineActivities(components: ADFComponent[]): void {
    this.pipelineComponents = components.filter(comp => comp.type === 'pipeline');
    this.pipelineReferences = [];

    console.log(`Parsing ${this.pipelineComponents.length} pipeline components for ExecutePipeline activities`);

    for (const pipeline of this.pipelineComponents) {
      if (!pipeline.definition?.properties?.activities) continue;

      for (const activity of pipeline.definition.properties.activities) {
        if (activity.type === 'ExecutePipeline') {
          const reference = this.extractPipelineReference(pipeline.name, activity);
          if (reference) {
            this.pipelineReferences.push(reference);
            console.log(`Found ExecutePipeline activity: ${reference.parentPipelineName} -> ${reference.targetPipelineName}`);
          }
        }
      }
    }

    // Update isReferencedByOthers flag
    this.updateReferencedFlags();

    console.log(`Found ${this.pipelineReferences.length} ExecutePipeline activities`);
  }
```

#### AFTER (Lines 35-60):

```typescript
  /**
   * Parses all pipeline components to extract ExecutePipeline activity references
   * NOW SUPPORTS NESTED ACTIVITIES in ForEach, IfCondition, Switch, Until containers
   */
  parseExecutePipelineActivities(components: ADFComponent[]): void {
    this.pipelineComponents = components.filter(comp => comp.type === 'pipeline');
    this.pipelineReferences = [];

    console.log(`Parsing ${this.pipelineComponents.length} pipeline components for ExecutePipeline activities (including nested)`);

    for (const pipeline of this.pipelineComponents) {
      if (!pipeline.definition?.properties?.activities) {
        console.log(`Skipping pipeline '${pipeline.name}' - no activities found`);
        continue;
      }

      console.log(`Scanning pipeline '${pipeline.name}' with ${pipeline.definition.properties.activities.length} top-level activities`);
      
      // Recursively parse all activities including nested ones
      this.parseActivitiesRecursively(pipeline.name, pipeline.definition.properties.activities);
    }

    // Update isReferencedByOthers flag
    this.updateReferencedFlags();

    console.log(`Found ${this.pipelineReferences.length} ExecutePipeline activities (including nested)`);
  }
```

---

## Implementation Steps

1. **Open the file** `src\services\invokePipelineService.ts`

2. **Locate the method:** Find `parseExecutePipelineActivities` method (starts around line 35)

3. **Replace the method** with the AFTER version above

4. **Key changes:**
   - Update JSDoc comment to mention nested activity support
   - Add "(including nested)" to console log messages
   - Add per-pipeline activity count logging
   - Replace nested for-loop with call to `this.parseActivitiesRecursively()`
   - Add skip message for pipelines without activities

5. **Verify syntax:** Ensure proper indentation and brace matching

---

## Verification

Run these commands from the **project root** to verify the changes:

```powershell
# 1. Verify TypeScript compilation
npm run build

# 2. Alternative: Check TypeScript without building
npx tsc --noEmit

# 3. Verify the method was updated (check for new text)
Select-String -Path "src\services\invokePipelineService.ts" -Pattern "NOW SUPPORTS NESTED ACTIVITIES"
Select-String -Path "src\services\invokePipelineService.ts" -Pattern "including nested"
Select-String -Path "src\services\invokePipelineService.ts" -Pattern "parseActivitiesRecursively"

# 4. Verify old nested loop was removed (should return no results)
Select-String -Path "src\services\invokePipelineService.ts" -Pattern "for \(const activity of pipeline.definition.properties.activities\)"

# 5. Check for linting issues
npm run lint -- src\services\invokePipelineService.ts
```

---

## Acceptance Criteria

- [ ] File `src\services\invokePipelineService.ts` compiles without TypeScript errors
- [ ] Method `parseExecutePipelineActivities` updated at lines 35-60
- [ ] JSDoc comment includes "NOW SUPPORTS NESTED ACTIVITIES" text
- [ ] Console.log statements include "(including nested)" text
- [ ] Method calls `this.parseActivitiesRecursively()` (replacing old for-loop)
- [ ] Old nested for-loop over `activity.type === 'ExecutePipeline'` removed
- [ ] Per-pipeline logging added showing top-level activity count
- [ ] Skip message added for pipelines without activities
- [ ] No linting errors reported

---

## COMMIT

After verifying all acceptance criteria are met, commit your changes:

```powershell
git add src\services\invokePipelineService.ts
git commit -m "feat(invoke-pipeline): integrate recursive parsing in public method

- Refactor parseExecutePipelineActivities() to use recursive scanner
- Replace flat loop with call to parseActivitiesRecursively()
- Enhance logging to indicate nested activity support
- Add per-pipeline activity count logging
- Part 2 of 2: Integration complete (fixes nested ExecutePipeline bug)"
```

Verify the commit:
```powershell
# Check commit was created
git log -1 --oneline

# Check both commits exist
git log --oneline -2

# Should output something like:
# def5678 feat(invoke-pipeline): integrate recursive parsing in public method
# abc1234 feat(invoke-pipeline): add recursive activity parsing method
```

---

## Rollback

If you need to undo this phase:

```powershell
# Rollback just this phase (keep Phase 0)
git reset --hard HEAD~1

# Verify rollback
git log -1 --oneline
# Should show only Phase 0 commit

# OR: Rollback both phases
git reset --hard HEAD~2

# Verify complete rollback
git log -1 --oneline
git diff HEAD src\services\invokePipelineService.ts
# Should show no differences
```

---

## Final Review

Before proceeding to Phase 2, review the changes:

```powershell
# View the Phase 1 diff
git diff HEAD~1 src\services\invokePipelineService.ts

# View cumulative diff (both phases)
git diff HEAD~2 src\services\invokePipelineService.ts

# Check git history
git log --oneline -2 --decorate
```

---

## Expected Behavior

After this phase, when pipelines are parsed:

**Console output will show:**
```
Parsing 2 pipeline components for ExecutePipeline activities (including nested)
Scanning pipeline 'ParentPipeline' with 1 top-level activities
Scanning 2 nested activities in ForEach 'Loop' at path: Loop
Found ExecutePipeline activity at path: Loop → Execute Child (ParentPipeline → ChildPipeline)
Found 1 ExecutePipeline activities (including nested)
```

**Before this phase, console showed:**
```
Parsing 2 pipeline components for ExecutePipeline activities
Found 0 ExecutePipeline activities
```

---

## ⚠️ PATH TROUBLESHOOTING

If you see errors like:
- `Cannot find path 'C:\...\PipelineToFabricUpgrader\src\src\...'` (doubled path)
- Path not found errors for verification commands
- `Select-String : Cannot find path` errors

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
# Should list: src/, docs/, public/, etc.
Get-ChildItem -Directory
```

4. Re-run the failed command.

---

## Next Steps

Once this phase is complete and committed, proceed to:

**[Phase 2: Testing & Validation](./phase_2_testing.md)**
