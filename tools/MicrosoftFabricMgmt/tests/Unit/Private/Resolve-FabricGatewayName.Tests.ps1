BeforeAll {
    # Import the built module
    $BuiltModule = "$PSScriptRoot/../../../output/module/MicrosoftFabricMgmt"
    $ModuleVersion = (Get-ChildItem $BuiltModule -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
    $ModuleManifest = Join-Path $BuiltModule "$ModuleVersion\MicrosoftFabricMgmt.psd1"
    Import-Module $ModuleManifest -Force -ErrorAction Stop
}

Describe 'Resolve-FabricGatewayName' {

    BeforeEach {
        # Clear cache
        InModuleScope MicrosoftFabricMgmt {
            Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.GatewayName_*" | ForEach-Object {
                Unregister-PSFConfig -FullName $_.FullName -Scope FileUserShared -ErrorAction SilentlyContinue
            }
        }
    }

    Context 'When resolving gateway ID successfully' {
        BeforeAll {
            Mock Get-FabricAdminGateway -ModuleName MicrosoftFabricMgmt {
                return [PSCustomObject]@{ id = $GatewayId; name = 'On-Prem Gateway' }
            }
        }

        It 'Should return the gateway name' {
            InModuleScope MicrosoftFabricMgmt {
                $result = Resolve-FabricGatewayName -GatewayId 'gw-guid'
                $result | Should -Be 'On-Prem Gateway'
            }
        }

        It 'Should accept GatewayId from pipeline' {
            InModuleScope MicrosoftFabricMgmt {
                $result = 'gw-guid' | Resolve-FabricGatewayName
                $result | Should -Be 'On-Prem Gateway'
            }
        }
    }

    Context 'When using cache functionality' {
        BeforeAll {
            Mock Get-FabricAdminGateway -ModuleName MicrosoftFabricMgmt {
                return [PSCustomObject]@{ id = $GatewayId; name = 'Cached Gateway' }
            }
        }

        It 'Should cache the resolved name after first call' {
            InModuleScope MicrosoftFabricMgmt {
                $result1 = Resolve-FabricGatewayName -GatewayId 'cache-guid'
                $result2 = Resolve-FabricGatewayName -GatewayId 'cache-guid'
                $result1 | Should -Be 'Cached Gateway'
                $result2 | Should -Be 'Cached Gateway'

                $cached = Get-PSFConfigValue -FullName "MicrosoftFabricMgmt.Cache.GatewayName_cache-guid" -Fallback $null
                $cached | Should -Be 'Cached Gateway'
            }
        }

        It 'Should bypass cache when DisableCache is specified' {
            InModuleScope MicrosoftFabricMgmt {
                Resolve-FabricGatewayName -GatewayId 'nocache-guid'
                $result = Resolve-FabricGatewayName -GatewayId 'nocache-guid' -DisableCache
                $result | Should -Be 'Cached Gateway'
            }
        }
    }

    Context 'When gateway is not found' {
        BeforeAll {
            Mock Get-FabricAdminGateway -ModuleName MicrosoftFabricMgmt { return $null }
        }

        It 'Should return the gateway ID as fallback' {
            InModuleScope MicrosoftFabricMgmt {
                $result = Resolve-FabricGatewayName -GatewayId 'missing-guid'
                $result | Should -Be 'missing-guid'
            }
        }
    }

    Context 'When API call fails' {
        BeforeAll {
            Mock Get-FabricAdminGateway -ModuleName MicrosoftFabricMgmt { throw 'API connection failed' }
        }

        It 'Should return the gateway ID as fallback on error' {
            InModuleScope MicrosoftFabricMgmt {
                $result = Resolve-FabricGatewayName -GatewayId 'error-guid'
                $result | Should -Be 'error-guid'
            }
        }
    }

    Context 'Parameter validation' {
        It 'Should require GatewayId parameter' {
            InModuleScope MicrosoftFabricMgmt {
                { Resolve-FabricGatewayName } | Should -Throw
            }
        }

        It 'Should not accept null or empty GatewayId' {
            InModuleScope MicrosoftFabricMgmt {
                { Resolve-FabricGatewayName -GatewayId $null } | Should -Throw
                { Resolve-FabricGatewayName -GatewayId '' } | Should -Throw
            }
        }
    }
}
