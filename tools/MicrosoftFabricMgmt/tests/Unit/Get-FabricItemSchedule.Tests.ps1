#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricItemSchedule: GET list + by-id endpoints,
    WorkspaceName enrichment + type by default, -Raw untouched.
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
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricWorkspaceName { 'WS' }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        @([pscustomobject]@{ id = 'sched-1'; enabled = $true })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricItemSchedule' -Tag 'UnitTests' {

    It 'calls GET on the schedules list endpoint' {
        $null = Get-FabricItemSchedule -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/items/item-1/jobs/RunNotebook/schedules'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'appends the schedule id when -ScheduleId is supplied' {
        $null = Get-FabricItemSchedule -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook' -ScheduleId 'sched-9'
        $global:__capUri | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/items/item-1/jobs/RunNotebook/schedules/sched-9'
    }

    It 'enriches with WorkspaceName and type by default (originals preserved)' {
        $r = Get-FabricItemSchedule -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook'
        $r[0].WorkspaceName         | Should -Be 'WS'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.ItemSchedule'
        $r[0].id                    | Should -Be 'sched-1'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricItemSchedule -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.ItemSchedule'
    }
}
