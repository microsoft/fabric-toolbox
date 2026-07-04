#Requires -Modules MicrosoftPowerBIMgmt.Profile, MicrosoftPowerBIMgmt.Workspaces, MicrosoftPowerBIMgmt.Data, SqlServer

<#
.SYNOPSIS
    Restores Power BI Semantic Models from .abf backup files via the XMLA endpoint.

.DESCRIPTION
    Restores one or more semantic models into a specified workspace using TMSL restore
    commands executed against the XMLA endpoint. Supports three modes:

    - Explicit file:   Provide -BackupFileName to restore a specific .abf file.
    - Single model:    Provide -DatasetName only — the script finds the latest backup
                       for that model from the most recent backup success CSV.
    - Bulk restore:    Omit both — restores all models from the latest backup success CSV
                       that match the target workspace.

    The workspace must be on a Premium or Fabric capacity (XMLA endpoint requirement).

.PARAMETER ConfigFilePath
    Optional. Path to a JSON configuration file. Defaults to ./config.json.
    Used to read the logDirectory setting.

.PARAMETER WorkspaceName
    Required. The name of the target workspace to restore into.

.PARAMETER DatasetName
    Optional. The name of the semantic model to restore. When combined with
    -BackupFileName, restores that specific file as this model.

.PARAMETER BackupFileName
    Optional. The exact .abf filename to restore (e.g., "Sales_20260301_120000.abf").
    When provided, performs a single restore operation.

.PARAMETER AllowOverwrite
    Switch. When set, the restore will overwrite an existing model with the same name.

.PARAMETER LogFilePath
    Optional. Path to a log file. Defaults to ./logs/Restore_<timestamp>.log.

.EXAMPLE
    # Restore a single backup interactively
    .\Restore-PBISemanticModels.ps1 -WorkspaceName "Sales Analytics" `
        -DatasetName "Sales Model" -BackupFileName "Sales Model_20260301_120000.abf" -AllowOverwrite

.EXAMPLE
    # Restore a single model using the latest backup
    .\Restore-PBISemanticModels.ps1 -WorkspaceName "Sales Analytics" -DatasetName "Sales Model" -AllowOverwrite

.EXAMPLE
    # Bulk-restore all models from the latest backup
    .\Restore-PBISemanticModels.ps1 -WorkspaceName "Sales Analytics" -AllowOverwrite

#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$ConfigFilePath,

    [Parameter(Mandatory)]
    [string]$WorkspaceName,

    [string]$DatasetName,

    [string]$BackupFileName,

    [switch]$AllowOverwrite,

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

$logTimestamp = Get-Date -Format "yyyyMMdd_HHmmss"

if (-not $LogFilePath) {
    $logDir = if ($config.logDirectory) { $config.logDirectory } else { Join-Path $scriptDir "logs" }
    $LogFilePath = Join-Path $logDir ("Restore_{0}.log" -f $logTimestamp)
}
else {
    $logDir = Split-Path -Path $LogFilePath -Parent
}

# Derive success/failure CSV log paths using the same timestamp
$SuccessLogPath = Join-Path $logDir ("Restore_{0}_successes.csv" -f $logTimestamp)
$FailureLogPath = Join-Path $logDir ("Restore_{0}_failures.csv" -f $logTimestamp)

# Ensure log directory exists and write CSV headers
if ($logDir -and -not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
Set-Content -Path $SuccessLogPath -Value '"Workspace","SemanticModel","BackupFileName"'
Set-Content -Path $FailureLogPath -Value '"Workspace","SemanticModel","BackupFileName","Error"'

$totalAttempted = 0
$totalSuccess = 0
$totalFailed = 0

# --- Authenticate ---
Write-Log -Message "=== Power BI Semantic Model Restore ===" -Level Info -LogFilePath $LogFilePath

Write-Log -Message "Authenticating to Power BI Service..." -Level Info -LogFilePath $LogFilePath
$token = Connect-PBIServiceAuthenticated
Write-Log -Message "Authentication successful." -Level Success -LogFilePath $LogFilePath

# --- Resolve Workspace ---
Write-Log -Message "Looking up workspace '$WorkspaceName'..." -Level Info -LogFilePath $LogFilePath
$workspace = Get-PowerBIWorkspace -Scope Organization -Name $WorkspaceName

if (-not $workspace) {
    Write-Log -Message "Workspace '$WorkspaceName' not found." -Level Error -LogFilePath $LogFilePath
    throw "Workspace '$WorkspaceName' not found."
}

if (-not $workspace.IsOnDedicatedCapacity) {
    Write-Log -Message "Workspace '$WorkspaceName' is not on a dedicated capacity. XMLA restore requires Premium or Fabric." -Level Error -LogFilePath $LogFilePath
    throw "Workspace '$WorkspaceName' is not on a dedicated capacity."
}

Write-Log -Message "Workspace found: $($workspace.Name) (ID: $($workspace.Id))" -Level Success -LogFilePath $LogFilePath

# --- Build XMLA Connection ---
$xmlaEndpoint = "powerbi://api.powerbi.com/v1.0/myorg/$($workspace.Name)"
$connectionString = "DataSource=$xmlaEndpoint;Password=$token;"

$overwriteFlag = if ($AllowOverwrite) { "true" } else { "false" }

# --- Helper: Find latest backup success CSV ---
function Get-LatestBackupManifest {
    param([string]$LogDirectory)

    $csvFiles = Get-ChildItem -Path $LogDirectory -Filter "Backup_*_successes.csv" -File -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending

    if (-not $csvFiles) { return $null }

    return $csvFiles[0].FullName
}

# --- Helper: Execute a single restore ---
function Invoke-SingleRestore {
    param(
        [string]$TargetName,
        [string]$File,
        [string]$ConnString,
        [string]$Overwrite,
        [string]$Log,
        [string]$SuccessLog,
        [string]$FailureLog,
        [string]$WsName
    )

    $escapedName = $TargetName -replace '\\', '\\\\' -replace '"', '\"'
    $escapedFile = $File -replace '\\', '\\\\' -replace '"', '\"'

    $tmsl = @"
{
  "restore": {
    "database": "$escapedName",
    "file": "$escapedFile",
    "allowOverwrite": $Overwrite
  }
}
"@

    if ($script:PSCmdlet.ShouldProcess("$TargetName in $WsName", "XMLA Restore from $File")) {
        try {
            Write-Log -Message "  Restoring '$TargetName' from '$File'..." -Level Info -LogFilePath $Log
            $result = Invoke-ASCmd -ConnectionString $ConnString -Query $tmsl -ErrorAction Stop
            if ($result -match '<Error.*?Description="([^"]*)"') {
                Write-Log -Message "  XMLA error restoring '$TargetName': $($Matches[1])" -Level Error -LogFilePath $Log
                $eWs = $WsName -replace '"', '""'
                $eDs = $TargetName -replace '"', '""'
                $eBf = $File -replace '"', '""'
                $eErr = $Matches[1] -replace '"', '""'
                Add-Content -Path $FailureLog -Value ('"' + $eWs + '","' + $eDs + '","' + $eBf + '","' + $eErr + '"')
                $script:totalFailed++
            }
            else {
                Write-Log -Message "  Restore successful: $TargetName" -Level Success -LogFilePath $Log
                $eWs = $WsName -replace '"', '""'
                $eDs = $TargetName -replace '"', '""'
                $eBf = $File -replace '"', '""'
                Add-Content -Path $SuccessLog -Value ('"' + $eWs + '","' + $eDs + '","' + $eBf + '"')
                $script:totalSuccess++
            }
        }
        catch {
            Write-Log -Message "  Failed to restore '$TargetName'. Error: $_" -Level Error -LogFilePath $Log
            $eWs = $WsName -replace '"', '""'
            $eDs = $TargetName -replace '"', '""'
            $eBf = $File -replace '"', '""'
            $eErr = $_.Exception.Message -replace '"', '""'
            Add-Content -Path $FailureLog -Value ('"' + $eWs + '","' + $eDs + '","' + $eBf + '","' + $eErr + '"')
            $script:totalFailed++
        }
    }
}

# --- Determine Restore Mode ---
if ($BackupFileName) {
    # --- Mode 1: Explicit backup file ---
    $targetName = if ($DatasetName) { $DatasetName } else {
        if ($BackupFileName -match '^(.+)_\d{8}_\d{6}\.abf$') {
            $Matches[1]
        }
        else {
            $BackupFileName -replace '\.abf$', ''
        }
    }

    $totalAttempted++
    Write-Log -Message "Restoring specific backup file: $BackupFileName" -Level Info -LogFilePath $LogFilePath
    Invoke-SingleRestore -TargetName $targetName -File $BackupFileName -ConnString $connectionString `
        -Overwrite $overwriteFlag -Log $LogFilePath -SuccessLog $SuccessLogPath -FailureLog $FailureLogPath `
        -WsName $workspace.Name
}
elseif ($DatasetName) {
    # --- Mode 2: Single model, find latest backup from CSV ---
    Write-Log -Message "Looking up latest backup for '$DatasetName' in workspace '$WorkspaceName'..." -Level Info -LogFilePath $LogFilePath

    $manifestPath = Get-LatestBackupManifest -LogDirectory $logDir
    if (-not $manifestPath) {
        Write-Log -Message "No backup success CSV found in '$logDir'. Cannot determine latest backup. Use -BackupFileName to specify explicitly." -Level Error -LogFilePath $LogFilePath
        throw "No backup success CSV found in '$logDir'."
    }

    Write-Log -Message "Using backup manifest: $manifestPath" -Level Info -LogFilePath $LogFilePath
    $manifest = Import-Csv -Path $manifestPath

    $entry = $manifest | Where-Object { $_.Workspace -eq $WorkspaceName -and $_.SemanticModel -eq $DatasetName } | Select-Object -Last 1

    if (-not $entry) {
        Write-Log -Message "No backup found for '$DatasetName' in workspace '$WorkspaceName' in the latest backup CSV." -Level Error -LogFilePath $LogFilePath
        throw "No backup entry found for '$DatasetName' in workspace '$WorkspaceName'."
    }

    $totalAttempted++
    Write-Log -Message "Found backup: $($entry.BackupFileName)" -Level Info -LogFilePath $LogFilePath

    # Refresh token before restore
    $token = Get-PBIAccessTokenString
    $connectionString = "DataSource=$xmlaEndpoint;Password=$token;"

    Invoke-SingleRestore -TargetName $DatasetName -File $entry.BackupFileName -ConnString $connectionString `
        -Overwrite $overwriteFlag -Log $LogFilePath -SuccessLog $SuccessLogPath -FailureLog $FailureLogPath `
        -WsName $workspace.Name
}
else {
    # --- Mode 3: Bulk restore from latest backup CSV ---
    Write-Log -Message "Bulk restore mode: finding latest backups for workspace '$WorkspaceName'..." -Level Info -LogFilePath $LogFilePath

    $manifestPath = Get-LatestBackupManifest -LogDirectory $logDir
    if (-not $manifestPath) {
        Write-Log -Message "No backup success CSV found in '$logDir'. Cannot determine latest backups. Use -BackupFileName to specify explicitly." -Level Error -LogFilePath $LogFilePath
        throw "No backup success CSV found in '$logDir'."
    }

    Write-Log -Message "Using backup manifest: $manifestPath" -Level Info -LogFilePath $LogFilePath
    $manifest = Import-Csv -Path $manifestPath

    $entries = $manifest | Where-Object { $_.Workspace -eq $WorkspaceName }

    if (-not $entries) {
        Write-Log -Message "No backup entries found for workspace '$WorkspaceName' in the latest backup CSV." -Level Warning -LogFilePath $LogFilePath
        return
    }

    # Keep only the last entry per model (in case of duplicates)
    $uniqueEntries = @{}
    foreach ($entry in $entries) {
        $uniqueEntries[$entry.SemanticModel] = $entry
    }

    Write-Log -Message "Found $($uniqueEntries.Count) model(s) to restore." -Level Info -LogFilePath $LogFilePath

    foreach ($modelName in $uniqueEntries.Keys) {
        $entry = $uniqueEntries[$modelName]
        $totalAttempted++

        # Refresh token to avoid staleness
        $token = Get-PBIAccessTokenString
        $connectionString = "DataSource=$xmlaEndpoint;Password=$token;"

        Invoke-SingleRestore -TargetName $modelName -File $entry.BackupFileName -ConnString $connectionString `
            -Overwrite $overwriteFlag -Log $LogFilePath -SuccessLog $SuccessLogPath -FailureLog $FailureLogPath `
            -WsName $workspace.Name
    }
}

# --- Summary ---
Write-Log -Message "=== Restore Summary ===" -Level Info -LogFilePath $LogFilePath
Write-Log -Message "Workspace            : $($workspace.Name)" -Level Info -LogFilePath $LogFilePath
Write-Log -Message "Models attempted     : $totalAttempted" -Level Info -LogFilePath $LogFilePath
Write-Log -Message "Successful restores  : $totalSuccess" -Level Success -LogFilePath $LogFilePath
if ($totalFailed -gt 0) {
    Write-Log -Message "Failed restores      : $totalFailed" -Level Error -LogFilePath $LogFilePath
}
Write-Log -Message "Log file             : $LogFilePath" -Level Info -LogFilePath $LogFilePath
Write-Log -Message "Success log          : $SuccessLogPath" -Level Info -LogFilePath $LogFilePath
Write-Log -Message "Failure log          : $FailureLogPath" -Level Info -LogFilePath $LogFilePath
Write-Log -Message "=== Restore Complete ===" -Level Info -LogFilePath $LogFilePath
