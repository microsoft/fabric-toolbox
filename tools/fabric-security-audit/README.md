# Fabric Security Audit

> **v2.0.0** — Automated security troubleshooter for Microsoft Fabric Warehouses and Lakehouse SQL Endpoints.

A self-contained PowerShell script that collects, correlates, and reports on every access layer for a Fabric Warehouse or SQL Endpoint — workspace roles, item sharing, OneLake Security, SQL permissions, shortcuts, and more — in a single command.

---

## Quick Start

```powershell
# One-liner: paste your Power BI URL
.\Invoke-FabricSecurityAudit.ps1 -Url "https://app.powerbi.com/groups/<wsId>/warehouses/<artId>?ctid=..."

# Investigate a specific user's permissions
.\Invoke-FabricSecurityAudit.ps1 -Url "https://..." -User "user@contoso.com"

# Show all options
.\Invoke-FabricSecurityAudit.ps1 -Help
```

The script auto-detects whether the target is a **Warehouse** or **SQL Endpoint (Lakehouse)** and runs the appropriate checks.

---

## What It Collects

| # | Section | Description |
|---|---------|-------------|
| 1 | **Workspace & Capacity** | Workspace metadata, capacity SKU/region/state, sensitivity labels, managed identity |
| 2 | **Workspace Roles** | Admin, Member, Contributor, Viewer role assignments |
| 3 | **Item-Level Sharing** | Direct artifact-level sharing that bypasses workspace roles |
| 4 | **Artifact Details** | Warehouse/Lakehouse properties, SQL endpoint auto-discovery |
| 5 | **OneLake Security** | Data Access Roles on the parent Lakehouse *(SQL Endpoint mode)* |
| 6 | **User Investigation** | Graph API principal resolution, group memberships, cross-reference |
| 7 | **SQL Permissions** | Role members, all permissions, DENYs, RLS/CLS, identity mode, stale principals |
| 8 | **Shortcuts & Tables** | Shortcut enumeration, cross-workspace permission checks, SQL table metadata |
| 9 | **Access Cross-Reference** | Per-user workspace role mapping (direct vs group-based) |
| 10 | **Effective Access Summary** | Consolidated per-user access view across all layers *(when `-User` specified)* |
| 11 | **Verification Checklist** | Actionable remediation checklist tailored to Warehouse or SQL Endpoint |
| 12 | **Report & Results** | Markdown report, section timings, audit verdict, zip package |

---

## Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `-Url` | Power BI / Fabric URL (auto-extracts workspace & artifact IDs) | — |
| `-WorkspaceId` | Workspace GUID (if not using `-Url`) | — |
| `-ArtifactId` | Warehouse or SQL Endpoint GUID (if not using `-Url`) | — |
| `-User` | UPN or Object ID — investigate + produce effective access summary | — |
| `-InvestigateUsers` | One or more UPNs/Object IDs to investigate | — |
| `-SummarizeUsers` | One or more UPNs/Object IDs for effective access summary | — |
| `-SqlEndpointOverride` | Manual SQL FQDN if auto-discovery fails | — |
| `-DatabaseName` | Override database name | artifact display name |
| `-MaxRows` | Max rows per SQL query | `5000` |
| `-MaxGroupMembers` | Max group members from Graph API | `500` |
| `-NoPrompt` | Suppress interactive prompts (auto-truncate large results) | `false` |
| `-NoSafeguards` | Remove all row limits (use with caution on large environments) | `false` |
| `-NoZip` | Skip creating a zip package | `false` |
| `-DiffWith` | Path to previous run folder for change comparison | — |
| `-OutputFolder` | Custom output folder path | auto-timestamped |
| `-Help` | Show help and exit | — |

---

## Prerequisites

### PowerShell Module
- **Az.Accounts** — auto-installed if missing (no manual setup needed)

### Required Permissions

| Layer | Permission | Why |
|-------|-----------|-----|
| **Fabric** | Workspace Admin or Member | Read role assignments, artifacts, OneLake Security |
| **Microsoft Graph** | `User.Read.All` + `GroupMember.Read.All` *(or `Directory.Read.All`)* | Resolve UPNs, enumerate group memberships |
| **SQL Endpoint** | `db_owner` or equivalent | Query `sys.database_principals`, `sys.database_permissions`, etc. |

> **Note:** If running with a service principal, ensure it has the above API permissions granted as **Application** permissions (not Delegated) and is added to the workspace.

---

## Output

The script creates a timestamped folder containing:

| File Type | Example | Contents |
|-----------|---------|----------|
| `[R]` Report | `SecurityAuditReport.md` | Consolidated Markdown report with all findings |
| `[J]` JSON | `01_workspace.json`, `03_artifact.json` | Raw artifact and workspace metadata |
| `[C]` CSV | `06c_all_permissions.csv` | Tabular data (permissions, roles, principals, shortcuts) |
| `.zip` | `FabricSecurityAudit_Warehouse_20260317.zip` | All files packaged for sharing |

### Audit Verdict

The script produces a verdict at the end:

```
STATUS: CLEAN -- no issues detected
```
or
```
STATUS: ISSUES FOUND (3)
  ! 2 DENY permission entries found
  ! 1 stale SQL principal(s) -- AAD objects may no longer exist
  ! Workspace has a sensitivity label applied
```

---

## Examples

### Basic Warehouse audit
```powershell
.\Invoke-FabricSecurityAudit.ps1 `
    -Url "https://app.powerbi.com/groups/aaaa-bbbb/warehouses/1111-2222?ctid=..."
```

### SQL Endpoint (Lakehouse) audit with user investigation
```powershell
.\Invoke-FabricSecurityAudit.ps1 `
    -Url "https://app.powerbi.com/groups/aaaa-bbbb/lakewarehouses/3333-4444?ctid=..." `
    -User "user@contoso.com"
```

### Compare with previous run (diff mode)
```powershell
.\Invoke-FabricSecurityAudit.ps1 `
    -Url "https://..." `
    -DiffWith ".\FabricSecurityAudit_Warehouse_20260316_171634"
```

### Automated / CI mode
```powershell
.\Invoke-FabricSecurityAudit.ps1 `
    -Url "https://..." `
    -NoPrompt -NoZip -NoSafeguards
```

---

## Effective Access Summary

When using `-User`, the script produces a consolidated view across all security layers:

| Access Layer | Source | Detail | Status |
|-------------|--------|--------|--------|
| Workspace Role | Direct | Viewer | Assigned |
| Workspace Role | Via group: DataTeam | Contributor | Assigned |
| OneLake Security (Parent Lakehouse) | Direct | Reader | Assigned |
| SQL Principal | user@contoso.com | EXTERNAL_USER | EXISTS |
| SQL DENY | user@contoso.com | SELECT on dbo.SensitiveTable | **BLOCKED** |

Status values: `Assigned`, `EXISTS`, `Member`, **`BLOCKED`**, **`MISSING`**, **`NOT ASSIGNED`**, *`DISABLED`*

---

## Architecture

```
Invoke-FabricSecurityAudit.ps1
    |
    +-- Fabric REST API (/v1/workspaces, /items, /roleAssignments, /dataAccessRoles, /shortcuts)
    +-- Microsoft Graph API (/users, /groups, /memberOf)
    +-- SQL Endpoint (sys.database_principals, sys.database_permissions, sys.security_policies)
    |
    +-- Output Folder/
        +-- SecurityAuditReport.md     (consolidated report)
        +-- 01_workspace.json          (workspace metadata)
        +-- 02_workspace_roles.csv     (role assignments)
        +-- 04_onelake_roles_*.csv     (OneLake security roles)
        +-- 06c_all_permissions.csv    (SQL permissions)
        +-- 07_shortcuts_*.csv         (shortcuts)
        +-- ...
        +-- .zip                       (packaged for sharing)
```

---

## Contributing

1. Fork this repository
2. Create a feature branch
3. Make your changes
4. Test with both Warehouse and SQL Endpoint URLs
5. Submit a pull request

---

## License

MIT License — see [LICENSE](LICENSE) for details.
