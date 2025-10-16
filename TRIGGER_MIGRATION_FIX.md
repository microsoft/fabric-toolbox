# Trigger-to-Schedule Migration Fix

## Summary
Fixed critical bug in trigger-to-schedule migration that prevented any triggers from being migrated successfully to Fabric Schedules. Additionally enhanced support for multi-pipeline triggers.

## Problems Fixed

### 1. Wrong API Endpoint
**Before:** 
```
/workspaces/{workspaceId}/schedules
```

**After:**
```
/workspaces/{workspaceId}/items/{pipelineItemId}/jobs/Pipeline/schedules
```

The endpoint now correctly includes:
- The pipeline item ID in the path
- The job type ('Pipeline') as required by Fabric API

### 2. Wrong Data Path
**Before:**
```typescript
component.definition.recurrence
```

**After:**
```typescript
component.definition.properties.typeProperties.recurrence
```

The code now correctly extracts recurrence data from the ADF trigger's nested structure.

### 3. Missing Pipeline ID
**Before:** Schedule creation didn't include pipeline reference

**After:** Each schedule is created with the specific Fabric pipeline ID it should trigger

### 4. Multi-Pipeline Trigger Support
**Before:** Only the first pipeline in a trigger was handled

**After:** 
- Detects single vs multi-pipeline triggers
- Creates one schedule per pipeline
- Provides detailed status for each schedule
- Returns 'partial' status when some schedules succeed and others fail

## Implementation Details

### Files Modified

#### 1. `src/types/index.ts`
Added `'partial'` status to `DeploymentResult` interface:
```typescript
export interface DeploymentResult {
  // ... existing fields
  status: 'success' | 'failed' | 'skipped' | 'partial';  // Added 'partial'
  details?: string | undefined;  // Added for multi-pipeline details
}
```

#### 2. `src/services/scheduleService.ts`
Complete rewrite of `createSchedule` method:
- **New signature:** Now requires `pipelineId` and `pipelineName` parameters
- **Correct endpoint:** Uses `/items/{pipelineId}/jobs/Pipeline/schedules`
- **Correct data path:** Extracts from `component.definition.properties.typeProperties.recurrence`
- **Frequency mapping:** Maps ADF frequencies to Fabric enum values
- **Better error handling:** Detailed error messages with context

#### 3. `src/services/fabricService.ts`

**Added Helper Methods:**
- `extractPipelineNameFromTriggerRef()`: Handles multiple ADF pipeline reference formats
- `mapFrequencyType()`: Maps ADF frequency strings to Fabric enum values

**Enhanced Trigger Deployment Logic:**
```typescript
case 'trigger':
  // Detects number of pipelines referenced
  // Single pipeline: Creates one schedule
  // Multiple pipelines: Creates schedule for each pipeline
  // No pipelines: Skips with appropriate message
  // Tracks success/failure per pipeline
  // Returns appropriate status: 'success', 'failed', or 'partial'
```

**Updated Deployment Plan Generation:**
- Shows all schedules that will be created
- One entry per pipeline for multi-pipeline triggers
- Includes note about multi-pipeline triggers
- Shows correct endpoint structure

## Frequency Mapping

| ADF Frequency | Fabric Frequency |
|--------------|------------------|
| Minute       | Minute           |
| Hour         | Hour             |
| Day          | Daily            |
| Week         | Weekly           |
| Month        | Monthly          |

## Status Values

| Status    | Meaning                                                      |
|-----------|--------------------------------------------------------------|
| success   | All schedules created successfully                           |
| failed    | All schedules failed to create                               |
| skipped   | Trigger not supported or no pipelines referenced             |
| partial   | Some schedules succeeded, others failed (multi-pipeline only)|

## Multi-Pipeline Trigger Example

**ADF Trigger Definition:**
```json
{
  "name": "DailyTrigger",
  "type": "ScheduleTrigger",
  "properties": {
    "typeProperties": {
      "recurrence": {
        "frequency": "Day",
        "interval": 1,
        "startTime": "2024-01-01T00:00:00Z",
        "timeZone": "UTC"
      },
      "pipelines": [
        { "referenceName": "Pipeline1" },
        { "referenceName": "Pipeline2" },
        { "referenceName": "Pipeline3" }
      ]
    }
  }
}
```

**Result:** 
- 3 separate schedules created in Fabric
- Each attached to its respective pipeline
- Status: 'success' if all 3 succeed, 'partial' if some fail, 'failed' if all fail
- Details field contains per-pipeline results

## Testing Recommendations

1. **Single Pipeline Trigger:** Verify schedule created with correct endpoint and data
2. **Multi-Pipeline Trigger:** Verify one schedule created per pipeline
3. **Non-Deployed Pipeline:** Verify appropriate error message
4. **Partial Failure:** Verify 'partial' status when some pipelines fail
5. **Deployment Plan:** Verify plan shows all schedules that will be created

## Breaking Changes

None - This is a bug fix that makes the feature work as originally intended.

## Migration Notes

If you previously attempted to migrate triggers:
1. Those schedules were not created (API calls failed silently or with errors)
2. You can now re-run the migration to create the schedules correctly
3. Multi-pipeline triggers will now create all necessary schedules

## Related Documentation

- Fabric Schedules API: https://learn.microsoft.com/en-us/rest/api/fabric/pipeline/items/create-pipeline-schedule
- ADF Trigger Reference: https://learn.microsoft.com/en-us/azure/data-factory/concepts-pipeline-execution-triggers
