#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for New-FabricAdminEncryptionKey.
    Asserts the Power BI admin tenantKeys endpoint + POST method, ShouldProcess (-WhatIf)
    support, and that the created object is returned.
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
        [pscustomobject]@{ id = 'key-1'; name = 'Production Key' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'New-FabricAdminEncryptionKey' -Tag 'UnitTests' {

    It 'calls POST on the admin tenantKeys endpoint' {
        $null = New-FabricAdminEncryptionKey -KeyName 'Production Key' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/tenantKeys'
        $global:__capMethod | Should -Be 'Post'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        $null = New-FabricAdminEncryptionKey -KeyName 'Production Key' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }

    It 'returns the created object' {
        $r = New-FabricAdminEncryptionKey -KeyName 'Production Key' -Confirm:$false
        $r.id | Should -Be 'key-1'
    }
}
