# Resolve-FabricCapacityIdFromWorkspace

## Synopsis
Resolves a capacity ID from a workspace ID for cascading name resolution.

## Syntax

```powershell
Resolve-FabricCapacityIdFromWorkspace
    [-WorkspaceId] <String>
    [-DisableCache]
    [<CommonParameters>]
```

## Description

The `Resolve-FabricCapacityIdFromWorkspace` function retrieves the capacity ID for a given workspace by querying the Fabric API. This enables cascading resolution: workspaceId → capacityId → capacity name.

This function is needed because many Fabric item APIs (Lakehouse, Notebook, etc.) only return `workspaceId` in their response, not `capacityId`. To display the capacity name in formatted output, we must:

1. Call this function to get the capacityId from the workspaceId
2. Call `Resolve-FabricCapacityName` to get the display name

Results are cached using PSFramework's configuration system for optimal performance.

## Parameters

### -WorkspaceId

The workspace ID (GUID) to resolve to its capacity ID.

```yaml
Type: String
Parameter Sets: (All)
Aliases: Id

Required: True
Position: 1
Default value: None
Accept pipeline input: True (ByValue, ByPropertyName)
Accept wildcard characters: False
```

### -DisableCache

If specified, bypasses the cache and always makes a fresh API call.

```yaml
Type: SwitchParameter
Parameter Sets: (All)
Aliases:

Required: False
Position: Named
Default value: False
Accept pipeline input: False
Accept wildcard characters: False
```

## Inputs

### System.String

You can pipe workspace IDs to this function.

## Outputs

### System.String

Returns the capacity ID (GUID), or `$null` if the workspace has no capacity assigned.

## Examples

### Example 1: Get capacity ID from workspace

```powershell
PS > $workspaceId = "87654321-4321-4321-4321-210987654321"
PS > Resolve-FabricCapacityIdFromWorkspace -WorkspaceId $workspaceId
12345678-1234-1234-1234-123456789012
```

### Example 2: Cascading resolution to get capacity name

```powershell
PS > $workspaceId = "87654321-4321-4321-4321-210987654321"
PS > $capacityId = Resolve-FabricCapacityIdFromWorkspace -WorkspaceId $workspaceId
PS > Resolve-FabricCapacityName -CapacityId $capacityId
Premium Capacity P1
```

### Example 3: Pipeline usage with Lakehouse items

```powershell
PS > $lakehouses = Get-FabricLakehouse -WorkspaceId $wsId
PS > $lakehouses | ForEach-Object {
    $capacityId = Resolve-FabricCapacityIdFromWorkspace -WorkspaceId $_.workspaceId
    if ($capacityId) {
        Resolve-FabricCapacityName -CapacityId $capacityId
    } else {
        "No capacity assigned"
    }
}
Premium Capacity P1
Premium Capacity P1
```

### Example 4: Force fresh lookup bypassing cache

```powershell
PS > Resolve-FabricCapacityIdFromWorkspace -WorkspaceId $workspaceId -DisableCache
12345678-1234-1234-1234-123456789012
```

## Notes

**Why This Function Exists:**

Many Fabric item APIs only return `workspaceId`, not `capacityId`:
- Get-FabricLakehouse → only has workspaceId
- Get-FabricNotebook → only has workspaceId
- Get-FabricWarehouse → only has workspaceId
- etc.

To show the capacity name in formatted output, we need cascading resolution:
```
Item (has workspaceId)
  → Resolve-FabricCapacityIdFromWorkspace(workspaceId)
    → capacityId
      → Resolve-FabricCapacityName(capacityId)
        → "Premium Capacity P1"
```

**Caching Behavior:**
- First call makes an API request to `Get-FabricWorkspace`
- Extracts the capacityId from the workspace object
- Result is cached with key: `MicrosoftFabricMgmt.Cache.WorkspaceCapacityId_{WorkspaceId}`
- Subsequent calls retrieve from cache (< 1ms vs 100-500ms)
- Cache persists across PowerShell sessions
- Use `Clear-FabricNameCache` to clear all cached entries

**Error Handling:**
- Returns `$null` if workspace has no capacity assigned
- Returns `$null` if the API call fails
- Logs warnings for resolution failures
- Never throws exceptions

**Performance:**
- Cached lookup: < 1ms
- Fresh API call: 100-500ms
- Significantly speeds up formatted output for items without direct capacityId

## Related Links

- [Resolve-FabricCapacityName](Resolve-FabricCapacityName.md)
- [Resolve-FabricWorkspaceName](Resolve-FabricWorkspaceName.md)
- [Clear-FabricNameCache](Clear-FabricNameCache.md)
- [Get-FabricWorkspace](Get-FabricWorkspace.md)
- [OUTPUT-FORMATTING.md](OUTPUT-FORMATTING.md)
