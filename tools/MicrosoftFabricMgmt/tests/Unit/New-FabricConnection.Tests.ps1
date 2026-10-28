#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for New-FabricConnection: POST /connections, request body,
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
        [pscustomobject]@{ id = 'conn-1'; displayName = 'MySql'; connectivityType = 'OnPremisesGateway'; gatewayId = 'gw-1' }
    }

    $script:details = @{ type = 'SQL'; creationMethod = 'SQL'; parameters = @(@{ dataType = 'Text'; name = 'server'; value = 'srv1' }) }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'New-FabricConnection' -Tag 'UnitTests' {

    It 'POSTs to the connections endpoint' {
        $null = New-FabricConnection -ConnectionName 'MySql' -ConnectivityType 'ShareableCloud' -ConnectionDetails $script:details -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/connections'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'sends connectivityType, displayName and connectionDetails in the body' {
        $null = New-FabricConnection -ConnectionName 'MySql' -ConnectivityType 'ShareableCloud' -ConnectionDetails $script:details -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.connectivityType  | Should -Be 'ShareableCloud'
        $b.displayName       | Should -Be 'MySql'
        $b.connectionDetails.type | Should -Be 'SQL'
    }

    It 'enriches with GatewayName + type by default (originals preserved)' {
        $r = New-FabricConnection -ConnectionName 'MySql' -ConnectivityType 'OnPremisesGateway' -GatewayId 'gw-1' -ConnectionDetails $script:details -Confirm:$false
        $r.GatewayName            | Should -Be 'GW-Name'
        $r.PSObject.TypeNames[0]  | Should -Be 'MicrosoftFabric.Connection'
        $r.id                     | Should -Be 'conn-1'
    }

    It '-Raw returns the untouched response' {
        $r = New-FabricConnection -ConnectionName 'MySql' -ConnectivityType 'OnPremisesGateway' -GatewayId 'gw-1' -ConnectionDetails $script:details -Raw -Confirm:$false
        $r.PSObject.Properties.Name | Should -Not -Contain 'GatewayName'
        $r.PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.Connection'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        New-FabricConnection -ConnectionName 'MySql' -ConnectivityType 'ShareableCloud' -ConnectionDetails $script:details -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
