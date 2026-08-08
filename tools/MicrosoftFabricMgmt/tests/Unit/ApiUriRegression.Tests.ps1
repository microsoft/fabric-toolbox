#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Regression suite for API URI construction.

    Guards against the class of bug where New-FabricAPIUri placed -Subresource
    BEFORE -ItemId, so callers passing a primary resource id via -ItemId produced
    e.g. /connections/roleAssignments/{id} instead of /connections/{id}/roleAssignments.

    These tests assert the ACTUAL request URI + HTTP method each function issues,
    validated against the Microsoft Fabric REST API spec paths.
#>

BeforeAll {
    $BuiltModule    = "$PSScriptRoot/../../output/module/MicrosoftFabricMgmt"
    $ModuleVersion  = (Get-ChildItem $BuiltModule -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
    $ModuleManifest = Join-Path $BuiltModule "$ModuleVersion/MicrosoftFabricMgmt.psd1"
    Import-Module $ModuleManifest -Force -ErrorAction Stop

    # Provide a deterministic base URL and stub auth so no real token is required.
    InModuleScope MicrosoftFabricMgmt {
        $script:FabricAuthContext = [PSCustomObject]@{
            BaseUrl       = 'https://api.fabric.microsoft.com/v1'
            FabricHeaders = @{ Authorization = 'Bearer test' }
        }
    }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAuthCheck { }
    Mock -ModuleName MicrosoftFabricMgmt Write-FabricLog { }
    # Capture the request by echoing the URI + method back as the "response".
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        [PSCustomObject]@{ Uri = $BaseURI; Method = $Method }
    }
}

Describe "New-FabricAPIUri path ordering" -Tag "UnitTests" {

    It "Places a subresource after the primary ResourceId (not before)" {
        InModuleScope MicrosoftFabricMgmt {
            $uri = New-FabricAPIUri -Resource 'connections' -ResourceId 'c1' -Subresource 'roleAssignments'
            $uri | Should -Be 'https://api.fabric.microsoft.com/v1/connections/c1/roleAssignments'
        }
    }

    It "Appends ItemId as the leaf segment after the subresource" {
        InModuleScope MicrosoftFabricMgmt {
            $uri = New-FabricAPIUri -Resource 'connections' -ResourceId 'c1' -Subresource 'roleAssignments' -ItemId 'ra1'
            $uri | Should -Be 'https://api.fabric.microsoft.com/v1/connections/c1/roleAssignments/ra1'
        }
    }

    It "Preserves the workspace/items pattern" {
        InModuleScope MicrosoftFabricMgmt {
            $uri = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId 'w1' -Subresource 'items' -ItemId 'i1'
            $uri | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/w1/items/i1'
        }
    }
}

Describe "Connection role assignment URIs" -Tag "UnitTests" {

    It "Add-FabricConnectionRoleAssignment -> POST /connections/{id}/roleAssignments" {
        $result = Add-FabricConnectionRoleAssignment -ConnectionId 'conn-1' -PrincipalId 'p1' -PrincipalType 'User' -ConnectionRole 'Owner'
        $result.Uri    | Should -Be 'https://api.fabric.microsoft.com/v1/connections/conn-1/roleAssignments'
        $result.Method | Should -Be 'Post'
    }

    It "Remove-FabricConnectionRoleAssignment -> DELETE /connections/{id}/roleAssignments/{raId}" {
        $result = Remove-FabricConnectionRoleAssignment -ConnectionId 'conn-1' -ConnectionRoleAssignmentId 'ra-1' -Confirm:$false
        $result.Uri    | Should -Be 'https://api.fabric.microsoft.com/v1/connections/conn-1/roleAssignments/ra-1'
        $result.Method | Should -Be 'Delete'
    }

    It "Update-FabricConnectionRoleAssignment -> PATCH /connections/{id}/roleAssignments/{raId}" {
        $result = Update-FabricConnectionRoleAssignment -ConnectionId 'conn-1' -ConnectionRoleAssignmentId 'ra-1' -ConnectionRole 'Owner' -Confirm:$false
        $result.Uri    | Should -Be 'https://api.fabric.microsoft.com/v1/connections/conn-1/roleAssignments/ra-1'
        $result.Method | Should -Be 'Patch'
    }
}

Describe "Admin sharing-links removal URIs" -Tag "UnitTests" {

    It "Remove-FabricSharingLinks -> POST /admin/items/removeAllSharingLinks" {
        $result = Remove-FabricSharingLinks -Confirm:$false
        $result.Uri    | Should -Be 'https://api.fabric.microsoft.com/v1/admin/items/removeAllSharingLinks'
        $result.Method | Should -Be 'Post'
    }

    It "Remove-FabricSharingLinksBulk -> POST /admin/items/bulkRemoveSharingLinks" {
        $result = Remove-FabricSharingLinksBulk -Items @(@{ id = 'i1'; type = 'Report' }) -Confirm:$false
        $result.Uri    | Should -Be 'https://api.fabric.microsoft.com/v1/admin/items/bulkRemoveSharingLinks'
        $result.Method | Should -Be 'Post'
    }
}
