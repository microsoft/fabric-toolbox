#Requires -Modules MicrosoftPowerBIMgmt.Profile, MicrosoftPowerBIMgmt.Workspaces, MicrosoftPowerBIMgmt.Data, SqlServer

<#
.SYNOPSIS
    Backs up Power BI Semantic Models to an attached ADLS Gen2 storage account.

.DESCRIPTION
    Iterates through Premium/Fabric workspaces in the organization. For each workspace:
    1. Connects the workspace to the tenant's default Dataflow Storage (ADLS Gen2).
    2. Loops through all semantic models in the workspace.
    3. Triggers an automated backup (.abf file) using the XMLA endpoint.

    Settings are loaded from config.json (if present) and can be overridden by
    command-line parameters. Supports interactive authentication,
    capacity/workspace/model filtering, and file-based logging.

.PARAMETER ConfigFilePath
    Optional. Path to a JSON configuration file. Defaults to ./config.json.
    Settings in the file are used as defaults; CLI parameters override them.

.PARAMETER CapacityFilter
    Optional. An array of capacity display name patterns (supports wildcards) to include.
    If omitted, all dedicated-capacity workspaces are processed regardless of capacity.

.PARAMETER DataflowStorageAccountName
    Optional. The display name (or wildcard pattern) of the ADLS Gen2 Dataflow Storage
    Account to use. If omitted, the first tenant-level storage account is used.

.PARAMETER WorkspaceFilter
    Optional. An array of workspace name patterns (supports wildcards) to include.
    If omitted, all dedicated-capacity workspaces are processed.

.PARAMETER ExcludeWorkspaces
    Optional. An array of workspace name patterns (supports wildcards) to exclude.
    Evaluated before the include filter.

.PARAMETER DatasetFilter
    Optional. An array of semantic model name patterns (supports wildcards) to include.
    If omitted, all models in each workspace are backed up.

.PARAMETER LogFilePath
    Optional. Path to a log file. Defaults to ./logs/Backup_<timestamp>.log.

.EXAMPLE
    # Interactive login, all workspaces
    .\Backup-PBISemanticModels.ps1

.EXAMPLE
    # Back up only workspaces on a specific capacity
    .\Backup-PBISemanticModels.ps1 -CapacityFilter "Sales Premium"

.EXAMPLE
    # Back up only workspaces matching "Sales*", exclude "Sales Archive"
    .\Backup-PBISemanticModels.ps1 -WorkspaceFilter "Sales*" -ExcludeWorkspaces "Sales Archive"

.EXAMPLE
    # Use a custom config file
    .\Backup-PBISemanticModels.ps1 -ConfigFilePath "C:\configs\production.json"
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$ConfigFilePath,

    [string[]]$CapacityFilter,

    [string]$DataflowStorageAccountName,

    [string[]]$WorkspaceFilter,

    [string[]]$ExcludeWorkspaces,

    [string[]]$DatasetFilter,

    [string]$LogFilePath
)

# --- Setup ---
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Import-Module (Join-Path $scriptDir "PBIBackupHelpers.psm1") -Force

# --- Load Config ---
if (-not $ConfigFilePath) {
    $ConfigFilePath = Join-Path $scriptDir "config.json"
}
$config = Import-BackupConfig -Path $ConfigFilePath

# Merge: CLI parameters override config values.
# For arrays, use CLI value if explicitly provided, else config value.
$boundParams = $PSBoundParameters

if (-not $boundParams.ContainsKey('CapacityFilter') -and $config.capacityNames) {
    $CapacityFilter = @($config.capacityNames)
}
if (-not $boundParams.ContainsKey('DataflowStorageAccountName') -and $config.dataflowStorageAccountName) {
    $DataflowStorageAccountName = $config.dataflowStorageAccountName
}
if (-not $boundParams.ContainsKey('WorkspaceFilter') -and $config.workspaceFilter) {
    $WorkspaceFilter = @($config.workspaceFilter)
}
if (-not $boundParams.ContainsKey('ExcludeWorkspaces') -and $config.excludeWorkspaces) {
    $ExcludeWorkspaces = @($config.excludeWorkspaces)
}
if (-not $boundParams.ContainsKey('DatasetFilter') -and $config.datasetFilter) {
    $DatasetFilter = @($config.datasetFilter)
}
$logTimestamp = Get-Date -Format "yyyyMMdd_HHmmss"

if (-not $LogFilePath) {
    $logDir = if ($config.logDirectory) { $config.logDirectory } else { Join-Path $scriptDir "logs" }
    $LogFilePath = Join-Path $logDir ("Backup_{0}.log" -f $logTimestamp)
}
else {
    $logDir = Split-Path -Path $LogFilePath -Parent
}

# Derive success/failure CSV log paths using the same timestamp
$SuccessLogPath = Join-Path $logDir ("Backup_{0}_successes.csv" -f $logTimestamp)
$FailureLogPath = Join-Path $logDir ("Backup_{0}_failures.csv" -f $logTimestamp)

# Ensure log directory exists and write CSV headers
if ($logDir -and -not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
Set-Content -Path $SuccessLogPath -Value '"Workspace","SemanticModel","BackupFileName"'
Set-Content -Path $FailureLogPath -Value '"Workspace","SemanticModel","Error"'

# Counters for summary
$totalWorkspaces = 0
$totalModels = 0
$totalSuccess = 0
$totalFailed = 0

# --- Authenticate ---
Write-Log -Message "=== Power BI Semantic Model Backup ===" -Level Info -LogFilePath $LogFilePath

Write-Log -Message "Authenticating to Power BI Service..." -Level Info -LogFilePath $LogFilePath
$token = Connect-PBIServiceAuthenticated
Write-Log -Message "Authentication successful." -Level Success -LogFilePath $LogFilePath

# --- Get Dataflow Storage ---
Write-Log -Message "Retrieving tenant Dataflow Storage Account..." -Level Info -LogFilePath $LogFilePath
$storageParams = @{ LogFilePath = $LogFilePath }
if ($DataflowStorageAccountName) {
    $storageParams['StorageAccountName'] = $DataflowStorageAccountName
}
$dataflowStorageId = Get-TenantDataflowStorageId @storageParams

# --- Get Workspaces ---
Write-Log -Message "Fetching dedicated-capacity workspaces..." -Level Info -LogFilePath $LogFilePath
$workspaces = Get-PowerBIWorkspace -Scope Organization -All | Where-Object { $_.IsOnDedicatedCapacity -eq $true }

if (-not $workspaces) {
    Write-Log -Message "No dedicated-capacity workspaces found." -Level Warning -LogFilePath $LogFilePath
    return
}

Write-Log -Message "Found $($workspaces.Count) dedicated-capacity workspace(s)." -Level Info -LogFilePath $LogFilePath

# --- Filter by Capacity ---
if ($CapacityFilter -and $CapacityFilter.Count -gt 0) {
    Write-Log -Message "Resolving capacity filter: $($CapacityFilter -join ', ')" -Level Info -LogFilePath $LogFilePath
    $capacityIds = Get-CapacityIdsByName -CapacityFilter $CapacityFilter -LogFilePath $LogFilePath

    if (-not $capacityIds -or $capacityIds.Count -eq 0) {
        Write-Log -Message "No capacities matched the filter. Nothing to back up." -Level Warning -LogFilePath $LogFilePath
        return
    }

    $workspaces = $workspaces | Where-Object { $_.CapacityId -in $capacityIds }

    if (-not $workspaces) {
        Write-Log -Message "No workspaces found on the matched capacities." -Level Warning -LogFilePath $LogFilePath
        return
    }

    Write-Log -Message "$($workspaces.Count) workspace(s) on matched capacities. Applying name filters..." -Level Info -LogFilePath $LogFilePath
}
else {
    Write-Log -Message "No capacity filter specified. Applying name filters..." -Level Info -LogFilePath $LogFilePath
}

# --- Process Workspaces ---
foreach ($workspace in $workspaces) {

    # Apply workspace filters
    if (-not (Test-WorkspaceMatchesFilter -WorkspaceName $workspace.Name -IncludeFilter $WorkspaceFilter -ExcludeFilter $ExcludeWorkspaces)) {
        Write-Log -Message "Skipping workspace '$($workspace.Name)' (filtered out)." -Level Info -LogFilePath $LogFilePath
        continue
    }

    $totalWorkspaces++
    Write-Log -Message "--- Processing Workspace: $($workspace.Name) ---" -Level Info -LogFilePath $LogFilePath

    # Ensure ADLS connection
    if ($PSCmdlet.ShouldProcess($workspace.Name, "Assign Dataflow Storage")) {
        Connect-WorkspaceToDataflowStorage `
            -WorkspaceId $workspace.Id `
            -WorkspaceName $workspace.Name `
            -DataflowStorageId $dataflowStorageId `
            -LogFilePath $LogFilePath
    }

    # Get datasets
    $datasets = Get-PowerBIDataset -WorkspaceId $workspace.Id

    if (-not $datasets) {
        Write-Log -Message "  No semantic models found in '$($workspace.Name)'." -Level Info -LogFilePath $LogFilePath
        continue
    }

    # Build XMLA connection string — refresh token to avoid staleness
    $token = Get-PBIAccessTokenString
    $xmlaEndpoint = "powerbi://api.powerbi.com/v1.0/myorg/$($workspace.Name)"
    $connectionString = "DataSource=$xmlaEndpoint;Password=$token;"

    foreach ($dataset in $datasets) {

        # Apply dataset filter
        if (-not (Test-DatasetMatchesFilter -DatasetName $dataset.Name -IncludeFilter $DatasetFilter)) {
            continue
        }

        $totalModels++
        $backupFileName = "{0}_{1}.abf" -f $dataset.Name, (Get-Date -Format "yyyyMMdd_HHmmss")

        # Escape backslashes and double-quotes for TMSL JSON
        $escapedName = $dataset.Name -replace '\\', '\\\\' -replace '"', '\"'
        $escapedFile = $backupFileName -replace '\\', '\\\\' -replace '"', '\"'

        $tmsl = @"
{
  "backup": {
    "database": "$escapedName",
    "file": "$escapedFile",
    "allowOverwrite": true,
    "applyCompression": true
  }
}
"@

        if ($PSCmdlet.ShouldProcess("$($dataset.Name) in $($workspace.Name)", "XMLA Backup")) {
            try {
                Write-Log -Message "  Backing up: $($dataset.Name) -> $backupFileName" -Level Info -LogFilePath $LogFilePath
                $result = Invoke-ASCmd -ConnectionString $connectionString -Query $tmsl -ErrorAction Stop
                if ($result -match '<Error.*?Description="([^"]*)"') {
                    Write-Log -Message "  XMLA error for '$($dataset.Name)': $($Matches[1])" -Level Error -LogFilePath $LogFilePath
                    $escapedWs = $workspace.Name -replace '"', '""'
                    $escapedDs = $dataset.Name -replace '"', '""'
                    $escapedErr = $Matches[1] -replace '"', '""'
                    Add-Content -Path $FailureLogPath -Value ('"' + $escapedWs + '","' + $escapedDs + '","' + $escapedErr + '"')
                    $totalFailed++
                }
                else {
                    Write-Log -Message "  Backup successful: $($dataset.Name)" -Level Success -LogFilePath $LogFilePath
                    $escapedWs = $workspace.Name -replace '"', '""'
                    $escapedDs = $dataset.Name -replace '"', '""'
                    $escapedBf = $backupFileName -replace '"', '""'
                    Add-Content -Path $SuccessLogPath -Value ('"' + $escapedWs + '","' + $escapedDs + '","' + $escapedBf + '"')
                    $totalSuccess++
                }
            }
            catch {
                Write-Log -Message "  Failed to backup '$($dataset.Name)'. Error: $_" -Level Error -LogFilePath $LogFilePath
                if ($_.Exception.InnerException) {
                    Write-Log -Message "  Inner Exception: $($_.Exception.InnerException.Message)" -Level Error -LogFilePath $LogFilePath
                }
                $escapedWs = $workspace.Name -replace '"', '""'
                $escapedDs = $dataset.Name -replace '"', '""'
                $escapedErr = $_.Exception.Message -replace '"', '""'
                Add-Content -Path $FailureLogPath -Value ('"' + $escapedWs + '","' + $escapedDs + '","' + $escapedErr + '"')
                $totalFailed++
            }
        }
    }
}

# --- Summary ---
Write-Log -Message "=== Backup Summary ===" -Level Info -LogFilePath $LogFilePath
Write-Log -Message "Workspaces processed : $totalWorkspaces" -Level Info -LogFilePath $LogFilePath
Write-Log -Message "Models attempted     : $totalModels" -Level Info -LogFilePath $LogFilePath
Write-Log -Message "Successful backups   : $totalSuccess" -Level Success -LogFilePath $LogFilePath
if ($totalFailed -gt 0) {
    Write-Log -Message "Failed backups       : $totalFailed" -Level Error -LogFilePath $LogFilePath
}
Write-Log -Message "Log file             : $LogFilePath" -Level Info -LogFilePath $LogFilePath
Write-Log -Message "Success log          : $SuccessLogPath" -Level Info -LogFilePath $LogFilePath
Write-Log -Message "Failure log          : $FailureLogPath" -Level Info -LogFilePath $LogFilePath
Write-Log -Message "=== Backup Complete ===" -Level Info -LogFilePath $LogFilePath
