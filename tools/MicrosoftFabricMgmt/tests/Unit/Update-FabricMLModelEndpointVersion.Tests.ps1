#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Update-FabricMLModelEndpointVersion: PATCH version URI, request body,
    type by default, -Raw untouched, -WhatIf makes no call.
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
        [pscustomobject]@{ versionName = '3'; scaleRule = 'AllowScaleToZero' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Update-FabricMLModelEndpointVersion' -Tag 'UnitTests' {

    It 'PATCHes the version URI (lowercase mlmodels)' {
        $null = Update-FabricMLModelEndpointVersion -WorkspaceId 'ws-1' -MLModelId 'model-1' -VersionName '3' -ScaleRule 'AllowScaleToZero' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/mlmodels/model-1/endpoint/versions/3'
        $global:__capMethod | Should -Be 'Patch'
    }

    It 'sends scaleRule in the body' {
        $null = Update-FabricMLModelEndpointVersion -WorkspaceId 'ws-1' -MLModelId 'model-1' -VersionName '3' -ScaleRule 'AlwaysOn' -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.scaleRule | Should -Be 'AlwaysOn'
    }

    It 'merges -Properties passthrough into the body' {
        $null = Update-FabricMLModelEndpointVersion -WorkspaceId 'ws-1' -MLModelId 'model-1' -VersionName '3' -Properties @{ extraField = 'x' } -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.extraField | Should -Be 'x'
    }

    It 'decorates with type by default' {
        $r = Update-FabricMLModelEndpointVersion -WorkspaceId 'ws-1' -MLModelId 'model-1' -VersionName '3' -ScaleRule 'AlwaysOn' -Confirm:$false
        $r.PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.MLModelEndpointVersion'
    }

    It '-Raw returns the untouched response' {
        $r = Update-FabricMLModelEndpointVersion -WorkspaceId 'ws-1' -MLModelId 'model-1' -VersionName '3' -ScaleRule 'AlwaysOn' -Raw -Confirm:$false
        $r.PSObject.TypeNames[0] | Should -Not -Be 'MicrosoftFabric.MLModelEndpointVersion'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Update-FabricMLModelEndpointVersion -WorkspaceId 'ws-1' -MLModelId 'model-1' -VersionName '3' -ScaleRule 'AlwaysOn' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
