#Requires -Modules Pester
<#
    Schema round-trip PROPERTY-COMPLETENESS harness.

    Goal: for each covered Get-* function, prove that every property the API RESPONSE
    SCHEMA defines survives on the function's ENRICHED (default, non-Raw) output. i.e.
    the enrichment pipeline (Select-FabricResource / Add-FabricDatasetProperties) never
    trims or discards API-provided properties.

    How it works, per row:
      1. Resolve the schema's top-level item property names via Get-FabricSchemaProperty
         (walks the swagger cache: allOf + cross-file $ref resolution).
      2. Build a mock item exposing EVERY schema property (placeholder values).
      3. Mock the internal Invoke-FabricAPIRequest to return that item (already unwrapped,
         exactly as the real helper hands it back).
      4. Invoke the function with NO -Raw and assert the schema property set is a SUBSET
         of the output object's properties (enrichment may add extras - that's fine).
      5. Invoke WITH -Raw and assert (a) all schema props are still present and
         (b) none of the enrichment marker names were added (proves -Raw is untouched).

    ------------------------------------------------------------------------------------
    TO ADD A NEW FUNCTION: add ONE row to $script:CoverageTable below.
      Function   = the public cmdlet name
      Spec       = swagger-cache spec base name that owns the item definition
      Definition = the item definition name inside that spec
      Params     = hashtable of required parameters for the call
    That is the only change required - the It blocks are data-driven over the table.
    ------------------------------------------------------------------------------------
#>

BeforeDiscovery {
    # --- Data table: one row per covered function. Add a row to extend coverage. -------
    $wsId = '00000000-0000-0000-0000-000000000001'
    $script:CoverageTable = @(
        @{ Function = 'Get-FabricLakehouse'   ; Spec = 'lakehouse'   ; Definition = 'Lakehouse'   ; Params = @{ WorkspaceId = $wsId } }
        @{ Function = 'Get-FabricNotebook'    ; Spec = 'notebook'    ; Definition = 'Notebook'    ; Params = @{ WorkspaceId = $wsId } }
        @{ Function = 'Get-FabricWarehouse'   ; Spec = 'warehouse'   ; Definition = 'Warehouse'   ; Params = @{ WorkspaceId = $wsId } }
        @{ Function = 'Get-FabricEnvironment' ; Spec = 'environment' ; Definition = 'Environment' ; Params = @{ WorkspaceId = $wsId } }
        @{ Function = 'Get-FabricEventhouse'  ; Spec = 'eventhouse'  ; Definition = 'Eventhouse'  ; Params = @{ WorkspaceId = $wsId } }
        @{ Function = 'Get-FabricCapacity'    ; Spec = 'platform'    ; Definition = 'Capacity'    ; Params = @{} }
        @{ Function = 'Get-FabricWorkspace'   ; Spec = 'platform'    ; Definition = 'Workspace'   ; Params = @{} }
        @{ Function = 'Get-FabricAdminDataset'; Spec = 'powerbi'     ; Definition = 'AdminDataset'; Params = @{} }
    )
}

BeforeAll {
    # ...\MicrosoftFabricMgmt\tests\Unit\<file> -> up three levels to the module root.
    $repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))

    # Import the BUILT module (highest version).
    $moduleBase = Join-Path $repoRoot 'output\module\MicrosoftFabricMgmt'
    $versionDir = Get-ChildItem -Path $moduleBase -Directory |
        Sort-Object { [version]$_.Name } -Descending |
        Select-Object -First 1
    $manifest = Join-Path $versionDir.FullName 'MicrosoftFabricMgmt.psd1'
    Import-Module $manifest -Force -ErrorAction Stop

    # Load the schema helper.
    . (Join-Path $repoRoot 'scripts\Get-FabricSchemaProperty.ps1')

    # Names the enrichment pipeline may attach - these must NEVER appear on -Raw output,
    # and their presence on default output is proof enrichment ran.
    $script:EnrichmentMarkerNames = @('WorkspaceName', 'CapacityName', 'DatasetName')

    # The completeness check, factored so the negative control can reuse it verbatim.
    $script:CompletenessCheck = {
        param($OutputObject, [string[]]$ExpectedProperties)
        $have = @($OutputObject.PSObject.Properties.Name)
        $missing = @($ExpectedProperties | Where-Object { $_ -notin $have })
        if ($missing.Count -gt 0) {
            throw "Property-completeness FAILED - schema properties missing from output: $($missing -join ', ')"
        }
    }

    # Build a FRESH mock item exposing every expected property and stage it as the
    # return value of the mocked Invoke-FabricAPIRequest. Assigned in the test's script
    # scope - the mock scriptblock (defined here) reads $script:__mockApiReturn from the
    # same scope. A fresh object is built on every call so the in-place enrichment
    # (Add-Member) of one invocation cannot contaminate the next.
    function Set-MockApiReturn {
        param([string[]]$Properties)
        $idLike     = @('id', 'workspaceId', 'capacityId')
        $objectLike = @('properties', 'Encryption', 'users', 'upstreamDataflows', 'queryScaleOutSettings')
        $item = [ordered]@{}
        foreach ($p in $Properties) {
            if ($p -in $idLike)          { $item[$p] = [guid]::NewGuid().ToString() }
            elseif ($p -in $objectLike)  { $item[$p] = [pscustomobject]@{} }
            else                         { $item[$p] = "value-$p" }
        }
        # Invoke-FabricAPIRequest returns the UNWRAPPED item array.
        $script:__mockApiReturn = @([pscustomobject]$item)
    }

    # --- Common mocks (module scope). ---------------------------------------------------
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest { $script:__mockApiReturn }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAuthCheck {}
    Mock -ModuleName MicrosoftFabricMgmt Write-FabricLog {}
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricWorkspaceName { 'WS' }
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricCapacityName { 'CAP' }
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricCapacityIdFromWorkspace { 'cap-1' }
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricDatasetName { 'DS' }
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricGatewayName { 'GW' }

    # Auth context so URI builders / base-url reads succeed.
    InModuleScope MicrosoftFabricMgmt {
        $script:FabricAuthContext = [pscustomobject]@{
            BaseUrl       = 'https://api.fabric.microsoft.com/v1'
            # Non-empty: the mocked Invoke-FabricAPIRequest still enforces the real
            # command's [ValidateNotNullOrEmpty()] on -Headers.
            FabricHeaders = @{ Authorization = 'Bearer test-token' }
        }
    }
}

Describe 'Schema property-completeness (enriched round-trip)' {

    Context 'Schema resolution' {
        It 'resolves a non-empty top-level property set for <Function>' -TestCases $script:CoverageTable {
            param($Function, $Spec, $Definition, $Params)
            $expected = Get-FabricSchemaProperty -SpecName $Spec -DefinitionName $Definition
            $expected | Should -Not -BeNullOrEmpty -Because "$Function must have a discoverable response schema"
        }
    }

    Context 'Default (enriched) output preserves every schema property' {
        It '<Function> enriched output is a superset of the schema properties' -TestCases $script:CoverageTable {
            param($Function, $Spec, $Definition, $Params)

            $expected = Get-FabricSchemaProperty -SpecName $Spec -DefinitionName $Definition
            Set-MockApiReturn -Properties $expected

            $output = @(& $Function @Params)
            $output.Count | Should -BeGreaterThan 0 -Because "$Function should return the mocked item"
            $obj = $output[0]

            # THE COMPLETENESS ASSERTION: no schema property was trimmed.
            { & $script:CompletenessCheck $obj $expected } | Should -Not -Throw

            # And when the item is enrichable (carries a workspaceId/capacityId that the
            # pipeline resolves), prove enrichment actually RAN by requiring extra
            # properties beyond the schema set - i.e. this is a true enriched round-trip,
            # not a passthrough.
            if (('workspaceId' -in $expected) -or ('capacityId' -in $expected)) {
                @($obj.PSObject.Properties.Name).Count |
                    Should -BeGreaterThan $expected.Count -Because "$Function default output should be enriched"
            }
        }
    }

    Context '-Raw output is untouched (all schema props, no enrichment markers)' {
        It '<Function> -Raw keeps every schema property and adds no enrichment names' -TestCases $script:CoverageTable {
            param($Function, $Spec, $Definition, $Params)

            $expected = Get-FabricSchemaProperty -SpecName $Spec -DefinitionName $Definition
            Set-MockApiReturn -Properties $expected

            $output = @(& $Function @Params -Raw)
            $output.Count | Should -BeGreaterThan 0
            $obj = $output[0]

            # All schema properties still present.
            { & $script:CompletenessCheck $obj $expected } | Should -Not -Throw

            # And NONE of the enrichment marker names leaked onto the raw object.
            $have = @($obj.PSObject.Properties.Name)
            foreach ($marker in $script:EnrichmentMarkerNames) {
                # Only meaningful when the marker is not itself a real schema property.
                if ($marker -notin $expected) {
                    $marker | Should -Not -BeIn $have -Because "-Raw must not enrich $Function"
                }
            }
        }
    }
}

Describe 'Negative control - the harness detects trimming' {

    It 'the completeness check THROWS when a property is discarded' {
        # A deliberately-trimming stand-in: rebuild the API item into a trimmed object
        # that keeps only id + displayName (simulating a Get-* that discards properties).
        $schemaProps = Get-FabricSchemaProperty -SpecName 'lakehouse' -DefinitionName 'Lakehouse'
        $schemaProps.Count | Should -BeGreaterThan 2

        # Build a FULL item carrying every schema property (generated from the resolved
        # schema so this stays correct as the spec evolves), then a trimmed variant.
        $full = [ordered]@{}
        foreach ($p in $schemaProps) { $full[$p] = "value-$p" }
        $fullItem = [pscustomobject]$full
        $trimmingFunction = { param($ApiItem) [pscustomobject]@{ id = $ApiItem.id; displayName = $ApiItem.displayName } }
        $trimmedOutput = & $trimmingFunction $fullItem

        # Sanity: the full item passes; the trimmed one must FAIL the SAME check.
        { & $script:CompletenessCheck $fullItem $schemaProps } | Should -Not -Throw
        { & $script:CompletenessCheck $trimmedOutput $schemaProps } |
            Should -Throw -ExpectedMessage '*schema properties missing*'
    }
}
