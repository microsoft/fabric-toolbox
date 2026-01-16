# Phase 0: Add Recursive Activity Parsing Method

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

Add a new private method `parseActivitiesRecursively()` to the `InvokePipelineService` class that recursively scans all activities at all nesting levels for ExecutePipeline activities, supporting ForEach, IfCondition, Switch, and Until container types.

**Estimated Time:** 15 minutes

**Dependencies:** None (initial phase)

---

## Changes Required

### File: `src/services/invokePipelineService.ts`

**Location:** After line 83 (after the closing brace of `extractPipelineReference` method, before `updateReferencedFlags` method)

**Alternative Search Pattern:** Insert after the method that ends with `isReferencedByOthers: false // Will be updated later` and before the method that starts with `private updateReferencedFlags(): void`

#### BEFORE (Lines 61-88):

```typescript
  /**
   * Extracts pipeline reference information from an ExecutePipeline activity
   */
  private extractPipelineReference(parentPipelineName: string, activity: any): PipelineReference | null {
    if (!activity.typeProperties?.pipeline?.referenceName) {
      console.warn(`ExecutePipeline activity '${activity.name}' missing pipeline reference`);
      return null;
    }

    return {
      parentPipelineName,
      activityName: activity.name,
      targetPipelineName: activity.typeProperties.pipeline.referenceName,
      activityType: activity.type,
      waitOnCompletion: activity.typeProperties.waitOnCompletion !== false, // Default to true
      parameters: activity.typeProperties.parameters || {},
      isReferencedByOthers: false // Will be updated later
    };
  }

  /**
   * Updates the isReferencedByOthers flag for all pipeline references
   */
  private updateReferencedFlags(): void {
```

#### AFTER (Lines 61-169):

```typescript
  /**
   * Extracts pipeline reference information from an ExecutePipeline activity
   */
  private extractPipelineReference(parentPipelineName: string, activity: any): PipelineReference | null {
    if (!activity.typeProperties?.pipeline?.referenceName) {
      console.warn(`ExecutePipeline activity '${activity.name}' missing pipeline reference`);
      return null;
    }

    return {
      parentPipelineName,
      activityName: activity.name,
      targetPipelineName: activity.typeProperties.pipeline.referenceName,
      activityType: activity.type,
      waitOnCompletion: activity.typeProperties.waitOnCompletion !== false, // Default to true
      parameters: activity.typeProperties.parameters || {},
      isReferencedByOthers: false // Will be updated later
    };
  }

  /**
   * Recursively parses activities to find ExecutePipeline activities at all nesting levels
   * Handles ForEach, IfCondition, Switch, Until container activities
   * @param pipelineName The parent pipeline name
   * @param activities Array of activities to scan
   * @param nestingPath Current nesting path for logging (optional)
   */
  private parseActivitiesRecursively(pipelineName: string, activities: any[], nestingPath: string = ''): void {
    if (!Array.isArray(activities)) {
      console.warn(`parseActivitiesRecursively called with non-array activities for pipeline '${pipelineName}'`);
      return;
    }

    for (const activity of activities) {
      if (!activity || typeof activity !== 'object') {
        continue;
      }

      const activityPath = nestingPath ? `${nestingPath} → ${activity.name}` : activity.name;

      // Check if current activity is ExecutePipeline
      if (activity.type === 'ExecutePipeline') {
        const reference = this.extractPipelineReference(pipelineName, activity);
        if (reference) {
          this.pipelineReferences.push(reference);
          console.log(`Found ExecutePipeline activity at path: ${activityPath} (${reference.parentPipelineName} → ${reference.targetPipelineName})`);
        }
      }

      // Recursively process nested activities in container types
      if (activity.typeProperties) {
        // ForEach container
        if (activity.type === 'ForEach' && Array.isArray(activity.typeProperties.activities)) {
          const nestedCount = activity.typeProperties.activities.length;
          console.log(`Scanning ${nestedCount} nested activities in ForEach '${activity.name}' at path: ${activityPath}`);
          this.parseActivitiesRecursively(pipelineName, activity.typeProperties.activities, activityPath);
        }

        // IfCondition container
        if (activity.type === 'IfCondition') {
          if (Array.isArray(activity.typeProperties.ifTrueActivities) && activity.typeProperties.ifTrueActivities.length > 0) {
            const nestedCount = activity.typeProperties.ifTrueActivities.length;
            console.log(`Scanning ${nestedCount} nested activities in IfCondition '${activity.name}' (ifTrue branch) at path: ${activityPath}`);
            this.parseActivitiesRecursively(pipelineName, activity.typeProperties.ifTrueActivities, `${activityPath} [ifTrue]`);
          }
          if (Array.isArray(activity.typeProperties.ifFalseActivities) && activity.typeProperties.ifFalseActivities.length > 0) {
            const nestedCount = activity.typeProperties.ifFalseActivities.length;
            console.log(`Scanning ${nestedCount} nested activities in IfCondition '${activity.name}' (ifFalse branch) at path: ${activityPath}`);
            this.parseActivitiesRecursively(pipelineName, activity.typeProperties.ifFalseActivities, `${activityPath} [ifFalse]`);
          }
        }

        // Until container
        if (activity.type === 'Until' && Array.isArray(activity.typeProperties.activities)) {
          const nestedCount = activity.typeProperties.activities.length;
          console.log(`Scanning ${nestedCount} nested activities in Until '${activity.name}' at path: ${activityPath}`);
          this.parseActivitiesRecursively(pipelineName, activity.typeProperties.activities, activityPath);
        }

        // Switch container
        if (activity.type === 'Switch') {
          if (Array.isArray(activity.typeProperties.cases)) {
            for (let i = 0; i < activity.typeProperties.cases.length; i++) {
              const switchCase = activity.typeProperties.cases[i];
              if (switchCase && Array.isArray(switchCase.activities) && switchCase.activities.length > 0) {
                const nestedCount = switchCase.activities.length;
                console.log(`Scanning ${nestedCount} nested activities in Switch '${activity.name}' (case ${i}) at path: ${activityPath}`);
                this.parseActivitiesRecursively(pipelineName, switchCase.activities, `${activityPath} [case ${i}]`);
              }
            }
          }
          if (Array.isArray(activity.typeProperties.defaultActivities) && activity.typeProperties.defaultActivities.length > 0) {
            const nestedCount = activity.typeProperties.defaultActivities.length;
            console.log(`Scanning ${nestedCount} nested activities in Switch '${activity.name}' (default case) at path: ${activityPath}`);
            this.parseActivitiesRecursively(pipelineName, activity.typeProperties.defaultActivities, `${activityPath} [default]`);
          }
        }
      }
    }
  }

  /**
   * Updates the isReferencedByOthers flag for all pipeline references
   */
  private updateReferencedFlags(): void {
```

---

## Implementation Steps

1. **Open the file** `src\services\invokePipelineService.ts`

2. **Locate the insertion point:** Find the `extractPipelineReference` method (ends around line 83)

3. **Insert the new method** between `extractPipelineReference` and `updateReferencedFlags` methods

4. **Verify syntax:** Ensure proper indentation and brace matching

---

## Verification

Run these commands from the **project root** to verify the changes:

```powershell
# 1. Verify TypeScript compilation
npm run build

# 2. Alternative: Check TypeScript without building
npx tsc --noEmit

# 3. Verify the method was added (search for method name)
Select-String -Path "src\services\invokePipelineService.ts" -Pattern "parseActivitiesRecursively"

# 4. Check file line count increased (should be ~81-85 lines added)
(Get-Content "src\services\invokePipelineService.ts").Length
# Original: ~335 lines, After: ~416-420 lines

# 5. Verify method signature is correct
Select-String -Path "src\services\invokePipelineService.ts" -Pattern "private parseActivitiesRecursively\(pipelineName: string, activities: any\[\], nestingPath: string = ''\): void"
```

---

## Acceptance Criteria

- [ ] File `src\services\invokePipelineService.ts` compiles without TypeScript errors
- [ ] New method `parseActivitiesRecursively` exists after line 83
- [ ] Method signature matches: `private parseActivitiesRecursively(pipelineName: string, activities: any[], nestingPath: string = ''): void`
- [ ] Method includes all 5 container types: ForEach, IfCondition (ifTrue/ifFalse), Until, Switch (cases/default)
- [ ] Null/undefined checks present for activities array and activity objects
- [ ] Console.log statements present for each container type detection
- [ ] JSDoc comment present above method signature
- [ ] Method appears between `extractPipelineReference` and `updateReferencedFlags` methods
- [ ] File size increased by approximately 81-85 lines

---

## COMMIT

After verifying all acceptance criteria are met, commit your changes:

```powershell
git add src\services\invokePipelineService.ts
git commit -m "feat(invoke-pipeline): add recursive activity parsing method

- Add parseActivitiesRecursively() private method
- Support ForEach, IfCondition, Switch, Until container types
- Implement depth-first traversal with nesting path tracking
- Add comprehensive logging for nested activity detection
- Part 1 of 2: Method implementation (integration in next phase)"
```

Verify the commit:
```powershell
# Check commit was created
git log -1 --oneline

# Should output something like:
# abc1234 feat(invoke-pipeline): add recursive activity parsing method
```

---

## Rollback

If you need to undo this phase:

```powershell
# Rollback the commit
git reset --hard HEAD~1

# Verify rollback
git log -1 --oneline
git diff HEAD src\services\invokePipelineService.ts
# Should show no differences
```

---

## Final Review

Before proceeding to Phase 1, review the changes:

```powershell
# View the complete diff
git diff HEAD~1 src\services\invokePipelineService.ts

# View just the added method
git diff HEAD~1 src\services\invokePipelineService.ts | Select-String -Pattern "parseActivitiesRecursively" -Context 5
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

**[Phase 1: Integrate Recursive Parsing in Public Method](./phase_1_integrate_recursive.md)**
