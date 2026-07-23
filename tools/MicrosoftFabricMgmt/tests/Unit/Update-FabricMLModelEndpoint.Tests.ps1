#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Update-FabricMLModelEndpoint: PATCH endpoint URI, request body,
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
        [pscustomobject]@{ defaultVersionName = '3'; defaultVersionAssignmentBehavior = 'StaticallyConfigured' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Update-FabricMLModelEndpoint' -Tag 'UnitTests' {

    It 'PATCHes the endpoint URI (lowercase mlmodels)' {
        $null = Update-FabricMLModelEndpoint -WorkspaceId 'ws-1' -MLModelId 'model-1' -DefaultVersionName '3' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/mlmodels/model-1/endpoint'
        $global:__capMethod | Should -Be 'Patch'
    }

    It 'sends defaultVersionName and defaultVersionAssignmentBehavior in the body' {
        $null = Update-FabricMLModelEndpoint -WorkspaceId 'ws-1' -MLModelId 'model-1' -DefaultVersionName '3' -DefaultVersionAssignmentBehavior 'StaticallyConfigured' -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.defaultVersionName               | Should -Be '3'
        $b.defaultVersionAssignmentBehavior | Should -Be 'StaticallyConfigured'
    }

    It 'merges -Properties passthrough into the body' {
        $null = Update-FabricMLModelEndpoint -WorkspaceId 'ws-1' -MLModelId 'model-1' -Properties @{ extraField = 'x' } -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.extraField | Should -Be 'x'
    }

    It 'decorates with type by default' {
        $r = Update-FabricMLModelEndpoint -WorkspaceId 'ws-1' -MLModelId 'model-1' -DefaultVersionName '3' -Confirm:$false
        $r.PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.MLModelEndpoint'
    }

    It '-Raw returns the untouched response' {
        $r = Update-FabricMLModelEndpoint -WorkspaceId 'ws-1' -MLModelId 'model-1' -DefaultVersionName '3' -Raw -Confirm:$false
        $r.PSObject.TypeNames[0] | Should -Not -Be 'MicrosoftFabric.MLModelEndpoint'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Update-FabricMLModelEndpoint -WorkspaceId 'ws-1' -MLModelId 'model-1' -DefaultVersionName '3' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
