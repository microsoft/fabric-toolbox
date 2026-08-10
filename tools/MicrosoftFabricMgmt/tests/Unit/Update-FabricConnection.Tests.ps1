#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Update-FabricConnection: PATCH /connections/{id}, request body,
    GatewayName enrichment + type by default, -Raw untouched, -WhatIf makes no call.
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
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricGatewayName { 'GW-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        $global:__capBody   = $Body
        [pscustomobject]@{ id = 'conn-1'; displayName = 'Renamed'; connectivityType = 'ShareableCloud'; gatewayId = 'gw-1' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Update-FabricConnection' -Tag 'UnitTests' {

    It 'PATCHes the connection-by-id endpoint' {
        $null = Update-FabricConnection -ConnectionId 'conn-1' -ConnectivityType 'ShareableCloud' -PrivacyLevel 'Private' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/connections/conn-1'
        $global:__capMethod | Should -Be 'Patch'
    }

    It 'sends connectivityType and only the supplied optional fields in the body' {
        $null = Update-FabricConnection -ConnectionId 'conn-1' -ConnectivityType 'ShareableCloud' -ConnectionName 'Renamed' -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.connectivityType | Should -Be 'ShareableCloud'
        $b.displayName      | Should -Be 'Renamed'
        $b.PSObject.Properties.Name | Should -Not -Contain 'privacyLevel'
    }

    It 'enriches with GatewayName + type by default' {
        $r = Update-FabricConnection -ConnectionId 'conn-1' -ConnectivityType 'ShareableCloud' -Confirm:$false
        $r.GatewayName           | Should -Be 'GW-Name'
        $r.PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.Connection'
    }

    It '-Raw returns the untouched response' {
        $r = Update-FabricConnection -ConnectionId 'conn-1' -ConnectivityType 'ShareableCloud' -Raw -Confirm:$false
        $r.PSObject.Properties.Name | Should -Not -Contain 'GatewayName'
        $r.PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.Connection'
    }

    It 'accepts ConnectionId from the pipeline' {
        $null = [pscustomobject]@{ id = 'conn-9' } | Update-FabricConnection -ConnectivityType 'ShareableCloud' -Confirm:$false
        $global:__capUri | Should -Be 'https://api.fabric.microsoft.com/v1/connections/conn-9'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Update-FabricConnection -ConnectionId 'conn-1' -ConnectivityType 'ShareableCloud' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
