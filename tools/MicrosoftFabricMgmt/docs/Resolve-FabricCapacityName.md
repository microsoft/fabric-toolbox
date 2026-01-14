# Resolve-FabricCapacityName

## Synopsis
Resolves a Fabric Capacity ID (GUID) to its display name.

## Syntax

```powershell
Resolve-FabricCapacityName
    [-CapacityId] <String>
    [-DisableCache]
    [<CommonParameters>]
```

## Description

The `Resolve-FabricCapacityName` function converts a capacity GUID to its human-readable display name by querying the Fabric API. Results are cached using PSFramework's configuration system for optimal performance.

This function is primarily used internally by the module's formatting system but is exposed publicly for advanced scenarios.

## Parameters

### -CapacityId

The capacity ID (GUID) to resolve to a display name.

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

You can pipe capacity IDs to this function.

## Outputs

### System.String

Returns the capacity display name, or the capacity ID as fallback if resolution fails.

## Examples

### Example 1: Resolve a capacity ID

```powershell
PS > Resolve-FabricCapacityName -CapacityId "12345678-1234-1234-1234-123456789012"
Premium Capacity P1
```

### Example 2: Resolve with pipeline input

```powershell
PS > $capacities = Get-FabricCapacity
PS > $capacities.id | Resolve-FabricCapacityName
Premium Capacity P1
Premium Capacity P2
Fabric Capacity F64
```

### Example 3: Force fresh lookup bypassing cache

```powershell
PS > Resolve-FabricCapacityName -CapacityId "12345678-1234-1234-1234-123456789012" -DisableCache
Premium Capacity P1
```

## Notes

**Caching Behavior:**
- First call makes an API request to `Get-FabricCapacity`
- Result is cached with key: `MicrosoftFabricMgmt.Cache.CapacityName_{CapacityId}`
- Subsequent calls retrieve from cache (< 1ms vs 100-500ms)
- Cache persists across PowerShell sessions
- Use `Clear-FabricNameCache` to clear all cached names

**Error Handling:**
- Returns the capacity ID as fallback if the API call fails
- Logs warnings for resolution failures
- Never throws exceptions

**Performance:**
- Cached lookup: < 1ms
- Fresh API call: 100-500ms
- Batch operations benefit significantly from caching

## Related Links

- [Resolve-FabricWorkspaceName](Resolve-FabricWorkspaceName.md)
- [Resolve-FabricCapacityIdFromWorkspace](Resolve-FabricCapacityIdFromWorkspace.md)
- [Clear-FabricNameCache](Clear-FabricNameCache.md)
- [Get-FabricCapacity](Get-FabricCapacity.md)
- [OUTPUT-FORMATTING.md](OUTPUT-FORMATTING.md)
