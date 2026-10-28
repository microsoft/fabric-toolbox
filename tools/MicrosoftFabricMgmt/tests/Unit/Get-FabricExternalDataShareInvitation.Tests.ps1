#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricExternalDataShareInvitation: GET on the top-level
    invitation endpoint with required providerTenantId query, type by default, -Raw untouched.
#>

BeforeAll {
    Get-Module MicrosoftFabricMgmt | Remove-Module -Force -ErrorAction SilentlyContinue
    $BuiltModule   = "$PSScriptRoot/../../output/module/MicrosoftFabricMgmt"
    $ModuleVersion = (Get-ChildItem $BuiltModule -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1).Name
    Import-Module (Join-Path $BuiltModule "$ModuleVersion/MicrosoftFabricMgmt.psd1") -Force -ErrorAction Stop

    InModuleScope MicrosoftFabricMgmt {
        $script:FabricAuthContext = [pscustomobject]@{
            BaseUrl       = 'https://api.fabric.microsoft.com/v1'
            FabricHeaders = @{ Authorization = 'Bearer test' }
        }
    }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAuthCheck {}
    Mock -ModuleName MicrosoftFabricMgmt Write-FabricLog {}
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        [pscustomobject]@{ id = 'inv-1'; status = 'Pending' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricExternalDataShareInvitation' -Tag 'UnitTests' {

    It 'calls GET on the invitation endpoint with the providerTenantId query' {
        $null = Get-FabricExternalDataShareInvitation -InvitationId 'inv-1' -ProviderTenantId 'tenant-1'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/externalDataShares/invitations/inv-1?providerTenantId=tenant-1'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'decorates the response with the invitation type by default' {
        $r = Get-FabricExternalDataShareInvitation -InvitationId 'inv-1' -ProviderTenantId 'tenant-1'
        $r.PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.ExternalDataShareInvitation'
        $r.id                    | Should -Be 'inv-1'
    }

    It '-Raw returns the untouched response (no type)' {
        $r = Get-FabricExternalDataShareInvitation -InvitationId 'inv-1' -ProviderTenantId 'tenant-1' -Raw
        $r.PSObject.TypeNames[0] | Should -Not -Be 'MicrosoftFabric.ExternalDataShareInvitation'
    }
}
