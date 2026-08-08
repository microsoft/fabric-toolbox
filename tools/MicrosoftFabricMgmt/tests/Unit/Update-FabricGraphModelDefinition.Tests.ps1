#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Update-FabricGraphModelDefinition.
    Verifies the updateDefinition endpoint + POST method and that -WhatIf issues no API request.
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
        [pscustomobject]@{ id = 'gm-1' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Update-FabricGraphModelDefinition' -Tag 'UnitTests' {

    It 'calls POST on the GraphModels updateDefinition endpoint' {
        $definition = @{ parts = @() }
        $null = Update-FabricGraphModelDefinition -WorkspaceId 'ws-1' -GraphModelId 'gm-1' -Definition $definition -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/GraphModels/gm-1/updateDefinition'
        $global:__capMethod | Should -Be 'Post'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        $definition = @{ parts = @() }
        $null = Update-FabricGraphModelDefinition -WorkspaceId 'ws-1' -GraphModelId 'gm-1' -Definition $definition -WhatIf
        $global:__capUri | Should -Be $null
    }
}
