#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Update-FabricItemSchedule: PATCH .../schedules/{scheduleId},
    partial body, WorkspaceName enrichment + type, -Raw untouched, -WhatIf no call.
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
        $global:__capBody   = $Body
        [pscustomobject]@{ id = 'sched-1'; enabled = $false }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Update-FabricItemSchedule' -Tag 'UnitTests' {

    It 'PATCHes the schedule-by-id endpoint' {
        $null = Update-FabricItemSchedule -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook' -ScheduleId 'sched-1' -Enabled $false -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/items/item-1/jobs/RunNotebook/schedules/sched-1'
        $global:__capMethod | Should -Be 'Patch'
    }

    It 'includes only supplied fields in the body' {
        $null = Update-FabricItemSchedule -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook' -ScheduleId 'sched-1' -Enabled $false -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.enabled | Should -Be $false
        $b.PSObject.Properties.Name | Should -Not -Contain 'configuration'
    }

    It 'includes configuration when supplied' {
        $cfg = @{ type = 'Daily'; times = @('09:00') }
        $null = Update-FabricItemSchedule -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook' -ScheduleId 'sched-1' -Configuration $cfg -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.configuration.type | Should -Be 'Daily'
    }

    It 'enriches with WorkspaceName + type by default (originals preserved)' {
        $r = Update-FabricItemSchedule -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook' -ScheduleId 'sched-1' -Enabled $false -Confirm:$false
        $r.WorkspaceName         | Should -Be 'WS'
        $r.PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.ItemSchedule'
        $r.id                    | Should -Be 'sched-1'
    }

    It '-Raw returns the untouched response' {
        $r = Update-FabricItemSchedule -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook' -ScheduleId 'sched-1' -Enabled $false -Raw -Confirm:$false
        $r.PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r.PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.ItemSchedule'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Update-FabricItemSchedule -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook' -ScheduleId 'sched-1' -Enabled $false -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
