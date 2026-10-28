#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for New-FabricAnomalyDetector.
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
        [pscustomobject]@{ id = 'ad-new-1'; displayName = 'MyAnomalyDetector'; type = 'AnomalyDetector' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'New-FabricAnomalyDetector' -Tag 'UnitTests' {

    It 'calls POST on the workspace anomalydetectors endpoint' {
        $null = New-FabricAnomalyDetector -WorkspaceId 'ws-1' -AnomalyDetectorName 'MyAnomalyDetector' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/anomalydetectors'
        $global:__capMethod | Should -Be 'Post'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        $null = New-FabricAnomalyDetector -WorkspaceId 'ws-1' -AnomalyDetectorName 'MyAnomalyDetector' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }

    It 'returns the created object' {
        $r = New-FabricAnomalyDetector -WorkspaceId 'ws-1' -AnomalyDetectorName 'MyAnomalyDetector' -Confirm:$false
        $r.id | Should -Be 'ad-new-1'
    }
}
