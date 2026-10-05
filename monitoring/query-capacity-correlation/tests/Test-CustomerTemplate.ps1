[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
    "fabric-data-warehouse-query-capacity-" + [Guid]::NewGuid().ToString("N")
)
$namedOutput = Join-Path $testRoot "Configured-Named"
$automaticOutput = Join-Path $testRoot "Configured-Automatic"
$capacityId = "33333333-3333-3333-3333-333333333333"
$otherCapacityId = "44444444-4444-4444-4444-444444444444"
$global:MockCapacities = @()
$global:ExpectedCapacityId = $null

function Assert-Equal {
    param(
        [Parameter(Mandatory)][object]$Actual,
        [Parameter(Mandatory)][object]$Expected,
        [Parameter(Mandatory)][string]$Message
    )

    if ($Actual -ne $Expected) {
        throw "$Message`nExpected: $Expected`nActual: $Actual"
    }
}

function Assert-True {
    param(
        [Parameter(Mandatory)][bool]$Condition,
        [Parameter(Mandatory)][string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function az {
    $global:LASTEXITCODE = 0
    return "test-token"
}

function Invoke-RestMethod {
    param(
        [string]$Method,
        [string]$Uri,
        [hashtable]$Headers
    )

    if ($Uri -match '/v1/capacities$') {
        return [pscustomobject]@{
            value = @($global:MockCapacities)
            continuationToken = $null
        }
    }

    if ($Uri -match '/v1/admin/workspaces\?') {
        if (
            $Uri -notmatch [regex]::Escape(
                "capacityId=$global:ExpectedCapacityId"
            ) -or
            $Uri -notmatch 'state=Active' -or
            $Uri -notmatch 'type=Workspace'
        ) {
            throw "Admin workspace request wasn't scoped correctly: $Uri"
        }
        return [pscustomobject]@{
            workspaces = @([pscustomobject]@{
                id = "11111111-1111-1111-1111-111111111111"
                name = "Customer Workspace"
            })
            continuationUri = $null
        }
    }

    if ($Uri -match '/items$') {
        return [pscustomobject]@{
            value = @([pscustomobject]@{
                id = "22222222-2222-2222-2222-222222222222"
                displayName = "Customer Warehouse"
                type = "Warehouse"
            })
            continuationUri = $null
        }
    }

    if ($Uri -match '/warehouses/[0-9a-f-]+$') {
        return [pscustomobject]@{
            properties = [pscustomobject]@{
                connectionString = "customer.datawarehouse.fabric.microsoft.com"
            }
        }
    }

    throw "Unexpected mock request: $Uri"
}

try {
    New-Item -ItemType Directory -Path $testRoot | Out-Null

    $global:MockCapacities = @(
        [pscustomobject]@{
            id = $capacityId
            displayName = "Customer Capacity"
            state = "Active"
        },
        [pscustomobject]@{
            id = $otherCapacityId
            displayName = "Other Capacity"
            state = "Active"
        }
    )
    $global:ExpectedCapacityId = $capacityId
    & (Join-Path $root "Configure-CustomerTemplate.ps1") `
        -CapacityMetricsWorkspace "Customer Capacity Metrics" `
        -CapacityName "Customer Capacity" `
        -TimeZoneId "Pacific Standard Time" `
        -OutputPath $namedOutput

    $expectedEndpoint =
        "powerbi://api.powerbi.com/v1.0/myorg/Customer%20Capacity%20Metrics"

    $workspaceSettings = Get-Content -Raw -Encoding UTF8 -LiteralPath (
        Join-Path $namedOutput "connection-settings.json"
    ) | ConvertFrom-Json
    Assert-Equal `
        -Actual $workspaceSettings.CapacityMetricsEndpoint `
        -Expected $expectedEndpoint `
        -Message "Workspace names must produce a normalized XMLA endpoint."
    Assert-Equal `
        -Actual $workspaceSettings.TimeZoneId `
        -Expected "Pacific Standard Time" `
        -Message "The configured time zone wasn't persisted."
    Assert-Equal `
        -Actual $workspaceSettings.CapacityId `
        -Expected $capacityId `
        -Message "Capacity name discovery selected the wrong capacity ID."
    Assert-Equal `
        -Actual $workspaceSettings.CapacityName `
        -Expected "Customer Capacity" `
        -Message "Capacity name discovery wasn't persisted."
    $capacityHourText = Get-Content -Raw -Encoding UTF8 -LiteralPath (
        Join-Path $namedOutput (
            "Query Capacity Correlation.SemanticModel\definition\tables\" +
            "Capacity Hour.tmdl"
        )
    )
    Assert-True `
        -Condition ($capacityHourText -match $capacityId.ToUpperInvariant()) `
        -Message "Capacity Metrics filtering didn't use the uppercase capacity ID."
    Assert-True `
        -Condition (
            $capacityHourText -match
                [regex]::Escape("Usage Summary (Last 7 days)")
        ) `
        -Message "Capacity Metrics filtering isn't using the supported seven-day table."

    $tmdlFiles = Get-ChildItem -LiteralPath $namedOutput -Recurse -Filter *.tmdl
    $endpointMatches = @(
        $tmdlFiles | Select-String -SimpleMatch $expectedEndpoint
    )
    Assert-True `
        -Condition ($endpointMatches.Count -ge 2) `
        -Message "Generated TMDL doesn't contain the expected XMLA endpoint."
    $queryExecutionsText = Get-Content -Raw -Encoding UTF8 -LiteralPath (
        Join-Path $namedOutput (
            "Query Capacity Correlation.SemanticModel\definition\tables\" +
            "Query Executions.tmdl"
        )
    )
    Assert-True `
        -Condition (
            $queryExecutionsText -match
                "AT TIME ZONE 'Pacific Standard Time'"
        ) `
        -Message "Generated SQL doesn't project hours to the configured time zone."
    Assert-True `
        -Condition (
            $queryExecutionsText -match
                (
                    "DATEADD\(hour, i\.hour_number, l\.utc_start_hour\) < " +
                    "l\.effective_end_time"
                )
        ) `
        -Message "Generated SQL doesn't use half-open interval expansion."
    Assert-True `
        -Condition (
            $queryExecutionsText -match
                "Customer Workspace / Customer Warehouse"
        ) `
        -Message "Generated warehouse labels don't include the workspace."

    $placeholders = @(
        Get-ChildItem -LiteralPath $namedOutput -Recurse -File |
            Select-String -Pattern "\{\{[A-Z0-9_]+\}\}"
    )
    Assert-Equal `
        -Actual $placeholders.Count `
        -Expected 0 `
        -Message "Generated output contains unresolved placeholders."

    $configuredCsv = @(Import-Csv -LiteralPath (
        Join-Path $namedOutput "warehouses.configured.csv"
    ))
    Assert-Equal `
        -Actual $configuredCsv.Count `
        -Expected 1 `
        -Message "Configured Warehouse inventory has an unexpected row count."

    $jsonFiles = Get-ChildItem -LiteralPath $namedOutput -Recurse -Filter *.json
    foreach ($jsonFile in $jsonFiles) {
        $null = Get-Content -Raw -Encoding UTF8 -LiteralPath $jsonFile.FullName |
            ConvertFrom-Json
    }

    $global:MockCapacities = @(
        [pscustomobject]@{
            id = $otherCapacityId
            displayName = "Only Capacity"
            state = "Active"
        }
    )
    $global:ExpectedCapacityId = $otherCapacityId
    & (Join-Path $root "Configure-CustomerTemplate.ps1") `
        -CapacityMetricsWorkspace "Customer Capacity Metrics" `
        -TimeZoneId "UTC" `
        -OutputPath $automaticOutput

    $automaticSettings = Get-Content -Raw -Encoding UTF8 -LiteralPath (
        Join-Path $automaticOutput "connection-settings.json"
    ) | ConvertFrom-Json
    Assert-Equal `
        -Actual $automaticSettings.CapacityId `
        -Expected $otherCapacityId `
        -Message "The only accessible active capacity wasn't selected."

    $global:MockCapacities = @(
        [pscustomobject]@{
            id = $capacityId
            displayName = "Customer Capacity"
            state = "Active"
        },
        [pscustomobject]@{
            id = $otherCapacityId
            displayName = "Other Capacity"
            state = "Active"
        }
    )
    $global:ExpectedCapacityId = $null
    $ambiguousFailure = $null
    try {
        & (Join-Path $root "Configure-CustomerTemplate.ps1") `
            -CapacityMetricsWorkspace "Customer Capacity Metrics" `
            -TimeZoneId "UTC" `
            -OutputPath (Join-Path $testRoot "Configured-Ambiguous")
    }
    catch {
        $ambiguousFailure = $_
    }
    Assert-True `
        -Condition ($null -ne $ambiguousFailure) `
        -Message "Ambiguous capacity discovery should require a name or ID."

    Write-Host "PASS: customer template configuration and JSON validation"
}
finally {
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
