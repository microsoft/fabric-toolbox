# Power BI Semantic Model Backup & Restore

Automates backing up and restoring Power BI Semantic Models (`.abf` files) via the XMLA endpoint to an ADLS Gen2 storage account attached at the tenant level.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step-by-Step Setup](#step-by-step-setup)
3. [Project Structure](#project-structure)
4. [Usage — Backup](#usage--backup)
5. [Usage — Restore](#usage--restore)
6. [Parameters Reference](#parameters-reference)
7. [Configuration](#configuration)
8. [How Backups Work](#how-backups-work)
9. [How Restores Work](#how-restores-work)
10. [Logging](#logging)
11. [Troubleshooting](#troubleshooting)
12. [Known Limitations](#known-limitations)
13. [Running Tests](#running-tests)
14. [Future Enhancements](#future-enhancements)

---

## Prerequisites

Before using these scripts, ensure you have the following:

| # | Requirement | Details |
|---|---|---|
| 1 | **PowerShell 7.0+** | PowerShell 7.x is recommended. Version 5.1 may work but is not tested. |
| 2 | **MicrosoftPowerBIMgmt module** | Provides `Connect-PowerBIServiceAccount`, `Get-PowerBIWorkspace`, `Get-PowerBIDataset`, etc. |
| 3 | **SqlServer module** | Provides `Invoke-ASCmd` for executing TMSL commands against the XMLA endpoint. |
| 4 | **Premium or Fabric capacity** | The XMLA endpoint is only available on Premium Per User (PPU), Premium, or Fabric capacities. |
| 5 | **ADLS Gen2 storage account** | Must be attached at the tenant level in the Power BI Admin Portal. Hierarchical namespace **must** be enabled. |
| 6 | **Permissions** | Power BI Service Admin (required for the `Organization` scope used to enumerate workspaces) **or** workspace-level Admin on each target workspace. |

---

## Step-by-Step Setup

Follow these steps in order to prepare your environment.

### Step 1 — Install PowerShell 7

If you don't already have PowerShell 7 installed:

```powershell
# On Windows, install via winget:
winget install Microsoft.PowerShell

# Verify:
pwsh --version
# Expected output: PowerShell 7.x.x
```

> **Tip:** Always run these scripts in `pwsh` (PowerShell 7), not the legacy `powershell.exe` (5.1).

### Step 2 — Install Required PowerShell Modules

Open a PowerShell 7 terminal and run:

```powershell
# Install the Power BI Management module (includes Profile, Workspaces, Data sub-modules)
Install-Module -Name MicrosoftPowerBIMgmt -Scope CurrentUser -Force

# Install the SqlServer module (provides Invoke-ASCmd)
Install-Module -Name SqlServer -Scope CurrentUser -Force
```

**Verify the installation:**

```powershell
# Check that all required cmdlets are available
Get-Command Connect-PowerBIServiceAccount   # from MicrosoftPowerBIMgmt.Profile
Get-Command Get-PowerBIWorkspace             # from MicrosoftPowerBIMgmt.Workspaces
Get-Command Get-PowerBIDataset               # from MicrosoftPowerBIMgmt.Data
Get-Command Invoke-ASCmd                     # from SqlServer
```

If any command is not found, install the specific sub-module:

```powershell
Install-Module -Name MicrosoftPowerBIMgmt.Profile -Scope CurrentUser -Force
Install-Module -Name MicrosoftPowerBIMgmt.Workspaces -Scope CurrentUser -Force
Install-Module -Name MicrosoftPowerBIMgmt.Data -Scope CurrentUser -Force
```

### Step 3 — Configure ADLS Gen2 Storage (Tenant-Level)

1. Open the **Power BI Admin Portal** (https://app.powerbi.com → Settings gear → Admin portal).
2. Go to **Tenant settings** → search for "*Allow workspace admins to assign workspaces to dataflow storage accounts*" → **Enable** it.
3. Go to **Azure connections** → **Tenant-level storage** → click **Add connection**.
4. Select your **ADLS Gen2 storage account**.

> **Important:** The storage account **must** have **Hierarchical namespace** enabled (this is configured at storage account creation and cannot be changed afterwards).

### Step 4 — Enable XMLA Read/Write on Your Capacity

1. In the **Power BI Admin Portal**, go to **Capacity settings**.
2. Select your Premium or Fabric capacity.
3. Under **Workloads** (or **XMLA Endpoint**), set the XMLA endpoint to **Read Write**.

Without this, backup and restore commands will fail with connection errors.

### Step 5 — Clone This Repository

```powershell
git clone <repository-url>
cd PowerShellPBIBackup
```

---

## Project Structure

```
PowerShellPBIBackup/
├── Backup-PBISemanticModels.ps1    # Main backup script
├── Restore-PBISemanticModels.ps1   # Main restore script
├── PBIBackupHelpers.psm1           # Shared helper module (auto-imported by scripts)
├── config.example.json             # Example configuration (copy to config.json and edit)
└── README.md
```

---

## Usage — Backup

The backup script loads settings from `config.json` (if present), with CLI parameters overriding config values. It iterates through Premium/Fabric workspaces, connects each to the tenant's ADLS Gen2 storage, and triggers an XMLA backup for each semantic model.

### Interactive Login — All Workspaces

```powershell
.\Backup-PBISemanticModels.ps1
```

A browser window will open for you to sign in to Power BI. After authentication, the script processes every dedicated-capacity workspace.

### Filter by Capacity Name (Wildcards Supported)

```powershell
.\Backup-PBISemanticModels.ps1 -CapacityFilter "Sales Premium", "Finance*"
```

- `-CapacityFilter` — only process workspaces on capacities whose display names match these patterns.
- If omitted, all dedicated-capacity workspaces are processed regardless of which capacity they belong to.

### Filter by Workspace Name (Wildcards Supported)

```powershell
.\Backup-PBISemanticModels.ps1 -WorkspaceFilter "Sales*", "Finance*" -ExcludeWorkspaces "Sales Archive"
```

- `-WorkspaceFilter` — only process workspaces whose names match these patterns.
- `-ExcludeWorkspaces` — skip workspaces matching these patterns (evaluated first).

Capacity and workspace filters can be combined — capacity filtering is applied first, then workspace name filtering.

### Filter by Semantic Model Name

```powershell
.\Backup-PBISemanticModels.ps1 -DatasetFilter "Revenue Model", "Cost*"
```

### Custom Config File

```powershell
.\Backup-PBISemanticModels.ps1 -ConfigFilePath "C:\configs\production.json"
```

### Custom Log File Path

```powershell
.\Backup-PBISemanticModels.ps1 -LogFilePath "C:\Logs\pbi_backup.log"
```

### Preview Mode (No Changes)

```powershell
.\Backup-PBISemanticModels.ps1 -WorkspaceFilter "Test*" -WhatIf
```

`-WhatIf` shows what would happen without making any changes — no ADLS assignments, no backups.

---

## Usage — Restore

The restore script supports three modes. The target workspace **must** be on Premium or Fabric capacity.

Modes 2 and 3 rely on the backup success CSV logs (`Backup_*_successes.csv`) written by the backup script. These CSVs record the exact `.abf` filename for each successful backup, so the restore script can look up the correct file automatically.

### Mode 1 — Restore a Specific Backup File

You specify the exact `.abf` filename. This is useful when you need to restore from a specific point in time.

```powershell
.\Restore-PBISemanticModels.ps1 `
    -WorkspaceName "Sales Analytics" `
    -DatasetName "Sales Model" `
    -BackupFileName "Sales Model_20260305_140000.abf" `
    -AllowOverwrite
```

| Parameter | Purpose |
|---|---|
| `-WorkspaceName` | The workspace to restore into |
| `-DatasetName` | The name for the restored semantic model |
| `-BackupFileName` | The exact `.abf` filename in ADLS storage |
| `-AllowOverwrite` | Overwrite the model if it already exists |

If you omit `-DatasetName`, the script derives it from the filename (strips the `_yyyyMMdd_HHmmss.abf` suffix).

### Mode 2 — Restore a Single Model (Latest Backup)

```powershell
.\Restore-PBISemanticModels.ps1 `
    -WorkspaceName "Sales Analytics" `
    -DatasetName "Sales Model" `
    -AllowOverwrite
```

The script finds the most recent `Backup_*_successes.csv` in the log directory and looks up the `.abf` filename for `Sales Model` in the `Sales Analytics` workspace.

### Mode 3 — Bulk Restore (All Models in Workspace)

```powershell
.\Restore-PBISemanticModels.ps1 `
    -WorkspaceName "Sales Analytics" `
    -AllowOverwrite
```

Restores every semantic model for the given workspace found in the latest backup success CSV. If a model appears more than once, the last entry is used.

### Custom Config File

```powershell
.\Restore-PBISemanticModels.ps1 -WorkspaceName "Sales Analytics" `
    -ConfigFilePath "C:\configs\production.json" -AllowOverwrite
```

### Preview Mode

```powershell
.\Restore-PBISemanticModels.ps1 -WorkspaceName "Sales Analytics" -AllowOverwrite -WhatIf
```

---

## Parameters Reference

### Backup-PBISemanticModels.ps1

| Parameter | Type | Required | Description |
|---|---|---|---|
| `-ConfigFilePath` | string | No | Path to JSON config file. Default: `./config.json`. Config values are used as defaults; CLI params override. |
| `-CapacityFilter` | string[] | No | Capacity display name patterns to include (wildcards OK). Omit to process all capacities. |
| `-DataflowStorageAccountName` | string | No | Display name (or wildcard pattern) of the ADLS Gen2 storage account. Omit to use the first tenant-level account. |
| `-WorkspaceFilter` | string[] | No | Workspace name patterns to include (wildcards OK). Omit to process all. |
| `-ExcludeWorkspaces` | string[] | No | Workspace name patterns to exclude (evaluated before include filter). |
| `-DatasetFilter` | string[] | No | Semantic model name patterns to include (wildcards OK). Omit to back up all. |
| `-LogFilePath` | string | No | Path to log file. Default: `./logs/Backup_<timestamp>.log` |
| `-WhatIf` | switch | No | Preview mode — shows what would happen without making changes. |

### Restore-PBISemanticModels.ps1

| Parameter | Type | Required | Description |
|---|---|---|---|
| `-ConfigFilePath` | string | No | Path to JSON config file. Default: `./config.json`. Used to read `logDirectory`. |
| `-WorkspaceName` | string | **Yes** | Name of the target workspace to restore into. |
| `-DatasetName` | string | No | Name of the semantic model to restore. |
| `-BackupFileName` | string | No | Exact `.abf` filename to restore from ADLS storage. |
| `-AllowOverwrite` | switch | No | Overwrite an existing model with the same name. |
| `-LogFilePath` | string | No | Path to log file. Default: `./logs/Restore_<timestamp>.log` |
| `-WhatIf` | switch | No | Preview mode — shows what would happen without making changes. |

---

## Configuration

The backup script automatically loads `config.json` from the script directory (if it exists). CLI parameters override any values from the config file. This means you can set your standard options in the config and only pass overrides on the command line.

To create your config file:

```powershell
Copy-Item config.example.json config.json
# Edit config.json with your values (this file is git-ignored)
```

### Config File Schema

```json
{
  "capacityNames": ["Sales Premium", "Finance*"],
  "dataflowStorageAccountName": "adlsproduction",
  "workspaceFilter": ["Sales*", "Finance*"],
  "excludeWorkspaces": ["*Archive*"],
  "datasetFilter": [],
  "logDirectory": "./logs"
}
```

| Key | Type | Maps to CLI Parameter | Description |
|---|---|---|---|
| `capacityNames` | string[] | `-CapacityFilter` | Capacity display names to include (wildcards OK). |
| `dataflowStorageAccountName` | string | `-DataflowStorageAccountName` | Display name (or wildcard) of the ADLS Gen2 storage account. |
| `workspaceFilter` | string[] | `-WorkspaceFilter` | Workspace name patterns to include. |
| `excludeWorkspaces` | string[] | `-ExcludeWorkspaces` | Workspace name patterns to exclude. |
| `datasetFilter` | string[] | `-DatasetFilter` | Semantic model name patterns to include. |
| `logDirectory` | string | `-LogFilePath` | Directory for log files. |

### Merge Behavior

- If a CLI parameter is explicitly provided, it **always wins** over the config value.
- If a CLI parameter is not provided, the config value is used.
- If neither is provided, the built-in default applies.
- Use `-ConfigFilePath` to point to a different config file (e.g., per-environment configs).

---

## How Backups Work

1. The script loads `config.json` (if present) and merges with CLI parameters.
2. It authenticates to Power BI (interactive login).
3. It retrieves the tenant-level ADLS Gen2 Dataflow Storage Account ID (matching by name if `dataflowStorageAccountName` is configured).
4. It fetches all dedicated-capacity workspaces, then applies filters in order:
   - **Capacity filter** — if `capacityNames` is set, only workspaces on matching capacities are kept.
   - **Workspace name filter** — include/exclude patterns further narrow the list.
5. For each remaining workspace:
   - Assigns the workspace to the ADLS storage account (skipped if already assigned).
   - For each semantic model (matching dataset filters):
     - Sends a TMSL `backup` command via the XMLA endpoint.
     - The Power BI service writes the `.abf` file to the ADLS Gen2 storage.
6. A summary is logged showing total workspaces processed, models backed up, and any failures.

Backup files follow the naming convention: **`<ModelName>_<yyyyMMdd_HHmmss>.abf`**

---

## How Restores Work

1. The script loads `config.json` (if present) for the `logDirectory` setting.
2. It authenticates to Power BI (interactive login) and looks up the target workspace.
3. It verifies the workspace is on a dedicated capacity (Premium/Fabric).
4. Depending on the parameters provided, it runs in one of three modes:
   - **Mode 1** (`-BackupFileName` provided): Restores that exact file.
   - **Mode 2** (`-DatasetName` only): Finds the most recent `Backup_*_successes.csv` in the log directory and looks up the matching `.abf` filename.
   - **Mode 3** (neither provided): Reads the latest backup success CSV and restores all models that match the target workspace.
5. For modes 2 and 3, the access token is refreshed before each restore to avoid staleness during long runs.
6. Each restore sends a TMSL `restore` command via the XMLA endpoint.
7. Results are recorded to `Restore_<timestamp>_successes.csv` and `Restore_<timestamp>_failures.csv`.
8. A summary is logged showing attempted, successful, and failed restores.

---

## Logging

All operations are logged to both the **console** and a **timestamped log file**.

- **Default log location:** `./logs/Backup_<yyyyMMdd_HHmmss>.log` or `./logs/Restore_<yyyyMMdd_HHmmss>.log`
- **Override:** Pass `-LogFilePath "C:\your\path\logfile.log"` to either script.
- **Log format:** `[yyyy-MM-dd HH:mm:ss] [Level] Message`
- **Log levels:** `Info`, `Success`, `Warning`, `Error`

Both scripts also generate CSV summary logs alongside the main log:

- `Backup_<timestamp>_successes.csv` / `Backup_<timestamp>_failures.csv`
- `Restore_<timestamp>_successes.csv` / `Restore_<timestamp>_failures.csv`

Success CSVs include columns: `Workspace`, `SemanticModel`, `BackupFileName`. Failure CSVs add an `Error` column.

The restore script (modes 2 and 3) uses the backup success CSVs to look up the `.abf` filenames for the latest backup run.

The `logs/` directory is created automatically if it doesn't exist. The directory is included in `.gitignore`.

---

## Troubleshooting

| # | Issue | Resolution |
|---|---|---|
| 1 | **"No Dataflow Storage Accounts found"** | Attach an ADLS Gen2 account in the Power BI Admin Portal → Azure connections → Tenant-level storage. |
| 2 | **403 Forbidden on AssignToDataflowStorage** | Ensure your account has **Admin** access on the workspace. Verify the tenant setting *"Allow workspace admins to assign workspaces to dataflow storage accounts"* is enabled. |
| 3 | **XMLA endpoint connection failed** | Verify: (a) the workspace is on Premium/Fabric capacity, (b) the XMLA endpoint is set to **Read Write** in capacity settings, and (c) the workspace name doesn't contain special characters that break the endpoint URL. |
| 4 | **"Connect-PowerBIServiceAccount is not recognized"** | The `MicrosoftPowerBIMgmt.Profile` module is not installed. Run `Install-Module -Name MicrosoftPowerBIMgmt -Scope CurrentUser -Force`. |
| 5 | **"Invoke-ASCmd is not recognized"** | The `SqlServer` module is not installed. Run `Install-Module -Name SqlServer -Scope CurrentUser -Force`. |
| 6 | **Token expired during long runs** | For large tenants with many workspaces, use `-WorkspaceFilter` to process subsets in separate runs. |
| 7 | **Backup file not found during restore** | Modes 2 & 3 look up filenames from the latest `Backup_*_successes.csv`. If no CSV exists, run a backup first or use Mode 1 with `-BackupFileName`. |
| 8 | **"Workspace 'X' is not on a dedicated capacity"** | The target workspace must be assigned to a Premium or Fabric capacity. Move the workspace to a capacity in the Power BI Admin Portal. |
| 9 | **#Requires module not found** | If you see `The following modules could not be loaded`, install the specific sub-module: `Install-Module -Name MicrosoftPowerBIMgmt.Profile -Scope CurrentUser -Force` (repeat for `.Workspaces`, `.Data`). |


---

## Known Limitations

1. **Restore modes 2 & 3 require backup success CSVs.** The restore script finds `.abf` filenames from `Backup_*_successes.csv` files in the log directory. If no CSV exists (e.g., first-time restore from a different machine), use Mode 1 with `-BackupFileName`.
2. **Sequential processing.** Workspaces and models are processed one at a time. For tenants with many workspaces, consider running multiple filtered batches.
3. **Workspace names with special characters.** The XMLA endpoint URL uses the workspace name directly. Names with certain special characters may cause connection failures.

---

## Running Tests

Unit tests are located in `Tests/PBIBackupHelpers.Tests.ps1` and use [Pester](https://pester.dev/) v5+.

```powershell
# Install Pester (if not already installed)
Install-Module -Name Pester -Scope CurrentUser -Force -MinimumVersion 5.0

# Run the tests
Invoke-Pester -Path ./Tests/ -Output Detailed
```

---

## Future Enhancements

- Parallel backup execution for large tenants
- Automatic backup retention / pruning
- Incremental backup support
- Scheduled task / Azure Automation runbook examples
- Email / Teams notification on backup failures
