# PSScriptAnalyzer Report - MicrosoftFabricMgmt Module

**Generated:** November 7, 2025  
**Total Issues:** 685

## Executive Summary

| Severity | Count | Percentage |
|----------|-------|------------|
| Warning | 3 | 0.4% |
| Information | 682 | 99.6% |

## Issues by Rule

| Rule Name | Count | Severity | Description |
|-----------|-------|----------|-------------|
| PSAvoidTrailingWhitespace | 681 | Information | Lines have trailing whitespace |
| PSUseApprovedVerbs | 2 | Warning | Cmdlets use unapproved verbs |
| PSUseShouldProcessForStateChangingFunctions | 1 | Warning | Function missing ShouldProcess support |
| PSUseOutputTypeCorrectly | 1 | Information | OutputType attribute issue |

## Critical Issues (Warnings)

### 1. PSUseShouldProcessForStateChangingFunctions (1 issue)

| File | Line | Message |
|------|------|---------|
| `Set-FabricApiHeaders.ps1` | 40 | Function 'Set-FabricApiHeaders' has verb that could change system state. Therefore, the function has to support 'ShouldProcess'. |

**Recommendation:** Add `[CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]` and wrap state-changing operations in `if ($PSCmdlet.ShouldProcess(...)) { }`.

### 2. PSUseApprovedVerbs (2 issues)

| File | Line | Cmdlet | Recommended Alternative |
|------|------|--------|------------------------|
| `Assign-FabricWorkspaceCapacity.ps1` | 26 | Assign-FabricWorkspaceCapacity | Use approved verbs like `Set-`, `Add-`, `Grant-` |
| `Unassign-FabricWorkspaceCapacity.ps1` | 23 | Unassign-FabricWorkspaceCapacity | Use approved verbs like `Remove-`, `Revoke-`, `Clear-` |

**Note:** These are intentional design choices based on Fabric API terminology. Can be left as-is with documented exceptions.

## Issues by Folder

Top 10 folders requiring attention:

| Folder | Issue Count |
|--------|-------------|
| Environment | 66 |
| Mirrored Database | 58 |
| Lakehouse | 58 |
| Notebook | 47 |
| KQL Database | 42 |
| Domain | 41 |
| KQL Queryset | 37 |
| KQL Dashboard | 35 |
| Eventstream | 28 |
| Copy Job | 27 |

## Files with Most Issues

Top 20 files:

| File | Issue Count | Primary Issue |
|------|-------------|---------------|
| `Update-FabricCopyJobDefinition.ps1` | 12 | Trailing whitespace |
| `Start-FabricLakehouseTableMaintenance.ps1` | 12 | Trailing whitespace |
| `New-FabricKQLDatabase.ps1` | 11 | Trailing whitespace |
| `New-FabricNotebookNEW.ps1` | 11 | Trailing whitespace |
| `Invoke-FabricAPIRequest.ps1` | 11 | Trailing whitespace |
| `Update-FabricKQLDatabaseDefinition.ps1` | 10 | Trailing whitespace |
| `Update-FabricMirroredDatabaseDefinition.ps1` | 10 | Trailing whitespace |
| `Update-FabricKQLQuerysetDefinition.ps1` | 10 | Trailing whitespace |
| `Update-FabricKQLDashboardDefinition.ps1` | 9 | Trailing whitespace |
| `Get-FabricEventhouse.ps1` | 9 | Trailing whitespace |
| `Get-FabricLakehouse.ps1` | 9 | Trailing whitespace |
| `Get-FabricEnvironment.ps1` | 9 | Trailing whitespace |
| `Get-FabricMirroredDatabase.ps1` | 8 | Trailing whitespace |
| `Get-FabricMirroredWarehouse.ps1` | 8 | Trailing whitespace |
| `Get-FabricMLModel.ps1` | 8 | Trailing whitespace |
| `Get-FabricKQLQueryset.ps1` | 8 | Trailing whitespace |
| `Update-FabricNotebookDefinition.ps1` | 8 | Trailing whitespace |
| `Get-FabricKQLDatabase.ps1` | 8 | Trailing whitespace |
| `Load-FabricLakehouseTable.ps1` | 7 | Trailing whitespace |
| `Set-FabricLabel.ps1` | 7 | Trailing whitespace |

## Completed Folders (0 Issues) ✅

The following folders have been fully remediated:

- ✅ **OneLake** - 0 issues
- ✅ **Paginated Reports** - 0 issues
- ✅ **Reflex** - 0 issues
- ✅ **Report** - 0 issues
- ✅ **Semantic Model** - 0 issues
- ✅ **Sharing Links** - 0 issues
- ✅ **Spark** - 0 issues
- ✅ **Spark Job Definition** - 0 issues
- ✅ **SQL Endpoints** - 0 issues
- ✅ **Tags** - 0 issues
- ✅ **Tenant** - 0 issues
- ✅ **Users** - 0 issues
- ✅ **Variable Library** - 0 issues
- ✅ **Warehouse** - 0 issues

**Note:** Workspace folder has 2 intentional PSUseApprovedVerbs warnings (Assign/Unassign verbs).

## Remediation Strategy

### Phase 1: Critical Fixes (3 warnings)
1. **Set-FabricApiHeaders.ps1** - Add ShouldProcess support
2. Document unapproved verb exceptions for Assign/Unassign cmdlets (or rename if desired)

### Phase 2: Trailing Whitespace (681 issues)
Bulk fix using PowerShell command:
```powershell
Get-ChildItem -Path 'C:\GitHub\fabric-toolbox\tools\MicrosoftFabricMgmt\source\' -Filter *.ps1 -Recurse | 
    ForEach-Object { 
        (Get-Content $_.FullName -Raw) -replace '[ \t]+(\r?\n)', '$1' | 
        Set-Content $_.FullName -NoNewline 
    }
```

### Phase 3: Remaining Folders
Process remaining folders alphabetically using established pattern:
1. Run PSScriptAnalyzer on folder
2. Add ShouldProcess to state-changing functions
3. Remove trailing whitespace
4. Verify 0 issues

**Estimated remaining work:** 27 folders

## Detailed Issue Export

Full details available in: `pssa-issues.csv`

---

**Next Steps:**
1. Fix critical warning in `Set-FabricApiHeaders.ps1`
2. Document unapproved verb exceptions
3. Bulk fix trailing whitespace across all remaining folders
4. Final verification scan
