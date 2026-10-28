#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Update-FabricOntology.
    Verifies the PATCH ontologies endpoint and that -WhatIf suppresses the call.
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
        [pscustomobject]@{ ok = $true }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Update-FabricOntology' -Tag 'UnitTests' {

    It 'calls PATCH on the ontologies item endpoint' {
        $null = Update-FabricOntology -WorkspaceId 'ws-1' -OntologyId 'ont-1' -OntologyDisplayName 'New Name' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/ontologies/ont-1'
        $global:__capMethod | Should -Be 'Patch'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        $null = Update-FabricOntology -WorkspaceId 'ws-1' -OntologyId 'ont-1' -OntologyDisplayName 'New Name' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
