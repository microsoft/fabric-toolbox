# Output Formatting in MicrosoftFabricMgmt

## Overview

The MicrosoftFabricMgmt module includes intelligent output formatting to make PowerShell command results more user-friendly and actionable. Instead of displaying raw API responses with GUIDs, the module automatically resolves IDs to human-readable names and presents information in a consistent, readable format.

## Key Features

### 1. Automatic Name Resolution

The module automatically resolves GUIDs to display names for:
- **Capacity IDs** → Capacity Names
- **Workspace IDs** → Workspace Names

This happens transparently in the background using cached lookups for optimal performance.

### 2. Consistent Display Priority

All objects are formatted with a consistent column order:
1. **Capacity Name** (resolved from capacityId)
2. **Workspace Name** (resolved from workspaceId)
3. **Item Name** (displayName property)
4. **Item Type** (type property)
5. **ID** (unique identifier)
6. Additional properties...

### 3. Intelligent Caching

Name resolutions are cached using PSFramework's configuration system:
- First lookup calls the API
- Subsequent lookups use cached values
- Significantly improves performance for repeated queries
- Cache persists across PowerShell sessions
- Can be cleared when needed

## Format Views

The module includes specialized format views for different resource types:

### Fabric Item View
Used for most Fabric resources (Lakehouse, Notebook, Warehouse, Data Pipeline, etc.)

**Columns:**
- Capacity Name (25 chars)
- Workspace Name (25 chars)
- Item Name (30 chars)
- Type (15 chars)
- ID

**Applies to:**
- MicrosoftFabric.Lakehouse
- MicrosoftFabric.Notebook
- MicrosoftFabric.Warehouse
- MicrosoftFabric.DataPipeline
- MicrosoftFabric.Environment
- MicrosoftFabric.Eventhouse
- MicrosoftFabric.KQLDatabase
- MicrosoftFabric.KQLQueryset
- MicrosoftFabric.MLExperiment
- MicrosoftFabric.MLModel
- MicrosoftFabric.Report
- MicrosoftFabric.SemanticModel
- MicrosoftFabric.SparkJobDefinition

### Workspace View
Specialized view for workspace objects

**Columns:**
- Capacity Name (25 chars)
- Workspace Name (35 chars)
- Type (15 chars)
- ID

**Applies to:**
- MicrosoftFabric.Workspace

### Capacity View
Specialized view for capacity objects

**Columns:**
- Capacity Name (25 chars)
- Region (20 chars)
- State (12 chars)
- SKU (10 chars)
- ID

**Applies to:**
- MicrosoftFabric.Capacity

### Domain View
Specialized view for domain objects

**Columns:**
- Domain Name (30 chars)
- Description (40 chars)
- Parent Domain ID (20 chars)
- ID

**Applies to:**
- MicrosoftFabric.Domain

### Job View
Specialized view for job-related objects

**Columns:**
- Job Name (30 chars)
- Workspace Name (25 chars)
- Status (15 chars)
- Type (15 chars)
- ID

**Applies to:**
- MicrosoftFabric.SparkJob
- MicrosoftFabric.CopyJob
- MicrosoftFabric.ApacheAirflowJob

## Helper Functions

### Resolve-FabricCapacityName (Private)

Converts a capacity GUID to its display name.

**Parameters:**
- `CapacityId` (mandatory) - The capacity GUID to resolve
- `DisableCache` (switch) - Bypass cache and force API lookup

**Behavior:**
- First checks PSFramework cache for existing resolution
- If not cached, calls `Get-FabricCapacity` to retrieve the name
- Caches the result for future use
- Returns the capacity ID as fallback if resolution fails
- Supports pipeline input

**Cache Key Format:** `MicrosoftFabricMgmt.Cache.CapacityName_{CapacityId}`

**Example:**
```powershell
# Internal usage in format files
$capacityName = Resolve-FabricCapacityName -CapacityId "12345-guid-here"
# Returns: "Premium Capacity P1"
```

### Resolve-FabricWorkspaceName (Private)

Converts a workspace GUID to its display name.

**Parameters:**
- `WorkspaceId` (mandatory) - The workspace GUID to resolve
- `DisableCache` (switch) - Bypass cache and force API lookup

**Behavior:**
- First checks PSFramework cache for existing resolution
- If not cached, calls `Get-FabricWorkspace` to retrieve the name
- Caches the result for future use
- Returns the workspace ID as fallback if resolution fails
- Supports pipeline input (by value and by property name)

**Cache Key Format:** `MicrosoftFabricMgmt.Cache.WorkspaceName_{WorkspaceId}`

**Example:**
```powershell
# Internal usage in format files
$workspaceName = Resolve-FabricWorkspaceName -WorkspaceId "67890-guid-here"
# Returns: "Analytics Workspace"
```

### Resolve-FabricCapacityIdFromWorkspace (Private)

Resolves a capacity ID from a workspace ID when items only have workspace information.

**Parameters:**
- `WorkspaceId` (mandatory) - The workspace GUID to resolve
- `DisableCache` (switch) - Bypass cache and force API lookup

**Behavior:**
- First checks PSFramework cache for existing resolution
- If not cached, calls `Get-FabricWorkspace` to retrieve the workspace object
- Extracts the capacityId from the workspace
- Caches the result for future use
- Returns `$null` if workspace has no capacity assigned
- Supports pipeline input (by value and by property name)

**Cache Key Format:** `MicrosoftFabricMgmt.Cache.WorkspaceCapacityId_{WorkspaceId}`

**Why This Is Needed:**
Some Fabric items (like Lakehouses, Notebooks, etc.) only return `workspaceId` in their API response, not `capacityId`. To display the Capacity Name, we need to:
1. Resolve the workspaceId → workspace object
2. Extract capacityId from the workspace
3. Resolve capacityId → capacity name

This function handles step 1-2 of the cascading resolution.

**Example:**
```powershell
# Internal usage in format files
$capacityId = Resolve-FabricCapacityIdFromWorkspace -WorkspaceId "67890-guid-here"
if ($capacityId) {
    $capacityName = Resolve-FabricCapacityName -CapacityId $capacityId
}
# Returns: "Premium Capacity P1"
```

### Clear-FabricNameCache (Public)

Clears all cached capacity and workspace name resolutions.

**Parameters:**
- `Force` (switch) - Skip confirmation prompt

**Behavior:**
- Removes all cached name resolutions from PSFramework configuration
- Sets cached values to `$null` to clear runtime cache
- Unregisters persisted configuration to clear disk cache
- Supports `-WhatIf` for testing
- Reports number of cache entries cleared
- Clears all cache types: CapacityName, WorkspaceName, and WorkspaceCapacityId

**When to Use:**
- Capacity or workspace names have been renamed
- Cached data appears stale or incorrect
- Want to reduce memory usage from large caches
- Troubleshooting name resolution issues

**Example:**
```powershell
# Clear all cached names
Clear-FabricNameCache -Force

# Output: Successfully cleared 42 cached name resolution(s)
```

```powershell
# Test what would be cleared (WhatIf)
Clear-FabricNameCache -WhatIf

# Output: What if: Performing the operation "Clear all cached capacity and workspace names" on target "Fabric Name Cache".
```

## Performance Characteristics

### First Lookup
- Makes API call to retrieve capacity/workspace details
- Typically takes 100-500ms depending on API latency
- Result is cached for future use

### Cached Lookup
- Reads from PSFramework configuration store
- Typically takes <1ms
- Dramatically improves performance for repeated queries

### Batch Operations
For operations that query many items:
```powershell
# First call: 20 items × ~200ms = ~4 seconds
Get-FabricLakehouse -WorkspaceId "workspace-1"

# Second call: Same workspace, results are cached
# 20 items × <1ms = ~20ms (200x faster!)
Get-FabricNotebook -WorkspaceId "workspace-1"
```

## Technical Implementation

### Format File Location
[MicrosoftFabricMgmt.Format.ps1xml](../source/MicrosoftFabricMgmt.Format.ps1xml)

### Format File Registration
The format file is automatically loaded when the module is imported via the `FormatsToProcess` key in the module manifest ([MicrosoftFabricMgmt.psd1:65](../source/MicrosoftFabricMgmt.psd1#L65)).

### ScriptBlock Resolution

Format files use PowerShell ScriptBlocks to dynamically resolve names.

#### Simple Resolution (Direct capacityId available)

When objects have a `capacityId` property:

```xml
<TableColumnItem>
  <ScriptBlock>
    if ($_.capacityId) {
      try {
        Resolve-FabricCapacityName -CapacityId $_.capacityId
      }
      catch {
        $_.capacityId
      }
    }
    else {
      'N/A'
    }
  </ScriptBlock>
</TableColumnItem>
```

#### Cascading Resolution (Only workspaceId available)

Many Fabric items (Lakehouses, Notebooks, etc.) only include `workspaceId` in their API response. For these items, we use cascading resolution:

```xml
<TableColumnItem>
  <ScriptBlock>
    if ($_.capacityId) {
      # Direct resolution if capacityId exists
      try {
        Resolve-FabricCapacityName -CapacityId $_.capacityId
      }
      catch {
        $_.capacityId
      }
    }
    elseif ($_.workspaceId) {
      # Cascade: workspaceId -> capacityId -> capacity name
      try {
        $capacityId = Resolve-FabricCapacityIdFromWorkspace -WorkspaceId $_.workspaceId
        if ($capacityId) {
          Resolve-FabricCapacityName -CapacityId $capacityId
        }
        else {
          'N/A'
        }
      }
      catch {
        'N/A'
      }
    }
    else {
      'N/A'
    }
  </ScriptBlock>
</TableColumnItem>
```

**Cascading Resolution Flow:**
1. Check if object has `capacityId` → resolve directly
2. If not, check for `workspaceId` → call `Resolve-FabricCapacityIdFromWorkspace`
3. Get workspace object and extract its `capacityId`
4. Use extracted `capacityId` to get capacity name
5. All intermediate results are cached for performance

This approach:
- Only resolves IDs when they exist
- Falls back to the GUID if resolution fails
- Displays 'N/A' if the property doesn't exist or workspace has no capacity
- Handles errors gracefully
- Caches both workspace→capacity and capacity→name lookups

### Type Name Decoration (Future Enhancement)

Currently, the format views are defined and ready but require objects to have proper PSTypeNames. Future work will add automatic type decoration to Get-* functions:

```powershell
# Future implementation
function Get-FabricLakehouse {
    # ... existing code ...

    # Add type decoration
    $lakehouse.PSObject.TypeNames.Insert(0, 'MicrosoftFabric.Lakehouse')

    return $lakehouse
}
```

Once implemented, all objects will automatically use the appropriate format view.

## Cache Management

### View Cache Contents
```powershell
# View all cached entries
Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.*"

# View capacity name cache (capacityId → capacity name)
Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.CapacityName_*"

# View workspace name cache (workspaceId → workspace name)
Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.WorkspaceName_*"

# View workspace→capacity cache (workspaceId → capacityId)
Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.WorkspaceCapacityId_*"
```

### Cache Types

The module maintains three types of caches:

1. **CapacityName Cache** - Maps capacity GUIDs to display names
   - Key: `MicrosoftFabricMgmt.Cache.CapacityName_{CapacityId}`
   - Value: Capacity display name (string)

2. **WorkspaceName Cache** - Maps workspace GUIDs to display names
   - Key: `MicrosoftFabricMgmt.Cache.WorkspaceName_{WorkspaceId}`
   - Value: Workspace display name (string)

3. **WorkspaceCapacityId Cache** - Maps workspace GUIDs to capacity GUIDs
   - Key: `MicrosoftFabricMgmt.Cache.WorkspaceCapacityId_{WorkspaceId}`
   - Value: Capacity GUID (string)
   - Used for: Cascading resolution when items only have workspaceId

### Clear Specific Cache Entry
```powershell
# Clear a specific capacity name cache
Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.CapacityName_12345-guid" -Value $null
Unregister-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.CapacityName_12345-guid" -Scope FileUserShared

# Clear a workspace→capacity mapping
Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.WorkspaceCapacityId_67890-guid" -Value $null
Unregister-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.WorkspaceCapacityId_67890-guid" -Scope FileUserShared
```

### Clear All Cache
```powershell
# Clear all cached names
Clear-FabricNameCache -Force
```

## Troubleshooting

### Names Not Resolving
**Symptom:** Format displays GUIDs instead of names

**Causes:**
1. Object doesn't have the correct PSTypeName
2. API call to retrieve name failed
3. Insufficient permissions to read capacity/workspace

**Solution:**
- Check if you have permission to view the capacity/workspace
- Try manually calling `Get-FabricCapacity` or `Get-FabricWorkspace`
- Clear cache and retry: `Clear-FabricNameCache -Force`

### Stale Cached Names
**Symptom:** Displays old names after rename

**Solution:**
```powershell
# Clear cache to force fresh lookups
Clear-FabricNameCache -Force
```

### Performance Issues with Caching
**Symptom:** High memory usage

**Solution:**
```powershell
# Clear cache to free memory
Clear-FabricNameCache -Force
```

## Best Practices

1. **Let caching work for you** - Don't disable caching unless necessary
2. **Clear cache after major changes** - After bulk renames, clear the cache
3. **Use Clear-FabricNameCache** - Don't manually manipulate PSFramework config
4. **Monitor cache size** - For long-running sessions, periodically clear cache
5. **Leverage WhatIf** - Test operations before executing: `Clear-FabricNameCache -WhatIf`

## Future Enhancements

### Phase 3: Type Decoration (Planned)
- Automatic PSTypeName decoration in Get-* functions
- Universal application of format views
- Custom format for additional resource types

### Additional Features (Under Consideration)
- Configurable column widths
- User-defined default columns
- Export to formatted reports
- Custom format views per user preference
- Real-time name updates on change events
