#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Update-FabricDataPipelineDefinition: POST /updateDefinition endpoint,
    request body wraps supplied definition, -UpdateMetadata query param, -WhatIf no call.
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
        [pscustomobject]@{ status = 'Succeeded' }
    }

    $script:definition = @{ parts = @(@{ path = 'pipeline-content.json'; payload = 'abc'; payloadType = 'InlineBase64' }) }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Update-FabricDataPipelineDefinition' -Tag 'UnitTests' {

    It 'POSTs to the updateDefinition endpoint' {
        $null = Update-FabricDataPipelineDefinition -WorkspaceId 'ws-1' -DataPipelineId 'dp-1' -Definition $script:definition -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/dataPipelines/dp-1/updateDefinition'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'wraps the supplied definition in the request body' {
        $null = Update-FabricDataPipelineDefinition -WorkspaceId 'ws-1' -DataPipelineId 'dp-1' -Definition $script:definition -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.definition.parts[0].path        | Should -Be 'pipeline-content.json'
        $b.definition.parts[0].payloadType | Should -Be 'InlineBase64'
    }

    It 'appends updateMetadata=true when -UpdateMetadata is supplied' {
        $null = Update-FabricDataPipelineDefinition -WorkspaceId 'ws-1' -DataPipelineId 'dp-1' -Definition $script:definition -UpdateMetadata -Confirm:$false
        $global:__capUri | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/dataPipelines/dp-1/updateDefinition?updateMetadata=true'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Update-FabricDataPipelineDefinition -WorkspaceId 'ws-1' -DataPipelineId 'dp-1' -Definition $script:definition -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
