#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Disable-FabricMLModelEndpointVersion: POST deactivate URI (-VersionName)
    and deactivateAll URI (-All), one-of enforcement, -WhatIf makes no call.
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
        [pscustomobject]@{ status = 'Deactivating' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Disable-FabricMLModelEndpointVersion' -Tag 'UnitTests' {

    It 'POSTs to the deactivate URI when -VersionName is supplied' {
        $null = Disable-FabricMLModelEndpointVersion -WorkspaceId 'ws-1' -MLModelId 'model-1' -VersionName '3' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/mlmodels/model-1/endpoint/versions/3/deactivate'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'POSTs to the deactivateAll URI when -All is supplied' {
        $null = Disable-FabricMLModelEndpointVersion -WorkspaceId 'ws-1' -MLModelId 'model-1' -All -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/mlmodels/model-1/endpoint/versions/deactivateAll'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'throws when neither -VersionName nor -All is supplied' {
        { Disable-FabricMLModelEndpointVersion -WorkspaceId 'ws-1' -MLModelId 'model-1' -Confirm:$false -ErrorAction Stop } | Should -Throw
    }

    It 'throws when both -VersionName and -All are supplied' {
        { Disable-FabricMLModelEndpointVersion -WorkspaceId 'ws-1' -MLModelId 'model-1' -VersionName '3' -All -Confirm:$false -ErrorAction Stop } | Should -Throw
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Disable-FabricMLModelEndpointVersion -WorkspaceId 'ws-1' -MLModelId 'model-1' -VersionName '3' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
