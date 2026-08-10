<#
.SYNOPSIS
    Generates docs/api-property-map.md: a per-resource map of API response-schema properties
    against what the module's Get-* functions return, plus a consolidated "flattening backlog"
    of nested properties worth surfacing as top-level fields.

.DESCRIPTION
    For each row in $ResourceMap this script:
      1. Resolves the response-schema's top-level properties (name + type + $ref target),
         following allOf composition and cross-file $refs, from the local API-specs cache.
      2. Emits a markdown table: API Property | Type | Returned | Notes.
         The module follows an enrichment-first contract - every Get-* returns the FULL API
         response by default (verified by tests/Unit/PropertyCompleteness.Tests.ps1), so every
         top-level API property is Returned = yes; -Raw returns it untouched; default output
         additionally carries the resolved-name NoteProperties listed in Enrichment.
      3. For every NESTED property (object / $ref / array-of-$ref) it resolves ONE level deeper
         and records the inner fields, which are collected into a "Flattening backlog" section
         proposing top-level columns (e.g. properties.sqlEndpointProperties.connectionString ->
         SqlConnectionString).

    The cache is gitignored; run scripts/Update-FabricAPISpecsCache.ps1 first if it is empty.

.PARAMETER CacheRoot
    Root of the API specs cache.

.PARAMETER OutputPath
    Markdown file to write.

.NOTES
    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
    Version: 1.0.0
#>
[CmdletBinding()]
param(
    [Parameter()]
    [string]$CacheRoot = 'S:\fabric-toolbox\tools\.api-specs-cache',

    [Parameter()]
    [string]$OutputPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'docs\api-property-map.md')
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------------------
# Resource map: Function -> (Spec, Definition) + the resolved-name NoteProperties the
# default (non-Raw) output adds. Item resources inherit id/displayName/description/type/
# workspaceId from the shared 'Item' base and expose a nested 'properties' object.
# ---------------------------------------------------------------------------------------
$ResourceMap = @(
    @{ Function = 'Get-FabricLakehouse'         ; Spec = 'lakehouse'         ; Definition = 'Lakehouse'         ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricWarehouse'         ; Spec = 'warehouse'         ; Definition = 'Warehouse'         ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricNotebook'          ; Spec = 'notebook'          ; Definition = 'Notebook'          ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricEnvironment'       ; Spec = 'environment'       ; Definition = 'Environment'       ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricEventhouse'        ; Spec = 'eventhouse'        ; Definition = 'Eventhouse'        ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricMirroredDatabase'  ; Spec = 'mirroredDatabase'  ; Definition = 'MirroredDatabase'  ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricSQLDatabase'       ; Spec = 'sqlDatabase'       ; Definition = 'SqlDatabase'       ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricKQLDatabase'       ; Spec = 'kqlDatabase'       ; Definition = 'KQLDatabase'       ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricKQLQueryset'       ; Spec = 'kqlQueryset'       ; Definition = 'KQLQueryset'       ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricKQLDashboard'      ; Spec = 'kqlDashboard'      ; Definition = 'KQLDashboard'      ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricEventstream'       ; Spec = 'eventstream'       ; Definition = 'Eventstream'       ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricDataPipeline'      ; Spec = 'dataPipeline'      ; Definition = 'DataPipeline'      ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricReport'            ; Spec = 'report'            ; Definition = 'Report'            ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricSemanticModel'     ; Spec = 'semanticModel'     ; Definition = 'SemanticModel'     ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricSparkJobDefinition'; Spec = 'sparkjobdefinition'; Definition = 'SparkJobDefinition'; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricMLModel'           ; Spec = 'mlModel'           ; Definition = 'MLModel'           ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricMLExperiment'      ; Spec = 'mlExperiment'      ; Definition = 'MLExperiment'      ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricGraphQLApi'        ; Spec = 'graphQLApi'        ; Definition = 'GraphQLApi'        ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricReflex'            ; Spec = 'reflex'            ; Definition = 'Reflex'            ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricDataflow'          ; Spec = 'dataflow'          ; Definition = 'Dataflow'          ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricCopyJob'           ; Spec = 'copyJob'           ; Definition = 'CopyJob'           ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricVariableLibrary'   ; Spec = 'variableLibrary'   ; Definition = 'VariableLibrary'   ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricMountedDataFactory'; Spec = 'mountedDataFactory'; Definition = 'MountedDataFactory'; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricWarehouseSnapshot' ; Spec = 'warehouseSnapshot' ; Definition = 'WarehouseSnapshot' ; Enrichment = 'WorkspaceName, CapacityName' }
    @{ Function = 'Get-FabricCapacity'          ; Spec = 'platform'          ; Definition = 'Capacity'          ; Enrichment = 'CapacityName' }
    @{ Function = 'Get-FabricWorkspace'         ; Spec = 'platform'          ; Definition = 'Workspace'         ; Enrichment = 'CapacityName' }
)

# ---------------------------------------------------------------------------------------
# Schema resolution (types + one-level nesting). Follows allOf and cross-file $refs.
# ---------------------------------------------------------------------------------------
$script:DocCache = @{}
$script:KnownDefs = @{
    'Item'      = [pscustomobject]@{ properties = [pscustomobject]@{ id = @{ type = 'string' }; displayName = @{ type = 'string' }; description = @{ type = 'string' }; type = @{ type = 'string' }; workspaceId = @{ type = 'string' } } }
    'Capacity'  = [pscustomobject]@{ properties = [pscustomobject]@{ id = @{ type = 'string' }; displayName = @{ type = 'string' }; sku = @{ type = 'string' }; region = @{ type = 'string' }; state = @{ type = 'string' } } }
    'Workspace' = [pscustomobject]@{ properties = [pscustomobject]@{ id = @{ type = 'string' }; displayName = @{ type = 'string' }; description = @{ type = 'string' }; type = @{ type = 'string' }; capacityId = @{ type = 'string' } } }
}

function Get-Doc([string]$Spec) {
    if ($script:DocCache.ContainsKey($Spec)) { return $script:DocCache[$Spec] }
    $doc = $null
    foreach ($file in @("$Spec.definitions.json", "$Spec.swagger.json")) {
        $path = Join-Path $CacheRoot $file
        if (-not (Test-Path $path)) { continue }
        try { $parsed = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json } catch { continue }
        if ($parsed.PSObject.Properties.Name -contains 'definitions' -and $parsed.definitions -and $parsed.definitions.PSObject.Properties.Count -gt 0) { $doc = $parsed; break }
        if (-not $doc) { $doc = $parsed }
    }
    $script:DocCache[$Spec] = $doc
    return $doc
}

function Resolve-Ref([string]$CurrentSpec, [string]$Ref) {
    $defName = (($Ref -split '/definitions/')[-1] -split '#')[-1].Trim('/')
    $filePart = ($Ref -split '#')[0]
    $spec = $CurrentSpec
    if ($filePart) {
        $lower = $filePart.ToLowerInvariant()
        if ($lower -match 'common') { $spec = 'common' }
        elseif ($lower -match 'platform') { $spec = 'platform' }
        elseif ($lower -match '^\.?/?definitions\.json$') { $spec = $CurrentSpec }
        else { $leaf = [System.IO.Path]::GetFileNameWithoutExtension($filePart) -replace '_?definitions$', ''; if ($leaf) { $spec = $leaf } }
    }
    [pscustomobject]@{ Spec = $spec; Definition = $defName }
}

function Get-DefNode([string]$Spec, [string]$DefName) {
    $doc = Get-Doc $Spec
    if ($doc -and $doc.definitions -and ($doc.definitions.PSObject.Properties.Name -contains $DefName)) { return $doc.definitions.$DefName }
    if ($script:KnownDefs.ContainsKey($DefName)) { return $script:KnownDefs[$DefName] }
    return $null
}

# True when a $ref target is a real object (has properties or allOf) rather than an enum/scalar.
function Test-ObjectRef([string]$Spec, [string]$DefName) {
    $node = Get-DefNode $Spec $DefName
    if (-not $node) { return $false }
    if (($node.PSObject.Properties.Name -contains 'properties') -and $node.properties -and $node.properties.PSObject.Properties.Count -gt 0) { return $true }
    if (($node.PSObject.Properties.Name -contains 'allOf') -and $node.allOf) { return $true }
    return $false
}

# Returns ordered list of [pscustomobject]{ Name; Type; Ref; RefSpec } for a definition.
function Get-PropDetail([string]$Spec, [string]$DefName, [System.Collections.Generic.HashSet[string]]$Visited) {
    $key = "$Spec::$DefName"
    if (-not $Visited.Add($key)) { return @() }
    $node = Get-DefNode $Spec $DefName
    if (-not $node) { Write-Warning "Unresolved definition '$DefName' in '$Spec'"; return @() }

    $out = [System.Collections.Generic.List[object]]::new()
    $emit = {
        param($propsObj)
        foreach ($pp in $propsObj.PSObject.Properties) {
            $v = $pp.Value
            $ref = $null; $refSpec = $Spec; $kind = 'scalar'
            $type = if ($v.type) { $v.type } elseif ($v.'$ref') { 'object' } else { 'string' }

            if ($v.'$ref') {
                $rt = Resolve-Ref $Spec $v.'$ref'
                if (Test-ObjectRef $rt.Spec $rt.Definition) { $ref = $rt.Definition; $refSpec = $rt.Spec; $kind = 'object' }
                else { $type = "string (enum $($rt.Definition))"; $kind = 'scalar' }   # enum/scalar ref
            }
            elseif ($v.type -eq 'array' -and $v.items -and $v.items.'$ref') {
                $rt = Resolve-Ref $Spec $v.items.'$ref'
                if (Test-ObjectRef $rt.Spec $rt.Definition) { $ref = $rt.Definition; $refSpec = $rt.Spec; $kind = 'array' }
                else { $type = "array (enum $($rt.Definition))"; $kind = 'scalar' }
            }
            elseif ($v.type -eq 'object') { $kind = 'object' }   # inline object, no ref to expand

            $out.Add([pscustomobject]@{ Name = $pp.Name; Type = $type; Ref = $ref; RefSpec = $refSpec; Kind = $kind })
        }
    }
    if ($node.allOf) {
        foreach ($e in $node.allOf) {
            if ($e.'$ref') { $rt = Resolve-Ref $Spec $e.'$ref'; foreach ($x in (Get-PropDetail $rt.Spec $rt.Definition $Visited)) { $out.Add($x) } }
            elseif ($e.properties) { & $emit $e.properties }
        }
    }
    if ($node.properties) { & $emit $node.properties }
    return $out
}

# ---------------------------------------------------------------------------------------
# Build the document.
# ---------------------------------------------------------------------------------------
$sb = [System.Text.StringBuilder]::new()
$null = $sb.AppendLine('# Fabric API property map (API schema vs. module output)')
$null = $sb.AppendLine()
$null = $sb.AppendLine('> Generated by `scripts/New-FabricPropertyMap.ps1` from the API-specs cache. Do not edit by hand.')
$null = $sb.AppendLine('>')
$null = $sb.AppendLine('> **Returned** reflects the module''s enrichment-first contract: every `Get-Fabric*` returns the')
$null = $sb.AppendLine('> **full** API response by default (no properties trimmed - enforced by')
$null = $sb.AppendLine('> `tests/Unit/PropertyCompleteness.Tests.ps1`). `-Raw` returns the untouched response; the default')
$null = $sb.AppendLine('> output additionally carries the resolved-name NoteProperties in each section''s _Enrichment adds_ line.')
$null = $sb.AppendLine('> Nested (object/array) properties are returned as-is today and are collected into the')
$null = $sb.AppendLine('> [Flattening backlog](#flattening-backlog) below - fields worth surfacing as top-level columns.')
$null = $sb.AppendLine()

$flatten = [System.Collections.Generic.List[object]]::new()
$covered = 0

foreach ($row in $ResourceMap) {
    $visited = [System.Collections.Generic.HashSet[string]]::new()
    $props = @(Get-PropDetail $row.Spec $row.Definition $visited)
    if (-not $props -or $props.Count -eq 0) { Write-Warning "No properties for $($row.Function) ($($row.Spec)/$($row.Definition)); skipped"; continue }
    $covered++

    $null = $sb.AppendLine("## $($row.Function)")
    $null = $sb.AppendLine()
    $null = $sb.AppendLine("API: ``$($row.Spec)`` / ``$($row.Definition)``")
    $null = $sb.AppendLine()
    $null = $sb.AppendLine('| API property | Type | Returned | Notes |')
    $null = $sb.AppendLine('|---|---|---|---|')

    foreach ($p in ($props | Sort-Object Name -Unique)) {
        $isNested = ($p.Kind -in @('object', 'array')) -and $p.Ref
        $note = ''
        if ($isNested) {
            # Resolve one level for the flatten backlog.
            $inner = @(Get-PropDetail $p.RefSpec $p.Ref ([System.Collections.Generic.HashSet[string]]::new()))
            $scalarInner = @($inner | Where-Object { $_.Type -notin @('object', 'array') } | Select-Object -ExpandProperty Name)
            $note = "nested ``$($p.Ref)`` - flatten candidate"
            if ($scalarInner.Count -gt 0) {
                $flatten.Add([pscustomobject]@{
                        Resource = $row.Function
                        Path     = "$($p.Name)"
                        Ref      = $p.Ref
                        Inner    = ($scalarInner -join ', ')
                    })
            }
            # Note any deeper nested inner objects too (e.g. properties.sqlEndpointProperties).
            $objInner = @($inner | Where-Object { ($_.Type -in @('object', 'array')) -and $_.Ref })
            foreach ($oi in $objInner) {
                $deep = @(Get-PropDetail $oi.RefSpec $oi.Ref ([System.Collections.Generic.HashSet[string]]::new()))
                $deepScalar = @($deep | Where-Object { $_.Type -notin @('object', 'array') } | Select-Object -ExpandProperty Name)
                if ($deepScalar.Count -gt 0) {
                    $flatten.Add([pscustomobject]@{
                            Resource = $row.Function
                            Path     = "$($p.Name).$($oi.Name)"
                            Ref      = $oi.Ref
                            Inner    = ($deepScalar -join ', ')
                        })
                }
            }
        }
        $typeDisplay = if ($p.Ref) { "$($p.Type)&nbsp;($($p.Ref))" } else { $p.Type }
        $null = $sb.AppendLine("| $($p.Name) | $typeDisplay | yes | $note |")
    }
    $null = $sb.AppendLine()
    $null = $sb.AppendLine("_Enrichment adds (default output only): $($row.Enrichment); PSTypeName `MicrosoftFabric.*`._")
    $null = $sb.AppendLine()
}

# ---- Flattening backlog -----------------------------------------------------------------
# Suggestion heuristic: PascalCase the inner fields that carry information users most want.
function Suggest([string]$path, [string]$inner) {
    $prefix = ''
    if ($path -match 'sqlEndpoint') { $prefix = 'SqlEndpoint' }
    $fields = ($inner -split ',\s*') | Where-Object { $_ -match 'connectionString|Uri|Fqdn|Path|databaseName|serverFqdn|state|status|provisioning|defaultSchema|createdDate|earliestRestorePoint|latestRestorePoint|backupRetention' }
    if (-not $fields) { return '' }
    (($fields | ForEach-Object { $n = $_.Substring(0, 1).ToUpper() + $_.Substring(1); if ($prefix -and $n -notmatch "^$prefix") { "$prefix$n" } else { $n } }) -join ', ')
}

# Split: high-value (heuristic finds a useful field) vs. generic metadata (id/displayName only).
$highValue = [System.Collections.Generic.List[object]]::new()
$generic = [System.Collections.Generic.List[object]]::new()
foreach ($f in $flatten) {
    $s = Suggest $f.Path $f.Inner
    if ($s) { $highValue.Add([pscustomobject]@{ Resource = $f.Resource; Path = $f.Path; Ref = $f.Ref; Inner = $f.Inner; Suggest = $s }) }
    else { $generic.Add($f) }
}

$null = $sb.AppendLine('## Flattening backlog')
$null = $sb.AppendLine()
$null = $sb.AppendLine('Nested objects the module returns today. The **high-value** table holds inner scalars users')
$null = $sb.AppendLine('most want (connection strings, service URIs, OneLake paths, FQDNs, provisioning/state, restore')
$null = $sb.AppendLine('points). Proposed work: surface each as a flat top-level NoteProperty (e.g.')
$null = $sb.AppendLine('`properties.sqlEndpointProperties.connectionString` -> `SqlEndpointConnectionString`) during')
$null = $sb.AppendLine('enrichment, leaving the nested object in place. These are the recommended next targets.')
$null = $sb.AppendLine()
$null = $sb.AppendLine('### High-value targets (do these next)')
$null = $sb.AppendLine()
$null = $sb.AppendLine('| Resource | Nested path | Inner scalar fields | Suggested top-level fields |')
$null = $sb.AppendLine('|---|---|---|---|')
foreach ($f in ($highValue | Sort-Object Resource, Path)) {
    $null = $sb.AppendLine("| $($f.Resource) | ``$($f.Path)`` ($($f.Ref)) | $($f.Inner) | **$($f.Suggest)** |")
}
$null = $sb.AppendLine()

# Generic metadata objects are identical across all item resources - summarise once.
$null = $sb.AppendLine('### Generic metadata objects (present on most item resources - lower priority)')
$null = $sb.AppendLine()
$null = $sb.AppendLine('These nested objects appear on nearly every item and carry only id/displayName-style fields;')
$null = $sb.AppendLine('flatten only if a specific scenario needs them.')
$null = $sb.AppendLine()
$null = $sb.AppendLine('| Nested path | Ref | Inner scalar fields | Appears on |')
$null = $sb.AppendLine('|---|---|---|---|')
$genericGroups = $generic | Group-Object { "$($_.Path)|$($_.Ref)|$($_.Inner)" }
foreach ($g in ($genericGroups | Sort-Object Name)) {
    $sample = $g.Group[0]
    $null = $sb.AppendLine("| ``$($sample.Path)`` | $($sample.Ref) | $($sample.Inner) | $($g.Count) resources |")
}
$null = $sb.AppendLine()
$null = $sb.AppendLine("_Resources mapped: $covered of $($ResourceMap.Count). High-value targets: $($highValue.Count). Regenerate after ``Update-FabricAPISpecsCache.ps1``._")

# ---- Write ------------------------------------------------------------------------------
$outDir = Split-Path -Parent $OutputPath
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
[System.IO.File]::WriteAllText($OutputPath, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Wrote $OutputPath ($covered resources, $($flatten.Count) flatten candidates)" -ForegroundColor Green
