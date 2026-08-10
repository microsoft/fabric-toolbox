#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Set-FabricAdminInformationProtectionLabel.
    Verifies the POST Power BI admin informationprotection setLabels endpoint and -WhatIf suppression.
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

Describe 'Set-FabricAdminInformationProtectionLabel' -Tag 'UnitTests' {

    It 'calls POST on the Power BI admin informationprotection setLabels endpoint' {
        $null = Set-FabricAdminInformationProtectionLabel -ArtifactId 'art-1' -ArtifactType 'Dashboard' -LabelId 'lbl-1' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/informationprotection/setLabels'
        $global:__capMethod | Should -Be 'Post'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        $null = Set-FabricAdminInformationProtectionLabel -ArtifactId 'art-1' -ArtifactType 'Dashboard' -LabelId 'lbl-1' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
