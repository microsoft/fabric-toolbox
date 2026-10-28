#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for New-FabricDigitalTwinBuilderFlow.
    Asserts the constructed Fabric endpoint + POST method, ShouldProcess (-WhatIf) support,
    and that the created object is returned.
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
        [pscustomobject]@{ id = 'created-1'; displayName = 'MyItem' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'New-FabricDigitalTwinBuilderFlow' -Tag 'UnitTests' {

    It 'calls POST on the workspace DigitalTwinBuilderFlows endpoint' {
        $null = New-FabricDigitalTwinBuilderFlow -WorkspaceId 'ws-1' -DigitalTwinBuilderFlowName 'MyItem' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/DigitalTwinBuilderFlows'
        $global:__capMethod | Should -Be 'Post'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        $null = New-FabricDigitalTwinBuilderFlow -WorkspaceId 'ws-1' -DigitalTwinBuilderFlowName 'MyItem' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }

    It 'returns the created object' {
        $r = New-FabricDigitalTwinBuilderFlow -WorkspaceId 'ws-1' -DigitalTwinBuilderFlowName 'MyItem' -Confirm:$false
        $r.id | Should -Be 'created-1'
    }
}
