#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Update-FabricSnowflakeDatabase.
    Verifies the PATCH snowflakeDatabases endpoint and -WhatIf suppression.
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

Describe 'Update-FabricSnowflakeDatabase' -Tag 'UnitTests' {

    It 'calls PATCH on the snowflakeDatabases item endpoint' {
        $null = Update-FabricSnowflakeDatabase -WorkspaceId 'ws-1' -SnowflakeDatabaseId 'sf-1' -SnowflakeDatabaseName 'NewName' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/snowflakeDatabases/sf-1'
        $global:__capMethod | Should -Be 'Patch'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        $null = Update-FabricSnowflakeDatabase -WorkspaceId 'ws-1' -SnowflakeDatabaseId 'sf-1' -SnowflakeDatabaseName 'NewName' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
