#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Invoke-FabricGraphModelQuery.
    Asserts the Fabric GraphModels executeQuery endpoint (with the beta=true query
    parameter) + POST method, and that the query response is returned. This function does
    NOT support ShouldProcess.
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
        [pscustomobject]@{ results = @('row1', 'row2') }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Invoke-FabricGraphModelQuery' -Tag 'UnitTests' {

    It 'calls POST on the GraphModels executeQuery endpoint with beta=true' {
        $null = Invoke-FabricGraphModelQuery -WorkspaceId 'ws-1' -GraphModelId 'gm-1' -Query 'MATCH (n) RETURN n'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/GraphModels/gm-1/executeQuery?beta=true'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'returns the query response' {
        $r = Invoke-FabricGraphModelQuery -WorkspaceId 'ws-1' -GraphModelId 'gm-1' -Query 'MATCH (n) RETURN n'
        $r.results | Should -Contain 'row1'
    }
}
