# PowerShell Piping in MicrosoftFabricMgmt

## Overview

PowerShell piping is a fundamental concept that enables efficient, composable workflows by passing objects from one command to another through the pipeline (`|`). The MicrosoftFabricMgmt module is designed from the ground up to leverage PowerShell's pipeline capabilities, allowing you to chain commands together for powerful, readable automation scripts.

## Why Piping is Important

### 1. **Composability and Reusability**

Piping enables you to build complex operations from simple, single-purpose commands. Each function does one thing well, and you combine them to achieve your goal.

```powershell
# Instead of having to enter the WorkspaceId:
Get-FabricLakehouse -WorkspaceId "1234-1234-4567-7894" -LakehouseName "Sales"

# You can compose operations:
Get-FabricWorkspace -WorkspaceName "Production" | Get-FabricLakehouse -LakehouseName "Sales"
```

### 2. **Improved Readability**

Pipeline operations read like natural language, making scripts self-documenting and easier to understand.

```powershell
# Clear intent: Get workspace, then its lakehouses
Get-FabricWorkspace -WorkspaceName "Analytics" |
    Get-FabricLakehouse
```

### 3. **Reduced Repetition**

Piping eliminates the need to store intermediate results in variables or repeat parameters.

```powershell
# Without piping (verbose):
$workspace = Get-FabricWorkspace -WorkspaceName "Production"
$lakehouses = Get-FabricLakehouse -WorkspaceId $workspace.id

# With piping (concise):
Get-FabricWorkspace -WorkspaceName "Production" |
    Get-FabricLakehouse
```

### 4. **Performance Optimization**

PowerShell pipelines process objects one at a time (streaming), which is memory-efficient for large datasets.

## What Piping Allows Us to Do

### 1. **Workspace-Centric Operations**

Start with a workspace and operate on all its resources:

```powershell
# Get all data pipelines in a workspace
Get-FabricWorkspace -WorkspaceName "DataOps" | Get-FabricDataPipeline

# Get all environments across multiple workspaces
Get-FabricWorkspace | Where-Object { $_.displayName -like "Dev-*" } | Get-FabricEnvironment

# Delete all notebooks in a workspace
Get-FabricWorkspace -WorkspaceName "Temp" |
    Get-FabricNotebook |
    Remove-FabricNotebook -Confirm:$false
```

### 2. **Batch Operations**

Apply the same operation to multiple resources:

```powershell
# Update all warehouses in a workspace
Get-FabricWorkspace -WorkspaceName "Production" |
    Get-FabricWarehouse |
    Update-FabricWarehouse -Description "Updated $(Get-Date)"

# Assign multiple workspaces to a capacity
Get-FabricWorkspace | Where-Object { $_.displayName -like "Prod-*" } |
    Assign-FabricWorkspaceCapacity -CapacityId "capacity-123"
```

### 3. **Filtering and Selection**

Combine Fabric cmdlets with PowerShell's filtering capabilities:

```powershell
# Get all lakehouses across workspaces
Get-FabricWorkspace |
    Get-FabricLakehouse

# Get specific properties
Get-FabricWorkspace -WorkspaceName "Analytics" |
    Get-FabricLakehouse |
    Select-Object displayName, id, type
```

### 4. **Cross-Resource Operations**

Chain operations across different resource types:

```powershell
# Get a workspace, then its eventhouse
Get-FabricWorkspace -WorkspaceName "RealTime" |
    Get-FabricEventhouse -EventhouseName "Telemetry"

# Start mirroring on all mirrored databases in a workspace
Get-FabricWorkspace -WorkspaceName "DataSync" |
    Get-FabricMirroredDatabase |
    Start-FabricMirroredDatabaseMirroring
```

### 5. **Reporting and Analysis**

Generate reports by piping through formatting cmdlets:

```powershell
# Generate a capacity usage report
Get-FabricWorkspace |
    Group-Object capacityId |
    Select-Object Count, @{N='CapacityId';E={$_.Name}} |
    Sort-Object Count -Descending

# Export workspace inventory to CSV
Get-FabricWorkspace |
    Get-FabricLakehouse |
    Select-Object displayName, id, type |
    Export-Csv -Path "LakehouseInventory.csv" -NoTypeInformation
```

## How Piping Works in MicrosoftFabricMgmt

### ValueFromPipelineByPropertyName

Most MicrosoftFabricMgmt cmdlets use the `ValueFromPipelineByPropertyName` parameter attribute, which automatically binds properties from piped objects to command parameters.

```powershell
# The 'id' property from Get-FabricWorkspace automatically binds to
# the '-WorkspaceId' parameter of Get-FabricLakehouse
Get-FabricWorkspace -WorkspaceName "Analytics" | Get-FabricLakehouse
```

### Parameter Aliases

The module uses aliases to make piping intuitive:

```powershell
# The '-WorkspaceId' parameter has an 'id' alias
[Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
[Alias('id')]
[string]$WorkspaceId
```

This means any object with an `id` property can pipe into parameters expecting `WorkspaceId`, `LakehouseId`, etc.

## Risks and Warnings

### ⚠️ 1. **Bulk Operations Without Confirmation**

Piping makes it easy to perform operations on many resources at once. This is powerful but dangerous.

**Risk:**
```powershell
# This will delete ALL notebooks in ALL workspaces! ⚠️
Get-FabricWorkspace | Get-FabricNotebook | Remove-FabricNotebook -Confirm:$false
```

**Mitigation:**
- Always test with `-WhatIf` first (if supported)
- Use filtering to limit scope: `Where-Object { $_.name -like "Test-*" }`
- Review the list before piping to removal cmdlets
- Never use `-Confirm:$false` in production scripts without explicit safeguards

```powershell
# Safer approach:
$notebooks = Get-FabricWorkspace -WorkspaceName "Dev" | Get-FabricNotebook
$notebooks | Format-Table displayName, id  # Review first
$notebooks | Remove-FabricNotebook  # Will prompt for each deletion
```

### ⚠️ 2. **Performance Considerations**

Piping processes objects one at a time, which can be slower for certain operations.

**Risk:**
```powershell
# This makes N+1 API calls (one per workspace)
Get-FabricWorkspace | ForEach-Object { Get-FabricLakehouse -WorkspaceId $_.id }
```

**Mitigation:**
- The module is designed for efficient piping with proper `process` blocks
- API calls are optimized with caching where appropriate
- For very large datasets, consider batching or parallel processing

### ⚠️ 3. **Silent Failures**

Errors in the middle of a pipeline can be silent if not handled properly.

**Risk:**
```powershell
# If Get-FabricLakehouse fails for one workspace, it continues to the next
Get-FabricWorkspace | Get-FabricLakehouse
```

**Mitigation:**
- Use `-ErrorAction Stop` to halt on errors
- Check `$Error` variable after operations
- Implement try-catch blocks for critical operations
- Review logs with `Get-FabricLog`

```powershell
# Safer with error handling:
Get-FabricWorkspace -ErrorAction Stop |
    Get-FabricLakehouse -ErrorAction Stop
```

### ⚠️ 4. **Ambiguous Property Binding**

Multiple piped properties can sometimes bind to unexpected parameters.

**Risk:**
```powershell
# If an object has both 'id' and 'workspaceId' properties,
# which one binds to '-WorkspaceId'?
$customObject | Get-FabricLakehouse
```

**Mitigation:**
- Always test pipeline commands with sample data first
- Use explicit parameters when in doubt: `Get-FabricLakehouse -WorkspaceId $_.id`
- Review parameter aliases in documentation

### ⚠️ 5. **Pipeline Variable Scope**

Variables created inside pipeline operations have limited scope.

**Risk:**
```powershell
# $lakehouse is only available inside the ForEach-Object block
Get-FabricWorkspace | ForEach-Object {
    $lakehouse = Get-FabricLakehouse -WorkspaceId $_.id
}
# $lakehouse is not defined here
```

**Mitigation:**
- Store results in a variable if needed later: `$results = Get-FabricWorkspace | Get-FabricLakehouse`
- Use script-scoped variables (`$script:var`) if needed across blocks

## Best Practices

### ✅ 1. **Start Small and Build Up**

Test each stage of your pipeline independently:

```powershell
# Build incrementally:
Get-FabricWorkspace -WorkspaceName "Test"  # Verify workspace
Get-FabricWorkspace -WorkspaceName "Test" | Get-FabricLakehouse  # Add next step
Get-FabricWorkspace -WorkspaceName "Test" | Get-FabricDataPipeline  # Try another resource type
```

### ✅ 2. **Use Filtering Early**

Filter as early as possible in the pipeline for efficiency:

```powershell
# Good: Filter workspaces first
Get-FabricWorkspace | Where-Object { $_.displayName -like "Prod-*" } | Get-FabricLakehouse

# Less efficient: Getting all lakehouses then filtering
Get-FabricWorkspace | Get-FabricLakehouse | Where-Object { $_.displayName -like "Prod-*" }
```

### ✅ 3. **Leverage Select-Object**

Use `Select-Object` to focus on relevant properties:

```powershell
# Cleaner output
Get-FabricWorkspace |
    Get-FabricLakehouse |
    Select-Object displayName, type, id
```

### ✅ 4. **Use Format Cmdlets at the End**

Formatting cmdlets (`Format-Table`, `Format-List`) should always be last in the pipeline:

```powershell
# Correct:
Get-FabricWorkspace | Get-FabricLakehouse | Format-Table

# Wrong: Format-Table outputs format objects, not data
Get-FabricWorkspace | Format-Table | Get-FabricLakehouse  # ❌ Won't work
```

### ✅ 5. **Document Complex Pipelines**

Add comments to explain multi-stage operations:

```powershell
# Get all production lakehouses and export to CSV
Get-FabricWorkspace |
    Where-Object { $_.displayName -like "Prod-*" } |  # Production workspaces only
    Get-FabricLakehouse |  # Get all lakehouses
    Select-Object displayName, type, id |  # Select key properties
    Export-Csv -Path "ProductionLakehouses.csv" -NoTypeInformation  # Export to CSV
```

## Real-World Examples

### Example 1: Workspace Audit Report

```powershell
# Generate a comprehensive workspace inventory
Get-FabricWorkspace |
    ForEach-Object {
        $workspace = $_
        [PSCustomObject]@{
            WorkspaceName = $workspace.displayName
            WorkspaceId = $workspace.id
            CapacityId = $workspace.capacityId
            LakehouseCount = ($workspace | Get-FabricLakehouse | Measure-Object).Count
            WarehouseCount = ($workspace | Get-FabricWarehouse | Measure-Object).Count
            NotebookCount = ($workspace | Get-FabricNotebook | Measure-Object).Count
        }
    } |
    Export-Csv -Path "WorkspaceInventory.csv" -NoTypeInformation
```

### Example 2: Batch Resource Creation

```powershell
# Create lakehouses in multiple workspaces
$workspaceNames = @("Dev", "Test", "Staging")
$lakehouseName = "CustomerData"

$workspaceNames |
    ForEach-Object { Get-FabricWorkspace -WorkspaceName $_ } |
    New-FabricLakehouse -LakehouseName $lakehouseName -LakehouseDescription "Customer analytics data"
```

### Example 3: Environment Configuration

```powershell
# Update all environments in production workspaces
Get-FabricWorkspace |
    Where-Object { $_.displayName -like "Prod-*" } |
    Get-FabricEnvironment |
    Update-FabricEnvironment -Description "Production environment - $(Get-Date -Format 'yyyy-MM-dd')"
```

### Example 4: Resource Cleanup

```powershell
# Find and remove test notebooks by name pattern
Get-FabricWorkspace -WorkspaceName "Test" |
    Get-FabricNotebook |
    Where-Object { $_.displayName -like "*-old" } |
    ForEach-Object {
        Write-Host "Removing notebook: $($_.displayName)" -ForegroundColor Yellow
        $_ | Remove-FabricNotebook -Confirm:$false
    }
```

### Example 5: Cross-Workspace Migration

```powershell
# Copy lakehouse names from source to target workspace
$sourceLakehouses = Get-FabricWorkspace -WorkspaceName "Source" | Get-FabricLakehouse
$targetWorkspace = Get-FabricWorkspace -WorkspaceName "Target"

$sourceLakehouses |
    ForEach-Object {
        $targetWorkspace | New-FabricLakehouse -LakehouseName $_.displayName -LakehouseDescription "Migrated from Source"
    }
```

## Summary

PowerShell piping is a core feature that makes the MicrosoftFabricMgmt module powerful and flexible. By chaining commands together, you can create sophisticated automation workflows with minimal code. However, with this power comes responsibility—always test your pipelines, use appropriate error handling, and be cautious with bulk operations.

### Key Takeaways:

✅ **Do:**
- Chain commands for composable workflows
- Filter early in the pipeline
- Test incrementally
- Use `-ErrorAction Stop` for critical operations
- Review results before destructive operations

❌ **Don't:**
- Use `-Confirm:$false` without safeguards in production
- Pipe to `Format-*` cmdlets in the middle of a pipeline
- Assume silent success—check for errors
- Run untested bulk operations against production resources

For more information on specific cmdlets and their piping capabilities, see the individual command documentation in this docs folder.
