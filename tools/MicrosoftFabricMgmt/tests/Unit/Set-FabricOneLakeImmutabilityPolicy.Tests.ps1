#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Set-FabricOneLakeImmutabilityPolicy:
    POST /workspaces/{id}/onelake/settings/modifyImmutabilityPolicy, scope + retentionDays body,
    -Raw untouched, -WhatIf makes no call.
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
        [pscustomobject]@{ status = 'ok' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Set-FabricOneLakeImmutabilityPolicy' -Tag 'UnitTests' {

    It 'POSTs the modifyImmutabilityPolicy endpoint' {
        $null = Set-FabricOneLakeImmutabilityPolicy -WorkspaceId 'ws-1' -Scope 'DiagnosticLogs' -RetentionDays 30 -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/onelake/settings/modifyImmutabilityPolicy'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'sends scope and retentionDays in the body' {
        $null = Set-FabricOneLakeImmutabilityPolicy -WorkspaceId 'ws-1' -Scope 'DiagnosticLogs' -RetentionDays 30 -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.scope         | Should -Be 'DiagnosticLogs'
        $b.retentionDays | Should -Be 30
    }

    It 'rejects an out-of-range retentionDays' {
        { Set-FabricOneLakeImmutabilityPolicy -WorkspaceId 'ws-1' -Scope 'DiagnosticLogs' -RetentionDays 0 -Confirm:$false } | Should -Throw
    }

    It '-Raw returns the untouched response' {
        $r = Set-FabricOneLakeImmutabilityPolicy -WorkspaceId 'ws-1' -Scope 'DiagnosticLogs' -RetentionDays 30 -Raw -Confirm:$false
        $r.status | Should -Be 'ok'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Set-FabricOneLakeImmutabilityPolicy -WorkspaceId 'ws-1' -Scope 'DiagnosticLogs' -RetentionDays 30 -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
