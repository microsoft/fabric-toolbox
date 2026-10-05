[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$ArchivePath
)

$ErrorActionPreference = "Stop"
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
    "fabric-data-warehouse-query-capacity-" + [Guid]::NewGuid().ToString("N")
)
$extractPath = Join-Path $testRoot "Package"
$wrapperPath = Join-Path $extractPath "Invoke-MockedConfiguration.ps1"
$ps51Output = Join-Path $extractPath "Configured-PS51"
$ps7Output = Join-Path $extractPath "Configured-PS7"
$expectedEndpoint =
    "powerbi://api.powerbi.com/v1.0/myorg/Customer%20Capacity%20Metrics"
$expectedModel = "Fabric Capacity Metrics"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Assert-True {
    param(
        [Parameter(Mandatory)][bool]$Condition,
        [Parameter(Mandatory)][string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Test-GeneratedProject {
    param([Parameter(Mandatory)][string]$Path)

    Assert-True `
        -Condition (Test-Path -LiteralPath (
            Join-Path $Path "Query Capacity Correlation.pbip"
        )) `
        -Message "PBIP file is missing from $Path."

    $settings = Get-Content -Raw -Encoding UTF8 -LiteralPath (
        Join-Path $Path "connection-settings.json"
    ) | ConvertFrom-Json
    Assert-True `
        -Condition ($settings.CapacityMetricsEndpoint -eq $expectedEndpoint) `
        -Message "Unexpected Capacity Metrics endpoint in $Path."
    Assert-True `
        -Condition ($settings.CapacityMetricsModel -eq $expectedModel) `
        -Message "Unexpected Capacity Metrics model in $Path."

    $inventory = @(Import-Csv -LiteralPath (
        Join-Path $Path "warehouses.configured.csv"
    ))
    Assert-True `
        -Condition ($inventory.Count -eq 1) `
        -Message "Unexpected Warehouse inventory count in $Path."

    foreach ($jsonFile in Get-ChildItem -LiteralPath $Path -Recurse -Filter *.json) {
        $null = Get-Content -Raw -Encoding UTF8 -LiteralPath $jsonFile.FullName |
            ConvertFrom-Json
    }

    $placeholders = @(
        Get-ChildItem -LiteralPath $Path -Recurse -File |
            Select-String -Pattern "\{\{[A-Z0-9_]+\}\}"
    )
    Assert-True `
        -Condition ($placeholders.Count -eq 0) `
        -Message "Unresolved template placeholders found in $Path."

    $reportFiles = Get-ChildItem -LiteralPath $Path -Recurse -Filter visual.json
    Assert-True `
        -Condition (@(
            $reportFiles | Select-String -SimpleMatch "Item Type"
        ).Count -gt 0) `
        -Message "Item Type isn't present in the generated report."
    Assert-True `
        -Condition (@(
            $reportFiles | Select-String -SimpleMatch "Distributed Statement ID"
        ).Count -gt 0) `
        -Message "Distributed Statement ID isn't present in the generated report."

    $relationshipsPath = Join-Path $Path (
        "Query Capacity Correlation.SemanticModel\definition\relationships.tmdl"
    )
    $relationshipsText = Get-Content -Raw -Encoding UTF8 -LiteralPath (
        $relationshipsPath
    )
    Assert-True `
        -Condition (
            $relationshipsText -notmatch
                (
                    "Distributed Statement ID|distributed_statement_id|" +
                    "query_insights_statement_id"
                )
        ) `
        -Message (
            "Query Insights statement identifiers must not participate in " +
            "semantic-model relationships."
        )
    Assert-True `
        -Condition (
            -not (Test-Path -LiteralPath (
                Join-Path $Path (
                    "Query Capacity Correlation.SemanticModel\definition\" +
                    "tables\Usage Summary (Last 30 days).tmdl"
                )
            ))
        ) `
        -Message "The package contains an unsupported 30-day Capacity Metrics table."
}

function Get-RelativeFileMap {
    param([Parameter(Mandatory)][string]$Path)

    $map = @{}
    $rootPath = [System.IO.Path]::GetFullPath($Path).TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    ) + [System.IO.Path]::DirectorySeparatorChar
    foreach ($file in Get-ChildItem -LiteralPath $Path -Recurse -File) {
        $fullPath = [System.IO.Path]::GetFullPath($file.FullName)
        if (-not $fullPath.StartsWith(
            $rootPath,
            [System.StringComparison]::OrdinalIgnoreCase
        )) {
            throw "File isn't under the expected root: $fullPath"
        }
        $relativePath = $fullPath.Substring($rootPath.Length)
        $map[$relativePath] = $file.FullName
    }
    return $map
}

try {
    New-Item -ItemType Directory -Path $extractPath -Force | Out-Null
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $extractPath
    $localArtifacts = @(
        Get-ChildItem -LiteralPath $extractPath -Recurse -File |
            Where-Object {
                $_.Directory.Name -eq ".pbi" -and
                $_.Name -in @("localSettings.json", "cache.abf")
            }
    )
    Assert-True `
        -Condition ($localArtifacts.Count -eq 0) `
        -Message "The release archive contains local PBIP cache/settings files."

    $wrapper = @'
param(
    [Parameter(Mandatory)][string]$OutputPath
)

function global:az {
    $global:LASTEXITCODE = 0
    return "test-token"
}

function global:Invoke-RestMethod {
    param(
        [string]$Method,
        [string]$Uri,
        [hashtable]$Headers
    )

    if ($Uri -match '/v1/admin/workspaces\?') {
        if (
            $Uri -notmatch
                'capacityId=33333333-3333-3333-3333-333333333333' -or
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

$parameters = @{
    CapacityId = "33333333-3333-3333-3333-333333333333"
    CapacityMetricsWorkspace = "Customer Capacity Metrics"
    TimeZoneId = "Pacific Standard Time"
    OutputPath = $OutputPath
    Force = $true
}

& (Join-Path $PSScriptRoot "Configure-CustomerTemplate.ps1") @parameters
'@
    [System.IO.File]::WriteAllText($wrapperPath, $wrapper, $utf8NoBom)

    $ps51Args = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $wrapperPath,
        "-OutputPath", $ps51Output
    )
    & powershell.exe @ps51Args
    Assert-True `
        -Condition ($LASTEXITCODE -eq 0) `
        -Message "Windows PowerShell 5.1 configuration failed."

    $ps7Args = @(
        "-NoProfile",
        "-File", $wrapperPath,
        "-OutputPath", $ps7Output
    )
    & pwsh.exe @ps7Args
    Assert-True `
        -Condition ($LASTEXITCODE -eq 0) `
        -Message "PowerShell 7 configuration failed."

    Test-GeneratedProject -Path $ps51Output
    Test-GeneratedProject -Path $ps7Output

    $ps51Files = Get-RelativeFileMap -Path $ps51Output
    $ps7Files = Get-RelativeFileMap -Path $ps7Output
    $ps51Names = @($ps51Files.Keys | Sort-Object)
    $ps7Names = @($ps7Files.Keys | Sort-Object)
    Assert-True `
        -Condition (($ps51Names -join "`n") -ceq ($ps7Names -join "`n")) `
        -Message "PowerShell versions generated different file sets."

    $textExtensions = @(
        ".csv", ".json", ".md", ".pbip", ".pbir", ".pbism",
        ".ps1", ".sql", ".tmdl"
    )
    $differences = [System.Collections.Generic.List[string]]::new()
    foreach ($relativePath in $ps51Names) {
        $leftPath = $ps51Files[$relativePath]
        $rightPath = $ps7Files[$relativePath]
        $leftFile = Get-Item -LiteralPath $leftPath
        $isText = (
            $textExtensions -contains $leftFile.Extension.ToLowerInvariant()
        ) -or $leftFile.Name -eq ".platform"

        if ($isText) {
            $left = (Get-Content -Raw -Encoding UTF8 -LiteralPath $leftPath) `
                -replace "`r`n|`r", "`n"
            $right = (Get-Content -Raw -Encoding UTF8 -LiteralPath $rightPath) `
                -replace "`r`n|`r", "`n"
            if ($left -cne $right) {
                $differences.Add($relativePath)
            }
        }
        else {
            $leftHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $leftPath).Hash
            $rightHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $rightPath).Hash
            if ($leftHash -cne $rightHash) {
                $differences.Add($relativePath)
            }
        }
    }

    Assert-True `
        -Condition ($differences.Count -eq 0) `
        -Message (
            "PowerShell versions generated different content:`n" +
            ($differences -join "`n")
        )

    Write-Host (
        (
            "PASS: release archive generated identical {0}-file projects under " +
            "Windows PowerShell 5.1 and PowerShell 7"
        ) -f $ps51Names.Count
    )
}
finally {
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
