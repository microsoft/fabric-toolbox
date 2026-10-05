[CmdletBinding()]
param(
    [Parameter()]
    [string]$OutputPath = (
        Join-Path $PSScriptRoot (
            "Fabric Data Warehouse Query Capacity Correlation - " +
            "Customer Template.zip"
        )
    ),

    [switch]$Force
)

$ErrorActionPreference = "Stop"
$stagingPath = Join-Path ([System.IO.Path]::GetTempPath()) (
    "fabric-data-warehouse-query-capacity-release-" +
    [Guid]::NewGuid().ToString("N")
)
$packageEntries = @(
    "Template",
    "Configure-CustomerTemplate.ps1",
    "query-executions.template.sql",
    "README.md"
)

try {
    if (Test-Path -LiteralPath $OutputPath) {
        if (-not $Force) {
            throw "Output archive already exists. Use -Force or choose another -OutputPath."
        }
        Remove-Item -LiteralPath $OutputPath -Force
    }

    New-Item -ItemType Directory -Path $stagingPath | Out-Null
    foreach ($entry in $packageEntries) {
        $source = Join-Path $PSScriptRoot $entry
        if (-not (Test-Path -LiteralPath $source)) {
            throw "Required package entry not found: $source"
        }
        Copy-Item -LiteralPath $source -Destination $stagingPath -Recurse
    }

    $excludedLocalArtifacts = @(
        "localSettings.json",
        "cache.abf"
    )
    Get-ChildItem -LiteralPath $stagingPath -Recurse -File |
        Where-Object {
            $_.Directory.Name -eq ".pbi" -and
            $excludedLocalArtifacts -contains $_.Name
        } |
        Remove-Item -Force

    $outputDirectory = Split-Path -Parent $OutputPath
    if (-not [string]::IsNullOrWhiteSpace($outputDirectory)) {
        New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    }

    Compress-Archive `
        -Path (Join-Path $stagingPath "*") `
        -DestinationPath $OutputPath `
        -CompressionLevel Optimal

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($OutputPath)
    try {
        if ($archive.Entries.Count -eq 0) {
            throw "The generated customer archive is empty."
        }
        $entryCount = $archive.Entries.Count
    }
    finally {
        $archive.Dispose()
    }

    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $OutputPath).Hash.ToLowerInvariant()
    Write-Host "Customer package created:" -ForegroundColor Green
    Write-Host "  $OutputPath"
    Write-Host "  Entries: $entryCount"
    Write-Host "  SHA-256: $hash"
}
finally {
    if (Test-Path -LiteralPath $stagingPath) {
        Remove-Item -LiteralPath $stagingPath -Recurse -Force
    }
}
