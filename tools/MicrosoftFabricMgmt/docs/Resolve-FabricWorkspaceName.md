# Resolve-FabricWorkspaceName

## Synopsis
Resolves a Fabric Workspace ID (GUID) to its display name.

## Syntax

```powershell
Resolve-FabricWorkspaceName
    [-WorkspaceId] <String>
    [-DisableCache]
    [<CommonParameters>]
```

## Description

The `Resolve-FabricWorkspaceName` function converts a workspace GUID to its human-readable display name by querying the Fabric API. Results are cached using PSFramework's configuration system for optimal performance.

This function is primarily used internally by the module's formatting system but is exposed publicly for advanced scenarios.

## Parameters

### -WorkspaceId

The workspace ID (GUID) to resolve to a display name.

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

Returns the workspace display name, or the workspace ID as fallback if resolution fails.

## Examples

### Example 1: Resolve a workspace ID

```powershell
PS > Resolve-FabricWorkspaceName -WorkspaceId "87654321-4321-4321-4321-210987654321"
Analytics Workspace
```

### Example 2: Resolve with pipeline input

```powershell
PS > $workspaces = Get-FabricWorkspace
PS > $workspaces.id | Resolve-FabricWorkspaceName
Analytics Workspace
Development Workspace
Production Workspace
```

### Example 3: Resolve from object property

```powershell
PS > $lakehouses = Get-FabricLakehouse -WorkspaceId $wsId
PS > $lakehouses | Resolve-FabricWorkspaceName
Analytics Workspace
Analytics Workspace
```

### Example 4: Force fresh lookup bypassing cache

```powershell
PS > Resolve-FabricWorkspaceName -WorkspaceId "87654321-4321-4321-4321-210987654321" -DisableCache
Analytics Workspace
```

## Notes

**Caching Behavior:**
- First call makes an API request to `Get-FabricWorkspace`
- Result is cached with key: `MicrosoftFabricMgmt.Cache.WorkspaceName_{WorkspaceId}`
- Subsequent calls retrieve from cache (< 1ms vs 100-500ms)
- Cache persists across PowerShell sessions
- Use `Clear-FabricNameCache` to clear all cached names

**Error Handling:**
- Returns the workspace ID as fallback if the API call fails
- Logs warnings for resolution failures
- Never throws exceptions

**Performance:**
- Cached lookup: < 1ms
- Fresh API call: 100-500ms
- Dramatically improves performance for repeated queries in the same workspace

**Use Cases:**
- Manual name resolution outside formatting
- Building custom reports with workspace names
- Diagnostic scripts showing workspace information

## Related Links

- [Resolve-FabricCapacityName](Resolve-FabricCapacityName.md)
- [Resolve-FabricCapacityIdFromWorkspace](Resolve-FabricCapacityIdFromWorkspace.md)
- [Clear-FabricNameCache](Clear-FabricNameCache.md)
- [Get-FabricWorkspace](Get-FabricWorkspace.md)
- [OUTPUT-FORMATTING.md](OUTPUT-FORMATTING.md)
