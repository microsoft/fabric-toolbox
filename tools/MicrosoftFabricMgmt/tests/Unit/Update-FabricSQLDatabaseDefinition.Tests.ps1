#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Update-FabricSQLDatabaseDefinition.
    Verifies the POST sqlDatabases updateDefinition endpoint and -WhatIf suppression.
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

Describe 'Update-FabricSQLDatabaseDefinition' -Tag 'UnitTests' {

    BeforeAll {
        $script:def = @{ parts = @(@{ path = 'sqldatabase.json'; payload = 'e30='; payloadType = 'InlineBase64' }) }
    }

    It 'calls POST on the sqlDatabases updateDefinition endpoint' {
        $null = Update-FabricSQLDatabaseDefinition -WorkspaceId 'ws-1' -SQLDatabaseId 'db-1' -Definition $script:def -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/sqlDatabases/db-1/updateDefinition'
        $global:__capMethod | Should -Be 'Post'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        $null = Update-FabricSQLDatabaseDefinition -WorkspaceId 'ws-1' -SQLDatabaseId 'db-1' -Definition $script:def -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
