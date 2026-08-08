#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for New-FabricItemSchedule: POST .../jobs/{jobType}/schedules,
    request body, WorkspaceName enrichment + type by default, -Raw untouched,
    -WhatIf makes no call.
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
        [pscustomobject]@{ id = 'sched-1'; enabled = $true }
    }

    $script:config = @{ type = 'Cron'; startDateTime = '2024-04-28T00:00:00'; endDateTime = '2024-04-30T23:59:00'; localTimeZoneId = 'Central Standard Time'; interval = 10 }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'New-FabricItemSchedule' -Tag 'UnitTests' {

    It 'POSTs to the schedules endpoint' {
        $null = New-FabricItemSchedule -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook' -Enabled $true -Configuration $script:config -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/items/item-1/jobs/RunNotebook/schedules'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'sends enabled and configuration in the body' {
        $null = New-FabricItemSchedule -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook' -Enabled $true -Configuration $script:config -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.enabled            | Should -Be $true
        $b.configuration.type | Should -Be 'Cron'
    }

    It 'enriches with WorkspaceName + type by default (originals preserved)' {
        $r = New-FabricItemSchedule -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook' -Enabled $true -Configuration $script:config -Confirm:$false
        $r.WorkspaceName          | Should -Be 'WS'
        $r.PSObject.TypeNames[0]  | Should -Be 'MicrosoftFabric.ItemSchedule'
        $r.id                     | Should -Be 'sched-1'
    }

    It '-Raw returns the untouched response' {
        $r = New-FabricItemSchedule -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook' -Enabled $true -Configuration $script:config -Raw -Confirm:$false
        $r.PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r.PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.ItemSchedule'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        New-FabricItemSchedule -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook' -Enabled $true -Configuration $script:config -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
