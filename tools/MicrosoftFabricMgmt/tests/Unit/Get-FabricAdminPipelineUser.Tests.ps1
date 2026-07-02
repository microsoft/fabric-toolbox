#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminPipelineUser.
    Verifies the Power BI admin pipeline-users endpoint + method, default enrichment
    (pipelineId context + type) and that -Raw returns the untouched response.
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
        @([pscustomobject]@{ displayName = 'Bob'; accessRight = 'Admin'; principalType = 'User' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminPipelineUser' -Tag 'UnitTests' {

    It 'calls GET on the admin pipeline users endpoint' {
        $null = Get-FabricAdminPipelineUser -PipelineId 'pl-1'
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/pipelines/pl-1/users'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with pipelineId context and type by default (originals preserved)' {
        $r = Get-FabricAdminPipelineUser -PipelineId 'pl-1'
        $r[0].pipelineId            | Should -Be 'pl-1'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminPipelineUser'
        $r[0].displayName           | Should -Be 'Bob'
        $r[0].accessRight           | Should -Be 'Admin'
    }

    It '-Raw returns the untouched response (no added context, no type)' {
        $r = Get-FabricAdminPipelineUser -PipelineId 'pl-1' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'pipelineId'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminPipelineUser'
        $r[0].displayName              | Should -Be 'Bob'
    }
}
