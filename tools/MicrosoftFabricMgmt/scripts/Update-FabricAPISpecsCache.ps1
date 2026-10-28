<#
.SYNOPSIS
    Downloads and caches all Microsoft Fabric REST API swagger specifications and creates a consolidated lookup.

.DESCRIPTION
    This script downloads all swagger.json files from the official Microsoft Fabric REST API specs
    repository, caches them locally, and parses them into a consolidated lookup file that can be
    used for API endpoint validation.

    The consolidated lookup includes:
    - All API paths with their HTTP methods
    - Required and optional parameters for each endpoint
    - Request/response schemas
    - Permission requirements
    - Long-running operation (LRO) support indicators

.PARAMETER CachePath
    The local directory where swagger files will be cached.
    Default: tools/.api-specs-cache/

.PARAMETER Force
    Forces re-download of all swagger files even if they already exist in cache.

.PARAMETER SkipDownload
    Skips downloading and only regenerates the consolidated lookup from existing cache.

.EXAMPLE
    .\Update-FabricAPISpecsCache.ps1
    Downloads all swagger files and creates the consolidated lookup.

.EXAMPLE
    .\Update-FabricAPISpecsCache.ps1 -Force
    Forces re-download of all files even if cached.

.EXAMPLE
    .\Update-FabricAPISpecsCache.ps1 -SkipDownload
    Only regenerates the lookup from existing cached files.

.OUTPUTS
    Creates the following files in the cache directory:
    - {spec}.swagger.json - Raw swagger files for each API
    - {spec}.definitions.json - Definition files for each API
    - {spec}.{nested}.definitions.json - Nested definition files a swagger $refs as
      ./definitions/{nested}.json (auto-discovered; e.g. platform.workspaceNetworkingPolicy.definitions.json)
    - cache-metadata.json - Download metadata and statistics
    - fabric-api-lookup.json - Consolidated lookup for validation

.NOTES
    Cache should be updated weekly or when Microsoft updates the API specs.
    The cache directory should be added to .gitignore.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
    Version: 2.1.0
    Last Updated: 2026-07-03
#>

[CmdletBinding()]
param(
    [Parameter()]
    [string]$CachePath = 's:\fabric-toolbox\tools\.api-specs-cache',

    [Parameter()]
    [switch]$Force,

    [Parameter()]
    [switch]$SkipDownload
)

$ErrorActionPreference = 'Stop'

#region Helper Functions

function ConvertTo-NormalizedPath {
    <#
    .SYNOPSIS
        Normalizes a swagger path to a consistent format for lookup.
    #>
    param([string]$Path)

    # Remove leading/trailing slashes and normalize
    $normalized = $Path.Trim('/')

    # Replace path parameters with placeholders for pattern matching
    # e.g., /workspaces/{workspaceId}/lakehouses/{lakehouseId} -> workspaces/{id}/lakehouses/{id}
    $normalized = $normalized -replace '\{[^}]+Id\}', '{id}'
    $normalized = $normalized -replace '\{[^}]+Name\}', '{name}'

    return $normalized
}

function Get-ParameterInfo {
    <#
    .SYNOPSIS
        Extracts parameter information from a swagger operation.
    #>
    param([array]$Parameters)

    $paramInfo = @{
        Path     = @()
        Query    = @()
        Body     = $null
        Required = @()
        Optional = @()
    }

    foreach ($param in $Parameters) {
        $paramDetails = @{
            Name        = $param.name
            Type        = $param.type
            Format      = $param.format
            Description = $param.description
            Required    = [bool]$param.required
            In          = $param.in
        }

        # Categorize by location
        switch ($param.in) {
            'path' { $paramInfo.Path += $paramDetails }
            'query' { $paramInfo.Query += $paramDetails }
            'body' {
                $paramInfo.Body = @{
                    Name        = $param.name
                    Description = $param.description
                    Schema      = $param.schema
                }
            }
        }

        # Categorize by required/optional
        if ($param.required) {
            $paramInfo.Required += $param.name
        }
        else {
            $paramInfo.Optional += $param.name
        }
    }

    return $paramInfo
}

function Get-PermissionInfo {
    <#
    .SYNOPSIS
        Extracts permission requirements from operation description.
    #>
    param([string]$Description)

    $permissions = @{
        Scopes           = @()
        MinimumRole      = $null
        IdentitySupport  = @{
            User             = $false
            ServicePrincipal = $false
            ManagedIdentity  = $false
        }
    }

    if (-not $Description) { return $permissions }

    # Extract required scopes
    $scopeMatch = [regex]::Match($Description, 'Required Delegated Scopes[^\n]*\n+([^\n]+)')
    if ($scopeMatch.Success) {
        $scopeText = $scopeMatch.Groups[1].Value
        $permissions.Scopes = @($scopeText -split '\s+or\s+' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    }

    # Extract minimum role
    $roleMatch = [regex]::Match($Description, 'caller must have[^\*]*\*([^*]+)\*')
    if ($roleMatch.Success) {
        $permissions.MinimumRole = $roleMatch.Groups[1].Value.Trim()
    }

    # Check identity support
    $permissions.IdentitySupport.User = $Description -match 'User\s*\|\s*Yes'
    $permissions.IdentitySupport.ServicePrincipal = $Description -match 'Service principal[^\|]*\|\s*Yes'
    $permissions.IdentitySupport.ManagedIdentity = $Description -match 'Managed identities[^\|]*\|\s*Yes'

    return $permissions
}

function Get-ResponseInfo {
    <#
    .SYNOPSIS
        Extracts response information from swagger operation.
    #>
    param([hashtable]$Responses)

    $responseInfo = @{}

    foreach ($code in $Responses.Keys) {
        $response = $Responses[$code]
        $responseInfo[$code] = @{
            Description = $response.description
            Schema      = $response.schema
            Headers     = $response.headers
        }
    }

    return $responseInfo
}

#endregion

#region Download Logic

# Create cache directory if it doesn't exist
if (-not (Test-Path $CachePath)) {
    New-Item -Path $CachePath -ItemType Directory -Force | Out-Null
    Write-Host "Created cache directory: $CachePath" -ForegroundColor Green
}

# List of all swagger spec directories from the repo
$swaggerSpecs = @(
    'admin'
    'common'   # shared base definitions (Item, Principal, PaginatedResponse, ...) referenced via ../common/definitions.json
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

if (-not $SkipDownload) {
    Write-Host "`nDownloading Microsoft Fabric REST API Swagger Specifications..." -ForegroundColor Cyan
    Write-Host "Cache Path: $CachePath`n" -ForegroundColor Gray

    foreach ($spec in $swaggerSpecs) {
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

        # 'common' provides shared definitions only; it has no swagger.json.
        if ($spec -eq 'common') {
            $filesToDownload = @($filesToDownload | Where-Object { $_.FileType -eq 'definitions' })
        }

        foreach ($fileInfo in $filesToDownload) {
            $url = $fileInfo.Url
            $outputFile = $fileInfo.OutputFile
            $fileType = $fileInfo.FileType

            # Skip if file exists and Force not specified
            if ((Test-Path $outputFile) -and -not $Force) {
                Write-Host "[SKIP] $spec.$fileType (already cached)" -ForegroundColor Gray
                $skippedCount++
                continue
            }

            try {
                Write-Host "[DOWNLOADING] $spec.$fileType..." -ForegroundColor Yellow -NoNewline

                # Download the file
                $response = Invoke-WebRequest -Uri $url -UseBasicParsing -ErrorAction Stop

                # Save to cache
                $response.Content | Out-File -FilePath $outputFile -Encoding UTF8 -Force

                # Validate it's valid JSON
                $null = Get-Content $outputFile -Raw | ConvertFrom-Json -ErrorAction Stop

                Write-Host " SUCCESS" -ForegroundColor Green
                $downloadedCount++
            }
            catch {
                Write-Host " FAILED" -ForegroundColor Red
                Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
                $failedCount++
                $failedSpecs += "$spec.$fileType"
            }
        }
    }
}

# Nested per-spec definition files: several swaggers (notably 'platform' and 'admin') split
# their body/response schemas into sibling files referenced as "./definitions/<name>.json"
# (e.g. platform -> workspaceNetworkingPolicy.json, connections.json, deploymentPipelines.json,
# gitIntegration.json, externaldatasharing.json). Without these the body/response schemas for
# those operations cannot be resolved. Auto-discover the references from each downloaded swagger
# so the list stays correct as Microsoft evolves the specs. Cached as <spec>.<name>.definitions.json.
$nestedDefinitionFiles = @()
if (-not $SkipDownload) {
    Write-Host "`nDownloading nested definition files referenced by swaggers..." -ForegroundColor Cyan
    foreach ($spec in $swaggerSpecs) {
        $specSwaggerFile = Join-Path $CachePath "$spec.swagger.json"
        if (-not (Test-Path $specSwaggerFile)) { continue }

        $swaggerText = Get-Content $specSwaggerFile -Raw
        $nestedNames = [regex]::Matches($swaggerText, '\./definitions/([A-Za-z0-9]+)\.json') |
            ForEach-Object { $_.Groups[1].Value } |
            Sort-Object -Unique

        foreach ($nested in $nestedNames) {
            $nestedUrl  = "$baseUrl/$spec/definitions/$nested.json"
            $nestedOut  = Join-Path $CachePath "$spec.$nested.definitions.json"
            $nestedDefinitionFiles += "$spec.$nested.definitions.json"

            if ((Test-Path $nestedOut) -and -not $Force) {
                Write-Host "[SKIP] $spec/definitions/$nested (already cached)" -ForegroundColor Gray
                $skippedCount++
                continue
            }

            try {
                Write-Host "[DOWNLOADING] $spec/definitions/$nested..." -ForegroundColor Yellow -NoNewline
                $nestedResponse = Invoke-WebRequest -Uri $nestedUrl -UseBasicParsing -ErrorAction Stop
                $nestedResponse.Content | Out-File -FilePath $nestedOut -Encoding UTF8 -Force
                $null = Get-Content $nestedOut -Raw | ConvertFrom-Json -ErrorAction Stop
                Write-Host " SUCCESS" -ForegroundColor Green
                $downloadedCount++
            }
            catch {
                Write-Host " FAILED" -ForegroundColor Red
                Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
                $failedCount++
                $failedSpecs += "$spec/$nested"
            }
        }
    }
    $nestedDefinitionFiles = @($nestedDefinitionFiles | Sort-Object -Unique)
}

#endregion

#region Parse and Create Consolidated Lookup

Write-Host "`nCreating consolidated API lookup..." -ForegroundColor Cyan

# Initialize the consolidated lookup structure
$consolidatedLookup = @{
    Version          = '2.0.0'
    GeneratedAt      = (Get-Date).ToString('o')
    BaseUrl          = 'https://api.fabric.microsoft.com/v1'
    Endpoints        = @{}
    ResourceTypes    = @{}
    OperationIndex   = @{}
    PathPatterns     = @{}
}

$totalEndpoints = 0
$totalOperations = 0

foreach ($spec in $swaggerSpecs) {
    $swaggerFile = Join-Path $CachePath "$spec.swagger.json"

    if (-not (Test-Path $swaggerFile)) {
        Write-Host "[SKIP] $spec - swagger file not found" -ForegroundColor Yellow
        continue
    }

    try {
        $swagger = Get-Content $swaggerFile -Raw | ConvertFrom-Json -AsHashtable -ErrorAction Stop

        # Add resource type info
        $consolidatedLookup.ResourceTypes[$spec] = @{
            Title       = $swagger.info.title
            Description = $swagger.info.description
            Version     = $swagger.info.version
            Host        = $swagger.host
            BasePath    = $swagger.basePath
            PathCount   = 0
        }

        # Process each path
        foreach ($pathKey in $swagger.paths.Keys) {
            $pathData = $swagger.paths[$pathKey]
            $normalizedPath = ConvertTo-NormalizedPath -Path $pathKey
            $fullPath = $pathKey

            # Initialize endpoint entry if not exists
            if (-not $consolidatedLookup.Endpoints.ContainsKey($fullPath)) {
                $consolidatedLookup.Endpoints[$fullPath] = @{
                    ResourceType   = $spec
                    NormalizedPath = $normalizedPath
                    Methods        = @{}
                }
                $totalEndpoints++
            }

            # Process each HTTP method for this path
            foreach ($method in @('get', 'post', 'put', 'patch', 'delete')) {
                if ($pathData.ContainsKey($method)) {
                    $operation = $pathData[$method]
                    $totalOperations++

                    $operationInfo = @{
                        OperationId    = $operation.operationId
                        Summary        = $operation.summary
                        Description    = $operation.description
                        Tags           = $operation.tags
                        Parameters     = Get-ParameterInfo -Parameters $operation.parameters
                        Responses      = Get-ResponseInfo -Responses $operation.responses
                        Permissions    = Get-PermissionInfo -Description $operation.description
                        IsLRO          = [bool]$operation.'x-ms-fabric-sdk-long-running-operation'
                        IsPaginated    = [bool]$operation.'x-ms-pageable'
                        Consumes       = $operation.consumes
                        Produces       = $operation.produces
                    }

                    $consolidatedLookup.Endpoints[$fullPath].Methods[$method.ToUpper()] = $operationInfo

                    # Add to operation index for quick lookup by operationId
                    if ($operation.operationId) {
                        $consolidatedLookup.OperationIndex[$operation.operationId] = @{
                            Path   = $fullPath
                            Method = $method.ToUpper()
                            Spec   = $spec
                        }
                    }
                }
            }

            $consolidatedLookup.ResourceTypes[$spec].PathCount++

            # Add to path patterns for pattern matching
            if (-not $consolidatedLookup.PathPatterns.ContainsKey($normalizedPath)) {
                $consolidatedLookup.PathPatterns[$normalizedPath] = @()
            }
            $consolidatedLookup.PathPatterns[$normalizedPath] += @{
                ActualPath   = $fullPath
                ResourceType = $spec
            }
        }

        Write-Host "[PARSED] $spec - $($swagger.paths.Keys.Count) paths" -ForegroundColor Green
    }
    catch {
        Write-Host "[ERROR] $spec - $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Add summary statistics
$consolidatedLookup.Statistics = @{
    TotalResourceTypes = $consolidatedLookup.ResourceTypes.Count
    TotalEndpoints     = $totalEndpoints
    TotalOperations    = $totalOperations
    UniquePathPatterns = $consolidatedLookup.PathPatterns.Count
}

# Save consolidated lookup
$lookupFile = Join-Path $CachePath 'fabric-api-lookup.json'
$consolidatedLookup | ConvertTo-Json -Depth 20 -Compress:$false | Out-File -FilePath $lookupFile -Encoding UTF8 -Force
Write-Host "`nConsolidated lookup saved to: $lookupFile" -ForegroundColor Green

#endregion

#region Create Simplified Validation Lookup

Write-Host "`nCreating simplified validation lookup..." -ForegroundColor Cyan

# Create a simpler structure for quick validation
$validationLookup = @{
    Version     = '2.0.0'
    GeneratedAt = (Get-Date).ToString('o')
    Endpoints   = @{}
}

foreach ($path in $consolidatedLookup.Endpoints.Keys) {
    $endpoint = $consolidatedLookup.Endpoints[$path]

    $validationLookup.Endpoints[$path] = @{
        ResourceType = $endpoint.ResourceType
        Methods      = @{}
    }

    foreach ($method in $endpoint.Methods.Keys) {
        $op = $endpoint.Methods[$method]
        $validationLookup.Endpoints[$path].Methods[$method] = @{
            OperationId      = $op.OperationId
            RequiredParams   = $op.Parameters.Required
            OptionalParams   = $op.Parameters.Optional
            PathParams       = @($op.Parameters.Path | ForEach-Object { $_.Name })
            QueryParams      = @($op.Parameters.Query | ForEach-Object { $_.Name })
            HasBody          = $null -ne $op.Parameters.Body
            IsLRO            = $op.IsLRO
            IsPaginated      = $op.IsPaginated
            RequiredScopes   = $op.Permissions.Scopes
            MinimumRole      = $op.Permissions.MinimumRole
        }
    }
}

$validationFile = Join-Path $CachePath 'fabric-api-validation.json'
$validationLookup | ConvertTo-Json -Depth 10 -Compress:$false | Out-File -FilePath $validationFile -Encoding UTF8 -Force
Write-Host "Validation lookup saved to: $validationFile" -ForegroundColor Green

#endregion

#region Power BI REST API Cache

# The Power BI REST API (api.powerbi.com) has no per-resource specs repo like Fabric.
# The authoritative machine-readable source is the swagger Microsoft uses to generate
# the Power BI .NET SDK: a single self-contained OpenAPI 2.0 document.
$powerBISwaggerUrl  = 'https://raw.githubusercontent.com/microsoft/PowerBI-CSharp/master/sdk/swaggers/swagger.json'
$powerBISwaggerFile = Join-Path $CachePath 'powerbi.swagger.json'

if (-not $SkipDownload) {
    if ((Test-Path $powerBISwaggerFile) -and -not $Force) {
        Write-Host "[SKIP] powerbi.swagger (already cached)" -ForegroundColor Gray
        $skippedCount++
    }
    else {
        try {
            Write-Host "[DOWNLOADING] powerbi.swagger..." -ForegroundColor Yellow -NoNewline
            $pbiResponse = Invoke-WebRequest -Uri $powerBISwaggerUrl -UseBasicParsing -ErrorAction Stop
            $pbiResponse.Content | Out-File -FilePath $powerBISwaggerFile -Encoding UTF8 -Force
            $null = Get-Content $powerBISwaggerFile -Raw | ConvertFrom-Json -ErrorAction Stop
            Write-Host " SUCCESS" -ForegroundColor Green
            $downloadedCount++
        }
        catch {
            Write-Host " FAILED" -ForegroundColor Red
            Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
            $failedCount++
            $failedSpecs += 'powerbi.swagger'
        }
    }
}

if (Test-Path $powerBISwaggerFile) {
    Write-Host "`nCreating Power BI validation lookup..." -ForegroundColor Cyan
    try {
        $pbiSwagger = Get-Content $powerBISwaggerFile -Raw | ConvertFrom-Json -AsHashtable -ErrorAction Stop

        # OpenAPI 2.0: operation parameters may be inline or a $ref into the global parameters map.
        $pbiGlobalParams = @{}
        if ($pbiSwagger.ContainsKey('parameters') -and $pbiSwagger.parameters) {
            foreach ($gp in $pbiSwagger.parameters.GetEnumerator()) {
                $pbiGlobalParams[$gp.Key] = $gp.Value
            }
        }

        function Resolve-PBIParameter {
            param($Param)
            if ($Param -is [hashtable] -and $Param.ContainsKey('$ref')) {
                $refName = ($Param['$ref'] -split '/')[-1]
                if ($pbiGlobalParams.ContainsKey($refName)) { return $pbiGlobalParams[$refName] }
            }
            return $Param
        }

        $pbiValidation = @{
            Version     = '1.0.0'
            GeneratedAt = (Get-Date).ToString('o')
            BaseUrl     = 'https://api.powerbi.com'
            Endpoints   = @{}
        }
        $pbiOpCount = 0

        foreach ($pathKey in $pbiSwagger.paths.Keys) {
            $pathData = $pbiSwagger.paths[$pathKey]
            $pbiValidation.Endpoints[$pathKey] = @{
                ResourceType = $null
                Methods      = @{}
            }

            foreach ($method in @('get', 'post', 'put', 'patch', 'delete')) {
                if (-not $pathData.ContainsKey($method)) { continue }
                $operation = $pathData[$method]
                $pbiOpCount++

                $required = @(); $optional = @(); $pathParams = @(); $queryParams = @(); $hasBody = $false
                foreach ($rawParam in @($operation.parameters)) {
                    if (-not $rawParam) { continue }
                    $param = Resolve-PBIParameter -Param $rawParam
                    if (-not $param.name) { continue }
                    switch ($param.in) {
                        'path'  { $pathParams  += $param.name }
                        'query' { $queryParams += $param.name }
                        'body'  { $hasBody = $true }
                    }
                    if ($param.required) { $required += $param.name } else { $optional += $param.name }
                }

                # Tag is the operation group (e.g. Admin, Datasets, Gateways) - used as ResourceType.
                $tag = if ($operation.tags -and $operation.tags.Count -gt 0) { $operation.tags[0] } else { 'Unknown' }
                if (-not $pbiValidation.Endpoints[$pathKey].ResourceType) {
                    $pbiValidation.Endpoints[$pathKey].ResourceType = $tag
                }

                $pbiValidation.Endpoints[$pathKey].Methods[$method.ToUpper()] = @{
                    OperationId    = $operation.operationId
                    RequiredParams = $required
                    OptionalParams = $optional
                    PathParams     = $pathParams
                    QueryParams    = $queryParams
                    HasBody        = $hasBody
                    Tag            = $tag
                }
            }
        }

        $pbiValidationFile = Join-Path $CachePath 'powerbi-api-validation.json'
        $pbiValidation | ConvertTo-Json -Depth 10 -Compress:$false | Out-File -FilePath $pbiValidationFile -Encoding UTF8 -Force
        Write-Host "Power BI validation lookup saved to: $pbiValidationFile ($pbiOpCount operations across $($pbiValidation.Endpoints.Count) paths)" -ForegroundColor Green
    }
    catch {
        Write-Host "[ERROR] powerbi validation - $($_.Exception.Message)" -ForegroundColor Red
    }
}

#endregion

#region Create Metadata

$metadata = @{
    LastUpdated       = (Get-Date).ToString('o')
    TotalSpecs        = $swaggerSpecs.Count
    Downloaded        = $downloadedCount
    Skipped           = $skippedCount
    Failed            = $failedCount
    FailedSpecs       = $failedSpecs
    SpecList          = $swaggerSpecs
    Statistics        = $consolidatedLookup.Statistics
    Files             = @{
        ConsolidatedLookup    = 'fabric-api-lookup.json'
        ValidationLookup      = 'fabric-api-validation.json'
        SwaggerFiles          = @($swaggerSpecs | ForEach-Object { "$_.swagger.json" })
        DefinitionFiles       = @($swaggerSpecs | ForEach-Object { "$_.definitions.json" })
        NestedDefinitionFiles = $nestedDefinitionFiles
    }
} | ConvertTo-Json -Depth 10

$metadataFile = Join-Path $CachePath 'cache-metadata.json'
$metadata | Out-File -FilePath $metadataFile -Encoding UTF8 -Force

#endregion

#region Summary

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Cache Update Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Total Specs:       $($swaggerSpecs.Count)" -ForegroundColor White
Write-Host "Downloaded:        $downloadedCount" -ForegroundColor Green
Write-Host "Skipped:           $skippedCount" -ForegroundColor Gray
Write-Host "Failed:            $failedCount" -ForegroundColor $(if ($failedCount -gt 0) { 'Red' } else { 'Green' })
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host "Total Endpoints:   $totalEndpoints" -ForegroundColor White
Write-Host "Total Operations:  $totalOperations" -ForegroundColor White
Write-Host "Path Patterns:     $($consolidatedLookup.PathPatterns.Count)" -ForegroundColor White
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host "Cache Path:        $CachePath" -ForegroundColor White
Write-Host "Last Updated:      $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor White

if ($failedSpecs.Count -gt 0) {
    Write-Host "`nFailed Specs:" -ForegroundColor Red
    $failedSpecs | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

Write-Host "`nGenerated Files:" -ForegroundColor Cyan
Write-Host "  - fabric-api-lookup.json     (Full API spec with all details)" -ForegroundColor White
Write-Host "  - fabric-api-validation.json (Simplified for validation)" -ForegroundColor White
Write-Host "  - cache-metadata.json        (Cache metadata)" -ForegroundColor White

Write-Host "`nCache is ready for API validation!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

#endregion
