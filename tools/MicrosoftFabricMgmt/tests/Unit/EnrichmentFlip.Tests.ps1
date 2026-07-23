#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Verifies the -Raw / enrichment flip:
      default  -> full object + resolved-name NoteProperties + PSTypeName
      -Raw     -> untouched API response (no added names, no type decoration)
#>

BeforeAll {
    $BuiltModule    = "$PSScriptRoot/../../output/module/MicrosoftFabricMgmt"
    $ModuleVersion  = (Get-ChildItem $BuiltModule -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
    Import-Module (Join-Path $BuiltModule "$ModuleVersion/MicrosoftFabricMgmt.psd1") -Force -ErrorAction Stop

    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricWorkspaceName           { 'WS-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricCapacityIdFromWorkspace { 'cap-1' }
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricCapacityName            { 'Cap-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAuthCheck                 { }
    Mock -ModuleName MicrosoftFabricMgmt Write-FabricLog                        { }
}

Describe "Select-FabricResource enrichment flip" -Tag "UnitTests" {

    It "Default output is enriched with WorkspaceName, CapacityName and PSTypeName" {
        InModuleScope MicrosoftFabricMgmt {
            $items = @([pscustomobject]@{ id = '1'; displayName = 'LH'; workspaceId = 'ws-1' })
            $r = Select-FabricResource -InputObject $items -ResourceType 'Lakehouse' -TypeName 'MicrosoftFabric.Lakehouse'
            $r[0].WorkspaceName          | Should -Be 'WS-Name'
            $r[0].CapacityName           | Should -Be 'Cap-Name'
            $r[0].PSObject.TypeNames[0]  | Should -Be 'MicrosoftFabric.Lakehouse'
            # Original API properties are preserved
            $r[0].id                     | Should -Be '1'
            $r[0].workspaceId            | Should -Be 'ws-1'
        }
    }

    It "-Raw returns the untouched object (no names, no type decoration)" {
        InModuleScope MicrosoftFabricMgmt {
            $items = @([pscustomobject]@{ id = '1'; displayName = 'LH'; workspaceId = 'ws-1' })
            $r = Select-FabricResource -InputObject $items -ResourceType 'Lakehouse' -TypeName 'MicrosoftFabric.Lakehouse' -Raw
            $r[0].PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
            $r[0].PSObject.Properties.Name | Should -Not -Contain 'CapacityName'
            $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.Lakehouse'
        }
    }

    It "Default output flattens buried properties.* scalars to top-level fields" {
        InModuleScope MicrosoftFabricMgmt {
            $items = @([pscustomobject]@{
                    id         = '1'; displayName = 'LH'; workspaceId = 'ws-1'
                    properties = [pscustomobject]@{
                        oneLakeTablesPath     = 'abfss://ws/lh/Tables'
                        sqlEndpointProperties = [pscustomobject]@{ connectionString = 'srv.fabric' }
                    }
                })
            $r = Select-FabricResource -InputObject $items -ResourceType 'Lakehouse' -TypeName 'MicrosoftFabric.Lakehouse'
            $r[0].OneLakeTablesPath           | Should -Be 'abfss://ws/lh/Tables'
            $r[0].SqlEndpointConnectionString | Should -Be 'srv.fabric'
            # Nested object still intact.
            $r[0].properties.sqlEndpointProperties.connectionString | Should -Be 'srv.fabric'
        }
    }

    It "-Raw does NOT flatten (buried scalars stay nested only)" {
        InModuleScope MicrosoftFabricMgmt {
            $items = @([pscustomobject]@{
                    id         = '1'; displayName = 'LH'; workspaceId = 'ws-1'
                    properties = [pscustomobject]@{ sqlEndpointProperties = [pscustomobject]@{ connectionString = 'srv.fabric' } }
                })
            $r = Select-FabricResource -InputObject $items -ResourceType 'Lakehouse' -TypeName 'MicrosoftFabric.Lakehouse' -Raw
            $r[0].PSObject.Properties.Name | Should -Not -Contain 'SqlEndpointConnectionString'
        }
    }
}

Describe "Get-FabricWorkspaceRoleAssignment enrichment" -Tag "UnitTests" {

    BeforeAll {
        Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
            @([pscustomobject]@{
                id        = 'ra-1'
                role      = 'Admin'
                principal = [pscustomobject]@{
                    id           = 'p-1'
                    displayName  = 'Alice'
                    type         = 'User'
                    userDetails  = [pscustomobject]@{ userPrincipalName = 'alice@contoso.com' }
                    groupDetails = [pscustomobject]@{ groupType = 'SecurityGroup' }
                }
            })
        }
        InModuleScope MicrosoftFabricMgmt {
            $script:FabricAuthContext = [pscustomobject]@{
                BaseUrl       = 'https://api.fabric.microsoft.com/v1'
                FabricHeaders = @{ Authorization = 'Bearer test' }
            }
        }
    }

    It "Default preserves nested principal AND adds flattened fields + names + type" {
        $r = Get-FabricWorkspaceRoleAssignment -WorkspaceId 'ws-1'
        $r[0].principal.groupDetails.groupType | Should -Be 'SecurityGroup'   # previously discarded
        $r[0].DisplayName                      | Should -Be 'Alice'
        $r[0].UserPrincipalName                | Should -Be 'alice@contoso.com'
        $r[0].Role                             | Should -Be 'Admin'
        $r[0].WorkspaceName                    | Should -Be 'WS-Name'
        $r[0].CapacityName                     | Should -Be 'Cap-Name'
        $r[0].PSObject.TypeNames[0]            | Should -Be 'MicrosoftFabric.WorkspaceRoleAssignment'
    }

    It "-Raw returns untouched API object (principal preserved, no flattened fields, no type)" {
        $r = Get-FabricWorkspaceRoleAssignment -WorkspaceId 'ws-1' -Raw
        $r[0].principal.displayName            | Should -Be 'Alice'
        $r[0].PSObject.Properties.Name         | Should -Not -Contain 'DisplayName'
        $r[0].PSObject.Properties.Name         | Should -Not -Contain 'WorkspaceName'
        $r[0].PSObject.TypeNames[0]            | Should -Not -Be 'MicrosoftFabric.WorkspaceRoleAssignment'
    }
}
