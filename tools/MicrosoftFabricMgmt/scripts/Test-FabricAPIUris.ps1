<#
.SYNOPSIS
    Validates all API URIs in the module against official Microsoft Fabric REST API specs.

.DESCRIPTION
    This script analyzes all public functions in the module to extract API endpoint URIs,
    then validates them against the cached swagger specifications from the official
    Microsoft Fabric REST API specs repository.

.PARAMETER CachePath
    Path to the cached swagger specifications.

.PARAMETER Verbose
    Show detailed validation output.

.EXAMPLE
    .\Test-FabricAPIUris.ps1

.EXAMPLE
    .\Test-FabricAPIUris.ps1 -Verbose

.NOTES
    Requires swagger specs cache. Run Update-FabricAPISpecsCache.ps1 first.
#>

[CmdletBinding()]
param(
    [Parameter()]
    [string]$CachePath = 's:\fabric-toolbox\tools\.api-specs-cache'
)

$ErrorActionPreference = 'Stop'

# Verify cache exists
if (-not (Test-Path $CachePath)) {
    Write-Error "Swagger specs cache not found at: $CachePath`nRun Update-FabricAPISpecsCache.ps1 first."
    return
}

Write-Host "`nValidating Fabric API URIs Against Official Specifications..." -ForegroundColor Cyan
Write-Host "Cache Path: $CachePath`n" -ForegroundColor Gray

# Load all swagger specs into memory
$swaggerSpecs = @{}
Get-ChildItem -Path $CachePath -Filter '*.swagger.json' | ForEach-Object {
    $specName = $_.BaseName -replace '\.swagger$', ''
    try {
        $content = Get-Content $_.FullName -Raw | ConvertFrom-Json
        $swaggerSpecs[$specName] = $content
        Write-Verbose "Loaded swagger spec: $specName"
    }
    catch {
        Write-Warning "Failed to load $specName : $($_.Exception.Message)"
    }
}

Write-Host "Loaded $($swaggerSpecs.Count) swagger specifications`n" -ForegroundColor Green

# Build complete endpoint catalog from all swagger files
$endpointCatalog = @{}
foreach ($specName in $swaggerSpecs.Keys) {
    $spec = $swaggerSpecs[$specName]

    if ($spec.paths) {
        foreach ($path in $spec.paths.PSObject.Properties.Name) {
            $methods = $spec.paths.$path.PSObject.Properties.Name

            if (-not $endpointCatalog.ContainsKey($path)) {
                $endpointCatalog[$path] = @{
                    Methods = @()
                    Sources = @()
                }
            }

            $endpointCatalog[$path].Methods += $methods
            $endpointCatalog[$path].Sources += $specName
        }
    }
}

Write-Host "Total unique endpoints in official specs: $($endpointCatalog.Count)`n" -ForegroundColor Green

# Function to normalize URIs for comparison
function Get-NormalizedUri {
    param([string]$Uri)

    # Remove base URL
    $normalized = $Uri -replace 'https://api\.fabric\.microsoft\.com/v1/', '/'

    # Ensure starts with /
    if (-not $normalized.StartsWith('/')) {
        $normalized = "/$normalized"
    }

    # Remove query parameters
    if ($normalized -match '\?') {
        $normalized = $normalized.Substring(0, $normalized.IndexOf('?'))
    }

    return $normalized
}

# Function to match URI pattern (handles {param} placeholders)
function Test-UriMatchesPattern {
    param(
        [string]$Uri,
        [string]$Pattern
    )

    # Convert pattern to regex (replace {param} with regex group)
    $regexPattern = $Pattern -replace '\{[^}]+\}', '[a-zA-Z0-9\-]+'

    # Escape special regex characters except those we want
    $regexPattern = '^' + $regexPattern + '$'

    return $Uri -match $regexPattern
}

# Analyze all public functions
$sourcePath = 's:\fabric-toolbox\tools\MicrosoftFabricMgmt\source\Public'
$allFunctions = Get-ChildItem -Path $sourcePath -Recurse -Filter '*.ps1'

Write-Host "Analyzing $($allFunctions.Count) public functions...`n" -ForegroundColor Cyan

$results = @{
    Validated = 0
    Invalid = 0
    Warnings = 0
    Errors = @()
    ValidEndpoints = @()
    InvalidEndpoints = @()
}

foreach ($functionFile in $allFunctions) {
    $content = Get-Content $functionFile.FullName -Raw

    # Extract New-FabricAPIUri calls (simple regex - may need refinement)
    $uriPattern = 'New-FabricAPIUri\s+-Resource\s+[''"]([^''"]+)[''"](?:\s+-WorkspaceId\s+\$\w+)?(?:\s+-ItemId\s+\$\w+)?(?:\s+-Subresource\s+[''"]([^''"]+)[''"])?'

    $matches = [regex]::Matches($content, $uriPattern)

    foreach ($match in $matches) {
        $resource = $match.Groups[1].Value
        $subresource = if ($match.Groups[2].Success) { $match.Groups[2].Value } else { $null }

        # Construct expected URI pattern
        if ($resource -eq 'workspaces' -and $subresource) {
            $expectedUri = "/workspaces/{workspaceId}/$subresource"
        }
        elseif ($resource -eq 'workspaces') {
            $expectedUri = "/workspaces/{workspaceId}"
        }
        else {
            $expectedUri = "/$resource"
        }

        # Check if this pattern exists in official specs
        $found = $false
        foreach ($catalogPath in $endpointCatalog.Keys) {
            if (Test-UriMatchesPattern -Uri $expectedUri -Pattern $catalogPath) {
                $found = $true
                $results.ValidEndpoints += @{
                    Function = $functionFile.Name
                    Pattern = $expectedUri
                    OfficialSpec = $catalogPath
                    Methods = $endpointCatalog[$catalogPath].Methods
                }
                break
            }
        }

        if ($found) {
            $results.Validated++
            Write-Verbose "[VALID] $($functionFile.Name): $expectedUri"
        }
        else {
            $results.Invalid++
            $results.InvalidEndpoints += @{
                Function = $functionFile.Name
                Pattern = $expectedUri
                Issue = "No matching endpoint in official specs"
            }
            Write-Host "[INVALID] $($functionFile.Name): $expectedUri" -ForegroundColor Red
        }
    }
}

# Summary Report
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "URI Validation Report" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Functions Analyzed:    $($allFunctions.Count)" -ForegroundColor White
Write-Host "Valid Endpoints:       $($results.Validated)" -ForegroundColor Green
Write-Host "Invalid Endpoints:     $($results.Invalid)" -ForegroundColor $(if ($results.Invalid -gt 0) { 'Red' } else { 'Green' })
Write-Host "Warnings:              $($results.Warnings)" -ForegroundColor Yellow

if ($results.InvalidEndpoints.Count -gt 0) {
    Write-Host "`nInvalid Endpoints Detected:" -ForegroundColor Red
    $results.InvalidEndpoints | ForEach-Object {
        Write-Host "  $($_.Function)" -ForegroundColor Yellow
        Write-Host "    Pattern: $($_.Pattern)" -ForegroundColor White
        Write-Host "    Issue:   $($_.Issue)" -ForegroundColor Red
    }
}

Write-Host "`n========================================`n" -ForegroundColor Cyan

# Return results object
return $results
