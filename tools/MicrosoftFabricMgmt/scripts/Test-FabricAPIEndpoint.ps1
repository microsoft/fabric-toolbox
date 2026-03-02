<#
.SYNOPSIS
    Validates a Fabric API endpoint against the cached API specifications.

.DESCRIPTION
    This script validates that a given API endpoint path and method match the official
    Microsoft Fabric REST API specifications. It can be used during development to
    ensure that API calls are constructed correctly.

.PARAMETER Path
    The API endpoint path (e.g., "/workspaces/{workspaceId}/lakehouses").

.PARAMETER Method
    The HTTP method (GET, POST, PUT, PATCH, DELETE).

.PARAMETER CachePath
    Path to the API specs cache directory.

.PARAMETER ShowDetails
    If specified, shows detailed information about the endpoint.

.EXAMPLE
    .\Test-FabricAPIEndpoint.ps1 -Path "/workspaces/{workspaceId}/lakehouses" -Method GET

.EXAMPLE
    .\Test-FabricAPIEndpoint.ps1 -Path "/workspaces/{workspaceId}/lakehouses" -Method GET -ShowDetails

.OUTPUTS
    Returns $true if the endpoint is valid, $false otherwise.
    With -ShowDetails, returns a detailed object with endpoint information.

.NOTES
    Requires the API specs cache to be populated first using Update-FabricAPISpecsCache.ps1

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
    Version: 1.0.0
    Last Updated: 2026-01-20
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [ValidateSet('GET', 'POST', 'PUT', 'PATCH', 'DELETE')]
    [string]$Method,

    [Parameter()]
    [string]$CachePath = 's:\fabric-toolbox\tools\.api-specs-cache',

    [Parameter()]
    [switch]$ShowDetails
)

$ErrorActionPreference = 'Stop'

# Load validation lookup
$validationFile = Join-Path $CachePath 'fabric-api-validation.json'

if (-not (Test-Path $validationFile)) {
    Write-Error "API validation cache not found at: $validationFile. Run Update-FabricAPISpecsCache.ps1 first."
    return $false
}

$lookup = Get-Content $validationFile -Raw | ConvertFrom-Json -AsHashtable

# Normalize the path for lookup
$normalizedPath = $Path.TrimStart('/')
if (-not $normalizedPath.StartsWith('/')) {
    $normalizedPath = "/$normalizedPath"
}

# Check if endpoint exists
if (-not $lookup.Endpoints.ContainsKey($normalizedPath)) {
    Write-Host "[INVALID] Endpoint not found: $normalizedPath" -ForegroundColor Red

    # Try to find similar paths
    $similarPaths = $lookup.Endpoints.Keys | Where-Object {
        $_ -like "*$($normalizedPath.Split('/')[-1])*"
    } | Select-Object -First 5

    if ($similarPaths) {
        Write-Host "`nDid you mean one of these?" -ForegroundColor Yellow
        $similarPaths | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
    }

    return $false
}

$endpoint = $lookup.Endpoints[$normalizedPath]

# Check if method is supported
if (-not $endpoint.Methods.ContainsKey($Method)) {
    Write-Host "[INVALID] Method '$Method' not supported for: $normalizedPath" -ForegroundColor Red
    Write-Host "Supported methods: $($endpoint.Methods.Keys -join ', ')" -ForegroundColor Yellow
    return $false
}

$operation = $endpoint.Methods[$Method]

# Valid endpoint found
Write-Host "[VALID] $Method $normalizedPath" -ForegroundColor Green
Write-Host "  Resource Type: $($endpoint.ResourceType)" -ForegroundColor Cyan
Write-Host "  Operation ID:  $($operation.OperationId)" -ForegroundColor Cyan

if ($ShowDetails) {
    Write-Host "`n  Parameters:" -ForegroundColor Yellow

    if ($operation.PathParams.Count -gt 0) {
        Write-Host "    Path (required):  $($operation.PathParams -join ', ')" -ForegroundColor White
    }

    if ($operation.RequiredParams.Count -gt 0) {
        $nonPathRequired = $operation.RequiredParams | Where-Object { $_ -notin $operation.PathParams }
        if ($nonPathRequired.Count -gt 0) {
            Write-Host "    Other required:   $($nonPathRequired -join ', ')" -ForegroundColor White
        }
    }

    if ($operation.OptionalParams.Count -gt 0) {
        Write-Host "    Optional:         $($operation.OptionalParams -join ', ')" -ForegroundColor Gray
    }

    if ($operation.HasBody) {
        Write-Host "    Request body:     Yes" -ForegroundColor White
    }

    Write-Host "`n  Features:" -ForegroundColor Yellow
    Write-Host "    Long-running op:  $($operation.IsLRO)" -ForegroundColor White
    Write-Host "    Paginated:        $($operation.IsPaginated)" -ForegroundColor White

    if ($operation.RequiredScopes.Count -gt 0) {
        Write-Host "`n  Required Scopes:" -ForegroundColor Yellow
        $operation.RequiredScopes | ForEach-Object { Write-Host "    - $_" -ForegroundColor White }
    }

    if ($operation.MinimumRole) {
        Write-Host "`n  Minimum Role: $($operation.MinimumRole)" -ForegroundColor Yellow
    }

    # Return detailed object
    return [PSCustomObject]@{
        Valid          = $true
        Path           = $normalizedPath
        Method         = $Method
        ResourceType   = $endpoint.ResourceType
        OperationId    = $operation.OperationId
        PathParams     = $operation.PathParams
        RequiredParams = $operation.RequiredParams
        OptionalParams = $operation.OptionalParams
        HasBody        = $operation.HasBody
        IsLRO          = $operation.IsLRO
        IsPaginated    = $operation.IsPaginated
        RequiredScopes = $operation.RequiredScopes
        MinimumRole    = $operation.MinimumRole
    }
}

return $true
