# Clear-FabricNameCache

## Overview
The `Clear-FabricNameCache` function clears all cached capacity and workspace name resolutions stored by the MicrosoftFabricMgmt module. This is useful when capacity or workspace names have been changed, or when you need to force fresh API lookups for name resolution.

## Features
- Clears all cached capacity name resolutions
- Clears all cached workspace name resolutions
- Supports `-WhatIf` for testing without making changes
- Provides confirmation prompts (can be bypassed with `-Force`)
- Reports the number of cache entries cleared
- Uses PSFramework configuration system for reliable cache management

## Parameters

### `Force` *(Optional)*
- **Description:** Bypasses confirmation prompts and clears the cache immediately.
- **Type:** Switch
- **Default:** False

## Usage Examples

### Example 1: Clear Cache with Confirmation
```powershell
Clear-FabricNameCache
```
Prompts for confirmation before clearing all cached capacity and workspace names.

### Example 2: Clear Cache Without Confirmation
```powershell
Clear-FabricNameCache -Force
```
Immediately clears all cached names without prompting for confirmation.

**Output:**
```
Successfully cleared 42 cached name resolution(s)
```

### Example 3: Test What Would Be Cleared (WhatIf)
```powershell
Clear-FabricNameCache -WhatIf
```
Shows what would happen without actually clearing the cache.

**Output:**
```
What if: Performing the operation "Clear all cached capacity and workspace names" on target "Fabric Name Cache".
```

### Example 4: Clear Cache in a Script
```powershell
# After bulk renaming capacities
Rename-Capacities -NewNamingScheme "Production"

# Force fresh lookups by clearing cache
Clear-FabricNameCache -Force

# Next queries will fetch updated names
Get-FabricWorkspace | Format-Table
```

## When to Use

Use `Clear-FabricNameCache` when:

1. **Capacity or workspace names have been renamed**
   - The module caches name resolutions for performance
   - After renaming, the cache contains stale data
   - Clearing forces fresh API lookups

2. **Cached data appears incorrect**
   - If you see old or unexpected names in output
   - Useful for troubleshooting name resolution issues

3. **Reducing memory usage**
   - Long-running sessions may accumulate large caches
   - Periodically clearing cache frees memory

4. **Testing and development**
   - Clear cache between test runs for consistent results
   - Verify that name resolution is working correctly

## Background: How Name Caching Works

The MicrosoftFabricMgmt module automatically caches capacity and workspace name resolutions for performance:

1. **First Lookup:** When displaying a capacity or workspace ID, the module calls the Fabric API to retrieve the display name (typically 100-500ms)

2. **Cached Lookup:** Subsequent lookups use the cached value (<1ms), providing ~200x performance improvement

3. **Cache Storage:** Names are stored using PSFramework's configuration system with keys like:
   - `MicrosoftFabricMgmt.Cache.CapacityName_{CapacityId}`
   - `MicrosoftFabricMgmt.Cache.WorkspaceName_{WorkspaceId}`

4. **Cache Persistence:** Cache persists across PowerShell sessions for consistent performance

5. **Cache Invalidation:** Use `Clear-FabricNameCache` to remove all cached entries when needed

## Prerequisites
- The module uses PSFramework for cache management
- No authentication required (cache operations are local)
- Cache entries are created automatically by the module's output formatting system

## Key Workflow
1. Retrieves all PSFramework configuration entries matching `MicrosoftFabricMgmt.Cache.*`
2. For each cache entry:
   - Sets the value to `$null` to clear runtime cache
   - Unregisters from FileUserShared scope
   - Unregisters from FileSystem scope
3. Reports the number of entries cleared

## Error Handling
- Gracefully handles empty cache (reports "No cached names found to clear")
- Uses `-ErrorAction SilentlyContinue` on unregister operations for robustness
- Logs errors with PSFramework logging if cache clearing fails

## Performance Impact
- **Execution Time:** <100ms for typical cache sizes (1-100 entries)
- **Memory Impact:** Frees memory proportional to cache size
- **API Impact:** Next name resolution will require API calls (100-500ms per unique ID)

## View Cache Contents

To see what's currently cached:

```powershell
# View all cached entries
Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.*"

# View only capacity name cache
Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.CapacityName_*"

# View only workspace name cache
Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.WorkspaceName_*"

# Count cache entries
(Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.*" | Measure-Object).Count
```

## Related Functions
- **Resolve-FabricCapacityName** (Private) - Resolves capacity IDs to names with caching
- **Resolve-FabricWorkspaceName** (Private) - Resolves workspace IDs to names with caching
- **Get-FabricCapacity** - Retrieves capacity details (called by resolver)
- **Get-FabricWorkspace** - Retrieves workspace details (called by resolver)

## Related Documentation
- [Output Formatting Guide](OUTPUT-FORMATTING.md) - Complete documentation on output formatting and caching
- [Get-FabricCapacity](Get-FabricCapacity.md) - Retrieve capacity information
- [Get-FabricWorkspace](Get-FabricWorkspace.md) - Retrieve workspace information

## Notes
- This function is part of the output formatting enhancement (Phase 5)
- Cache clearing is a local operation and does not affect Microsoft Fabric resources
- The cache is automatically managed by the module's format system
- Manual cache manipulation is not recommended; use this function instead

## Author
**Claude Code** (Assisted by Rob Sewell)

## Version History
- **1.0.2** - Initial release with output formatting system
