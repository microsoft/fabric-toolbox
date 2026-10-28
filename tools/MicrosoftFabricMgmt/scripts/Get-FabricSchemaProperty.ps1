<#
.SYNOPSIS
    Resolves the set of TOP-LEVEL item property names defined by a Microsoft Fabric
    (or Power BI) REST API response schema, using the local swagger cache.

.DESCRIPTION
    Given either a definition name or a swagger path+method, this helper walks the
    cached OpenAPI/Swagger documents in the API-specs cache and returns the sorted
    list of top-level property names that make up a single RESPONSE ITEM.

    It resolves:
      * local refs           ( #/definitions/X )
      * sibling-file refs    ( ./definitions.json#/definitions/X )
      * cross-spec refs      ( ../common/definitions.json#/definitions/X ,
                               ../platform/... , ./definitions/platform.json#/... )
      * allOf composition    (both $ref entries and inline { properties: {...} } entries)

    Cache layout (S:\fabric-toolbox\tools\.api-specs-cache):
      * Fabric  : <spec>.swagger.json  (paths)      + <spec>.definitions.json (.definitions)
      * PowerBI : powerbi.swagger.json (single OpenAPI 2.0 file, paths + .definitions)

    Cache gaps: some upstream refs (the common platform "Item" base, and the whole
    "platform" definitions file: Capacity / Workspace) are referenced by the cached
    specs but the target files were NOT captured into the flat cache. For those, a
    small, clearly-labelled fallback registry ($script:FabricKnownDefinitions) supplies
    the property names taken verbatim from the public Microsoft Fabric REST API spec.
    Any ref that still cannot be resolved is skipped with a warning (never throws), so
    the harness degrades gracefully rather than failing to load.

    Only TOP-LEVEL item property names are returned - recursing into nested object
    properties is intentionally out of scope (top-level names are the completeness
    contract this harness validates).

.PARAMETER SpecName
    The cache spec base name that OWNS the definition, e.g. 'lakehouse', 'notebook',
    'environment', 'platform', 'powerbi'. Used to locate <SpecName>.definitions.json
    (or powerbi.swagger.json) and as the base for relative ref resolution.

.PARAMETER DefinitionName
    (Definition parameter set) The item definition to resolve, e.g. 'Lakehouse',
    'Capacity', 'AdminDataset'.

.PARAMETER Path
    (Path parameter set) A swagger path template, e.g. '/v1.0/myorg/admin/datasets'.

.PARAMETER Method
    (Path parameter set) The HTTP method for that path, e.g. 'get'.

.PARAMETER CacheRoot
    Root folder of the API specs cache.

.EXAMPLE
    Get-FabricSchemaProperty -SpecName 'lakehouse' -DefinitionName 'Lakehouse'

.EXAMPLE
    Get-FabricSchemaProperty -SpecName 'powerbi' -Path '/v1.0/myorg/admin/datasets' -Method 'get'

.OUTPUTS
    System.String[] - sorted, unique top-level property names.
#>
function Get-FabricSchemaProperty {
    [CmdletBinding(DefaultParameterSetName = 'Definition')]
    [OutputType([string[]])]
    param(
        [Parameter(Mandatory)]
        [string]$SpecName,

        [Parameter(Mandatory, ParameterSetName = 'Definition')]
        [string]$DefinitionName,

        [Parameter(Mandatory, ParameterSetName = 'Path')]
        [string]$Path,

        [Parameter(Mandatory, ParameterSetName = 'Path')]
        [string]$Method,

        [Parameter()]
        [string]$CacheRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) '..\.api-specs-cache' | Resolve-Path -ErrorAction SilentlyContinue)
    )

    if (-not $CacheRoot -or -not (Test-Path $CacheRoot)) {
        # Fall back to the well-known absolute location used by this repo.
        $CacheRoot = 'S:\fabric-toolbox\tools\.api-specs-cache'
    }

    # ---- Fallback registry: cache-gap fills sourced from the public Fabric REST API spec.
    # These definitions are REFERENCED by cached specs but their target files were not
    # captured into the flat cache (no common/ dir, empty platform definitions).
    if (-not $script:FabricKnownDefinitions) {
        $script:FabricKnownDefinitions = @{
            # common/definitions.json#/definitions/Item  (shared Fabric item base)
            'Item'      = @('id', 'displayName', 'description', 'type', 'workspaceId')
            # platform List Capacities item  ( GET /capacities )
            'Capacity'  = @('id', 'displayName', 'sku', 'region', 'state')
            # platform List Workspaces item  ( GET /workspaces )
            'Workspace' = @('id', 'displayName', 'description', 'type', 'capacityId')
        }
    }

    # ---- JSON document cache (per process) ------------------------------------------
    if (-not $script:FabricSpecDocCache) {
        $script:FabricSpecDocCache = @{}
    }

    function Get-SpecDocument {
        param([string]$Spec)

        if ($script:FabricSpecDocCache.ContainsKey($Spec)) {
            return $script:FabricSpecDocCache[$Spec]
        }

        $candidates = @(
            (Join-Path $CacheRoot "$Spec.definitions.json"),
            (Join-Path $CacheRoot "$Spec.swagger.json")
        )

        $doc = $null
        foreach ($file in $candidates) {
            if (-not (Test-Path $file)) { continue }
            try {
                $text = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
                $parsed = $text | ConvertFrom-Json
            }
            catch {
                Write-Warning "Get-FabricSchemaProperty: failed to parse '$file': $($_.Exception.Message)"
                continue
            }
            # Prefer whichever file actually carries a populated .definitions section.
            if ($parsed.PSObject.Properties.Name -contains 'definitions' -and $parsed.definitions -and
                $parsed.definitions.PSObject.Properties.Count -gt 0) {
                $doc = $parsed
                break
            }
            if (-not $doc) { $doc = $parsed }
        }

        $script:FabricSpecDocCache[$Spec] = $doc
        return $doc
    }

    # Map a $ref string to a (Spec, DefinitionName) pair.
    function Resolve-RefTarget {
        param([string]$CurrentSpec, [string]$Ref)

        $defName = ($Ref -split '/definitions/')[-1]
        $defName = ($defName -split '#')[-1].Trim('/')

        $filePart = ($Ref -split '#')[0]

        $targetSpec = $CurrentSpec
        if ($filePart) {
            $lower = $filePart.ToLowerInvariant()
            if ($lower -match 'common') { $targetSpec = 'common' }
            elseif ($lower -match 'platform') { $targetSpec = 'platform' }
            elseif ($lower -match '^\.?/?definitions\.json$') { $targetSpec = $CurrentSpec }
            else {
                # Best-effort: derive a spec token from the file name.
                $leaf = [System.IO.Path]::GetFileNameWithoutExtension($filePart)
                $leaf = $leaf -replace '_?definitions$', ''
                if ($leaf) { $targetSpec = $leaf } else { $targetSpec = $CurrentSpec }
            }
        }

        [pscustomobject]@{ Spec = $targetSpec; Definition = $defName }
    }

    # Collect top-level property names from a definition, following allOf + $ref.
    function Get-DefinitionProperty {
        param([string]$Spec, [string]$DefName, [System.Collections.Generic.HashSet[string]]$Visited)

        $key = "$Spec::$DefName"
        if (-not $Visited.Add($key)) { return @() }

        $doc = Get-SpecDocument -Spec $Spec
        $def = $null
        if ($doc -and ($doc.PSObject.Properties.Name -contains 'definitions') -and $doc.definitions -and
            ($doc.definitions.PSObject.Properties.Name -contains $DefName)) {
            $def = $doc.definitions.$DefName
        }

        if (-not $def) {
            # Cache gap - consult the fallback registry.
            if ($script:FabricKnownDefinitions.ContainsKey($DefName)) {
                return $script:FabricKnownDefinitions[$DefName]
            }
            Write-Warning "Get-FabricSchemaProperty: could not resolve definition '$DefName' in spec '$Spec' (skipped)."
            return @()
        }

        $names = [System.Collections.Generic.List[string]]::new()

        if (($def.PSObject.Properties.Name -contains 'properties') -and $def.properties) {
            foreach ($p in $def.properties.PSObject.Properties.Name) { $names.Add($p) }
        }

        if (($def.PSObject.Properties.Name -contains 'allOf') -and $def.allOf) {
            foreach ($entry in $def.allOf) {
                if ($entry.PSObject.Properties.Name -contains '$ref' -and $entry.'$ref') {
                    $target = Resolve-RefTarget -CurrentSpec $Spec -Ref $entry.'$ref'
                    foreach ($n in (Get-DefinitionProperty -Spec $target.Spec -DefName $target.Definition -Visited $Visited)) {
                        $names.Add($n)
                    }
                }
                elseif (($entry.PSObject.Properties.Name -contains 'properties') -and $entry.properties) {
                    foreach ($p in $entry.properties.PSObject.Properties.Name) { $names.Add($p) }
                }
            }
        }

        return $names
    }

    # Resolve the item definition behind a wrapper (list) schema: properties.value.items.$ref
    function Resolve-ItemDefinition {
        param([string]$Spec, [string]$WrapperDefName, [System.Collections.Generic.HashSet[string]]$Visited)

        $doc = Get-SpecDocument -Spec $Spec
        $wrapper = $null
        if ($doc -and $doc.definitions -and ($doc.definitions.PSObject.Properties.Name -contains $WrapperDefName)) {
            $wrapper = $doc.definitions.$WrapperDefName
        }
        if (-not $wrapper) { return $null }

        if ($wrapper.properties -and ($wrapper.properties.PSObject.Properties.Name -contains 'value') -and
            $wrapper.properties.value.items -and ($wrapper.properties.value.items.PSObject.Properties.Name -contains '$ref')) {
            return Resolve-RefTarget -CurrentSpec $Spec -Ref $wrapper.properties.value.items.'$ref'
        }
        # Not a list wrapper - treat the given name itself as the item.
        return [pscustomobject]@{ Spec = $Spec; Definition = $WrapperDefName }
    }

    $visited = [System.Collections.Generic.HashSet[string]]::new()

    if ($PSCmdlet.ParameterSetName -eq 'Path') {
        $doc = Get-SpecDocument -Spec $SpecName
        if (-not $doc -or -not $doc.paths -or -not ($doc.paths.PSObject.Properties.Name -contains $Path)) {
            Write-Warning "Get-FabricSchemaProperty: path '$Path' not found in spec '$SpecName'."
            return @()
        }
        $op = $doc.paths.$Path.$Method
        if (-not $op) {
            Write-Warning "Get-FabricSchemaProperty: method '$Method' not found for path '$Path'."
            return @()
        }
        $schema = $op.responses.'200'.schema
        if (-not $schema) {
            Write-Warning "Get-FabricSchemaProperty: no 200 response schema for '$Method $Path'."
            return @()
        }

        # Response schema may be a $ref to a wrapper, or an inline object with value.items.
        $itemTarget = $null
        if ($schema.PSObject.Properties.Name -contains '$ref') {
            $wrapTarget = Resolve-RefTarget -CurrentSpec $SpecName -Ref $schema.'$ref'
            $itemTarget = Resolve-ItemDefinition -Spec $wrapTarget.Spec -WrapperDefName $wrapTarget.Definition -Visited $visited
        }
        elseif ($schema.properties -and ($schema.properties.PSObject.Properties.Name -contains 'value') -and
            $schema.properties.value.items -and ($schema.properties.value.items.PSObject.Properties.Name -contains '$ref')) {
            $itemTarget = Resolve-RefTarget -CurrentSpec $SpecName -Ref $schema.properties.value.items.'$ref'
        }

        if (-not $itemTarget) {
            Write-Warning "Get-FabricSchemaProperty: could not locate an item definition for '$Method $Path'."
            return @()
        }
        $props = Get-DefinitionProperty -Spec $itemTarget.Spec -DefName $itemTarget.Definition -Visited $visited
    }
    else {
        $props = Get-DefinitionProperty -Spec $SpecName -DefName $DefinitionName -Visited $visited
    }

    return ($props | Sort-Object -Unique)
}
