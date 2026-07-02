BeforeAll {
    # Import the built module
    $BuiltModule = "$PSScriptRoot/../../../output/module/MicrosoftFabricMgmt"
    $ModuleVersion = (Get-ChildItem $BuiltModule -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
    $ModuleManifest = Join-Path $BuiltModule "$ModuleVersion\MicrosoftFabricMgmt.psd1"
    Import-Module $ModuleManifest -Force -ErrorAction Stop
}

Describe 'Resolve-FabricDatasetName' {

    BeforeEach {
        # Clear cache (both the dataset name cache and the cross-populated workspace-id cache)
        InModuleScope MicrosoftFabricMgmt {
            Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.DatasetName_*" | ForEach-Object {
                Unregister-PSFConfig -FullName $_.FullName -Scope FileUserShared -ErrorAction SilentlyContinue
            }
            Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.DatasetWorkspaceId_*" | ForEach-Object {
                Unregister-PSFConfig -FullName $_.FullName -Scope FileUserShared -ErrorAction SilentlyContinue
            }
        }
    }

    Context 'When resolving dataset ID successfully' {
        BeforeAll {
            Mock Get-FabricAdminDataset -ModuleName MicrosoftFabricMgmt {
                return [PSCustomObject]@{ id = $DatasetId; name = 'Sales Model'; workspaceId = 'ws-abc' }
            }
        }

        It 'Should return the dataset name' {
            InModuleScope MicrosoftFabricMgmt {
                $result = Resolve-FabricDatasetName -DatasetId 'ds-guid'
                $result | Should -Be 'Sales Model'
            }
        }

        It 'Should accept DatasetId from pipeline' {
            InModuleScope MicrosoftFabricMgmt {
                $result = 'ds-guid' | Resolve-FabricDatasetName
                $result | Should -Be 'Sales Model'
            }
        }
    }

    Context 'When using cache functionality' {
        BeforeAll {
            Mock Get-FabricAdminDataset -ModuleName MicrosoftFabricMgmt {
                return [PSCustomObject]@{ id = $DatasetId; name = 'Cached Model'; workspaceId = 'ws-cached' }
            }
        }

        It 'Should cache the resolved name after first call' {
            InModuleScope MicrosoftFabricMgmt {
                $result1 = Resolve-FabricDatasetName -DatasetId 'cache-guid'
                $result2 = Resolve-FabricDatasetName -DatasetId 'cache-guid'
                $result1 | Should -Be 'Cached Model'
                $result2 | Should -Be 'Cached Model'

                $cached = Get-PSFConfigValue -FullName "MicrosoftFabricMgmt.Cache.DatasetName_cache-guid" -Fallback $null
                $cached | Should -Be 'Cached Model'
            }
        }

        It 'Should cross-populate the dataset workspace-id cache' {
            InModuleScope MicrosoftFabricMgmt {
                Resolve-FabricDatasetName -DatasetId 'xpop-guid'
                $cachedWs = Get-PSFConfigValue -FullName "MicrosoftFabricMgmt.Cache.DatasetWorkspaceId_xpop-guid" -Fallback $null
                $cachedWs | Should -Be 'ws-cached'
            }
        }

        It 'Should bypass cache when DisableCache is specified' {
            InModuleScope MicrosoftFabricMgmt {
                Resolve-FabricDatasetName -DatasetId 'nocache-guid'
                $result = Resolve-FabricDatasetName -DatasetId 'nocache-guid' -DisableCache
                $result | Should -Be 'Cached Model'
            }
        }
    }

    Context 'When dataset is not found' {
        BeforeAll {
            Mock Get-FabricAdminDataset -ModuleName MicrosoftFabricMgmt { return $null }
        }

        It 'Should return the dataset ID as fallback' {
            InModuleScope MicrosoftFabricMgmt {
                $result = Resolve-FabricDatasetName -DatasetId 'missing-guid'
                $result | Should -Be 'missing-guid'
            }
        }
    }

    Context 'When API call fails' {
        BeforeAll {
            Mock Get-FabricAdminDataset -ModuleName MicrosoftFabricMgmt { throw 'API connection failed' }
        }

        It 'Should return the dataset ID as fallback on error' {
            InModuleScope MicrosoftFabricMgmt {
                $result = Resolve-FabricDatasetName -DatasetId 'error-guid'
                $result | Should -Be 'error-guid'
            }
        }
    }

    Context 'Parameter validation' {
        It 'Should require DatasetId parameter' {
            InModuleScope MicrosoftFabricMgmt {
                { Resolve-FabricDatasetName } | Should -Throw
            }
        }

        It 'Should not accept null or empty DatasetId' {
            InModuleScope MicrosoftFabricMgmt {
                { Resolve-FabricDatasetName -DatasetId $null } | Should -Throw
                { Resolve-FabricDatasetName -DatasetId '' } | Should -Throw
            }
        }
    }
}
