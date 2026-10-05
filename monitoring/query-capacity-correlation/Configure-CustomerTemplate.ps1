[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$CapacityMetricsWorkspace,

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$CapacityMetricsModel = "Fabric Capacity Metrics",

    [Parameter()]
    [ValidatePattern(
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    )]
    [string]$CapacityId,

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$CapacityName,

    [Parameter()]
    [string]$WorkspaceNamePattern = ".*",

    [Parameter()]
    [string]$WarehouseNamePattern = ".*",

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$TimeZoneId,

    [Parameter()]
    [string]$OutputPath = (Join-Path $PSScriptRoot "Configured"),

    [switch]$Force
)

$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Get-FabricAccessToken {
    $token = az account get-access-token `
        --resource "https://api.fabric.microsoft.com" `
        --query accessToken `
        --output tsv

    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($token)) {
        throw "Could not acquire a Fabric token. Run 'az login' and try again."
    }

    return $token.Trim()
}

function Invoke-FabricGet {
    param(
        [Parameter(Mandatory)]
        [string]$Uri,

        [Parameter(Mandatory)]
        [string]$Token
    )

    Invoke-RestMethod `
        -Method Get `
        -Uri $Uri `
        -Headers @{ Authorization = "Bearer $Token" }
}

function Get-FabricCollection {
    param(
        [Parameter(Mandatory)]
        [string]$Uri,

        [Parameter(Mandatory)]
        [string]$CollectionProperty,

        [Parameter(Mandatory)]
        [string]$Token
    )

    $results = [System.Collections.Generic.List[object]]::new()
    $nextUri = $Uri

    while ($nextUri) {
        $response = Invoke-FabricGet -Uri $nextUri -Token $Token
        foreach ($item in $response.$CollectionProperty) {
            $results.Add($item)
        }
        $nextUri = $response.continuationUri
    }

    return $results
}

function Resolve-FabricCapacity {
    param(
        [string]$Id,
        [string]$Name,
        [Parameter(Mandatory)]
        [string]$Token
    )

    if ($Id -and $Name) {
        throw "Specify either -CapacityId or -CapacityName, not both."
    }

    if ($Id) {
        return [pscustomobject]@{
            Id = $Id
            DisplayName = $null
        }
    }

    $capacities = @(
        Get-FabricCollection `
            -Uri "https://api.fabric.microsoft.com/v1/capacities" `
            -CollectionProperty "value" `
            -Token $Token |
            Where-Object { $_.state -eq "Active" }
    )

    if ($Name) {
        $matches = @(
            $capacities |
                Where-Object { $_.displayName -ieq $Name }
        )
        if ($matches.Count -eq 1) {
            return [pscustomobject]@{
                Id = $matches[0].id
                DisplayName = $matches[0].displayName
            }
        }
        if ($matches.Count -gt 1) {
            throw "Multiple active capacities are named '$Name'. Use -CapacityId."
        }
        throw "No accessible active capacity is named '$Name'."
    }

    if ($capacities.Count -eq 1) {
        return [pscustomobject]@{
            Id = $capacities[0].id
            DisplayName = $capacities[0].displayName
        }
    }

    $available = if ($capacities.Count -eq 0) {
        "No accessible active capacities were returned."
    }
    else {
        ($capacities |
            Sort-Object displayName |
            ForEach-Object { "  {0} ({1})" -f $_.displayName, $_.id }) -join "`n"
    }
    throw (
        "Specify -CapacityName or -CapacityId. Accessible capacities:`n{0}" -f
        $available
    )
}

function Get-WarehousesForCapacity {
    param(
        [Parameter(Mandatory)]
        [string]$Capacity,

        [Parameter(Mandatory)]
        [string]$WorkspacePattern,

        [Parameter(Mandatory)]
        [string]$WarehousePattern,

        [Parameter(Mandatory)]
        [string]$Token
    )

    try {
        $workspaceUri =
            "https://api.fabric.microsoft.com/v1/admin/workspaces" +
            "?capacityId=$Capacity&state=Active&type=Workspace"
        $workspaces = Get-FabricCollection `
            -Uri $workspaceUri `
            -CollectionProperty "workspaces" `
            -Token $Token |
            Where-Object { $_.name -match $WorkspacePattern }
    }
    catch {
        Write-Warning (
            "Capacity-wide admin discovery was unavailable: {0}" -f
            $_.Exception.Message
        )
        Write-Warning (
            "Falling back to workspaces accessible to the signed-in identity."
        )

        $workspaceUri = "https://api.fabric.microsoft.com/v1/workspaces"
        $workspaces = Get-FabricCollection `
            -Uri $workspaceUri `
            -CollectionProperty "value" `
            -Token $Token |
            Where-Object {
                $_.capacityId -eq $Capacity -and
                $_.displayName -match $WorkspacePattern
            } |
            ForEach-Object {
                [pscustomobject]@{
                    id = $_.id
                    name = $_.displayName
                }
            }
    }

    $warehouses = [System.Collections.Generic.List[object]]::new()

    foreach ($workspace in $workspaces) {
        try {
            $itemsUri =
                "https://api.fabric.microsoft.com/v1/workspaces/" +
                "$($workspace.id)/items"
            $items = Get-FabricCollection `
                -Uri $itemsUri `
                -CollectionProperty "value" `
                -Token $Token |
                Where-Object {
                    $_.type -eq "Warehouse" -and
                    $_.displayName -match $WarehousePattern
                }

            foreach ($item in $items) {
                $warehouseUri =
                    "https://api.fabric.microsoft.com/v1/workspaces/" +
                    "$($workspace.id)/warehouses/$($item.id)"
                $warehouse = Invoke-FabricGet -Uri $warehouseUri -Token $Token
                $server = $warehouse.properties.connectionString

                if ([string]::IsNullOrWhiteSpace($server)) {
                    Write-Warning (
                        "Skipping '{0}' in '{1}': no SQL endpoint was returned." -f
                        $item.displayName,
                        $workspace.name
                    )
                    continue
                }

                $warehouses.Add([pscustomobject]@{
                    WorkspaceName = $workspace.name
                    WorkspaceId = $workspace.id
                    WarehouseName = $item.displayName
                    WarehouseItemId = $item.id
                    SqlEndpoint = $server
                })
            }
        }
        catch {
            Write-Warning (
                "Skipping workspace '{0}': {1}" -f
                $workspace.name,
                $_.Exception.Message
            )
        }
    }

    return $warehouses
}

function ConvertTo-MString {
    param([Parameter(Mandatory)][string]$Value)
    return '"' + $Value.Replace('"', '""') + '"'
}

function Resolve-CapacityMetricsEndpoint {
    param([Parameter(Mandatory)][string]$Workspace)

    $xmlaPrefix = "powerbi://api.powerbi.com/v1.0/myorg/"
    $workspaceName = $Workspace.Trim()
    if ($workspaceName -match '^powerbi://') {
        throw "Pass the Capacity Metrics workspace name, not an XMLA endpoint."
    }

    try {
        $encodedWorkspace = [Uri]::EscapeDataString($workspaceName)
    }
    catch {
        throw "The Capacity Metrics workspace name contains invalid characters."
    }

    return $xmlaPrefix + $encodedWorkspace
}

function Convert-SqlTo-MString {
    param([Parameter(Mandatory)][string]$Sql)
    $normalized = $Sql -replace "`r`n|`r|`n", "#(lf)"
    return ConvertTo-MString -Value $normalized
}

function New-CombinedWarehouseM {
    param(
        [Parameter(Mandatory)]
        [object[]]$Warehouses,

        [Parameter(Mandatory)]
        [string]$SqlTemplate,

        [Parameter(Mandatory)]
        [string]$TimeZone
    )

    $lines = [System.Collections.Generic.List[string]]::new()
    $sourceNames = [System.Collections.Generic.List[string]]::new()
    $lines.Add("`t`t`t`tlet")

    for ($index = 0; $index -lt $Warehouses.Count; $index++) {
        $warehouse = $Warehouses[$index]
        $sourceName = "Warehouse{0:D3}" -f ($index + 1)
        $sourceNames.Add($sourceName)

        $sql = $SqlTemplate.
            Replace(
                "{{WAREHOUSE_ITEM_ID}}",
                ([string]$warehouse.WarehouseItemId).ToUpperInvariant()
            ).
            Replace(
                "{{WAREHOUSE_NAME}}",
                ([string]$warehouse.WarehouseName).Replace("'", "''")
            ).
            Replace(
                "{{WORKSPACE_NAME}}",
                ([string]$warehouse.WorkspaceName).Replace("'", "''")
            ).
            Replace(
                "{{TIME_ZONE_ID}}",
                $TimeZone.Replace("'", "''")
            )

        $comma = if ($index -lt $Warehouses.Count - 1) { "," } else { "," }
        $lines.Add("`t`t`t`t    $sourceName = Value.NativeQuery(")
        $lines.Add(
            "`t`t`t`t        Sql.Database(" +
            "$(ConvertTo-MString $warehouse.SqlEndpoint), " +
            "$(ConvertTo-MString $warehouse.WarehouseName)),"
        )
        $lines.Add(
            "`t`t`t`t        $(Convert-SqlTo-MString $sql),"
        )
        $lines.Add("`t`t`t`t        null,")
        $lines.Add("`t`t`t`t        [EnableFolding = false]")
        $lines.Add("`t`t`t`t    )$comma")
    }

    $lines.Add(
        "`t`t`t`t    Source = Table.Combine({" +
        ($sourceNames -join ", ") +
        "})"
    )
    $lines.Add("`t`t`t`tin")
    $lines.Add("`t`t`t`t    Source")
    return $lines -join "`r`n"
}

function New-HourWindowsM {
    @"
				let
				    UtcNow = DateTimeZone.RemoveZone(DateTimeZone.UtcNow()),
				    EndHour = DateTime.From(
				        Date.AddDays(Date.From(UtcNow), 1)
				    ) + #duration(0, 14, 0, 0),
				    StartHour = EndHour - #duration(9, 0, 0, 0),
				    Hours = List.DateTimes(
				        StartHour,
				        217,
				        #duration(0, 1, 0, 0)
				    ),
				    Source = Table.FromList(
				        Hours,
				        Splitter.SplitByNothing(),
				        {"Timestamp"},
				        null,
				        ExtraValues.Error
				    ),
				    Typed = Table.TransformColumnTypes(
				        Source,
				        {{"Timestamp", type datetime}}
				    )
				in
				    Typed
"@
}

$templatePath = Join-Path $PSScriptRoot "Template"
if (-not (Test-Path -LiteralPath $templatePath)) {
    throw "Template folder not found: $templatePath"
}

$fabricToken = Get-FabricAccessToken
$capacity = Resolve-FabricCapacity `
    -Id $CapacityId `
    -Name $CapacityName `
    -Token $fabricToken

try {
    $timeZone = [TimeZoneInfo]::FindSystemTimeZoneById($TimeZoneId)
}
catch {
    throw "Time zone '$TimeZoneId' isn't available on this computer."
}

$warehouses = @(
    Get-WarehousesForCapacity `
        -Capacity $capacity.Id `
        -WorkspacePattern $WorkspaceNamePattern `
        -WarehousePattern $WarehouseNamePattern `
        -Token $fabricToken
)

if ($warehouses.Count -eq 0) {
    throw "No accessible Warehouses matched the requested configuration."
}

$requiredColumns = "WarehouseName", "WarehouseItemId", "SqlEndpoint"
foreach ($column in $requiredColumns) {
    if (-not $warehouses -or -not ($warehouses[0].PSObject.Properties.Name -contains $column)) {
        throw "Warehouse discovery results must include the '$column' property."
    }
}

$warehouses = @(
    $warehouses |
        Where-Object {
            -not [string]::IsNullOrWhiteSpace($_.WarehouseName) -and
            -not [string]::IsNullOrWhiteSpace($_.WarehouseItemId) -and
            -not [string]::IsNullOrWhiteSpace($_.SqlEndpoint)
        } |
        Sort-Object WorkspaceName, WarehouseName, WarehouseItemId -Unique
)

foreach ($warehouse in $warehouses) {
    if ($warehouse.WarehouseItemId -notmatch
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') {
        throw "Invalid Warehouse item ID: $($warehouse.WarehouseItemId)"
    }
}

$capacityEndpoint = Resolve-CapacityMetricsEndpoint `
    -Workspace $CapacityMetricsWorkspace

if (Test-Path -LiteralPath $OutputPath) {
    if (-not $Force) {
        throw "Output folder already exists. Use -Force or choose another -OutputPath."
    }
    Remove-Item -LiteralPath $OutputPath -Recurse -Force
}

New-Item -ItemType Directory -Path $OutputPath | Out-Null
Copy-Item -Path (Join-Path $templatePath "*") -Destination $OutputPath -Recurse

$executionSql = Get-Content -Raw -Encoding UTF8 -LiteralPath (
    Join-Path $PSScriptRoot "query-executions.template.sql"
)
$executionM = New-CombinedWarehouseM `
    -Warehouses $warehouses `
    -SqlTemplate $executionSql `
    -TimeZone $timeZone.Id
$hourWindowsM = New-HourWindowsM

$replacements = [ordered]@{
    "{{CAPACITY_ID}}" = $capacity.Id.ToUpperInvariant()
    "{{CAPACITY_METRICS_ENDPOINT}}" = $capacityEndpoint
    "{{CAPACITY_METRICS_MODEL}}" = $CapacityMetricsModel.Replace('"', '""')
    "{{QUERY_EXECUTIONS_M}}" = $executionM
    "{{HOUR_WINDOWS_M}}" = $hourWindowsM
}

$configurableFiles = Get-ChildItem -LiteralPath $OutputPath -Recurse -File |
    Where-Object { $_.Extension -eq ".tmdl" }

foreach ($file in $configurableFiles) {
    $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $file.FullName
    foreach ($entry in $replacements.GetEnumerator()) {
        $content = $content.Replace($entry.Key, $entry.Value)
    }
    [System.IO.File]::WriteAllText($file.FullName, $content, $utf8NoBom)
}

$warehouseCsv = @($warehouses | ConvertTo-Csv -NoTypeInformation)
[System.IO.File]::WriteAllLines(
    (Join-Path $OutputPath "warehouses.configured.csv"),
    $warehouseCsv,
    $utf8NoBom
)

$connectionSettings = [ordered]@{
    CapacityId = $capacity.Id
    CapacityName = $capacity.DisplayName
    CapacityMetricsEndpoint = $capacityEndpoint
    CapacityMetricsModel = $CapacityMetricsModel
    TimeZoneId = $timeZone.Id
    WarehouseCount = $warehouses.Count
}
$connectionSettingsJson = $connectionSettings | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText(
    (Join-Path $OutputPath "connection-settings.json"),
    $connectionSettingsJson,
    $utf8NoBom
)

$unresolved = Get-ChildItem -LiteralPath $OutputPath -Recurse -File |
    Select-String -Pattern "\{\{[A-Z0-9_]+\}\}"
if ($unresolved) {
    $locations = $unresolved |
        ForEach-Object { "$($_.Path):$($_.LineNumber)" } |
        Sort-Object -Unique
    throw "Configuration left unresolved placeholders:`n$($locations -join "`n")"
}

$pbipPath = Join-Path $OutputPath "Query Capacity Correlation.pbip"
Write-Host ""
Write-Host "Customer project created with $($warehouses.Count) Warehouses:" `
    -ForegroundColor Green
Write-Host "  $pbipPath"
Write-Host ""
Write-Host "Capacity:"
if ($capacity.DisplayName) {
    Write-Host "  Name: $($capacity.DisplayName)"
}
Write-Host "  ID: $($capacity.Id)"
Write-Host "  Time zone: $($timeZone.Id)"
Write-Host ""
Write-Host "Capacity Metrics connection:"
Write-Host "  Server: $capacityEndpoint"
Write-Host "  Semantic model: $CapacityMetricsModel"
Write-Host "  Saved to: $(Join-Path $OutputPath 'connection-settings.json')"
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Open the PBIP file in Power BI Desktop."
Write-Host "2. Confirm the Capacity Metrics server and semantic model match connection-settings.json."
Write-Host "3. Sign in to Capacity Metrics and each SQL endpoint with an account in the same tenant."
Write-Host "4. Set every source privacy level to Organizational."
Write-Host "5. Review and approve each native Query Insights SQL prompt."
Write-Host "6. Refresh, validate the report, and publish it to the customer's workspace."
Write-Host "7. Configure every published source under Gateway and cloud connections."
Write-Host "8. Run a successful Service refresh before sharing the report."
