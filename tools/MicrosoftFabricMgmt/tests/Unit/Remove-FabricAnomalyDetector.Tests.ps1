#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Remove-FabricAnomalyDetector.
    Verifies the constructed Fabric endpoint + HTTP method and that -WhatIf issues no API call.
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
        $null
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Remove-FabricAnomalyDetector' -Tag 'UnitTests' {

    It 'calls DELETE on the workspace anomalydetectors item endpoint' {
        $global:__capUri = $null
        $null = Remove-FabricAnomalyDetector -WorkspaceId 'ws-1' -AnomalyDetectorId 'item-1' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/anomalydetectors/item-1'
        $global:__capMethod | Should -Be 'Delete'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Remove-FabricAnomalyDetector -WorkspaceId 'ws-1' -AnomalyDetectorId 'item-1' -WhatIf
        $global:__capUri | Should -Be $null
    }
}
