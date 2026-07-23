#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Approve-FabricExternalDataShareInvitation: POST on the top-level
    invitation accept endpoint, verbatim body passthrough, -WhatIf makes no call.
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
        $global:__capBody   = $Body
        [pscustomobject]@{ id = 'eds-accepted' }
    }

    $script:acceptBody = @{ providerTenantId = 'tenant-1'; payload = @{ payloadType = 'ShortcutCreation' } }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Approve-FabricExternalDataShareInvitation' -Tag 'UnitTests' {

    It 'POSTs to the invitation accept endpoint' {
        $null = Approve-FabricExternalDataShareInvitation -InvitationId 'inv-1' -Body $script:acceptBody -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/externalDataShares/invitations/inv-1/accept'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'passes the accept body through verbatim' {
        $null = Approve-FabricExternalDataShareInvitation -InvitationId 'inv-1' -Body $script:acceptBody -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.providerTenantId    | Should -Be 'tenant-1'
        $b.payload.payloadType | Should -Be 'ShortcutCreation'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Approve-FabricExternalDataShareInvitation -InvitationId 'inv-1' -Body $script:acceptBody -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
