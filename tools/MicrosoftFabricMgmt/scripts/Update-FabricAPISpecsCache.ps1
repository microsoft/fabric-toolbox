<#
.SYNOPSIS
    Downloads and caches all Microsoft Fabric REST API swagger specifications.

.DESCRIPTION
    This script downloads all swagger.json files from the official Microsoft Fabric REST API specs
    repository and caches them locally. The cache is used to validate that our API URIs match
    the official specifications.

.PARAMETER CachePath
    The local directory where swagger files will be cached.
    Default: tools/MicrosoftFabricMgmt/.api-specs-cache/

.PARAMETER Force
    Forces re-download of all swagger files even if they already exist in cache.

.EXAMPLE
    .\Update-FabricAPISpecsCache.ps1

.EXAMPLE
    .\Update-FabricAPISpecsCache.ps1 -Force

.NOTES
    Cache should be updated weekly or when Microsoft updates the API specs.
    The cache directory should be added to .gitignore.
#>

[CmdletBinding()]
param(
    [Parameter()]
    [string]$CachePath = 's:\fabric-toolbox\tools\.api-specs-cache',

    [Parameter()]
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# Create cache directory if it doesn't exist
if (-not (Test-Path $CachePath))
{
    New-Item -Path $CachePath -ItemType Directory -Force | Out-Null
    Write-Host "Created cache directory: $CachePath" -ForegroundColor Green
}

# List of all swagger spec directories from the repo
$swaggerSpecs = @(
    'admin'
    'anomalyDetector'
    'apacheAirflowJob'
    'copyJob'
    'cosmosDbDatabase'
    'dashboard'
    'dataflow'
    'datamart'
    'dataPipeline'
    'digitalTwinBuilder'
    'digitalTwinBuilderFlow'
    'environment'
    'eventhouse'
    'eventSchemaSet'
    'eventstream'
    'graphModel'
    'graphQLApi'
    'graphQuerySet'
    'kqlDashboard'
    'kqlDatabase'
    'kqlQueryset'
    'lakehouse'
    'map'
    'mirroredAzureDatabricksCatalog'
    'mirroredDatabase'
    'mirroredWarehouse'
    'mlExperiment'
    'mlModel'
    'mountedDataFactory'
    'notebook'
    'ontology'
    'operationsAgent'
    'paginatedReport'
    'platform'
    'realTimeIntelligence'
    'reflex'
    'report'
    'semanticModel'
    'snowflakeDatabase'
    'spark'
    'sparkjobdefinition'
    'sqlDatabase'
    'sqlEndpoint'
    'userDataFunction'
    'variableLibrary'
    'warehouse'
    'warehouseSnapshot'
)

$baseUrl = 'https://raw.githubusercontent.com/microsoft/fabric-rest-api-specs/main'
$downloadedCount = 0
$skippedCount = 0
$failedCount = 0
$failedSpecs = @()

Write-Host "`nDownloading Microsoft Fabric REST API Swagger Specifications..." -ForegroundColor Cyan
Write-Host "Cache Path: $CachePath`n" -ForegroundColor Gray

foreach ($spec in $swaggerSpecs)
{
    # Define the files to download for each spec
    $filesToDownload = @(
        @{
            Url        = "$baseUrl/$spec/swagger.json"
            OutputFile = Join-Path $CachePath "$spec.swagger.json"
            FileType   = 'swagger'
        },
        @{
            Url        = "$baseUrl/$spec/definitions.json"
            OutputFile = Join-Path $CachePath "$spec.definitions.json"
            FileType   = 'definitions'
        }
    )

    foreach ($fileInfo in $filesToDownload)
    {
        $url = $fileInfo.Url
        $outputFile = $fileInfo.OutputFile
        $fileType = $fileInfo.FileType

        # Skip if file exists and Force not specified
        if ((Test-Path $outputFile) -and -not $Force)
        {
            Write-Host "[SKIP] $spec.$fileType (already cached)" -ForegroundColor Gray
            $skippedCount++
            continue
        }

        try
        {
            Write-Host "[DOWNLOADING] $spec.$fileType..." -ForegroundColor Yellow -NoNewline

            # Download the file
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -ErrorAction Stop

            # Save to cache
            $response.Content | Out-File -FilePath $outputFile -Encoding UTF8 -Force

            # Validate it's valid JSON
            $json = Get-Content $outputFile -Raw | ConvertFrom-Json -ErrorAction Stop

            Write-Host " SUCCESS" -ForegroundColor Green
            $downloadedCount++
        }
        catch
        {
            Write-Host " FAILED" -ForegroundColor Red
            Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
            $failedCount++
            $failedSpecs += "$spec.$fileType"
        }
    }
}
# Create metadata file with download timestamp
$metadata = @{
    LastUpdated = (Get-Date).ToString('o')
    TotalSpecs  = $swaggerSpecs.Count
    Downloaded  = $downloadedCount
    Skipped     = $skippedCount
    Failed      = $failedCount
    FailedSpecs = $failedSpecs
    SpecList    = $swaggerSpecs
} | ConvertTo-Json -Depth 10

$metadataFile = Join-Path $CachePath 'cache-metadata.json'
$metadata | Out-File -FilePath $metadataFile -Encoding UTF8 -Force

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Download Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Total Specs:  $($swaggerSpecs.Count)" -ForegroundColor White
Write-Host "Downloaded:   $downloadedCount" -ForegroundColor Green
Write-Host "Skipped:      $skippedCount" -ForegroundColor Gray
Write-Host "Failed:       $failedCount" -ForegroundColor $(if ($failedCount -gt 0)
    {
        'Red'
    }
    else
    {
        'Green'
    })
Write-Host "Cache Path:   $CachePath" -ForegroundColor White
Write-Host "Last Updated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor White

if ($failedSpecs.Count -gt 0)
{
    Write-Host "`nFailed Specs:" -ForegroundColor Red
    $failedSpecs | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

Write-Host "`nCache is ready for URI validation!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan
