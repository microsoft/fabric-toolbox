#Requires -Modules MicrosoftPowerBIMgmt.Profile

<#
.SYNOPSIS
    Shared helper functions for Power BI Semantic Model Backup & Restore.
#>

function Write-Log {
    <#
    .SYNOPSIS
        Writes a timestamped message to the console and optionally to a log file.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Message,

        [ValidateSet("Info", "Success", "Warning", "Error")]
        [string]$Level = "Info",

        [string]$LogFilePath
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"

    switch ($Level) {
        "Info"    { Write-Host $logEntry }
        "Success" { Write-Host $logEntry -ForegroundColor Green }
        "Warning" { Write-Host $logEntry -ForegroundColor Yellow }
        "Error"   { Write-Host $logEntry -ForegroundColor Red }
    }

    if ($LogFilePath) {
        $logDir = Split-Path -Path $LogFilePath -Parent
        if ($logDir -and -not (Test-Path $logDir)) {
            New-Item -ItemType Directory -Path $logDir -Force | Out-Null
        }
        Add-Content -Path $LogFilePath -Value $logEntry
    }
}

function Connect-PBIServiceAuthenticated {
    <#
    .SYNOPSIS
        Authenticates to the Power BI Service using interactive login.
    .OUTPUTS
        The bearer token string (without "Bearer " prefix).
    #>
    [CmdletBinding()]
    param()

    Connect-PowerBIServiceAccount -ErrorAction Stop

    return Get-PBIAccessTokenString
}

function Get-PBIAccessTokenString {
    <#
    .SYNOPSIS
        Extracts the bearer token from the current Power BI session.
    .OUTPUTS
        The token string without the "Bearer " prefix.
    #>
    [CmdletBinding()]
    param()

    $raw = (Get-PowerBIAccessToken -AsString -ErrorAction Stop)
    return $raw -replace "^Bearer\s+", ""
}

function Test-NameMatchesPattern {
    <#
    .SYNOPSIS
        Tests whether a name matches a pattern, handling PowerShell wildcard quirks.
    .DESCRIPTION
        Tries an exact (-eq) match first, then falls back to wildcard (-like).
        This ensures names containing square brackets (e.g. "[specialk]") match
        correctly even when the same text appears as a -like pattern, where
        PowerShell would interpret brackets as a character-class wildcard.
    #>
    param(
        [string]$Name,
        [string]$Pattern
    )

    return ($Name -eq $Pattern) -or ($Name -like $Pattern)
}

function Get-TenantDataflowStorageId {
    <#
    .SYNOPSIS
        Retrieves the ID of a tenant-level ADLS Gen2 Dataflow Storage Account.
    .DESCRIPTION
        When -StorageAccountName is provided, matches the display name using wildcard
        comparison. When omitted, returns the first storage account.
    #>
    [CmdletBinding()]
    param(
        [string]$StorageAccountName,

        [string]$LogFilePath
    )

    $endpoint = "https://api.powerbi.com/v1.0/myorg/dataflowStorageAccounts"
    $response = Invoke-PowerBIRestMethod -Url $endpoint -Method Get | ConvertFrom-Json

    if (-not $response.value -or $response.value.Count -eq 0) {
        throw "No Dataflow Storage Accounts are attached at the tenant level. Please attach an ADLS Gen2 account in the Power BI Admin Portal."
    }

    if ($StorageAccountName) {
        $match = $response.value | Where-Object { Test-NameMatchesPattern -Name $_.name -Pattern $StorageAccountName }

        if (-not $match) {
            $available = ($response.value | ForEach-Object { $_.name }) -join ', '
            throw "No Dataflow Storage Account matched '$StorageAccountName'. Available accounts: $available"
        }

        # Take the first match if the wildcard returns multiple
        $storageId = @($match)[0].id
        $storageName = @($match)[0].name
        Write-Log -Message "Matched Dataflow Storage Account: $storageName (ID: $storageId)" -Level Info -LogFilePath $LogFilePath
    }
    else {
        $storageId = $response.value[0].id
        Write-Log -Message "Using first Dataflow Storage Account (ID: $storageId)" -Level Info -LogFilePath $LogFilePath
    }

    return $storageId
}

function Connect-WorkspaceToDataflowStorage {
    <#
    .SYNOPSIS
        Ensures a workspace is connected to the tenant's ADLS Gen2 Dataflow Storage Account.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$WorkspaceId,

        [Parameter(Mandatory)]
        [string]$WorkspaceName,

        [Parameter(Mandatory)]
        [string]$DataflowStorageId,

        [string]$LogFilePath
    )

    $endpoint = "https://api.powerbi.com/v1.0/myorg/groups/$WorkspaceId/AssignToDataflowStorage"
    $body = @{ dataflowStorageId = $DataflowStorageId } | ConvertTo-Json

    try {
        Invoke-PowerBIRestMethod -Url $endpoint -Method Post -Body $body -ContentType "application/json" -ErrorAction Stop
        Write-Log -Message "Workspace '$WorkspaceName': ADLS Gen2 connection verified/assigned." -Level Success -LogFilePath $LogFilePath
    }
    catch {
        $errorMsg = $_.Exception.Message
        $statusCode = $null
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }
        if ($statusCode -eq 400 -or $statusCode -eq 403 -or $errorMsg -match '\b(already assigned|StorageAccountAlreadyAssigned)\b') {
            Write-Log -Message "Workspace '$WorkspaceName': ADLS connection skipped (may already be assigned or requires elevated privileges)." -Level Warning -LogFilePath $LogFilePath
        }
        else {
            Write-Log -Message "Workspace '$WorkspaceName': Failed to assign ADLS storage. Error: $errorMsg" -Level Error -LogFilePath $LogFilePath
        }
    }
}

function Test-WorkspaceMatchesFilter {
    <#
    .SYNOPSIS
        Checks if a workspace name matches include/exclude filter criteria.
    .OUTPUTS
        $true if the workspace should be processed, $false if it should be skipped.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$WorkspaceName,

        [string[]]$IncludeFilter,

        [string[]]$ExcludeFilter
    )

    # Check exclude list first
    if ($ExcludeFilter) {
        foreach ($pattern in $ExcludeFilter) {
            if (Test-NameMatchesPattern -Name $WorkspaceName -Pattern $pattern) {
                return $false
            }
        }
    }

    # If no include filter is specified, include everything
    if (-not $IncludeFilter -or $IncludeFilter.Count -eq 0) {
        return $true
    }

    # Check include list
    foreach ($pattern in $IncludeFilter) {
        if (Test-NameMatchesPattern -Name $WorkspaceName -Pattern $pattern) {
            return $true
        }
    }

    return $false
}

function Import-BackupConfig {
    <#
    .SYNOPSIS
        Reads a JSON configuration file and returns its contents as a hashtable.
    .OUTPUTS
        A hashtable of configuration values, or an empty hashtable if the file is not found.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    if (-not (Test-Path $Path)) {
        return @{}
    }

    $content = Get-Content -Path $Path -Raw
    $json = $content | ConvertFrom-Json

    # Convert PSCustomObject to hashtable
    $config = @{}
    foreach ($prop in $json.PSObject.Properties) {
        $config[$prop.Name] = $prop.Value
    }

    return $config
}

function Get-CapacityIdsByName {
    <#
    .SYNOPSIS
        Resolves capacity display names (with wildcard support) to capacity IDs.
    .OUTPUTS
        An array of matching capacity ID strings.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string[]]$CapacityFilter,

        [string]$LogFilePath
    )

    $allCapacities = Get-PowerBICapacity -Scope Organization

    if (-not $allCapacities) {
        Write-Log -Message "No capacities found in the organization." -Level Warning -LogFilePath $LogFilePath
        return @()
    }

    $matched = @()
    foreach ($capacity in $allCapacities) {
        foreach ($pattern in $CapacityFilter) {
            if (Test-NameMatchesPattern -Name $capacity.DisplayName -Pattern $pattern) {
                $matched += $capacity
                break
            }
        }
    }

    if ($matched.Count -eq 0) {
        Write-Log -Message "No capacities matched the filter: $($CapacityFilter -join ', ')" -Level Warning -LogFilePath $LogFilePath
        return @()
    }

    foreach ($cap in $matched) {
        Write-Log -Message "Matched capacity: $($cap.DisplayName) (ID: $($cap.Id))" -Level Info -LogFilePath $LogFilePath
    }

    return $matched | ForEach-Object { $_.Id }
}

function Test-DatasetMatchesFilter {
    <#
    .SYNOPSIS
        Checks if a dataset name matches an include filter.
    .OUTPUTS
        $true if the dataset should be processed.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$DatasetName,

        [string[]]$IncludeFilter
    )

    if (-not $IncludeFilter -or $IncludeFilter.Count -eq 0) {
        return $true
    }

    foreach ($pattern in $IncludeFilter) {
        if (Test-NameMatchesPattern -Name $DatasetName -Pattern $pattern) {
            return $true
        }
    }

    return $false
}

Export-ModuleMember -Function @(
    'Write-Log'
    'Connect-PBIServiceAuthenticated'
    'Get-PBIAccessTokenString'
    'Get-TenantDataflowStorageId'
    'Connect-WorkspaceToDataflowStorage'
    'Test-WorkspaceMatchesFilter'
    'Test-DatasetMatchesFilter'
    'Import-BackupConfig'
    'Get-CapacityIdsByName'
)
