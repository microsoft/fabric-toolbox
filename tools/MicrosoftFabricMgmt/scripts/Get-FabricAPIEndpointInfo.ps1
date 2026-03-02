<#
.SYNOPSIS
    Gets detailed information about a Fabric API endpoint from the cached specifications.

.DESCRIPTION
    This script retrieves detailed information about a Fabric API endpoint including
    required parameters, optional parameters, response schemas, and permission requirements.

.PARAMETER ResourceType
    The resource type to look up (e.g., 'lakehouse', 'notebook', 'warehouse').

.PARAMETER Operation
    The operation to look up (e.g., 'list', 'get', 'create', 'update', 'delete').

.PARAMETER CachePath
    Path to the API specs cache directory.

.EXAMPLE
    .\Get-FabricAPIEndpointInfo.ps1 -ResourceType lakehouse -Operation list

.EXAMPLE
    .\Get-FabricAPIEndpointInfo.ps1 -ResourceType lakehouse -Operation create

.NOTES
    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
    Version: 1.0.0
    Last Updated: 2026-01-20
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceType,

    [Parameter()]
    [ValidateSet('list', 'get', 'create', 'update', 'delete', 'all')]
    [string]$Operation = 'all',

    [Parameter()]
    [string]$CachePath = 's:\fabric-toolbox\tools\.api-specs-cache'
)

$ErrorActionPreference = 'Stop'

# Load full lookup
$lookupFile = Join-Path $CachePath 'fabric-api-lookup.json'

if (-not (Test-Path $lookupFile)) {
    Write-Error "API lookup cache not found at: $lookupFile. Run Update-FabricAPISpecsCache.ps1 first."
    return
}

$lookup = Get-Content $lookupFile -Raw | ConvertFrom-Json -AsHashtable

# Normalize resource type
$normalizedType = $ResourceType.ToLower()

# Check if resource type exists
if (-not $lookup.ResourceTypes.ContainsKey($normalizedType)) {
    Write-Host "Resource type '$ResourceType' not found." -ForegroundColor Red
    Write-Host "`nAvailable resource types:" -ForegroundColor Yellow
    $lookup.ResourceTypes.Keys | Sort-Object | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
    return
}

$resourceInfo = $lookup.ResourceTypes[$normalizedType]

Write-Host "`n$($resourceInfo.Title)" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Gray
Write-Host "Version:    $($resourceInfo.Version)" -ForegroundColor White
Write-Host "Base Path:  $($resourceInfo.BasePath)" -ForegroundColor White
Write-Host "Paths:      $($resourceInfo.PathCount)" -ForegroundColor White

# Find all endpoints for this resource type
$endpoints = $lookup.Endpoints.GetEnumerator() | Where-Object {
    $_.Value.ResourceType -eq $normalizedType
}

# Map operations to methods
$operationMap = @{
    'list'   = 'GET'
    'get'    = 'GET'
    'create' = 'POST'
    'update' = 'PATCH'
    'delete' = 'DELETE'
}

$results = @()

foreach ($endpoint in $endpoints) {
    $path = $endpoint.Key
    $endpointData = $endpoint.Value

    foreach ($method in $endpointData.Methods.Keys) {
        $op = $endpointData.Methods[$method]

        # Determine operation type based on method and path
        $opType = switch ($method) {
            'GET' { if ($path -match '\{[^}]+Id\}$') { 'get' } else { 'list' } }
            'POST' { 'create' }
            'PATCH' { 'update' }
            'PUT' { 'update' }
            'DELETE' { 'delete' }
        }

        # Filter by operation if specified
        if ($Operation -ne 'all' -and $opType -ne $Operation) {
            continue
        }

        $result = [PSCustomObject]@{
            Operation      = $opType
            Method         = $method
            Path           = $path
            OperationId    = $op.OperationId
            Summary        = $op.Summary
            PathParams     = @($op.Parameters.Path | ForEach-Object { $_.Name })
            QueryParams    = @($op.Parameters.Query | ForEach-Object { $_.Name })
            HasBody        = $null -ne $op.Parameters.Body
            IsLRO          = $op.IsLRO
            IsPaginated    = $op.IsPaginated
            Scopes         = $op.Permissions.Scopes
            MinimumRole    = $op.Permissions.MinimumRole
        }

        $results += $result

        Write-Host "`n[$method] $path" -ForegroundColor Yellow
        Write-Host "  Operation: $($op.OperationId)" -ForegroundColor White
        Write-Host "  Summary:   $($op.Summary)" -ForegroundColor Gray

        if ($result.PathParams.Count -gt 0) {
            Write-Host "  Path Params: $($result.PathParams -join ', ')" -ForegroundColor White
        }

        if ($result.QueryParams.Count -gt 0) {
            Write-Host "  Query Params: $($result.QueryParams -join ', ')" -ForegroundColor White
        }

        if ($result.HasBody) { Write-Host "  Has Body: Yes" -ForegroundColor White }
        if ($result.IsLRO) { Write-Host "  Long-Running: Yes" -ForegroundColor Magenta }
        if ($result.IsPaginated) { Write-Host "  Paginated: Yes" -ForegroundColor Magenta }
    }
}

Write-Host "`n" + ("=" * 60) -ForegroundColor Gray
Write-Host "Total operations: $($results.Count)" -ForegroundColor Cyan

return $results
